import { createRoster, TOTAL_SHIFTS } from '../src/lib/constants.js';
import { generateLineup, computeGameStats, isAvailableAt } from '../src/lib/lineup.js';
import { validateRoster } from '../src/lib/persistence.js';

// Guards the one promise the app makes: nobody marked present finishes a game
// with no shifts. Added after a live report of exactly that — a stale
// availability window survived from an abandoned game and was invisible on
// Setup, because the roster list only renders isPresent.

let games = 0, zeros = 0, unwarned = 0;
for (const n of [9, 10, 11, 12, 13, 14, 15, 16])
  for (const k of [0, 1, 2, 3, 4])
    for (let seed = 0; seed < 25; seed += 1) {
      const r = createRoster();
      r.slice(n).forEach((p) => { p.isPresent = false; });
      for (let i = 0; i < k; i += 1) r[i].wantsGoalieToday = true;
      const { lineup, warnings } = generateLineup(r, { seed });
      const st = computeGameStats(lineup, r.filter((p) => p.isPresent));
      games += 1;
      const z = r.filter((p) => p.isPresent && st[p.id].total === 0);
      if (z.length) {
        zeros += 1;
        if (!warnings.some((w) => /no shifts/.test(w))) unwarned += 1;
      }
    }
console.log(`${games} games · present players with zero shifts: ${zeros} · unwarned: ${unwarned}`);

// Impossible availability windows must not survive a read.
const impossible = [
  { arriveShift: 5, departShift: 3 },
  { arriveShift: 3, departShift: 3 },
  { arriveShift: 7, departShift: 1 },
];
let stuck = 0;
impossible.forEach((win) => {
  const healed = validateRoster([{ id: 'x', name: 'Test', isPresent: true, ...win }])[0];
  let avail = 0;
  for (let s = 0; s < TOTAL_SHIFTS; s += 1) if (isAvailableAt(healed, s)) avail += 1;
  if (avail === 0) stuck += 1;
});
console.log(`impossible windows that survive validateRoster: ${stuck} (must be 0)`);

// Legitimate windows must still be honoured.
const legit = validateRoster([{ id: 'y', name: 'T', isPresent: true, arriveShift: 4, departShift: null }])[0];
let n = 0;
for (let s = 0; s < TOTAL_SHIFTS; s += 1) if (isAvailableAt(legit, s)) n += 1;
console.log(`a genuine "arrives at shift 5" window still gives ${n}/8 shifts (must be 4)`);
