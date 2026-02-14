import { getAuthToken } from '../context/AuthContext';

const AUTH_KEY = 'vedioanalysis_auth';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

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
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(fullUrl, { ...options, headers });
      if (res.status === 401) {
        localStorage.removeItem(AUTH_KEY);
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
      const isRetryable = res.status >= 500 || res.status === 408;
      if (isRetryable && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      } else {
        throw lastError;
      }
    }
  }
  throw lastError;
}
