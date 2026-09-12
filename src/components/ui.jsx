// Shared presentational primitives. Everything is sized for a thumb on a
// phone in bright sun: min 48-56px touch targets, heavy weights, hard contrast.

const VARIANTS = {
  primary:
    'bg-lime-400 text-slate-950 hover:bg-lime-300 active:bg-lime-500 shadow-lg shadow-lime-400/20',
  danger:
    'bg-red-500 text-white hover:bg-red-400 active:bg-red-600 shadow-lg shadow-red-500/20',
  warn:
    'bg-amber-400 text-slate-950 hover:bg-amber-300 active:bg-amber-500 shadow-lg shadow-amber-400/20',
  ghost:
    'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-600 border border-slate-700',
  outline:
    'bg-transparent text-slate-300 border border-slate-700 hover:bg-slate-800 active:bg-slate-700',
  // Quiet until you look at it — for a rare, mildly destructive action sitting
  // in a long list, where a wall of solid red would just be noise.
  dangerQuiet:
    'bg-transparent text-red-300 border border-red-500/40 hover:bg-red-500/10 active:bg-red-500/20',
};

export function Button({ variant = 'ghost', className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-5 text-base font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', ...props }) {
  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/70 ${className}`}
      {...props}
    />
  );
}

export function SectionLabel({ children, right }) {
  return (
    <div className="mb-2 flex items-end justify-between">
      <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{children}</h2>
      {right ? <div className="text-xs font-semibold text-slate-500">{right}</div> : null}
    </div>
  );
}

export function Stat({ label, value, accent = 'text-white' }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-slate-800/60 px-2 py-3">
      <span className={`clock-digits text-2xl font-black ${accent}`}>{value}</span>
      <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
    </div>
  );
}

/** Small colored tag for a position group. */
export const GROUP_STYLES = {
  Goalie: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
  Defense: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  Midfield: 'bg-lime-500/15 text-lime-300 border-lime-500/40',
  Forward: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
};

export function Tag({ group, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        GROUP_STYLES[group] || 'border-slate-700 bg-slate-800 text-slate-300'
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function Banner({ tone = 'amber', children }) {
  const tones = {
    amber: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
    red: 'border-red-500/50 bg-red-500/10 text-red-200',
    lime: 'border-lime-500/50 bg-lime-500/10 text-lime-200',
    slate: 'border-slate-700 bg-slate-800/60 text-slate-300',
  };
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-lg font-black uppercase tracking-wide text-slate-300">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{children}</p>
    </Card>
  );
}
