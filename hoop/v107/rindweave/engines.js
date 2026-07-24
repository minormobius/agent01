// engines.js — THE EIGHT PRODUCTION ENGINES + their material flow (self-contained port of the forge data,
// hoop/forge/engines.js). Each engine is a small process graph: named STEPS (rooms), a CORE step (the keystone
// machine), and a FLOW (step→step material edges = its activity graph). Across engines, the intake/output
// COMMODITIES wire the closed supply chain (reclaim → refiners → mill → assembly → fulfillment → reclaim) —
// that inter-engine flow is the core feature of the eight. Pure data + pure derivation. Node-tested.

export const ENGINES = {
  foundry: {
    label: 'Foundry', glyph: '🜂', color: '#e0772f', family: 'star',
    note: 'Ore in, metal out. A hot core tapped on every side.',
    core: 'furnace', intake: ['scrap_metal', 'coolant'], output: ['metal'],
    steps: [
      { id: 'ore', name: 'Ore intake', glyph: '⛰', fp: 1.0 },
      { id: 'flux', name: 'Flux prep', glyph: '✚', fp: 0.7 },
      { id: 'furnace', name: 'Furnace', glyph: '🜂', fp: 2.6 },
      { id: 'tap', name: 'Tap & ladle', glyph: '🝁', fp: 1.0 },
      { id: 'cast', name: 'Casting', glyph: '▦', fp: 1.2 },
      { id: 'ingot', name: 'Ingot store', glyph: '▬', fp: 0.9 },
    ],
    flow: [['ore', 'furnace'], ['flux', 'furnace'], ['furnace', 'tap'], ['tap', 'cast'], ['cast', 'ingot']],
    inAt: 'ore', outAt: 'ingot',
  },
  chemworks: {
    label: 'Chemical works', glyph: '⚗', color: '#b39bd8', family: 'cycle',
    note: 'A reactor with its recycle loop closed — only the product leaves.',
    core: 'reactor', intake: ['feedstock', 'coolant'], output: ['polymer'],
    steps: [
      { id: 'feed', name: 'Feedstock', glyph: '◉', fp: 0.9 },
      { id: 'reactor', name: 'Reactor', glyph: '⚗', fp: 2.0 },
      { id: 'split', name: 'Separator', glyph: '⊟', fp: 1.2 },
      { id: 'recycle', name: 'Recycle still', glyph: '↺', fp: 1.0 },
      { id: 'drum', name: 'Product drum', glyph: '⬡', fp: 0.9 },
    ],
    flow: [['feed', 'reactor'], ['reactor', 'split'], ['split', 'drum'], ['split', 'recycle'], ['recycle', 'reactor']],
    inAt: 'feed', outAt: 'drum',
  },
  mill: {
    label: 'Mill', glyph: '⊏', color: '#9aa3b2', family: 'path',
    note: 'A long line — billet to coil. Each stand hands forward.',
    core: 'reheat', intake: ['metal'], output: ['stock'],
    steps: [
      { id: 'billet', name: 'Billet bay', glyph: '▭', fp: 0.9 },
      { id: 'reheat', name: 'Reheat', glyph: '♨', fp: 1.6 },
      { id: 'rough', name: 'Roughing', glyph: '⊏', fp: 1.2 },
      { id: 'finish', name: 'Finishing', glyph: '⊐', fp: 1.2 },
      { id: 'coil', name: 'Coiler', glyph: '◎', fp: 0.9 },
    ],
    flow: [['billet', 'reheat'], ['reheat', 'rough'], ['rough', 'finish'], ['finish', 'coil']],
    inAt: 'billet', outAt: 'coil',
  },
  fab: {
    label: 'Cleanroom fab', glyph: '▤', color: '#45c1c9', family: 'dag',
    note: 'Purity only rises. Gowning at the door, dice at the far end.',
    core: 'litho', intake: ['silicon'], output: ['circuit'],
    steps: [
      { id: 'gown', name: 'Gowning', glyph: '⌖', fp: 0.8 },
      { id: 'wafer', name: 'Wafer prep', glyph: '○', fp: 1.0 },
      { id: 'litho', name: 'Lithography', glyph: '▤', fp: 1.8 },
      { id: 'etch', name: 'Etch', glyph: '⌗', fp: 1.2 },
      { id: 'dice', name: 'Dice & pack', glyph: '⊞', fp: 0.8 },
    ],
    flow: [['gown', 'wafer'], ['wafer', 'litho'], ['litho', 'etch'], ['etch', 'dice']],
    inAt: 'gown', outAt: 'dice',
  },
  weave: {
    label: 'Weave hall', glyph: '𝍱', color: '#5aa845', family: 'comb',
    note: 'A spool spine feeds parallel teeth that comb back to one bolt.',
    core: 'spool', intake: ['fiber'], output: ['cloth'],
    steps: [
      { id: 'spool', name: 'Spool spine', glyph: '═', fp: 1.6 },
      { id: 'card', name: 'Carding', glyph: '∥', fp: 1.0 },
      { id: 'spin', name: 'Spinning', glyph: '✺', fp: 1.0 },
      { id: 'finish', name: 'Finishing', glyph: '▦', fp: 1.1 },
      { id: 'bolt', name: 'Bolt store', glyph: '▥', fp: 0.9 },
    ],
    flow: [['spool', 'card'], ['spool', 'spin'], ['card', 'finish'], ['spin', 'finish'], ['finish', 'bolt']],
    inAt: 'spool', outAt: 'bolt',
  },
  assembly: {
    label: 'Assembly line', glyph: '⊶', color: '#d9b24a', family: 'intree',
    note: 'Feeder bays converge on a spine; sub-assemblies merge, test, crate.',
    core: 'line', intake: ['stock', 'polymer', 'circuit', 'cloth'], output: ['product'],
    steps: [
      { id: 'partA', name: 'Feeder A', glyph: '◣', fp: 0.8 },
      { id: 'partB', name: 'Feeder B', glyph: '◤', fp: 0.8 },
      { id: 'sub', name: 'Sub-assembly', glyph: '⊕', fp: 1.2 },
      { id: 'line', name: 'Main line', glyph: '⊶', fp: 2.0 },
      { id: 'crate', name: 'Crate-out', glyph: '▣', fp: 0.9 },
    ],
    flow: [['partA', 'sub'], ['partB', 'sub'], ['sub', 'line'], ['line', 'crate']],
    inAt: 'partA', outAt: 'crate',
  },
  fluid: {
    label: 'Fluid works', glyph: '◍', color: '#4f86d6', family: 'flow',
    note: 'Reservoirs and pumps — a flow network with a return leg.',
    core: 'pump', intake: ['scrap_water'], output: ['coolant'],
    steps: [
      { id: 'intake', name: 'Intake', glyph: '▽', fp: 0.9 },
      { id: 'pump', name: 'Pump hall', glyph: '◍', fp: 1.8 },
      { id: 'treat', name: 'Treatment', glyph: '⊛', fp: 1.1 },
      { id: 'reservoir', name: 'Reservoir', glyph: '▣', fp: 1.5 },
      { id: 'return', name: 'Return leg', glyph: '↩', fp: 0.8 },
    ],
    flow: [['intake', 'pump'], ['pump', 'treat'], ['treat', 'reservoir'], ['reservoir', 'return'], ['return', 'pump']],
    inAt: 'intake', outAt: 'reservoir',
  },
  reclaim: {
    label: 'Reclaim yard', glyph: '♺', color: '#cf6b4a', family: 'fan',
    note: 'The decomposer. One throat shreds, one sort, then it fans to the bales.',
    core: 'shred', intake: ['product', 'waste'], output: ['scrap_metal', 'feedstock', 'silicon', 'fiber', 'scrap_water'],
    steps: [
      { id: 'intake', name: 'Intake throat', glyph: '▼', fp: 1.2 },
      { id: 'shred', name: 'Shredder', glyph: '♺', fp: 1.8 },
      { id: 'sort', name: 'Sorter', glyph: '⋔', fp: 1.3 },
      { id: 'metal', name: 'Metal bale', glyph: '▰', fp: 0.8 },
      { id: 'bales', name: 'Bale yard', glyph: '▱', fp: 1.0 },
    ],
    flow: [['intake', 'shred'], ['shred', 'sort'], ['sort', 'metal'], ['sort', 'bales']],
    inAt: 'intake', outAt: 'bales',
  },
};

// the order the eight sit around the ring (azimuthal) — the production DAG's grain: reclaim/fluid feed the
// refiners, mill conditions, assembly converges. Matches the weft order in weave.js.
export const ENGINE_RING = ['foundry', 'chemworks', 'mill', 'fab', 'weave', 'assembly', 'fluid', 'reclaim'];

// the fulfillment lift — NOT a production engine; the rind↔nave conduit at the centre (the single entry up to
// the ops mezzanine). Product rides up; the nave's waste comes down to reclaim.
export const FULFILLMENT = { id: 'fulfillment', label: 'Fulfillment lift', glyph: '⇅', color: '#cbd3e0', intake: ['product'], output: ['waste'] };

// DERIVE the inter-engine supply chain: an edge producer→consumer for every commodity a producer outputs that
// a consumer intakes. This is the long-haul material flow across the floor — the closed loop the forge is about.
export function supplyChain() {
  const ids = [...ENGINE_RING, 'fulfillment'];
  const get = (id) => (id === 'fulfillment' ? FULFILLMENT : ENGINES[id]);
  const edges = [];
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const A = get(a), B = get(b);
    for (const c of (A.output || [])) if ((B.intake || []).includes(c)) edges.push({ from: a, to: b, commodity: c });
  }
  return edges;
}

export const ENGINE_IDS = ENGINE_RING.slice();
