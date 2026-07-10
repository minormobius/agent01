// org/person.js — meat on the bones of an org-chart box.
//
// Given a node in the org tree (its rank, department, vertical) plus the org
// seed, this deterministically produces the PERSON in that box: demographics,
// a triad of work-domains expressed into nine attributes, a temperament, a
// couple of quirks, and their intrinsic performance (individual output +
// leadership). The org-level dynamics that need the whole tree — morale,
// effective output, overload, flight risk — are layered on in engine.js; this
// module is just "who is this person, on their own."
//
// It rhymes on purpose with hoop's stats.js (the game's NPC spine):
//   - the same xmur3+mulberry32 determinism (same lineage as names/org),
//   - a TRIAD × POWER blend expressed into attributes with per-attribute
//     jitter (hoop's flesh/chassis/anima → here craft/drive/wit, the work
//     version: the hands, the fire, the mind),
//   - a `vocation` drawn from hoop's 13 civic verbs, so an org person can be
//     dropped into hoop as an NPC later (the bridge to the city sim).
//
// Deterministic: (seed, node.id) ⇒ the same person on every machine, forever.

// ---------- seeded PRNG (xmur3 + mulberry32) ----------

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function streamFrom(seedStr) { return mulberry32(xmur3(String(seedStr))()); }
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ri = (x) => Math.round(x);
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---------- the work triad ----------
//
// hoop's spine is flesh/chassis/anima (the meat, the frame, the ghost). The
// WORK spine is the same idea pointed at labour:
//   craft — the hands: task skill, rigour, accumulated experience.
//   drive — the fire:  energy, ambition, grit.
//   wit   — the mind:  judgment, rapport, integrity.
// A box's blend is leaned mostly by its RANK (leaders are wit-heavy, workers
// craft-heavy) plus its vocation, then floored so no domain is ever zero.

export const DOMAINS = {
  craft: { label: 'Craft', glyph: '✎', accent: '#c79a3a', gloss: 'the hands — skill, rigour, experience' },
  drive: { label: 'Drive', glyph: '▲', accent: '#cf3b3b', gloss: 'the fire — energy, ambition, grit' },
  wit:   { label: 'Wit',   glyph: '❖', accent: '#5b8bd0', gloss: 'the mind — judgment, rapport, integrity' },
};
export const DOMAIN_ORDER = ['craft', 'drive', 'wit'];
const FLOOR = 0.12;

export const ATTRS = {
  skill:      { domain: 'craft', label: 'Skill',      gloss: 'raw competence at the actual work' },
  rigor:      { domain: 'craft', label: 'Rigor',      gloss: 'quality, reliability, follow-through' },
  experience: { domain: 'craft', label: 'Experience', gloss: 'accumulated know-how (tracks tenure)' },
  energy:     { domain: 'drive', label: 'Energy',     gloss: 'throughput — how much they get done' },
  ambition:   { domain: 'drive', label: 'Ambition',   gloss: 'the want to climb' },
  grit:       { domain: 'drive', label: 'Grit',       gloss: 'resilience under load' },
  judgment:   { domain: 'wit',   label: 'Judgment',   gloss: 'decision quality — matters most up top' },
  rapport:    { domain: 'wit',   label: 'Rapport',    gloss: 'coordination, influence, reading a room' },
  integrity:  { domain: 'wit',   label: 'Integrity',  gloss: 'acts for the org, not just themselves' },
};
export const ATTR_ORDER = Object.keys(ATTRS);

// dominant-pair temperament — a person's "what are you" in one word.
export const CASTS = {
  'craft.craft': { label: 'Master',     gloss: 'all hands — the deepest specialist in the room' },
  'craft.drive': { label: 'Grinder',    gloss: 'skilled and tireless — out-works everyone' },
  'craft.wit':   { label: 'Architect',  gloss: 'skill wedded to judgment — designs the system' },
  'drive.drive': { label: 'Firebrand',  gloss: 'pure fire — burns bright, sometimes out' },
  'drive.craft': { label: 'Workhorse',  gloss: 'driven and capable — the load-bearing wall' },
  'drive.wit':   { label: 'Operator',   gloss: 'ambition steered by cunning — the climber' },
  'wit.wit':     { label: 'Schemer',    gloss: 'all mind — three moves ahead, thin on delivery' },
  'wit.craft':   { label: 'Sage',       gloss: 'judgment rooted in real craft — trusted counsel' },
  'wit.drive':   { label: 'Politician', gloss: 'reads the room and wants the corner office' },
};

// ---------- vocation bridge to hoop ----------
//
// Each org box is tagged with one of hoop's 13 civic verbs (the same set that
// breeds towns in hoop/econ and dresses the sprites), so an org person is a
// valid hoop NPC. Departments map to a verb; rank-less verticals fall back to
// the vertical default, and the apex leans `govern` (leadership) everywhere.

const VOCATION_TAGS = {
  dwell: 'Tenant', grow: 'Tender', make: 'Wright', mend: 'Mender', trade: 'Factor',
  serve: 'Steward', play: 'Player', heal: 'Chirurgeon', learn: 'Adept', worship: 'Celebrant',
  govern: 'Warden', move: 'Runner', store: 'Keeper',
};

const DEPT_VOCATION = {
  // corp / startup
  Engineering: 'make', Finance: 'trade', Sales: 'trade', Marketing: 'play', Product: 'make',
  Operations: 'store', People: 'serve', Legal: 'govern', Data: 'learn', Security: 'govern',
  Growth: 'trade', Community: 'serve',
  // academic colleges
  'Arts & Sciences': 'learn', Medicine: 'heal', Law: 'govern', Business: 'trade', Humanities: 'learn',
  // monastic offices
  'the Cellary': 'store', 'the Almonry': 'serve', 'the Sacristy': 'worship', 'the Infirmary': 'heal',
  'the Scriptorium': 'learn', 'the Novitiate': 'learn', 'the Choir': 'worship',
  // military arms
  Infantry: 'move', Armor: 'move', Artillery: 'make', Logistics: 'store', Intelligence: 'learn',
  Signals: 'learn', Engineers: 'make', Medical: 'heal',
};
const VERTICAL_VOCATION = {
  corp: 'govern', startup: 'make', military: 'move', feudal: 'govern',
  crime: 'trade', monastic: 'worship', academic: 'learn', ecclesiastic: 'worship',
};

function vocationFor(node, ctx) {
  if (node.rankIdx === 0) return 'govern';                       // the boss governs
  if (node.dept && DEPT_VOCATION[node.dept]) return DEPT_VOCATION[node.dept];
  return VERTICAL_VOCATION[ctx.vertical] || 'serve';
}

// ---------- quirks ----------
//
// Small procedural flavour that nudges a couple of attributes — the org cousin
// of hoop's characteristics. Each leans the person one way; picked 0–2 per box.

const QUIRKS = [
  { label: 'detail-obsessed',   mods: { rigor: 12, energy: -6 }, gloss: 'nothing ships with a typo; nothing ships fast' },
  { label: 'empire-builder',    mods: { ambition: 14, integrity: -10 }, gloss: 'headcount is the metric that matters' },
  { label: 'team player',       mods: { rapport: 12, ambition: -8 }, gloss: 'lifts the room, never themselves' },
  { label: 'burned out',        mods: { energy: -14, grit: -8 }, gloss: 'running on fumes and habit' },
  { label: 'rising star',       mods: { skill: 10, ambition: 10 }, gloss: 'everyone can see it coming' },
  { label: 'quietly coasting',  mods: { energy: -10, ambition: -10 }, gloss: 'vested, comfortable, invisible' },
  { label: 'brilliant jerk',    mods: { skill: 14, rapport: -14 }, gloss: 'indispensable and insufferable' },
  { label: 'safe pair of hands',mods: { rigor: 10, ambition: -6 }, gloss: 'give it to them and stop worrying' },
  { label: 'political animal',  mods: { rapport: 12, integrity: -12 }, gloss: 'always in the right meeting' },
  { label: 'true believer',     mods: { integrity: 14, grit: 6 }, gloss: 'in it for the mission, not the money' },
  { label: 'lone wolf',         mods: { skill: 8, rapport: -10 }, gloss: 'does great work in a room by themselves' },
  { label: 'natural mentor',    mods: { rapport: 10, judgment: 6 }, gloss: 'grows the people around them' },
  { label: 'flight-ready',      mods: { ambition: 12, integrity: -6 }, gloss: 'CV is always up to date' },
  { label: 'institution',       mods: { experience: 12, energy: -6 }, gloss: 'been here longer than the logo' },
];

// ---------- the person factory ----------

export function makePerson(node, ctx) {
  const rng = streamFrom(`${ctx.seed}|${ctx.vertical}|person|${node.id}`);
  const ranks = ctx.rankCount;
  // t: 0 at the apex, 1 at the individual contributor.
  const t = ranks > 1 ? node.rankIdx / (ranks - 1) : 0;

  // Seniority → power scalar (promotion correlates with capability).
  const power = clamp(6 + (1 - t) * 8 + (rng() - 0.5) * 3, 4, 15);

  // Rank-leaned work triad: leaders wit-heavy, workers craft-heavy, drive ~flat.
  const vocation = vocationFor(node, ctx);
  const lean = {
    craft: 0.22 + 0.55 * t,
    drive: 0.34 + (rng() - 0.5) * 0.1,
    wit: 0.55 - 0.38 * t,
  };
  const triad = normTriad({
    craft: clamp(lean.craft + (rng() - 0.5) * 0.4, 0, 1),
    drive: clamp(lean.drive + (rng() - 0.5) * 0.4, 0, 1),
    wit: clamp(lean.wit + (rng() - 0.5) * 0.4, 0, 1),
  });

  // Demographics.
  const age = ri(clamp(30 + (1 - t) * 20 + (rng() - 0.5) * 14, 22, 68));
  const tenure = ri(clamp(1 + (1 - t) * 12 + (rng() - 0.5) * 6, 0, age - 21));

  // Express the triad into the nine attributes (× power, × per-attribute jitter).
  const attrs = {};
  for (const k of ATTR_ORDER) {
    const w = triad[ATTRS[k].domain];
    const jitter = 0.86 + rng() * 0.28;
    attrs[k] = ri(clamp(46 * (0.4 + 1.2 * w) * (power / 10) * jitter, 3, 100));
  }
  // Experience is really a function of tenure, not the triad — override it.
  attrs.experience = ri(clamp(16 + tenure * 4.6 + attrs.skill * 0.12 + (rng() - 0.5) * 10, 3, 100));

  // Quirks nudge specific attributes.
  const traits = [];
  const nq = rng() < 0.35 ? 0 : rng() < 0.85 ? 1 : 2;
  const pool = QUIRKS.slice();
  for (let i = 0; i < nq && pool.length; i++) {
    const q = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    traits.push({ label: q.label, gloss: q.gloss });
    for (const [k, d] of Object.entries(q.mods)) attrs[k] = ri(clamp(attrs[k] + d, 3, 100));
  }

  const cast = castOf(triad);

  // Intrinsic performance (no org context needed):
  //   output     — individual productive capacity (what an IC contributes).
  //   leadership — the multiplier a manager applies to their reports' output.
  const output = ri(clamp(0.5 * attrs.skill + 0.22 * attrs.rigor + 0.28 * attrs.energy, 1, 100));
  const leadership = +(0.62 + (0.5 * attrs.judgment + 0.5 * attrs.rapport) / 100 * 0.9).toFixed(3);

  // Identity (id/name/title/tier/dept) lives on the node — the person carries
  // only what's new, to keep the tree payload lean.
  return {
    age, tenure, vocation, vocationTag: VOCATION_TAGS[vocation],
    triad: { craft: +triad.craft.toFixed(3), drive: +triad.drive.toFixed(3), wit: +triad.wit.toFixed(3) },
    power: +power.toFixed(1), cast: cast.label, castGloss: cast.gloss,
    attrs, traits,
    output, leadership,
  };
}

function normTriad(w) {
  const raw = {}; let s = 0;
  for (const d of DOMAIN_ORDER) { raw[d] = Math.max(0, w[d] || 0); s += raw[d]; }
  const out = {};
  for (const d of DOMAIN_ORDER) { const share = s > 0 ? raw[d] / s : 1 / 3; out[d] = FLOOR + (1 - 3 * FLOOR) * share; }
  return out;
}

export function castOf(triad) {
  const o = DOMAIN_ORDER.slice().sort((a, b) => triad[b] - triad[a]);
  const spread = triad[o[0]] - triad[o[1]];
  const key = spread > 0.30 ? `${o[0]}.${o[0]}` : `${o[0]}.${o[1]}`;
  return { key, dominant: o[0], second: o[1], ...(CASTS[key] || CASTS[`${o[0]}.${o[0]}`]) };
}

export function personCatalog() {
  return {
    domains: DOMAINS,
    attrs: Object.fromEntries(Object.entries(ATTRS).map(([k, v]) => [k, { label: v.label, domain: v.domain, gloss: v.gloss }])),
    casts: Object.fromEntries(Object.entries(CASTS).map(([k, v]) => [k, v.label])),
    vocations: VOCATION_TAGS,
    note: 'every box carries a person; org-level metrics (morale, effective output, overload, flight risk) are computed over the whole tree in the org engine.',
  };
}
