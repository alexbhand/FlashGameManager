import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SHIFTS_PER_HALF,
  SHIFT_MS,
  STORAGE_KEYS,
  TOTAL_SHIFTS,
  createRoster,
  createPlayer,
  ROSTER_NAMES,
  slugify,
} from './lib/constants.js';
import {
  computeGameStats,
  emptyLineup,
  generateLineup,
  isLineupStale,
  planSignature,
  applySwap,
} from './lib/lineup.js';
import { todayISO } from './lib/format.js';
import { useLocalStorage } from './lib/useLocalStorage.js';
import PreGameSetup from './components/PreGameSetup.jsx';
import LiveDashboard from './components/LiveDashboard.jsx';
import MatrixView from './components/MatrixView.jsx';
import SeasonHistory from './components/SeasonHistory.jsx';
import RosterChangeSheet from './components/RosterChangeSheet.jsx';
import TabBar from './components/TabBar.jsx';

// ===========================================================================
// CLOCK MODEL
// ---------------------------------------------------------------------------
// Only ONE number is ever stored: `accumulated` (ms of the current half that
// have already banked) plus `startedAt` (wall-clock ms of the moment the
// current run began). Elapsed time is always derived:
//
//     elapsed = accumulated + (running ? Date.now() - startedAt : 0)
//
// Why this shape and not a setInterval that does `tick++`:
//   * No drift. A 200ms interval that fires late (throttled background tab,
//     phone screen off in a coat pocket) would lose real seconds. Reading the
//     wall clock cannot.
//   * Refresh-proof. Because startedAt is a real timestamp written to
//     localStorage, reloading the page mid-half picks the clock right back up
//     where it should be, not where it was when the tab died.
//   * The shift countdown is DERIVED from the same elapsed value rather than
//     being its own timer, so the two clocks can never disagree.
//
// Shift boundaries are FIXED at 7:30 / 15:00 / 22:30 / 30:00 of each half.
// Confirming a sub advances which shift is on the field; it does NOT move the
// remaining boundaries. So a sub made late just makes that one shift short,
// and the schedule the whole plan was built around stays put. (An earlier
// version re-cut the remaining shifts to absorb the overrun — it kept the
// halves exact, but it meant no boundary was ever where you expected it.)
// ===========================================================================

const INITIAL_CLOCK = {
  half: 1,
  shiftInHalf: 0,    // 0..3 within the current half
  running: false,
  startedAt: null,   // epoch ms, or null while paused
  accumulated: 0,    // banked ms of this half
  status: 'pregame', // pregame | live | final
};

/** Clock reading at which shift `i` (0-based, within a half) is due to end. */
export const shiftDueAt = (shiftInHalf) => (shiftInHalf + 1) * SHIFT_MS;

const INITIAL_SETTINGS = { singleKeeperBothHalves: false, seed: 1, opponent: '' };

/** Heal rosters saved by an older build (or hand-edited localStorage). */
function migrateRoster(saved) {
  if (!Array.isArray(saved) || saved.length === 0) return createRoster();
  const byId = new Map(
    saved
      .filter((p) => p && typeof p.name === 'string')
      .map((p) => [
        p.id || slugify(p.name),
        {
          id: p.id || slugify(p.name),
          name: p.name,
          isPresent: p.isPresent !== false,
          preferredPositions: Array.isArray(p.preferredPositions) ? p.preferredPositions : [],
          wantsGoalieToday: p.wantsGoalieToday === true,
          arriveShift: Number.isInteger(p.arriveShift) ? p.arriveShift : 0,
          departShift: Number.isInteger(p.departShift) ? p.departShift : null,
        },
      ])
  );
  // Make sure every name from the canonical roster exists exactly once.
  ROSTER_NAMES.forEach((name) => {
    const id = slugify(name);
    if (!byId.has(id)) byId.set(id, createPlayer(name));
  });
  return [...byId.values()];
}

export default function App() {
  // --- Persisted state ------------------------------------------------------
  const [roster, setRoster] = useLocalStorage(STORAGE_KEYS.roster, createRoster, migrateRoster);
  const [lineup, setLineup] = useLocalStorage(STORAGE_KEYS.lineup, emptyLineup);
  // What the saved lineup was actually built from — see planSignature().
  const [lineupMeta, setLineupMeta] = useLocalStorage(STORAGE_KEYS.lineupMeta, null);
  const [games, setGames] = useLocalStorage(STORAGE_KEYS.completedGames, []);
  const [settings, setSettings] = useLocalStorage(STORAGE_KEYS.settings, INITIAL_SETTINGS);
  const [clock, setClock] = useLocalStorage(STORAGE_KEYS.gameState, INITIAL_CLOCK);

  // --- Ephemeral state ------------------------------------------------------
  const [tab, setTab] = useState('setup');
  const [warnings, setWarnings] = useState([]);
  const [rosterSheetOpen, setRosterSheetOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Re-render 4x/second only while the clock is actually running.
  useEffect(() => {
    if (!clock.running) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [clock.running]);

  /** Single source of truth for "how far into this half are we". */
  const elapsed = clock.accumulated + (clock.running && clock.startedAt ? now - clock.startedAt : 0);
  const readElapsed = useCallback(
    () => clock.accumulated + (clock.running && clock.startedAt ? Date.now() - clock.startedAt : 0),
    [clock]
  );

  const present = useMemo(() => roster.filter((p) => p.isPresent), [roster]);
  const globalShift = (clock.half - 1) * SHIFTS_PER_HALF + clock.shiftInHalf;
  const lineupReady = useMemo(
    () => lineup.some((shift) => Object.values(shift).some(Boolean)),
    [lineup]
  );
  /**
   * Is the plan on screen still the plan the coach's current choices imply?
   * Compare the INPUTS, not the output: an input change (someone ticked for
   * goal, attendance flipped) means the plan is out of date, while a
   * deliberate manual swap on the Matrix does not. Lineups saved before this
   * metadata existed fall back to the old attendance-only heuristic.
   */
  const currentSignature = useMemo(
    () => planSignature(roster, { singleKeeperBothHalves: settings.singleKeeperBothHalves }),
    [roster, settings.singleKeeperBothHalves]
  );
  const stale = useMemo(() => {
    if (!lineupReady) return false;
    if (lineupMeta?.signature) return lineupMeta.signature !== currentSignature;
    return isLineupStale(lineup, roster);
  }, [lineupReady, lineupMeta, currentSignature, lineup, roster]);

  /** Season GK totals feed back into generation so the same kid doesn't keep
   *  drawing goalie week after week. */
  const seasonGkShifts = useMemo(() => {
    const acc = {};
    games.forEach((g) =>
      Object.values(g.stats || {}).forEach((s) => {
        acc[s.id] = (acc[s.id] || 0) + s.GK;
      })
    );
    return acc;
  }, [games]);

  // --- Lineup actions -------------------------------------------------------
  /**
   * Build the plan. `fromShift > 0` re-plans only the tail of the game, so
   * shifts already played stay exactly as they were — that is what makes
   * mid-game roster changes safe.
   */
  const buildLineup = useCallback(
    (fromShift = 0, rosterOverride = null, { reshuffle = true } = {}) => {
      // "Regenerate" bumps the seed so you genuinely get a different plan.
      // Automatic rebuilds keep it, so the lineup only moves in response to the
      // change you actually made rather than reshuffling the whole team every
      // time you tick a box.
      const seed = reshuffle ? (settings.seed || 1) + 1 : settings.seed || 1;
      const rosterUsed = rosterOverride || roster;
      const result = generateLineup(rosterUsed, {
        seed,
        singleKeeperBothHalves: settings.singleKeeperBothHalves,
        seasonGkShifts,
        fromShift,
        baseLineup: fromShift > 0 ? lineup : null,
      });
      setLineup(result.lineup);
      setWarnings(result.warnings);
      setSettings((s) => ({ ...s, seed }));
      setLineupMeta({
        signature: planSignature(rosterUsed, {
          singleKeeperBothHalves: settings.singleKeeperBothHalves,
        }),
        builtAt: Date.now(),
      });
    },
    [
      roster,
      lineup,
      settings.seed,
      settings.singleKeeperBothHalves,
      seasonGkShifts,
      setLineup,
      setSettings,
      setLineupMeta,
    ]
  );

  /**
   * Nothing has happened yet: first half, first shift, clock untouched. While
   * this holds, changing a Setup choice can safely re-plan the whole game.
   */
  const gameNotStarted =
    clock.status === 'pregame' &&
    clock.half === 1 &&
    clock.shiftInHalf === 0 &&
    clock.accumulated === 0 &&
    !clock.running;

  /**
   * The first shift we are allowed to re-plan. Shifts already played are
   * history and must never be rewritten — the season record has to say what
   * actually happened on the pitch, not what the latest plan wishes had.
   *
   * While a half is still `pregame` nobody is out there yet, so the current
   * shift is fair game. That covers half time as well as kickoff: at the
   * break, shift 5 has not been played, so a kid arriving at half time can
   * still be put straight into it. Once the clock is running the nine on the
   * pitch stay put until the coach subs at a stoppage, so we start from the
   * next shift instead.
   */
  const replanFrom =
    clock.status === 'pregame'
      ? globalShift
      : Math.min(globalShift + 1, TOTAL_SHIFTS);

  /**
   * "Build" / "Regenerate" / the Live tab's rebuild nudge all come through
   * here. Mid-game this re-plans only the shifts still to come; before
   * kickoff `replanFrom` is 0, so it is a clean full build. Rebuilding from
   * scratch mid-game used to rewrite the half that had already been played,
   * which quietly falsified the season stats saved at full time.
   */
  const handleGenerate = useCallback(() => buildLineup(replanFrom), [buildLineup, replanFrom]);

  /** Apply an availability change, then re-plan the untouched shifts. */
  const applyAvailability = useCallback(
    (playerId, patch) => {
      const next = roster.map((p) => (p.id === playerId ? { ...p, ...patch } : p));
      setRoster(next);
      if (replanFrom < TOTAL_SHIFTS) buildLineup(replanFrom, next, { reshuffle: false });
    },
    [roster, replanFrom, setRoster, buildLineup]
  );

  const handleArrive = useCallback(
    (playerId) =>
      applyAvailability(playerId, {
        isPresent: true,
        arriveShift: replanFrom,
        departShift: null,
      }),
    [applyAvailability, replanFrom]
  );

  const handleDepart = useCallback(
    (playerId) =>
      applyAvailability(playerId, {
        // They keep every shift already played; they are out from here on.
        departShift: replanFrom,
      }),
    [applyAvailability, replanFrom]
  );

  const handleUndoAvailability = useCallback(
    (playerId) => applyAvailability(playerId, { arriveShift: 0, departShift: null }),
    [applyAvailability]
  );

  const handleLineupChange = useCallback(
    (shiftIndex, positionId, playerId) =>
      setLineup((prev) => applySwap(prev, shiftIndex, positionId, playerId)),
    [setLineup]
  );

  /**
   * Before kickoff, keep the plan in step with Setup automatically — tick a
   * goalie, flip attendance, and the lineup just follows. No nudge to notice
   * and no button to remember.
   *
   * Deliberately limited to before the clock starts. Re-planning mid-game
   * would pull players off the pitch the moment you touched a toggle, so once
   * play is under way the stale banner asks first. The rebuild stores a
   * matching signature, which clears `stale` and stops this re-firing.
   */
  const autoBuiltFor = useRef(null);
  useEffect(() => {
    if (!lineupReady || !stale || !gameNotStarted) return;
    // Belt and braces: never auto-build twice for the same set of choices. The
    // rebuild clears `stale` on its own, but this app runs unattended on a
    // phone at the side of a pitch, and a rebuild loop would flatten the
    // battery and hammer localStorage. One signature, one automatic rebuild.
    if (autoBuiltFor.current === currentSignature) return;
    autoBuiltFor.current = currentSignature;
    buildLineup(0, null, { reshuffle: false });
  }, [lineupReady, stale, gameNotStarted, currentSignature, buildLineup]);

  // --- Clock actions --------------------------------------------------------
  const handleStart = useCallback(() => {
    setNow(Date.now());
    setClock((c) => ({ ...c, running: true, startedAt: Date.now(), status: 'live' }));
  }, [setClock]);

  const handlePause = useCallback(() => {
    setClock((c) =>
      c.running
        ? { ...c, running: false, accumulated: c.accumulated + (Date.now() - c.startedAt), startedAt: null }
        : c
    );
  }, [setClock]);

  /**
   * Confirmed at the whistle, not when the countdown hits zero — subs only
   * happen at a stoppage. This just moves the next shift onto the field; the
   * remaining 7:30 boundaries are fixed and do not shift to absorb the
   * overrun, so the next sub is still due when the plan says it is.
   */
  const handleCompleteShiftChange = useCallback(() => {
    setClock((c) =>
      c.shiftInHalf + 1 >= SHIFTS_PER_HALF ? c : { ...c, shiftInHalf: c.shiftInHalf + 1 }
    );
  }, [setClock]);

  const handleEndHalf = useCallback(() => {
    setClock((c) =>
      c.half === 1
        ? { ...INITIAL_CLOCK, half: 2, status: 'pregame' } // fresh 30:00 for the 2nd half
        : { ...c, running: false, accumulated: readElapsed(), startedAt: null, status: 'final' }
    );
  }, [readElapsed, setClock]);

  const handleResetGame = useCallback(() => {
    if (
      !window.confirm(
        'Reset the clock and rebuild the lineup from your current Setup choices?\n\n' +
          'Any manual swaps you made on the Matrix will be lost.'
      )
    )
      return;
    setClock(INITIAL_CLOCK);
    buildLineup(0); // re-plan, so newly ticked goalies actually take effect
  }, [setClock, buildLineup]);

  // --- Season actions -------------------------------------------------------
  const handleFinishGame = useCallback(() => {
    const stats = computeGameStats(lineup, present);
    const game = {
      id: `g-${Date.now()}`,
      date: todayISO(),
      savedAt: Date.now(), // so same-day games are distinguishable when deleting
      opponent: settings.opponent.trim(),
      stats,
    };
    setGames((prev) => [...prev, game]);
    setClock(INITIAL_CLOCK);
    setLineup(emptyLineup());
    setLineupMeta(null);
    setSettings((s) => ({ ...s, opponent: '' }));
    // Goalie opt-in and availability windows are per-game; clear them for next
    // week. Position preferences are season-long and deliberately untouched.
    setRoster((prev) =>
      prev.map((p) => ({ ...p, wantsGoalieToday: false, arriveShift: 0, departShift: null }))
    );
    setTab('season');
  }, [
    lineup,
    present,
    settings.opponent,
    setGames,
    setClock,
    setLineup,
    setLineupMeta,
    setSettings,
    setRoster,
  ]);

  const handleDeleteGame = useCallback(
    (id) => {
      if (!window.confirm('Delete this game from the season log?')) return;
      setGames((prev) => prev.filter((g) => g.id !== id));
    },
    [setGames]
  );

  const handleClearSeason = useCallback(() => {
    if (!window.confirm('Erase every logged game? This cannot be undone.')) return;
    setGames([]);
  }, [setGames]);

  // Sub-due flag drives the badge on the Live tab from anywhere in the app.
  const subDue = clock.status === 'live' && elapsed >= shiftDueAt(clock.shiftInHalf);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* --- Header ---------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black uppercase italic tracking-tighter text-lime-400">
              Flash
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
              Game Day
            </span>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {present.length} present
            </div>
            {settings.opponent && (
              <div className="text-xs font-bold uppercase tracking-tight text-slate-300">
                vs {settings.opponent}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* --- Views ----------------------------------------------------------- */}
      <main className="mx-auto max-w-3xl px-3 pb-28 pt-4">
        {tab === 'setup' && (
          <PreGameSetup
            roster={roster}
            setRoster={setRoster}
            settings={settings}
            setSettings={setSettings}
            onGenerate={handleGenerate}
            warnings={warnings}
            lineupReady={lineupReady}
            onGoLive={() => setTab('live')}
            seasonGkShifts={seasonGkShifts}
          />
        )}

        {tab === 'live' &&
          (lineupReady ? (
            <LiveDashboard
              roster={roster}
              lineup={lineup}
              clock={clock}
              elapsed={elapsed}
              onStart={handleStart}
              onPause={handlePause}
              onCompleteShiftChange={handleCompleteShiftChange}
              onEndHalf={handleEndHalf}
              onFinishGame={handleFinishGame}
              onResetGame={handleResetGame}
              stale={stale && !gameNotStarted}
              onRegenerate={handleGenerate}
              onOpenMatrix={() => setTab('matrix')}
              onOpenRosterChange={() => setRosterSheetOpen(true)}
              warnings={warnings}
            />
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
              <p className="text-lg font-black uppercase tracking-wide text-slate-300">
                No lineup yet
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Mark who is here on the Setup tab, then build the lineup.
              </p>
              <button
                onClick={() => setTab('setup')}
                className="mt-5 min-h-[52px] w-full rounded-xl bg-lime-400 px-5 font-black uppercase tracking-wide text-slate-950"
              >
                Go to Setup
              </button>
            </div>
          ))}

        {tab === 'matrix' && (
          <MatrixView
            roster={roster}
            lineup={lineup}
            onLineupChange={handleLineupChange}
            liveShiftIndex={clock.status === 'pregame' && clock.half === 1 ? -1 : globalShift}
          />
        )}

        {tab === 'season' && (
          <SeasonHistory
            games={games}
            roster={roster}
            onDeleteGame={handleDeleteGame}
            onClearSeason={handleClearSeason}
          />
        )}
      </main>

      <RosterChangeSheet
        open={rosterSheetOpen}
        roster={roster}
        fromShift={replanFrom}
        onArrive={handleArrive}
        onDepart={handleDepart}
        onUndo={handleUndoAvailability}
        onClose={() => setRosterSheetOpen(false)}
      />

      <TabBar tab={tab} setTab={setTab} alert={subDue} />
    </div>
  );
}
