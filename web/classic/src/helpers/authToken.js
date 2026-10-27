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

// 新版后端已经用 access token + refresh cookie 取代了 cookie session。
// classic 前端只认 localStorage.user，因此这里把登录返回的 bundle 拆成
// 「用户资料 + 凭证」两部分：user 结构保持不变（兼容既有页面），
// 凭证单独存放，供 api.js 注入 Authorization 与刷新使用。

const ACCESS_TOKEN_KEY = 'access_token';
const ACCESS_EXPIRES_AT_KEY = 'access_expires_at';
const SESSION_SID_KEY = 'auth_session_sid';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

export function getAccessExpiresAt() {
  const raw = Number(localStorage.getItem(ACCESS_EXPIRES_AT_KEY));
  return Number.isFinite(raw) ? raw : 0;
}

export function getSessionSid() {
  return localStorage.getItem(SESSION_SID_KEY) || '';
}

// access token 即将过期（默认提前 60 秒）时视为需要刷新
export function isAccessTokenExpired(leewaySeconds = 60) {
  const expiresAt = getAccessExpiresAt();
  if (!expiresAt) return true;
  return expiresAt - leewaySeconds <= Math.floor(Date.now() / 1000);
}

export function saveAuthCredentials(data) {
  if (!data || typeof data !== 'object') return;
  if (data.access_token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  }
  if (typeof data.access_expires_at === 'number') {
    localStorage.setItem(ACCESS_EXPIRES_AT_KEY, String(data.access_expires_at));
  }
  if (data.session?.sid) {
    localStorage.setItem(SESSION_SID_KEY, data.session.sid);
  }
}

export function clearAuthCredentials() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
  localStorage.removeItem(SESSION_SID_KEY);
}

// 登录/验证接口返回的是 bundle：{access_token, user, session, ...}。
// 老版本返回的就是 user 本体。两种形式都要能还原出页面需要的用户资料。
export function extractUserFromLoginPayload(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.user && typeof data.user === 'object' && data.user.id) {
    return data.user;
  }
  return data.id ? data : null;
}

// 后端新的登录挑战：主认证（密码/Passkey）通过后仍需第二因子。
export function isLoginChallenge(data) {
  return Boolean(
    data &&
    typeof data === 'object' &&
    data.require_verification === true &&
    typeof data.flow_token === 'string' &&
    data.flow_token.length > 0,
  );
}

let refreshPromise = null;

// 用 HttpOnly refresh cookie 换新的 access token。
// 并发请求共享同一个刷新 Promise，避免同一会话多次轮换触发竞态。
export function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const sid = getSessionSid();
    // 直接使用原生 fetch：这里要绕开 axios 拦截器，否则刷新失败会再次触发刷新。
    const response = await fetch('/api/user/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: sid ? { 'X-Auth-Session': sid } : {},
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (e) {
      payload = null;
    }

    if (!response.ok || !payload?.success || !payload?.data) {
      return { ok: false, status: response.status, data: payload };
    }

    saveAuthCredentials(payload.data);
    return { ok: true, status: response.status, data: payload.data };
  })();

  refreshPromise = refreshPromise.finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}
