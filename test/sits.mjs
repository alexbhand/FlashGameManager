import { createRoster, POSITION_IDS, TOTAL_SHIFTS, SHIFTS_PER_HALF } from '../src/lib/constants.js';
import { generateLineup, benchForShift, computeGameStats } from '../src/lib/lineup.js';

const build = (seed) => {
  const r = createRoster();
  r.slice(13).forEach(p => p.isPresent = false);
  r.find(p=>p.name==='Henry').wantsGoalieToday = true;
  r.find(p=>p.name==='Madden').wantsGoalieToday = true;
  return { r, ...generateLineup(r, { seed }) };
};
const { r, lineup } = build(1);
const n = Object.fromEntries(r.map(p=>[p.id,p.name]));
console.log('Reproducing: 13 present, Henry + Madden in goal\n');
r.filter(p=>p.isPresent).forEach(p => {
  const seq = lineup.map(sh => POSITION_IDS.find(x=>sh[x]===p.id) || '·');
  let mx=0, run=0;
  seq.forEach(x=>{ run = (x==='·') ? run+1 : 0; mx=Math.max(mx,run); });
  console.log(p.name.padEnd(10), seq.map(x=>x.padEnd(3)).join(' '), mx>=2 ? `  <-- OUT ${mx} SHIFTS RUNNING (${mx*7.5} min)` : '');
});

// how widespread is it?
let total=0, atHalfBoundary=0, keeperRelated=0, games=0, worstSpread=0;
for (const nn of [11,12,13,14,15,16]) for (const k of [1,2,3]) for (let seed=0; seed<25; seed++) {
  const rr = createRoster();
  rr.slice(nn).forEach(p=>p.isPresent=false);
  for (let i=0;i<k;i++) rr[i].wantsGoalieToday = true;
  const { lineup: lu } = generateLineup(rr, { seed });
  const present = rr.filter(p=>p.isPresent);
  games++;
  const gkAt = lu.map(s=>s.GK);
  const streak = {}; present.forEach(p=>streak[p.id]=0);
  for (let s=0;s<TOTAL_SHIFTS;s++){
    const bench = new Set(benchForShift(lu, present, s).map(p=>p.id));
    present.forEach(p=>{
      if (bench.has(p.id)) {
        if (streak[p.id] >= 1) {
          total++;
          if (s === SHIFTS_PER_HALF) atHalfBoundary++;
          if (gkAt[s+1]===p.id || (s>0 && gkAt[s-1]===p.id) || gkAt[s+2]===p.id) keeperRelated++;
        }
        streak[p.id]++;
      } else streak[p.id]=0;
    });
  }
  const st = computeGameStats(lu, present);
  const nk = present.filter(p=>st[p.id].GK===0).map(p=>st[p.id].total);
  if (nk.length) worstSpread = Math.max(worstSpread, Math.max(...nk)-Math.min(...nk));
}
console.log(`\nAcross ${games} games: ${total} back-to-back sits (${(total/games).toFixed(2)}/game)`);
console.log(`  of those, tied to a keeper changeover: ${keeperRelated}`);
console.log(`  non-keeper shift spread: ${worstSpread}`);
console.log(`\nFeasibility: with N present, ${'N-9'} players sit each shift and 8 field slots exist,`);
[11,13,16,17,18].forEach(N => console.log(`  N=${N}: ${N-9} sit, 8 slots -> nobody need sit twice? ${N-9<=8}`));
