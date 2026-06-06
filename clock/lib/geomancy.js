// ─────────────────────────────────────────────────────────────────────────────
// geomancy.js — the 16 geomantic figures and the tally that builds them.
//
// A figure is four lines, top→bottom: Fire, Air, Water, Earth. Each line is read
// from a row of dots: an ODD count leaves a SINGLE point (•, "active"); an EVEN
// count leaves a DOUBLE point (: , "passive"). We encode a row as 1 = single/active
// (odd) and 2 = double/passive (even). Four rows → one of the sixteen figures.
//
// Patterns verified against the standard tradition (Wikipedia "Geomantic figures";
// Greer, The Art and Practice of Geomancy): Puer has Fire/Air/Earth active & Water
// passive; Laetitia/Rubeus/Albus/Tristitia are the single-active Fire/Air/Water/Earth
// figures; reversion pairs (Puer↔Puella, Albus↔Rubeus, Caput↔Cauda, Acquisitio↔Amissio,
// Fortuna Major↔Minor) and inversion (Puer↔Albus, Via↔Populus) all hold. The sixteen
// rows below are the bijection onto all 16 four-bit combinations.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// rows = [Fire, Air, Water, Earth]; 1 = single point (odd/active), 2 = double (even/passive)
export const FIGURES = [
  { name:'Via',            gloss:'The Way',               rows:[1,1,1,1] },
  { name:'Cauda Draconis', gloss:'Tail of the Dragon',    rows:[1,1,1,2] },
  { name:'Puer',           gloss:'The Boy',               rows:[1,1,2,1] },
  { name:'Fortuna Minor',  gloss:'The Lesser Fortune',    rows:[1,1,2,2] },
  { name:'Puella',         gloss:'The Girl',              rows:[1,2,1,1] },
  { name:'Amissio',        gloss:'Loss',                  rows:[1,2,1,2] },
  { name:'Carcer',         gloss:'The Prison',            rows:[1,2,2,1] },
  { name:'Laetitia',       gloss:'Joy',                   rows:[1,2,2,2] },
  { name:'Caput Draconis', gloss:'Head of the Dragon',    rows:[2,1,1,1] },
  { name:'Acquisitio',     gloss:'Gain',                  rows:[2,1,2,1] },
  { name:'Coniunctio',     gloss:'Conjunction',           rows:[2,1,1,2] },
  { name:'Rubeus',         gloss:'Red',                   rows:[2,1,2,2] },
  { name:'Fortuna Major',  gloss:'The Greater Fortune',   rows:[2,2,1,1] },
  { name:'Albus',          gloss:'White',                 rows:[2,2,1,2] },
  { name:'Tristitia',      gloss:'Sorrow',                rows:[2,2,2,1] },
  { name:'Populus',        gloss:'The People',            rows:[2,2,2,2] },
];

export const ELEMENTS = ['Fire','Air','Water','Earth'];

// a line's dot-count → its row value (odd → single/active, even → double/passive)
export function rowValueFromCount(n){ return (n % 2 === 1) ? 1 : 2; }

// canonical key for a 4-row pattern (1 = active bit)
export function figureKey(rows){ return rows.map(r => r===1 ? '1' : '0').join(''); }

const BY_KEY = Object.fromEntries(FIGURES.map(f => [figureKey(f.rows), f]));

// look up the figure for a 4-row pattern ([Fire,Air,Water,Earth] of 1|2)
export function lookupFigure(rows){ return BY_KEY[figureKey(rows)] || null; }

// build a figure from four line dot-counts (top→bottom)
export function figureFromCounts(counts4){
  const rows = counts4.map(rowValueFromCount);
  return { rows, counts: counts4.slice(), figure: lookupFigure(rows) };
}

// the four Mothers from sixteen line counts (lines 0–3 = Mother I, etc.)
export function mothersFromCounts(counts16){
  const m = [];
  for (let i=0;i<4;i++) m.push(figureFromCounts(counts16.slice(i*4, i*4+4)));
  return m;
}

// total points in a figure (a single line = 1 point, a double = 2)
export function figurePoints(rows){ return rows.reduce((s,v)=> s + (v===1?1:2), 0); }

// adding two figures, row by row: a row is single iff exactly one of the two is single
// (single+double=odd→single; single+single & double+double=even→double). XOR on the active bits.
function addRows(a,b){ return a.map((v,i)=> ((v===1) ^ (b[i]===1)) ? 1 : 2); }
const wrap = rows => ({ rows: rows.slice(), figure: lookupFigure(rows) });

// the full geomantic shield from the four Mothers (each a figure with .rows).
// Daughters are the Mothers transposed (row j of every Mother becomes Daughter j);
// the Nieces, Witnesses, Judge and Reconciler are successive additions. The shield is
// read right-to-left (its Arabic origin); the Judge is the verdict, and — by the
// classical theorem — always carries an even number of points.
export function shield(mothers){
  const M = mothers.map(m => m.rows);
  const D = [0,1,2,3].map(j => [M[0][j], M[1][j], M[2][j], M[3][j]]);     // Daughters = transpose
  const N = [ addRows(M[0],M[1]), addRows(M[2],M[3]), addRows(D[0],D[1]), addRows(D[2],D[3]) ];
  const witnessRight = addRows(N[0], N[1]);     // the right witness, from the Mothers' side
  const witnessLeft  = addRows(N[2], N[3]);     // the left witness, from the Daughters' side
  const judge        = addRows(witnessRight, witnessLeft);
  const reconciler   = addRows(judge, M[0]);    // Judge + the First Mother (the optional 16th figure)
  return {
    mothers:   mothers.map(m => wrap(m.rows)),
    daughters: D.map(wrap),
    nieces:    N.map(wrap),
    witnessRight: wrap(witnessRight),
    witnessLeft:  wrap(witnessLeft),
    judge:        wrap(judge),
    reconciler:   wrap(reconciler),
  };
}

// ── the read: figures cast into the twelve houses, and a generated reading ──
// Borges/Yijing-style: we don't enumerate the millions of figure×house×judge texts,
// we COMPOSE each from the parts — the figure's signification, the house's province,
// the figure's nature, and the standing of the Judge and Witnesses. Deterministic.

// the 12 figures placed in the houses: Mothers→1–4, Daughters→5–8, Nieces→9–12
export function houseChart(shield){
  const figs = [...shield.mothers, ...shield.daughters, ...shield.nieces];
  return figs.map((f,i) => ({ house:i+1, rows:f.rows, figure:f.figure }));
}

const ORD = ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth'];
const natWord = nat => (nat||'').split(/[ ,(]/)[0] || 'mixed';
const esc = s => String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

// the geomantic aspect between two houses, by how many houses lie between them (companion
// "Geomantiæ" tract, Lib. II): conjunction 0, sextile 2, square 3, trine 4, opposition 6 apart.
const ASPECT_GAP = { 0:'conjunction', 2:'sextile', 3:'square', 4:'trine', 6:'opposition' };
function aspectBetween(h1, h2, ctx){
  const diff = ((h2-h1)%12+12)%12, m = Math.min(diff, 12-diff), key = ASPECT_GAP[m];
  if(!key) return null;
  return (((ctx&&ctx.aspects&&ctx.aspects.list)||[]).find(x=>x.key===key)) || { key, name:key, nature:'mixed' };
}

// ctx = { houses:[{n,name,title,matter,domain,sign,mode,la,en}],
//         meanings:{ key:{la,en,planet,nature,sig,mode,strength,domus} },
//         houseExtras:[{place:13|14|15,name,la,en}] }  // Witnesses + Judge, sourced
// sel = { kind:'house', house:1..12 } | { kind:'judge'|'witnessRight'|'witnessLeft' }
// Each line is SOURCED (Fludd's Latin+English, cited) or COMPOSED from his Regulæ (rulesLine).
export function readShieldPosition(shield, sel, ctx){
  const keyOf = rows => rows.map(r=>r===1?'1':'0').join('');
  const M = rows => (ctx.meanings && ctx.meanings[keyOf(rows)]) || null;
  const judgeM = M(shield.judge.rows);
  const endWord = nat => ({good:'inclines to the good', ill:'inclines to the ill',
    mixed:'is of mixed temper, turning on its company', neutral:'rests passive, swayed by the figures around it'}[natWord(nat)] || 'is mixed');
  const judgeTail = () => judgeM
    ? `<p class="rjudge">Over the whole question the Judge is <b>${esc(judgeM.la)}</b> (${esc(judgeM.nature)}); the matter, in the end, ${endWord(judgeM.nature)}.</p>` : '';
  // Fludd's own signification for this figure in this shield-place (houses 1–12, then
  // Right Witness = 13, Left Witness = 14, Judge = 15), Latin beside English, when we have it.
  const fluddAt = (m, idx) => (m && m.domus && m.domus[idx])
    ? `<div class="rfludd"><div class="la">${esc(m.domus[idx].la)}</div><div class="en">${esc(m.domus[idx].en)}</div>`+
      `<div class="rsrc">— Robert Fludd, Tractatus de Geomantia (1704)</div></div>` : '';
  // a place's own province, sourced — for the three further places (Witnesses 13/14, Judge 15)
  const placeFludd = place => {
    const x = (ctx.houseExtras||[]).find(e=>e.place===place);
    return x ? `<div class="rfludd"><div class="la">${esc(x.la)}</div><div class="en">${esc(x.en)}</div>`+
      `<div class="rsrc">— Fludd, Liber III, Cap. V (the houses)</div></div>` : '';
  };
  // L4 — Fludd's Regulæ, APPLIED (composed from his own data): the figure's strength, and the
  // concord of its mode (movable/fixed/common, read from its sign by Regula IV) with the house's.
  const concord = (fm, hm) => !fm||!hm ? null
    : fm===hm ? `${fm} figure in a ${fm} house — like with like, which by the rule strengthens its signification`
    : (fm==='common'||hm==='common') ? `a ${fm} figure in a ${hm} house — neither plainly concordant nor contrary`
    : `a ${fm} figure in a ${hm} house — fixed and movable cross, which by the rule weakens it in judgment`;
  const rulesLine = (m, H) => {
    const parts=[];
    if(m.strength) parts.push(`Fludd ranks <b>${esc(m.la)}</b> among the <b>${esc(m.strength)}</b> figures`);
    const c = concord(m.mode, H && H.mode); if(c) parts.push(c);
    return parts.length ? `<p class="rrule">${parts.join('; ')}. <span class="rsrc">— by Fludd’s Regulæ</span></p>` : '';
  };

  if(sel.kind==='house'){
    const hc = houseChart(shield).find(h=>h.house===sel.house);
    const m = M(hc.rows), H = ctx.houses[sel.house-1];
    if(!m||!H) return { title:'', body:'' };
    const nat = natWord(m.nature);
    const natLine = {
      good:    `A fortunate figure in this house — ${esc(H.matter)} is favoured.`,
      ill:     `An ill figure here — ${esc(H.matter)} is crossed or troubled.`,
      mixed:   `A figure of mixed temper — ${esc(H.matter)} turns on the company it keeps.`,
      neutral: `A passive figure — ${esc(H.matter)} waits, and takes the colour of the figures beside it.`,
    }[nat] || '';
    return { title:`The ${ORD[sel.house-1]} House · ${esc(H.name)} — ${esc(H.title)}`,
      figureName: m.la,
      body:`<p class="rdom">${esc(H.domain)}</p>`+
           `<p class="rfig">Here stands <b>${esc(m.la)}</b> — ${esc(m.en)}. ${esc(m.sig)}</p>`+
           fluddAt(m, sel.house-1)+
           rulesLine(m, H)+
           `<p class="rnat ${nat}">${natLine}</p>`+ judgeTail() };
  }

  if(sel.kind==='judge'){
    const m=judgeM, wR=M(shield.witnessRight.rows), wL=M(shield.witnessLeft.rows);
    if(!m) return { title:'', body:'' };
    const g=x=>natWord(x&&x.nature)==='good', b=x=>natWord(x&&x.nature)==='ill';
    let verdict;
    if(g(wR)&&g(wL))      verdict='Two fortunate Witnesses: the matter comes to a clear and happy end.';
    else if(b(wR)&&b(wL)) verdict='Two ill Witnesses: a hard road, and a doubtful end.';
    else                  verdict='Witnesses of mixed temper: a qualified outcome — '+(g(m)?'tending to the good':b(m)?'tending to the ill':'evenly poised')+'.';
    return { title:'The Judge · the verdict', figureName:m.la,
      body:`<p class="rfig"><b>${esc(m.la)}</b> — ${esc(m.en)}. ${esc(m.sig)}</p>`+
           placeFludd(15)+ fluddAt(m, 14)+
           `<p class="rnat ${natWord(m.nature)}">${verdict}</p>` };
  }

  if(sel.kind==='witnessRight' || sel.kind==='witnessLeft'){
    const right = sel.kind==='witnessRight';
    const m = M(right ? shield.witnessRight.rows : shield.witnessLeft.rows);
    if(!m) return { title:'', body:'' };
    const lede = right ? 'Right Witness · the querent’s side, what leads in'
                       : 'Left Witness · the quesited’s side, what follows';
    return { title:lede, figureName:m.la,
      body:`<p class="rfig"><b>${esc(m.la)}</b> — ${esc(m.en)}. ${esc(m.sig)}</p>`+
           placeFludd(right?13:14)+ fluddAt(m, right?12:13)+ judgeTail() };
  }
  return { title:'', body:'' };
}

// ── L7 — PERFECTION: does the question come to pass? (Fludd, Liber III, Cap. VI) ──
// We link the querent's significator (the figure in the 1st house) to the quesited's (the
// figure in the topic house) by Fludd's four connections — occupation, conjunction, mutation,
// translation. Detection is COMPOSED (a computational reading of his stated method); for each
// connection found we show Fludd's own SOURCED definition. Deterministic. ctx as above, plus
// ctx.perfection = { modes:[{key,name,la,en}] } (the sourced definitions).
export function perfection(shield, queryHouse, ctx){
  const HC = houseChart(shield);
  const keyOf = rows => rows.map(r=>r===1?'1':'0').join('');
  const k = h => keyOf(HC[h-1].rows);                 // figure-key in house h (1..12)
  const M = key => (ctx.meanings && ctx.meanings[key]) || null;
  const adj = (a,b) => Math.abs(a-b)===1;             // houses set side by side
  const allH = [1,2,3,4,5,6,7,8,9,10,11,12];
  const housesWith = key => allH.filter(h=>k(h)===key);
  const Q = 1, T = Math.max(1, Math.min(12, queryHouse|0));
  const qk = k(Q), tk = k(T), Ht = ctx.houses[T-1];
  const found = [];

  if(T!==Q){
    // 1) Occupation — the querent's own figure also stands in the quesited house
    if(qk===tk) found.push({key:'occupation', how:`<b>${esc(M(qk).la)}</b> — the querent’s own figure — also stands in the ${ORD[T-1]} house, the matter itself.`});
    // 2) Conjunction — a significator recurs in a house beside the other significator's house
    let c=null;
    for(const h of housesWith(qk)) if(h!==Q && adj(h,T)){ c=`<b>${esc(M(qk).la)}</b> (the querent) recurs in the ${ORD[h-1]} house, set beside the ${ORD[T-1]}.`; break; }
    if(!c) for(const h of housesWith(tk)) if(h!==T && adj(h,Q)){ c=`<b>${esc(M(tk).la)}</b> (the matter) recurs in the ${ORD[h-1]} house, set beside the first.`; break; }
    if(c) found.push({key:'conjunction', how:c});
    // 3) Mutation — the two significators meet together in two adjacent houses elsewhere
    if(qk!==tk) for(let h=1;h<12;h++){ const s=new Set([k(h),k(h+1)]); const orig=x=>x===Q||x===T;
      if(s.has(qk)&&s.has(tk)&&!(orig(h)&&orig(h+1))){ found.push({key:'mutation', how:`<b>${esc(M(qk).la)}</b> and <b>${esc(M(tk).la)}</b> meet together in the ${ORD[h-1]} and ${ORD[h]} houses.`}); break; } }
    // 4) Translation — a third figure stands beside both significators, carrying between them
    for(const x of new Set(allH.map(k))){ if(x===qk||x===tk) continue; const hs=housesWith(x);
      if(hs.some(h=>adj(h,Q))&&hs.some(h=>adj(h,T))){ found.push({key:'translation', how:`A third figure, <b>${esc(M(x).la)}</b>, stands beside both significators and carries between them.`}); break; } }
  }

  const perfects = found.length>0;
  const defOf = key => (ctx.perfection && ctx.perfection.modes||[]).find(m=>m.key===key) || null;
  const judge = M(keyOf(shield.judge.rows));
  let body = `<p class="rfig">Querent — the first house — is <b>${esc(M(qk).la)}</b> (${esc(M(qk).en)}). The matter — the ${ORD[T-1]} house, <b>${esc(Ht.name)}</b> (${esc(Ht.matter)}) — is <b>${esc(M(tk).la)}</b> (${esc(M(tk).en)}).</p>`;
  if(T===Q) return { title:'Perfection — the judgment', perfects:false,
    body: body + `<p class="rmuted">Choose a house other than the first as the matter asked about.</p>` };
  if(perfects){
    body += `<p class="rnat good">The question <b>perfects</b> — by ${found.map(f=>f.key).join(', ')}. The matter is brought to pass.</p>`;
    for(const f of found){ const d=defOf(f.key);
      body += `<p class="rfig">${f.how}</p>`+ (d?`<div class="rfludd"><div class="la">${esc(d.la)}</div><div class="en">${esc(d.en)}</div><div class="rsrc">— Fludd, Liber III, Cap. VI · ${esc(d.name)}</div></div>`:''); }
  } else {
    body += `<p class="rnat ill">The question does <b>not perfect</b>: by occupation, conjunction, mutation, or translation the two significators do not meet — the matter is not brought about of itself.</p>`;
  }
  // Cap. IV — where the querent's figure DOUBLES: Fludd's own meaning for each recurrence
  const dups = housesWith(qk).filter(h=>h!==Q);
  if(dups.length && ctx.doubling){
    body += `<p class="rfig">The querent’s figure <b>${esc(M(qk).la)}</b> doubles into the ${dups.map(h=>ORD[h-1]).join(', ')} house${dups.length>1?'s':''}${dups.includes(T)?' — including the matter’s own house':''}.</p>`;
    for(const h of dups){ const d=(ctx.doubling.places||[]).find(p=>p.place===h);
      if(d) body += `<div class="rfludd"><div class="la">${esc(d.la)}</div><div class="en">${esc(d.en)}</div><div class="rsrc">— Fludd, Liber II, Cap. IV (doubled figures)</div></div>`; }
  }
  // the aspect between the two houses colours the manner of the outcome
  const asp = aspectBetween(Q, T, ctx);
  if(asp){
    const word={good:'a favourable aspect, of friendship',ill:'a hard aspect, of enmity',strong:'conjunction — the strongest regard of all'}[asp.nature]||'an aspect';
    body += `<p class="rrule">The matter’s house stands in <b>${esc(asp.name.toLowerCase())}</b> to the first — ${word}.</p>`+
      (asp.la?`<div class="rfludd"><div class="la">${esc(asp.la)}</div><div class="en">${esc(asp.en)}</div><div class="rsrc">— Fasciculus Geomanticus, Geomantiæ tract, Lib. II (the aspects)</div></div>`:'');
  } else {
    body += `<p class="rrule">The matter’s house bears <b>no aspect</b> to the first — the two scarcely regard each other.</p>`;
  }
  if(judge) body += `<p class="rjudge">The Judge is <b>${esc(judge.la)}</b> (${esc(judge.nature)}); the manner of the end ${({good:'inclines to the good',ill:'inclines to the ill',mixed:'is mixed, turning on its company',neutral:'rests passive'}[natWord(judge.nature)]||'is mixed')}.</p>`;
  return { title:'Perfection — does the matter come to pass?', perfects, body };
}
