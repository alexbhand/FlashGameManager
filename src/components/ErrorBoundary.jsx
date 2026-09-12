import { Component } from 'react';
import { clearAllFlashData } from '../lib/persistence.js';

/**
 * Last line of defence. Without this, any exception thrown during render is a
 * blank white screen — and the coach it happens to is standing on a touchline
 * with 16 kids, no console, and no idea that clearing site data would fix it.
 * Catch it, say so plainly, and offer the two buttons that actually help.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('FLASH crashed during render:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-400">
          Something broke
        </p>
        <h1 className="text-2xl font-black uppercase tracking-tight text-white">
          The app hit an error
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-slate-400">
          Reloading usually fixes it and keeps your game. If it keeps happening, the saved data is
          probably damaged — starting fresh will clear today&apos;s lineup and your season history.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="min-h-[56px] w-full max-w-sm rounded-xl bg-lime-400 px-5 text-base font-black uppercase tracking-wide text-slate-950"
        >
          Reload &amp; keep my data
        </button>

        <button
          onClick={() => {
            if (!window.confirm('Erase the lineup, clock and season history, then restart?')) return;
            clearAllFlashData();
            window.location.reload();
          }}
          className="min-h-[56px] w-full max-w-sm rounded-xl border border-red-500/50 px-5 text-sm font-black uppercase tracking-wide text-red-300"
        >
          Start fresh (erases everything)
        </button>

        <pre className="mt-2 max-w-sm overflow-x-auto rounded-lg bg-slate-900 p-3 text-left text-[10px] text-slate-500">
          {String(this.state.error?.message || this.state.error)}
        </pre>
      </div>
    );
  }
}
