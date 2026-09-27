// A full-half keeper owes two outfield shifts in the other half. They should
// alternate (sit-play-sit-play) on a full squad, not bunch up in the middle.
// Before the fix: 15 present gave sit-play-play-sit in 400/400 games.
const ROOT = '../src/lib/';
const L = await import(ROOT + 'lineup.js'); const C = await import(ROOT + 'constants.js');
const { POSITION_IDS } = C;
const on = (shift, id) => POSITION_IDS.some((k) => shift[k] === id);
const pattern = (lineup, id, from, to) => lineup.slice(from, to).map((s) => (s.GK === id ? 'G' : on(s, id) ? 'X' : '·')).join('');

function run(label, setup, N = 400) {
  const keeperH2 = {}; let outfieldRuns = 0, outfieldStints = 0, sitsBackToBack = 0, maxSpread = 0;
  for (let seed = 1; seed <= N; seed++) {
    const r = C.createRoster().map((p) => ({ ...p })); setup(r);
    const { lineup } = L.generateLineup(r, { seed });
    const present = r.filter((p) => p.isPresent);
    const counts = present.map((p) => lineup.filter((s) => on(s, p.id)).length);
    // full-half keeper(s): their second (or first) outfield half pattern
    present.forEach((p) => {
      const h1 = pattern(lineup, p.id, 0, 4), h2 = pattern(lineup, p.id, 4, 8);
      if (h1 === 'GGGG') keeperH2[h2] = (keeperH2[h2] || 0) + 1;
      if (h2 === 'GGGG') keeperH2['(H1) ' + h1] = (keeperH2['(H1) ' + h1] || 0) + 1;
      const whole = pattern(lineup, p.id, 0, 8);
      if (/··/.test(whole)) sitsBackToBack++;
      if (!whole.includes('G')) { // pure outfielders: how many of their on-stints are 2+ in a row
        const stints = whole.split('·').filter(Boolean);
        outfieldStints += stints.length; outfieldRuns += stints.filter((x) => x.length >= 2).length;
      }
    });
    const nonGk = present.filter((p) => !lineup.some((s) => s.GK === p.id)).map((p) => lineup.filter((s) => on(s, p.id)).length);
    maxSpread = Math.max(maxSpread, Math.max(...nonGk) - Math.min(...nonGk));
  }
  const top = Object.entries(keeperH2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join('  ');
  console.log(`${label}\n  full-half keeper's other half: ${top}\n  outfielder stints that are 2+ shifts in a row: ${outfieldRuns}/${outfieldStints} (${(100*outfieldRuns/outfieldStints).toFixed(0)}%)  back-to-back sits: ${sitsBackToBack}  worst outfield spread: ${maxSpread}`);
}

run('15 present (Hudson out), Daniel the only volunteer', (r) => { r.find((p) => p.name === 'Hudson').isPresent = false; r.find((p) => p.name === 'Daniel').wantsGoalieToday = true; });
run('16 present, one volunteer', (r) => { r.find((p) => p.name === 'Daniel').wantsGoalieToday = true; });
run('13 present, one volunteer', (r) => { ['Hudson','Ari','Leo'].forEach((n) => r.find((p) => p.name === n).isPresent = false); r.find((p) => p.name === 'Daniel').wantsGoalieToday = true; });
