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

// ctx = { houses: [{n,name,title,matter,domain}], meanings: { key: {la,en,planet,nature,sig} } }
// sel = { kind:'house', house:1..12 } | { kind:'judge'|'witnessRight'|'witnessLeft' }
export function readShieldPosition(shield, sel, ctx){
  const keyOf = rows => rows.map(r=>r===1?'1':'0').join('');
  const M = rows => (ctx.meanings && ctx.meanings[keyOf(rows)]) || null;
  const judgeM = M(shield.judge.rows);
  const endWord = nat => ({good:'inclines to the good', ill:'inclines to the ill',
    mixed:'is of mixed temper, turning on its company', neutral:'rests passive, swayed by the figures around it'}[natWord(nat)] || 'is mixed');
  const judgeTail = () => judgeM
    ? `<p class="rjudge">Over the whole question the Judge is <b>${esc(judgeM.la)}</b> (${esc(judgeM.nature)}); the matter, in the end, ${endWord(judgeM.nature)}.</p>` : '';

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
           `<p class="rnat ${natWord(m.nature)}">${verdict}</p>` };
  }

  if(sel.kind==='witnessRight' || sel.kind==='witnessLeft'){
    const right = sel.kind==='witnessRight';
    const m = M(right ? shield.witnessRight.rows : shield.witnessLeft.rows);
    if(!m) return { title:'', body:'' };
    const lede = right ? 'Right Witness · the querent’s side, what leads in'
                       : 'Left Witness · the quesited’s side, what follows';
    return { title:lede, figureName:m.la,
      body:`<p class="rfig"><b>${esc(m.la)}</b> — ${esc(m.en)}. ${esc(m.sig)}</p>`+ judgeTail() };
  }
  return { title:'', body:'' };
}
