// hoop/forge/chem.js — THE MOLECULAR LAYER: real molecules, NAMED processes, considered endpoints.
//
// The element rings (ledger.js#elementCycle) used generic Refine→Fabricate→Assemble placeholders. This
// replaces them, per element, with the ACTUAL named industrial/biological processes operating on ACTUAL
// molecules — converging on the original /forge graph's named-process spirit, with a great many more
// details, and one new rigor: because real reactions BALANCE, conservation here is ATOM-EXACT (Σ in-atoms
// = Σ out-atoms per element), validated. Photosynthesis, Hall-Héroult, Haber-Bosch, carbothermic
// reduction — the real chemistry, atom-balanced, ending at considered endpoint products (catalogue.js).
//
// Pure, zero-dep. Tested in test/chem.selftest.mjs. Covers the major elements (C·N·O·H·Fe·Al·Si·Cu) with
// real named chemistry; the rest fall back to ledger.js's generic ring until enriched (extensible by data).

import { PRODUCT, productsWithElement, composition, LOOP } from './catalogue.js';

// ── molecules: id → { name, formula, el:{atom counts} }. el ties each molecule to the element ledger. ──
export const MOLECULES = {
  co2:       { name: 'Carbon dioxide', formula: 'CO₂',      el: { C: 1, O: 2 } },
  h2o:       { name: 'Water',          formula: 'H₂O',      el: { H: 2, O: 1 } },
  o2:        { name: 'Oxygen',         formula: 'O₂',       el: { O: 2 } },
  n2:        { name: 'Nitrogen',       formula: 'N₂',       el: { N: 2 } },
  h2:        { name: 'Hydrogen',       formula: 'H₂',       el: { H: 2 } },
  glucose:   { name: 'Glucose',        formula: 'C₆H₁₂O₆',  el: { C: 6, H: 12, O: 6 } },   // biomass / photosynthate proxy
  cfiber:    { name: 'Carbon fiber',   formula: 'C',        el: { C: 1 } },                // graphitic carbon
  ch4:       { name: 'Methane',        formula: 'CH₄',      el: { C: 1, H: 4 } },
  nh3:       { name: 'Ammonia',        formula: 'NH₃',      el: { N: 1, H: 3 } },
  hno3:      { name: 'Nitrate',        formula: 'HNO₃',     el: { H: 1, N: 1, O: 3 } },
  fe2o3:     { name: 'Hematite (ore)', formula: 'Fe₂O₃',    el: { Fe: 2, O: 3 } },
  fe:        { name: 'Iron',           formula: 'Fe',       el: { Fe: 1 } },
  al2o3:     { name: 'Alumina',        formula: 'Al₂O₃',    el: { Al: 2, O: 3 } },
  al:        { name: 'Aluminium',      formula: 'Al',       el: { Al: 1 } },
  sio2:      { name: 'Silica',         formula: 'SiO₂',     el: { Si: 1, O: 2 } },
  si:        { name: 'Silicon',        formula: 'Si',       el: { Si: 1 } },
  glass:     { name: 'Glass',          formula: 'SiO₂(am)', el: { Si: 1, O: 2 } },         // amorphous — same atoms, new phase
  co:        { name: 'Carbon monoxide',formula: 'CO',       el: { C: 1, O: 1 } },
  cuo:       { name: 'Copper ore',     formula: 'CuO',      el: { Cu: 1, O: 1 } },
  cu:        { name: 'Copper',         formula: 'Cu',       el: { Cu: 1 } },
};

// ── named REACTIONS: real, atom-balanced. in/out are {molecule: coefficient}. `kind` groups them for the
// renderer (bio/refine/recycle). Each is validated to conserve atoms. ──
export const REACTIONS = [
  { id: 'photosynthesis', name: 'Photosynthesis',          kind: 'bio',     in: { co2: 6, h2o: 6 }, out: { glucose: 1, o2: 6 } },
  { id: 'respiration',    name: 'Respiration',             kind: 'bio',     in: { glucose: 1, o2: 6 }, out: { co2: 6, h2o: 6 } },
  { id: 'carbonization',  name: 'Pyrolysis (carbonize)',   kind: 'refine',  in: { glucose: 1 }, out: { cfiber: 6, h2o: 6 } },         // C₆H₁₂O₆ → 6C + 6H₂O
  { id: 'methanogenesis', name: 'Anaerobic digestion',     kind: 'recycle', in: { glucose: 1 }, out: { ch4: 3, co2: 3 } },            // C₆H₁₂O₆ → 3CH₄ + 3CO₂
  { id: 'combustion_ch4', name: 'Methane oxidation',       kind: 'recycle', in: { ch4: 1, o2: 2 }, out: { co2: 1, h2o: 2 } },
  { id: 'haber',          name: 'Haber–Bosch',             kind: 'refine',  in: { n2: 1, h2: 3 }, out: { nh3: 2 } },
  { id: 'ostwald',        name: 'Ostwald (→ nitrate)',     kind: 'refine',  in: { nh3: 1, o2: 2 }, out: { hno3: 1, h2o: 1 } },
  { id: 'denitrify',      name: 'Denitrification',         kind: 'recycle', in: { hno3: 4 }, out: { n2: 2, o2: 5, h2o: 2 } },          // 4HNO₃ → 2N₂ + 5O₂ + 2H₂O
  { id: 'electrolysis',   name: 'Water electrolysis',      kind: 'refine',  in: { h2o: 2 }, out: { h2: 2, o2: 1 } },
  { id: 'iron_reduction', name: 'Direct reduction',        kind: 'refine',  in: { fe2o3: 2, cfiber: 3 }, out: { fe: 4, co2: 3 } },    // 2Fe₂O₃ + 3C → 4Fe + 3CO₂
  { id: 'hall_heroult',   name: 'Hall–Héroult',            kind: 'refine',  in: { al2o3: 2, cfiber: 3 }, out: { al: 4, co2: 3 } },    // 2Al₂O₃ + 3C → 4Al + 3CO₂
  { id: 'carbothermic',   name: 'Carbothermic reduction',  kind: 'refine',  in: { sio2: 1, cfiber: 2 }, out: { si: 1, co: 2 } },      // SiO₂ + 2C → Si + 2CO
  { id: 'glassmaking',    name: 'Glass melting',           kind: 'refine',  in: { sio2: 1 }, out: { glass: 1 } },                      // phase change
  { id: 'copper_smelt',   name: 'Smelting',                kind: 'refine',  in: { cuo: 2, cfiber: 1 }, out: { cu: 2, co2: 1 } },      // 2CuO + C → 2Cu + CO₂
];
export const REACTION = Object.fromEntries(REACTIONS.map((r) => [r.id, r]));

const atomsOf = (bag) => { const a = {}; for (const [m, c] of Object.entries(bag)) for (const [el, n] of Object.entries((MOLECULES[m] || { el: {} }).el)) a[el] = (a[el] || 0) + n * c; return a; };
export function reactionImbalance(r) {
  const inA = atomsOf(r.in), outA = atomsOf(r.out), els = new Set([...Object.keys(inA), ...Object.keys(outA)]); let max = 0;
  for (const el of els) max = Math.max(max, Math.abs((inA[el] || 0) - (outA[el] || 0)));
  return max;
}

// ── curated per-element CYCLES: named processes + molecular intermediates + considered endpoints, in ring
// order, with relative link weights (scaled to the element's ledger flow by chemCycle). A `ref` ties a
// process node to a REACTION (for the formula/balance); endpoints name considered catalogue products. ──
export const CYCLES = {
  C: {
    unit: 'kgC/day',
    nodes: [
      { id: 'co2', label: 'Atmosphere', mol: 'co2', kind: 'pool' },
      { id: 'photo', label: 'Photosynthesis', ref: 'photosynthesis', kind: 'biome' },
      { id: 'glucose', label: 'Biomass', mol: 'glucose', kind: 'biome' },
      { id: 'resp', label: 'Respiration', ref: 'respiration', kind: 'crew' },
      { id: 'pyro', label: 'Pyrolysis', ref: 'carbonization', kind: 'forge' },
      { id: 'cfiber', label: 'Carbon fiber', mol: 'cfiber', kind: 'forge' },
      { id: 'weave', label: 'Weaving', kind: 'process' },
      { id: 'struct', label: 'Hull · cable', endpoints: ['carbon_fiber', 'cf_cable'], kind: 'pump' },
    ],
    links: [
      { from: 'co2', to: 'photo', w: 1, kind: 'flow' }, { from: 'photo', to: 'glucose', w: 1, kind: 'flow' },
      { from: 'glucose', to: 'resp', w: 0.6, kind: 'flow' }, { from: 'resp', to: 'co2', w: 0.6, kind: 'recycle' },
      { from: 'glucose', to: 'pyro', w: 0.4, kind: 'flow' }, { from: 'pyro', to: 'cfiber', w: 0.4, kind: 'flow' },
      { from: 'cfiber', to: 'weave', w: 0.4, kind: 'flow' }, { from: 'weave', to: 'struct', w: 0.4, kind: 'flow' },
      { from: 'struct', to: 'co2', w: 0.4, kind: 'pump' },
    ],
  },
  Fe: {
    unit: 'kg/day',
    nodes: [
      { id: 'ore', label: 'Hematite', mol: 'fe2o3', kind: 'pool' },
      { id: 'reduce', label: 'Direct reduction', ref: 'iron_reduction', kind: 'process' },
      { id: 'fe', label: 'Iron', mol: 'fe', kind: 'material' },
      { id: 'form', label: 'Casting · rolling', kind: 'process' },
      { id: 'use', label: 'Frames · tools', endpoints: ['frame', 'tool', 'hull_plate'], kind: 'use' },
      { id: 'wear', label: 'Wear', kind: 'process' },
      { id: 'scrap', label: 'Scrap iron', mol: 'fe', kind: 'recover' },
      { id: 'eaf', label: 'Arc-furnace remelt', kind: 'recover' },
    ],
    // steady-state balanced: the bulk recycles (scrap → arc furnace → iron); the ~5% lost to wear
    // OXIDISES back to hematite (iron rusts to Fe₂O₃) and is re-reduced — so the ore pool loops too.
    links: [
      { from: 'ore', to: 'reduce', w: 0.05, kind: 'makeup' }, { from: 'reduce', to: 'fe', w: 0.05, kind: 'flow' },
      { from: 'fe', to: 'form', w: 1, kind: 'flow' }, { from: 'form', to: 'use', w: 1, kind: 'flow' },
      { from: 'use', to: 'wear', w: 1, kind: 'flow' }, { from: 'wear', to: 'scrap', w: 0.95, kind: 'flow' },
      { from: 'wear', to: 'ore', w: 0.05, kind: 'makeup' }, { from: 'scrap', to: 'eaf', w: 0.95, kind: 'flow' },
      { from: 'eaf', to: 'fe', w: 0.95, kind: 'recycle' },
    ],
  },
  Al: {
    unit: 'kg/day',
    nodes: [
      { id: 'alumina', label: 'Alumina', mol: 'al2o3', kind: 'pool' },
      { id: 'hh', label: 'Hall–Héroult', ref: 'hall_heroult', kind: 'process' },
      { id: 'al', label: 'Aluminium', mol: 'al', kind: 'material' },
      { id: 'form', label: 'Extrude · form', kind: 'process' },
      { id: 'use', label: 'Ducts · panels', endpoints: ['airduct', 'partition', 'pod'], kind: 'use' },
      { id: 'wear', label: 'Wear', kind: 'process' },
      { id: 'remelt', label: 'Remelt', kind: 'recover' },
    ],
    links: [
      { from: 'alumina', to: 'hh', w: 0.05, kind: 'makeup' }, { from: 'hh', to: 'al', w: 0.05, kind: 'flow' },
      { from: 'al', to: 'form', w: 1, kind: 'flow' }, { from: 'form', to: 'use', w: 1, kind: 'flow' },
      { from: 'use', to: 'wear', w: 1, kind: 'flow' }, { from: 'wear', to: 'remelt', w: 0.95, kind: 'flow' },
      { from: 'wear', to: 'alumina', w: 0.05, kind: 'makeup' }, { from: 'remelt', to: 'al', w: 0.95, kind: 'recycle' },
    ],
  },
  Si: {
    unit: 'kg/day',
    nodes: [
      { id: 'silica', label: 'Silica', mol: 'sio2', kind: 'pool' },
      { id: 'reduce', label: 'Carbothermic', ref: 'carbothermic', kind: 'process' },
      { id: 'si', label: 'Silicon', mol: 'si', kind: 'material' },
      { id: 'wafer', label: 'Czochralski → wafer', kind: 'process' },
      { id: 'chips', label: 'Chips · sensors', endpoints: ['chip', 'sensor'], kind: 'use' },
      { id: 'glassmaking', label: 'Glass melting', ref: 'glassmaking', kind: 'process' },
      { id: 'glass', label: 'Glass · panels', endpoints: ['lighting', 'partition'], kind: 'use' },
      { id: 'cullet', label: 'Cullet remelt', kind: 'recover' },
    ],
    links: [
      { from: 'silica', to: 'reduce', w: 0.5, kind: 'flow' }, { from: 'reduce', to: 'si', w: 0.5, kind: 'flow' },
      { from: 'si', to: 'wafer', w: 0.5, kind: 'flow' }, { from: 'wafer', to: 'chips', w: 0.5, kind: 'flow' },
      { from: 'silica', to: 'glassmaking', w: 0.5, kind: 'flow' }, { from: 'glassmaking', to: 'glass', w: 0.5, kind: 'flow' },
      { from: 'chips', to: 'cullet', w: 0.5, kind: 'flow' }, { from: 'glass', to: 'cullet', w: 0.5, kind: 'flow' },
      { from: 'cullet', to: 'silica', w: 1.0, kind: 'recycle' },
    ],
  },
  Cu: {
    unit: 'kg/day',
    nodes: [
      { id: 'ore', label: 'Copper ore', mol: 'cuo', kind: 'pool' },
      { id: 'smelt', label: 'Smelting', ref: 'copper_smelt', kind: 'process' },
      { id: 'cu', label: 'Copper', mol: 'cu', kind: 'material' },
      { id: 'draw', label: 'Wire drawing', kind: 'process' },
      { id: 'use', label: 'Wire · motors', endpoints: ['wiring', 'motor', 'comms'], kind: 'use' },
      { id: 'wear', label: 'Wear', kind: 'process' },
      { id: 'winning', label: 'Electrowinning', kind: 'recover' },
    ],
    links: [
      { from: 'ore', to: 'smelt', w: 0.08, kind: 'makeup' }, { from: 'smelt', to: 'cu', w: 0.08, kind: 'flow' },
      { from: 'cu', to: 'draw', w: 1, kind: 'flow' }, { from: 'draw', to: 'use', w: 1, kind: 'flow' },
      { from: 'use', to: 'wear', w: 1, kind: 'flow' }, { from: 'wear', to: 'winning', w: 0.92, kind: 'flow' },
      { from: 'wear', to: 'ore', w: 0.08, kind: 'makeup' }, { from: 'winning', to: 'cu', w: 0.92, kind: 'recycle' },
    ],
  },
  N: {
    unit: 'kg/day',
    nodes: [
      { id: 'n2', label: 'N₂ reservoir', mol: 'n2', kind: 'pool' },
      { id: 'haber', label: 'Haber–Bosch', ref: 'haber', kind: 'process' },
      { id: 'nh3', label: 'Ammonia', mol: 'nh3', kind: 'material' },
      { id: 'ostwald', label: 'Nitrification', ref: 'ostwald', kind: 'process' },
      { id: 'nitrate', label: 'Nutrient', mol: 'hno3', kind: 'biome' },
      { id: 'biomass', label: 'Protein · pharma', mol: 'glucose', endpoints: ['protein_cx', 'pharma'], kind: 'biome' },
      { id: 'denit', label: 'Denitrification', ref: 'denitrify', kind: 'recycle' },
    ],
    links: [
      { from: 'n2', to: 'haber', w: 1, kind: 'flow' }, { from: 'haber', to: 'nh3', w: 1, kind: 'flow' },
      { from: 'nh3', to: 'ostwald', w: 1, kind: 'flow' }, { from: 'ostwald', to: 'nitrate', w: 1, kind: 'flow' },
      { from: 'nitrate', to: 'biomass', w: 1, kind: 'flow' }, { from: 'biomass', to: 'denit', w: 1, kind: 'flow' },
      { from: 'denit', to: 'n2', w: 1, kind: 'recycle' },
    ],
  },
};

export const COVERED = Object.keys(CYCLES);

// validate: every reaction conserves atoms; every molecule's el matches; every cycle node's mol/ref/
// endpoints resolve. Returns issues[].
export function validate() {
  const issues = [];
  for (const r of REACTIONS) { const imb = reactionImbalance(r); if (imb > 1e-9) issues.push(`reaction ${r.id} not atom-balanced (Δ=${imb})`); }
  for (const [sym, c] of Object.entries(CYCLES)) {
    const ids = new Set(c.nodes.map((n) => n.id));
    for (const n of c.nodes) {
      if (n.mol && !MOLECULES[n.mol]) issues.push(`${sym}/${n.id}: unknown molecule ${n.mol}`);
      if (n.ref && !REACTION[n.ref]) issues.push(`${sym}/${n.id}: unknown reaction ${n.ref}`);
      for (const e of (n.endpoints || [])) if (!PRODUCT[e]) issues.push(`${sym}/${n.id}: unknown endpoint product ${e}`);
    }
    for (const l of c.links) if (!ids.has(l.from) || !ids.has(l.to)) issues.push(`${sym}: link ${l.from}→${l.to} references missing node`);
  }
  return issues;
}

// build the render-ready cycle for an element, scaling the curated weights by its ledger flow (kg/day).
// Nodes carry molecular formula + named process + endpoint detail; links carry absolute values.
export function chemCycle(sym, flowKg = 1) {
  const c = CYCLES[sym]; if (!c) return null;
  const nodes = c.nodes.map((n) => {
    const mol = n.mol ? MOLECULES[n.mol] : null, rx = n.ref ? REACTION[n.ref] : null;
    return {
      id: n.id, kind: n.kind, label: n.label,
      formula: mol ? mol.formula : null,
      molName: mol ? mol.name : null,
      process: rx ? rx.name : null,
      reaction: rx ? rxnString(rx) : null,
      endpoints: (n.endpoints || []).map((e) => ({ id: e, name: (PRODUCT[e] || {}).name, glyph: (PRODUCT[e] || {}).glyph })),
    };
  });
  const links = c.links.map((l) => ({ from: l.from, to: l.to, value: +(l.w * flowKg).toFixed(3), kind: l.kind }));
  return { sym, unit: c.unit, nodes, links };
}
// a readable reaction string, e.g. "2 Fe₂O₃ + 3 C → 4 Fe + 3 CO₂"
export function rxnString(r) {
  const side = (bag) => Object.entries(bag).map(([m, c]) => (c === 1 ? '' : c + ' ') + (MOLECULES[m] || { formula: m }).formula).join(' + ');
  return `${side(r.in)} → ${side(r.out)}`;
}

// ── THE FORKING CATALOGUE: an element does not flow in one ring — it FORKS through several refining
// pathways into different MATERIAL FORMS, each of which fans out to the many catalogue products that use
// that form. Silicon → wafer (chips · sensors · displays) AND glass (lighting · optics · hardware) AND
// ceramic (insulation · substrate). The forks below are the pathways; the products that fan from each are
// pulled live from the catalogue by loop (catalogue-driven), so the branching is real, not hand-listed. ──
export const FORKS = {
  Si: [
    { id: 'wafer',    process: 'Carbothermic → wafer', form: 'Silicon wafer', formula: 'Si',   loops: ['compute', 'energy'] },
    { id: 'glass',    process: 'Glass melting',        form: 'Glass',         formula: 'SiO₂', loops: ['habitat', 'society', 'propulsion', 'air', 'water'] },
    { id: 'ceramic',  process: 'Kiln (ceramic)',       form: 'Ceramic',       formula: 'SiO₂', loops: ['textiles', 'structure', 'body', 'waste'] },
  ],
  C: [
    { id: 'food',  process: 'Photosynthesis → mill', form: 'Biomass · food',   formula: 'C₆H₁₂O₆', loops: ['food', 'continuity', 'body', 'waste'] },
    { id: 'fiber', process: 'Pyrolysis → weave',     form: 'Carbon fiber',     formula: 'C',        loops: ['textiles', 'structure', 'labor', 'mobility'] },
    { id: 'resin', process: 'Ferment → extrude',     form: 'Bioplastic · resin', formula: 'PHA',    loops: ['habitat', 'society', 'air', 'energy', 'compute'] },
  ],
  Fe: [{ id: 'steel', process: 'Direct reduction → cast', form: 'Steel', formula: 'Fe', loops: null }],
  Al: [{ id: 'al',    process: 'Hall–Héroult → form',     form: 'Aluminium', formula: 'Al', loops: null }],
  Cu: [{ id: 'cu',    process: 'Smelting → draw',         form: 'Copper', formula: 'Cu', loops: null }],
  N:  [{ id: 'fert',  process: 'Haber–Bosch → nitrify',   form: 'Nutrient', formula: 'NO₃', loops: null }],
};
const POOL = {
  Si: { label: 'Silica', formula: 'SiO₂' }, Fe: { label: 'Hematite', formula: 'Fe₂O₃' }, Al: { label: 'Alumina', formula: 'Al₂O₃' },
  Cu: { label: 'Copper ore', formula: 'CuO' }, C: { label: 'Atmosphere', formula: 'CO₂' }, N: { label: 'N₂ reservoir', formula: 'N₂' },
};
const r3 = (x) => +x.toFixed(3);

// build the FORKING flow for an element from live demand (element-kg/day). Stages: pool → refine forks →
// material forms → products (fanned from the catalogue, top few per fork + an "others" rollup) → reclaim →
// (loops back to pool). Steady-state balanced (recycle + reserve makeup = throughput). Carries molecular
// detail (formulas, named processes) + the considered endpoint products.
export function forkedFlow(sym, demand = {}, { topPerFork = 3 } = {}) {
  const forks = FORKS[sym] || [{ id: 'main', process: 'Refine', form: sym + ' stock', formula: sym, loops: null }];
  const prodFlow = {};
  for (const { id, frac } of productsWithElement(sym)) { const fl = (demand[id] || 0) * frac; if (fl > 1e-6) prodFlow[id] = fl; }
  const pickFork = (loop) => (forks.find((f) => f.loops && f.loops.includes(loop)) || forks.find((f) => !f.loops) || forks[forks.length - 1]).id;
  const byFork = Object.fromEntries(forks.map((f) => [f.id, []]));
  for (const [id, fl] of Object.entries(prodFlow)) byFork[pickFork(PRODUCT[id].loop)].push({ id, fl });

  const pool = POOL[sym] || { label: sym + ' stock', formula: sym };
  const nodes = [{ id: 'pool', label: pool.label, formula: pool.formula, kind: 'pool' }];
  const links = []; let total = 0;
  for (const f of forks) {
    const prods = byFork[f.id].sort((a, b) => b.fl - a.fl); const ftot = prods.reduce((a, p) => a + p.fl, 0);
    if (ftot <= 1e-6) continue; total += ftot;
    const refId = 'ref_' + f.id, formId = 'form_' + f.id, rx = f.id === 'food' ? REACTION.photosynthesis : null;
    nodes.push({ id: refId, label: f.process, process: f.process, reaction: rx ? rxnString(rx) : null, kind: 'process' });
    nodes.push({ id: formId, label: f.form, formula: f.formula, kind: 'material' });
    links.push({ from: 'pool', to: refId, value: r3(ftot), kind: 'flow' });
    links.push({ from: refId, to: formId, value: r3(ftot), kind: 'flow' });
    const top = prods.slice(0, topPerFork), rest = prods.slice(topPerFork);
    for (const p of top) {
      const pid = 'p_' + p.id, P = PRODUCT[p.id];
      nodes.push({ id: pid, label: P.name, endpoints: [{ id: p.id, name: P.name, glyph: P.glyph }], kind: 'use' });
      links.push({ from: formId, to: pid, value: r3(p.fl), kind: 'flow' });
      links.push({ from: pid, to: 'reclaim', value: r3(p.fl * 0.92), kind: 'flow' });
    }
    if (rest.length) {
      const oid = 'o_' + f.id, of = rest.reduce((a, p) => a + p.fl, 0);
      nodes.push({ id: oid, label: `+${rest.length} more`, kind: 'use' });
      links.push({ from: formId, to: oid, value: r3(of), kind: 'flow' });
      links.push({ from: oid, to: 'reclaim', value: r3(of * 0.92), kind: 'flow' });
    }
  }
  nodes.push({ id: 'reclaim', label: 'Reclaim', kind: 'recover' });
  nodes.push({ id: 'reserve', label: 'Reserve', kind: 'reserve' });
  links.push({ from: 'reclaim', to: 'pool', value: r3(total * 0.92), kind: 'recycle' });
  links.push({ from: 'reserve', to: 'pool', value: r3(total * 0.08), kind: 'makeup' });
  return { sym, unit: 'kg/day', flow: r3(total), forks: forks.length, nodes, links };
}
