/** MM:SS for the half clock (always 2-digit minutes, scoreboard style). */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** M:SS for the shift countdown. Goes to "+M:SS" once it passes zero, because
 *  subs only happen at a stoppage — the clock never stops waiting for us. */
export function formatCountdown(ms) {
  const over = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${over ? '+' : ''}${m}:${String(s).padStart(2, '0')}`;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const prettyDate = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
