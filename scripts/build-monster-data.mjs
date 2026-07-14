#!/usr/bin/env node
// build-monster-data.mjs — the Monster ↔ Moonshine dictionary (uni/data/monster.json).
//
// WHAT THIS IS. A "pastable dictionary of all the symmetries of the Monster" is,
// properly, its 194 CONJUGACY CLASSES — the distinct types of symmetry (elements
// identical up to change of basis; the group itself has ~8×10⁵³ elements, which
// can't be listed). "The correlating symmetries from the moonshine module" are
// the McKAY–THOMPSON SERIES: for each class g, the graded trace of g on the
// moonshine module V♮ is the Hauptmodul of a genus-zero group Γ_g, named by a
// Conway–Norton symbol (e.g. 2+, 3|3, 60+4,15,60). That symbol IS the moonshine
// datum for the class. 194 classes → 171 distinct symbols.
//
// PROVENANCE (this is a reference, so every row is sourced, not guessed):
//  • class → moonshine group symbol: the `moonshinegroups` table of
//    L. Le Bruyn, "The Monstrous Moonshine Picture", arXiv:1804.04127
//    (the Conway–Norton assignment). That table lists 172 labels resolving
//    193 classes.
//  • the 194 class names + orders were cross-checked against the ATLAS of Finite
//    Group Representations (Monster, brauer.maths.qmul.ac.uk). The one class the
//    moonshine table doesn't list separately is 56C — the algebraic conjugate of
//    56B, which shares its series 56|4+14. Adding it reconciles to exactly 194,
//    and the distinct-symbol count comes out to 171 — both textbook invariants.
//  • J-function coefficients: verified against the standard expansion.
//
// Output committed → the page is fully static.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'uni', 'data', 'monster.json');

// [class, order, Conway–Norton moonshine group symbol]
const ROWS = [
  ["1A",1,"1"],["2A",2,"2+"],["2B",2,"2-"],["3A",3,"3+"],["3B",3,"3-"],["3C",3,"3|3"],
  ["4A",4,"4+"],["4B",4,"4|2+"],["4C",4,"4-"],["4D",4,"4|2-"],["5A",5,"5+"],["5B",5,"5-"],
  ["6A",6,"6+"],["6B",6,"6+6"],["6C",6,"6+3"],["6D",6,"6+2"],["6E",6,"6-"],["6F",6,"6|3"],
  ["7A",7,"7+"],["7B",7,"7-"],["8A",8,"8+"],["8B",8,"8|2+"],["8C",8,"8|4+"],["8D",8,"8|2-"],
  ["8E",8,"8-"],["8F",8,"8|4-"],["9A",9,"9+"],["9B",9,"9-"],["10A",10,"10+"],["10B",10,"10+5"],
  ["10C",10,"10+2"],["10D",10,"10+10"],["10E",10,"10-"],["11A",11,"11+"],["12A",12,"12+"],
  ["12B",12,"12+4"],["12C",12,"12|2+"],["12D",12,"12|3+"],["12E",12,"12+3"],["12F",12,"12|2+6"],
  ["12G",12,"12|2+2"],["12H",12,"12+12"],["12I",12,"12-"],["12J",12,"12|6"],["13A",13,"13+"],
  ["13B",13,"13-"],["14A",14,"14+"],["14B",14,"14+7"],["14C",14,"14+14"],["15A",15,"15+"],
  ["15B",15,"15+5"],["15C",15,"15+15"],["15D",15,"15|3"],["16A",16,"16|2+"],["16B",16,"16-"],
  ["16C",16,"16+"],["17A",17,"17+"],["18A",18,"18+2"],["18B",18,"18+"],["18C",18,"18+9"],
  ["18D",18,"18-"],["18E",18,"18+18"],["19A",19,"19+"],["20A",20,"20+"],["20B",20,"20|2+"],
  ["20C",20,"20+4"],["20D",20,"20|2+5"],["20E",20,"20|2+10"],["20F",20,"20+20"],["21A",21,"21+"],
  ["21B",21,"21+3"],["21C",21,"21|3+"],["21D",21,"21+21"],["22A",22,"22+"],["22B",22,"22+11"],
  ["23A",23,"23+"],["23B",23,"23+"],["24A",24,"24|2+"],["24B",24,"24+"],["24C",24,"24+8"],
  ["24D",24,"24|2+3"],["24E",24,"24|6+"],["24F",24,"24|4+6"],["24G",24,"24|4+2"],["24H",24,"24|2+12"],
  ["24I",24,"24+24"],["24J",24,"24|12"],["25A",25,"25+"],["26A",26,"26+"],["26B",26,"26+26"],
  ["27A",27,"27+"],["27B",27,"27+"],["28A",28,"28|2+"],["28B",28,"28+"],["28C",28,"28+7"],
  ["28D",28,"28|2+14"],["29A",29,"29+"],["30A",30,"30+6,10,15"],["30B",30,"30+"],["30C",30,"30+3,5,15"],
  ["30D",30,"30+5,6,30"],["30E",30,"30|3+10"],["30F",30,"30+2,15,30"],["30G",30,"30+15"],
  ["31A",31,"31+"],["31B",31,"31+"],["32A",32,"32+"],["32B",32,"32|2+"],["33A",33,"33+11"],
  ["33B",33,"33+"],["34A",34,"34+"],["35A",35,"35+"],["35B",35,"35+35"],["36A",36,"36+"],
  ["36B",36,"36+4"],["36C",36,"36|2+"],["36D",36,"36+36"],["38A",38,"38+"],["39A",39,"39+"],
  ["39B",39,"39|3+"],["39C",39,"39+39"],["39D",39,"39+39"],["40A",40,"40|4+"],["40B",40,"40|2+"],
  ["40C",40,"40|2+20"],["40D",40,"40|2+20"],["41A",41,"41+"],["42A",42,"42+"],["42B",42,"42+6,14,21"],
  ["42C",42,"42|3+7"],["42D",42,"42+3,14,42"],["44A",44,"44+"],["44B",44,"44+"],["45A",45,"45+"],
  ["46A",46,"46+23"],["46B",46,"46+23"],["46C",46,"46+"],["46D",46,"46+"],["47A",47,"47+"],
  ["47B",47,"47+"],["48A",48,"48|2+"],["50A",50,"50+"],["51A",51,"51+"],["52A",52,"52|2+"],
  ["52B",52,"52|2+26"],["54A",54,"54+"],["55A",55,"55+"],["56A",56,"56+"],["56B",56,"56|4+14"],
  ["56C",56,"56|4+14"],["57A",57,"57|3+"],["59A",59,"59+"],["59B",59,"59+"],["60A",60,"60|2+"],
  ["60B",60,"60+"],["60C",60,"60+4,15,60"],["60D",60,"60+12,15,20"],["60E",60,"60|2+5,6,30"],
  ["60F",60,"60|6+10"],["62A",62,"62+"],["62B",62,"62+"],["66A",66,"66+"],["66B",66,"66+6,11,66"],
  ["68A",68,"68|2+"],["69A",69,"69+"],["69B",69,"69+"],["70A",70,"70+"],["70B",70,"70+10,14,35"],
  ["71A",71,"71+"],["71B",71,"71+"],["78A",78,"78+"],["78B",78,"78+6,26,39"],["78C",78,"78+6,26,39"],
  ["84A",84,"84|2+"],["84B",84,"84|2+6,14,21"],["84C",84,"84|3+"],["87A",87,"87+"],["87B",87,"87+"],
  ["88A",88,"88|2+"],["88B",88,"88|2+"],["92A",92,"92+"],["92B",92,"92+"],["93A",93,"93|3+"],
  ["93B",93,"93|3+"],["94A",94,"94+"],["94B",94,"94+"],["95A",95,"95+"],["95B",95,"95+"],
  ["104A",104,"104|4+"],["104B",104,"104|4+"],["105A",105,"105+"],["110A",110,"110+"],
  ["119A",119,"119+"],["119B",119,"119+"],
];

const SUPERSINGULAR = [2,3,5,7,11,13,17,19,23,29,31,41,47,59,71];

// derived per-class flags
const classes = ROWS.map(([cls, order, group]) => {
  const rec = { cls, order, group };
  if (group.includes('+')) rec.fricke = true;           // series is Atkin–Lehner (Fricke) invariant
  if (order > 1 && SUPERSINGULAR.includes(order) && /^[a-z]?$/i.test(cls.slice(String(order).length)) && !group.includes('|') && !group.includes(',')) {
    // prime-order Fricke class p+ tied to Ogg's supersingular-prime observation
    if (group === order + '+') rec.ogg = true;
  }
  if (cls === '56C') rec.note = 'algebraic conjugate of 56B (shares series 56|4+14); ATLAS-reconciled';
  return rec;
});

// hard invariants (fail the build if these ever break)
const distinct = new Set(classes.map(c => c.group)).size;
const orders = new Set(classes.map(c => c.order)).size;
if (classes.length !== 194) throw new Error(`expected 194 classes, got ${classes.length}`);
if (distinct !== 171) throw new Error(`expected 171 distinct series, got ${distinct}`);

const out = {
  title: 'Monstrous Moonshine — the 194 conjugacy classes of the Monster and their McKay–Thompson series',
  monster: {
    order: '808017424794512875886459904961710757005754368000000000',
    factorization: '2⁴⁶ · 3²⁰ · 5⁹ · 7⁶ · 11² · 13³ · 17 · 19 · 23 · 29 · 31 · 41 · 47 · 59 · 71',
    classes: classes.length,
    distinctSeries: distinct,
    distinctOrders: orders,
  },
  mckay: '196884 = 196883 + 1  (the coefficient of q in J, and the dimension of the Monster’s smallest faithful representation plus the trivial one)',
  jFunction: {
    name: 'J(τ) = j(τ) − 744  =  T₁ (the McKay–Thompson series of class 1A)',
    // [power of q, coefficient]
    coeffs: [[-1, 1], [0, 0], [1, 196884], [2, 21493760], [3, 864299970], [4, 20245856256], [5, 333202640600]],
    note: 'The graded dimensions of the moonshine module V♮; each coefficient is a small non-negative combination of Monster irreducible-representation dimensions (1, 196883, 21296876, 842609326, …).',
  },
  supersingularPrimes: SUPERSINGULAR,
  notation: [
    ['n+', 'the Fricke group Γ₀(n)+ — Γ₀(n) extended by ALL its Atkin–Lehner involutions'],
    ['n−', 'Γ₀(n) itself (no Atkin–Lehner involution)'],
    ['n+e,f,…', 'Γ₀(n) extended by the Atkin–Lehner involutions w_e, w_f, …'],
    ['n|h', 'the “n given h” group — a rescaling by h (h | n, h | 24), no plus'],
    ['n|h+e,…', 'the n|h group extended by the listed Atkin–Lehner involutions'],
  ],
  sources: [
    ['class → moonshine group', 'L. Le Bruyn, “The Monstrous Moonshine Picture”, arXiv:1804.04127 (Conway–Norton assignment)'],
    ['194 classes + orders', 'ATLAS of Finite Group Representations — Monster (brauer.maths.qmul.ac.uk)'],
    ['origins', 'Conway & Norton, “Monstrous Moonshine”, Bull. LMS 11 (1979); McKay (1978); Borcherds (1992, proof)'],
  ],
  classes,
};

writeFileSync(OUT, JSON.stringify(out));
console.log(`✓ Monster ↔ Moonshine: ${classes.length} classes · ${distinct} distinct series · ${orders} distinct orders → uni/data/monster.json`);
console.log(`  Fricke classes: ${classes.filter(c => c.fricke).length} · Ogg supersingular-prime classes: ${classes.filter(c => c.ogg).length}`);
