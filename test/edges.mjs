import { createRoster, POSITION_IDS, TOTAL_SHIFTS } from '../src/lib/constants.js';
import { generateLineup, computeGameStats, benchForShift } from '../src/lib/lineup.js';

const run = (n, k, seed) => {
  const r = createRoster();
  r.slice(n).forEach(p => p.isPresent = false);
  for (let i = 0; i < k; i++) r[i].wantsGoalieToday = true;
  return { r, ...generateLineup(r, { seed }) };
};

console.log('ATTENDANCE EXTREMES');
for (const n of [0, 1, 5, 8, 9, 10]) {
  try {
    const { r, lineup, warnings, targets } = run(n, 1, 3);
    const present = r.filter(p => p.isPresent);
    const filled = lineup.reduce((a,s)=>a+POSITION_IDS.filter(x=>s[x]).length,0);
    const st = computeGameStats(lineup, present);
    const tot = present.map(p=>st[p.id].total);
    const bad = Object.values(targets).some(v => !Number.isFinite(v));
    console.log(`  ${String(n).padStart(2)} present: slots ${String(filled).padStart(2)}/72  spread ${tot.length?Math.max(...tot)-Math.min(...tot):'n/a'}  NaN/Inf targets: ${bad}  warnings ${warnings.length}`);
  } catch (e) { console.log(`  ${n} present: THREW ${e.message}`); }
}

console.log('\nGOALIE EXTREMES (16 present)');
for (const k of [0, 5, 8, 16]) {
  const { r, lineup, warnings } = run(16, k, 3);
  const st = computeGameStats(lineup, r.filter(p=>p.isPresent));
  const keepers = r.filter(p=>st[p.id].GK>0).map(p=>`${p.name}:${st[p.id].GK}`);
  const starved = r.filter(p=>p.isPresent && st[p.id].total === 0).map(p=>p.name);
  console.log(`  ${String(k).padStart(2)} volunteers: GK=[${keepers.join(' ')}] starved(0 shifts)=[${starved.join(',')||'none'}]`);
}

console.log('\nODD ROSTER SIZES — spread and back-to-back sits (60 seeds each)');
for (const n of [10,11,13,15]) {
  let worst = 0, sits = 0, games = 0;
  for (const k of [1,2,3,4]) for (let seed=0; seed<15; seed++) {
    const { r, lineup } = run(n, k, seed);
    const present = r.filter(p=>p.isPresent);
    const st = computeGameStats(lineup, present);
    const nk = present.filter(p=>st[p.id].GK===0).map(p=>st[p.id].total);
    if (nk.length) worst = Math.max(worst, Math.max(...nk)-Math.min(...nk));
    const streak = {}; present.forEach(p=>streak[p.id]=0);
    for (let s=0;s<TOTAL_SHIFTS;s++){
      const b = new Set(benchForShift(lineup, present, s).map(p=>p.id));
      present.forEach(p=>{ if(b.has(p.id)){ streak[p.id]++; if(streak[p.id]>=2) sits++; } else streak[p.id]=0; });
    }
    games++;
  }
  console.log(`  ${n} present: worst non-keeper spread ${worst}, back-to-back sits ${sits} across ${games} games (${(sits/games).toFixed(2)}/game)`);
}
