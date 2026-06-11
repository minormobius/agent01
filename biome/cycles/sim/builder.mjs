// biome/cycles/sim/builder.mjs — design ANY food web, run it, read its stability.
//
// The dashboard, lake and global pages each display ONE hard-wired web. This is the open
// workbench: a "design" is plain data (a list of species + their diet), and this module turns
// it into engine params, runs it to steady state, analyses its stability, and serialises it to
// a URL so a web you built can be DISPLAYED to anyone. No backend — the whole design rides in
// the link (biome stays pure-static).
//
// A design reuses the SAME species shape the rosters use, so everything the engine, allometry
// and stability solver already do applies unchanged:
//   { name, crew, photoperiod, species: [
//       // producer (area-based): fixes CO₂, turns over into food + litter
//       { id, name, kind:'producer', area_m2, fix, autoResp, turnover, harvestIndex, initDensity },
//       // animal (mass-based via allometry): rates DERIVED from body mass + guild + thermy
//       { id, name, kind:'animal', mass_g, guild, thermy, count|initBio,
//         eats:[ids|'litter'], halfSat, pollinates, fruitPerday, harvest, capacityFrac } ] }
//
// Pure, zero-dep, node + browser. The compiled community conserves C/H/O/N by construction —
// it is the same paired-flux engine — no matter what the user builds.

import { defaultParams, defaultState, run, KCAL_PER_MOL_CH2O } from './cycles.mjs';
import { buildCommunity, validateRoster, ROSTER } from './roster.mjs';
import { GUILDS } from './allometry.mjs';
import { LAKE_ROSTER } from './lake.mjs';
import { analyzeStability } from './stability.mjs';

export const GUILD_NAMES = Object.keys(GUILDS);   // for the editor's dropdown

// Sensible defaults so a half-filled species still integrates instead of NaN-ing.
const PRODUCER_DEFAULTS = { area_m2: 3000, fix: 1.5, autoResp: 0.35, turnover: 0.02, harvestIndex: 0.2, initDensity: 8 };
const ANIMAL_DEFAULTS = { mass_g: 10, guild: 'herbivore', thermy: 'ecto', eats: [], halfSat: 1000, harvest: 0 };

let _uid = 0;
export const freshId = (prefix = 's') => `${prefix}${Date.now().toString(36).slice(-4)}${(_uid++).toString(36)}`;

// Fill missing fields so the engine never sees an undefined. Pure (returns a copy).
export function normalizeSpecies(s) {
  if (s.kind === 'producer') return { ...PRODUCER_DEFAULTS, ...s, kind: 'producer', name: s.name || s.id };
  const a = { ...ANIMAL_DEFAULTS, ...s, kind: 'animal', name: s.name || s.id };
  if (!GUILDS[a.guild]) a.guild = 'herbivore';
  a.eats = Array.isArray(a.eats) ? a.eats : [];
  // size the starting stock by COUNT (×body mass via allometry) or an explicit biomass — but
  // only default to a head-count when the design gave neither, so an `initBio` is never clobbered.
  if (a.count == null && a.initBio == null) a.count = 1000;
  return a;
}

// Validate a design before compiling: returns a list of human-readable problems ([] = ok).
export function validateDesign(design) {
  const problems = [];
  const sp = design.species || [];
  if (!sp.length) problems.push('Add at least one species.');
  if (!sp.some((s) => s.kind === 'producer')) problems.push('A closed web needs at least one producer (only producers fix carbon).');
  const ids = sp.map((s) => s.id);
  if (new Set(ids).size !== ids.length) problems.push('Two species share an id — ids must be unique.');
  // lean on the roster validator for diet-target / mass / area checks
  try {
    const roster = sp.map((s) => (s.kind === 'producer'
      ? { ...normalizeSpecies(s) }
      : { ...normalizeSpecies(s), pollinates: s.pollinates || undefined }));
    for (const p of validateRoster(roster)) problems.push(p);
  } catch (e) { problems.push(String(e.message || e)); }
  return problems;
}

// Compile a design → engine params. Animals carry `harvest` through buildCommunity's override.
export function designToParams(design) {
  const p = defaultParams();
  if (design.crew != null) p.crew = design.crew;
  if (design.photoperiod != null) p.photoperiod = design.photoperiod;
  const roster = (design.species || []).map((raw) => {
    const s = normalizeSpecies(raw);
    if (s.kind === 'producer') return s;
    const o = { ...s, plant: undefined };           // makeAnimal reads `plant`, not `pollinates`
    if (s.pollinates) o.pollinates = s.pollinates;   // roster.buildCommunity maps pollinates→plant
    if (s.harvest) o.override = { ...(s.override || {}), harvest: s.harvest };
    return o;
  });
  const c = buildCommunity(roster);
  p.species = c.species;
  p.interactions = c.interactions;
  // keep the abiotic box proportional to crew so the closure verdict is per-crew-sane
  p.airVolume_m3 = p.crew * 50000;
  p.waterReservoir_L = (design.waterPerCrew != null ? design.waterPerCrew : 9000) * p.crew;
  return p;
}

const finite = (x) => typeof x === 'number' && isFinite(x);

// The headline call: compile, run to steady state, analyse stability, return everything the
// page needs — plus a plain-language read on whether the web closes AND survives.
export function analyzeDesign(design, { days = 500, dtHours = 3 } = {}) {
  const problems = validateDesign(design);
  if (problems.length) return { ok: false, problems };
  let params;
  try { params = designToParams(design); }
  catch (e) { return { ok: false, problems: [String(e.message || e)] }; }

  let traj, last;
  try {
    traj = run(params, defaultState(params), days, dtHours, Math.max(2, Math.round(days / 120)));
    last = traj[traj.length - 1];
  } catch (e) { return { ok: false, problems: ['The web blew up numerically: ' + (e.message || e)] }; }
  if (!last || !finite(last.o2_kPa) || !finite(last.co2_ppm)) {
    return { ok: false, problems: ['The web blew up numerically (a rate is too large for the integrator). Try gentler fixation/ingestion.'] };
  }

  const crewDemand_molday = (params.crew * params.human_kcal_day) / KCAL_PER_MOL_CH2O;
  const foodDays = last.food_molC / Math.max(crewDemand_molday, 1e-9);
  const extinct = params.species.filter((s) => (last[s.id] ?? 0) < 1e-3).map((s) => s.id);
  const closure = {
    o2_kPa: last.o2_kPa, co2_ppm: last.co2_ppm, rh: last.rh,
    calorieRatio: last.calorieRatio, foodDays,
    o2OK: last.o2_kPa > 17 && last.o2_kPa < 24,
    // closure only fails on a CRASHED (producers dead) or TOXIC (runaway) atmosphere — a merely
    // low CO₂ is a working low-buffer regime, flagged as a warning, not a closure failure.
    co2OK: last.co2_ppm > 5 && last.co2_ppm < 6000,
    co2Low: last.co2_ppm < 150,
    fedOK: last.calorieRatio >= 1 && foodDays > 3,
    extinct,
  };
  closure.closes = closure.o2OK && closure.co2OK && closure.fedOK && extinct.length === 0;

  let stability = null;
  try { stability = analyzeStability(params, { days: Math.max(600, days) }); }
  catch (e) { stability = { error: String(e.message || e) }; }

  return {
    ok: true, params, traj, last, closure, stability,
    graph: buildDesignGraph(params),
    verdict: designVerdict(closure, stability),
  };
}

function designVerdict(c, s) {
  const closeBit = c.closes
    ? `Closes — air holds (O₂ ${c.o2_kPa.toFixed(1)} kPa, CO₂ ${Math.round(c.co2_ppm)} ppm) and the food store steadies at ${c.foodDays.toFixed(0)} days.`
      + (c.co2Low ? ` (CO₂ is low — a perennial standing-biomass producer would buffer it.)` : '')
    : `Does not close — ${[
        !c.o2OK && `O₂ ${c.o2_kPa.toFixed(1)} kPa off-band`,
        !c.co2OK && (c.co2_ppm <= 5 ? `CO₂ crashed to ${Math.round(c.co2_ppm)} ppm (producers out-fixing the web's resupply)` : `CO₂ runaway (${Math.round(c.co2_ppm)} ppm)`),
        !c.fedOK && `food supply ${(c.calorieRatio * 100).toFixed(0)}% of demand`,
        c.extinct.length && `extinct: ${c.extinct.join(', ')}`,
      ].filter(Boolean).join('; ')}.`;
  const stabBit = !s ? '' : s.error ? ` Stability: ${s.error}.`
    : s.stable ? ` And it's ${s.marginal ? 'marginally ' : ''}stable (${s.verdict})`
    : ` But it's unstable (${s.verdict})`;
  return closeBit + stabBit;
}

// ── A drawable graph for the editor: species + the litter pool if any edge uses it. ──
export function buildDesignGraph(params) {
  const usesLitter = params.interactions.some((e) => e.type === 'trophic' && e.resources.includes('litter'));
  const nodes = params.species.map((s) => ({ id: s.id, label: s.name || s.id, kind: s.kind, role: s.role, guild: s.guild }));
  if (usesLitter) nodes.push({ id: 'litter', label: 'detritus', kind: 'pool' });
  const edges = [];
  for (const e of params.interactions) {
    if (e.type === 'trophic') for (const r of e.resources) edges.push({ from: r, to: e.consumer, type: 'trophic' });
    else if (e.type === 'pollinates') edges.push({ from: e.animal, to: e.plant, type: 'pollinates' });
  }
  return { nodes, edges };
}

// ── Share codec: design ⇄ URL-safe string (carried in the page hash). node + browser. ──
const toB64 = (s) => (typeof btoa !== 'undefined')
  ? btoa(unescape(encodeURIComponent(s)))
  : Buffer.from(s, 'utf8').toString('base64');
const fromB64 = (b) => (typeof atob !== 'undefined')
  ? decodeURIComponent(escape(atob(b)))
  : Buffer.from(b, 'base64').toString('utf8');
export function encodeDesign(design) {
  return toB64(JSON.stringify(design)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeDesign(str) {
  const b = str.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(fromB64(b));
}

// ── Presets: real starting points the user can edit. ──
function rosterToDesign(name, crew, roster) {
  return { name, crew, photoperiod: 0.7, species: JSON.parse(JSON.stringify(roster)).map((o) => ({
    ...o, name: o.common || o.name || o.id,
    harvest: o.override?.harvest ?? o.harvest,
  })) };
}
export function presets() {
  return {
    minimal: {
      name: 'Minimal: grass → rabbit → fox', crew: 8, photoperiod: 0.7,
      species: [
        { id: 'grass', name: 'Grass', kind: 'producer', area_m2: 4500, fix: 1.9, autoResp: 0.35, turnover: 0.05, harvestIndex: 0.4, initDensity: 8 },
        { id: 'rabbit', name: 'Rabbit', kind: 'animal', mass_g: 1500, guild: 'herbivore', thermy: 'endo', count: 300, eats: ['grass'], halfSat: 3000, harvest: 0.005 },
        { id: 'fox', name: 'Fox', kind: 'animal', mass_g: 6000, guild: 'carnivore', thermy: 'endo', count: 5, eats: ['rabbit'], halfSat: 200 },
        { id: 'worm', name: 'Earthworms', kind: 'animal', mass_g: 0.5, guild: 'detritivore', thermy: 'ecto', initBio: 50000, eats: ['litter'], halfSat: 9000 },
      ],
    },
    land: rosterToDesign('Terrestrial roster (orchard)', 100, ROSTER),
    lake: { ...rosterToDesign('Lake bioengine', 100, LAKE_ROSTER), waterPerCrew: 12000 },
  };
}

const Builder = {
  GUILD_NAMES, freshId, normalizeSpecies, validateDesign, designToParams, analyzeDesign,
  buildDesignGraph, encodeDesign, decodeDesign, presets,
};
if (typeof globalThis !== 'undefined') globalThis.Builder = Builder;
export default Builder;
