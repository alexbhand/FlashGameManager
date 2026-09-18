import { createRoster, TOTAL_SHIFTS, POSITION_IDS, SHIFTS_PER_HALF } from '../src/lib/constants.js';
import { generateLineup } from '../src/lib/lineup.js';

const prefSets = [['Defense'],['Midfield'],['Forward'],['Defense','Midfield']];
let intoGoal = 0, outOfGoal = 0, handovers = 0, atHalfTime = 0, games = 0;
for (const n of [10,11,12,13,14,15,16]) {
  for (const k of [1,2,3,4]) {
    for (let seed = 0; seed < 40; seed++) {
      const r = createRoster();
      r.slice(n).forEach(p=>p.isPresent=false);
      for (let i=0;i<k;i++) r[i].wantsGoalieToday = true;
      r.forEach((p,i)=>{ p.preferredPositions = prefSets[i%4]; });
      const { lineup } = generateLineup(r, { seed });
      games++;
      for (let s = 1; s < TOTAL_SHIFTS; s++) {
        const gkNow = lineup[s].GK, gkPrev = lineup[s-1].GK;
        if (!gkNow || gkNow === gkPrev) continue;
        handovers++;
        const wasOnFieldBefore = POSITION_IDS.some(p => p !== 'GK' && lineup[s-1][p] === gkNow);
        if (wasOnFieldBefore) { intoGoal++; if (s === SHIFTS_PER_HALF) atHalfTime++; }
        const prevKeeperNowOnField = POSITION_IDS.some(p => p !== 'GK' && lineup[s][p] === gkPrev);
        if (prevKeeperNowOnField) outOfGoal++;
      }
    }
  }
}
console.log(`games: ${games}   keeper handovers: ${handovers}`);
console.log('NOTE: this is an aggregate over ALL handovers. Half-time handovers are');
console.log('      exempt from the kit rule by design, so a non-zero number here is');
console.log('      expected — run halftime.mjs, or split by boundary, for the');
console.log('      number that actually reflects the rule.');
console.log(`FIELD -> GOAL with no bench shift between: ${intoGoal}  (${(100*intoGoal/handovers).toFixed(0)}% of handovers)`);
console.log(`   of those, at the half-time break:       ${atHalfTime}`);
console.log(`GOAL -> FIELD with no bench shift between: ${outOfGoal}  (${(100*outOfGoal/handovers).toFixed(0)}% of handovers)`);
