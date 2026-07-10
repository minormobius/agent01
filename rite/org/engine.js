// org — a procedural org-chart engine.
//
// Sister to names/. Where names mints one coherent SET of names from an
// invented culture, org mints one coherent HIERARCHY: a whole organisation —
// its ladder of ranks, its titles, its departments, and the people filling
// every box — from a single seed.
//
// The two similarity vectors mirror names' (culture, setting):
//   vertical — the *industry*: its rank ladder + title vocabulary + branches.
//              A corporation, a legion, a duchy, a crime family, an abbey, a
//              university, a curia. This is the "culture" analog — it decides
//              what the titles ARE.
//   shape    — the *topology*: how the tree branches. Pyramid, tall-and-narrow,
//              flat, wide, matrix (dotted lines), cellular (compartmented cells),
//              or fractal (endless — see below). This is the "setting" analog —
//              a transform laid over the vertical that decides the tree's SHAPE.
//
// The people are named by the names/ engine, imported verbatim — a corp draws
// Romance full-names, a legion draws Frankish ones, a crime family draws
// wasteland-register names (Salvatore the Rusted), a duchy draws fantasy ones
// with epithets (Roderick the Grim, Baron of Aldermoor).
//
// THE INFINITE ORG CHART. A real chart bottoms out at the individual
// contributor. This one doesn't have to: ask /api/org/node for ANY node and it
// expands one level of reports — and when you hit the bottom rank, the engine
// WRAPS: the lowest clerk is quietly revealed to be the apex of their own
// shadow sub-organisation, which has its own ladder, all the way down. Every
// worker is a CEO of a department of one, who has reports, forever. Because it's
// deterministic (same seed + node-id → same node on any machine, always), a URL
// like /org/?id=r.4.2.7 is a permanent address in an unbounded company.
//
// Deterministic: no Date.now(), no unseeded Math.random(). Runs identically in
// the Cloudflare worker, the browser, and node (selftest in engine.selftest.mjs).

import { generateSet } from '../names/engine.js';
import { makePerson, personCatalog } from './person.js';

// ---------- seeded PRNG (xmur3 + mulberry32, same lineage as names) ----------

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

function rngFrom(seedStr) { return mulberry32(xmur3(String(seedStr))()); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- verticals ----------
//
// Each vertical is a rank LADDER (apex → individual contributor) plus a set of
// BRANCHES (the "departments" — each carries its own head-title `chief` and its
// own foot-soldier nouns `ic`/`spec`). A rank's `titles` are templates over
// tokens the engine fills at build time:
//   {dept}  the branch name           {ic}   a contributor noun for the branch
//   {spec}  a specialty for the branch {unit} this node's named command / holding
//   {ord}   this node's ordinal among its siblings (1st, 2nd, …)
// A rank with `useChief: true` ignores its templates and uses the branch's own
// `chief` title. A rank with `unitWord` names each node an ordinal command
// ("3rd Battalion"); `unitPlace: true` mints a toponym instead ("of Aldermoor",
// via the names engine). `span: [lo, hi]` is the raw report count before the
// shape's multiplier; a `[0, 0]` span marks the leaf rank.

export const VERTICALS = {
  corp: {
    label: 'Corporation', blurb: 'The C-suite pyramid: CEO over a cabinet of chiefs, then EVP → VP → Director → Manager → Lead → IC, split by function.',
    nameCulture: 'romance', nameSetting: 'classical',
    orgName: ['{family} Industries', '{family} Corporation', '{family} Global', '{family} Systems', '{place} Holdings', '{family} Group'],
    branches: [
      { name: 'Engineering', chief: 'Chief Technology Officer', ic: ['Engineer', 'Developer', 'Architect'], spec: ['Backend', 'Frontend', 'Platform', 'Infrastructure'] },
      { name: 'Finance', chief: 'Chief Financial Officer', ic: ['Analyst', 'Accountant', 'Controller'], spec: ['Treasury', 'Audit', 'FP&A'] },
      { name: 'Sales', chief: 'Chief Revenue Officer', ic: ['Account Executive', 'Sales Rep', 'Account Manager'], spec: ['Enterprise', 'Mid-Market', 'Field'] },
      { name: 'Marketing', chief: 'Chief Marketing Officer', ic: ['Marketer', 'Brand Manager', 'Copywriter'], spec: ['Brand', 'Demand Gen', 'Content'] },
      { name: 'Product', chief: 'Chief Product Officer', ic: ['Product Manager', 'Designer', 'Researcher'], spec: ['Growth', 'Core', 'Platform'] },
      { name: 'Operations', chief: 'Chief Operating Officer', ic: ['Operations Analyst', 'Coordinator', 'Program Manager'], spec: ['Supply Chain', 'Facilities', 'Vendor'] },
      { name: 'People', chief: 'Chief People Officer', ic: ['Recruiter', 'HR Partner', 'People Ops'], spec: ['Talent', 'L&D', 'Benefits'] },
      { name: 'Legal', chief: 'General Counsel', ic: ['Counsel', 'Paralegal', 'Compliance Officer'], spec: ['Corporate', 'IP', 'Regulatory'] },
      { name: 'Data', chief: 'Chief Data Officer', ic: ['Data Scientist', 'Data Analyst', 'ML Engineer'], spec: ['Analytics', 'ML', 'Governance'] },
      { name: 'Security', chief: 'Chief Information Security Officer', ic: ['Security Engineer', 'Analyst', 'Pentester'], spec: ['AppSec', 'GRC', 'Detection'] },
    ],
    ranks: [
      { key: 'exec', label: 'Chief Executive', titles: ['Founder & Chief Executive Officer', 'Chief Executive Officer', 'President & CEO'], span: [4, 7] },
      { key: 'csuite', label: 'C-Suite', useChief: true, span: [2, 4] },
      { key: 'svp', label: 'Senior Vice President', titles: ['Executive Vice President, {dept}', 'Senior Vice President of {dept}', 'SVP, {dept}'], span: [2, 4] },
      { key: 'vp', label: 'Vice President', titles: ['Vice President of {dept}', 'VP, {dept}', 'VP of {spec}'], span: [3, 5] },
      { key: 'dir', label: 'Director', titles: ['Senior Director, {dept}', 'Director of {dept}', 'Director, {spec}'], span: [3, 5] },
      { key: 'mgr', label: 'Manager', titles: ['Senior Manager, {dept}', '{dept} Manager', 'Manager, {spec}'], span: [4, 7] },
      { key: 'lead', label: 'Team Lead', titles: ['Team Lead, {spec}', 'Staff {ic}', 'Principal {ic}'], span: [3, 6] },
      { key: 'ic', label: 'Individual Contributor', leaf: true, titles: ['{ic}', 'Senior {ic}', '{spec} {ic}', 'Associate {ic}'], span: [0, 0] },
    ],
  },

  startup: {
    label: 'Startup', blurb: 'Flat and ironic: a couple of founders, a thin layer of Heads-of, and a scrum of Ninjas, Wizards, and Chaos Coordinators.',
    nameCulture: 'romance', nameSetting: 'classical',
    orgName: ['{family}ly', '{family}.ai', '{family} Labs', '{family}io', 'Hyper{family}', '{family}stack'],
    branches: [
      { name: 'Engineering', chief: 'Co-Founder & CTO', ic: ['Engineer', 'Full-Stack Developer', 'Design Engineer', 'Hacker'], spec: ['Platform', 'AI', 'Frontend'] },
      { name: 'Growth', chief: 'Head of Growth', ic: ['Growth Ninja', 'Growth Hacker', 'Marketer'], spec: ['Paid', 'Viral', 'Lifecycle'] },
      { name: 'Product', chief: 'Chief Product Officer', ic: ['Product Wizard', 'Product Manager', 'Designer'], spec: ['Core', '0-to-1'] },
      { name: 'Operations', chief: 'Chief of Staff', ic: ['Chaos Coordinator', 'Generalist', 'Ops Lead'], spec: ['People', 'Finance'] },
      { name: 'Community', chief: 'Head of Community', ic: ['Community Manager', 'Evangelist', 'DevRel'], spec: ['Discord', 'Events'] },
    ],
    ranks: [
      { key: 'exec', label: 'Founder', titles: ['Founder & CEO', 'Co-Founder & CEO', 'Founder'], span: [2, 5] },
      { key: 'head', label: 'Head Of', useChief: true, span: [1, 3] },
      { key: 'lead', label: 'Founding Team', titles: ['Founding {ic}', 'Staff {ic}', 'Head of {spec}'], span: [2, 4] },
      { key: 'senior', label: 'Senior', titles: ['Senior {ic}', '{ic}', 'Lead {ic}'], span: [2, 5] },
      { key: 'ic', label: 'Team', leaf: true, titles: ['{ic}', 'Junior {ic}', '{spec} {ic}'], span: [0, 0] },
    ],
  },

  military: {
    label: 'Legion', blurb: 'The rigid pyramid: General → Division → Brigade → Regiment → Battalion → Company → Platoon → Squad → the enlisted. Everything is numbered.',
    nameCulture: 'frankish', nameSetting: 'classical',
    orgName: ['the {place} Command', 'the Army of {place}', 'the {place} Expeditionary Force', 'the Grand Army of {place}'],
    branches: [
      { name: 'Infantry', chief: 'Major General, Infantry', ic: ['Rifleman', 'Private', 'Trooper'], spec: ['Line', 'Light', 'Grenadier'] },
      { name: 'Armor', chief: 'Major General, Armor', ic: ['Tank Crewman', 'Driver', 'Gunner'], spec: ['Heavy', 'Recon'] },
      { name: 'Artillery', chief: 'Major General, Artillery', ic: ['Gunner', 'Loader', 'Spotter'], spec: ['Field', 'Siege'] },
      { name: 'Logistics', chief: 'Major General, Logistics', ic: ['Quartermaster', 'Driver', 'Storekeeper'], spec: ['Supply', 'Transport'] },
      { name: 'Intelligence', chief: 'Major General, Intelligence', ic: ['Analyst', 'Scout', 'Interrogator'], spec: ['SIGINT', 'Recon'] },
      { name: 'Signals', chief: 'Major General, Signals', ic: ['Signaller', 'Operator', 'Technician'], spec: ['Radio', 'Cipher'] },
      { name: 'Engineers', chief: 'Major General, Engineers', ic: ['Sapper', 'Pioneer', 'Combat Engineer'], spec: ['Bridging', 'Demolition'] },
      { name: 'Medical', chief: 'Major General, Medical', ic: ['Medic', 'Orderly', 'Corpsman'], spec: ['Field', 'Surgical'] },
    ],
    ranks: [
      { key: 'general', label: 'High Command', titles: ['General of the Army', 'Commanding General', 'Field Marshal'], span: [3, 6] },
      { key: 'division', label: 'Division', titles: ['Major General, {unit}', 'Division Commander, {unit}'], unitWord: 'Division', span: [2, 4] },
      { key: 'brigade', label: 'Brigade', titles: ['Brigadier, {unit}', 'Colonel Commanding {unit}'], unitWord: 'Brigade', span: [2, 4] },
      { key: 'regiment', label: 'Regiment', titles: ['Colonel, {unit}', 'Lieutenant Colonel, {unit}'], unitWord: 'Regiment', span: [2, 4] },
      { key: 'battalion', label: 'Battalion', titles: ['Major, {unit}', 'Commander, {unit}'], unitWord: 'Battalion', span: [3, 5] },
      { key: 'company', label: 'Company', titles: ['Captain, {unit}', 'Company Commander, {unit}'], unitWord: 'Company', span: [3, 4] },
      { key: 'platoon', label: 'Platoon', titles: ['Lieutenant, {unit}', 'Platoon Leader, {unit}'], unitWord: 'Platoon', span: [3, 4] },
      { key: 'squad', label: 'Squad', titles: ['Sergeant, {unit}', 'Squad Leader, {unit}'], unitWord: 'Squad', span: [2, 3] },
      { key: 'enlisted', label: 'Enlisted', leaf: true, titles: ['{ic}', 'Corporal, {spec}', 'Specialist, {spec}', 'Private First Class'], span: [0, 0] },
    ],
  },

  feudal: {
    label: 'Duchy', blurb: 'The realm as a tree of fiefs: Crown → Dukes → Marquesses → Earls → Barons → Knights → Freeholders, each lord OF somewhere, each with an epithet.',
    nameCulture: 'frankish', nameSetting: 'fantasy',
    orgName: ['the Kingdom of {place}', 'the Realm of {place}', 'the Crown of {place}', 'the Dominion of {place}'],
    branches: [],
    ranks: [
      { key: 'crown', label: 'Crown', titles: ['King of {unit}', 'Queen of {unit}', 'High Sovereign of {unit}'], unitPlace: true, span: [3, 6] },
      { key: 'duke', label: 'Duke', titles: ['Duke of {unit}', 'Duchess of {unit}', 'Grand Duke of {unit}'], unitPlace: true, span: [2, 4] },
      { key: 'marquess', label: 'Marquess', titles: ['Marquess of {unit}', 'Margrave of {unit}', 'Warden of {unit}'], unitPlace: true, span: [2, 4] },
      { key: 'earl', label: 'Earl', titles: ['Earl of {unit}', 'Count of {unit}', 'Countess of {unit}'], unitPlace: true, span: [2, 4] },
      { key: 'baron', label: 'Baron', titles: ['Baron of {unit}', 'Baroness of {unit}', 'Lord of {unit}'], unitPlace: true, span: [2, 5] },
      { key: 'knight', label: 'Knight', titles: ['Knight of {unit}', 'Ser of {unit}', 'Bannerman of {unit}'], unitPlace: true, span: [2, 4] },
      { key: 'freeholder', label: 'Freeholder', leaf: true, titles: ['Reeve of {unit}', 'Freeholder of {unit}', 'Yeoman of {unit}'], unitPlace: true, span: [0, 0] },
    ],
  },

  crime: {
    label: 'Family', blurb: 'The compartmented cell: Boss → Underboss & Consigliere → Caporegimes over their crews → made men → associates. Read cellular.',
    nameCulture: 'romance', nameSetting: 'wasteland',
    orgName: ['the {family} Family', 'the {family} Syndicate', 'the {family} Outfit', 'the {family} Organization'],
    branches: [],
    ranks: [
      { key: 'boss', label: 'Boss', titles: ['Boss', 'Don', 'The Boss of Bosses'], span: [2, 4] },
      { key: 'underboss', label: 'Underboss', titles: ['Underboss', 'Consigliere', 'Street Boss'], span: [2, 4] },
      { key: 'capo', label: 'Caporegime', titles: ['Caporegime, the {unit} Crew', 'Capo, {unit}', 'Skipper, the {unit} Crew'], unitPlace: true, span: [3, 6] },
      { key: 'soldier', label: 'Made Man', titles: ['Soldier', 'Made Man', 'Button Man'], span: [2, 5] },
      { key: 'associate', label: 'Associate', leaf: true, titles: ['Associate', 'Runner', 'Enforcer', 'Bagman'], span: [0, 0] },
    ],
  },

  monastic: {
    label: 'Abbey', blurb: 'The cloister: Abbot over the obedientiaries (Cellarer, Almoner, Sacrist…), then the choir monks, novices, and oblates.',
    nameCulture: 'romance', nameSetting: 'classical',
    orgName: ['the Abbey of {place}', 'the Priory of {place}', 'the Monastery of {place}', 'the House of {place}'],
    branches: [
      { name: 'the Cellary', chief: 'Cellarer', ic: ['Brother', 'Cellar-Brother'], spec: ['Kitchen', 'Cellar'] },
      { name: 'the Almonry', chief: 'Almoner', ic: ['Brother', 'Alms-Brother'], spec: ['Alms', 'Guest'] },
      { name: 'the Sacristy', chief: 'Sacrist', ic: ['Brother', 'Sacristan'], spec: ['Vestry', 'Relics'] },
      { name: 'the Infirmary', chief: 'Infirmarian', ic: ['Brother', 'Infirmary-Brother'], spec: ['Herbs', 'Sickroom'] },
      { name: 'the Scriptorium', chief: 'Armarius', ic: ['Scribe', 'Illuminator', 'Brother'], spec: ['Copying', 'Binding'] },
      { name: 'the Novitiate', chief: 'Novice-Master', ic: ['Brother'], spec: ['Instruction'] },
      { name: 'the Choir', chief: 'Precentor', ic: ['Cantor', 'Brother'], spec: ['Chant', 'Office'] },
    ],
    ranks: [
      { key: 'abbot', label: 'Abbot', titles: ['Abbot', 'Lord Abbot', 'Abbess', 'Prior'], span: [3, 6] },
      { key: 'obedientiary', label: 'Obedientiary', useChief: true, span: [2, 4] },
      { key: 'choir', label: 'Choir Monk', titles: ['Choir Monk of {dept}', 'Brother of {dept}', 'Professed Monk'], span: [3, 6] },
      { key: 'novice', label: 'Novice', titles: ['Novice', 'Novice Brother', 'Junior Monk'], span: [2, 4] },
      { key: 'oblate', label: 'Oblate', leaf: true, titles: ['Oblate', 'Lay Brother', 'Postulant'], span: [0, 0] },
    ],
  },

  academic: {
    label: 'University', blurb: 'The academy: President over Deans, then Department Chairs, Full → Associate → Assistant Professors, postdocs, and the grad students who do the work.',
    nameCulture: 'hellenic', nameSetting: 'classical',
    orgName: ['{place} University', 'the University of {place}', '{family} College', '{place} Institute of Technology'],
    branches: [
      { name: 'Arts & Sciences', chief: 'Dean of Arts & Sciences', ic: ['Lecturer', 'Instructor'], spec: ['Physics', 'Biology', 'Chemistry', 'Mathematics'] },
      { name: 'Engineering', chief: 'Dean of Engineering', ic: ['Lecturer', 'Research Engineer'], spec: ['Mechanical', 'Electrical', 'Computer', 'Civil'] },
      { name: 'Medicine', chief: 'Dean of Medicine', ic: ['Clinical Instructor', 'Lecturer'], spec: ['Anatomy', 'Pathology', 'Pharmacology'] },
      { name: 'Law', chief: 'Dean of Law', ic: ['Lecturer', 'Clinical Fellow'], spec: ['Constitutional', 'Corporate', 'Criminal'] },
      { name: 'Business', chief: 'Dean of Business', ic: ['Lecturer', 'Clinical Professor'], spec: ['Finance', 'Marketing', 'Strategy'] },
      { name: 'Humanities', chief: 'Dean of Humanities', ic: ['Lecturer', 'Instructor'], spec: ['History', 'Philosophy', 'Literature'] },
    ],
    ranks: [
      { key: 'president', label: 'President', titles: ['President', 'Chancellor', 'President of the University'], span: [3, 6] },
      { key: 'dean', label: 'Dean', useChief: true, span: [2, 5] },
      { key: 'chair', label: 'Department Chair', titles: ['Chair, Department of {spec}', 'Department Head, {spec}'], span: [3, 6] },
      { key: 'full', label: 'Full Professor', titles: ['Professor of {spec}', 'Full Professor, {spec}', 'Distinguished Professor of {spec}'], span: [2, 4] },
      { key: 'assoc', label: 'Junior Faculty', titles: ['Associate Professor of {spec}', 'Assistant Professor of {spec}'], span: [2, 4] },
      { key: 'postdoc', label: 'Postdoc', titles: ['Postdoctoral Fellow, {spec}', 'Lecturer, {spec}', 'Research Fellow'], span: [2, 5] },
      { key: 'grad', label: 'Graduate Student', leaf: true, titles: ['Doctoral Candidate', 'Graduate Researcher', 'Teaching Assistant'], span: [0, 0] },
    ],
  },

  ecclesiastic: {
    label: 'Curia', blurb: 'The see: Pontiff → Cardinals → Archbishops → Bishops → parish priests → deacons, each shepherd OF a place.',
    nameCulture: 'romance', nameSetting: 'classical',
    orgName: ['the See of {place}', 'the Holy Church of {place}', 'the Patriarchate of {place}', 'the Diocese of {place}'],
    branches: [],
    ranks: [
      { key: 'pope', label: 'Pontiff', titles: ['Supreme Pontiff', 'The Pope', 'Patriarch of {unit}'], unitPlace: true, span: [3, 6] },
      { key: 'cardinal', label: 'Cardinal', titles: ['Cardinal', 'Cardinal-Archbishop of {unit}', 'Cardinal-Priest of {unit}'], unitPlace: true, span: [3, 6] },
      { key: 'archbishop', label: 'Archbishop', titles: ['Archbishop of {unit}', 'Metropolitan of {unit}'], unitPlace: true, span: [2, 4] },
      { key: 'bishop', label: 'Bishop', titles: ['Bishop of {unit}', 'Suffragan Bishop of {unit}'], unitPlace: true, span: [3, 6] },
      { key: 'priest', label: 'Priest', titles: ['Parish Priest of {unit}', 'Rector of {unit}', 'Monsignor of {unit}'], unitPlace: true, span: [3, 6] },
      { key: 'deacon', label: 'Deacon', leaf: true, titles: ['Deacon of {unit}', 'Curate of {unit}', 'Acolyte'], unitPlace: true, span: [0, 0] },
    ],
  },
};

// ---------- shapes ----------
//
// A shape is a transform over the vertical's topology. `spanMul` scales every
// rank's raw report count; `capChildren` hard-caps it; `skip` is the chance a
// subtree flattens by dropping a middle rank; `wrap` makes the leaf rank spawn
// a shadow sub-org (the infinite move) even in the bounded tree; `dotted` adds
// matrix cross-reporting annotations.

export const SHAPES = {
  pyramid: { label: 'Pyramid', blurb: 'The textbook org: every rank one step down, spans widening toward the base.', spanMul: 1.0 },
  tall: { label: 'Tall & Narrow', blurb: 'Deep and thin — small teams, many layers, a long climb from the floor to the top.', spanMul: 0.55 },
  flat: { label: 'Flat', blurb: 'Delayered: wide spans and middle-management skipped, so ICs sit close to the top.', spanMul: 2.1, skip: 0.55 },
  wide: { label: 'Wide', blurb: 'Enormous spans of control — every manager drowning in direct reports.', spanMul: 2.6, capChildren: 14 },
  matrix: { label: 'Matrix', blurb: 'Solid-line up the tree, dotted-line across it — everyone answers to two bosses.', spanMul: 1.0, dotted: true },
  cellular: { label: 'Cellular', blurb: 'Compartmented into small isolated cells — no one cell knows the whole shape.', spanMul: 0.7, capChildren: 5 },
  fractal: { label: 'Fractal', blurb: 'Endless: the lowest worker is secretly the apex of their own sub-org, all the way down.', spanMul: 0.85, wrap: true },
};

// ---------- charter: the per-seed organisation ----------

// Deterministic subsample: keep ~frac of arr (at least min), preserving order.
function subsample(rng, arr, frac, min) {
  if (!arr || arr.length === 0) return [];
  const keep = arr.filter(() => rng() < frac);
  if (keep.length >= Math.min(min, arr.length)) return keep;
  const start = Math.floor(rng() * arr.length);
  const out = [];
  for (let i = 0; i < Math.min(min, arr.length); i++) out.push(arr[(start + i) % arr.length]);
  return out;
}

function resolveVertical(key) {
  const v = VERTICALS[String(key)];
  return v ? { key: String(key), ...v } : null;
}

function buildCharter(seed, vertical, shape, nameCulture, nameSetting) {
  const rng = rngFrom(`${seed}|${vertical.key}|charter`);
  // Which branches this particular org actually runs (a real company doesn't
  // have every possible department). Keep ≥3 so the top of the tree has spread.
  const branches = vertical.branches.length
    ? subsample(rng, vertical.branches.slice(), 0.7, Math.min(4, vertical.branches.length))
    : [];
  // The org's own name.
  const place = generateSet({ seed: `${seed}|orgn`, culture: nameCulture, setting: 'classical', kind: 'place', count: 1 }).names[0];
  const family = generateSet({ seed: `${seed}|orgf`, culture: nameCulture, setting: 'classical', kind: 'family', count: 1 }).names[0];
  const orgName = pick(rng, vertical.orgName).replace(/\{place\}/g, place).replace(/\{family\}/g, family);
  return { branches, orgName };
}

// A pool of toponyms for the whole org, so `unitPlace` ranks (feudal fiefs,
// dioceses, mob crews) draw stable, mostly-distinct holdings. Built lazily and
// indexed by a hash of the node id.
function placePool(ctx) {
  if (!ctx._places) {
    ctx._places = generateSet({ seed: `${ctx.seed}|places`, culture: ctx.nameCulture, setting: 'classical', kind: 'place', count: 200 }).names;
  }
  return ctx._places;
}
function placeFor(ctx, id) {
  const p = placePool(ctx);
  return p[xmur3(id)() % p.length];
}

function resolveBranch(ctx, name) {
  if (!name) return null;
  return ctx.charter.branches.find((b) => b.name === name) || null;
}

// ---------- title synthesis ----------

function titleFor(rank, branch, unit, ord, rng, ctx) {
  if (rank.useChief && branch) return branch.chief;
  const tmpl = pick(rng, rank.titles);
  return tmpl.replace(/\{(\w+)\}/g, (_, tok) => {
    if (tok === 'dept') return branch ? branch.name : ctx.charter.orgName;
    if (tok === 'ic') return branch && branch.ic ? pick(rng, branch.ic) : 'Staff';
    if (tok === 'spec') return branch && branch.spec ? pick(rng, branch.spec) : 'General';
    if (tok === 'unit') return unit || ctx.charter.orgName;
    if (tok === 'ord') return ordinal(ord);
    return '';
  }).replace(/\s+/g, ' ').trim();
}

// ---------- the node factory ----------
//
// childrenOf(node) is the whole engine: given a node, deterministically produce
// its direct reports. buildTree recurses it under a budget; expandNode walks it
// down a path. `allowWrap` controls whether a leaf-rank node spawns a shadow
// sub-org (true for the infinite node endpoint and the fractal shape; false for
// ordinary bounded trees, which simply stop at the IC).

function rootNode(ctx) {
  const r0 = ctx.vertical.ranks[0];
  const rng = rngFrom(`${ctx.seed}|${ctx.vertical.key}|${ctx.shape.key}|r|self`);
  const name = generateSet({ seed: `${ctx.seed}|r|self|nm`, culture: ctx.nameCulture, setting: ctx.nameSetting, kind: 'full', count: 1 }).names[0];
  const unit = r0.unitPlace ? ctx.charter.orgName : null;
  return {
    id: 'r', name, title: titleFor(r0, null, unit, 1, rng, ctx),
    rankIdx: 0, rankKey: r0.key, tier: r0.label, dept: null, unit, subOrg: false, stratum: 0,
  };
}

function spanFor(rank, shape, rng) {
  const [lo, hi] = rank.span;
  if (hi <= 0) return 0;
  let n = lo + Math.floor(rng() * (hi - lo + 1));
  n = Math.round(n * (shape.spanMul || 1));
  if (shape.capChildren) n = Math.min(n, shape.capChildren);
  return Math.max(1, n);
}

function childrenOf(node, ctx, allowWrap) {
  const ranks = ctx.vertical.ranks;
  const isLeaf = node.rankIdx >= ranks.length - 1;
  const rng = rngFrom(`${ctx.seed}|${ctx.vertical.key}|${ctx.shape.key}|${node.id}|kids`);

  let childRankIdx;
  let subOrg = node.subOrg;
  let stratum = node.stratum;
  // A node's fanout is a property of the node's OWN rank. A leaf (IC) normally
  // has none; with wrap on it becomes the apex of a shadow sub-org and takes
  // the top rank's fanout, its reports starting the ladder over at rank 1.
  let fanoutRank;
  if (!isLeaf) {
    childRankIdx = node.rankIdx + 1;
    // Flat shape: a subtree may drop a middle layer entirely.
    if (ctx.shape.skip && childRankIdx < ranks.length - 1) {
      if (rngFrom(`${node.id}|skip`)() < ctx.shape.skip) childRankIdx++;
    }
    fanoutRank = ranks[node.rankIdx];
  } else {
    if (!allowWrap) return [];
    childRankIdx = 1;
    subOrg = true;
    stratum = node.stratum + 1;
    fanoutRank = ranks[0];
  }

  const childRank = ranks[childRankIdx];
  const n = spanFor(fanoutRank, ctx.shape, rng);
  if (n === 0) return [];

  // Name every report at once so siblings are mutually distinct.
  const names = generateSet({
    seed: `${ctx.seed}|${node.id}|kidnames`, culture: ctx.nameCulture, setting: ctx.nameSetting, kind: 'full', count: n,
  }).names;

  // Distinct branch assignment happens at the tier just below the (sub-)apex.
  const assignsDept = childRankIdx === 1 && ctx.charter.branches.length > 0;
  let shuffled = null;
  if (assignsDept) {
    shuffled = ctx.charter.branches.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }

  const parentBranch = assignsDept ? null : resolveBranch(ctx, node.dept);
  const kids = [];
  for (let i = 0; i < n; i++) {
    const id = `${node.id}.${i}`;
    const branch = assignsDept ? shuffled[i % shuffled.length] : parentBranch;
    let unit = null;
    if (childRank.unitWord) unit = `${ordinal(i + 1)} ${childRank.unitWord}`;
    else if (childRank.unitPlace) unit = placeFor(ctx, id);
    kids.push({
      id,
      name: names[i] || names[names.length - 1],
      title: titleFor(childRank, branch, unit, i + 1, rng, ctx),
      rankIdx: childRankIdx, rankKey: childRank.key, tier: childRank.label,
      dept: branch ? branch.name : (node.dept || null),
      unit, subOrg, stratum,
    });
  }
  return kids;
}

// ---------- bounded tree ----------

export const DEFAULT_DEPTH = 4;
export const MAX_DEPTH = 12;
export const DEFAULT_MAX_NODES = 1500;
export const MAX_MAX_NODES = 6000;

export function generateOrg(opts = {}) {
  const seed = String(opts.seed ?? 'acme');
  const verticalKey = String(opts.vertical ?? 'corp');
  const shapeKey = String(opts.shape ?? 'pyramid');
  const depth = Math.max(1, Math.min(MAX_DEPTH, Math.floor(Number(opts.depth) || DEFAULT_DEPTH)));
  const maxNodes = Math.max(1, Math.min(MAX_MAX_NODES, Math.floor(Number(opts.maxNodes) || DEFAULT_MAX_NODES)));

  const vertical = resolveVertical(verticalKey);
  if (!vertical) throw new Error(`unknown vertical "${verticalKey}" — valid: ${Object.keys(VERTICALS).join(', ')}`);
  const shape = { key: shapeKey, ...SHAPES[shapeKey] };
  if (!SHAPES[shapeKey]) throw new Error(`unknown shape "${shapeKey}" — valid: ${Object.keys(SHAPES).join(', ')}`);
  const nameCulture = String(opts.names ?? vertical.nameCulture);
  const nameSetting = vertical.nameSetting;

  const ctx = { seed, vertical, shape, nameCulture, nameSetting, charter: buildCharter(seed, vertical, shape, nameCulture, nameSetting) };

  const root = rootNode(ctx);
  const headcount = {};
  let count = 1;
  let reached = 0;
  let truncated = 0;
  headcount[root.tier] = 1;

  // Breadth-first so the budget truncates the tree evenly rather than starving
  // whole branches. A node that has more reports than we can afford (or that
  // hits the depth wall) is flagged `truncated` — it means "more below, not
  // shown here".
  const queue = [[root, 0]];
  while (queue.length) {
    const [node, d] = queue.shift();
    if (d >= depth) { if (!ctx.vertical.ranks[node.rankIdx].leaf) { node.truncated = true; truncated++; } continue; }
    const kids = childrenOf(node, ctx, !!shape.wrap);
    if (!kids.length) continue;
    const room = Math.max(0, maxNodes - count);
    const kept = kids.length <= room ? kids : kids.slice(0, room);
    if (kept.length < kids.length) { node.truncated = true; truncated++; }
    if (kept.length) {
      node.reports = kept;
      count += kept.length;
      for (const k of kept) {
        headcount[k.tier] = (headcount[k.tier] || 0) + 1;
        reached = Math.max(reached, d + 1);
        queue.push([k, d + 1]);
      }
    }
  }

  if (shape.dotted) applyMatrix(root, ctx);

  // Put people in the boxes and roll up how the org performs (default on).
  const withPeople = opts.people === undefined ? true : !(opts.people === false || opts.people === '0' || opts.people === 'false');
  const performance = withPeople ? attachOrgPerformance(root, vertical, seed) : undefined;

  return {
    seed, vertical: vertical.key, verticalLabel: vertical.label, verticalBlurb: vertical.blurb,
    shape: shapeKey, shapeLabel: shape.label, shapeBlurb: shape.blurb,
    names: nameCulture, orgName: ctx.charter.orgName,
    branches: ctx.charter.branches.map((b) => b.name),
    depth: reached, requestedDepth: depth, nodeCount: count, maxNodes, truncatedCount: truncated,
    headcount, performance,
    root,
    permalink: `https://rite.mino.mobi/org/?seed=${encodeURIComponent(seed)}&vertical=${vertical.key}&shape=${shapeKey}&depth=${depth}`,
  };
}

// Matrix dotted-lines: give a mid-tree node a second, cross-branch reporting
// relationship pointing at a REAL node in another department, so the graph
// views can draw the actual cross-link. Pure decoration over the built tree.
function applyMatrix(root, ctx) {
  const byDept = new Map();
  const all = [];
  (function collect(n) {
    if (n.dept) { if (!byDept.has(n.dept)) byDept.set(n.dept, []); byDept.get(n.dept).push(n); }
    all.push(n);
    if (n.reports) for (const k of n.reports) collect(k);
  })(root);
  if (byDept.size < 2) return;
  const depts = [...byDept.keys()];
  for (const node of all) {
    if (!node.dept || node.rankIdx < 3 || ctx.vertical.ranks[node.rankIdx].leaf) continue;
    const rng = rngFrom(`${node.id}|dotted`);
    if (rng() >= 0.4) continue;
    const others = depts.filter((d) => d !== node.dept);
    if (!others.length) continue;
    const td = others[Math.floor(rng() * others.length)];
    const pool = byDept.get(td);
    const target = pool[Math.floor(rng() * pool.length)];
    node.dotted = `dotted-line to ${target.name} · ${td}`;
    node.dottedTo = target.id;
  }
}

// ---------- performance: put people in the boxes, then see how the org runs ----------
//
// Every box gets a PERSON (person.js — intrinsic, deterministic). Then the org
// DYNAMICS are rolled over the whole tree: a boss's leadership multiplies their
// reports, an overloaded span leaks throughput, every management layer skims an
// overhead tax, and morale flows down from manager quality and workload. The
// upshot is that the SAME people under a different `shape` perform differently —
// a flat org saves the depth tax but overloads its managers; a tall one keeps
// spans sane but taxes every layer. The org-level score borrows econ's vitality
// tiers (Thriving/Healthy/Stable/Fragile/Failing) so it rhymes with hoop/econ.

function idealSpan(vertical, rankIdx) {
  const s = vertical.ranks[rankIdx] && vertical.ranks[rankIdx].span;
  if (!s) return 4;
  return Math.max(1, (s[0] + s[1]) / 2);
}

// Morale + flight risk for one node given its manager's leadership quality.
// Shared by the whole-tree rollup and the single-node (infinite) lens.
function seatMetrics(node, managerQ, vertical, rankCount) {
  const reports = node.reports || [];
  const isMgr = reports.length > 0;
  const load = isMgr ? reports.length / idealSpan(vertical, node.rankIdx) : 0.75;
  const p = node.person;
  const tn = rankCount > 1 ? node.rankIdx / (rankCount - 1) : 0;
  const gap = p.attrs.ambition / 100 - (1 - tn);      // ambitious but junior → unhappy
  let morale = 52 + (managerQ - 1.0) * 45 - Math.max(0, load - 1) * 30
    - Math.max(0, gap) * 18 + (p.attrs.integrity - 50) * 0.10;
  morale += (rngFrom(`${node.id}|morale`)() - 0.5) * 10;
  morale = Math.max(2, Math.min(100, Math.round(morale)));
  const unmet = Math.max(0, Math.min(100, p.attrs.ambition - (1 - tn) * 100));
  let risk = 0.42 * (100 - morale) + 0.34 * unmet + 0.14 * (100 - p.attrs.integrity)
    + 0.10 * Math.max(0, 100 - p.tenure * 6);
  risk = Math.max(0, Math.min(100, Math.round(risk)));
  return { load: +load.toFixed(2), morale, flightRisk: risk, reports: reports.length };
}

function attachOrgPerformance(root, vertical, seed) {
  const pctx = { seed, vertical: vertical.key, rankCount: vertical.ranks.length };
  const all = [];
  (function walk(n) { n.person = makePerson(n, pctx); all.push(n); if (n.reports) for (const k of n.reports) walk(k); })(root);

  // Pass A (top-down): load + morale + flight risk, manager quality flowing down.
  (function down(n, managerQ) {
    n.perf = seatMetrics(n, managerQ, vertical, pctx.rankCount);
    for (const k of (n.reports || [])) down(k, n.person.leadership);
  })(root, 1.0);

  // Pass B (bottom-up): effective output. A manager amplifies the sum of their
  // reports' effective output by their leadership, dinged by span overload and
  // a per-layer overhead tax; ICs' output is scaled by their own morale.
  (function up(n) {
    const reports = n.reports || [];
    const p = n.person, perf = n.perf;
    let teamSize = 1;
    if (reports.length) {
      let childSum = 0;
      for (const k of reports) { up(k); childSum += k.perf.effective; teamSize += k.perf.teamSize; }
      // Gentle per-layer factors near 1.0 so the fraction that survives the
      // hierarchy stays legible (a healthy org ~0.6–0.85, not vanishing).
      const leadMod = 0.9 + (p.leadership - 1.0) * 0.35;       // ~0.86 (poor) … ~1.08 (great)
      const spanPenalty = Math.max(0.55, Math.min(1, 1 - Math.max(0, perf.load - 1) * 0.22));
      const depthTax = 0.985;                                  // each management layer skims ~1.5%
      const ownShare = p.output * 0.15 * (0.6 + 0.4 * perf.morale / 100);
      perf.effective = +(childSum * leadMod * spanPenalty * depthTax + ownShare).toFixed(1);
      perf.spanPenalty = +spanPenalty.toFixed(2);
    } else {
      perf.effective = +(p.output * (0.6 + 0.4 * perf.morale / 100)).toFixed(1);
    }
    perf.teamSize = teamSize;
  })(root);

  const leaves = all.filter((n) => !(n.reports && n.reports.length));
  const mgrs = all.filter((n) => n.reports && n.reports.length);
  const avg = (f) => all.reduce((s, n) => s + f(n), 0) / all.length;
  const grossOutput = leaves.reduce((s, n) => s + n.person.output, 0) + mgrs.reduce((s, n) => s + n.person.output * 0.15, 0);
  const effectiveOutput = root.perf.effective;
  const efficiency = grossOutput > 0 ? effectiveOutput / grossOutput : 0;
  const overloaded = mgrs.filter((n) => n.perf.load > 1.3);
  const overloadFrac = mgrs.length ? overloaded.length / mgrs.length : 0;
  const flightRiskNodes = all.filter((n) => n.perf.flightRisk > 55);
  const attritionRate = flightRiskNodes.length / all.length;
  const managerRatio = mgrs.length / all.length;
  const avgSpan = mgrs.length ? mgrs.reduce((s, n) => s + n.perf.reports, 0) / mgrs.length : 0;
  const maxSpan = mgrs.reduce((m, n) => Math.max(m, n.perf.reports), 0);
  const balance = Math.max(0, Math.min(1, 1 - Math.abs(managerRatio - 0.25) / 0.5));
  const score01 = 0.34 * Math.max(0, Math.min(1, efficiency)) + 0.24 * (avg((n) => n.perf.morale) / 100)
    + 0.18 * (1 - overloadFrac) + 0.14 * (1 - attritionRate) + 0.10 * balance;
  const score = Math.round(Math.max(0, Math.min(1, score01)) * 100);
  const tier = score >= 85 ? 'Thriving' : score >= 70 ? 'Healthy' : score >= 55 ? 'Stable' : score >= 38 ? 'Fragile' : 'Failing';

  const brief = (n) => n && { id: n.id, name: n.name, title: n.title };
  const top = all.slice().sort((a, b) => b.person.output - a.person.output)[0];
  const bottleneck = mgrs.filter((n) => n.perf.teamSize > 2)
    .sort((a, b) => (b.perf.load * b.perf.teamSize) - (a.perf.load * a.perf.teamSize))[0];
  const risks = flightRiskNodes.slice().sort((a, b) => b.perf.flightRisk - a.perf.flightRisk).slice(0, 5);

  return {
    headcount: all.length, managers: mgrs.length, ics: leaves.length,
    managerRatio: +managerRatio.toFixed(3), avgSpan: +avgSpan.toFixed(1), maxSpan,
    grossOutput: Math.round(grossOutput), effectiveOutput: Math.round(effectiveOutput), efficiency: +efficiency.toFixed(3),
    avgMorale: Math.round(avg((n) => n.perf.morale)), avgSkill: Math.round(avg((n) => n.person.attrs.skill)),
    avgTenure: +avg((n) => n.person.tenure).toFixed(1), avgAge: Math.round(avg((n) => n.person.age)),
    overloadedManagers: overloaded.length, overloadFrac: +overloadFrac.toFixed(2),
    flightRisks: flightRiskNodes.length, attritionRate: +attritionRate.toFixed(3),
    score, tier,
    highlights: {
      topPerformer: top && { ...brief(top), output: top.person.output, cast: top.person.cast },
      bottleneck: bottleneck && { ...brief(bottleneck), reports: bottleneck.perf.reports, load: bottleneck.perf.load, teamSize: bottleneck.perf.teamSize },
      flightRisks: risks.map((n) => ({ ...brief(n), flightRisk: n.perf.flightRisk })),
    },
    note: 'computed over the loaded tree (depth/budget-bounded); drilling via /api/org/node reveals more people. Same seed+people, different shape → different numbers.',
  };
}

// The mappa bridge: an org can be reproducibly SITED into a generated world.
// mappa seeds mulberry32 with a raw integer; rite hashes a string first, so a
// stable string built from the world seed + a city gives a deterministic org
// seed bound to that place. (Forward hook for the city sim — not used here.)
export function siteSeed(worldSeed, cityName, cellIndex) {
  return `${worldSeed}:${cityName}:${cellIndex ?? 0}`;
}

// ---------- the infinite lens: expand one node, one level ----------

export function expandOrgNode(opts = {}) {
  const seed = String(opts.seed ?? 'acme');
  const verticalKey = String(opts.vertical ?? 'corp');
  const shapeKey = String(opts.shape ?? 'pyramid');
  const id = String(opts.id ?? 'r').trim() || 'r';
  if (!/^r(\.\d+)*$/.test(id)) throw new Error(`bad node id "${id}" — expected r, r.0, r.0.3, …`);

  const vertical = resolveVertical(verticalKey);
  if (!vertical) throw new Error(`unknown vertical "${verticalKey}" — valid: ${Object.keys(VERTICALS).join(', ')}`);
  if (!SHAPES[shapeKey]) throw new Error(`unknown shape "${shapeKey}" — valid: ${Object.keys(SHAPES).join(', ')}`);
  const shape = { key: shapeKey, ...SHAPES[shapeKey] };
  const nameCulture = String(opts.names ?? vertical.nameCulture);
  const ctx = { seed, vertical, shape, nameCulture, nameSetting: vertical.nameSetting, charter: buildCharter(seed, vertical, shape, nameCulture, vertical.nameSetting) };

  // Walk from the root down the id path — the node endpoint ALWAYS wraps, so
  // any id is reachable however deep it lies.
  let node = rootNode(ctx);
  const path = [{ id: node.id, name: node.name, title: node.title, tier: node.tier }];
  const segs = id.split('.').slice(1); // drop the leading 'r'
  for (const seg of segs) {
    const kids = childrenOf(node, ctx, true);
    const idx = Number(seg);
    if (!kids.length || idx < 0 || idx >= kids.length) {
      throw new Error(`node "${id}" does not exist (stopped at ${node.id}, which has ${kids.length} reports)`);
    }
    node = kids[idx];
    path.push({ id: node.id, name: node.name, title: node.title, tier: node.tier });
  }

  const reports = childrenOf(node, ctx, true);
  const out = { ...node, reports };

  // Give the node and its reports people, and a LOCAL performance snapshot: the
  // node is its reports' manager, so their morale/effective are meaningful even
  // without the whole tree. (Org-wide metrics need the full tree — see /api/org.)
  const withPeople = opts.people === undefined ? true : !(opts.people === false || opts.people === '0' || opts.people === 'false');
  if (withPeople) {
    const pctx = { seed, vertical: vertical.key, rankCount: vertical.ranks.length };
    const rankCount = vertical.ranks.length;
    out.person = makePerson(out, pctx);
    for (const k of out.reports) k.person = makePerson(k, pctx);
    out.perf = seatMetrics(out, 1.0, vertical, rankCount);       // manager quality unknown in isolation → neutral
    for (const k of out.reports) k.perf = seatMetrics(k, out.person.leadership, vertical, rankCount);
  }

  return {
    seed, vertical: vertical.key, verticalLabel: vertical.label,
    shape: shapeKey, shapeLabel: shape.label,
    names: nameCulture, orgName: ctx.charter.orgName,
    infinite: true, path, node: out, reportCount: reports.length,
    permalink: `https://rite.mino.mobi/org/?seed=${encodeURIComponent(seed)}&vertical=${vertical.key}&shape=${shapeKey}&id=${id}`,
  };
}

// ---------- catalog ----------

export function catalog() {
  return {
    verticals: Object.fromEntries(Object.entries(VERTICALS).map(([k, v]) => [k, {
      label: v.label, blurb: v.blurb,
      ranks: v.ranks.map((r) => r.label),
      branches: v.branches.map((b) => b.name),
    }])),
    shapes: Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, { label: v.label, blurb: v.blurb }])),
    names: 'people are named by the /names/ engine; override the culture with ?names=<culture>',
    people: personCatalog(),
    defaults: { vertical: 'corp', shape: 'pyramid', depth: DEFAULT_DEPTH, maxNodes: DEFAULT_MAX_NODES },
    maxDepth: MAX_DEPTH, maxNodes: MAX_MAX_NODES,
  };
}

// Browser <script type="module"> and worker use the exports directly; node
// selftests reach it via globalThis.
if (typeof globalThis !== 'undefined') {
  globalThis.ORG = { generateOrg, expandOrgNode, catalog, siteSeed, VERTICALS, SHAPES };
}
