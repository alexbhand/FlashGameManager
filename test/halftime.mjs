import { createRoster, POSITION_IDS, TOTAL_SHIFTS, SHIFTS_PER_HALF } from '../src/lib/constants.js';
import { generateLineup, benchForShift } from '../src/lib/lineup.js';

let benchedBeforeHalf=0, ofThoseBackOnAtRestart=0;
let maxOutRun=0, outHist={};
let fieldToGoalNoBreak=0, goalToFieldNoBreak=0, handovers=0, halfTimeHandovers=0;
let games=0;

for (const n of [11,12,13,14,15,16]) for (const k of [1,2,3,4]) for (let seed=0; seed<20; seed++) {
  const r = createRoster();
  r.slice(n).forEach(p=>p.isPresent=false);
  for (let i=0;i<k;i++) r[i].wantsGoalieToday = true;
  const { lineup } = generateLineup(r, { seed });
  const present = r.filter(p=>p.isPresent);
  games++;
  const gkAt = lineup.map(s=>s.GK);

  // requirement: out for the last shift of the 1st half -> on for the first of the 2nd
  const benchAt3 = new Set(benchForShift(lineup, present, SHIFTS_PER_HALF-1).map(p=>p.id));
  const benchAt4 = new Set(benchForShift(lineup, present, SHIFTS_PER_HALF).map(p=>p.id));
  benchAt3.forEach(id => { benchedBeforeHalf++; if (!benchAt4.has(id)) ofThoseBackOnAtRestart++; });

  // longest continuous time off the pitch, anywhere in the game
  present.forEach(p => {
    let run=0;
    for (let s=0;s<TOTAL_SHIFTS;s++){
      const on = POSITION_IDS.some(x=>lineup[s][x]===p.id);
      run = on ? 0 : run+1;
      maxOutRun = Math.max(maxOutRun, run);
      if (!on) outHist[run] = (outHist[run]||0)+1;
    }
  });

  // kit-change cost
  for (let s=1;s<TOTAL_SHIFTS;s++){
    const g=gkAt[s], gp=gkAt[s-1];
    if (!g || g===gp) continue;
    handovers++;
    if (s === SHIFTS_PER_HALF) halfTimeHandovers++;
    if (POSITION_IDS.some(x=>x!=='GK'&&lineup[s-1][x]===g)) fieldToGoalNoBreak++;
    if (POSITION_IDS.some(x=>x!=='GK'&&lineup[s][x]===gp)) goalToFieldNoBreak++;
  }
}
console.log('REQUIREMENT: out before half time -> on for the restart');
console.log(`  players benched in the last shift of the 1st half: ${benchedBeforeHalf}`);
console.log(`  of those, on the pitch for the first shift back:   ${ofThoseBackOnAtRestart} (${(100*ofThoseBackOnAtRestart/benchedBeforeHalf).toFixed(0)}%)`);
console.log(`\nLONGEST CONTINUOUS TIME OFF THE PITCH: ${maxOutRun} shift(s) = ${maxOutRun*7.5} min`);
console.log('  distribution of consecutive-off runs:', JSON.stringify(outHist));
console.log(`\nKIT-CHANGE COST (${handovers} handovers, ${halfTimeHandovers} of them at half time)`);
console.log(`  field -> goal with no break: ${fieldToGoalNoBreak}  (${(100*fieldToGoalNoBreak/handovers).toFixed(0)}%)`);
console.log(`  goal -> field with no break: ${goalToFieldNoBreak}  (${(100*goalToFieldNoBreak/handovers).toFixed(0)}%)`);
console.log(`  (half-time handovers are exempt by design - the interval covers it)`);
