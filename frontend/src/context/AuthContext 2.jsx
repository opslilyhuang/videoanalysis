import { createContext, useContext, useState, useEffect } from 'react';

const AUTH_KEY = 'vedioanalysis_auth';
const VALID_CREDS = { username: 'admin', password: 'admin@2026' };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(null);

  const checkAuth = () => {
    const t = localStorage.getItem(AUTH_KEY);
    if (t) {
      try {
        const [u, p] = atob(t).split(':');
        if (u === VALID_CREDS.username && p === VALID_CREDS.password) {
          setIsAuthenticated(true);
          setToken(t);
          return;
        }
      } catch {}
    }
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
    setToken(null);
  };

  useEffect(() => {
    checkAuth();
    const h = () => { checkAuth(); };
    window.addEventListener('auth:unauthorized', h);
    return () => window.removeEventListener('auth:unauthorized', h);
  }, []);

  const login = (username, password) => {
    if (username === VALID_CREDS.username && password === VALID_CREDS.password) {
      const t = btoa(`${username}:${password}`);
      localStorage.setItem(AUTH_KEY, t);
      setIsAuthenticated(true);
      setToken(t);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext) || { isAuthenticated: false, token: null, login: () => false, logout: () => {} };
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_KEY);
}
