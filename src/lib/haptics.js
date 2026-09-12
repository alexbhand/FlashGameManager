/**
 * A short buzz to confirm something happened.
 *
 * Support is uneven and that is fine — this is confirmation, never the only
 * signal. Android Chrome vibrates; **iOS Safari has no Vibration API at all**,
 * so on an iPhone nothing happens and the on-screen confirmation carries the
 * whole job. That is why the toast is the primary feedback and this is the
 * garnish, rather than the other way round.
 *
 * Wrapped because some browsers throw if the page has never been interacted
 * with, and a failed buzz must never take the lineup build down with it.
 */
export function buzz(pattern = 15) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* unsupported or blocked — the toast still shows */
  }
}
