import { createRoster, LINES, needsSupportOn, POSITION_IDS, TOTAL_SHIFTS, SHIFTS_PER_HALF } from '../src/lib/constants.js';
import { generateLineup, computeGameStats, lineViolations, benchForShift } from '../src/lib/lineup.js';

// A realistic rec squad: a few strong, a few weak, most in the middle.
function rate(r) {
  const plan = {
    Hudson:['Anchor','Anchor'], Bear:['Anchor','Steady'], Morrison:['Steady','Anchor'],
    Colin:['Steady','Steady'], Henry:['Steady','Steady'], Sawyer:['Steady','Steady'],
    Ruben:['Steady','Steady'], Ari:['Steady','Steady'], Ethan:['Steady','Steady'],
    Calvin:['Steady','Steady'], Desmond:['Support','Steady'], Owen:['Steady','Support'],
    Daniel:['Support','Support'], Leo:['Support','Steady'], Madden:['Steady','Support'], Decker:['Support','Support'],
  };
  r.forEach(p => { const v = plan[p.name]; if (v) { p.offense = v[0]; p.defense = v[1]; } });
}

const measure = (applyRatings) => {
  let violations = 0, shifts = 0, prefHit = 0, prefTot = 0;
  let worstSpread = 0, dupes = 0, sits = 0, games = 0;
  for (const n of [11,13,14,16]) {
    for (const k of [1,2,3]) {
      for (let seed=0; seed<25; seed++) {
        const r = createRoster();
        r.slice(n).forEach(p=>p.isPresent=false);
        for (let i=0;i<k;i++) r[i].wantsGoalieToday = true;
        r.forEach((p,i)=>{ p.preferredPositions = [['Defense'],['Midfield'],['Forward'],[]][i%4]; });
        if (applyRatings) rate(r);
        const { lineup } = generateLineup(r, { seed });
        const present = r.filter(p=>p.isPresent);
        const byId = Object.fromEntries(present.map(p=>[p.id,p]));
        games++;
        lineup.forEach(sh => {
          shifts++;
          violations += lineViolations(sh, byId);
          const ids = POSITION_IDS.map(x=>sh[x]).filter(Boolean);
          if (new Set(ids).size !== ids.length) dupes++;
          POSITION_IDS.forEach(pos => {
            if (pos==='GK' || !sh[pos]) return;
            const p = byId[sh[pos]]; if (!p.preferredPositions.length) return;
            prefTot++;
            const g = LINES.find(l=>l.ids.includes(pos))?.group;
            if (p.preferredPositions.includes(g)) prefHit++;
          });
        });
        const st = computeGameStats(lineup, present);
        const nk = present.filter(p=>st[p.id].GK===0).map(p=>st[p.id].total);
        if (nk.length) worstSpread = Math.max(worstSpread, Math.max(...nk)-Math.min(...nk));
        const streak={}; present.forEach(p=>streak[p.id]=0);
        for (let s2=0;s2<TOTAL_SHIFTS;s2++){
          const b=new Set(benchForShift(lineup,present,s2).map(p=>p.id));
          present.forEach(p=>{ if(b.has(p.id)){streak[p.id]++; if(streak[p.id]>=2) sits++;} else streak[p.id]=0; });
        }
      }
    }
  }
  return { games, shifts, violations, perShift:(violations/shifts).toFixed(3),
           pref:(100*prefHit/prefTot).toFixed(0)+'%', worstSpread, dupes, sits };
};

console.log('WITHOUT ratings (everyone Steady — feature inert):');
console.log(' ', JSON.stringify(measure(false)));
console.log('\nWITH a realistic set of coach ratings:');
console.log(' ', JSON.stringify(measure(true)));

// Does a weak player lose playing time?  The thing that must not happen.
console.log('\nPLAYING TIME FOR THE WEAKEST PLAYERS (16 present, 2 keepers, 40 seeds)');
const totals = {};
for (let seed=0; seed<40; seed++) {
  const r = createRoster(); rate(r);
  r[0].wantsGoalieToday = true; r[5].wantsGoalieToday = true;
  const { lineup } = generateLineup(r, { seed });
  const st = computeGameStats(lineup, r);
  r.forEach(p => { (totals[p.name] ||= []).push(st[p.id].total); });
}
const avg = a => (a.reduce((x,y)=>x+y,0)/a.length).toFixed(2);
['Hudson','Bear','Colin','Daniel','Decker','Leo'].forEach(n =>
  console.log(`  ${n.padEnd(9)} avg ${avg(totals[n])} shifts  (min ${Math.min(...totals[n])}, max ${Math.max(...totals[n])})`));
