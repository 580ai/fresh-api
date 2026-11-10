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

import axios from 'axios';

export const AUTH_CHANGED_EVENT = 'classic-auth-changed';
const AUTH_MODE_KEY = 'classic_auth_mode';
const authClient = axios.create({
  baseURL: import.meta.env.VITE_REACT_APP_SERVER_URL || '',
  withCredentials: true,
  headers: { 'Cache-Control': 'no-cache, no-store' },
});

let accessToken = null;
let accessExpiresAt = 0;
let sessionId = null;
let refreshPromise = null;
let authGeneration = 0;

export function isTokenAuthentication() {
  return localStorage.getItem(AUTH_MODE_KEY) === 'token';
}

export function getStoredUser() {
  try {
    const saved = JSON.parse(localStorage.getItem('user'));
    const user = saved?.user || saved;
    if (!Number.isInteger(user?.id) || user.id <= 0 || !user.username) {
      localStorage.removeItem('user');
      return null;
    }
    // Migrate responses cached by older classic builds without persisting tokens.
    if (saved?.access_token) {
      localStorage.setItem(AUTH_MODE_KEY, 'token');
      localStorage.setItem('user', JSON.stringify(user));
    }
    return user;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function setAuthentication(data) {
  const user = data?.user || data;
  if (!Number.isInteger(user?.id) || user.id <= 0 || !user.username) {
    throw new Error('Invalid login response');
  }
  // Personal settings also use setUserData with a plain user snapshot. Updating
  // that snapshot must not discard the current in-memory token or session.
  if (
    data.access_token ||
    getStoredUser()?.id !== user.id ||
    !isTokenAuthentication()
  ) {
    authGeneration += 1;
    accessToken = data.access_token || null;
    accessExpiresAt = data.access_expires_at || 0;
    sessionId = data.session?.sid || null;
    localStorage.setItem(AUTH_MODE_KEY, accessToken ? 'token' : 'legacy');
  }
  localStorage.setItem('user', JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  return user;
}

export function clearAuthentication() {
  authGeneration += 1;
  accessToken = null;
  accessExpiresAt = 0;
  sessionId = null;
  localStorage.removeItem('user');
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getAuthHeaders() {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function requestRefresh() {
  const generation = authGeneration;
  let expectedSession = sessionId;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await authClient.post('/api/user/auth/refresh', null, {
        headers: expectedSession ? { 'X-Auth-Session': expectedSession } : {},
      });
      if (generation !== authGeneration) return getStoredUser();
      const data = response.data?.data;
      if (!response.data?.success || !data?.access_token || !data?.user) {
        throw new Error('Invalid authentication refresh response');
      }
      return setAuthentication(data);
    } catch (error) {
      if (generation !== authGeneration) return getStoredUser();
      const status = error.response?.status;
      if (status === 404 || status === 405) {
        // Older fresh-api backends authenticate with the original session cookie.
        if (isTokenAuthentication()) throw error;
        return getStoredUser();
      }
      if (
        status === 409 &&
        error.response?.data?.code === 'AUTH_SESSION_MISMATCH' &&
        attempt === 0
      ) {
        expectedSession = null;
        continue;
      }
      if (status === 401) {
        localStorage.setItem(AUTH_MODE_KEY, 'token');
        clearAuthentication();
        return null;
      }
      // Network/server failures must not discard a recoverable login.
      throw error;
    }
  }
}

export function refreshAuthentication() {
  if (!refreshPromise) {
    const refresh = () => requestRefresh();
    refreshPromise = (
      navigator.locks
        ? navigator.locks.request('new-api:auth-refresh', refresh)
        : refresh()
    ).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function bootstrapAuthentication() {
  // Normalize caches written by the previous frontend before detecting the mode.
  getStoredUser();
  return refreshAuthentication();
}

export async function getFreshAuthHeaders() {
  if (
    isTokenAuthentication() &&
    (!accessToken || accessExpiresAt <= Date.now() / 1000 + 30)
  ) {
    await refreshAuthentication();
  }
  return getAuthHeaders();
}

export async function logoutAuthentication(allowSessionRetry = true) {
  if (isTokenAuthentication()) {
    try {
      await authClient.post('/api/user/auth/logout', null, {
        headers: {
          ...getAuthHeaders(),
          ...(sessionId ? { 'X-Auth-Session': sessionId } : {}),
        },
      });
    } catch (error) {
      if (
        !allowSessionRetry ||
        error.response?.status !== 409 ||
        error.response?.data?.code !== 'AUTH_SESSION_MISMATCH'
      ) {
        throw error;
      }
      await refreshAuthentication();
      return logoutAuthentication(false);
    }
  } else {
    await authClient.get('/api/user/logout', {
      headers: { 'New-Api-User': getStoredUser()?.id },
    });
  }
  clearAuthentication();
}
