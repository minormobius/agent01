// biome/sprite/skeleton.mjs — articulate an osteology profile (osteo.mjs) into a LITERAL skeleton:
// a vertebral column with neural spines, a ribcage, a skull + mandible, scapula/pelvis blades, and
// four named-bone limbs with stance-correct feet and digit reduction. Output is the same flat,
// parent-before-child segment list render.mjs's forward kinematics + walk clip already consume — the
// bones ARE the rig, so the existing animation machinery animates them unchanged.
//
// Pose convention (shared with render.mjs): +x = forward (the animal faces right), +y = down, angle 0
// points +x. Limb bones are laid out by their DESIRED ABSOLUTE standing angle (degrees, below) and
// converted to parent-relative rest angles — far easier to reason about than raw joint bends.

import { craniumProfile, appendageFor } from './osteo.mjs';

const D = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Full standing pose per stance — the WHOLE limb chain, not just the foot, because stance changes the
// posture of every joint. Each array is the absolute standing angle (deg) of, fore:
// [scapula, humerus, radioulna, metacarpal, phalanx]; hind: [pelvis, femur, tibia, metatarsal, phalanx].
//   unguligrade — columnar, up on the hoof-tip (near-vertical metapodial + phalanx)
//   digitigrade — up on the toes: metapodial raised, phalanges angled down to the ground
//   plantigrade — flat foot: wrist/ankle low, the long metapodial lies along the ground, leg more flexed
//   saltatorial — the leaper's folded hindlimb: a deep Z (femur fwd-down, long tibia back-down, foot flat
//                 under the body, hock raised) so the long bones read without the foot dangling
//   sprawling   — reptile: proximal bones splayed out to the side before dropping
const POSE = {
  unguligrade: { fore: [80, 100, 88, 86, 84], hind: [104, 82, 100, 88, 84] },
  digitigrade: { fore: [78, 104, 82, 60, 30], hind: [108, 74, 110, 58, 28] },
  plantigrade: { fore: [76, 110, 72, 20, 8],  hind: [112, 70, 116, 20, 8] },
  saltatorial: { fore: [78, 106, 74, 18, 6],  hind: [122, 50, 130, 24, 8] },
  sprawling:   { fore: [55, 122, 66, 24, 10], hind: [120, 58, 120, 24, 10] },
};

export function buildSkeleton(org, profile, rand, opt = {}) {
  const cranium = opt.cranium || craniumProfile(opt.family || 'mammal', profile);
  const appendage = opt.appendage || appendageFor(org);
  const rj = rand.fork('jitter');
  const jit = (a) => a * (1 + (rj.float() - 0.5) * 0.06); // ±3% individual variation

  const lm = clamp(Math.log10(Math.max(1, org.mass_g || 1)), 1.5, 6);
  const L = jit(lerp(80, 168, (lm - 1.5) / 4.5)) * (profile.trunkScale || 1); // trunk length px
  const th = L * 0.026 * profile.robust;                                       // base bone thickness
  const V = profile.vert;
  const presacral = V.thoracic + V.lumbar || 1;
  const vsp = L / presacral;                                                   // trunk vertebra spacing
  const csp = (profile.neck * L) / Math.max(1, V.cervical);                    // cervical spacing
  const forePose = (POSE[profile.foreStance || profile.stance] || POSE.digitigrade).fore;
  const hindPose = (POSE[profile.hindStance || profile.stance] || POSE.digitigrade).hind;

  const S = [];
  const push = (s) => { S.push(s); return s.id; };

  // ── VERTEBRAL COLUMN ──  root at the sacrum; presacral chain runs forward (+x), tail runs back.
  push({ id: 'sacrum', parent: null, rest: 0, len: vsp, w0: th * 2.4, w1: th * 2.4,
    role: 'sacral', shape: 'vertebra', spine: vsp * 0.7, z: 4 });

  let prev = 'sacrum';
  for (let i = 0; i < V.lumbar; i++) {
    prev = push({ id: 'L' + i, parent: prev, at: 1, rest: -0.006, len: vsp, w0: th * 2.0, w1: th * 2.0,
      role: 'lumbar', shape: 'vertebra', spine: vsp * 0.5, z: 4 });
  }
  const thor = [];
  for (let i = 0; i < V.thoracic; i++) {
    const frac = i / Math.max(1, V.thoracic - 1);                 // 0 = rear thoracic, 1 = front (withers)
    const spineH = vsp * (0.5 + 1.3 * Math.pow(frac, 1.6));       // dorsal spines rise toward the withers
    prev = push({ id: 'T' + i, parent: prev, at: 1, rest: 0.002, len: vsp, w0: th * 2.0, w1: th * 1.8,
      role: 'thoracic', shape: 'vertebra', spine: spineH, z: 4, thFrac: frac });
    thor.push('T' + i);
  }
  // cervical chain arches gently up toward the skull (a horse rises; not a giraffe pole)
  for (let i = 0; i < V.cervical; i++) {
    prev = push({ id: 'C' + i, parent: prev, at: 1, rest: -0.055, len: csp, w0: th * 1.7, w1: th * 1.5,
      role: 'cervical', shape: 'vertebra', spine: csp * 0.25, z: 5 });
  }
  // skull + mandible — the head pitches down off the end of the neck. The cranial-osteology profile
  // (osteo.mjs) drives a real lateral skull (braincase · orbit · zygoma · crest · teeth · horns).
  const skullLen = L * 0.22 * (0.7 + cranium.cranium);
  const crH = th * 6 * (0.5 + cranium.cranium);                    // braincase height scale (skull.mjs reads this as cr)
  const crown = appendage.type === 'antler' ? crH * (1.1 + 2.7 * (appendage.size || .85))
              : appendage.type === 'horn'   ? crH * (1.1 + 2.3 * (appendage.size || .8))
              : crH * (0.7 + cranium.crest * 0.6);                 // dorsal reach (for bbox), incl. crest/appendage
  push({ id: 'skull', parent: prev, at: 1, rest: 0.42, len: skullLen,
    w0: crH, w1: th * 2.6 * cranium.snout,
    role: 'bone', shape: 'skull', z: 8, snout: cranium.snout, cr: cranium, appendage, spine: crown });
  push({ id: 'mandible', parent: prev, at: 1, rest: 0.42 + 0.16, len: skullLen * (0.6 + cranium.snout * 0.5),
    w0: th * 1.9 * (0.4 + cranium.jaw), w1: th * 0.9, role: 'bone', shape: 'mandible', z: 8,
    mand: { jaw: cranium.jaw, ramus: clamp(0.35 + cranium.crest * 0.7, 0.3, 1.15),
      reptilian: cranium.reptilian, incisor: cranium.incisor, canine: cranium.canine } });

  // caudal chain (tail) runs backward from the sacrum, drooping a little
  let tprev = 'sacrum', tat = 0.0;
  const cN = V.caudal, tsp = (0.5 * L * (cN / 24)) / Math.max(1, cN);
  for (let i = 0; i < cN; i++) {
    const taper = 1 - i / (cN + 2);
    tprev = push({ id: 'Ca' + i, parent: i === 0 ? 'sacrum' : tprev, at: i === 0 ? 0.0 : 1,
      rest: i === 0 ? Math.PI - 0.15 : 0.02, len: tsp, w0: th * 1.4 * taper, w1: th * 1.3 * taper,
      role: 'caudal', shape: 'vertebra', spine: 0, z: 3 });
  }

  // ── RIBCAGE ──  one near-side rib per thoracic vertebra, sweeping ventrally & forward.
  const ribDepth = profile.rib * L;
  for (let i = 0; i < thor.length; i++) {
    const frac = i / Math.max(1, thor.length - 1);
    const len = ribDepth * (0.62 + 0.5 * Math.sin(Math.PI * clamp(frac + 0.1, 0, 1))); // longest mid-chest
    push({ id: 'rib' + i, parent: thor[i], at: 0.5, off: th * 0.6, rest: Math.PI / 2 + 0.5,
      len, w0: th * 0.7, w1: th * 0.5, role: 'rib', shape: 'rib', curve: 0.45, epi: 0, z: 5 });
  }

  // ── LIMBS ──  near pair (in front, opaque) + far pair (behind, shaded). Fore at the withers, hind
  // at the sacrum/pelvis. Each limb is a named-bone chain laid out by absolute standing angle.
  const witherId = thor[Math.max(0, thor.length - 3)];
  const lat = th * 0.7;

  const foreBones = [
    { name: 'scapula',   len: profile.fore.scapula * L, abs: forePose[0], shape: 'blade', role: 'scapula' },
    { name: 'humerus',   len: profile.fore.humerus * L, abs: forePose[1], joint: 'upper', shape: 'bone' },
    { name: 'radioulna', len: profile.fore.radioulna * L, abs: forePose[2], joint: 'mid', shape: 'bone' },
    { name: 'metacarpal',len: profile.fore.metacarpal * L, abs: forePose[3], joint: 'lower', shape: 'bone' },
    { name: 'phalanx',   len: profile.fore.phalanx * L, abs: forePose[4], joint: 'foot', shape: 'bone', epi: th * 0.6 },
  ];
  const hindBones = [
    { name: 'pelvis',    len: profile.hind.femur * 0.6 * L, abs: hindPose[0], shape: 'blade', role: 'pelvis' },
    { name: 'femur',     len: profile.hind.femur * L, abs: hindPose[1], joint: 'upper', shape: 'bone' },
    { name: 'tibia',     len: profile.hind.tibia * L, abs: hindPose[2], joint: 'mid', shape: 'bone' },
    { name: 'metatarsal',len: profile.hind.metatarsal * L, abs: hindPose[3], joint: 'lower', shape: 'bone' },
    { name: 'phalanx',   len: profile.hind.phalanx * L, abs: hindPose[4], joint: 'foot', shape: 'bone', epi: th * 0.6 },
  ];

  const addLimb = (legTag, region, near) => {
    const z = near ? 9 : 1, role = near ? 'bone' : 'boneFar';
    const sideOff = (near ? 1 : -1) * lat;
    const bones = region === 'fore' ? foreBones : hindBones;
    let pid = region === 'fore' ? witherId : 'sacrum', pAbs = 0, first = true;
    for (const b of bones) {
      const id = legTag + '_' + b.name;
      const wdt = b.shape === 'blade' ? th * 2.6 : th * 1.5;   // limb long-bones read as bones, not threads
      push({ id, parent: pid, at: first ? 0.5 : 1, off: first ? sideOff : 0,
        rest: jit(b.abs * D) - pAbs, len: b.len, w0: wdt, w1: wdt,
        role: b.role || role, shape: b.shape, z, leg: b.joint ? legTag : undefined,
        joint: b.joint, epi: b.epi, curve: b.curve });
      pid = id; pAbs = b.abs * D; first = false;
    }
    // foot: digit reduction made visible
    addFoot(legTag, pid, pAbs, region, near);
    return pid;
  };

  function addFoot(legTag, parentId, parentAbs, region, near) {
    const dig = profile.digits;
    const count = clamp(region === 'fore' ? dig.fore : dig.hind, 1, 5);
    const z = near ? 10 : 2, role = near ? 'bone' : 'boneFar';
    const toeLen = (region === 'fore' ? profile.fore.phalanx : profile.hind.phalanx) * L * 0.7;
    const groundAbs = profile.stance === 'unguligrade' ? 88 : 18; // hoof points down, claws forward
    const fan = dig.type === 'hoof' ? 10 : 26;                    // splay (deg) across the digit set
    for (let i = 0; i < count; i++) {
      const da = count === 1 ? 0 : (i / (count - 1) - 0.5) * fan;
      const tip = push({ id: `${legTag}_d${i}`, parent: parentId, at: 1, off: 0,
        rest: (groundAbs + da) * D - parentAbs, len: toeLen, w0: th * 0.7, w1: th * 0.5,
        role, shape: 'digit', epi: 0, z });
      push({ id: `${legTag}_k${i}`, parent: tip, at: 1, rest: 0.15,
        len: toeLen * (dig.type === 'hoof' ? 0.7 : 0.5),
        w0: th * (dig.type === 'hoof' ? 1.6 : 0.8), w1: th * 0.5,
        role: 'keratin', shape: dig.type === 'hoof' ? 'hoof' : 'claw', epi: 0, z });
    }
  }

  // draw far limbs first (behind), then near
  addLimb('FF', 'fore', false); addLimb('BF', 'hind', false);
  addLimb('FN', 'fore', true);  addLimb('BN', 'hind', true);

  const sprite = { segs: S, clip: 'walk', meta: { palette: {} } };
  groundLevel(sprite);                 // tilt the body so fore & hind feet meet one ground line

  // BOUNDARY CONDITIONS: record each bone's rest angle + its range of motion (Δ from rest). The collapse
  // relaxation clamps to this so joints fold only as far as the anatomy allows — no coiling into a ball.
  for (const s of S) { s.rest0 = s.rest || 0; s.rom = romFor(s); }
  return { segs: S, clip: sprite.clip };
}

// per-joint range of motion (radians, relative to rest). Vertebrae barely move (small intervertebral
// range — many of them coiling is what made the "dead spider"); limb joints fold a lot; feet little.
function romFor(s) {
  if (s.id === 'skull') return [-0.6, 0.6];
  if (s.shape === 'vertebra') return [-0.18, 0.18];
  if (s.joint === 'upper') return [-1.0, 1.0];     // shoulder / hip
  if (s.joint === 'mid') return [-1.5, 1.5];        // elbow / stifle
  if (s.joint === 'lower') return [-1.1, 1.1];      // carpus / hock
  return [-0.5, 0.5];
}

// Tilt the whole skeleton about the hip so the mean fore-foot and mean hind-foot land at the same
// height. When the limbs are very unequal (rabbit) this slopes the back up toward the haunches —
// exactly the crouched leporid stance — instead of leaving the short forelimb dangling.
function groundLevel(sprite) {
  const byId = {}; for (const s of sprite.segs) byId[s.id] = s;
  // memoised rest-pose forward kinematics: running base point + absolute angle per segment
  const _b = {}, _abs = {};
  function compute(id) {
    if (_b[id]) return; const s = byId[id];
    if (s.parent == null) { _b[id] = { x: 0, y: 0 }; _abs[id] = s.rest || 0; return; }
    compute(s.parent); const p = byId[s.parent], pa = _abs[s.parent], pb = _b[s.parent];
    const at = s.at == null ? 1 : s.at, off = s.off || 0;
    _b[id] = { x: pb.x + Math.cos(pa) * p.len * at - Math.sin(pa) * off,
               y: pb.y + Math.sin(pa) * p.len * at + Math.cos(pa) * off };
    _abs[id] = pa + (s.rest || 0);
  }
  const tip = (id) => { compute(id); const s = byId[id]; return { x: _b[id].x + Math.cos(_abs[id]) * s.len, y: _b[id].y + Math.sin(_abs[id]) * s.len }; };

  const feet = (tag) => sprite.segs.filter((s) => s.id.startsWith(tag + '_k')).map((s) => tip(s.id));
  const mean = (pts) => pts.length ? { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length } : null;
  const fore = mean([...feet('FN'), ...feet('FF')]);
  const hind = mean([...feet('BN'), ...feet('BF')]);
  if (!fore || !hind) return;
  const dx = fore.x - hind.x, dy = fore.y - hind.y;
  if (Math.abs(dx) < 1e-3) return;
  // gentle correction only — damped & clamped so very unequal limbs (rabbit) lean, never rear up.
  const tilt = -Math.atan2(dy, dx) * 0.45;
  const root = sprite.segs.find((s) => s.parent == null);
  if (root) root.rest = (root.rest || 0) + Math.max(-0.22, Math.min(0.22, tilt));
}

export default { buildSkeleton };
