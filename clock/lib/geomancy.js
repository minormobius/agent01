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
