import { useEffect, useState } from 'react';

/**
 * Brief confirmation that something took effect.
 *
 * Two things matter about how this is positioned. It is `fixed`, so it floats
 * over the page and cannot push a single row of the roster around — a list
 * that reflows under a thumb mid-tap is the exact bug that made goalie
 * selection feel broken. And it is `pointer-events-none`, so it can never
 * swallow a tap aimed at whatever is underneath it.
 */
export default function Toast({ toast }) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    setMounted(true);
    // Next frame, so the element exists at opacity 0 before it transitions in.
    const raf = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), 2200);
    // Leave the DOM once the fade finishes — a stale pill sitting at opacity 0
    // still gets read out by a screen reader.
    const drop = setTimeout(() => setMounted(false), 2500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
      clearTimeout(drop);
    };
  }, [toast]);

  if (!toast || !mounted) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}
    >
      <div
        className={`flex items-center gap-2.5 rounded-full border border-lime-400/50 bg-slate-900/95 py-2.5 pl-3 pr-4 shadow-xl shadow-black/40 backdrop-blur transition-all duration-200 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime-400 text-sm font-black text-slate-950">
          ✓
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black uppercase tracking-tight text-white">
            {toast.title}
          </p>
          {toast.detail && (
            <p className="truncate text-[11px] font-semibold text-slate-400">{toast.detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}
