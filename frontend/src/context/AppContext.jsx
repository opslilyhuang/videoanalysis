import { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('vedioanalysis_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('vedioanalysis_lang') || 'zh';
    } catch {
      return 'zh';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    try {
      localStorage.setItem('vedioanalysis_theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('vedioanalysis_lang', lang);
    } catch {}
  }, [lang]);

  return (
    <AppContext.Provider value={{ theme, setTheme, lang, setLang }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext) || { theme: 'dark', setTheme: () => {}, lang: 'zh', setLang: () => {} };
}
