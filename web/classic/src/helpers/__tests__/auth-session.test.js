/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.window = new EventTarget();

let requests = [];
let reply;
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch(request) {
    requests.push({
      method: request.method,
      url: request.url,
      headers: new Headers(request.headers),
    });
    return reply(request);
  },
});
const previousServerURL = process.env.VITE_REACT_APP_SERVER_URL;
process.env.VITE_REACT_APP_SERVER_URL = server.url.origin;
let auth;
beforeAll(async () => {
  auth = await import('../auth-session.js');
});
const user = { id: 42, username: 'classic-user', role: 100 };
const bundle = {
  access_token: 'test-access-token',
  access_expires_at: Math.floor(Date.now() / 1000) + 900,
  user,
  session: { sid: 'test-session' },
};

beforeEach(() => {
  auth.clearAuthentication();
  storage.clear();
  requests = [];
  reply = () => Response.json({ success: true, data: bundle });
});

afterAll(() => {
  server.stop(true);
  if (previousServerURL === undefined)
    delete process.env.VITE_REACT_APP_SERVER_URL;
  else process.env.VITE_REACT_APP_SERVER_URL = previousServerURL;
});

test('modern login exposes the nested user and keeps credentials out of storage', () => {
  expect(auth.setAuthentication(bundle)).toEqual(user);
  expect(JSON.parse(storage.get('user'))).toEqual(user);
  expect([...storage.values()].join(' ')).not.toContain(bundle.access_token);
  expect(auth.getAuthHeaders()).toEqual({
    Authorization: `Bearer ${bundle.access_token}`,
  });
});

test('cold startup restores a modern session through the refresh cookie endpoint', async () => {
  storage.set('classic_auth_mode', 'token');
  storage.set('user', JSON.stringify(user));
  expect(await auth.bootstrapAuthentication()).toEqual(user);
  expect(requests.map((r) => [r.method, new URL(r.url).pathname])).toEqual([
    ['POST', '/api/user/auth/refresh'],
  ]);
  expect(requests[0].headers.get('authorization')).toBeNull();
  expect(auth.getAuthHeaders().Authorization).toBe(
    `Bearer ${bundle.access_token}`,
  );
});

test('updating the personal settings user snapshot preserves modern authentication', async () => {
  auth.setAuthentication(bundle);
  const updatedUser = { ...user, display_name: 'Updated profile' };
  expect(auth.setAuthentication(updatedUser)).toEqual(updatedUser);
  expect(auth.isTokenAuthentication()).toBe(true);
  expect(auth.getAuthHeaders().Authorization).toBe(
    `Bearer ${bundle.access_token}`,
  );
  await auth.refreshAuthentication();
  expect(requests[0].headers.get('x-auth-session')).toBe('test-session');
});

test('a previously cached full bundle is migrated before restoring authentication', async () => {
  storage.set('user', JSON.stringify(bundle));
  expect(await auth.bootstrapAuthentication()).toEqual(user);
  expect(JSON.parse(storage.get('user'))).toEqual(user);
  expect([...storage.values()].join(' ')).not.toContain(bundle.access_token);
});

test('legacy backend login and refresh remain compatible', async () => {
  auth.setAuthentication(user);
  reply = () => new Response('not found', { status: 404 });
  expect(await auth.bootstrapAuthentication()).toEqual(user);
  expect(auth.getAuthHeaders()).toEqual({});
  reply = () => Response.json({ success: true });
  await auth.logoutAuthentication();
  expect(new URL(requests.at(-1).url).pathname).toBe('/api/user/logout');
  expect(requests.at(-1).headers.get('new-api-user')).toBe('42');
  expect(auth.getStoredUser()).toBeNull();
});

test('parallel requests share a single refresh operation', async () => {
  const results = await Promise.all([
    auth.refreshAuthentication(),
    auth.refreshAuthentication(),
    auth.refreshAuthentication(),
  ]);
  expect(results).toEqual([user, user, user]);
  expect(requests).toHaveLength(1);
});

test('confirmed invalid refresh clears identity; temporary failure preserves it', async () => {
  auth.setAuthentication(bundle);
  reply = () => Response.json({ success: false }, { status: 503 });
  await expect(auth.refreshAuthentication()).rejects.toBeDefined();
  expect(auth.getStoredUser()).toEqual(user);
  reply = () => Response.json({ success: false }, { status: 401 });
  expect(await auth.refreshAuthentication()).toBeNull();
  expect(auth.getStoredUser()).toBeNull();
  expect(auth.getAuthHeaders()).toEqual({});
});

test('refresh recovers when a different tab changed the refresh cookie session', async () => {
  auth.setAuthentication(bundle);
  reply = () =>
    requests.length === 1
      ? Response.json({ code: 'AUTH_SESSION_MISMATCH' }, { status: 409 })
      : Response.json({
          success: true,
          data: { ...bundle, session: { sid: 'other-session' } },
        });
  expect(await auth.refreshAuthentication()).toEqual(user);
  expect(requests.map((r) => r.headers.get('x-auth-session'))).toEqual([
    'test-session',
    null,
  ]);
});

test('logout revokes the modern session and clears client credentials', async () => {
  auth.setAuthentication(bundle);
  reply = () => Response.json({ success: true });
  await auth.logoutAuthentication();
  expect(requests[0].method).toBe('POST');
  expect(new URL(requests[0].url).pathname).toBe('/api/user/auth/logout');
  expect(requests[0].headers.get('x-auth-session')).toBe('test-session');
  expect(requests[0].headers.get('authorization')).toBe(
    `Bearer ${bundle.access_token}`,
  );
  expect(auth.getAuthHeaders()).toEqual({});
  expect(auth.getStoredUser()).toBeNull();
});

test('a late refresh response cannot restore a session after logout', async () => {
  auth.setAuthentication(bundle);
  let release;
  let started;
  const arrived = new Promise((resolve) => {
    started = resolve;
  });
  reply = () =>
    new Promise((resolve) => {
      release = resolve;
      started();
    });
  const refresh = auth.refreshAuthentication();
  await arrived;
  auth.clearAuthentication();
  release(Response.json({ success: true, data: bundle }));
  expect(await refresh).toBeNull();
  expect(auth.getStoredUser()).toBeNull();
  expect(auth.getAuthHeaders()).toEqual({});
});

test('malformed user caches do not crash authentication startup', () => {
  storage.set('user', 'undefined');
  expect(auth.getStoredUser()).toBeNull();
  storage.set('user', JSON.stringify({ access_token: 'token-without-user' }));
  expect(auth.getStoredUser()).toBeNull();
});
