import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useLocalStorage — drop-in replacement for useState that mirrors the value
 * into localStorage so the app survives a refresh, a phone lock, or the
 * browser evicting the tab mid-game.
 *
 * Notes on the implementation:
 *  - The initial read is lazy (inside useState) so we hit localStorage once,
 *    not on every render.
 *  - Writes are wrapped in try/catch: Safari private mode throws on setItem
 *    once the quota is hit, and a coach losing the app mid-game because of a
 *    storage error would be much worse than losing persistence.
 *  - `migrate` lets callers heal older/partial shapes (e.g. a roster saved
 *    before `wantsGoalieToday` existed).
 */
export function useLocalStorage(key, initialValue, migrate) {
  const migrateRef = useRef(migrate);
  migrateRef.current = migrate;

  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) {
        return typeof initialValue === 'function' ? initialValue() : initialValue;
      }
      const parsed = JSON.parse(raw);
      return migrateRef.current ? migrateRef.current(parsed) : parsed;
    } catch {
      return typeof initialValue === 'function' ? initialValue() : initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked — keep playing, just without persistence */
    }
  }, [key, value]);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setValue(typeof initialValue === 'function' ? initialValue() : initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, reset];
}
