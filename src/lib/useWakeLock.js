import { useEffect, useRef, useState } from 'react';

/**
 * Hold the Screen Wake Lock while the clock is running.
 *
 * Without this the phone dims and locks itself after 30 seconds in a pocket or
 * face-down on a bench, and the coach has to unlock and re-open the app at
 * exactly the moment they need the sub list. The clock itself survives that
 * fine — it is timestamp-based — but the information is not on screen when it
 * is wanted.
 *
 * Two details that are easy to get wrong:
 *  - The browser releases the lock automatically whenever the page is hidden,
 *    so it has to be re-requested on `visibilitychange`, not just once.
 *  - `request()` rejects if the document is not visible or the OS refuses
 *    (low battery mode). That is not an error worth surfacing; it just means
 *    the screen may sleep.
 *
 * @returns 'active' | 'idle' | 'unsupported'
 */
export function useWakeLock(active) {
  const sentinelRef = useRef(null);
  const [state, setState] = useState(
    typeof navigator !== 'undefined' && 'wakeLock' in navigator ? 'idle' : 'unsupported'
  );

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || !active || document.visibilityState !== 'visible') return;
      try {
        sentinelRef.current = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinelRef.current.release().catch(() => {});
          sentinelRef.current = null;
          return;
        }
        setState('active');
        sentinelRef.current.addEventListener('release', () => setState('idle'));
      } catch {
        setState('idle'); // refused (battery saver, hidden tab) — not fatal
      }
    };

    const release = () => {
      const s = sentinelRef.current;
      sentinelRef.current = null;
      if (s) s.release().catch(() => {});
      setState('idle');
    };

    // The lock is dropped whenever the page is hidden, so take it again on
    // the way back rather than assuming the original is still held.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    if (active) acquire();
    else release();

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);

  return state;
}
