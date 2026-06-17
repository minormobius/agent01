// biome/sprite/osteo.mjs — the comparative-osteology dataset. THE research artifact behind the
// skeleton generator: what makes a horse a horse and a cat a cat is not size, it is the OSTEOMETRY —
// the relative lengths of named bones, the vertebral formula, digit reduction and stance. This table
// encodes those per mammal family so the builder can articulate a real skeleton, not a scaled blob.
//
// Lengths are RATIOS of trunk length (the presacral spine drawn ≈ 1.0). Numbers are a grounded first
// pass from comparative vertebrate anatomy (cursoriality indices — crural = tibia/femur, brachial =
// radius/humerus, intermembral = (humerus+radius)/(femur+tibia); digit formulae; mammalian vertebral
// counts). They are tuned against a literature sweep and will be refined as that sweep is digitised —
// the schema is what matters and it is stable.
//
//   stance     : 'plantigrade' (flat foot — bear, rat) | 'digitigrade' (on toes — cat, dog)
//                | 'unguligrade' (on hoof-tip — horse, deer, cattle)
//   vert       : { cervical, thoracic, lumbar, sacral, caudal } — caudal ≈ tail length; lumbar ≈ back flex
//   fore/hind  : bone lengths as a fraction of trunk length
//   digits     : { fore, hind, type } — functional digit counts + 'hoof'|'claw'|'nail'
//   skull      : { snout, cranium, jaw } — relative; snout↑ = dolichocephalic, jaw↑ = deep
//   neck       : total cervical-chain length / trunk ;  rib : ribcage depth / trunk
//   robust     : bone-thickness multiplier (graviportal thick, cursorial gracile)
//   trunkScale : trunk-length multiplier (mustelids elongate)

export const FAMILIES = {
  // unguligrade cursor, monodactyl: a single hoofed digit (III) on a hugely elongated cannon bone.
  equid: { stance:'unguligrade', vert:{cervical:7,thoracic:18,lumbar:6,sacral:5,caudal:18},
    fore:{scapula:.42,humerus:.34,radioulna:.32,metacarpal:.34,phalanx:.12}, // elongation is the cannon, not the radius/tibia
    hind:{femur:.36,tibia:.31,metatarsal:.33,phalanx:.12},                    // crural ~86, MT/F ~92 (Garland & Janis)
    digits:{fore:1,hind:1,type:'hoof'}, skull:{snout:.62,cranium:.40,jaw:.5},
    neck:.62, rib:.55, robust:.85, trunkScale:1 },

  // unguligrade, cloven (2 weight-bearing digits), even leggier metapodials than cattle — a cursor.
  cervid: { stance:'unguligrade', vert:{cervical:7,thoracic:13,lumbar:6,sacral:4,caudal:10},
    fore:{scapula:.40,humerus:.26,radioulna:.34,metacarpal:.36,phalanx:.12},
    hind:{femur:.32,tibia:.34,metatarsal:.34,phalanx:.12},                    // crural ~106, MT/F ~106 (very cursorial)
    digits:{fore:2,hind:2,type:'hoof'}, skull:{snout:.55,cranium:.40,jaw:.45},
    neck:.5, rib:.55, robust:.68, trunkScale:1 },

  // unguligrade, cloven, graviportal grazer — deep ribcage, robust bones, deep grazing jaw.
  bovid: { stance:'unguligrade', vert:{cervical:7,thoracic:13,lumbar:6,sacral:5,caudal:18},
    fore:{scapula:.40,humerus:.26,radioulna:.32,metacarpal:.26,phalanx:.11},
    hind:{femur:.32,tibia:.27,metatarsal:.26,phalanx:.11},                    // crural ~84, MT/F ~81 (graviportal grazer)
    digits:{fore:2,hind:2,type:'hoof'}, skull:{snout:.55,cranium:.42,jaw:.55},
    neck:.45, rib:.62, robust:.95, trunkScale:1 },

  // digitigrade cursor, 4 functional clawed digits, long muzzle — the wolf/dog plan.
  canid: { stance:'digitigrade', vert:{cervical:7,thoracic:13,lumbar:7,sacral:3,caudal:20},
    fore:{scapula:.34,humerus:.32,radioulna:.32,metacarpal:.18,phalanx:.08},
    hind:{femur:.32,tibia:.34,metatarsal:.24,phalanx:.08},
    digits:{fore:4,hind:4,type:'claw'}, skull:{snout:.52,cranium:.46,jaw:.45},
    neck:.45, rib:.46, robust:.62, trunkScale:1 },

  // digitigrade ambush hunter: short metapodials, very flexible (long-lumbar) spine, long tail,
  // short brachycephalic skull. Reduced clavicle → narrow chest.
  felid: { stance:'digitigrade', vert:{cervical:7,thoracic:13,lumbar:7,sacral:3,caudal:22},
    fore:{scapula:.32,humerus:.32,radioulna:.28,metacarpal:.16,phalanx:.10},
    hind:{femur:.34,tibia:.32,metatarsal:.22,phalanx:.10},
    digits:{fore:5,hind:4,type:'claw'}, skull:{snout:.32,cranium:.52,jaw:.4},
    neck:.42, rib:.44, robust:.6, trunkScale:1 },

  // plantigrade graviportal: walks on the whole flat foot, short metapodials, thick bones, big skull,
  // vestigial tail.
  ursid: { stance:'plantigrade', vert:{cervical:7,thoracic:14,lumbar:5,sacral:5,caudal:8},
    fore:{scapula:.34,humerus:.30,radioulna:.26,metacarpal:.14,phalanx:.08},
    hind:{femur:.34,tibia:.27,metatarsal:.15,phalanx:.08},                    // crural ~79, MT/F ~44 (graviportal, low)
    digits:{fore:5,hind:5,type:'claw'}, skull:{snout:.46,cranium:.56,jaw:.5},
    neck:.4, rib:.6, robust:1.12, trunkScale:1 },

  // saltatorial: forelimb much shorter than the elongated hindlimb (low intermembral index), long
  // hind metatarsals, short visible tail. The leaper signature.
  leporid: { stance:'plantigrade', vert:{cervical:7,thoracic:12,lumbar:7,sacral:4,caudal:14},
    fore:{scapula:.26,humerus:.22,radioulna:.24,metacarpal:.10,phalanx:.06},
    hind:{femur:.32,tibia:.46,metatarsal:.40,phalanx:.10},
    digits:{fore:5,hind:4,type:'claw'}, skull:{snout:.46,cranium:.50,jaw:.4},
    neck:.3, rib:.42, robust:.55, trunkScale:1 },

  // short-legged, deep-chested rooter with a very long snout; cloven but short metapodials.
  suid: { stance:'unguligrade', vert:{cervical:7,thoracic:14,lumbar:6,sacral:4,caudal:20},
    fore:{scapula:.36,humerus:.26,radioulna:.26,metacarpal:.16,phalanx:.10},
    hind:{femur:.28,tibia:.28,metatarsal:.16,phalanx:.10},
    digits:{fore:4,hind:4,type:'hoof'}, skull:{snout:.62,cranium:.40,jaw:.55},
    neck:.3, rib:.62, robust:1.0, trunkScale:1 },

  // plantigrade, 5 clawed digits, very long tail; small skull with prominent incisors.
  murid: { stance:'plantigrade', vert:{cervical:7,thoracic:13,lumbar:6,sacral:4,caudal:28},
    fore:{scapula:.28,humerus:.24,radioulna:.22,metacarpal:.10,phalanx:.06},
    hind:{femur:.28,tibia:.32,metatarsal:.22,phalanx:.08},
    digits:{fore:4,hind:5,type:'claw'}, skull:{snout:.46,cranium:.50,jaw:.42},
    neck:.28, rib:.42, robust:.55, trunkScale:1 },

  // elongate body on short legs — the weasel/otter/badger plan.
  mustelid: { stance:'plantigrade', vert:{cervical:7,thoracic:14,lumbar:6,sacral:3,caudal:18},
    fore:{scapula:.26,humerus:.24,radioulna:.22,metacarpal:.12,phalanx:.06},
    hind:{femur:.26,tibia:.26,metatarsal:.16,phalanx:.06},
    digits:{fore:5,hind:5,type:'claw'}, skull:{snout:.42,cranium:.5,jaw:.42},
    neck:.35, rib:.42, robust:.6, trunkScale:1.35 },

  // generic mammal — the fallback when we can't resolve a family.
  mammal: { stance:'digitigrade', vert:{cervical:7,thoracic:13,lumbar:6,sacral:4,caudal:16},
    fore:{scapula:.32,humerus:.30,radioulna:.30,metacarpal:.16,phalanx:.08},
    hind:{femur:.32,tibia:.32,metatarsal:.22,phalanx:.08},
    digits:{fore:4,hind:4,type:'claw'}, skull:{snout:.46,cranium:.48,jaw:.45},
    neck:.4, rib:.48, robust:.7, trunkScale:1 },

  // walking reptiles (caiman, iguana, tortoise, turtles) — sprawling, long-tailed, low-slung. Drawn
  // with the same machinery; a sprawling stance flag splays the limbs.
  reptile: { stance:'sprawling', vert:{cervical:8,thoracic:16,lumbar:0,sacral:2,caudal:30},
    fore:{scapula:.26,humerus:.30,radioulna:.26,metacarpal:.12,phalanx:.08},
    hind:{femur:.32,tibia:.28,metatarsal:.16,phalanx:.08},
    digits:{fore:5,hind:5,type:'claw'}, skull:{snout:.5,cranium:.46,jaw:.5},
    neck:.38, rib:.5, robust:.8, trunkScale:1.1 },
};

// genus → family. (Same curated-table approach as the clade classifier; Phase 2 derives it from the
// iNaturalist taxonomy at catalog-build time.)
const GENUS_FAMILY = {
  Equus:'equid',
  Felis:'felid', Lynx:'felid',
  Canis:'canid', Vulpes:'canid',
  Bos:'bovid', Ovis:'bovid', Capra:'bovid',
  Capreolus:'cervid',
  Ursus:'ursid',
  Oryctolagus:'leporid',
  Sus:'suid',
  Rattus:'murid', Cavia:'murid', Hydrochoerus:'murid',
  Mustela:'mustelid', Lutra:'mustelid', Meles:'mustelid', Procyon:'mammal',
  Erinaceus:'mammal', Lama:'cervid',
  Caiman:'reptile', Iguana:'reptile', Testudo:'reptile', Trachemys:'reptile', Emys:'reptile',
};

const genusOf = (sci) => String(sci || '').trim().split(/\s+/)[0] || '';

// Resolve an organism to a family key. Falls back by clade + guild so the result is always a real
// profile (keeps the builder total).
export function familyOf(org, clade) {
  const g = GENUS_FAMILY[genusOf(org.sciName)];
  if (g) return g;
  if (clade === 'reptile') return 'reptile';
  if ((org.mass_g || 0) < 200) return 'murid';
  if (org.guild === 'carnivore') return 'canid';
  return 'mammal';
}

export function profileFor(org, clade) { return FAMILIES[familyOf(org, clade)] || FAMILIES.mammal; }

export default { FAMILIES, familyOf, profileFor };
