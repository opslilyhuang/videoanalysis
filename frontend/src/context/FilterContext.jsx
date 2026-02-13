import { createContext, useContext, useState, useCallback } from 'react';

const defaultFilters = {
  search: '',
  searchInKeywords: false,
  rankFilter: '',
  rankFilterMulti: '',
  transcriptFilter: '',
  categoryFilter: '',
  dateFrom: '',
  dateTo: '',
  viewsMin: 0,
  viewsMax: 0,
};

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  const [filters, setFiltersState] = useState(defaultFilters);

  const setFilters = useCallback((updater) => {
    setFiltersState((prev) => (typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }));
  }, []);

  return (
    <FilterContext.Provider value={{ filters, setFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) return { filters: defaultFilters, setFilters: () => {} };
  return ctx;
}
