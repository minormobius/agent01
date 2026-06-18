// biome/sprite/skull.mjs — THE cranial-geometry source of truth. Given a solved skull (or mandible)
// segment + its cranial-osteology profile, return a backend-agnostic list of drawing PRIMITIVES that
// trace a real lateral skull: braincase dome, the dorsal nasal profile, the rostrum, the orbit, the
// zygomatic arch, the sagittal crest, the dental battery (incisors · canine · cheek row), the nares,
// and any cranial appendage (horn · antler · beak). render.mjs paints these to canvas; proof.mjs to SVG.
// Keeping the geometry here means the two backends can never drift, and it is pure (sandbox-testable).
//
// A primitive is one of:
//   { kind:'poly',   pts:[{x,y}…], fill }                 filled closed polygon
//   { kind:'stroke', pts:[{x,y}…], width, color }         round-joined polyline
//   { kind:'quad',   a, c, b, width, color }              quadratic-bézier stroke (a→b, control c)
//   { kind:'ring',   x, y, r, stroke, width }             open circle
//   { kind:'disc',   x, y, r, fill }                      filled circle
// Coordinates are in the same world frame solve() produced; +y is down, so dorsal ("up") is −perp.

const v = (x, d) => (x == null ? d : x);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// Build the local skull frame + a landmark mapper P(t, dorsal): t ∈ [0,1] runs occiput→snout-tip along
// the bone axis; `dorsal` is the perpendicular offset in px (positive = up/dorsal).
function frame(w, s) {
  const o = w.base, a = w.abs;
  const dd = { x: Math.cos(a), y: Math.sin(a) };
  const up = { x: Math.sin(a), y: -Math.cos(a) };       // −perp = dorsal (perp(a) = (−sin,cos) points down)
  const len = s.len, cr = s.w0 || 8;
  const P = (t, d) => ({ x: o.x + dd.x * len * t + up.x * d, y: o.y + dd.y * len * t + up.y * d });
  return { P, len, cr };
}

export function skullParts(w, s, pal) {
  const parts = [];
  const { P, len, cr } = frame(w, s);
  const C = s.cr || {};
  const dome = v(C.dome, .45), orbit = v(C.orbit, .5), orbitFwd = v(C.orbitFwd, .4), zygo = v(C.zygo, .55),
        crest = v(C.crest, .35), canine = v(C.canine, .4), incisor = v(C.incisor, .35),
        reptilian = !!C.reptilian;
  const snout = clamp(s.snout != null ? s.snout : v(C.snout, .45), .25, .68);
  const sf = snout, cf = 1 - sf;                          // braincase fraction cf, rostrum fraction sf
  const H = cr * (0.5 + dome * 0.7);                      // braincase dorsal height
  const bone = pal.bone, socket = pal.socket || 'rgba(20,16,12,0.55)', ker = pal.keratin || bone;
  const crestH = reptilian ? 0 : crest * cr * 0.55;

  // ── cranium outline (closed), dorsal profile back→front then ventral front→back ──
  parts.push({ kind: 'poly', fill: bone, pts: [
    P(0.00,  H * 0.62),                                   // occiput, dorsal
    P(cf * 0.34, H + crestH),                             // braincase apex (+ sagittal crest)
    P(cf * 0.82, H * 0.66),                               // frontal / postorbital
    P(cf * 1.02, H * 0.58),                               // nasal base
    P(cf + sf * 0.45, H * (reptilian ? 0.30 : 0.44)),     // nasal mid (muzzle dorsum)
    P(0.995, H * (reptilian ? 0.15 : 0.26)),              // nasal tip (above the nares)
    P(1.00, -H * 0.08),                                   // rostrum tip (premaxilla)
    P(cf + sf * 0.5, -H * 0.26),                          // maxilla / tooth row
    P(cf, -H * 0.30),                                     // back of tooth row
    P(cf * 0.42, -H * 0.42),                              // ventral braincase / jaw glenoid
    P(0.00, -H * 0.30),                                   // occiput, ventral (condyle)
  ] });

  // ── sagittal crest ridge (temporalis attachment) ──
  if (!reptilian && crest > 0.34)
    parts.push({ kind: 'stroke', width: Math.max(1, cr * 0.16), color: bone,
      pts: [P(cf * 0.04, H * 0.62), P(cf * 0.34, H + crestH)] });

  // ── zygomatic arch (cheekbone) — mammals only ──
  if (!reptilian && zygo > 0.2) {
    const a0 = P(cf * 0.42, -H * 0.18), a1 = P(cf + sf * 0.18, -H * 0.02);
    const bow = P((cf * 0.42 + cf + sf * 0.18) / 2, -H * (0.30 + zygo * 0.34));
    parts.push({ kind: 'quad', a: a0, c: bow, b: a1, width: Math.max(1, cr * (0.12 + zygo * 0.16)), color: bone });
  }

  // ── orbit (eye socket) — capped so no orbit exceeds the braincase ──
  const ot = clamp(cf - 0.05 + orbitFwd * 0.12, 0.2, 0.96);
  const oc = P(ot, H * (0.30 - orbitFwd * 0.06));
  const ro = Math.max(1.5, Math.min(orbit * cr * 0.44, H * 0.66));
  parts.push({ kind: 'disc', x: oc.x, y: oc.y, r: ro * 0.92, fill: socket });
  parts.push({ kind: 'ring', x: oc.x, y: oc.y, r: ro, stroke: bone, width: Math.max(1, cr * 0.12) });

  // ── nares (nasal opening) ──
  const nz = P(0.95, H * 0.05);
  parts.push({ kind: 'disc', x: nz.x, y: nz.y, r: Math.max(1, cr * 0.12), fill: socket });

  // ── dental battery ──
  if (!reptilian) {
    if (incisor > 0.1)                                    // upper incisors at the premaxilla
      parts.push({ kind: 'stroke', width: Math.max(1, cr * 0.13 * (0.6 + incisor)), color: ker,
        pts: [P(0.985, -H * 0.06), P(1.0, -H * (0.10 + incisor * 0.34))] });
    if (canine > 0.2) {                                   // canine fang behind the diastema
      const ct = cf + sf * 0.14;
      parts.push({ kind: 'stroke', width: Math.max(1, cr * 0.18 * canine), color: ker,
        pts: [P(ct, -H * 0.24), P(ct + canine * 0.02, -H * (0.24 + canine * 0.5))] });
    }
    const n = 5;                                          // cheek-tooth row ticks
    for (let i = 0; i < n; i++) { const t = cf + sf * (0.30 + 0.48 * i / (n - 1));
      parts.push({ kind: 'stroke', width: Math.max(0.8, cr * 0.08), color: bone, pts: [P(t, -H * 0.24), P(t, -H * 0.36)] }); }
  } else {
    const n = 9;                                          // reptile: a polydont row of small teeth
    for (let i = 0; i < n; i++) { const t = cf * 0.6 + (1 - cf * 0.6) * i / (n - 1);
      parts.push({ kind: 'stroke', width: Math.max(0.6, cr * 0.07), color: ker, pts: [P(t, -H * 0.08), P(t, -H * 0.08 - cr * 0.16)] }); }
  }

  // ── cranial appendage ──
  const ap = s.appendage;
  if (ap && ap.type === 'horn') horn(parts, P, cr, len, ap, ker);
  else if (ap && ap.type === 'antler') antler(parts, P, cr, len, ap, bone);
  else if (ap && ap.type === 'beak') beak(parts, P, cr, ker);

  return parts;
}

// horn: a tapered keratin cone off the frontal that sweeps up-and-BACK over the skull (not a vertical
// spike); `curl` pulls the tip forward+down (ram heavy curl, cattle nearly straight & lateral-back).
function horn(parts, P, cr, len, ap, ker) {
  const sz = v(ap.size, .8), curl = v(ap.curl, .3), t0 = 0.40, w = (cr * 0.55 * sz) / len;
  const c1 = P(t0 + w * 0.5, cr * 0.50);                  // front base
  const c2 = P(t0 - w * 0.5, cr * 0.50);                  // back base
  const tip = P(t0 - 0.55 * sz + curl * 0.40 * sz, cr * (0.50 + 1.45 * sz - curl * 0.45 * sz));
  const mid = P(t0 - 0.30 * sz, cr * (0.50 + 1.20 * sz)); // bows the back edge into a curve
  parts.push({ kind: 'poly', fill: ker, pts: [c1, c2, mid, tip] });
}

// antler: a beam off the frontal with a brow tine and a top fork (bone, not keratin — antler is bone).
function antler(parts, P, cr, len, ap, bone) {
  const sz = v(ap.size, .85), t0 = 0.36, W = Math.max(1.2, cr * 0.17 * sz);
  const base = P(t0, cr * 0.55), beamMid = P(t0 - 0.05 * sz, cr * (0.55 + 1.1 * sz)), beamTip = P(t0 - 0.16 * sz, cr * (0.55 + 2.0 * sz));
  parts.push({ kind: 'stroke', width: W, color: bone, pts: [base, beamMid, beamTip] });
  parts.push({ kind: 'stroke', width: W * 0.7, color: bone, pts: [beamMid, P(t0 + 0.10 * sz, cr * (0.55 + 1.55 * sz))] });   // brow tine
  parts.push({ kind: 'stroke', width: W * 0.6, color: bone, pts: [beamTip, P(t0 - 0.27 * sz, cr * (0.55 + 2.6 * sz))] });    // fork 1
  parts.push({ kind: 'stroke', width: W * 0.6, color: bone, pts: [beamTip, P(t0 - 0.06 * sz, cr * (0.55 + 2.7 * sz))] });    // fork 2
}

// beak: a horny downward hook replacing the toothless rostrum tip (chelonians).
function beak(parts, P, cr, ker) {
  parts.push({ kind: 'poly', fill: ker, pts: [P(0.98, cr * 0.10), P(1.04, -cr * 0.02), P(0.99, -cr * 0.34)] });
}

// MANDIBLE — the lower jaw (dentary): a body along the tooth row, an ascending ramus (coronoid process
// dorsally, for the temporalis), an angular process at the back-ventral, and its own dental row.
export function mandibleParts(w, s, pal) {
  const parts = [];
  const { P, cr } = frame(w, s);
  const M = s.mand || {};
  const jaw = v(M.jaw, .45), ramus = v(M.ramus, .5), reptilian = !!M.reptilian,
        incisor = v(M.incisor, .3), canine = v(M.canine, .3);
  const bone = pal.bone, ker = pal.keratin || bone;
  const Dd = cr * (0.5 + jaw * 1.4);                      // jaw-body depth (down = +)

  parts.push({ kind: 'poly', fill: bone, pts: [
    P(0.02, -ramus * cr * 0.2),                           // condyle (articulates with the skull glenoid)
    P(0.09, -ramus * cr * 1.1),                           // coronoid process (ascending ramus, dorsal)
    P(0.20, -cr * 0.05),                                  // mandibular notch → tooth row
    P(1.00, -cr * 0.02),                                  // tooth row to the symphysis (chin)
    P(1.00, Dd * 0.5),                                    // chin, ventral
    P(0.18, Dd),                                          // jaw-body ventral edge
    P(0.00, Dd * 0.55),                                   // angular process (back-ventral)
  ] });

  if (!reptilian) {
    if (incisor > 0.1)                                    // lower incisor at the chin
      parts.push({ kind: 'stroke', width: Math.max(1, cr * 0.12 * (0.6 + incisor)), color: ker, pts: [P(0.97, -cr * 0.02), P(1.0, -cr * (0.06 + incisor * 0.3))] });
    if (canine > 0.2)                                     // lower canine
      parts.push({ kind: 'stroke', width: Math.max(1, cr * 0.16 * canine), color: ker, pts: [P(0.82, -cr * 0.04), P(0.82, -cr * (0.04 + canine * 0.42))] });
    const n = 5;
    for (let i = 0; i < n; i++) { const t = 0.34 + 0.5 * i / (n - 1);
      parts.push({ kind: 'stroke', width: Math.max(0.8, cr * 0.07), color: bone, pts: [P(t, -cr * 0.04), P(t, -cr * 0.16)] }); }
  } else {
    const n = 8;
    for (let i = 0; i < n; i++) { const t = 0.2 + 0.78 * i / (n - 1);
      parts.push({ kind: 'stroke', width: Math.max(0.6, cr * 0.06), color: ker, pts: [P(t, -cr * 0.02), P(t, -cr * 0.14)] }); }
  }
  return parts;
}

export default { skullParts, mandibleParts };
