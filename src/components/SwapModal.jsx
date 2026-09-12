import { useMemo } from 'react';
import { POSITION_BY_ID, POSITION_IDS } from '../lib/constants.js';
import { Button, Tag } from './ui.jsx';

/**
 * Manual override sheet. Opens from any cell in the master matrix.
 * Picking a player who is already on the field in that shift performs a true
 * SWAP (the two trade positions); picking a bench player subs them in.
 */
export default function SwapModal({ open, shiftIndex, positionId, lineup, roster, onSwap, onClose }) {
  const present = useMemo(() => roster.filter((p) => p.isPresent), [roster]);

  const { currentId, positionOf } = useMemo(() => {
    const shift = lineup?.[shiftIndex] || {};
    const map = {};
    POSITION_IDS.forEach((id) => {
      if (shift[id]) map[shift[id]] = id;
    });
    return { currentId: shift[positionId] || null, positionOf: map };
  }, [lineup, shiftIndex, positionId]);

  if (!open) return null;

  const pos = POSITION_BY_ID[positionId];
  const onFieldElsewhere = present.filter((p) => positionOf[p.id] && p.id !== currentId);
  const onBench = present.filter((p) => !positionOf[p.id]);

  const Row = ({ player, subtitle, tone }) => {
    const preferred =
      player.preferredPositions.length === 0 || player.preferredPositions.includes(pos.group);
    return (
      <button
        onClick={() => onSwap(player.id)}
        className={`flex min-h-[60px] w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors ${
          tone === 'bench'
            ? 'border-lime-700/40 bg-lime-500/5 hover:bg-lime-500/10'
            : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
        }`}
      >
        <span className="flex-1 truncate text-lg font-black uppercase tracking-tight text-white">
          {player.name}
        </span>
        {!preferred && positionId !== 'GK' && (
          <Tag className="border-amber-500/40 bg-amber-500/10 text-amber-300">off-pref</Tag>
        )}
        {positionId === 'GK' && !player.wantsGoalieToday && (
          <Tag className="border-amber-500/40 bg-amber-500/10 text-amber-300">not GK</Tag>
        )}
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{subtitle}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm">
      {/* Tapping the scrim closes — a big forgiving target on a phone. */}
      <button className="flex-1" onClick={onClose} aria-label="Close" />

      <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-900 pb-8">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-4 pb-3 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Shift {shiftIndex + 1} · {pos.label}
              </p>
              <p className="text-xl font-black uppercase tracking-tight text-white">
                {currentId
                  ? roster.find((p) => p.id === currentId)?.name
                  : <span className="text-slate-600">Open Slot</span>}
              </p>
            </div>
            <Button variant="outline" className="min-h-[44px] px-4 text-xs" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="space-y-4 px-4 pt-4">
          <section>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-lime-400">
              Sub in from bench
            </p>
            <div className="space-y-2">
              {onBench.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">Bench is empty this shift.</p>
              ) : (
                onBench.map((p) => <Row key={p.id} player={p} subtitle="Bench" tone="bench" />)
              )}
            </div>
          </section>

          <section>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Swap with someone on the field
            </p>
            <div className="space-y-2">
              {onFieldElsewhere.map((p) => (
                <Row key={p.id} player={p} subtitle={positionOf[p.id]} />
              ))}
            </div>
          </section>

          {currentId && (
            <Button variant="danger" className="w-full" onClick={() => onSwap(null)}>
              Leave slot empty
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
