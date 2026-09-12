import {
  BALANCE_LEVELS,
  DEFAULT_BALANCE,
  LEGACY_BALANCE,
  POSITION_IDS,
  TOTAL_SHIFTS,
  ROSTER_NAMES,
  createPlayer,
  createRoster,
  slugify,
} from './constants.js';
import { emptyLineup } from './lineup.js';

// ===========================================================================
// VALIDATORS FOR EVERYTHING WE READ BACK OUT OF localStorage
// ---------------------------------------------------------------------------
// JSON.parse succeeding does NOT mean the data is usable. A truncated write, a
// half-finished migration, a hand-edited key, or another tab writing a
// different schema all produce values that parse cleanly and then blow up in
// the middle of a render — `lineup.some is not a function`, `Cannot read
// properties of null (reading 'opponent')`. With no error boundary that is a
// white screen, and a coach on a touchline has no way back from a white
// screen. Every persisted key gets a validator that returns a usable value or
// falls back to the default; none of them can throw.
// ===========================================================================

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Accepts current labels and the blunter ones an earlier build stored. */
const readBalance = (v) => {
  if (BALANCE_LEVELS.includes(v)) return v;
  if (LEGACY_BALANCE[v]) return LEGACY_BALANCE[v];
  return DEFAULT_BALANCE;
};

/** Roster: keep what is salvageable, re-add any canonical name that is gone. */
export function validateRoster(saved) {
  try {
    const byId = new Map();
    if (Array.isArray(saved)) {
      saved.forEach((p) => {
        if (!isObj(p) || typeof p.name !== 'string' || !p.name) return;
        const id = typeof p.id === 'string' && p.id ? p.id : slugify(p.name);
        byId.set(id, {
          id,
          name: p.name,
          isPresent: p.isPresent !== false,
          preferredPositions: Array.isArray(p.preferredPositions)
            ? p.preferredPositions.filter((g) => typeof g === 'string')
            : [],
          wantsGoalieToday: p.wantsGoalieToday === true,
          arriveShift:
            Number.isInteger(p.arriveShift) && p.arriveShift >= 0 && p.arriveShift < TOTAL_SHIFTS
              ? p.arriveShift
              : 0,
          departShift:
            Number.isInteger(p.departShift) && p.departShift > 0 && p.departShift <= TOTAL_SHIFTS
              ? p.departShift
              : null,
          offense: readBalance(p.offense),
          defense: readBalance(p.defense),
        });
      });
    }
    ROSTER_NAMES.forEach((name) => {
      const id = slugify(name);
      if (!byId.has(id)) byId.set(id, createPlayer(name));
    });
    const out = [...byId.values()];
    return out.length ? out : createRoster();
  } catch {
    return createRoster();
  }
}

/** Lineup: exactly TOTAL_SHIFTS shifts, each an object keyed by position. */
export function validateLineup(saved) {
  try {
    if (!Array.isArray(saved)) return emptyLineup();
    const out = [];
    for (let s = 0; s < TOTAL_SHIFTS; s += 1) {
      const shift = saved[s];
      const clean = {};
      POSITION_IDS.forEach((id) => {
        const v = isObj(shift) ? shift[id] : null;
        clean[id] = typeof v === 'string' && v ? v : null;
      });
      // A shift can never field the same player twice, whatever the file says.
      const seen = new Set();
      POSITION_IDS.forEach((id) => {
        if (!clean[id]) return;
        if (seen.has(clean[id])) clean[id] = null;
        else seen.add(clean[id]);
      });
      out.push(clean);
    }
    return out;
  } catch {
    return emptyLineup();
  }
}

/** Completed games: drop anything that is not a usable record. */
export function validateGames(saved) {
  try {
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((g) => isObj(g) && typeof g.id === 'string')
      .map((g) => {
        const stats = {};
        if (isObj(g.stats)) {
          Object.entries(g.stats).forEach(([id, s]) => {
            if (!isObj(s)) return;
            const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
            stats[id] = {
              id: typeof s.id === 'string' ? s.id : id,
              name: typeof s.name === 'string' ? s.name : id,
              total: num(s.total),
              GK: num(s.GK),
              Defense: num(s.Defense),
              Midfield: num(s.Midfield),
              Forward: num(s.Forward),
            };
          });
        }
        return {
          id: g.id,
          date: typeof g.date === 'string' ? g.date : '',
          savedAt: Number.isFinite(g.savedAt) ? g.savedAt : null,
          opponent: typeof g.opponent === 'string' ? g.opponent : '',
          stats,
        };
      });
  } catch {
    return [];
  }
}

/** Clock: every field coerced, and a running clock without a start time is
 *  treated as paused rather than producing NaN for the rest of the game. */
export function validateClock(saved, initial) {
  try {
    if (!isObj(saved)) return { ...initial };
    const int = (v, min, max, dflt) =>
      Number.isInteger(v) && v >= min && v <= max ? v : dflt;
    const running = saved.running === true;
    const startedAt = Number.isFinite(saved.startedAt) ? saved.startedAt : null;
    return {
      half: int(saved.half, 1, 2, 1),
      shiftInHalf: int(saved.shiftInHalf, 0, 3, 0),
      running: running && startedAt != null,
      startedAt: running && startedAt != null ? startedAt : null,
      accumulated:
        Number.isFinite(saved.accumulated) && saved.accumulated >= 0 ? saved.accumulated : 0,
      status: ['pregame', 'live', 'final'].includes(saved.status) ? saved.status : 'pregame',
    };
  } catch {
    return { ...initial };
  }
}

export function validateSettings(saved, initial) {
  try {
    if (!isObj(saved)) return { ...initial };
    return {
      singleKeeperBothHalves: saved.singleKeeperBothHalves === true,
      seed: Number.isFinite(saved.seed) ? saved.seed : initial.seed,
      opponent: typeof saved.opponent === 'string' ? saved.opponent : '',
    };
  } catch {
    return { ...initial };
  }
}

export function validateMeta(saved) {
  try {
    return isObj(saved) && typeof saved.signature === 'string' ? saved : null;
  } catch {
    return null;
  }
}

/** Last resort, wired to the error boundary: wipe our keys and start clean. */
export function clearAllFlashData() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('flash.'))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* nothing else we can do */
  }
}
