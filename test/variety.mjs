import { createRoster, POSITION_IDS, TOTAL_SHIFTS, POSITION_BY_ID } from '../src/lib/constants.js';
import { generateLineup } from '../src/lib/lineup.js';

// 13 present, Henry + Madden want goal
const build = (seed) => {
  const r = createRoster();
  r.slice(13).forEach(p => p.isPresent = false);
  r.find(p=>p.name==='Henry').wantsGoalieToday = true;
  r.find(p=>p.name==='Madden').wantsGoalieToday = true;
  return { r, ...generateLineup(r, { seed }) };
};

const { r, lineup } = build(5);
const nameOf = Object.fromEntries(r.map(p=>[p.id,p.name]));
console.log('GK   :', lineup.map(s=>nameOf[s.GK].slice(0,7).padEnd(9)).join(''));
console.log();
r.filter(p=>p.isPresent).forEach(p => {
  const row = lineup.map(sh => (POSITION_IDS.find(k=>sh[k]===p.id) || '·').padEnd(9));
  const spots = lineup.map(sh => POSITION_IDS.find(k=>sh[k]===p.id)).filter(Boolean);
  const distinct = new Set(spots).size;
  let maxRun = 0, run = 0, prev = null;
  spots.forEach(s => { run = (s === prev) ? run+1 : 1; prev = s; maxRun = Math.max(maxRun, run); });
  console.log(p.name.padEnd(10), row.join(''), ` ${spots.length} shifts, ${distinct} distinct, longest run ${maxRun}`);
});

// how common is this across seeds?
let runs = {}, distinctHist = {};
for (const n of [11,13,14,16]) for (let seed=0; seed<40; seed++) {
  const r2 = createRoster();
  r2.slice(n).forEach(p=>p.isPresent=false);
  r2[0].wantsGoalieToday = true; r2[5].wantsGoalieToday = true;
  const { lineup: lu } = generateLineup(r2, { seed });
  r2.filter(p=>p.isPresent).forEach(p => {
    const spots = lu.map(sh => POSITION_IDS.find(k=>sh[k]===p.id)).filter(Boolean);
    const field = spots.filter(x=>x!=='GK');
    let maxRun=0, run=0, prev=null;
    field.forEach(s2=>{ run=(s2===prev)?run+1:1; prev=s2; maxRun=Math.max(maxRun,run); });
    runs[maxRun] = (runs[maxRun]||0)+1;
    if (field.length >= 3) distinctHist[new Set(field).size] = (distinctHist[new Set(field).size]||0)+1;
  });
}
console.log('\nAcross 160 games — longest run in ONE position (field only):');
Object.keys(runs).sort().forEach(k => console.log(`  ${k} consecutive: ${runs[k]} players`));
console.log('\nDistinct field positions seen, for players with 3+ field shifts:');
Object.keys(distinctHist).sort().forEach(k => console.log(`  ${k} distinct: ${distinctHist[k]} players`));
