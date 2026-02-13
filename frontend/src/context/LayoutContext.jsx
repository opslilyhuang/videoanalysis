import { createContext, useContext } from 'react';

const LayoutContext = createContext({ leftPct: 55 });

export function LayoutProvider({ leftPct, children }) {
  return (
    <LayoutContext.Provider value={{ leftPct }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext) || { leftPct: 55 };
}
