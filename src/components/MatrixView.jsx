import { useMemo, useState } from 'react';
import { POSITIONS, SHIFTS_PER_HALF, TOTAL_SHIFTS } from '../lib/constants.js';
import { computeGameStats } from '../lib/lineup.js';
import { Card, SectionLabel } from './ui.jsx';
import SwapModal from './SwapModal.jsx';

/**
 * VIEW C — Master matrix (8 shifts x 9 positions) with manual override.
 * The 8 columns are split into two 4-shift views so the grid stays readable
 * on a phone; the toggle follows whichever half is live by default.
 */
export default function MatrixView({ roster, lineup, onLineupChange, liveShiftIndex }) {
  const [half, setHalf] = useState(liveShiftIndex >= SHIFTS_PER_HALF ? 2 : 1);
  const [cell, setCell] = useState(null); // { shiftIndex, positionId }

  const present = useMemo(() => roster.filter((p) => p.isPresent), [roster]);
  const nameOf = useMemo(() => Object.fromEntries(roster.map((p) => [p.id, p.name])), [roster]);
  const prefOf = useMemo(
    () => Object.fromEntries(roster.map((p) => [p.id, p.preferredPositions])),
    [roster]
  );
  const stats = useMemo(() => computeGameStats(lineup, present), [lineup, present]);

  // Fair-share target for this game, used to colour the equity read-out below.
  const targetShifts = present.length ? (TOTAL_SHIFTS * POSITIONS.length) / present.length : 0;

  const shiftIndexes = Array.from(
    { length: SHIFTS_PER_HALF },
    (_, i) => (half - 1) * SHIFTS_PER_HALF + i
  );

  const handleSwap = (playerId) => {
    onLineupChange(cell.shiftIndex, cell.positionId, playerId);
    setCell(null);
  };

  return (
    <div className="space-y-4">
      {/* Half toggle keeps the grid from getting cramped on mobile */}
      <div className="flex gap-2">
        {[1, 2].map((h) => (
          <button
            key={h}
            onClick={() => setHalf(h)}
            className={`min-h-[52px] flex-1 rounded-xl border-2 text-sm font-black uppercase tracking-widest transition-colors ${
              half === h
                ? 'border-lime-400 bg-lime-400 text-slate-950'
                : 'border-slate-700 bg-slate-800 text-slate-400'
            }`}
          >
            {h === 1 ? '1st Half' : '2nd Half'}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="w-[52px] bg-slate-900 px-1 py-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-500">
                Pos
              </th>
              {shiftIndexes.map((s) => (
                <th
                  key={s}
                  className={`px-0.5 py-2 text-center text-[9px] font-black uppercase tracking-widest ${
                    s === liveShiftIndex ? 'bg-lime-400/15 text-lime-300' : 'text-slate-500'
                  }`}
                >
                  S{s + 1}
                  {s === liveShiftIndex && <div className="text-[8px] text-lime-400">live</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((pos) => (
              <tr key={pos.id} className="border-b border-slate-800/70 last:border-0">
                <th
                  className={`bg-slate-900 px-1 py-1 text-left text-[10px] font-black uppercase tracking-wider ${
                    pos.id === 'GK' ? 'text-fuchsia-400' : 'text-slate-400'
                  }`}
                >
                  {pos.id}
                </th>
                {shiftIndexes.map((s) => {
                  const pid = lineup?.[s]?.[pos.id] || null;
                  const prefs = pid ? prefOf[pid] || [] : [];
                  const offPref =
                    pid && pos.id !== 'GK' && prefs.length > 0 && !prefs.includes(pos.group);
                  return (
                    <td key={s} className="p-0.5">
                      <button
                        onClick={() => setCell({ shiftIndex: s, positionId: pos.id })}
                        className={`relative flex min-h-[48px] w-full items-center justify-center rounded-lg border px-0.5 text-center text-[11px] font-black uppercase leading-tight tracking-tight transition-colors ${
                          !pid
                            ? 'border-dashed border-slate-700 bg-slate-900/50 text-slate-600'
                            : pos.id === 'GK'
                              ? 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200'
                              : s === liveShiftIndex
                                ? 'border-lime-500/40 bg-lime-500/10 text-white'
                                : 'border-slate-700 bg-slate-800 text-slate-100'
                        }`}
                      >
                        <span className="truncate">{pid ? nameOf[pid] : '+'}</span>
                        {offPref && (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="px-1 text-xs text-slate-500">
        Tap any cell to swap. <span className="text-amber-400">●</span> means the player is outside
        their preferred line.
      </p>

      {/* Live equity read-out so an override that breaks fairness is obvious */}
      <div>
        <SectionLabel right="this game">Shift Count Check</SectionLabel>
        <Card className="p-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
            {present
              .slice()
              .sort((a, b) => stats[b.id].total - stats[a.id].total || a.name.localeCompare(b.name))
              .map((p) => {
                const st = stats[p.id];
                const off = st.total - targetShifts;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold uppercase tracking-tight text-slate-300">
                      {p.name}
                    </span>
                    <span className="flex items-center gap-1">
                      {st.GK > 0 && (
                        <span className="text-[9px] font-black text-fuchsia-400">{st.GK}GK</span>
                      )}
                      <span
                        className={`clock-digits text-sm font-black ${
                          off >= 1 ? 'text-amber-400' : off <= -1 ? 'text-sky-400' : 'text-lime-400'
                        }`}
                      >
                        {st.total}
                      </span>
                    </span>
                  </div>
                );
              })}
          </div>
        </Card>
      </div>

      <SwapModal
        open={!!cell}
        shiftIndex={cell?.shiftIndex ?? 0}
        positionId={cell?.positionId ?? 'GK'}
        lineup={lineup}
        roster={roster}
        onSwap={handleSwap}
        onClose={() => setCell(null)}
      />
    </div>
  );
}
