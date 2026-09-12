import { createRoster, POSITION_IDS, POSITION_BY_ID, TOTAL_SHIFTS } from '../src/lib/constants.js';
import { generateLineup, computeGameStats, lineViolations, benchForShift } from '../src/lib/lineup.js';

let posRepeat=0, lineRepeat=0, transitions=0;
let prefHit=0, prefTot=0, distinct={}, runs={};
let spread=0, dupes=0, sits=0, violations=0, shifts=0, subsWithMoves=0, moveCount=0, subTotal=0;

for (const n of [11,12,13,14,15,16]) for (const k of [1,2,3]) for (let seed=0; seed<25; seed++) {
  const r = createRoster();
  r.slice(n).forEach(p=>p.isPresent=false);
  for (let i=0;i<k;i++) r[i].wantsGoalieToday = true;
  r.forEach((p,i)=>{ p.preferredPositions = [['Defense'],['Midfield'],['Forward'],[]][i%4]; });
  const { lineup } = generateLineup(r, { seed });
  const present = r.filter(p=>p.isPresent);
  const byId = Object.fromEntries(present.map(p=>[p.id,p]));

  lineup.forEach(sh => {
    shifts++; violations += lineViolations(sh, byId);
    const ids = POSITION_IDS.map(x=>sh[x]).filter(Boolean);
    if (new Set(ids).size !== ids.length) dupes++;
    POSITION_IDS.forEach(pos => {
      if (pos==='GK'||!sh[pos]) return;
      const p = byId[sh[pos]]; if (!p.preferredPositions.length) return;
      prefTot++; if (p.preferredPositions.includes(POSITION_BY_ID[pos].group)) prefHit++;
    });
  });

  present.forEach(p => {
    const seq = lineup.map(sh => POSITION_IDS.find(x=>sh[x]===p.id) || null);
    let last = null;
    seq.forEach(pos => {
      if (!pos || pos==='GK') { if (pos==='GK') last=null; return; }
      if (last) { transitions++;
        if (last===pos) posRepeat++;
        if (POSITION_BY_ID[last].group===POSITION_BY_ID[pos].group) lineRepeat++; }
      last = pos;
    });
    const field = seq.filter(x=>x&&x!=='GK');
    if (field.length>=3) distinct[new Set(field).size] = (distinct[new Set(field).size]||0)+1;
    let mr=0,run=0,prev=null;
    field.forEach(x=>{run=(x===prev)?run+1:1;prev=x;mr=Math.max(mr,run);});
    if (field.length) runs[mr]=(runs[mr]||0)+1;
  });

  const st = computeGameStats(lineup, present);
  const nk = present.filter(p=>st[p.id].GK===0).map(p=>st[p.id].total);
  if (nk.length) spread = Math.max(spread, Math.max(...nk)-Math.min(...nk));
  const streak={}; present.forEach(p=>streak[p.id]=0);
  for (let s=0;s<TOTAL_SHIFTS;s++){
    const b=new Set(benchForShift(lineup,present,s).map(p=>p.id));
    present.forEach(p=>{ if(b.has(p.id)){streak[p.id]++; if(streak[p.id]>=2)sits++;} else streak[p.id]=0; });
  }
  // how much more shouting per sub?
  for (let s=0;s<TOTAL_SHIFTS-1;s++){
    const cur={},nxt={};
    POSITION_IDS.forEach(x=>{ if(lineup[s][x])cur[lineup[s][x]]=x; if(lineup[s+1][x])nxt[lineup[s+1][x]]=x; });
    const movers = Object.keys(nxt).filter(pid=>pid in cur && cur[pid]!==nxt[pid]).length;
    subTotal++; moveCount+=movers; if(movers>0) subsWithMoves++;
  }
}
console.log(`ROTATION (${transitions} back-to-back field transitions)`);
console.log(`  same exact position again: ${posRepeat} (${(100*posRepeat/transitions).toFixed(1)}%)`);
console.log(`  same LINE again:           ${lineRepeat} (${(100*lineRepeat/transitions).toFixed(1)}%)`);
console.log(`\nLongest run in one position:`, JSON.stringify(runs));
console.log(`Distinct positions (3+ field shifts):`, JSON.stringify(distinct));
console.log(`\nUNCHANGED GUARANTEES`);
console.log(`  non-keeper shift spread: ${spread}   duplicates: ${dupes}   stacked lines: ${violations}/${shifts}`);
console.log(`  position preference met: ${(100*prefHit/prefTot).toFixed(0)}%`);
console.log(`\nCOST AT THE TOUCHLINE`);
console.log(`  subs involving a position switch: ${subsWithMoves}/${subTotal} (${(100*subsWithMoves/subTotal).toFixed(0)}%)`);
console.log(`  average switchers per sub: ${(moveCount/subTotal).toFixed(1)}`);
