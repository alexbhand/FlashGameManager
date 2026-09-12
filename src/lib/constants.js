// ---------------------------------------------------------------------------
// FLASH — league + game constants
// ---------------------------------------------------------------------------

/** The 9 players on the field. `group` is the general position family a player
 *  can express a preference for; GK is handled separately (daily opt-in). */
export const POSITIONS = [
  { id: 'LF', label: 'Left Fwd',   group: 'Forward',  line: 'FORWARDS' },
  { id: 'RF', label: 'Right Fwd',  group: 'Forward',  line: 'FORWARDS' },
  { id: 'LM', label: 'Left Mid',   group: 'Midfield', line: 'MIDFIELD' },
  { id: 'CM', label: 'Center Mid', group: 'Midfield', line: 'MIDFIELD' },
  { id: 'RM', label: 'Right Mid',  group: 'Midfield', line: 'MIDFIELD' },
  { id: 'LD', label: 'Left D',     group: 'Defense',  line: 'DEFENSE'  },
  { id: 'CD', label: 'Center D',   group: 'Defense',  line: 'DEFENSE'  },
  { id: 'RD', label: 'Right D',    group: 'Defense',  line: 'DEFENSE'  },
  { id: 'GK', label: 'Goalie',     group: 'Goalie',   line: 'KEEPER'   },
];

/** Matrix row order (top of the pitch down to the keeper). */
export const POSITION_IDS = POSITIONS.map((p) => p.id);
export const FIELD_POSITIONS = POSITIONS.filter((p) => p.id !== 'GK');
export const FIELD_POSITION_IDS = FIELD_POSITIONS.map((p) => p.id);
export const POSITION_BY_ID = Object.fromEntries(POSITIONS.map((p) => [p.id, p]));

/** Preference options offered on the setup screen. */
export const PREFERENCE_GROUPS = ['Defense', 'Midfield', 'Forward'];

// --- Game shape ------------------------------------------------------------
export const HALVES = 2;
export const HALF_MINUTES = 30;
export const SHIFTS_PER_HALF = 4;
export const TOTAL_SHIFTS = HALVES * SHIFTS_PER_HALF; // 8
export const HALF_MS = HALF_MINUTES * 60 * 1000; // 1,800,000
export const SHIFT_MS = HALF_MS / SHIFTS_PER_HALF; // 450,000 = 7:30
export const SLOTS_PER_SHIFT = POSITIONS.length; // 9
export const TOTAL_SLOTS = TOTAL_SHIFTS * SLOTS_PER_SHIFT; // 72

/**
 * Minimum OUT-FIELD shifts guaranteed to anyone who takes a turn in goal.
 * Standing in the net is not the same experience as playing, so keeper time
 * is not allowed to quietly consume a kid's whole game. The floor scales with
 * how much of a half they kept:
 *
 *   kept a FULL half (4 shifts) -> 2 field shifts, necessarily in the other
 *     half. This is the case that actually matters.
 *   kept PART of a half (1-3)   -> 1 field shift. Combined with the normal
 *     "rotate after 2 straight" rule this produces the natural rhythm: keep
 *     0:00-15:00, sit 15:00-22:30, back on the field 22:30-30:00.
 *
 * Keepers therefore finish with MORE total shifts than everyone else, on
 * purpose. Set both to 0 to treat a GK shift as just another shift.
 */
export const KEEPER_FIELD_FLOOR_FULL_HALF = 2;
export const KEEPER_FIELD_FLOOR_PARTIAL = 1;

export const ROSTER_NAMES = [
  'Hudson', 'Bear', 'Morrison', 'Colin', 'Henry', 'Sawyer', 'Ruben', 'Ari',
  'Ethan', 'Calvin', 'Desmond', 'Owen', 'Daniel', 'Leo', 'Madden', 'Decker',
];

/** Stable id derived from the name so a stored roster survives code changes. */
export const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const createPlayer = (name) => ({
  id: slugify(name),
  name,
  isPresent: true,          // attendance toggle, reset each game day
  preferredPositions: [],   // season-long: any of Defense / Midfield / Forward
  wantsGoalieToday: false,  // daily override that drives GK allocation
  // --- availability window, in shift indexes (0-7) ------------------------
  // Normally the whole game. A kid who turns up at half time gets
  // arriveShift: 4; one who leaves early (or picks up a knock) gets
  // departShift set to the first shift they are NOT available for.
  arriveShift: 0,
  departShift: null,        // null = here to the final whistle
});

export const createRoster = () => ROSTER_NAMES.map(createPlayer);

// --- localStorage keys -----------------------------------------------------
export const STORAGE_KEYS = {
  roster: 'flash.roster.v1',
  lineup: 'flash.lineup.v1',
  lineupMeta: 'flash.lineupMeta.v1',
  gameState: 'flash.gameState.v1',
  completedGames: 'flash.completedGames.v1',
  settings: 'flash.settings.v1',
};
