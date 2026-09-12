import { createRoster, SHIFTS_PER_HALF, POSITION_IDS, TOTAL_SHIFTS,
         KEEPER_FIELD_FLOOR_FULL_HALF, KEEPER_FIELD_FLOOR_PARTIAL } from '../src/lib/constants.js';
import { generateLineup, computeGameStats, benchForShift } from '../src/lib/lineup.js';

const buckets = {}; let dupes=0, spreadBad=0, games=0, worstSpread=0;
let restAfterBlock = { yes:0, no:0 };
for (const n of [10,11,12,13,14,15,16]) {
  for (const k of [1,2,3,4]) {
    for (let seed=0; seed<60; seed++) {
      const r = createRoster();
      r.slice(n).forEach(p=>p.isPresent=false);
      for (let i=0;i<k;i++) r[i].wantsGoalieToday = true;
      const { lineup } = generateLineup(r, { seed });
      const present = r.filter(p=>p.isPresent);
      const st = computeGameStats(lineup, present);
      games++;
      lineup.forEach(sh => { const ids = POSITION_IDS.map(x=>sh[x]).filter(Boolean); if (new Set(ids).size!==ids.length) dupes++; });

      // equity among NON-keepers
      const nk = present.filter(p=>st[p.id].GK===0).map(p=>st[p.id].total);
      if (nk.length) { const sp = Math.max(...nk)-Math.min(...nk); worstSpread=Math.max(worstSpread,sp); if (sp>1) spreadBad++; }

      present.filter(p=>st[p.id].GK>0).forEach(p => {
        const gkIdx = lineup.map((sh,i)=>sh.GK===p.id?i:-1).filter(i=>i>=0);
        const size = gkIdx.length;
        const floor = size >= SHIFTS_PER_HALF ? KEEPER_FIELD_FLOOR_FULL_HALF : KEEPER_FIELD_FLOOR_PARTIAL;
        const field = st[p.id].total - st[p.id].GK;
        const b = buckets[size] ||= { n:0, short:0, shortOtherHalf:0 };
        b.n++;
        if (field < floor) b.short++;
        const inH1 = gkIdx.every(i=>i<SHIFTS_PER_HALF), inH2 = gkIdx.every(i=>i>=SHIFTS_PER_HALF);
        if (size >= SHIFTS_PER_HALF && (inH1||inH2)) {
          const other = inH1 ? lineup.slice(SHIFTS_PER_HALF) : lineup.slice(0,SHIFTS_PER_HALF);
          const f = other.filter(sh=>POSITION_IDS.some(x=>x!=='GK'&&sh[x]===p.id)).length;
          if (f < KEEPER_FIELD_FLOOR_FULL_HALF) b.shortOtherHalf++;
        }
        // does a partial keeper get a rest right after their block?
        if (size === 2) {
          const after = gkIdx[gkIdx.length-1] + 1;
          if (after < TOTAL_SHIFTS) {
            const onAfter = POSITION_IDS.some(x=>lineup[after][x]===p.id);
            onAfter ? restAfterBlock.no++ : restAfterBlock.yes++;
          }
        }
      });
    }
  }
}
console.log(`games: ${games}  duplicate-player-in-shift: ${dupes}`);
console.log(`non-keeper spread >1: ${spreadBad} games (worst ${worstSpread})`);
console.log('\nGK block | keepers | below floor | full-half keepers short in OTHER half');
Object.keys(buckets).sort((a,b)=>a-b).forEach(k=>{
  const b=buckets[k];
  console.log(`  ${k}      |  ${String(b.n).padStart(5)}  |   ${String(b.short).padStart(5)}     |  ${b.shortOtherHalf}`);
});
console.log(`\n2-shift keepers resting immediately after their block: ${restAfterBlock.yes}/${restAfterBlock.yes+restAfterBlock.no}`);
