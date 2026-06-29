// hoop/forge/wiki.js — the FORGE WIKI: authored prose for every material + process, MERGED with the
// derived structure from graph.js (recipe, family, who-makes/who-uses, flow). The info tabs on the /forge
// flow page link here. Prose is hand-written; facts are derived, so the wiki can never drift from the graph.
// Pure, zero-dep.

import { MATERIALS, PROCESSES, PROCESS, FAMILIES, compositionOf, fullOutputs, lossOf } from './graph.js';

// ── authored prose, one tight entry per id (material or process) ──
export const PROSE = {
  // materials — feedstock
  metal:     'Refined structural + conductive metal (Fe·Al·Cu), recovered from scrap. The backbone of the hull, machines and wiring — the most-demanded commodity on the ship.',
  silica:    'Refined silicate feedstock (Si·O), recovered from cullet. Becomes glass and ceramic — windows, substrates, refractory liners, insulation.',
  polymer:   'Plastic/composite feedstock, cracked from volatiles in the Polymer Reactor. Becomes resin: insulation, packaging, the soft parts of the built world.',
  volatiles: 'The chemical feedstock pool (C·H·O·N) — solvents, fuel base, the carbon the polymer and bio loops both draw on. Recovered by depolymerizing plastics and digesting organics.',
  water:     'Coolant, solvent, and life-support water. Cycled hard through the galley and grow vats; recovered as greywater by the Condenser (the iris seam). The hardest loop to close.',
  biomass:   'Living matter from the grow vats — the output of photosynthesis, milled into food. The biome seam: the organic loop is genuinely regenerative, energy turning nutrient + water back into mass.',
  trace:     'Catalysts, dopants, rare elements — the scarcest commodity aboard. Recoverable from spent catalyst, but it leaks into every other stream, so it is the keystone the whole factory is bottlenecked on.',
  // materials — intermediates / components
  plate:     'Rolled metal sheet. The workhorse intermediate — frames, hulls, gears all start here.',
  wire:      'Drawn metal wire. Feeds circuit boards and circuit assembly.',
  glass:     'Melted silica. Goes into panels and circuit boards.',
  ceramic:   'Kiln-fired silica — refractory, insulating. Stiffens frames.',
  resin:     'Extruded polymer. Laminates panels, binds fixtures, packages consumables.',
  nutrient:  'Synthesized or digested plant feed. The input the grow vats turn into biomass — the hinge of the bio-regenerative loop.',
  food:      'Milled biomass — the edible output that becomes consumables in the galley.',
  frame:     'A pressed structural skeleton (plate + ceramic). The shared bones of structures, fixtures and machines.',
  gear:      'A machined metal part. Drives machines.',
  board:     'A printed circuit board (glass + wire + trace). The substrate for chips.',
  chip:      'A fabricated logic chip (board + trace). The brains in machines and circuits.',
  panel:     'A laminated panel (glass + resin). Skins fixtures and circuits.',
  // materials — products
  structure: 'Deployed hull & deck (frame + plate). Mass-heavy, slowest-wearing — most of the ship\'s standing mass lives here.',
  fixture:   'Deployed room fitting (frame + panel + resin) — beds, consoles, vats, the built world you walk through.',
  machine:   'Deployed machine (gear + frame + chip) — the robots, tools and assembly lines of the Forge itself. The factory builds the factory.',
  circuit:   'Deployed control gear (chip + wire + panel) — the Seven, the nav, the Signal apparatus.',
  consumable:'Daily-use goods (food + resin + water) — meals, medicine, packaging. Wears almost completely each cycle, so it is the dominant load on the water + organic loops.',
  // materials — waste
  scrap_metal:   'Worn metal + mill offcuts. Fed to the Shredder.',
  scrap_mineral: 'Cullet — broken glass + ceramic. Fed to the Remelter.',
  scrap_carbon:  'Spent polymer. Depolymerized back to volatiles.',
  scrap_trace:   'Spent catalyst. The Recovery Still claws trace back from it — never completely.',
  organic_waste: 'Spent food, fiber and biomass. The Digester turns it back into nutrient, volatiles and water — the heart of bio-regeneration.',
  greywater:     'Used water. The Condenser distills it back to clean water (the iris seam).',
  mixed_scrap:   'Unsorted product wear. (In the current model products wear directly to their component scrap streams by composition, so this rarely accumulates.)',
  // processes — refine
  roll:     'The Rolling Mill flattens metal stock into plate. A little scale is lost to scrap each pass.',
  draw:     'The Wire Drawer pulls metal stock into wire for boards and circuits.',
  melt:     'The Glass Furnace melts silica into glass — the most energy-hungry refining step.',
  kiln:     'The Kiln fires silica into ceramic.',
  extrude:  'The Extruder forms polymer into resin.',
  polymerize:'The Polymer Reactor cracks volatiles into polymer — the chemistry step that lets the carbon loop close (digested organics + depolymerized plastic → volatiles → polymer).',
  // processes — fabricate
  frameshop:'The Frame Shop presses plate + ceramic into frames, the shared skeleton of three product lines.',
  machshop: 'The Machine Shop turns plate into gears.',
  boardfab: 'The Board Printer lays glass, wire and trace into circuit boards.',
  chipfab:  'The Chip Fab etches boards + trace into chips — the second-biggest trace sink, and energy-intensive.',
  panelfab: 'The Panel Shop laminates glass + resin into panels.',
  // processes — assemble
  as_struct:'The Hull Assembler joins frames + plate into deployed structure.',
  as_fix:   'The Fixture Line builds frames + panels into room fixtures.',
  as_mach:  'The Machine Assembler combines gears, frame and a chip into a machine — the Forge reproducing its own tools.',
  as_circ:  'The Circuit Line assembles chips, wire and panel into control circuits.',
  galley:   'The Galley turns food, resin and water into consumables. The biggest steady draw on the water + organic loops.',
  // processes — recycle (the industrial decomposers)
  shred:    'The Shredder reclaims metal scrap back to metal stock — the highest-throughput recycler, since metal is the most-used commodity.',
  cullet:   'The Remelter returns cullet (broken glass/ceramic) to silica.',
  depoly:   'The Depolymerizer breaks spent polymer back down to volatiles — feeding the carbon loop.',
  recover:  'The Recovery Still claws trace back from spent catalyst. Its yield is the lowest of any recycler (catalysts are hard to reclaim), which is why trace is the keystone leak.',
  // processes — bio-regen (the biome seam)
  digest:   'The Digester (the industrial decomposer for organics) breaks organic waste into nutrient, volatiles and water — the move that makes the ship\'s biology regenerative rather than consumptive.',
  synth:    'The Nutrient Synth makes plant feed from volatiles, water and a little trace — topping up the bio loop from the chemical pool.',
  grow:     'The Grow Vat is photosynthesis as infrastructure: nutrient + water + a large pour of ENERGY (light) become biomass. The single biggest energy draw on the floor — the tide seam made concrete.',
  mill:     'The Food Mill turns biomass into food.',
  // processes — seam
  condense: 'The Condenser distills greywater back to clean water — the iris seam, and the main brake on the ship\'s water makeup.',
};

const COMMODITY_FAMILY = { metal: 'metal', silica: 'mineral', polymer: 'carbon', volatiles: 'carbon', water: 'water', biomass: 'organic', trace: 'trace' };
const fmtRecipe = (bag) => Object.entries(bag).map(([m, q]) => `${+q.toFixed(2)}×${(MATERIALS[m] || {}).name || m}`).join(' + ');

// a full wiki entry for an id: authored prose + derived facts. `kind` is 'material' | 'process'.
export function wikiEntry(id) {
  if (PROCESS[id]) {
    const p = PROCESS[id];
    return {
      id, kind: 'process', title: p.name, glyph: p.glyph, machine: p.machine, category: p.kind,
      prose: PROSE[id] || '',
      inputs: p.in, outputs: fullOutputs(p), energy: p.energy, loss: lossOf(p),
      see: [...new Set([...Object.keys(p.in), ...Object.keys(p.out)])],
    };
  }
  const M = MATERIALS[id]; if (!M) return null;
  const madeBy = PROCESSES.filter((p) => fullOutputs(p)[id]).map((p) => p.id);
  const usedBy = PROCESSES.filter((p) => p.in[id]).map((p) => p.id);
  return {
    id, kind: 'material', title: M.name, glyph: M.glyph, family: M.family, materialKind: M.kind, tier: M.tier, mass: M.mass,
    prose: PROSE[id] || '',
    composition: M.kind === 'product' ? compositionOf(id) : null,
    madeBy, usedBy, see: [...new Set([...madeBy, ...usedBy])],
  };
}

// the whole wiki, packaged (for the page to render an index + per-node panels). Flags any id missing prose.
export function buildWiki() {
  const materials = Object.keys(MATERIALS).map(wikiEntry);
  const processes = PROCESSES.map((p) => wikiEntry(p.id));
  const missing = [...materials, ...processes].filter((e) => !e.prose).map((e) => e.id);
  return { materials, processes, families: FAMILIES, missing, fmtRecipe: undefined };
}
export { fmtRecipe };
