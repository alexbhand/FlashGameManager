import { useMemo } from 'react';
import {
  HALF_MS,
  POSITION_BY_ID,
  SHIFTS_PER_HALF,
  SHIFT_MS,
  TOTAL_SHIFTS,
} from '../lib/constants.js';
import { benchForShift, diffShifts } from '../lib/lineup.js';
import { formatClock, formatCountdown } from '../lib/format.js';
import { Banner, Button, Card, SectionLabel, Tag } from './ui.jsx';

/** The pitch is drawn top-down: forwards at the top, keeper at the bottom. */
const LINES = [
  { key: 'FORWARDS', ids: ['LF', 'RF'] },
  { key: 'MIDFIELD', ids: ['LM', 'CM', 'RM'] },
  { key: 'DEFENSE', ids: ['LD', 'CD', 'RD'] },
  { key: 'KEEPER', ids: ['GK'] },
];

function PositionChip({ posId, name, tone = 'normal' }) {
  const pos = POSITION_BY_ID[posId];
  const tones = {
    normal: 'border-slate-700 bg-slate-800/80',
    keeper: 'border-fuchsia-500/50 bg-fuchsia-500/10',
    empty: 'border-dashed border-slate-700 bg-slate-900/50',
  };
  return (
    <div
      className={`flex min-h-[64px] flex-1 flex-col items-center justify-center rounded-xl border px-1 py-2 ${
        tones[name ? tone : 'empty']
      }`}
    >
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
        {pos.label}
      </span>
      <span
        className={`mt-0.5 truncate text-base font-black uppercase tracking-tight ${
          name ? 'text-white' : 'text-slate-600'
        }`}
      >
        {name || 'OPEN'}
      </span>
    </div>
  );
}

export default function LiveDashboard({
  roster,
  lineup,
  clock,
  elapsed,
  onStart,
  onPause,
  onCompleteShiftChange,
  onEndHalf,
  onFinishGame,
  onResetGame,
  stale,
  onRegenerate,
  onOpenMatrix,
  onOpenRosterChange,
  warnings = [],
}) {
  const present = useMemo(() => roster.filter((p) => p.isPresent), [roster]);
  const nameOf = useMemo(
    () => Object.fromEntries(roster.map((p) => [p.id, p.name])),
    [roster]
  );

  // Which of the 8 shifts is on the field right now.
  const globalShift = (clock.half - 1) * SHIFTS_PER_HALF + clock.shiftInHalf;
  const currentShift = lineup?.[globalShift] || {};
  const nextShift = globalShift + 1 < TOTAL_SHIFTS ? lineup[globalShift + 1] : null;

  const bench = benchForShift(lineup, present, globalShift);
  const diff = useMemo(
    () => (nextShift ? diffShifts(currentShift, nextShift) : null),
    [currentShift, nextShift]
  );

  // --- Clock derivations ---------------------------------------------------
  // The half clock is the single source of truth. The shift countdown is
  // DERIVED from it, never counted separately, so the two can never drift.
  // Shift boundaries are FIXED at 7:30 / 15:00 / 22:30 / 30:00 — confirming a
  // late sub does not push them back, it just makes that one shift short.
  const dueAt = (clock.shiftInHalf + 1) * SHIFT_MS;
  const countdown = dueAt - elapsed;
  const subDue = countdown <= 0;
  const halfOver = elapsed >= HALF_MS;
  const isLastShiftOfHalf = clock.shiftInHalf >= SHIFTS_PER_HALF - 1;
  const halfPct = Math.min(100, (elapsed / HALF_MS) * 100);
  const shiftPct = Math.max(
    0,
    Math.min(100, ((elapsed - clock.shiftInHalf * SHIFT_MS) / SHIFT_MS) * 100)
  );

  if (clock.status === 'final') {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-lime-400">Full Time</p>
          <p className="mt-2 text-3xl font-black uppercase tracking-tight text-white">
            Game Complete
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Save it to the season log so the playing-time totals stay honest.
          </p>
          <div className="mt-5 space-y-2">
            <Button variant="primary" className="w-full" onClick={onFinishGame}>
              Save to Season
            </Button>
            <Button variant="outline" className="w-full" onClick={onResetGame}>
              Discard &amp; Reset
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <Banner key={i} tone="amber">
              {w}
            </Banner>
          ))}
        </div>
      )}

      {stale && (
        <Banner tone="amber">
          Your Setup choices changed since this lineup was built — attendance, goalie
          picks, or arrivals.{' '}
          <button onClick={onRegenerate} className="underline underline-offset-2">
            Rebuild it
          </button>
          .
        </Banner>
      )}

      {/* ================= SCOREBOARD ================= */}
      <Card
        className={`overflow-hidden ${
          subDue ? 'border-amber-500/60' : clock.running ? 'border-lime-500/40' : 'border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            {clock.half === 1 ? '1st Half' : '2nd Half'}
          </span>
          <span
            className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] ${
              clock.running ? 'text-lime-400' : 'text-amber-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                clock.running ? 'animate-pulse bg-lime-400' : 'bg-amber-400'
              }`}
            />
            {clock.running ? 'Running' : clock.status === 'pregame' ? 'Ready' : 'Paused'}
          </span>
        </div>

        <div className="px-4 py-5 text-center">
          <div
            className={`clock-digits text-7xl font-black leading-none ${
              halfOver ? 'text-amber-400' : 'text-white'
            }`}
          >
            {formatClock(elapsed)}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            {halfOver ? `Full ${HALF_MS / 60000}:00 — end the half` : 'Half Elapsed'}
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                halfOver ? 'bg-amber-400' : 'bg-lime-400'
              }`}
              style={{ width: `${halfPct}%` }}
            />
          </div>
        </div>

        <div className="px-4 pb-4">
          <Button
            variant={clock.running ? 'warn' : 'primary'}
            className="w-full text-lg"
            onClick={clock.running ? onPause : onStart}
          >
            {clock.running
              ? 'Pause Half'
              : clock.status === 'pregame'
                ? `Start ${clock.half === 1 ? '1st' : '2nd'} Half`
                : 'Resume Half'}
          </Button>
        </div>
      </Card>

      {/* ================= SHIFT TIMER ================= */}
      <Card className={`p-4 ${subDue ? 'border-amber-500/60 bg-amber-500/5' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Shift {globalShift + 1} of {TOTAL_SHIFTS}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              #{clock.shiftInHalf + 1} of {SHIFTS_PER_HALF} this half
            </div>
            {!isLastShiftOfHalf && (
              <div className="mt-1 text-xs font-black uppercase tracking-wider text-slate-300">
                Sub at{' '}
                <span className="clock-digits text-lime-400">{formatClock(dueAt)}</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <div
              className={`clock-digits text-4xl font-black leading-none ${
                subDue ? 'text-amber-400' : 'text-lime-400'
              }`}
            >
              {formatCountdown(countdown)}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              {subDue ? 'Sub overdue' : 'Next Shift'}
            </div>
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              subDue ? 'bg-amber-400' : 'bg-lime-400'
            }`}
            style={{ width: `${shiftPct}%` }}
          />
        </div>
      </Card>

      {/* ================= SUBSTITUTION ALERT ================= */}
      {/* The half clock deliberately keeps running here — subs only happen at a
          stoppage, so the coach confirms the change when it actually occurs. */}
      {(subDue || halfOver) && (
        <div
          className={`rounded-2xl border-2 p-4 ${
            halfOver && isLastShiftOfHalf
              ? 'border-red-500 bg-red-500/15'
              : 'border-amber-400 bg-amber-400/15'
          }`}
        >
          {/* Only the heading pulses — the names below must stay readable. */}
          <p className="animate-pulse text-center text-lg font-black uppercase tracking-[0.15em] text-white">
            {halfOver && isLastShiftOfHalf ? '\u23f9 Half Complete' : '\u26a0 Substitution Alert'}
          </p>
          <p className="mt-1 text-center text-xs font-semibold text-slate-200">
            {halfOver && isLastShiftOfHalf
              ? 'Clock has passed 30:00 — end the half at the whistle.'
              : 'Sub at the next stoppage. Clock keeps running.'}
          </p>

          {/* What the coach needs at the whistle: who goes on, AND who is
              already out there but has to move. The second list is the one
              that gets forgotten — those players hear nothing unless you
              shout their new spot at them. */}
          {diff?.comingIn.length > 0 && (
            <div className="mt-3 border-t border-white/20 pt-3">
              <p className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">
                {isLastShiftOfHalf ? 'Starting next half' : 'Send on now'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {diff.comingIn.map(({ pid, to }) => (
                  <span
                    key={pid}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-lime-400 px-3 py-2 text-sm font-black uppercase tracking-tight text-slate-950"
                  >
                    {nameOf[pid]}
                    <span className="rounded bg-slate-950/25 px-1.5 py-0.5 text-[10px] font-black">
                      {POSITION_BY_ID[to].label}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {diff?.moving.length > 0 && (
            <div className="mt-3 border-t border-white/20 pt-3">
              <p className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">
                Already on — shout their new spot
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {diff.moving.map(({ pid, to }) => (
                  <span
                    key={pid}
                    className="inline-flex items-center gap-1.5 rounded-lg border-2 border-amber-300 bg-slate-950/40 px-3 py-2 text-sm font-black uppercase tracking-tight text-amber-100"
                  >
                    {nameOf[pid]}
                    <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                      {POSITION_BY_ID[to].label}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* The confirm button lives outside the alert so it is always reachable. */}
      {isLastShiftOfHalf ? (
        <Button
          variant={halfOver ? 'danger' : 'outline'}
          className="w-full text-lg"
          onClick={onEndHalf}
        >
          {clock.half === 1 ? 'End 1st Half' : 'End Game'}
        </Button>
      ) : (
        <Button
          variant={subDue ? 'warn' : 'ghost'}
          className="w-full text-lg"
          onClick={onCompleteShiftChange}
        >
          Shift Change Complete →
        </Button>
      )}

      {/* ================= ON THE FIELD ================= */}
      <div>
        <SectionLabel right={`${Object.values(currentShift).filter(Boolean).length} on`}>
          On The Field Now
        </SectionLabel>
        <Card className="space-y-2 border-lime-900/40 bg-gradient-to-b from-lime-950/30 to-slate-900/70 p-3">
          {LINES.map((line) => (
            <div key={line.key} className="flex gap-2">
              {line.ids.map((posId) => (
                <PositionChip
                  key={posId}
                  posId={posId}
                  name={nameOf[currentShift[posId]]}
                  tone={posId === 'GK' ? 'keeper' : 'normal'}
                />
              ))}
            </div>
          ))}
        </Card>
      </div>

      {/* ================= BENCH ================= */}
      <div>
        <SectionLabel right={`${bench.length} resting`}>Bench</SectionLabel>
        <Card className="p-3">
          {bench.length === 0 ? (
            <p className="py-2 text-center text-sm font-semibold text-slate-500">
              Everybody is on the field.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {bench.map((p) => {
                const comingIn = diff?.comingIn.find((c) => c.pid === p.id);
                return (
                  <span
                    key={p.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-black uppercase tracking-tight ${
                      comingIn
                        ? 'border-lime-500/50 bg-lime-500/10 text-lime-300'
                        : 'border-slate-700 bg-slate-800 text-slate-300'
                    }`}
                  >
                    {p.name}
                    {comingIn && (
                      <Tag group={POSITION_BY_ID[comingIn.to].group}>
                        {comingIn.to}
                      </Tag>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ================= NEXT SHIFT PREVIEW ================= */}
      <div>
        <SectionLabel
          right={nextShift ? `Shift ${globalShift + 2} \u00b7 sub at ${formatClock(dueAt)}` : null}
        >
          Next Shift Preview
        </SectionLabel>

        {!nextShift ? (
          <Card className="p-4 text-center text-sm font-semibold text-slate-500">
            Last shift of the game. Finish strong.
          </Card>
        ) : (
          <div className="space-y-2">
            {/* ---- Coming on from the bench ---- */}
            <Card className="border-lime-600/40 bg-lime-500/5 p-3">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-lime-400">
                Going On ({diff.comingIn.length})
              </p>
              {diff.comingIn.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">Nobody — same nine stay out.</p>
              ) : (
                <div className="space-y-1.5">
                  {diff.comingIn.map(({ pid, to }) => (
                    <CallRow key={pid} name={nameOf[pid]} to={to} tone="on" />
                  ))}
                </div>
              )}
            </Card>

            {/* ---- Already out there. Switchers first, and loud, because
                   these are the ones nobody thinks to tell. ---- */}
            <Card className="p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-300">
                  Staying On ({diff.remaining.length})
                </p>
                {diff.moving.length > 0 ? (
                  <span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                    {diff.moving.length} switching
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    no spot changes
                  </span>
                )}
              </div>
              {diff.remaining.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">
                  Whole outfield changes — nobody stays on.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {diff.remaining.map((r) => (
                    <CallRow
                      key={r.pid}
                      name={nameOf[r.pid]}
                      to={r.to}
                      from={r.moved ? r.from : null}
                      tone={r.moved ? 'move' : 'hold'}
                    />
                  ))}
                </div>
              )}
            </Card>

            {/* ---- Off ---- */}
            <Card className="border-red-900/40 p-3">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-red-300">
                Coming Off ({diff.goingOut.length})
              </p>
              {diff.goingOut.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">Nobody.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {diff.goingOut.map((pid) => (
                    <span
                      key={pid}
                      className="inline-flex items-center rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-sm font-black uppercase tracking-tight text-red-200"
                    >
                      {nameOf[pid]}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <p className="px-1 text-[11px] leading-relaxed text-slate-500">
              <span className="font-bold text-lime-300">Green</span> comes on from the bench ·{' '}
              <span className="font-bold text-amber-300">Amber</span> is already out there and
              moving to a new spot · grey holds the same position.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2 pb-2">
        <Button variant="ghost" className="w-full text-sm" onClick={onOpenRosterChange}>
          Someone Arrived / Left
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 text-sm" onClick={onOpenMatrix}>
            Edit Matrix
          </Button>
          <Button variant="outline" className="flex-1 text-sm" onClick={onResetGame}>
            Reset Game
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One shoutable line: who, and where they are standing next shift.
 * Position is spelled out ("Center Mid", not "CM") because this is read aloud
 * across a pitch, not scanned like a spreadsheet.
 */
function CallRow({ name, to, from, tone }) {
  const pos = POSITION_BY_ID[to];
  const shell = {
    on: 'border-lime-500/50 bg-lime-500/10',
    move: 'border-amber-400/70 bg-amber-400/15',
    hold: 'border-slate-700 bg-slate-800/50',
  }[tone];

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${shell}`}>
      <span
        className={`min-w-0 flex-1 truncate text-base font-black uppercase tracking-tight ${
          tone === 'hold' ? 'text-slate-300' : 'text-white'
        }`}
      >
        {name}
      </span>

      {from && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-200/70">
          was {from}
        </span>
      )}

      <span
        className={`shrink-0 text-sm font-black uppercase tracking-tight ${
          tone === 'hold' ? 'text-slate-400' : tone === 'move' ? 'text-amber-200' : 'text-lime-200'
        }`}
      >
        {pos.label}
      </span>

      {tone === 'move' && (
        <span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-950">
          Move
        </span>
      )}
    </div>
  );
}
