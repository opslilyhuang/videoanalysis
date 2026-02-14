import { getAuthToken } from '../context/AuthContext';

const AUTH_KEY = 'vedioanalysis_auth';

/** API 基础 URL，解决代理不可用时的 404。在 .env 中设置 VITE_API_BASE=http://localhost:8000 */
export function getApiBase() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || '';
}

export async function apiFetch(url, options = {}) {
  const base = getApiBase();
  const fullUrl = base ? (base.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url)) : url;
  const token = getAuthToken();
  const headers = {
    ...options.headers,
  };
  if (token) {
    headers['X-Auth-Token'] = token;
  }
  const res = await fetch(fullUrl, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  return res;
}
