import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { POSITION_BY_ID } from '../lib/constants.js';
import { buzz } from '../lib/haptics.js';
import { Card, SectionLabel, Tag } from './ui.jsx';

/**
 * The pitch and the bench, with drag-to-swap.
 *
 * Press and hold a player — on the pitch or the bench — then drag them onto
 * another player and let go. The two change places. Every combination is the
 * same underlying operation, so there is one rule to learn rather than three:
 *
 *   bench  -> pitch position   the bench player comes on, the other goes off
 *   pitch  -> pitch position   the two swap positions
 *   pitch  -> bench player     the bench player comes on, the dragged one sits
 *
 * The press-and-hold delay is the crux of making this usable on a phone. The
 * Live tab is a long scrolling page; a drag that started on contact would mean
 * every attempt to scroll past the pitch snatched up a player instead. The
 * TouchSensor waits 220ms and tolerates 8px of movement, so a flick scrolls and
 * a deliberate hold picks up.
 */

const LINES = [
  { key: 'FORWARDS', ids: ['LF', 'RF'] },
  { key: 'MIDFIELD', ids: ['LM', 'CM', 'RM'] },
  { key: 'DEFENSE', ids: ['LD', 'CD', 'RD'] },
  { key: 'KEEPER', ids: ['GK'] },
];

const parseId = (id) => {
  const [kind, value] = String(id).split(':');
  return { kind, value };
};

/** A player on the pitch: both a handle to pick up and a place to drop on. */
function PitchSlot({ posId, playerId, name, dragging }) {
  const pos = POSITION_BY_ID[posId];
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `pos:${posId}` });
  const {
    setNodeRef: dragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({ id: `pos:${posId}`, disabled: !playerId });

  const ref = (node) => {
    dropRef(node);
    dragRef(node);
  };

  return (
    <div
      ref={ref}
      {...attributes}
      {...listeners}
      className={`flex min-h-[68px] flex-1 select-none flex-col items-center justify-center rounded-xl border px-1 py-2 transition-colors ${
        !playerId
          ? 'border-dashed border-slate-700 bg-slate-900/50'
          : posId === 'GK'
            ? 'border-fuchsia-500/50 bg-fuchsia-500/10'
            : 'border-slate-700 bg-slate-800/80'
      } ${isOver && !isDragging ? 'ring-2 ring-lime-400 ring-offset-2 ring-offset-slate-950' : ''} ${
        isDragging ? 'opacity-30' : ''
      } ${dragging && !isDragging && playerId ? 'border-lime-500/40' : ''}`}
      style={{ touchAction: 'manipulation' }}
    >
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
        {pos.label}
      </span>
      <span
        className={`mt-0.5 truncate text-base font-black uppercase tracking-tight ${
          playerId ? 'text-white' : 'text-slate-600'
        }`}
      >
        {name || 'OPEN'}
      </span>
    </div>
  );
}

/** A player on the bench: also draggable, and also a drop target. */
function BenchChip({ player, incomingTo, dragging }) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `bench:${player.id}` });
  const {
    setNodeRef: dragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({ id: `bench:${player.id}` });

  const ref = (node) => {
    dropRef(node);
    dragRef(node);
  };

  return (
    <span
      ref={ref}
      {...attributes}
      {...listeners}
      style={{ touchAction: 'manipulation' }}
      className={`inline-flex min-h-[48px] select-none items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-black uppercase tracking-tight transition-colors ${
        incomingTo
          ? 'border-lime-500/50 bg-lime-500/10 text-lime-300'
          : 'border-slate-700 bg-slate-800 text-slate-300'
      } ${isOver && !isDragging ? 'ring-2 ring-lime-400 ring-offset-2 ring-offset-slate-950' : ''} ${
        isDragging ? 'opacity-30' : ''
      } ${dragging && !isDragging ? 'border-lime-500/40' : ''}`}
    >
      {player.name}
      {incomingTo && <Tag group={POSITION_BY_ID[incomingTo].group}>{incomingTo}</Tag>}
    </span>
  );
}

export default function PitchBoard({ shift, bench, nameOf, comingIn, onSwap, onCount }) {
  const [activeId, setActiveId] = useState(null);

  // Mouse and touch are separated deliberately: a single PointerSensor would
  // apply one activation rule to both, and a mouse wants an immediate drag
  // while a finger needs the hold delay to leave scrolling alone.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const activeName = useMemo(() => {
    if (!activeId) return null;
    const { kind, value } = parseId(activeId);
    return kind === 'bench' ? nameOf[value] : nameOf[shift?.[value]];
  }, [activeId, nameOf, shift]);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const from = parseId(active.id);
    const to = parseId(over.id);

    // Normalise every gesture into "put this player into that position".
    let targetPos = null;
    let incoming = null;
    if (from.kind === 'bench' && to.kind === 'pos') {
      targetPos = to.value;
      incoming = from.value;
    } else if (from.kind === 'pos' && to.kind === 'pos') {
      targetPos = to.value;
      incoming = shift?.[from.value];
    } else if (from.kind === 'pos' && to.kind === 'bench') {
      targetPos = from.value;
      incoming = to.value;
    } else {
      return; // bench onto bench changes nothing
    }

    if (!targetPos || !incoming) return;
    buzz([12, 40, 18]);
    onSwap(targetPos, incoming);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => {
        setActiveId(active.id);
        buzz(18); // the hold registered — let go or drag
      }}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div>
        <SectionLabel right={`${onCount} on`}>On The Field Now</SectionLabel>
        <Card className="space-y-2 border-lime-900/40 bg-gradient-to-b from-lime-950/30 to-slate-900/70 p-3">
          {LINES.map((line) => (
            <div key={line.key} className="flex gap-2">
              {line.ids.map((posId) => (
                <PitchSlot
                  key={posId}
                  posId={posId}
                  playerId={shift?.[posId]}
                  name={nameOf[shift?.[posId]]}
                  dragging={!!activeId}
                />
              ))}
            </div>
          ))}
        </Card>
        <p className="mt-1.5 px-1 text-[11px] text-slate-500">
          Press and hold a player, drag onto another, let go — they swap.
        </p>
      </div>

      <div className="mt-4">
        <SectionLabel right={`${bench.length} resting`}>Bench</SectionLabel>
        <Card className="p-3">
          {bench.length === 0 ? (
            <p className="py-2 text-center text-sm font-semibold text-slate-500">
              Everybody is on the field.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bench.map((p) => (
                <BenchChip
                  key={p.id}
                  player={p}
                  incomingTo={comingIn?.find((c) => c.pid === p.id)?.to}
                  dragging={!!activeId}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Floats above everything, so picking a player up never reflows the page. */}
      <DragOverlay dropAnimation={null}>
        {activeName ? (
          <div className="pointer-events-none rounded-xl border-2 border-lime-400 bg-slate-900 px-4 py-3 text-base font-black uppercase tracking-tight text-white shadow-2xl shadow-black/60">
            {activeName}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
