import { createRoster, POSITION_IDS } from '../src/lib/constants.js';
import { generateLineup, applyMatrixSwap } from '../src/lib/lineup.js';

// Fuzzes drag-and-drop on the matrix, where a drag can cross shifts as well as
// positions. Two invariants must survive every accepted swap: no player twice
// in one shift, and every shift still fielding nine. A refused swap must leave
// the lineup object untouched.

let tried = 0, applied = 0, refused = 0, breaks = 0, mutatedOnRefusal = 0;

for (let seed = 0; seed < 60; seed += 1) {
  const r = createRoster();
  r[4].wantsGoalieToday = true;
  r[14].wantsGoalieToday = true;
  let { lineup } = generateLineup(r, { seed });
  const nameOf = Object.fromEntries(r.map((p) => [p.id, p.name]));

  for (let k = 0; k < 40; k += 1) {
    const from = { shift: (Math.random() * 8) | 0, posId: POSITION_IDS[(Math.random() * 9) | 0] };
    const to = { shift: (Math.random() * 8) | 0, posId: POSITION_IDS[(Math.random() * 9) | 0] };
    const before = JSON.stringify(lineup);
    const res = applyMatrixSwap(lineup, from, to, nameOf);
    tried += 1;

    if (!res.ok) {
      refused += 1;
      if (JSON.stringify(res.lineup) !== before) mutatedOnRefusal += 1;
      continue;
    }

    applied += 1;
    lineup = res.lineup;
    const noDupes = lineup.every((s) => {
      const ids = POSITION_IDS.map((x) => s[x]).filter(Boolean);
      return new Set(ids).size === ids.length;
    });
    const allNine = lineup.every((s) => POSITION_IDS.filter((x) => s[x]).length === 9);
    if (!noDupes || !allNine) breaks += 1;
  }
}

console.log(`${tried} random drags · applied ${applied} · refused ${refused}`);
console.log(`invariant breaks after an accepted swap: ${breaks} (must be 0)`);
console.log(`lineup mutated despite refusal:          ${mutatedOnRefusal} (must be 0)`);
