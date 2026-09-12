import {
  FIELD_POSITIONS,
  FIELD_POSITION_IDS,
  LINES,
  needsSupportOn,
  DRAFTED_KEEPER_MAX_SHIFTS,
  KEEPER_SHIELDED_FIELD_SHIFTS,
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
  /** Continuity of SELECTION, not position: a player who just came on is
   *  nudged to stay on the pitch for a second shift, then rotated off. This is
   *  about who plays, and is unrelated to where they stand. */
  ON_FIELD_ONE: 40,
  ON_FIELD_TWO_PLUS: -120,

  // --- position-level weights (stage 2b) ---
  PREFERRED_GROUP: 120,   // position family is on the player's preference list
  NO_PREFERENCE: 45,      // player listed nothing = happy anywhere
  /**
   * ROTATION. These used to be bonuses for staying put — the original brief
   * asked for a player to hold the same position for up to two shifts to keep
   * substitutions calm. In practice it produced kids who spent the whole game
   * in one spot, so they are now penalties and the ordering matters:
   *
   *   LINE_REPEAT outweighs PREFERRED_GROUP, so a player who prefers defence
   *   and has just played defence is moved elsewhere rather than parked there.
   *   Preference becomes a bias toward the line they like, not a home they
   *   never leave.
   *
   * They are penalties rather than hard bans on purpose: when the only open
   * slot is on the line they just left, they take it instead of a position
   * being left empty.
   */
  LINE_REPEAT: -200,      // same line (D / Mid / Fwd) as their last shift
  EXACT_REPEAT: -140,     // ...and the very same slot, on top of that
  GROUP_REPEAT: -35,      // cumulative: spread each player across all three lines
  /**
   * The thank-you for volunteering in goal: their first couple of outfield
   * shifts steer away from the back line, so a half spent keeping is not
   * followed by a half spent defending. Sized above LINE_REPEAT so that a
   * second shift in their preferred line still beats a trip to the back, but
   * left as a penalty rather than a ban — if the back line is genuinely where
   * the only gap is, they fill it rather than leave it open.
   */
  KEEPER_NOT_DEFENCE: -260,
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

/**
 * The only block shapes a keeper is ever given, both aligned to the run of
 * play: a FULL HALF, or half of a half. Nobody gets a single stray shift in
 * goal, and no block straddles half time.
 */
const HALF_BLOCKS = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
];
const QUARTER_BLOCKS = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
];

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
  const { singleKeeperBothHalves = false, seasonGkShifts = {}, rng = null } = opts;
  const slots = new Array(TOTAL_SHIFTS).fill(null);
  const warnings = [];
  const assign = (block, id) => block.forEach((s) => { slots[s] = id; });

  // One random key per player, drawn once so repeated sorts stay consistent.
  // In game one of a season nobody has any GK history, so every keeper ties —
  // and a plain name tie-break meant the drafted stand-in was whoever came
  // first alphabetically, every single time. Ari, forever.
  const tie = {};
  fallbackPool.forEach((p) => { tie[p.id] = rng ? rng() : 0; });

  // Fewest season GK shifts first. Time in goal is the chore nobody queues up
  // for, so the player who has done least of it this season is dealt the
  // biggest block — that is what levels the season GK column out over time.
  const byLeastKept = (list) =>
    [...list].sort(
      (a, b) =>
        (seasonGkShifts[a.id] || 0) - (seasonGkShifts[b.id] || 0) ||
        (tie[a.id] ?? 0) - (tie[b.id] ?? 0) ||
        a.name.localeCompare(b.name)
    );

  let keepers = byLeastKept(volunteers);

  /**
   * Spread the quarter blocks over whoever is available, so a drafted keeper
   * never does more than DRAFTED_KEEPER_MAX_SHIFTS in a row. Falls back to
   * cycling only if the squad is too small to field four different keepers.
   */
  const draftQuarters = (pool, blocks) => {
    const picked = [];
    blocks.forEach((block, i) => {
      const who = pool[i % pool.length];
      if (!who) return;
      assign(block, who.id);
      if (!picked.includes(who)) picked.push(who);
    });
    return picked;
  };

  if (keepers.length === 0) {
    // Nobody raised their hand. Don't leave the net empty — but don't hand
    // anyone half a match of a job they never asked for either: four drafted
    // keepers, 15 minutes each.
    const pool = byLeastKept(fallbackPool);
    if (pool.length === 0) return { slots, warnings };
    const picked = draftQuarters(pool, QUARTER_BLOCKS);
    warnings.push(
      `No one volunteered for goalie. Drafted ${picked.map((k) => k.name).join(', ')} ` +
        `for ${(DRAFTED_KEEPER_MAX_SHIFTS * 7.5).toFixed(0)} minutes each ` +
        `(least GK time this season) — override on the Matrix tab.`
    );
    return { slots, warnings };
  }

  // --- One keeper: a full half, or the whole game if they asked for it -----
  if (keepers.length === 1) {
    const only = keepers[0];
    if (singleKeeperBothHalves) {
      slots.fill(only.id);
      return { slots, warnings };
    }
    assign(HALF_BLOCKS[0], only.id);
    // The other half goes to drafted players in 15-minute turns, not to one
    // person for the whole 30.
    const pool = byLeastKept(fallbackPool.filter((p) => p.id !== only.id));
    if (pool.length === 0) {
      assign(HALF_BLOCKS[1], only.id);
      return { slots, warnings };
    }
    const picked = draftQuarters(pool, [QUARTER_BLOCKS[2], QUARTER_BLOCKS[3]]);
    warnings.push(
      `${only.name} keeps the 1st half. ${picked.map((k) => k.name).join(' and ')} ` +
        `${picked.length > 1 ? 'were' : 'was'} drafted for the 2nd, ` +
        `${(DRAFTED_KEEPER_MAX_SHIFTS * 7.5).toFixed(0)} minutes each — ` +
        `use "Goalie plays both halves" on Setup if ${only.name} wants all 60.`
    );
    return { slots, warnings };
  }

  // --- Two keepers: a half each --------------------------------------------
  if (keepers.length === 2) {
    assign(HALF_BLOCKS[0], keepers[0].id);
    assign(HALF_BLOCKS[1], keepers[1].id);
    return { slots, warnings };
  }

  // --- Three: a full half for the least-kept, a quarter each for the rest ---
  // 4 + 2 + 2 rather than 3 + 3 + 2, because a 3-shift block would have to
  // cross half time to stay contiguous.
  if (keepers.length === 3) {
    assign(HALF_BLOCKS[0], keepers[0].id);
    assign(QUARTER_BLOCKS[2], keepers[1].id);
    assign(QUARTER_BLOCKS[3], keepers[2].id);
    return { slots, warnings };
  }

  // --- Four or more: half of a half each, which is the floor ---------------
  const active = keepers.slice(0, QUARTER_BLOCKS.length);
  active.forEach((keeper, i) => assign(QUARTER_BLOCKS[i], keeper.id));

  if (keepers.length > QUARTER_BLOCKS.length) {
    warnings.push(
      `${keepers.length} players want goalie, but a keeper should get at least half ` +
        `a half — so only ${QUARTER_BLOCKS.length} can have a turn today. ` +
        `${keepers.slice(QUARTER_BLOCKS.length).map((k) => k.name).join(', ')} ` +
        `did not get one; they are first in line next game.`
    );
  }

  return { slots, warnings };
}

// ---------------------------------------------------------------------------
// STAGE 2 — Full matrix
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// COMPETITIVE BALANCE
// ---------------------------------------------------------------------------
// Rec football, so winning is not the point — but a 9-0 drubbing is not fun for
// anyone either, and the games the kids enjoy are the close ones. The coach
// buckets each player Anchor/Steady/Support at each end of the pitch, and the
// only thing those buckets do is keep two Support players off the same line at
// the same time — each of them gets an Anchor or a Steady beside them instead.
//
// Crucially this runs in the WHERE stage, never the WHO stage. Balance decides
// which shirt number a player stands behind; it has no vote on whether they
// are on the pitch. A weaker player gets exactly the same number of shifts as
// everyone else — they just do not get paired with the other weaker player on
// the same line. Equity is untouchable.

/** How many players over the limit of one Support player per line. */
export function lineViolations(shift, byId) {
  let total = 0;
  LINES.forEach(({ group, ids }) => {
    const weak = ids.filter((id) => shift[id] && needsSupportOn(byId[shift[id]], group)).length;
    if (weak > 1) total += weak - 1;
  });
  return total;
}

/** How many players are standing in a line they asked for. Used only to break
 *  ties between repairs, so balancing costs as little preference as possible. */
function preferenceHits(shift, byId) {
  return FIELD_POSITION_IDS.reduce((sum, id) => {
    const p = byId[shift[id]];
    if (!p || !p.preferredPositions?.length) return sum;
    return sum + (p.preferredPositions.includes(POSITION_BY_ID[id].group) ? 1 : 0);
  }, 0);
}

/**
 * Greedy assignment fills one slot at a time and cannot see what is about to
 * land next to it, so it sometimes finishes with two weak players side by side.
 * This is a small local search over the eight outfield slots that swaps pairs
 * until no swap improves matters — 28 candidate swaps per pass, four passes
 * maximum, which is nothing for eight positions.
 */
function repairLineBalance(shift, byId) {
  for (let pass = 0; pass < 4; pass += 1) {
    const current = lineViolations(shift, byId);
    if (current === 0) return;

    let best = null;
    for (let i = 0; i < FIELD_POSITION_IDS.length; i += 1) {
      for (let j = i + 1; j < FIELD_POSITION_IDS.length; j += 1) {
        const a = FIELD_POSITION_IDS[i];
        const b = FIELD_POSITION_IDS[j];
        if (!shift[a] || !shift[b]) continue;

        const tmp = shift[a];
        shift[a] = shift[b];
        shift[b] = tmp;
        const after = lineViolations(shift, byId);
        const prefs = preferenceHits(shift, byId);
        shift[b] = shift[a];
        shift[a] = tmp;

        if (after >= current) continue;
        if (!best || after < best.after || (after === best.after && prefs > best.prefs)) {
          best = { a, b, after, prefs };
        }
      }
    }

    if (!best) return; // pairwise swaps exhausted — caller falls back to exact
    const tmp = shift[best.a];
    shift[best.a] = shift[best.b];
    shift[best.b] = tmp;
  }
}

/**
 * Exact fallback for the rare shift that pairwise swapping cannot fix.
 *
 * Swapping two players at a time gets stuck whenever escaping needs a
 * three-way rotation — measured at 12 shifts in 2,400, every one of which had
 * a perfect arrangement available. Eight players over eight slots is only 40k
 * permutations, and pruning on the partial assignment cuts that to almost
 * nothing, so when the cheap repair gives up we just solve it properly and
 * keep the balanced arrangement that also matches the most position
 * preferences. Node-budgeted so it can never stall a lineup build.
 */
function exactRepair(shift, byId) {
  const players = FIELD_POSITION_IDS.map((id) => shift[id]);
  if (players.some((p) => !p)) return; // short-handed; nothing to permute
  const used = new Array(players.length).fill(false);
  const slot = {};
  let budget = 40_000;
  let best = null;

  const search = (i) => {
    if (budget-- <= 0) return;
    if (i === FIELD_POSITION_IDS.length) {
      const prefs = preferenceHits(slot, byId);
      if (!best || prefs > best.prefs) best = { prefs, arrangement: { ...slot } };
      return;
    }
    for (let j = 0; j < players.length; j += 1) {
      if (used[j]) continue;
      used[j] = true;
      slot[FIELD_POSITION_IDS[i]] = players[j];
      // Violations only ever grow as slots fill, so a partial breach prunes.
      if (lineViolations(slot, byId) === 0) search(i + 1);
      used[j] = false;
      slot[FIELD_POSITION_IDS[i]] = null;
    }
  };

  search(0);
  if (best) FIELD_POSITION_IDS.forEach((id) => { shift[id] = best.arrangement[id]; });
}

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
  const byId = Object.fromEntries(roster.map((p) => [p.id, p]));
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
      { singleKeeperBothHalves, seasonGkShifts, rng }
    );
    gkSlots = alloc.slots;
    warnings.push(...alloc.warnings);
  }

  /**
   * A keeper change into this shift straddles half time, so there is already a
   * five-minute break to pull a different jersey on. Benching someone for the
   * kit change here buys nothing and costs them a shift — and it was the sole
   * cause of every back-to-back bench sit measured across 450 games.
   */
  const handoverAtHalfTime = (s) => s === SHIFTS_PER_HALF;

  const gkRepairs = {}; // collapsed into one warning per change, after the loop
  const gkCountSoFar = (id) => gkSlots.reduce((n, x) => n + (x === id ? 1 : 0), 0);
  /** A volunteer may keep a half; anyone drafted is capped at 15 minutes. */
  const keeperCap = (player) =>
    player?.wantsGoalieToday ? SHIFTS_PER_HALF : DRAFTED_KEEPER_MAX_SHIFTS;
  const pickKeeper = (pool, s) => {
    if (!pool.length) return null;
    // Prefer whoever kept the previous shift, so blocks stay whole.
    const prev = s > 0 ? gkSlots[s - 1] : null;
    const carry = pool.find((p) => p.id === prev && gkCountSoFar(prev) < keeperCap(p));
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
    const fresh = pool.filter((p) => p.wantsGoalieToday && gkCountSoFar(p.id) < keeperCap(p));
    const drafted = pool.filter((p) => gkCountSoFar(p.id) < keeperCap(p));
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
      lastPos: null, // most recent appearance, NOT cleared by a bench shift
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
        s0.lastPos = posId;
        s0.groupCount[POSITION_BY_ID[posId].group] += 1;
      } else if (isAvailableAt(p, s)) {
        s0.benchStreak += 1;
        s0.fieldStreak = 0;
        // lastPos deliberately survives a rest — coming back on after one shift
        // off is not a reason to put someone straight back where they were.
      } else {
        // Not here — sitting in a car park is not "benched", so no streak.
        s0.benchStreak = 0;
        s0.fieldStreak = 0;
        s0.lastPos = null; // went home; nothing to rotate away from
      }
    });
  };

  /**
   * Shifts from `s` onward where this player could actually take a FIELD slot.
   * Three things disqualify a shift: they are not here, they are already in
   * goal, or they are sitting out to change into the keeper kit for the shift
   * after. That last one matters — without it the equity maths credits a
   * second-half keeper with a chance they will never be given, quietly
   * under-prioritising them until they run out of runway.
   */
  const fieldChancesFrom = (playerId, s) => {
    const player = byId[playerId];
    let n = 0;
    for (let k = s; k < TOTAL_SHIFTS; k += 1) {
      if (!isAvailableAt(player, k)) continue;
      if (gkSlots[k] === playerId) continue; // in goal
      // Kitting up / changing back out, except across half time when the
      // interval covers it.
      if (gkSlots[k + 1] === playerId && !handoverAtHalfTime(k + 1)) continue;
      if (k > 0 && gkSlots[k - 1] === playerId && !handoverAtHalfTime(k)) continue;
      n += 1;
    }
    return n;
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
    return needed / Math.max(1, fieldChancesFrom(player.id, s));
  };

  const kitClashes = []; // collapsed into one warning after the loop
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
    // KIT-CHANGE RULE. A keeper wears a different jersey and gloves, so the
    // player taking over in goal next shift cannot be out on the field this
    // shift — they would have to change at the touchline while everyone
    // waits. Benching them for the shift before their block gives them time
    // to get kitted up, so the restart is instant.
    //
    // This is a hard exclusion rather than a score penalty: a "mostly" honoured
    // kit change is no use to anyone, since the one time it breaks is the one
    // time the game stops. The only exception is a squad so thin that sitting
    // them would leave a position empty — being a player short on the field is
    // worse than a slow change, and the app says so.
    const nextKeeperId = s + 1 < TOTAL_SHIFTS ? gkSlots[s + 1] : null;
    const prevKeeperId = s > 0 ? gkSlots[s - 1] : null;

    let candidates = availableAt(s).filter((p) => p.id !== keeperId);

    // Both sides of a keeper change need a bench shift. Going IN is listed
    // first because it is the harder deadline — the new keeper has to be
    // dressed before the restart, whereas the one coming out can peel the
    // gloves off at their own pace. When the squad is too thin for both, the
    // one that survives is the one that would otherwise hold up the game.
    const kitChanges = [];
    if (nextKeeperId && nextKeeperId !== keeperId && !handoverAtHalfTime(s + 1)) {
      kitChanges.push(nextKeeperId);
    }
    if (prevKeeperId && prevKeeperId !== keeperId && !handoverAtHalfTime(s)) {
      kitChanges.push(prevKeeperId);
    }

    kitChanges.forEach((id) => {
      // Never buy a kit change with a second consecutive bench shift. Sitting
      // fifteen minutes straight is a worse outcome for a child than a slightly
      // slower restart, so the rest rule wins and the swap happens at the
      // touchline instead.
      if (st[id] && st[id].benchStreak >= 1) {
        kitClashes.push(byId[id]?.name);
        return;
      }
      const without = candidates.filter((p) => p.id !== id);
      if (without.length === candidates.length) return; // not in the pool anyway
      if (without.length >= FIELD_POSITIONS.length) candidates = without;
      else kitClashes.push(byId[id]?.name);
    });

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
          const rate = (floor - s0.fieldShifts) / Math.max(1, fieldChancesFrom(p.id, s));
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

    /**
     * NOBODY SITS TWICE RUNNING — a constraint, not a preference.
     *
     * Fifteen minutes on a bench is most of a half for a ten-year-old, and it
     * is never necessary: N - 9 players sit each shift and there are 8 outfield
     * slots waiting, so every one of them fits back on as long as the squad is
     * 17 or fewer. Anyone who sat the last shift therefore gets first claim on
     * this one, ahead of the equity ordering. Equity then decides among the
     * players who are left, which is where it belongs — it settles who is
     * rested next, not who is rested twice over.
     */
    const satLastShift = ranked.filter((x) => st[x.player.id].benchStreak >= 1);
    const restedRecently = ranked.filter((x) => st[x.player.id].benchStreak < 1);
    const onField = [...satLastShift, ...restedRecently].slice(0, need).map((r) => r.player);

    // --- 2b. WHERE they play -------------------------------------------------
    /**
     * Is this player owed the volunteer-keeper thank-you right now? They put
     * their hand up, they actually took a turn in goal, they have not used up
     * their shielded outfield shifts, and they are not someone who likes
     * defending anyway.
     */
    const isShielded = (p) =>
      p.wantsGoalieToday &&
      gkTotal[p.id] > 0 &&
      st[p.id].fieldShifts < KEEPER_SHIELDED_FIELD_SHIFTS &&
      !(p.preferredPositions || []).includes('Defense');

    const open = new Set(FIELD_POSITIONS.map((p) => p.id));
    // Everyone is placed by score. There is no longer a pass that pins players
    // to the spot they held last shift: that pass, combined with the old
    // SAME_POSITION bonus below it, is what produced kids standing at Left D
    // for seven shifts running.
    const unplaced = [...onField];

    // Preference pass: score every remaining (player, position) pair and take
    // the best ones greedily. 8x8 at most, so the cost is irrelevant and the
    // result is easy to reason about when a coach asks "why is he at Left D?".
    /** One (player, position) score. Pulled out so the rounds below share it. */
    const scorePair = (p, posId) => {
      const s0 = st[p.id];
      const pos = POSITION_BY_ID[posId];
      let score = 0;
      if (!p.preferredPositions || p.preferredPositions.length === 0) {
        score += W.NO_PREFERENCE;
      } else if (p.preferredPositions.includes(pos.group)) {
        score += W.PREFERRED_GROUP;
      }
      if (s0.lastPos && s0.lastPos !== 'GK') {
        if (POSITION_BY_ID[s0.lastPos].group === pos.group) score += W.LINE_REPEAT;
        if (s0.lastPos === posId) score += W.EXACT_REPEAT;
      }
      score += W.GROUP_REPEAT * s0.groupCount[pos.group];
      if (pos.group === 'Defense' && isShielded(p)) score += W.KEEPER_NOT_DEFENCE;
      score += rng() * 10;
      return score;
    };

    const placed = new Set();
    const take = ({ pid, posId }) => {
      shift[posId] = pid;
      open.delete(posId);
      placed.add(pid);
    };

    /** Would this put a second Support player on that line? */
    const wouldStack = (pid, posId) => {
      const { group, ids } = LINES.find((l) => l.ids.includes(posId)) || {};
      if (!group || !needsSupportOn(byId[pid], group)) return false;
      return ids.some((id) => shift[id] && needsSupportOn(byId[shift[id]], group));
    };

    /**
     * @param players    who to place this round
     * @param allowBack  may they be given a back-line slot?
     * @param respectBalance  honour the one-Support-per-line rule
     */
    const runRound = (players, allowBack, respectBalance) => {
      const pairs = [];
      players.forEach((p) => {
        if (placed.has(p.id)) return;
        open.forEach((posId) => {
          if (!allowBack && POSITION_BY_ID[posId].group === 'Defense') return;
          pairs.push({ pid: p.id, posId, score: scorePair(p, posId) });
        });
      });
      pairs.sort((a, b) => b.score - a.score);
      pairs.forEach((pair) => {
        if (placed.has(pair.pid) || !open.has(pair.posId)) return;
        if (respectBalance && wouldStack(pair.pid, pair.posId)) return;
        take(pair);
      });
    };

    // Volunteer keepers get FIRST REFUSAL on the non-defensive slots. A plain
    // scoring penalty was not enough: the greedy runs across every player at
    // once, so the midfield places were gone to other players' preferences
    // before the keeper's turn came round, and they landed at the back anyway.
    // Giving them their pick first is what actually delivers the thank-you.
    runRound(unplaced.filter(isShielded), false, true);

    // Everyone else, then a final pass that fills any hole left over — an open
    // position is worse than an unbalanced line or a keeper at the back.
    runRound(unplaced, true, true);
    runRound(unplaced, true, false);

    repairLineBalance(shift, byId);
    if (lineViolations(shift, byId) > 0) exactRepair(shift, byId);

    lineup.push(shift);
    applyShift(shift, s);
  }

  if (kitClashes.length) {
    const who = [...new Set(kitClashes.filter(Boolean))].join(', ');
    warnings.push(
      `${who} goes almost straight between the field and goal — a rest shift there ` +
        `would have meant sitting twice running, so allow a moment at the stoppage ` +
        `to swap the jersey and gloves.`
    );
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

  // Sort everything by where the player ENDS UP, in pitch order (forwards,
  // midfield, defence, keeper). That is the order a coach reads them out in,
  // so the panel can be shouted straight down the list.
  const byNewPosition = (a, b) => POSITION_IDS.indexOf(a.to) - POSITION_IDS.indexOf(b.to);

  const goingOut = Object.keys(cur).filter((pid) => !(pid in nxt));
  const comingIn = Object.keys(nxt)
    .filter((pid) => !(pid in cur))
    .map((pid) => ({ pid, to: nxt[pid] }))
    .sort(byNewPosition);
  const moving = Object.keys(nxt)
    .filter((pid) => pid in cur && cur[pid] !== nxt[pid])
    .map((pid) => ({ pid, from: cur[pid], to: nxt[pid] }))
    .sort(byNewPosition);
  const staying = Object.keys(nxt)
    .filter((pid) => pid in cur && cur[pid] === nxt[pid])
    .map((pid) => ({ pid, from: cur[pid], to: nxt[pid] }))
    .sort(byNewPosition);

  /**
   * Everyone who is ALREADY on the field and stays there, whether or not they
   * change spot — each tagged with `moved`. The switchers are the ones that
   * actually need shouting ("Desmond, Center Mid!"), but the coach also wants
   * to be able to run the whole back line by name, so the players holding
   * their position are in here too rather than being dropped.
   */
  const remaining = [
    ...moving.map((m) => ({ ...m, moved: true })),
    ...staying.map((m) => ({ ...m, moved: false })),
  ].sort(byNewPosition);

  return { goingOut, comingIn, moving, staying, remaining };
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

/**
 * A fingerprint of every Setup choice that feeds lineup generation: who is
 * here, when they arrive and leave, who wants goal, and the both-halves
 * answer. Stored beside the lineup so the app can tell whether the plan on
 * screen still reflects what the coach has since ticked.
 *
 * This exists because the old staleness check only looked at ATTENDANCE. Tick
 * a second goalie volunteer after building and nothing registered — no nudge,
 * no rebuild, and the original keeper pairing silently stood. Comparing the
 * generated output instead would have been wrong the other way, flagging every
 * deliberate manual swap on the Matrix as "out of date".
 */
export function planSignature(players, opts = {}) {
  const { singleKeeperBothHalves = false } = opts;
  const parts = players
    .filter((p) => p.isPresent)
    .map(
      (p) =>
        `${p.id}:${p.arriveShift || 0}:${p.departShift == null ? 'x' : p.departShift}:` +
        `${p.wantsGoalieToday ? 'gk' : '-'}:${p.offense || 'Steady'}/${p.defense || 'Steady'}`
    )
    .sort();
  return `${singleKeeperBothHalves ? 'both' : 'one'}|${parts.join(',')}`;
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
