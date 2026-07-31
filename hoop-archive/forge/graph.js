// hoop/forge/graph.js — THE PRODUCTION GRAPH: the Forge's named processing steps, intermediates, recycling
// and bio-regeneration, as a flow network. This is the detailed layer under forge.js's aggregate metabolism
// — the Factorio view: every step is a named PROCESS run by a MACHINE, consuming MATERIALS and producing
// MATERIALS, with the loops closed by recyclers and the organic loop closed by bio-regeneration.
//
// CONSERVATION IS STRUCTURAL, again: every process declares inputs + named outputs, and the kernel emits an
// implicit LOSS output = (input mass − named-output mass) routed to the matching scrap/waste stream. So a
// process can never create mass (output > input is an authoring error, caught by validate()), and the
// "yield loss" of a real step shows up as scrap the recyclers must reclaim — exactly the closure the loops
// have to satisfy. Total mass is conserved by construction; the only question the solver answers is whether
// the recovery loops SUPPLY what the products' wear DEMANDS.
//
// SEAMS, now concrete processes (not just constants): ENERGY (tide) is the cost on every process and the
// driver of Grow; the BIO-REGEN loop (Digest → Synthesize → Grow) is the biome bridge that turns organic
// waste back into food; WATER recovery (Condense) is the iris seam. Pure, zero-dep, deterministic; tested
// in test/graph.selftest.mjs and rendered by the /forge page.
//
// Unit convention: a material's `mass` is the base-commodity mass one unit embodies (base stocks = 1; a
// component = the sum of what it's built from; reshaping within a family keeps mass). Flows are units/step.

// ── families: how the graph colours + groups materials (and which scrap stream loss routes to) ──
export const FAMILIES = {
  metal:    { name: 'Metal',    color: '#c98a4a', scrap: 'scrap_metal' },
  mineral:  { name: 'Mineral',  color: '#7f8aa0', scrap: 'scrap_mineral' },
  carbon:   { name: 'Carbon',   color: '#c45b8f', scrap: 'scrap_carbon' },
  organic:  { name: 'Organic',  color: '#5aa845', scrap: 'organic_waste' },
  water:    { name: 'Water',    color: '#3bb0c9', scrap: 'greywater' },
  trace:    { name: 'Trace',    color: '#b39bd8', scrap: 'scrap_trace' },
  mixed:    { name: 'Assembly', color: '#d9b24a', scrap: 'mixed_scrap' },
};

// ── materials: id → { name, glyph, family, tier, mass, kind } (kind: feedstock·intermediate·component·
// product·waste). tier is the layout column (0 feedstock … 4 product; waste sits below). ──
export const MATERIALS = {
  // tier 0 — recovered feedstock (the conserved bases, ready to work)
  metal:     { name: 'Metal stock',  glyph: '⬡', family: 'metal',   tier: 0, mass: 1, kind: 'feedstock' },
  silica:    { name: 'Silica',       glyph: '◈', family: 'mineral', tier: 0, mass: 1, kind: 'feedstock' },
  polymer:   { name: 'Polymer',      glyph: '◇', family: 'carbon',  tier: 0, mass: 1, kind: 'feedstock' },
  volatiles: { name: 'Volatiles',    glyph: '≈', family: 'carbon',  tier: 0, mass: 1, kind: 'feedstock' },
  water:     { name: 'Water',        glyph: '∿', family: 'water',   tier: 0, mass: 1, kind: 'feedstock' },
  biomass:   { name: 'Biomass',      glyph: '❧', family: 'organic', tier: 0, mass: 1, kind: 'feedstock' },
  trace:     { name: 'Trace',        glyph: '✦', family: 'trace',   tier: 0, mass: 1, kind: 'feedstock' },
  // tier 1 — refined intermediates
  plate:     { name: 'Plate',        glyph: '▭', family: 'metal',   tier: 1, mass: 1, kind: 'intermediate' },
  wire:      { name: 'Wire',         glyph: '⌇', family: 'metal',   tier: 1, mass: 1, kind: 'intermediate' },
  glass:     { name: 'Glass',        glyph: '▢', family: 'mineral', tier: 1, mass: 1, kind: 'intermediate' },
  ceramic:   { name: 'Ceramic',      glyph: '◫', family: 'mineral', tier: 1, mass: 1, kind: 'intermediate' },
  resin:     { name: 'Resin',        glyph: '◇', family: 'carbon',  tier: 1, mass: 1, kind: 'intermediate' },
  nutrient:  { name: 'Nutrient',     glyph: '✸', family: 'organic', tier: 1, mass: 1, kind: 'intermediate' },
  food:      { name: 'Food',         glyph: '❂', family: 'organic', tier: 1, mass: 1, kind: 'intermediate' },
  // tier 2 — components
  frame:     { name: 'Frame',        glyph: '⊟', family: 'mixed',   tier: 2, mass: 3, kind: 'component' },
  gear:      { name: 'Gear',         glyph: '✲', family: 'metal',   tier: 2, mass: 1, kind: 'component' },
  board:     { name: 'Circuit board',glyph: '⊞', family: 'mixed',   tier: 2, mass: 3, kind: 'component' },
  chip:      { name: 'Chip',         glyph: '⊡', family: 'mixed',   tier: 2, mass: 2, kind: 'component' },
  panel:     { name: 'Panel',        glyph: '▥', family: 'mixed',   tier: 2, mass: 2, kind: 'component' },
  // tier 3 — products (deployed, wear back to scrap)
  structure: { name: 'Structure',    glyph: '⛓', family: 'mixed',   tier: 3, mass: 5, kind: 'product' },
  fixture:   { name: 'Fixture',      glyph: '▣', family: 'mixed',   tier: 3, mass: 5, kind: 'product' },
  machine:   { name: 'Machine',      glyph: '⚙', family: 'mixed',   tier: 3, mass: 7, kind: 'product' },
  circuit:   { name: 'Circuit',      glyph: '◉', family: 'mixed',   tier: 3, mass: 5, kind: 'product' },
  consumable:{ name: 'Consumable',   glyph: '◯', family: 'organic', tier: 3, mass: 4, kind: 'product' },
  // waste streams (where loss + wear collect, the recyclers' feed)
  scrap_metal:   { name: 'Metal scrap',   glyph: '⌗', family: 'metal',   tier: 5, mass: 1, kind: 'waste' },
  scrap_mineral: { name: 'Cullet',        glyph: '⌗', family: 'mineral', tier: 5, mass: 1, kind: 'waste' },
  scrap_carbon:  { name: 'Polymer scrap', glyph: '⌗', family: 'carbon',  tier: 5, mass: 1, kind: 'waste' },
  scrap_trace:   { name: 'Spent catalyst',glyph: '⌗', family: 'trace',   tier: 5, mass: 1, kind: 'waste' },
  organic_waste: { name: 'Organic waste', glyph: '⌁', family: 'organic', tier: 5, mass: 1, kind: 'waste' },
  greywater:     { name: 'Greywater',     glyph: '⌁', family: 'water',   tier: 5, mass: 1, kind: 'waste' },
  mixed_scrap:   { name: 'Mixed scrap',   glyph: '⌗', family: 'mixed',   tier: 5, mass: 1, kind: 'waste' },
};

// ── processes: every named step. in/out are {material: units}. `energy` is cost/run (tide seam). `kind`:
// refine · fabricate · assemble · recycle · bioregen · seam. The implicit LOSS output (added by the kernel)
// makes each conserve mass; recycle/bioregen processes are what turn that loss + product wear back into
// feedstock, closing the loops. ──
export const PROCESSES = [
  // ── refine (feedstock → intermediate); a little loss → family scrap ──
  { id: 'roll',     name: 'Rolling Mill',     glyph: '▭', machine: 'rolling mill',    kind: 'refine',   in: { metal: 1 },                 out: { plate: 0.92 },   energy: 2.2 },
  { id: 'draw',     name: 'Wire Drawer',      glyph: '⌇', machine: 'wire drawer',     kind: 'refine',   in: { metal: 1 },                 out: { wire: 0.94 },    energy: 1.8 },
  { id: 'melt',     name: 'Glass Furnace',    glyph: '▢', machine: 'glass furnace',   kind: 'refine',   in: { silica: 1 },                out: { glass: 0.9 },    energy: 3.0 },
  { id: 'kiln',     name: 'Kiln',             glyph: '◫', machine: 'kiln',            kind: 'refine',   in: { silica: 1 },                out: { ceramic: 0.95 }, energy: 2.6 },
  { id: 'extrude',  name: 'Extruder',         glyph: '◇', machine: 'extruder',        kind: 'refine',   in: { polymer: 1 },               out: { resin: 0.95 },   energy: 1.5 },
  { id: 'polymerize',name: 'Polymer Reactor', glyph: '⌬', machine: 'reactor',         kind: 'refine',   in: { volatiles: 1, trace: 0.1 }, out: { polymer: 0.9 },  energy: 3.6 },   // chemistry: volatiles → polymer (closes the carbon loop)
  // ── fabricate (intermediates → components); assembly is lossless (component mass = sum of inputs) ──
  { id: 'frameshop',name: 'Frame Shop',       glyph: '⊟', machine: 'press',           kind: 'fabricate',in: { plate: 2, ceramic: 1 },     out: { frame: 1 },      energy: 2.0 },
  { id: 'machshop', name: 'Machine Shop',     glyph: '✲', machine: 'lathe',           kind: 'fabricate',in: { plate: 1 },                 out: { gear: 0.92 },    energy: 2.4 },
  { id: 'boardfab', name: 'Board Printer',    glyph: '⊞', machine: 'board printer',   kind: 'fabricate',in: { glass: 1, wire: 1, trace: 1 }, out: { board: 1 },   energy: 3.4 },
  { id: 'chipfab',  name: 'Chip Fab',         glyph: '⊡', machine: 'chip fab',        kind: 'fabricate',in: { board: 1, trace: 1 },       out: { chip: 1.9 },     energy: 4.5 },
  { id: 'panelfab', name: 'Panel Shop',       glyph: '▥', machine: 'laminator',       kind: 'fabricate',in: { glass: 1, resin: 1 },       out: { panel: 1 },      energy: 1.6 },
  // ── assemble (components → products); lossless ──
  { id: 'as_struct',name: 'Hull Assembler',   glyph: '⛓', machine: 'gantry',          kind: 'assemble', in: { frame: 1, plate: 2 },       out: { structure: 1 }, energy: 2.8 },
  { id: 'as_fix',   name: 'Fixture Line',     glyph: '▣', machine: 'assembler',       kind: 'assemble', in: { frame: 1, panel: 1 },       out: { fixture: 1 },   energy: 2.2 },
  { id: 'as_mach',  name: 'Machine Assembler', glyph: '⚙', machine: 'assembler',      kind: 'assemble', in: { gear: 2, frame: 1, chip: 1 }, out: { machine: 1 }, energy: 3.6 },
  { id: 'as_circ',  name: 'Circuit Line',     glyph: '◉', machine: 'assembler',       kind: 'assemble', in: { chip: 1, wire: 1, panel: 1 }, out: { circuit: 1 }, energy: 3.0 },
  { id: 'galley',   name: 'Galley',           glyph: '◯', machine: 'food processor',  kind: 'assemble', in: { food: 1, resin: 1, water: 2 }, out: { consumable: 1 }, energy: 1.2 },
  // ── recycle (waste → feedstock); the recyclers — the industrial decomposers, a little residual loss ──
  { id: 'shred',    name: 'Shredder',         glyph: '⌗', machine: 'shredder',        kind: 'recycle',  in: { scrap_metal: 1 },           out: { metal: 0.95 },   energy: 1.6 },
  { id: 'cullet',   name: 'Cullet Remelt',    glyph: '⌗', machine: 'remelter',        kind: 'recycle',  in: { scrap_mineral: 1 },         out: { silica: 0.96 },  energy: 2.4 },
  { id: 'depoly',   name: 'Depolymerizer',    glyph: '⌗', machine: 'depolymerizer',   kind: 'recycle',  in: { scrap_carbon: 1 },          out: { volatiles: 0.9 }, energy: 2.8 },
  { id: 'recover',  name: 'Catalyst Recovery', glyph: '✦', machine: 'recovery still', kind: 'recycle',  in: { scrap_trace: 1 },           out: { trace: 0.85 },   energy: 3.2 },
  // ── bio-regen (the organic loop — the biome seam): waste → volatiles+nutrient → biomass → food ──
  { id: 'digest',   name: 'Digester',         glyph: '⌁', machine: 'bio-digester',    kind: 'bioregen', in: { organic_waste: 1 },         out: { volatiles: 0.4, nutrient: 0.4, water: 0.18 }, energy: 0.8 },
  { id: 'synth',    name: 'Nutrient Synth',   glyph: '✸', machine: 'synthesizer',     kind: 'bioregen', in: { volatiles: 1, water: 1, trace: 0.2 }, out: { nutrient: 2.1 }, energy: 2.0 },
  { id: 'grow',     name: 'Grow Vat',         glyph: '❧', machine: 'grow vat',        kind: 'bioregen', in: { nutrient: 1, water: 2 },    out: { biomass: 2.9 },  energy: 9.0 },   // photosynthesis — the big energy draw (tide seam), grows mass from light
  { id: 'mill',     name: 'Food Mill',        glyph: '❂', machine: 'food mill',       kind: 'bioregen', in: { biomass: 1 },               out: { food: 0.85 },    energy: 1.0 },
  // ── seam recovery: water closes its own small loop (the iris seam) ──
  { id: 'condense', name: 'Condenser',        glyph: '∿', machine: 'condenser',       kind: 'seam',     in: { greywater: 1 },             out: { water: 0.97 },   energy: 1.2 },
];
export const PROCESS = Object.fromEntries(PROCESSES.map((p) => [p.id, p]));

const mass = (m) => (MATERIALS[m] ? MATERIALS[m].mass : 0);
const sumMass = (bag) => Object.entries(bag).reduce((a, [m, q]) => a + q * mass(m), 0);

// the implicit LOSS of a process = input mass − named-output mass, routed to the family scrap of its
// dominant input. Returns the full output bag including the loss term (so every process conserves mass).
export function lossOf(p) { return +(sumMass(p.in) - sumMass(p.out)).toFixed(6); }
export function fullOutputs(p) {
  const out = { ...p.out }, loss = lossOf(p);
  if (loss > 1e-9) {
    // route loss to the scrap stream of the heaviest INPUT family (what physically degrades)
    let fam = 'mixed', best = -1;
    for (const [m, q] of Object.entries(p.in)) { const w = q * mass(m); if (w > best) { best = w; fam = MATERIALS[m].family; } }
    const stream = FAMILIES[fam].scrap;
    out[stream] = (out[stream] || 0) + loss / mass(stream);
  }
  return out;
}

// validate the whole graph: every process conserves mass (loss ≥ 0; output never exceeds input), every
// referenced material exists, every product wears to a recoverable stream. Returns issues[] (empty = ok).
export function validate() {
  const issues = [];
  for (const p of PROCESSES) {
    for (const m of [...Object.keys(p.in), ...Object.keys(p.out)]) if (!MATERIALS[m]) issues.push(`${p.id}: unknown material '${m}'`);
    if (lossOf(p) < -1e-9) issues.push(`${p.id}: NOT mass-conserving — outputs (${sumMass(p.out)}) exceed inputs (${sumMass(p.in)})`);
  }
  return issues;
}

// ── the flow solver. Given product DEMAND (units/step to build, = deployed×wear at the setpoint), back-
// propagate through the recipe DAG to the rate of every process and the flow on every material edge. Then
// compute what the wear + process loss FEED into the waste streams, and what the recyclers/bio-regen
// RECOVER, and report each material's supply vs demand (closure). Forward recipes form a DAG (no product
// feeds its own components); the loops close only through the waste→feedstock recyclers, which we balance
// separately — so the back-prop terminates. ──
// BUILDERS = processes whose every input is non-waste (they build forward from feedstock); RECOVERERS =
// the rest (recyclers, digester, condenser — they consume waste and close the loops). The builder graph is
// acyclic (the only cycles in the system close through recoverers), so demand back-prop terminates.
const isWasteIn = (p) => Object.keys(p.in).some((m) => MATERIALS[m].kind === 'waste');
export const BUILDERS = PROCESSES.filter((p) => !isWasteIn(p));
export const RECOVERERS = PROCESSES.filter(isWasteIn);
function primaryOut(p) { let prod = null, best = -1; for (const [m, q] of Object.entries(p.out)) { const w = q * mass(m); if (w > best && MATERIALS[m].kind !== 'waste') { best = w; prod = m; } } return prod; }
export const BUILDER_OF = {};   // material → the builder whose PRIMARY output it is
for (const p of BUILDERS) { const m = primaryOut(p); if (m && !(m in BUILDER_OF)) BUILDER_OF[m] = p.id; }

// the BASE-COMMODITY composition of one unit of a material (rolled up through its builder recipe): products
// are lossless assemblies, so this is exact for them — and it's how product WEAR routes back to the right
// scrap streams (a worn machine returns its real metal/mineral/trace, not a fixed guess). Memoized.
const _comp = {};
export function compositionOf(m) {
  if (_comp[m]) return _comp[m];
  const M = MATERIALS[m];
  if (M.kind === 'feedstock' || !BUILDER_OF[m]) return (_comp[m] = { [m]: M.mass });
  const p = PROCESS[BUILDER_OF[m]], per = {};
  for (const [i, q] of Object.entries(p.in)) { const ci = compositionOf(i); for (const [c, mc] of Object.entries(ci)) per[c] = (per[c] || 0) + mc * q; }
  // gross input base-mass per unit, then NORMALIZE to the unit's actual mass — refine losses were shed to
  // scrap during fabrication (counted as builder loss), so the deployed unit carries exactly mass(m). This
  // net composition is what product WEAR routes back to scrap; gross feedstock demand is tracked by pull().
  const outU = p.out[m], gross = {}; let tot = 0;
  for (const [c, v] of Object.entries(per)) { gross[c] = v / outU; tot += v / outU; }
  const k = tot > 0 ? MATERIALS[m].mass / tot : 1, r = {}; for (const [c, v] of Object.entries(gross)) r[c] = v * k;
  return (_comp[m] = r);
}

export function solveFlow(demand = {}) {
  const rate = {}, feedstockDemand = {};
  // recursively resolve a material demand back through its builder chain to feedstock (acyclic → terminates;
  // the organic loop's regen is a recoverer, so forward resolution bottoms out at volatiles/water/trace).
  const pull = (m, units, depth) => {
    if (units <= 1e-12 || depth > 64) return;
    const pid = BUILDER_OF[m];
    if (!pid) { if (MATERIALS[m].kind === 'feedstock') feedstockDemand[m] = (feedstockDemand[m] || 0) + units; return; }
    const p = PROCESS[pid], runs = units / p.out[m];
    rate[pid] = (rate[pid] || 0) + runs;
    for (const [m2, q] of Object.entries(p.in)) pull(m2, runs * q, depth + 1);
  };
  for (const [m, d] of Object.entries(demand)) pull(m, d, 0);
  // waste generation: product wear (= demand, since we build to replace wear) + every builder's loss. Wear
  // routes to scrap by the product's REAL base-commodity composition (a worn machine returns its metal to
  // scrap_metal, its trace to scrap_trace, its water to greywater) — so recovery is composition-accurate.
  const COMMODITY_FAMILY = { metal: 'metal', silica: 'mineral', polymer: 'carbon', volatiles: 'carbon', water: 'water', biomass: 'organic', trace: 'trace' };
  const wasteIn = {};
  for (const [m, d] of Object.entries(demand)) {
    const comp = compositionOf(m);
    for (const [c, mc] of Object.entries(comp)) { const s = FAMILIES[COMMODITY_FAMILY[c] || MATERIALS[m].family].scrap; wasteIn[s] = (wasteIn[s] || 0) + d * mc / mass(s); }
  }
  for (const p of BUILDERS) { const r = rate[p.id] || 0; if (!r) continue; for (const [m, q] of Object.entries(fullOutputs(p))) if (MATERIALS[m].kind === 'waste') wasteIn[m] = (wasteIn[m] || 0) + r * q; }
  // size the RECOVERERS to clear the waste they consume, CASCADING (product wear → mixed_scrap → sort →
  // scrap_metal → shred → metal): a recoverer's non-feed waste outputs re-enter the pool for the next
  // recoverer. The waste chain is acyclic (nothing rebuilds mixed_scrap), so this converges; a recoverer's
  // residual loss routes to its OWN feed stream — that's truly unrecoverable, so we don't re-feed it (it
  // becomes makeup the loop can't close). Credit non-waste outputs to `recovered`.
  const wastePool = { ...wasteIn }, recovered = {};
  for (let guard = 0; guard < 100; guard++) {
    let changed = false;
    for (const p of RECOVERERS) {
      const feed = Object.keys(p.in).find((m) => MATERIALS[m].kind === 'waste');
      const avail = wastePool[feed] || 0; if (avail <= 1e-9) continue;
      const runs = avail / p.in[feed]; rate[p.id] = (rate[p.id] || 0) + runs; wastePool[feed] = 0; changed = true;
      for (const [m, q] of Object.entries(fullOutputs(p))) {
        const add = runs * q;
        if (MATERIALS[m].kind === 'waste') { if (m !== feed) wastePool[m] = (wastePool[m] || 0) + add; }   // cascade, but not back into our own feed (residue = makeup)
        else recovered[m] = (recovered[m] || 0) + add;
      }
    }
    if (!changed) break;
  }
  // closure per feedstock: recovered ≥ demanded ⇒ the loop self-supplies; shortfall = makeup drawn from stock.
  const closure = {};
  for (const m of Object.keys(feedstockDemand)) { const dem = feedstockDemand[m], rec = recovered[m] || 0; closure[m] = { demand: +dem.toFixed(3), recovered: +rec.toFixed(3), shortfall: +Math.max(0, dem - rec).toFixed(3), closed: rec + 1e-6 >= dem }; }
  // edge flows for the renderer
  const edges = [];
  for (const p of PROCESSES) { const r = rate[p.id] || 0; if (r <= 0) continue; for (const [m, q] of Object.entries(p.in)) edges.push({ material: m, to: p.id, flow: +(r * q).toFixed(3) }); for (const [m, q] of Object.entries(fullOutputs(p))) edges.push({ material: m, from: p.id, flow: +(r * q).toFixed(3) }); }
  return { rate, feedstockDemand, wasteIn, recovered, closure, edges };
}

// total energy demand at a given product demand (the tide seam): sum over EVERY running process (builders
// + the recoverers the solver sized) of runs × energy. This is the closed system's power draw — compare it
// to tide's energyLedger().total_GW.
export function energyDemand(demand = {}) {
  const { rate } = solveFlow(demand);
  let e = 0; for (const p of PROCESSES) e += (rate[p.id] || 0) * p.energy;
  return +e.toFixed(2);
}

// the whole graph, packaged for the renderer + wiki: nodes (processes) + material nodes + edges + families.
export function buildGraph() {
  return {
    families: FAMILIES,
    materials: MATERIALS,
    processes: PROCESSES.map((p) => ({ ...p, loss: lossOf(p), outputs: fullOutputs(p) })),
    issues: validate(),
  };
}
