import { useMemo, useState } from 'react';
import { STRENGTH_LEVELS, DEFAULT_STRENGTH } from '../lib/constants.js';
import { Banner, Button, Card } from './ui.jsx';

/**
 * The coach's own screen. Buckets each player High / Medium / Low at each end
 * of the pitch, and the only thing those buckets do is stop two weaker players
 * ending up on the same line at the same time.
 *
 * Deliberately tucked behind its own button rather than sitting on the roster
 * list: these are judgements about children, and the phone gets handed to
 * assistants and left on benches. Nothing here is ever rendered on the Live or
 * Matrix screens, which are the ones people look over your shoulder at.
 */

const ENDS = [
  { key: 'offense', label: 'Attacking', blurb: 'Used for the front line.' },
  { key: 'defense', label: 'Defending', blurb: 'Used for the back line.' },
];

const LEVEL_STYLES = {
  High: 'border-lime-400/70 bg-lime-400/20 text-lime-200',
  Medium: 'border-slate-600 bg-slate-700/60 text-slate-200',
  // Amber, not red. This is "give them help", not "bad player".
  Low: 'border-amber-400/60 bg-amber-400/15 text-amber-200',
};
const LEVEL_IDLE = 'border-slate-800 bg-slate-900/60 text-slate-600';

export default function CoachRatingsSheet({ open, roster, onRate, onResetAll, onClose }) {
  const [end, setEnd] = useState('offense');

  const counts = useMemo(() => {
    const c = { High: 0, Medium: 0, Low: 0 };
    roster.forEach((p) => {
      c[p[end] || DEFAULT_STRENGTH] = (c[p[end] || DEFAULT_STRENGTH] || 0) + 1;
    });
    return c;
  }, [roster, end]);

  if (!open) return null;

  const active = ENDS.find((e) => e.key === end);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm">
      <button className="flex-1" onClick={onClose} aria-label="Close" />

      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-900 pb-8">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-4 pb-3 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl font-black uppercase tracking-tight text-white">
                Coach&apos;s Ratings
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Line balance only · never shown on Live or Matrix
              </p>
            </div>
            <Button variant="outline" className="min-h-[48px] shrink-0 px-4 text-xs" onClick={onClose}>
              Done
            </Button>
          </div>

          {/* Which end of the pitch are we rating */}
          <div className="mt-3 flex gap-2">
            {ENDS.map((e) => (
              <button
                key={e.key}
                onClick={() => setEnd(e.key)}
                className={`min-h-[48px] flex-1 rounded-xl border-2 text-sm font-black uppercase tracking-widest transition-colors ${
                  end === e.key
                    ? 'border-lime-400 bg-lime-400 text-slate-950'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 px-4 pt-4">
          <Banner tone="slate">
            {active.blurb} The lineup builder uses this for one thing only: keeping two weaker
            players off the same line at the same time. It never changes anyone&apos;s playing
            time — everyone still gets an equal share of shifts.
          </Banner>

          <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-widest">
            <span className="text-lime-400">{counts.High} High</span>
            <span className="text-slate-400">{counts.Medium} Medium</span>
            <span className="text-amber-300">{counts.Low} Low</span>
          </div>

          <div className="space-y-2">
            {roster.map((player) => {
              const current = player[end] || DEFAULT_STRENGTH;
              return (
                <Card key={player.id} className="p-2.5">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="truncate text-base font-black uppercase tracking-tight text-white">
                      {player.name}
                    </span>
                    {!player.isPresent && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        out today
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {STRENGTH_LEVELS.map((level) => {
                      const on = current === level;
                      return (
                        <button
                          key={level}
                          onClick={() => onRate(player.id, end, level)}
                          className={`min-h-[48px] flex-1 rounded-lg border-2 text-xs font-black uppercase tracking-wider transition-colors ${
                            on ? LEVEL_STYLES[level] : LEVEL_IDLE
                          }`}
                        >
                          {level === 'Medium' ? 'Med' : level}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          <Button variant="outline" className="w-full text-sm" onClick={onResetAll}>
            Reset everyone to Medium
          </Button>

          <p className="px-1 pb-2 text-xs leading-relaxed text-slate-500">
            Ratings carry over all season. Leaving everyone on Medium turns the whole feature off —
            the builder then balances on position preferences alone.
          </p>
        </div>
      </div>
    </div>
  );
}
