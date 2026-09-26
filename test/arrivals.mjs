import { createRoster, POSITION_IDS, TOTAL_SHIFTS, SHIFTS_PER_HALF } from '../src/lib/constants.js';
import { generateLineup, computeGameStats } from '../src/lib/lineup.js';

// A late arrival must never disturb the shift that is on the pitch.
//
// Added after a real game: two players absent, lineup built, nine children
// already standing in position, clock not yet started. Marking one arrival
// re-planned from shift 1 and moved eight of the nine, so the coach had to
// call everyone back. "Pre-kickoff" is not the same as "nobody is out there".

const arriveFrom = (globalShift) => Math.min(globalShift + 1, TOTAL_SHIFTS);

let cases = 0, disturbed = 0, noShifts = 0, dupes = 0;

for (const globalShift of [0, 1, 2, 3, 4, 5, 6]) {
  for (let seed = 0; seed < 30; seed += 1) {
    const r = createRoster();
    r.find((p) => p.name === 'Ari').isPresent = false;
    r.find((p) => p.name === 'Decker').isPresent = false;
    r.find((p) => p.name === 'Henry').wantsGoalieToday = true;
    r.find((p) => p.name === 'Madden').wantsGoalieToday = true;
    const { lineup: before } = generateLineup(r, { seed });

    const from = arriveFrom(globalShift);
    const after = r.map((p) =>
      p.name === 'Decker' ? { ...p, isPresent: true, arriveShift: from, departShift: null } : p
    );
    const { lineup } = generateLineup(after, { seed: seed + 1, fromShift: from, baseLineup: before });
    cases += 1;

    // every shift up to and including the one on the pitch must be identical
    for (let s = 0; s <= globalShift; s += 1) {
      if (JSON.stringify(lineup[s]) !== JSON.stringify(before[s])) disturbed += 1;
    }
    const d = after.find((p) => p.name === 'Decker');
    const st = computeGameStats(lineup, after.filter((p) => p.isPresent));
    if (from < TOTAL_SHIFTS && st[d.id].total === 0) noShifts += 1;
    if (lineup.some((s) => {
      const ids = POSITION_IDS.map((x) => s[x]).filter(Boolean);
      return new Set(ids).size !== ids.length;
    })) dupes += 1;
  }
}

console.log(`${cases} arrivals across every point in the game`);
console.log(`  shifts at or before the one on the pitch that changed: ${disturbed} (must be 0)`);
console.log(`  arrivals left with no shifts at all:                   ${noShifts} (must be 0)`);
console.log(`  lineups with a duplicated player:                      ${dupes} (must be 0)`);
