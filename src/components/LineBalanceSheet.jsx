import { useMemo, useState } from 'react';
import { BALANCE_LEVELS, DEFAULT_BALANCE } from '../lib/constants.js';
import { Banner, Button, Card } from './ui.jsx';

/**
 * Line balance. Buckets each player Anchor / Steady / Support at each end of
 * the pitch so that no line ends up with two Support players on it at once.
 *
 * The wording is doing real work here. This screen lives on a phone that gets
 * handed to assistants and left face-up on a bench, and the labels describe a
 * role in a pairing rather than a verdict on a child: a Support player is one
 * who plays better with an Anchor beside them, which is exactly what the
 * algorithm uses it for and is true of every kid on some day. Read over a
 * shoulder, none of it means anything about anybody.
 */

const ENDS = [
  { key: 'offense', label: 'Attacking', blurb: 'Shapes the front line.' },
  { key: 'defense', label: 'Defending', blurb: 'Shapes the back line.' },
];

const LEVEL_STYLES = {
  Anchor: 'border-lime-400/70 bg-lime-400/20 text-lime-200',
  Steady: 'border-slate-600 bg-slate-700/60 text-slate-200',
  // Sky, not red or amber — nothing on this screen should read as a warning.
  Support: 'border-sky-400/60 bg-sky-400/15 text-sky-200',
};
const LEVEL_IDLE = 'border-slate-800 bg-slate-900/60 text-slate-600';

export default function LineBalanceSheet({ open, roster, onRate, onResetAll, onClose }) {
  const [end, setEnd] = useState('offense');

  const counts = useMemo(() => {
    const c = { Anchor: 0, Steady: 0, Support: 0 };
    roster.forEach((p) => {
      c[p[end] || DEFAULT_BALANCE] = (c[p[end] || DEFAULT_BALANCE] || 0) + 1;
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
                Line Balance
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Who lines up alongside whom
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
            {active.blurb} An <strong>Anchor</strong> is someone a line can be built around.{' '}
            <strong>Support</strong> means they play better with an Anchor beside them — so the
            builder never puts two of them on the same line at once. Playing time is untouched:
            everyone still gets an equal share of shifts.
          </Banner>

          <div className="flex items-center justify-between px-1 text-[10px] font-black uppercase tracking-widest">
            <span className="text-lime-400">{counts.Anchor} Anchor</span>
            <span className="text-slate-400">{counts.Steady} Steady</span>
            <span className="text-sky-300">{counts.Support} Support</span>
          </div>

          <div className="space-y-2">
            {roster.map((player) => {
              const current = player[end] || DEFAULT_BALANCE;
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
                    {BALANCE_LEVELS.map((level) => {
                      const on = current === level;
                      return (
                        <button
                          key={level}
                          onClick={() => onRate(player.id, end, level)}
                          className={`min-h-[48px] flex-1 rounded-lg border-2 text-xs font-black uppercase tracking-wider transition-colors ${
                            on ? LEVEL_STYLES[level] : LEVEL_IDLE
                          }`}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          <Button variant="outline" className="w-full text-sm" onClick={onResetAll}>
            Set everyone back to Steady
          </Button>

          <p className="px-1 pb-2 text-xs leading-relaxed text-slate-500">
            This carries over all season. Leaving everyone on Steady switches the whole thing off —
            the builder then goes on position preferences alone.
          </p>
        </div>
      </div>
    </div>
  );
}
