// fuzz the abilities part: candidate check.js vs an oracle written from the lexicon by a lent model (sonnet-5), fold fixed by Modulo
const [cand, orc, N0, S0] = process.argv.slice(2);
const { reportSheet } = await import(cand); const { abilitiesOracle } = await import(orc);
const N = +(N0 ?? 20000); let s = +(S0 ?? 1) >>> 0;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32), pick = a => a[Math.floor(rnd() * a.length)];
const base = { $type:'com.minomobi.gangs.sheet', game:{uri:'at://x',cid:'c'}, name:'N', playbook:'P', look:'l', drive:'d', controller:'agent', operator:'did:plc:abc',
 actions:[{action:'hunt',dots:2},{action:'study',dots:2},{action:'survey',dots:1},{action:'tinker',dots:1},{action:'finesse',dots:1}], createdAt:'2026-10-18T05:00:00Z' };
const STR = ['a','A','ß','SS','ss','ı','I','i','Ａ','  a  ','a b','a b','​','ㅤ','⠀','­','é','é','🫖','x'.repeat(64),'x'.repeat(65),'é'.repeat(300),'é'.repeat(301),'👨‍👩‍👧‍👦'.repeat(25),'Z'+'́'.repeat(700),'',null,7,['x'],{}];
const INT = [undefined,-1,0,1,2,3,8,9,16,17,1.5,'2',null,NaN];
const ab = () => pick([()=>({name:pick(STR),text:pick(STR)}),()=>({name:pick(STR)}),()=>({name:'ok',text:'ok',extra:1}),()=>null,()=>[],()=>'s'])();
const cls = {}; let dis = 0;
for (let i = 0; i < N; i++) {
  const n = pick([0,0,1,1,2,3,5,8,9]); const abl = pick([undefined, null, 'x', {}, Array.from({length:n}, ab)]);
  const rules = pick([undefined, {abilities:{atStart:pick(INT),max:pick(INT)}}]);
  const root = { uri:'at://x', cid:'c', rules: rules ?? {} };
  const rec = { ...base }; if (abl !== undefined) rec.abilities = abl;
  const c = reportSheet(rec, root).bad.filter(b => b.startsWith('abilities'));
  const o = abilitiesOracle(rec, root);
  if ((c.length === 0) !== (o.length === 0)) { dis++; const k = (c.length ? 'cand-fails ' : 'cand-passes ') + (c[0] ?? o[0]).replace(/\d+/g,'#').slice(0,60); if (!cls[k]) cls[k] = { n:0, ex: JSON.stringify({ab:rec.abilities, rules}).slice(0,220) }; cls[k].n++; }
}
console.log(`${N} cases, ${dis} disagreements`); for (const [k,v] of Object.entries(cls)) console.log(v.n, k, '\n   ', v.ex);
