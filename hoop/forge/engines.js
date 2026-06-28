// engines.js — THE EIGHT PRODUCTION ENGINES, as forge "biomes" of the foam.
//
// The conceit (the user's): the ship is BUILT FROM ONE FOAM. Every chamber — a nave dwelling, a rind
// station, a forge furnace — is a Voronoi cell of the same construction process. So a production facility
// is NOT a bespoke building; it is a CLUSTER of foam chambers (rooms) assigned a process, exactly the way
// a nave ward is a cluster of foam chambers assigned a social role. The eight engines differ not in
// geometry (they all land in uniform foam) but in TWO data overlays the foam already supports:
//
//   1. the PROCESS MIX  — which steps (rooms) the cluster grows  (cf. nave biome roleMix)
//   2. the ACTIVITY GRAPH — how material flows step→step          (cf. nave's social web overlay)
//
// That is the "wriggle": eight topographically distinct engines (star · path · dag · comb · cycle ·
// in-tree · flow · fan) realised inside the SAME chamber-allocation kernel. The topology lives in the
// flow graph drawn over the rooms, not in the room shapes — so the construction stays uniform (one foam)
// while each facility reads as its own machine. Pure data + pure helpers; node-tested.

// family = the activity-graph archetype. coreAt = where the keystone room sits in the foam cluster:
//   'center' (star/cycle/fan/flow — a hub) | 'head' (path/dag/comb/in-tree — a spine end).
const CENTER = new Set(['star', 'cycle', 'fan', 'flow']);
export const coreAt = (family) => (CENTER.has(family) ? 'center' : 'head');

// Each engine: steps (process rooms, fp = footprint weight ⇒ relative chamber size), the core step (the
// grand anchor — furnace, reactor, spine head), the flow (step→step activity edges), perChunk (how many
// facilities of this engine typically fit one chunk — my judgement, 1–3: big hot engines 1, small fan
// yards 3), and a one-line in-world note. The steps' elements tie back to catalogue.js families.
export const ENGINES = {
  foundry: {
    label: 'Foundry', glyph: '🜂', color: '#e0772f', family: 'star', perChunk: 1,
    note: 'Ore in, metal out. A hot core tapped on every side — the ship\'s smelter.',
    core: 'furnace',
    steps: [
      { id: 'ore', name: 'Ore intake', glyph: '⛰', fp: 1.0 },
      { id: 'flux', name: 'Flux prep', glyph: '✚', fp: 0.7 },
      { id: 'furnace', name: 'Furnace', glyph: '🜂', fp: 2.6 },
      { id: 'tap', name: 'Tap & ladle', glyph: '🝁', fp: 1.0 },
      { id: 'cast', name: 'Casting', glyph: '▦', fp: 1.2 },
      { id: 'slag', name: 'Slag draw', glyph: '☄', fp: 0.7 },
      { id: 'ingot', name: 'Ingot store', glyph: '▬', fp: 0.9 },
    ],
    flow: [['ore', 'furnace'], ['flux', 'furnace'], ['furnace', 'tap'], ['tap', 'cast'], ['cast', 'ingot'], ['furnace', 'slag']],
  },
  chemworks: {
    label: 'Chemical works', glyph: '⚗', color: '#b39bd8', family: 'cycle', perChunk: 2,
    note: 'A reactor with its recycle loop closed — the catalyst returns, only the product leaves.',
    core: 'reactor',
    steps: [
      { id: 'feed', name: 'Feedstock', glyph: '◉', fp: 0.9 },
      { id: 'reactor', name: 'Reactor', glyph: '⚗', fp: 2.0 },
      { id: 'split', name: 'Separator', glyph: '⊟', fp: 1.2 },
      { id: 'recycle', name: 'Recycle still', glyph: '↺', fp: 1.0 },
      { id: 'scrub', name: 'Scrubber', glyph: '∿', fp: 0.8 },
      { id: 'drum', name: 'Product drum', glyph: '⬡', fp: 0.9 },
    ],
    flow: [['feed', 'reactor'], ['reactor', 'split'], ['split', 'drum'], ['split', 'recycle'], ['recycle', 'reactor'], ['reactor', 'scrub'], ['scrub', 'feed']],
  },
  mill: {
    label: 'Mill', glyph: '⊏', color: '#9aa3b2', family: 'path', perChunk: 1,
    note: 'A long line — billet to coil. Each stand only ever hands forward.',
    core: 'reheat',
    steps: [
      { id: 'billet', name: 'Billet bay', glyph: '▭', fp: 0.9 },
      { id: 'reheat', name: 'Reheat', glyph: '♨', fp: 1.6 },
      { id: 'rough', name: 'Roughing', glyph: '⊏', fp: 1.2 },
      { id: 'finish', name: 'Finishing', glyph: '⊐', fp: 1.2 },
      { id: 'cool', name: 'Cooling bed', glyph: '❄', fp: 1.0 },
      { id: 'coil', name: 'Coiler', glyph: '◎', fp: 0.9 },
    ],
    flow: [['billet', 'reheat'], ['reheat', 'rough'], ['rough', 'finish'], ['finish', 'cool'], ['cool', 'coil']],
  },
  fab: {
    label: 'Cleanroom fab', glyph: '▤', color: '#45c1c9', family: 'dag', perChunk: 1,
    note: 'Purity only ever rises. A graded corridor — gowning at the door, dice at the far end.',
    core: 'litho',
    steps: [
      { id: 'gown', name: 'Gowning', glyph: '⌖', fp: 0.8 },
      { id: 'wafer', name: 'Wafer prep', glyph: '○', fp: 1.0 },
      { id: 'litho', name: 'Lithography', glyph: '▤', fp: 1.8 },
      { id: 'etch', name: 'Etch', glyph: '⌗', fp: 1.2 },
      { id: 'deposit', name: 'Deposition', glyph: '░', fp: 1.2 },
      { id: 'test', name: 'Probe & test', glyph: '⊹', fp: 1.0 },
      { id: 'dice', name: 'Dice & pack', glyph: '⊞', fp: 0.8 },
    ],
    flow: [['gown', 'wafer'], ['wafer', 'litho'], ['litho', 'etch'], ['etch', 'deposit'], ['deposit', 'test'], ['etch', 'test'], ['test', 'dice']],
  },
  weave: {
    label: 'Weave hall', glyph: '𝍱', color: '#5aa845', family: 'comb', perChunk: 2,
    note: 'A spool spine feeds parallel teeth — card, spin, dye — that comb back to one bolt.',
    core: 'spool',
    steps: [
      { id: 'spool', name: 'Spool spine', glyph: '═', fp: 1.6 },
      { id: 'card', name: 'Carding', glyph: '∥', fp: 1.0 },
      { id: 'spin', name: 'Spinning', glyph: '✺', fp: 1.0 },
      { id: 'dye', name: 'Dye vats', glyph: '◑', fp: 1.0 },
      { id: 'finish', name: 'Finishing', glyph: '▦', fp: 1.1 },
      { id: 'bolt', name: 'Bolt store', glyph: '▥', fp: 0.9 },
    ],
    flow: [['spool', 'card'], ['spool', 'spin'], ['spool', 'dye'], ['card', 'finish'], ['spin', 'finish'], ['dye', 'finish'], ['finish', 'bolt']],
  },
  assembly: {
    label: 'Assembly line', glyph: '⊶', color: '#d9b24a', family: 'intree', perChunk: 2,
    note: 'Feeder bays converge on a spine. Sub-assemblies merge, the line tests and crates.',
    core: 'line',
    steps: [
      { id: 'partA', name: 'Feeder A', glyph: '◣', fp: 0.8 },
      { id: 'partB', name: 'Feeder B', glyph: '◤', fp: 0.8 },
      { id: 'partC', name: 'Feeder C', glyph: '◥', fp: 0.8 },
      { id: 'sub', name: 'Sub-assembly', glyph: '⊕', fp: 1.2 },
      { id: 'line', name: 'Main line', glyph: '⊶', fp: 2.0 },
      { id: 'test', name: 'Test rig', glyph: '⊹', fp: 1.0 },
      { id: 'crate', name: 'Crate-out', glyph: '▣', fp: 0.9 },
    ],
    flow: [['partA', 'sub'], ['partB', 'sub'], ['sub', 'line'], ['partC', 'line'], ['line', 'test'], ['test', 'crate']],
  },
  fluid: {
    label: 'Fluid works', glyph: '◍', color: '#4f86d6', family: 'flow', perChunk: 2,
    note: 'Reservoirs and pumps — a flow network with a return leg. Water, coolant, reaction mass.',
    core: 'pump',
    steps: [
      { id: 'intake', name: 'Intake', glyph: '▽', fp: 0.9 },
      { id: 'surge', name: 'Surge tank', glyph: '◗', fp: 1.4 },
      { id: 'pump', name: 'Pump hall', glyph: '◍', fp: 1.8 },
      { id: 'manifold', name: 'Manifold', glyph: '╪', fp: 1.0 },
      { id: 'treat', name: 'Treatment', glyph: '⊛', fp: 1.1 },
      { id: 'reservoir', name: 'Reservoir', glyph: '▣', fp: 1.5 },
      { id: 'return', name: 'Return leg', glyph: '↩', fp: 0.8 },
    ],
    flow: [['intake', 'surge'], ['surge', 'pump'], ['pump', 'manifold'], ['manifold', 'treat'], ['treat', 'reservoir'], ['reservoir', 'return'], ['return', 'surge']],
  },
  reclaim: {
    label: 'Reclaim yard', glyph: '♺', color: '#cf6b4a', family: 'fan', perChunk: 3,
    note: 'The decomposer. One throat shreds, one sort, then it fans to the bales — the recycle valve.',
    core: 'shred',
    steps: [
      { id: 'intake', name: 'Intake throat', glyph: '▼', fp: 1.2 },
      { id: 'shred', name: 'Shredder', glyph: '♺', fp: 1.8 },
      { id: 'sort', name: 'Sorter', glyph: '⋔', fp: 1.3 },
      { id: 'metal', name: 'Metal bale', glyph: '▰', fp: 0.8 },
      { id: 'polymer', name: 'Polymer bale', glyph: '▱', fp: 0.8 },
      { id: 'cullet', name: 'Glass cullet', glyph: '◇', fp: 0.8 },
      { id: 'residue', name: 'Residue', glyph: '·', fp: 0.6 },
    ],
    flow: [['intake', 'shred'], ['shred', 'sort'], ['sort', 'metal'], ['sort', 'polymer'], ['sort', 'cullet'], ['sort', 'residue']],
  },
};

export const ENGINE_IDS = Object.keys(ENGINES);
export const engineOf = (id) => ENGINES[id];
export const stepOf = (engId, stepId) => ENGINES[engId].steps.find((s) => s.id === stepId);

// the engine's step mix as a footprint table (stepId → fp) — handed to the foam room sizer.
export function engineFootprint(engId) {
  const e = ENGINES[engId], fp = {}; for (const s of e.steps) fp[s.id] = s.fp; return fp;
}

// validate the data: every flow endpoint is a real step, the core is a real step, the activity graph is
// CONNECTED (one facility, not islands), and each family's flow has the shape it claims.
export function validate() {
  const errs = [];
  for (const [id, e] of Object.entries(ENGINES)) {
    const ids = new Set(e.steps.map((s) => s.id));
    if (!ids.has(e.core)) errs.push(`${id}: core "${e.core}" is not a step`);
    for (const [a, b] of e.flow) { if (!ids.has(a)) errs.push(`${id}: flow from "${a}" not a step`); if (!ids.has(b)) errs.push(`${id}: flow to "${b}" not a step`); }
    // connectivity over the UNDIRECTED flow graph: every step reachable
    const adj = {}; for (const s of e.steps) adj[s.id] = [];
    for (const [a, b] of e.flow) { if (adj[a] && adj[b]) { adj[a].push(b); adj[b].push(a); } }
    const seen = new Set([e.steps[0].id]), q = [e.steps[0].id];
    while (q.length) { const u = q.pop(); for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); q.push(v); } }
    if (seen.size !== e.steps.length) errs.push(`${id}: activity graph is not connected (${seen.size}/${e.steps.length})`);
    // family-specific shape checks
    const outdeg = {}, indeg = {}; for (const s of e.steps) { outdeg[s.id] = 0; indeg[s.id] = 0; }
    for (const [a, b] of e.flow) { outdeg[a]++; indeg[b]++; }
    if (e.family === 'cycle' || e.family === 'flow') { const hasCycle = directedCycle(adj2(e.flow)); if (!hasCycle) errs.push(`${id}: ${e.family} engine has no directed cycle`); }
    if (e.family === 'fan') { if (outdeg[e.core] < 1) errs.push(`${id}: fan core does not branch`); const leaves = e.steps.filter((s) => outdeg[s.id] === 0).length; if (leaves < 3) errs.push(`${id}: fan has too few leaves (${leaves})`); }
    if (e.family === 'star') { if (outdeg[e.core] + indeg[e.core] < 3) errs.push(`${id}: star core not a hub`); }
    if (e.family === 'path') { for (const s of e.steps) if (outdeg[s.id] > 1) errs.push(`${id}: path step "${s.id}" forks (outdeg ${outdeg[s.id]})`); }
    if (e.family === 'dag') { if (directedCycle(adj2(e.flow))) errs.push(`${id}: dag has a cycle`); }
    if (e.family === 'intree') { const sinks = e.steps.filter((s) => outdeg[s.id] === 0).length; if (sinks !== 1) errs.push(`${id}: in-tree should have one sink (${sinks})`); }
    if (e.family === 'comb') { if (outdeg[e.core] < 3) errs.push(`${id}: comb spine has too few teeth`); }
  }
  return errs;
}
function adj2(flow) { const a = {}; for (const [u, v] of flow) { (a[u] = a[u] || []).push(v); } return a; }
function directedCycle(adj) {
  const state = {}, dfs = (u) => { state[u] = 1; for (const v of adj[u] || []) { if (state[v] === 1) return true; if (!state[v] && dfs(v)) return true; } state[u] = 2; return false; };
  for (const u of Object.keys(adj)) if (!state[u] && dfs(u)) return true; return false;
}
