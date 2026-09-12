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

// --- Line balance ----------------------------------------------------------
/**
 * Three buckets, not a 1-16 ranking. Ranking sixteen kids twice is thirty-two
 * fiddly drags on a phone, and it implies a precision no one has — whether the
 * 7th best defender is really better than the 8th is not a real question. The
 * thing a coach actually knows is "I don't want those two back there
 * together", and buckets say exactly that.
 *
 * The labels describe a ROLE IN A PAIRING, not a verdict on a child. A
 * Support player is one who plays better alongside an Anchor — which is the
 * only thing the algorithm does with this, and it is true of every kid on some
 * day. That matters because this screen lives on a phone that gets handed to
 * assistants and left face-up on a bench: read over a shoulder, "Support"
 * tells a ten-year-old nothing about themselves.
 *
 * Everyone starts Steady, so the feature does nothing at all until a coach
 * deliberately marks someone.
 */
export const BALANCE_LEVELS = ['Anchor', 'Steady', 'Support'];
export const DEFAULT_BALANCE = 'Steady';
export const BALANCE_VALUE = { Anchor: 2, Steady: 1, Support: 0 };

/** Older saves used blunter words; map them forward on read. */
export const LEGACY_BALANCE = { High: 'Anchor', Medium: 'Steady', Low: 'Support' };

/**
 * Which rating matters where. Defenders are judged on defending, forwards on
 * attacking, and midfielders on both ends at once — a midfield is where a
 * one-dimensional player is most exposed, so their two ratings are averaged
 * rather than taking the flattering one.
 */
export function balanceForLine(player, group) {
  const off = BALANCE_VALUE[player?.offense] ?? 1;
  const def = BALANCE_VALUE[player?.defense] ?? 1;
  if (group === 'Defense') return def;
  if (group === 'Forward') return off;
  return (off + def) / 2;
}

/** Plays better with an Anchor beside them, for the demands of that line. */
export const SUPPORT_THRESHOLD = 0.75;
export const needsSupportOn = (player, group) =>
  balanceForLine(player, group) < SUPPORT_THRESHOLD;

/** The three outfield lines, for balance checks. */
export const LINES = [
  { group: 'Defense', ids: ['LD', 'CD', 'RD'] },
  { group: 'Midfield', ids: ['LM', 'CM', 'RM'] },
  { group: 'Forward', ids: ['LF', 'RF'] },
];

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

/**
 * Hard cap on how long a DRAFTED keeper stands in goal — someone who never
 * asked for the job because too few (or no) players volunteered. Two shifts,
 * 15 minutes, and then it is somebody else's turn. A volunteer can take a full
 * half, or the whole game if they ask for it; nobody gets handed half a match
 * of a job they did not want.
 */
export const DRAFTED_KEEPER_MAX_SHIFTS = 2;

/**
 * How many of a volunteer keeper's outfield shifts are shielded from being
 * spent at the back. Standing in goal is already the defensive, unglamorous
 * job; putting the kid who volunteered for it straight into the back line for
 * the rest of their game is a poor thank-you, and a poor advert for
 * volunteering next week.
 *
 * The shield lapses after this many field shifts, which is what makes the
 * behaviour match a coach's instinct: a keeper with only two outfield shifts
 * should almost never spend one at the back, while one with three or more can
 * reasonably take a turn there like anybody else. It never applies to a player
 * who actually likes defending — if Defense is on their preference list they
 * are treated normally.
 */
export const KEEPER_SHIELDED_FIELD_SHIFTS = 2;
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
  // Season-long line-balance buckets. See BALANCE_LEVELS.
  offense: DEFAULT_BALANCE,
  defense: DEFAULT_BALANCE,
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
