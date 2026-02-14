import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_FAV = 'vedioanalysis_favorites';
const STORAGE_RECYCLE = 'vedioanalysis_recycle';
const STORAGE_DELETED = 'vedioanalysis_permanently_deleted';

function getKey(dashboardId, videoId) {
  return `${dashboardId}:${videoId}`;
}

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {}
}

const FavoritesRecycleContext = createContext(null);

export function FavoritesRecycleProvider({ children }) {
  const [favorites, setFavorites] = useState(() => loadSet(STORAGE_FAV));
  const [recycle, setRecycle] = useState(() => loadSet(STORAGE_RECYCLE));
  const [permanentlyDeleted, setPermanentlyDeleted] = useState(() => loadSet(STORAGE_DELETED));

  useEffect(() => { saveSet(STORAGE_FAV, favorites); }, [favorites]);
  useEffect(() => { saveSet(STORAGE_RECYCLE, recycle); }, [recycle]);
  useEffect(() => { saveSet(STORAGE_DELETED, permanentlyDeleted); }, [permanentlyDeleted]);

  const toggleFavorite = useCallback((dashboardId, videoId) => {
    const k = getKey(dashboardId, videoId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setRecycle((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  }, []);

  const moveToRecycle = useCallback((dashboardId, videoId) => {
    const k = getKey(dashboardId, videoId);
    setRecycle((prev) => new Set(prev).add(k));
    setFavorites((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  }, []);

  const restoreFromRecycle = useCallback((dashboardId, videoId) => {
    const k = getKey(dashboardId, videoId);
    setRecycle((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  }, []);

  const removeFromRecycle = useCallback((dashboardId, videoId) => {
    const k = getKey(dashboardId, videoId);
    setRecycle((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
    setPermanentlyDeleted((prev) => new Set(prev).add(k));
  }, []);

  const isPermanentlyDeleted = useCallback(
    (dashboardId, videoId) => permanentlyDeleted.has(getKey(dashboardId, videoId)),
    [permanentlyDeleted]
  );

  const isFavorite = useCallback(
    (dashboardId, videoId) => favorites.has(getKey(dashboardId, videoId)),
    [favorites]
  );

  const isRecycled = useCallback(
    (dashboardId, videoId) => recycle.has(getKey(dashboardId, videoId)),
    [recycle]
  );

  const favoritesCount = favorites.size;
  const recycleCount = recycle.size;

  return (
    <FavoritesRecycleContext.Provider
      value={{
        toggleFavorite,
        moveToRecycle,
        restoreFromRecycle,
        removeFromRecycle,
        isFavorite,
        isRecycled,
        isPermanentlyDeleted,
        favoritesCount,
        recycleCount,
      }}
    >
      {children}
    </FavoritesRecycleContext.Provider>
  );
}

export function useFavoritesRecycle() {
  const ctx = useContext(FavoritesRecycleContext);
  return ctx || {};
}
