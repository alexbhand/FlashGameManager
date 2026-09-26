import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { POSITIONS, SHIFTS_PER_HALF, TOTAL_SHIFTS } from '../lib/constants.js';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { computeGameStats, applyMatrixSwap } from '../lib/lineup.js';
import { buzz } from '../lib/haptics.js';
import { renderLineupImage, lineupAsText } from '../lib/exportLineup.js';
import { prettyDate, todayISO } from '../lib/format.js';
import { Button, Card, SectionLabel } from './ui.jsx';
import SwapModal from './SwapModal.jsx';

/**
 * One grid cell: tap to open the swap sheet, press and hold to drag.
 *
 * Both roles on the same element — a cell is a handle to pick a player up and
 * a place to drop one. Tapping still opens the sheet, because the sensors only
 * start a drag after 8px of mouse travel or a 220ms hold, so a quick tap never
 * looks like a drag.
 */
function MatrixCell({
  shiftIndex,
  posId,
  playerId,
  name,
  offPref,
  isLive,
  dragging,
  illegal,
  onOpen,
}) {
  const id = `cell:${shiftIndex}:${posId}`;
  const { setNodeRef: dropRef, isOver } = useDroppable({ id });
  const {
    setNodeRef: dragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({ id, disabled: !playerId });

  const ref = (node) => {
    dropRef(node);
    dragRef(node);
  };

  return (
    <button
      ref={ref}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      style={{ touchAction: 'manipulation' }}
      className={`relative flex min-h-[48px] w-full select-none items-center justify-center rounded-lg border px-0.5 text-center text-[11px] font-black uppercase leading-tight tracking-tight transition-colors ${
        !playerId
          ? 'border-dashed border-slate-700 bg-slate-900/50 text-slate-600'
          : posId === 'GK'
            ? 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200'
            : isLive
              ? 'border-lime-500/40 bg-lime-500/10 text-white'
              : 'border-slate-700 bg-slate-800 text-slate-100'
      } ${
        isOver && !isDragging
          ? illegal
            ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-slate-950'
            : 'ring-2 ring-lime-400 ring-offset-1 ring-offset-slate-950'
          : ''
      } ${isDragging ? 'opacity-30' : ''} ${
        dragging && !isDragging && playerId && !illegal ? 'border-lime-500/40' : ''
      } ${dragging && illegal ? 'opacity-40' : ''}`}
    >
      <span className="truncate">{name || '+'}</span>
      {offPref && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
      )}
    </button>
  );
}

/**
 * VIEW C — Master matrix (8 shifts x 9 positions) with manual override.
 * The 8 columns are split into two 4-shift views so the grid stays readable
 * on a phone; the toggle follows whichever half is live by default.
 */
export default function MatrixView({
  roster,
  lineup,
  onLineupChange,
  liveShiftIndex,
  opponent = '',
  onNotify,
  onMatrixDrag,
}) {
  const [half, setHalf] = useState(liveShiftIndex >= SHIFTS_PER_HALF ? 2 : 1);
  const [cell, setCell] = useState(null); // { shiftIndex, positionId }
  const [activeCell, setActiveCell] = useState(null);

  // Same configuration as the pitch, for the same reason: the matrix sits on a
  // scrolling page, so a finger has to hold before it picks anything up.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const parseCell = (raw) => {
    const [, shift, posId] = String(raw).split(':');
    return { shift: Number(shift), posId };
  };

  /**
   * Can the player currently in hand actually land here? Worked out during the
   * drag so an impossible target is dimmed and ringed red rather than ringed
   * green and then refused on release — telling someone "yes" and then "no"
   * reads as a broken gesture, not a rule.
   */
  const canDropOn = (shift, posId) => {
    if (!activeCell) return true;
    if (activeCell.shift === shift && activeCell.posId === posId) return true;
    return applyMatrixSwap(lineup, activeCell, { shift, posId }, nameOf).ok;
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveCell(null);
    if (!over || active.id === over.id) return;
    buzz([12, 40, 18]);
    onMatrixDrag(parseCell(active.id), parseCell(over.id));
  };

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

  // --- Sharing the lineup -------------------------------------------------
  const dateLabel = prettyDate(todayISO());
  const fileName = `flash-lineup-${todayISO()}${opponent ? `-vs-${opponent.replace(/\W+/g, '-')}` : ''}.png`;

  /**
   * The card is drawn ahead of time and parked in a ref.
   *
   * navigator.share() has to be called from inside the user's tap. On iOS,
   * awaiting anything first — even a canvas toBlob that takes ten
   * milliseconds — can break that chain and get the call rejected as though
   * no gesture happened. So the image is ready before the button is pressed,
   * and the handler just hands it over.
   */
  const cardRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    cardRef.current = null;
    renderLineupImage({ lineup, roster, opponent, dateLabel })
      .then((blob) => {
        if (cancelled || !blob) return;
        cardRef.current = new File([blob], fileName, { type: 'image/png' });
      })
      .catch(() => {
        cardRef.current = null; // fall back to drawing on demand
      });
    return () => {
      cancelled = true;
    };
  }, [lineup, roster, opponent, dateLabel, fileName]);

  const [sharing, setSharing] = useState(false);

  const shareLineup = useCallback(async () => {
    setSharing(true);
    try {
      let file = cardRef.current;
      if (!file) {
        const blob = await renderLineupImage({ lineup, roster, opponent, dateLabel });
        if (!blob) throw new Error('could not draw the card');
        file = new File([blob], fileName, { type: 'image/png' });
      }

      // Preferred path: the native share sheet, which on a phone puts Messages
      // one tap away. Everything else is a fallback for desktop browsers.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Flash lineup · ${dateLabel}` });
        onNotify?.({ title: 'Lineup shared', detail: dateLabel });
        return;
      }

      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      onNotify?.({ title: 'Lineup saved', detail: fileName });
    } catch (err) {
      // Dismissing the share sheet is a normal thing to do, not an error.
      if (err?.name === 'AbortError') return;
      onNotify?.({ title: 'Could not share', detail: String(err?.message || err) });
    } finally {
      setSharing(false);
    }
  }, [lineup, roster, opponent, dateLabel, fileName, onNotify]);

  const copyAsText = useCallback(async () => {
    const text = lineupAsText({ lineup, roster, opponent, dateLabel });
    try {
      await navigator.clipboard.writeText(text);
      onNotify?.({ title: 'Copied as text', detail: 'Paste into a message' });
    } catch {
      onNotify?.({ title: 'Could not copy', detail: 'Clipboard blocked by the browser' });
    }
  }, [lineup, roster, opponent, dateLabel, onNotify]);

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

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => {
          setActiveCell(parseCell(active.id));
          buzz(18);
        }}
        onDragCancel={() => setActiveCell(null)}
        onDragEnd={handleDragEnd}
      >
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
                      <MatrixCell
                        shiftIndex={s}
                        posId={pos.id}
                        playerId={pid}
                        name={pid ? nameOf[pid] : null}
                        offPref={offPref}
                        isLive={s === liveShiftIndex}
                        dragging={!!activeCell}
                        illegal={!!activeCell && !canDropOn(s, pos.id)}
                        onOpen={() => setCell({ shiftIndex: s, positionId: pos.id })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Floats above the grid, so lifting a player never reflows the table. */}
      <DragOverlay dropAnimation={null}>
        {activeCell ? (
          <div className="pointer-events-none rounded-lg border-2 border-lime-400 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-tight text-white shadow-2xl shadow-black/60">
            {nameOf[lineup?.[activeCell.shift]?.[activeCell.posId]] || ''}
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        Tap a cell to swap from a list, or press and hold to drag one player onto another — across
        shifts as well as positions. <span className="text-amber-400">●</span> means the player is
        outside their preferred line.
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

      <div className="space-y-2 pb-2">
        <Button variant="primary" className="w-full text-base" onClick={shareLineup} disabled={sharing}>
          {sharing ? 'Preparing…' : 'Share Lineup'}
        </Button>
        <Button variant="outline" className="w-full text-sm" onClick={copyAsText}>
          Copy as text
        </Button>
        <p className="px-1 text-center text-[11px] leading-relaxed text-slate-500">
          Sends both halves as one image — on a phone this opens your share sheet, so you can text
          it straight to another coach.
        </p>
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
