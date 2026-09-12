import {
  FIELD_POSITIONS,
  KEEPER_FIELD_FLOOR_FULL_HALF,
  KEEPER_FIELD_FLOOR_PARTIAL,
  POSITION_BY_ID,
  POSITION_IDS,
  SHIFTS_PER_HALF,
  SLOTS_PER_SHIFT,
  TOTAL_SHIFTS,
} from './constants.js';

/**
 * Is this player on the touchline for a given shift? Absent all day, not here
 * yet, or already gone home all answer no. Everything downstream — targets,
 * selection, the bench list — goes through this one predicate.
 */
export function isAvailableAt(player, shiftIndex) {
  if (!player || !player.isPresent) return false;
  const from = player.arriveShift || 0;
  const until = player.departShift == null ? TOTAL_SHIFTS : player.departShift;
  return shiftIndex >= from && shiftIndex < until;
}

/** Availability in plain words, for the roster-change sheet. */
export function availabilityLabel(player) {
  const from = player.arriveShift || 0;
  const until = player.departShift == null ? TOTAL_SHIFTS : player.departShift;
  if (!player.isPresent) return 'Out today';
  if (from === 0 && until === TOTAL_SHIFTS) return 'Full game';
  if (from > 0 && until === TOTAL_SHIFTS) return `From shift ${from + 1}`;
  if (from === 0) return `Through shift ${until}`;
  return `Shifts ${from + 1}-${until}`;
}

// ===========================================================================
// THE BALANCING ALGORITHM
// ---------------------------------------------------------------------------
// The output is an 8-shift x 9-position matrix:
//     lineup[shiftIndex] = { GK: playerId, LD: playerId, ... , RF: playerId }
//
// It is built in two stages:
//
//   STAGE 1 — GOALIE (hard constraint, runs first).
//     The 8 GK slots are handed out *only* to players who opted in with
//     `wantsGoalieToday`, in whole consecutive blocks so nobody plays keeper
//     for a random scattered minute here and there.
//
//   STAGE 2 — FIELD (greedy, shift by shift).
//     For each shift we (a) pick WHO plays using an equity-dominated score,
//     then (b) decide WHERE they play using a preference + continuity score.
//     Greedy-per-shift beats a global solver here because the coach can
//     regenerate or hand-override at any point and the result stays legible.
//
// Every rule the coach asked for maps to one weight below, and the weights are
// ordered so that EQUITY outranks CONTINUITY outranks PREFERENCE. Fair playing
// time is the promise; the rest is polish.
// ===========================================================================

const W = {
  /** Equity, expressed as URGENCY (see `urgencyOf`) rather than a raw shift
   *  count. Scaled so that one whole shift of deficit outweighs everything
   *  below it: equity wins, always. */
  URGENCY: 1000,
  /** "Nobody sits twice in a row." The push lands on benchStreak === 1 —
   *  a player who sat the LAST shift, because sitting them again is what
   *  creates the double-sit. Sized to beat continuity and break ties, but to
   *  lose to a genuine one-shift equity gap. */
  BENCH_SAT_ONE: 150,
  /** Already sat twice or more — now it is urgent regardless of equity. */
  BENCH_SAT_EXTRA: 300,
  /** Keeper field-time floor. Outranks plain urgency, because a kid who spent
   *  a half in goal being bored has a stronger claim on a field shift than a
   *  kid who is merely one shift light. Falls to zero the moment the floor is
   *  met, so it never runs away with the lineup. */
  KEEPER_FLOOR: 2500,
  /** Continuity: a player who just came on is nudged to stay for shift #2. */
  ON_FIELD_ONE: 40,
  /** ...but after 2 straight they get rotated off, unless equity says stay. */
  ON_FIELD_TWO_PLUS: -120,

  // --- position-level weights (stage 2b) ---
  PREFERRED_GROUP: 120,   // position family is on the player's preference list
  NO_PREFERENCE: 45,      // player listed nothing = happy anywhere
  SAME_POSITION: 90,      // exact same slot as last shift (the continuity rule)
  SAME_LINE: 18,          // at least the same line (D / Mid / Fwd)
  GROUP_REPEAT: -12,      // mild variety: stop stacking one kid at Center D
};

/** Deterministic PRNG (mulberry32) so a given seed always yields the same
 *  lineup — "Regenerate" bumps the seed to get a genuinely different one. */
function makeRng(seed) {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split `total` into `parts` whole consecutive blocks, as evenly as possible.
 *  splitEvenly(8, 3) -> [3, 3, 2]   splitEvenly(8, 4) -> [2, 2, 2, 2] */
function splitEvenly(total, parts) {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

// ---------------------------------------------------------------------------
// STAGE 1 — Goalie allocation
// ---------------------------------------------------------------------------
/**
 * @param volunteers  present players with wantsGoalieToday === true
 * @param fallbackPool present players (used only when nobody volunteers)
 * @param opts.singleKeeperBothHalves  answer to the "want both halves?" prompt
 * @param opts.seasonGkShifts  { [playerId]: shifts } — used to order keepers so
 *        the player who has kept least this season gets first pick of halves.
 * @returns { slots: string[8], warnings: string[] }
 */
export function allocateGoalies(volunteers, fallbackPool, opts = {}) {
  const { singleKeeperBothHalves = false, seasonGkShifts = {} } = opts;
  const slots = new Array(TOTAL_SHIFTS).fill(null);
  const warnings = [];

  // Fewest season GK shifts first — spreads the keeper load across the season.
  const byLeastKept = (list) =>
    [...list].sort(
      (a, b) =>
        (seasonGkShifts[a.id] || 0) - (seasonGkShifts[b.id] || 0) ||
        a.name.localeCompare(b.name)
    );

  let keepers = byLeastKept(volunteers);

  if (keepers.length === 0) {
    // Nobody raised their hand. Don't leave the net empty: draft the two
    // players who have kept the least this season and flag it loudly.
    keepers = byLeastKept(fallbackPool).slice(0, 2);
    if (keepers.length) {
      warnings.push(
        `No one volunteered for goalie. Drafted ${keepers
          .map((k) => k.name)
          .join(' & ')} (least GK time this season) — override on the Matrix tab.`
      );
    }
  }

  if (keepers.length === 0) return { slots, warnings };

  if (keepers.length === 1) {
    const only = keepers[0];
    if (singleKeeperBothHalves) {
      slots.fill(only.id); // all 8 shifts
    } else {
      // Requirement: a lone volunteer keeps for at least one full half.
      for (let s = 0; s < 4; s += 1) slots[s] = only.id;
      // Second half needs someone. Prefer the least-kept other player.
      const backup = byLeastKept(fallbackPool.filter((p) => p.id !== only.id))[0];
      for (let s = 4; s < TOTAL_SHIFTS; s += 1) slots[s] = (backup || only).id;
      if (backup) {
        warnings.push(
          `${only.name} keeps the 1st half. ${backup.name} was drafted for the 2nd — ` +
            `use "Goalie plays both halves" on Setup if ${only.name} wants all 60.`
        );
      }
    }
    return { slots, warnings };
  }

  // 2+ volunteers: whole consecutive blocks, biggest blocks to the least-kept.
  // 2 -> 4/4 (a half each) · 3 -> 3/3/2 · 4 -> 2/2/2/2 · 5 -> 2/2/2/1/1
  const active = keepers.slice(0, TOTAL_SHIFTS);
  if (keepers.length > TOTAL_SHIFTS) {
    warnings.push(
      `${keepers.length} players want goalie but there are only ${TOTAL_SHIFTS} shifts. ` +
        `${keepers.slice(TOTAL_SHIFTS).map((k) => k.name).join(', ')} did not get a turn.`
    );
  }
  const blocks = splitEvenly(TOTAL_SHIFTS, active.length);
  let cursor = 0;
  active.forEach((keeper, i) => {
    for (let n = 0; n < blocks[i]; n += 1) slots[cursor++] = keeper.id;
  });

  return { slots, warnings };
}

// ---------------------------------------------------------------------------
// STAGE 2 — Full matrix
// ---------------------------------------------------------------------------
/**
 * Build the whole 8 x 9 matrix — or re-plan the tail of one.
 *
 * @param players  full roster (availability is resolved here)
 * @param opts.fromShift    re-plan from this shift onward, preserving earlier
 *                          shifts exactly as played. 0 = plan the whole game.
 * @param opts.baseLineup   the lineup being re-planned (required when
 *                          fromShift > 0) — supplies the preserved history.
 * @returns { lineup, warnings, targets, present }
 */
export function generateLineup(players, opts = {}) {
  const {
    seed = 1,
    singleKeeperBothHalves = false,
    seasonGkShifts = {},
    fromShift = 0,
    baseLineup = null,
  } = opts;
  const rng = makeRng(seed);
  const replanning = fromShift > 0 && Array.isArray(baseLineup);

  const roster = players.filter((p) => p.isPresent);
  const warnings = [];
  if (roster.length === 0) {
    return { lineup: emptyLineup(), warnings: ['No players marked present.'], targets: {}, present: [] };
  }

  // --- Who is here, shift by shift ----------------------------------------
  const availableAt = (s) => roster.filter((p) => isAvailableAt(p, s));
  const countAt = Array.from({ length: TOTAL_SHIFTS }, (_, s) => availableAt(s).length);

  /**
   * FAIR SHARE, WEIGHTED BY AVAILABILITY.
   *
   * A player is entitled to an equal slice of each shift they are actually
   * present for, and nothing at all for the shifts they missed:
   *
   *     target[p] = sum over shifts p is available of (9 / players available)
   *
   * This is what makes late arrivals behave sensibly. A kid who turns up at
   * half time is owed a normal share of the FOUR shifts that are left — about
   * 2 — not a full game's worth crammed into the second half. Everyone who
   * was here from the start keeps the shifts they have already banked and
   * simply shares what remains. Early departures fall out of the denominator
   * the moment they leave, so the players still on the touchline absorb those
   * slots evenly.
   */
  const targets = {};
  roster.forEach((p) => {
    let t = 0;
    for (let s = 0; s < TOTAL_SHIFTS; s += 1) {
      if (isAvailableAt(p, s) && countAt[s] > 0) {
        t += Math.min(1, SLOTS_PER_SHIFT / countAt[s]); // can only fill one slot
      }
    }
    targets[p.id] = t;
  });

  const shortHanded = countAt.filter((n) => n > 0 && n < SLOTS_PER_SHIFT).length;
  if (shortHanded > 0) {
    warnings.push(
      `${shortHanded} shift(s) have fewer than ${SLOTS_PER_SHIFT} players available — ` +
        `those positions are left open. Fill them on the Matrix tab.`
    );
  }

  // --- STAGE 1: goalie ------------------------------------------------------
  let gkSlots;
  if (replanning) {
    // Keep the keeper plan; only repair it where it has become impossible.
    gkSlots = Array.from({ length: TOTAL_SHIFTS }, (_, s) => baseLineup[s]?.GK || null);
  } else {
    const alloc = allocateGoalies(
      roster.filter((p) => p.wantsGoalieToday && isAvailableAt(p, 0)),
      roster,
      { singleKeeperBothHalves, seasonGkShifts }
    );
    gkSlots = alloc.slots;
    warnings.push(...alloc.warnings);
  }

  const gkRepairs = {}; // collapsed into one warning per change, after the loop
  const gkCountSoFar = (id) => gkSlots.reduce((n, x) => n + (x === id ? 1 : 0), 0);
  const pickKeeper = (pool, s) => {
    if (!pool.length) return null;
    // Prefer whoever kept the previous shift, so blocks stay whole.
    const prev = s > 0 ? gkSlots[s - 1] : null;
    const carry = pool.find((p) => p.id === prev && gkCountSoFar(prev) < SHIFTS_PER_HALF);
    if (carry) return carry;
    return [...pool].sort(
      (a, b) =>
        gkCountSoFar(a.id) - gkCountSoFar(b.id) ||
        (seasonGkShifts[a.id] || 0) - (seasonGkShifts[b.id] || 0) ||
        a.name.localeCompare(b.name)
    )[0];
  };

  // Any GK slot from `fromShift` on whose keeper is no longer available has to
  // be re-filled. Preference order matters here: a volunteer who has not
  // already done a full half, THEN a drafted outfield player (fewest season GK
  // shifts), and only as a last resort a volunteer who has already kept 4.
  // Without that middle step, one kid losing their keeper partner means they
  // keep all 60 minutes — exactly the boredom this is meant to avoid.
  for (let s = Math.max(0, fromShift); s < TOTAL_SHIFTS; s += 1) {
    const current = roster.find((p) => p.id === gkSlots[s]);
    if (current && isAvailableAt(current, s)) continue;
    const pool = availableAt(s);
    const fresh = pool.filter((p) => p.wantsGoalieToday && gkCountSoFar(p.id) < SHIFTS_PER_HALF);
    const drafted = pool.filter((p) => gkCountSoFar(p.id) < SHIFTS_PER_HALF);
    const replacement = pickKeeper(
      fresh.length ? fresh : drafted.length ? drafted : pool,
      s
    );
    // Collect rather than warn per shift — one departure should not produce
    // four identical banners.
    if (current || replacement) {
      const key = `${current ? current.name : 'Open'}>${replacement ? replacement.name : 'nobody'}`;
      const entry = (gkRepairs[key] ||= {
        from: current ? current.name : null,
        to: replacement ? replacement.name : null,
        drafted: !!replacement && !replacement.wantsGoalieToday && !fresh.length,
        shifts: [],
      });
      entry.shifts.push(s + 1);
    }
    gkSlots[s] = replacement ? replacement.id : null;
  }

  Object.values(gkRepairs).forEach((r) => {
    const span = r.shifts.length === 1 ? `shift ${r.shifts[0]}` : `shifts ${r.shifts[0]}-${r.shifts[r.shifts.length - 1]}`;
    if (r.from) {
      warnings.push(
        `${r.from} is no longer available for ${span} in goal — ` +
          `${r.to || 'nobody'} takes over${r.drafted ? ' (drafted; no other volunteer was free)' : ''}.`
      );
    } else if (r.to) {
      warnings.push(`${r.to} picks up ${span} in goal${r.drafted ? ' (drafted)' : ''}.`);
    }
  });

  const gkTotal = {};
  gkSlots.forEach((id) => {
    if (id) gkTotal[id] = (gkTotal[id] || 0) + 1;
  });

  /** Field shifts a keeper is guaranteed — bigger for a full half in net. */
  const floorFor = (id) => {
    const n = gkTotal[id] || 0;
    if (n >= SHIFTS_PER_HALF) return KEEPER_FIELD_FLOOR_FULL_HALF;
    return n > 0 ? KEEPER_FIELD_FLOOR_PARTIAL : 0;
  };

  // --- STAGE 2: the field ---------------------------------------------------
  const st = {};
  roster.forEach((p) => {
    st[p.id] = {
      played: 0,
      fieldShifts: 0,
      benchStreak: 0,
      fieldStreak: 0,
      lastPos: null,
      samePosStreak: 0,
      groupCount: { Defense: 0, Midfield: 0, Forward: 0, Goalie: 0 },
    };
  });

  /** Roll a finished shift into the running trackers. */
  const applyShift = (shift, s) => {
    const assignedTo = {};
    POSITION_IDS.forEach((posId) => {
      if (shift[posId]) assignedTo[shift[posId]] = posId;
    });
    roster.forEach((p) => {
      const s0 = st[p.id];
      const posId = assignedTo[p.id];
      if (posId) {
        s0.played += 1;
        if (posId !== 'GK') s0.fieldShifts += 1;
        s0.fieldStreak += 1;
        s0.benchStreak = 0;
        s0.samePosStreak = s0.lastPos === posId ? s0.samePosStreak + 1 : 1;
        s0.lastPos = posId;
        s0.groupCount[POSITION_BY_ID[posId].group] += 1;
      } else if (isAvailableAt(p, s)) {
        s0.benchStreak += 1;
        s0.fieldStreak = 0;
        s0.samePosStreak = 0;
        s0.lastPos = null;
      } else {
        // Not here — sitting in a car park is not "benched", so no streak.
        s0.benchStreak = 0;
        s0.fieldStreak = 0;
        s0.samePosStreak = 0;
        s0.lastPos = null;
      }
    });
  };

  /** GK shifts this player is still owed from shift `s` onward. */
  const gkLeft = (playerId, s) => {
    let n = 0;
    for (let k = s; k < TOTAL_SHIFTS; k += 1) if (gkSlots[k] === playerId) n += 1;
    return n;
  };

  /**
   * URGENCY — the equity metric, and the one subtle idea in this file.
   *
   * The naive version ("rank by shifts played, counting future GK blocks")
   * compares a keeper's near-FINAL total against everyone else's PARTIAL
   * total. A player keeping the 2nd half looks like they already have 4
   * shifts at kickoff, so they sit the entire 1st half and finish the game
   * far behind. Real bug, caught on a 10-player roster.
   *
   * Urgency fixes the units by asking a rate question instead of a count
   * question: of the chances this player has LEFT, what fraction do they
   * still need?
   *
   *     needed        = their fair share - (shifts played + GK shifts owed)
   *     opportunities = shifts they are still available for, minus GK shifts
   *     urgency       = needed / opportunities
   *
   * The 2nd-half keeper needs 3.2 more from 4 open shifts (0.80); a field
   * player needs 7.2 from 8 (0.90). Comparable numbers, so they interleave
   * and everyone lands on the same total. A player already past their share
   * goes negative and drops to the back of the queue.
   *
   * Because `targets` is availability-weighted, this handles late arrivals
   * and early exits without any special-casing: a latecomer's share is small,
   * so they slot into the rotation rather than monopolising the second half.
   *
   * Keepers are the deliberate exception: the KEEPER floor term below lets
   * them run past their share so that time in goal never costs them their
   * field time. Equity is enforced strictly among everyone else.
   */
  const urgencyOf = (player, s, played) => {
    const owed = gkLeft(player.id, s);
    const needed = targets[player.id] - (played + owed);
    let chances = 0;
    for (let k = s; k < TOTAL_SHIFTS; k += 1) if (isAvailableAt(player, k)) chances += 1;
    return needed / Math.max(1, chances - owed);
  };

  const lineup = [];

  for (let s = 0; s < TOTAL_SHIFTS; s += 1) {
    // Shifts already played are history — copy them through untouched.
    if (replanning && s < fromShift) {
      const preserved = { ...baseLineup[s] };
      lineup.push(preserved);
      applyShift(preserved, s);
      continue;
    }

    const shift = {};
    POSITION_IDS.forEach((id) => {
      shift[id] = null;
    });

    const keeperId = gkSlots[s];
    if (keeperId) shift.GK = keeperId;

    // --- 2a. WHO plays this shift -------------------------------------------
    const candidates = availableAt(s).filter((p) => p.id !== keeperId);
    const need = Math.min(FIELD_POSITIONS.length, candidates.length);

    const ranked = candidates
      .map((p) => {
        const s0 = st[p.id];
        let score = 0;
        // Equity first, as a rate rather than a raw count (see urgencyOf).
        score += W.URGENCY * urgencyOf(p, s, s0.played);

        // Keeper field-time floor. A player who takes a turn in goal is still
        // owed real shifts out on the field. The ratio is SQUARED on purpose:
        // it stays quiet while there is plenty of game left and only becomes
        // decisive as the window closes. Linear was too loud too early — it
        // yanked a keeper who had just done 2 straight shifts in net right
        // back on instead of letting them breathe. Squared gives the rhythm a
        // coach expects: keep 0:00-15:00, sit 15:00-22:30, play 22:30-30:00.
        const floor = floorFor(p.id);
        if (floor > 0 && s0.fieldShifts < floor) {
          const owed = gkLeft(p.id, s);
          let chances = 0;
          for (let k = s; k < TOTAL_SHIFTS; k += 1) if (isAvailableAt(p, k)) chances += 1;
          const rate = (floor - s0.fieldShifts) / Math.max(1, chances - owed);
          score += W.KEEPER_FLOOR * rate * rate;
        }

        // Nobody sits twice in a row.
        score += W.BENCH_SAT_ONE * Math.min(s0.benchStreak, 1);
        score += W.BENCH_SAT_EXTRA * Math.max(0, s0.benchStreak - 1);
        // Continuity: finish a 2-shift run, then rotate.
        if (s0.fieldStreak === 1) score += W.ON_FIELD_ONE;
        if (s0.fieldStreak >= 2) score += W.ON_FIELD_TWO_PLUS;
        // Stable tie-break so equal players don't always lose to alphabetics.
        score += rng() * 20;
        return { player: p, score };
      })
      .sort((a, b) => b.score - a.score);

    const onField = ranked.slice(0, need).map((r) => r.player);

    // --- 2b. WHERE they play -------------------------------------------------
    const open = new Set(FIELD_POSITIONS.map((p) => p.id));
    const unplaced = [];

    // Continuity pass: anyone staying on keeps their exact position, for up to
    // 2 consecutive shifts. This is what stops the "everybody rotate" chaos.
    onField.forEach((p) => {
      const s0 = st[p.id];
      const lp = s0.lastPos;
      if (lp && lp !== 'GK' && open.has(lp) && s0.samePosStreak < 2) {
        shift[lp] = p.id;
        open.delete(lp);
      } else {
        unplaced.push(p);
      }
    });

    // Preference pass: score every remaining (player, position) pair and take
    // the best ones greedily. 8x8 at most, so the cost is irrelevant and the
    // result is easy to reason about when a coach asks "why is he at Left D?".
    const pairs = [];
    unplaced.forEach((p) => {
      const s0 = st[p.id];
      open.forEach((posId) => {
        const pos = POSITION_BY_ID[posId];
        let score = 0;
        if (!p.preferredPositions || p.preferredPositions.length === 0) {
          score += W.NO_PREFERENCE;
        } else if (p.preferredPositions.includes(pos.group)) {
          score += W.PREFERRED_GROUP;
        }
        if (s0.lastPos === posId) score += W.SAME_POSITION;
        else if (s0.lastPos && POSITION_BY_ID[s0.lastPos].group === pos.group) score += W.SAME_LINE;
        score += W.GROUP_REPEAT * s0.groupCount[pos.group];
        score += rng() * 10;
        pairs.push({ pid: p.id, posId, score });
      });
    });
    pairs.sort((a, b) => b.score - a.score);

    const placed = new Set();
    pairs.forEach(({ pid, posId }) => {
      if (placed.has(pid) || !open.has(posId)) return;
      shift[posId] = pid;
      open.delete(posId);
      placed.add(pid);
    });

    lineup.push(shift);
    applyShift(shift, s);
  }

  return { lineup, warnings, targets, present: roster };
}

export function emptyLineup() {
  return Array.from({ length: TOTAL_SHIFTS }, () =>
    Object.fromEntries(POSITION_IDS.map((id) => [id, null]))
  );
}

// ---------------------------------------------------------------------------
// Derived data helpers
// ---------------------------------------------------------------------------

/** Players who are here for this shift but not on the field. */
export function benchForShift(lineup, presentPlayers, shiftIndex) {
  const shift = lineup?.[shiftIndex] || {};
  const on = new Set(Object.values(shift).filter(Boolean));
  return presentPlayers.filter((p) => !on.has(p.id) && isAvailableAt(p, shiftIndex));
}

/** Per-player totals for one game: total shifts + a breakdown by line. */
export function computeGameStats(lineup, players) {
  const stats = {};
  players.forEach((p) => {
    stats[p.id] = { id: p.id, name: p.name, total: 0, GK: 0, Defense: 0, Midfield: 0, Forward: 0 };
  });
  (lineup || []).forEach((shift) => {
    POSITION_IDS.forEach((posId) => {
      const pid = shift?.[posId];
      if (!pid || !stats[pid]) return;
      stats[pid].total += 1;
      if (posId === 'GK') stats[pid].GK += 1;
      else stats[pid][POSITION_BY_ID[posId].group] += 1;
    });
  });
  return stats;
}

/** What actually changes between two shifts — drives the sub preview card. */
export function diffShifts(currentShift, nextShift) {
  const cur = {};
  const nxt = {};
  POSITION_IDS.forEach((posId) => {
    if (currentShift?.[posId]) cur[currentShift[posId]] = posId;
    if (nextShift?.[posId]) nxt[nextShift[posId]] = posId;
  });

  const goingOut = Object.keys(cur).filter((pid) => !(pid in nxt));
  const comingIn = Object.keys(nxt)
    .filter((pid) => !(pid in cur))
    .map((pid) => ({ pid, to: nxt[pid] }));
  const moving = Object.keys(nxt)
    .filter((pid) => pid in cur && cur[pid] !== nxt[pid])
    .map((pid) => ({ pid, from: cur[pid], to: nxt[pid] }));
  const staying = Object.keys(nxt).filter((pid) => pid in cur && cur[pid] === nxt[pid]);

  return { goingOut, comingIn, moving, staying };
}

/**
 * Position-by-position view of the next substitution — the form a coach can
 * actually call out at the touchline: "Left Mid, Calvin off, Leo on."
 * Each row is a position whose occupant changes, tagged with whether the
 * incoming player is coming off the bench (a true sub) or just sliding over
 * from another spot (a move).
 */
export function positionChanges(currentShift, nextShift) {
  const onNow = new Set(POSITION_IDS.map((id) => currentShift?.[id]).filter(Boolean));
  const onNext = new Set(POSITION_IDS.map((id) => nextShift?.[id]).filter(Boolean));

  return POSITION_IDS.filter((id) => (currentShift?.[id] || null) !== (nextShift?.[id] || null)).map(
    (id) => {
      const out = currentShift?.[id] || null;
      const incoming = nextShift?.[id] || null;
      return {
        posId: id,
        out,
        in: incoming,
        inFromBench: !!incoming && !onNow.has(incoming), // genuinely coming on
        outToBench: !!out && !onNext.has(out),           // genuinely coming off
      };
    }
  );
}

/**
 * Manual override. Putting `playerId` into `positionId` on `shiftIndex`:
 *   - if that player is already somewhere else in the same shift, the two
 *     players trade places (a true swap, never a duplicate);
 *   - if they were on the bench, the player they replace goes to the bench.
 * Passing playerId = null just empties the slot.
 */
export function applySwap(lineup, shiftIndex, positionId, playerId) {
  const next = lineup.map((shift) => ({ ...shift }));
  const shift = next[shiftIndex];
  const outgoing = shift[positionId] || null;

  if (playerId) {
    const existingPos = POSITION_IDS.find((id) => shift[id] === playerId);
    if (existingPos && existingPos !== positionId) shift[existingPos] = outgoing; // trade
  }
  shift[positionId] = playerId;
  return next;
}

/** True when the saved lineup no longer matches who is actually here — a kid
 *  showed up late or went home. Drives the "regenerate" nudge on the Live tab. */
export function isLineupStale(lineup, players) {
  if (!lineup || !lineup.length) return true;
  const used = new Set();
  lineup.forEach((shift) => POSITION_IDS.forEach((id) => shift?.[id] && used.add(shift[id])));
  if (used.size === 0) return true;
  const present = players.filter((p) => p.isPresent);
  const presentIds = new Set(present.map((p) => p.id));
  // An absent player is still scheduled, or a present player never plays.
  for (const id of used) if (!presentIds.has(id)) return true;
  if (present.length >= POSITION_IDS.length) {
    for (const p of present) if (!used.has(p.id)) return true;
  }
  return false;
}
