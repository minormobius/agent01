// biome/sprite/bauplan.mjs — the GENOME layer of the inaturalist sprite engine.
//
// The problem this solves: "the guy" (mega/sprite/core.js) was tractable because a human is ONE
// fixed body plan — one hardcodable skeleton, one walk cycle. An arbitrary iNaturalist organism
// has no fixed body plan; a bee, a snake, a horse and an oak share no rig. So we do NOT try to
// "draw any animal". We map the infinite tree of life onto a SMALL FINITE SET of rigged body-plans
// (Baupläne) — then parameterise WITHIN each one from a deterministic seed. You author ~10 rigs,
// not 150 sprites.
//
// Two layers, mirroring the genome→phenotype split the item sprite (mega/sprite) already uses:
//   1. classify(org)  → { clade, archetype }     — cheap, reliable, from taxonomy + traits.
//   2. build(org)     → a rigged, parameterised sprite (skeleton + palette + clip).
//
// PHASE 1 implements ONE archetype deeply: `quadruped` (mammals + walking reptiles). Every other
// archetype is classified honestly (so Phase 2 just swaps the curated clade table for iNaturalist
// `ancestor_ids`) but `build()` only knows how to rig a quadruped yet — `buildable(org)` tells you.
//
// DETERMINISM IS LOAD-BEARING (same contract as gacha/borges/hoop): the seed is derived from the
// organism's *stable* iNaturalist taxon id, so a given creature has ONE canonical sprite for ever,
// and /sprite/?id=… is a permalink. Never reach for unseeded Math.random() in here.

import { Rand } from '../gacha/prng.js';

// ── 1. CLASSIFIER ──────────────────────────────────────────────────────────────────────────────
// Curated genus→clade table for the deck's vertebrates + key invertebrates. This is the "override
// table" — Phase 2 replaces it with iNaturalist's `ancestor_ids` / `iconic_taxon_name` (resolved at
// catalog-build time, like the photo URLs already are). Keyed by GENUS (first word of sciName).
const CLADE_BY_GENUS = {
  // mammals → quadruped
  Equus:'mammal', Bos:'mammal', Ursus:'mammal', Lama:'mammal', Sus:'mammal', Capra:'mammal',
  Ovis:'mammal', Hydrochoerus:'mammal', Canis:'mammal', Capreolus:'mammal', Lynx:'mammal',
  Meles:'mammal', Lutra:'mammal', Vulpes:'mammal', Procyon:'mammal', Oryctolagus:'mammal',
  Cavia:'mammal', Erinaceus:'mammal', Rattus:'mammal', Mustela:'mammal',
  // birds → avian
  Cygnus:'bird', Aquila:'bird', Anser:'bird', Gallus:'bird', Ardea:'bird', Larus:'bird',
  Anas:'bird', Fulica:'bird', Buteo:'bird', Columba:'bird', Strix:'bird', Gallinula:'bird',
  Accipiter:'bird', Pica:'bird', Falco:'bird', Garrulus:'bird', Sturnus:'bird',
  // reptiles that walk on four → quadruped; snakes → serpent
  Caiman:'reptile', Iguana:'reptile', Testudo:'reptile', Trachemys:'reptile', Emys:'reptile',
  Natrix:'snake', Vipera:'snake',
  // fish → finned
  Acipenser:'fish', Silurus:'fish', Hypophthalmichthys:'fish', Ctenopharyngodon:'fish',
  Sander:'fish', Esox:'fish', Micropterus:'fish', Cyprinus:'fish', Salmo:'fish', Lophius:'fish',
  Oreochromis:'fish', Perca:'fish',
  // crustaceans → octopod-ish
  Astacus:'crustacean', Potamon:'crustacean', Daphnia:'crustacean',
  // a few invertebrates we can name
  Apis:'insect', Cornu:'mollusk', Lymnaea:'mollusk', Lumbricus:'annelid', Araneus:'arachnid',
};

// clade → archetype (the rigged body-plan). Phase 1 only `quadruped` has a builder.
const ARCHETYPE = {
  mammal:'quadruped', reptile:'quadruped', amphibian:'quadruped',
  bird:'avian', snake:'serpent', fish:'finned',
  crustacean:'octopod', arachnid:'octopod', insect:'hexapod',
  mollusk:'radial', cnidarian:'radial', fungus:'radial',
  annelid:'vermiform', plant:'rooted',
};

const genusOf = (sci) => String(sci || '').trim().split(/\s+/)[0] || '';

// Heuristic fallback when the genus isn't in the curated table — keeps the classifier total so the
// self-test can assert EVERY catalog organism resolves to a known archetype.
function fallbackClade(org) {
  if (org.kind === 'producer') return 'plant';
  const h = org.habitats || [], mass = org.mass_g ?? 0, g = org.guild;
  if (g === 'detritivore' && h.includes('soil')) return 'annelid';
  if (g === 'nectarivore' || g === 'pollinator' || org.pollinator) return 'insect';
  if (h.includes('lake') && mass < 1 && org.thermy === 'ecto') return 'crustacean';
  if (mass < 1 && org.thermy === 'ecto') return 'insect';      // tiny cold-blooded land = bug
  if (h.includes('lake') && !h.includes('land') && org.thermy === 'ecto') return 'fish';
  if (org.thermy === 'endo' && (h.includes('air'))) return 'bird';
  if (org.thermy === 'endo') return 'mammal';
  return 'reptile';
}

export function classify(org) {
  const clade = CLADE_BY_GENUS[genusOf(org.sciName)] || fallbackClade(org);
  return { clade, archetype: ARCHETYPE[clade] || 'quadruped' };
}

// Does Phase 1 know how to rig this organism? (Only the quadruped archetype, for now.)
export function buildable(org) { return classify(org).archetype === 'quadruped'; }

// The deterministic seed for an organism. Prefer the stable iNaturalist taxon id (a creature's
// canonical, permanent identity) so the sprite never drifts; fall back to the catalog key.
export function seedOf(org) {
  const inat = org.inat && org.inat.inatId;
  return inat != null ? `inat:${inat}` : `id:${org.id}`;
}

// ── PALETTE ────────────────────────────────────────────────────────────────────────────────────
// PHASE 1: a deterministic palette seeded off the organism, biased by a clade base-hue. PHASE 2's
// magic trick is to replace the base hue/sat/L with colours SAMPLED from the organism's iNaturalist
// photo at catalog-build time — a generic quadruped wearing a tiger's colours reads as a tiger.
// Keeping it seeded here means the lab is fully sandbox-testable with no network.
const CLADE_HUE = { mammal:28, reptile:96, amphibian:110, bird:40 };
// comma syntax (not the space form) so the same string parses in BOTH <canvas> and SVG fills.
const hsl = (h, s, l) =>
  `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(clamp(s, 0, 100))}%, ${Math.round(clamp(l, 0, 100))}%)`;

function buildPalette(rand, clade, guild) {
  const baseH = CLADE_HUE[clade] ?? 30;
  const h = baseH + rand.range(-14, 14);
  const sat = rand.range(18, 52);
  const L = rand.range(38, 60);
  return {
    body:    hsl(h, sat, L),
    belly:   hsl(h, sat * 0.6, Math.min(94, L + 26)),
    head:    hsl(h, sat, L + 2),
    snout:   hsl(h, sat * 0.7, Math.min(92, L + 14)),
    limb:    hsl(h, sat, L - 9),
    limbDark:hsl(h, sat, L - 19),
    foot:    hsl(h, sat, L - 26),
    tail:    hsl(h, sat, L - 4),
    ear:     hsl(h, sat, L - 6),
    patch:   hsl(h, sat, L - 16),
    eye:     'hsl(40, 12%, 8%)',
    nose:    'hsl(0, 10%, 12%)',
  };
}

// ── SKELETON HELPERS ─────────────────────────────────────────────────────────────────────────────
// A sprite is a flat, parent-before-child list of SEGMENTS. Each segment is a bone drawn as a
// parametric primitive (the same idea as mega/sprite's parametric item primitives). Forward
// kinematics + the animation clip live in render.mjs; this file only lays out the rest pose.
//
//   seg = { id, parent, at, off, rest, len, w0, w1, role, shape, z, leg? }
//     parent : id of parent segment, or null for the root
//     at     : fraction [0..1] along the PARENT's length where this bone's base attaches
//     off    : perpendicular offset from the parent axis at the base (units; +down/belly side)
//     rest   : rest angle (radians) relative to the parent's absolute angle (0 = points +x = right)
//     len    : bone length (units); w0/w1 : width at base / tip
//     role   : palette key   shape : 'capsule'|'ellipse'|'tri'|'dot'   z : draw order (low = back)
//     leg    : 'FN'|'FF'|'BN'|'BF' tag the walk clip uses to phase the four legs
const PI = Math.PI;
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// ── 2. THE QUADRUPED BUILDER ─────────────────────────────────────────────────────────────────────
// archetype + seed → a parameterised quadruped. Proportions come from body mass (Kleiber-ish: linear
// size ∝ mass^⅓) and guild (predators lean & long-legged & big-jawed; grazers barrel-bodied & long-
// necked); the seed adds individual jitter and markings. Sister archetypes (avian/serpent/finned/…)
// are Phase 2 — each is the same shape of function: (org, rand) → {segs, clip}.
function buildQuadruped(org, rand) {
  const rs = rand.fork('shape'), rm = rand.fork('mark');
  const guild = org.guild || 'omnivore';
  const carn = guild === 'carnivore', herb = guild === 'herbivore';

  // size from log10(body mass): weasel ~60 g → small, horse ~450 kg → large.
  const lm = clamp(Math.log10(Math.max(1, org.mass_g || 1)), 1.5, 6);
  const L = lerp(70, 168, (lm - 1.5) / 4.5) * (1 + (rs.float() - 0.5) * 0.08); // torso length
  const ratio = carn ? 0.42 : herb ? 0.55 : 0.48;            // body depth / length
  const H = L * (ratio + (rs.float() - 0.5) * 0.06);

  const grazer = herb && (org.mass_g || 0) >= 18000;          // horse/deer/cow/llama: long neck
  const legLen = H * (carn ? 1.42 : grazer ? 1.34 : 1.16) * (1 + (rs.float() - 0.5) * 0.12);
  const neckLen = (grazer ? 0.95 : carn ? 0.5 : 0.62) * H * (1 + (rs.float() - 0.5) * 0.2);
  const headLen = (carn ? 0.5 : 0.42) * H * (1 + (rs.float() - 0.5) * 0.12);
  const headH = headLen * (carn ? 0.62 : 0.7);
  const tailLen = (carn ? 0.95 : grazer ? 0.55 : 0.38) * L * (1 + (rs.float() - 0.5) * 0.2);
  const earUp = !carn || rs.float() < 0.5;

  const S = [];
  const push = (s) => { S.push(s); return s.id; };

  // core barrel (root, faces +x)
  push({ id:'core', parent:null, rest:0, len:L, w0:H, w1:H, role:'body', shape:'ellipse', z:5 });
  // dorsal saddle patch (seeded) — a darker back marking; non-animated, rides the spine
  if (rm.float() < 0.45) {
    push({ id:'patch', parent:'core', at:lerp(0.35,0.6,rm.float()), off:-H*0.18, rest:0,
      len:L*lerp(0.3,0.5,rm.float()), w0:H*0.5, w1:H*0.4, role:'patch', shape:'ellipse', z:6 });
  }
  // a few seeded spots
  const nSpots = rm.float() < 0.35 ? rand.fork('spots').range(3, 7) : 0;
  for (let i = 0; i < nSpots; i++) {
    const r2 = rand.fork('spot' + i);
    const d = headH * lerp(0.16, 0.3, r2.float());
    push({ id:'spot'+i, parent:'core', at:lerp(0.2,0.8,r2.float()), off:lerp(-H*0.22,H*0.18,r2.float()),
      rest:0, len:d, w0:d, w1:d, role:'patch', shape:'ellipse', z:6 });
  }

  // neck + head, forward of the shoulder
  push({ id:'neck', parent:'core', at:0.9, off:-H*0.1, rest:-0.34 - (grazer?0.12:0), len:neckLen,
    w0:H*0.6, w1:H*0.42, role:'body', shape:'capsule', z:6 });
  push({ id:'head', parent:'neck', at:1, rest:0.34, len:headLen, w0:headH, w1:headH*0.92,
    role:'head', shape:'ellipse', z:8 });
  push({ id:'snout', parent:'head', at:0.78, off:headH*0.12, rest:-0.05, len:headLen*(carn?0.5:0.4),
    w0:headH*0.5, w1:headH*0.34, role:'snout', shape:'capsule', z:8 });
  push({ id:'nose', parent:'snout', at:1, rest:0, len:headH*0.16, w0:headH*0.2, w1:headH*0.2,
    role:'nose', shape:'dot', z:9 });
  push({ id:'eye', parent:'head', at:0.62, off:-headH*0.22, rest:0, len:headH*0.14, w0:headH*0.18,
    w1:headH*0.18, role:'eye', shape:'dot', z:9 });
  // ears
  const earLen = headH * (earUp ? 0.7 : 0.4) * (org.sciName?.startsWith('Oryctolagus') ? 2.2 : 1);
  push({ id:'earB', parent:'head', at:0.32, off:-headH*0.28, rest:earUp?-1.1:-0.4, len:earLen,
    w0:headH*0.34, w1:headH*0.06, role:'ear', shape:'tri', z:7 });
  push({ id:'earF', parent:'head', at:0.4, off:-headH*0.34, rest:earUp?-1.05:-0.35, len:earLen,
    w0:headH*0.34, w1:headH*0.06, role:'ear', shape:'tri', z:9 });

  // tail, behind the hip
  push({ id:'tail', parent:'core', at:0.04, off:-H*0.05, rest:PI - 0.35, len:tailLen,
    w0:H*0.3*(carn?1.5:1), w1:H*0.1, role:'tail', shape:'capsule', z:4 });

  // four legs. Each pair (front/back) shows a NEAR leg (in front of the body) and a FAR leg (behind,
  // drawn darker & a touch shorter) — that fakes a 3/4 side view that reads as four-legged.
  const upper = legLen * 0.52, lower = legLen * 0.46, footL = legLen * 0.15;
  const leg = (id, hipAt, near, splay, tag) => {
    const z = near ? 9 : 2, role = near ? 'limb' : 'limbDark';
    const k = near ? 1 : 0.95;
    push({ id:id+'U', parent:'core', at:hipAt, off:near ? H*0.16 : -H*0.18, rest:PI/2 + splay,
      len:upper*k, w0:H*0.26, w1:H*0.2, role, shape:'capsule', z, leg:tag });
    push({ id:id+'L', parent:id+'U', at:1, rest:(tag[0]==='F'?-0.22:0.22), len:lower*k,
      w0:H*0.2, w1:H*0.14, role, shape:'capsule', z, leg:tag });
    push({ id:id+'F', parent:id+'L', at:1, rest:-PI/2 + 0.15, len:footL,
      w0:H*0.16, w1:H*0.12, role:near?'foot':'limbDark', shape:'capsule', z, leg:tag });
  };
  leg('FF', 0.80, false, -0.06, 'FF');  // front-far
  leg('BF', 0.18, false,  0.06, 'BF');  // back-far
  leg('FN', 0.80, true,  -0.06, 'FN');  // front-near
  leg('BN', 0.18, true,   0.06, 'BN');  // back-near

  return { segs: S, clip: 'walk' };
}

// ── PUBLIC: build() ──────────────────────────────────────────────────────────────────────────────
// org → a complete, renderable, deterministic sprite (or throws if the archetype has no rig yet).
export function build(org) {
  const { clade, archetype } = classify(org);
  if (archetype !== 'quadruped') {
    throw new Error(`no rig yet for archetype "${archetype}" (${org.common || org.id}) — Phase 1 is quadruped-only`);
  }
  const seed = seedOf(org);
  const rand = new Rand(seed);
  const palette = buildPalette(rand.fork('palette'), clade, org.guild);
  const { segs, clip } = buildQuadruped(org, rand.fork('rig'));
  return {
    meta: {
      id: org.id, common: org.common, sciName: org.sciName, clade, archetype, seed,
      mass_g: org.mass_g, guild: org.guild, palette,
    },
    segs, clip,
  };
}

export default { classify, buildable, build, seedOf };
