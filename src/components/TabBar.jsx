const TABS = [
  { id: 'setup', label: 'Setup', icon: '📋' },
  { id: 'live', label: 'Live', icon: '⏱' },
  { id: 'matrix', label: 'Matrix', icon: '▦' },
  { id: 'season', label: 'Season', icon: '📊' },
];

/** Fixed bottom nav — thumb-reachable, with iOS safe-area padding. */
export default function TabBar({ tab, setTab, alert }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-3xl">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex min-h-[64px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-lime-400' : 'text-slate-500'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="text-[10px] font-black uppercase tracking-widest">{t.label}</span>
              {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-lime-400" />}
              {t.id === 'live' && alert && !active && (
                <span className="absolute right-1/2 top-2 h-2 w-2 translate-x-4 animate-pulse rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
