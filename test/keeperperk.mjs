import { createRoster, POSITION_IDS, POSITION_BY_ID, KEEPER_SHIELDED_FIELD_SHIFTS } from '../src/lib/constants.js';
import { generateLineup } from '../src/lib/lineup.js';

const bucket = () => ({ D:0, M:0, F:0, n:0, players:0, anyDef:0 });
const groups = { volunteerKeeper: bucket(), draftedKeeper: bucket(), defenceLovingKeeper: bucket(), outfielder: bucket() };
const byFieldShifts = {};

for (const n of [11,13,14,16]) for (const k of [0,1,2,3]) for (let seed=0; seed<40; seed++) {
  const r = createRoster();
  r.slice(n).forEach(p=>p.isPresent=false);
  for (let i=0;i<k;i++) r[i].wantsGoalieToday = true;
  // give everyone a preference; make one volunteer a defence-lover
  r.forEach((p,i)=>{ p.preferredPositions = [['Forward'],['Midfield'],['Forward'],[]][i%4]; });
  if (k>0) r[0].preferredPositions = ['Defense'];
  const { lineup } = generateLineup(r, { seed });
  const gkTotal = {}; lineup.forEach(s=>{ if(s.GK) gkTotal[s.GK]=(gkTotal[s.GK]||0)+1; });

  r.filter(p=>p.isPresent).forEach(p => {
    const field = lineup.map(sh=>POSITION_IDS.find(x=>sh[x]===p.id)).filter(x=>x&&x!=='GK');
    if (!field.length) return;
    const kept = (gkTotal[p.id]||0) > 0;
    const likesD = p.preferredPositions.includes('Defense');
    const key = !kept ? 'outfielder'
      : likesD ? 'defenceLovingKeeper'
      : p.wantsGoalieToday ? 'volunteerKeeper' : 'draftedKeeper';
    const g = groups[key];
    g.players++;
    let sawDef = false;
    field.forEach(pos => { const grp = POSITION_BY_ID[pos].group;
      g[grp==='Defense'?'D':grp==='Midfield'?'M':'F']++; g.n++;
      if (grp==='Defense') sawDef = true; });
    if (sawDef) g.anyDef++;
    if (key==='volunteerKeeper') {
      const b = (byFieldShifts[field.length] ||= { players:0, withDef:0 });
      b.players++; if (sawDef) b.withDef++;
    }
  });
}
const pc = (a,b)=>b?(100*a/b).toFixed(0).padStart(3)+'%':'  n/a';
console.log('SHARE OF OUTFIELD SHIFTS SPENT AT THE BACK');
Object.entries(groups).forEach(([k,v]) => {
  if (!v.n) return;
  console.log(`  ${k.padEnd(21)} D ${pc(v.D,v.n)}  M ${pc(v.M,v.n)}  F ${pc(v.F,v.n)}   (${v.players} players, ${pc(v.anyDef,v.players)} saw defence at all)`);
});
console.log(`\nVOLUNTEER KEEPERS — chance of any defensive shift, by how many outfield shifts they get`);
Object.keys(byFieldShifts).sort((a,b)=>a-b).forEach(k => {
  const b = byFieldShifts[k];
  console.log(`  ${k} outfield shift${k==='1'?' ':'s'}: ${pc(b.withDef,b.players)} played defence   (${b.players} players)`);
});
console.log(`\n(shield covers their first ${KEEPER_SHIELDED_FIELD_SHIFTS} outfield shifts)`);
