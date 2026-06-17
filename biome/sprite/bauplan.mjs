// biome/sprite/bauplan.mjs — the GENOME layer of the iNaturalist sprite engine.
//
// The problem: "the guy" (mega/sprite/core.js) was tractable because a human is ONE fixed body plan.
// An arbitrary organism has none. The first attempt — one quadruped topology scaled by size + a few
// soft knobs — landed in the uncanny valley: every animal was the same blob stretched, because size is
// the LEAST characterful axis. The fix (osteology rebuild): draw the LITERAL skeleton. What makes a
// horse a horse and a cat a cat is the bones — relative limb-element lengths, vertebral formula, digit
// reduction, stance — and those are real, measured comparative-anatomy data (osteo.mjs). The skeleton
// is also abstract enough to escape the realism contract entirely: a naturalist's bone plate, not a
// fake animal.
//
// Three layers now:
//   1. classify(org)  → { clade, archetype }       — cheap taxonomy/trait classifier.
//   2. osteo.profileFor(org) → an osteometric profile (the research artifact).
//   3. skeleton.buildSkeleton(org, profile, rand)  → an articulated, animatable skeleton.
//
// DETERMINISM IS LOAD-BEARING: the seed is the organism's stable iNaturalist taxon id, so a creature
// has ONE canonical skeleton for ever and /sprite/?id=… is a permalink. No unseeded Math.random().

import { Rand } from '../gacha/prng.js';
import { profileFor, familyOf } from './osteo.mjs';
import { buildSkeleton } from './skeleton.mjs';

// ── 1. CLASSIFIER ──────────────────────────────────────────────────────────────────────────────
// Curated genus→clade table for the deck's vertebrates + key invertebrates (Phase 2 replaces it with
// iNaturalist `ancestor_ids` resolved at catalog-build time). Keyed by GENUS (first word of sciName).
const CLADE_BY_GENUS = {
  Equus:'mammal', Bos:'mammal', Ursus:'mammal', Lama:'mammal', Sus:'mammal', Capra:'mammal',
  Ovis:'mammal', Hydrochoerus:'mammal', Canis:'mammal', Capreolus:'mammal', Lynx:'mammal',
  Meles:'mammal', Lutra:'mammal', Vulpes:'mammal', Procyon:'mammal', Oryctolagus:'mammal',
  Cavia:'mammal', Erinaceus:'mammal', Rattus:'mammal', Mustela:'mammal',
  Cygnus:'bird', Aquila:'bird', Anser:'bird', Gallus:'bird', Ardea:'bird', Larus:'bird',
  Anas:'bird', Fulica:'bird', Buteo:'bird', Columba:'bird', Strix:'bird', Gallinula:'bird',
  Accipiter:'bird', Pica:'bird', Falco:'bird', Garrulus:'bird', Sturnus:'bird',
  Caiman:'reptile', Iguana:'reptile', Testudo:'reptile', Trachemys:'reptile', Emys:'reptile',
  Natrix:'snake', Vipera:'snake',
  Acipenser:'fish', Silurus:'fish', Hypophthalmichthys:'fish', Ctenopharyngodon:'fish',
  Sander:'fish', Esox:'fish', Micropterus:'fish', Cyprinus:'fish', Salmo:'fish', Lophius:'fish',
  Oreochromis:'fish', Perca:'fish',
  Astacus:'crustacean', Potamon:'crustacean', Daphnia:'crustacean',
  Apis:'insect', Cornu:'mollusk', Lymnaea:'mollusk', Lumbricus:'annelid', Araneus:'arachnid',
};

// clade → archetype (the rigged body-plan). Phase 1: quadruped (mammals + walking reptiles).
const ARCHETYPE = {
  mammal:'quadruped', reptile:'quadruped', amphibian:'quadruped',
  bird:'avian', snake:'serpent', fish:'finned',
  crustacean:'octopod', arachnid:'octopod', insect:'hexapod',
  mollusk:'radial', cnidarian:'radial', fungus:'radial',
  annelid:'vermiform', plant:'rooted',
};

const genusOf = (sci) => String(sci || '').trim().split(/\s+/)[0] || '';

function fallbackClade(org) {
  if (org.kind === 'producer') return 'plant';
  const h = org.habitats || [], mass = org.mass_g ?? 0, g = org.guild;
  if (g === 'detritivore' && h.includes('soil')) return 'annelid';
  if (g === 'nectarivore' || g === 'pollinator' || org.pollinator) return 'insect';
  if (h.includes('lake') && mass < 1 && org.thermy === 'ecto') return 'crustacean';
  if (mass < 1 && org.thermy === 'ecto') return 'insect';
  if (h.includes('lake') && !h.includes('land') && org.thermy === 'ecto') return 'fish';
  if (org.thermy === 'endo' && h.includes('air')) return 'bird';
  if (org.thermy === 'endo') return 'mammal';
  return 'reptile';
}

export function classify(org) {
  const clade = CLADE_BY_GENUS[genusOf(org.sciName)] || fallbackClade(org);
  return { clade, archetype: ARCHETYPE[clade] || 'quadruped' };
}

export function buildable(org) { return classify(org).archetype === 'quadruped'; }

export function seedOf(org) {
  const inat = org.inat && org.inat.inatId;
  return inat != null ? `inat:${inat}` : `id:${org.id}`;
}

// ── BONE PALETTE ─────────────────────────────────────────────────────────────────────────────────
// Ivory bone tones with a faint clade tint so skeletons aren't identically white — a whisper of
// identity that survives the abstraction. (Phase 2 could tint from the iNat photo.)
const CLADE_HUE = { mammal: 36, reptile: 84, amphibian: 96, bird: 44 };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hsl = (h, s, l) =>
  `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(clamp(s, 0, 100))}%, ${Math.round(clamp(l, 0, 100))}%)`;

function bonePalette(rand, clade) {
  const h = (CLADE_HUE[clade] ?? 36) + rand.range(-8, 8);
  const s = rand.range(8, 18);
  const L = rand.range(82, 90);
  return {
    bone:    hsl(h, s, L),
    boneFar: hsl(h, s, L - 24),            // far-side limbs, drawn behind & dimmer
    joint:   hsl(h, s + 4, Math.min(96, L + 4)),
    keratin: hsl(h + 8, s + 22, L - 48),   // hoof / claw — darker amber horn
    socket:  'rgba(20,16,12,0.55)',
  };
}

// ── PUBLIC: build() ──────────────────────────────────────────────────────────────────────────────
// org → a complete, renderable, deterministic articulated skeleton (throws if no rig yet).
export function build(org) {
  const { clade, archetype } = classify(org);
  if (archetype !== 'quadruped') {
    throw new Error(`no rig yet for archetype "${archetype}" (${org.common || org.id}) — Phase 1 is quadruped-only`);
  }
  const seed = seedOf(org);
  const rand = new Rand(seed);
  const family = familyOf(org, clade);
  const profile = profileFor(org, clade);
  const palette = bonePalette(rand.fork('palette'), clade);
  const { segs, clip } = buildSkeleton(org, profile, rand.fork('rig'));
  return {
    meta: {
      id: org.id, common: org.common, sciName: org.sciName, clade, archetype, family, seed,
      mass_g: org.mass_g, guild: org.guild, stance: profile.stance,
      vert: profile.vert, digits: profile.digits, palette,
    },
    segs, clip,
  };
}

export default { classify, buildable, build, seedOf, familyOf };
