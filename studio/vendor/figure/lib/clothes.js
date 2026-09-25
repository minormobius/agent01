// clothes.js — garments from the body they cover, from predicates.
//
// A garment piece is the body parts it covers, each INFLATED by the cloth's
// thickness and CUT by planes (a hem, a neckline, the end of a sleeve). Built on
// the solved pose, so a sleeve bends at the elbow and a trouser leg at the knee,
// and it cannot miss the skin it covers: it is that skin, pushed out.
//
// A skirt is its own shape: a flared cone (pleated if asked) hung from the hips.
// Its axis and flare are solved per pose from where the thighs actually are, so
// it drapes over the lap when sitting and opens to take a stride when walking.
//
// Groups: top, bottom, legwear, shoes, accent (a collar, a ribbon, a tie).

import { add, sub, scale, norm, dot, cross, len, lerp3, apply, madd } from './vec.js';

export const GARMENT_GROUPS = ['top', 'bottom', 'legwear', 'shoes', 'accent', 'collar'];

export const OUTFIT_PREDICATES = {
  top: ['none', 'tee', 'shirt', 'tank', 'sailor', 'jacket', 'crop'],
  bottom: ['none', 'pants', 'shorts', 'skirt', 'mini', 'long-skirt', 'pleated'],
  legwear: ['none', 'socks', 'knee-socks', 'thigh-highs', 'tights'],
  shoes: ['none', 'sneakers', 'loafers', 'boots'],
  accent: ['none', 'ribbon', 'tie', 'collar'],
};

export const CLOTH_COLORS = {
  white: ['#f7f5f0', '#c9c7d6'], navy: ['#2c3552', '#1a2036'], black: ['#34313a', '#1c1a20'], grey: ['#9a9aa2', '#6e6e78'],
  red: ['#c93a3a', '#8c2224'], wine: ['#7a2638', '#4e1622'], blue: ['#4f7fcf', '#33589a'], sky: ['#9cc8ec', '#6f9cc4'],
  green: ['#5a9a6a', '#3a6a48'], olive: ['#8a8a4a', '#5e5e30'], tan: ['#c9ab7a', '#9a7e52'], brown: ['#6e4a32', '#46301f'],
  pink: ['#f2a6bd', '#c97892'], yellow: ['#f2d25a', '#c4a232'], denim: ['#5b78a8', '#3c5480'], cream: ['#efe6cf', '#c8bc9e'],
};

// a few schemes, so "school uniform" is one word
export const OUTFITS = {
  school: { top: 'sailor', bottom: 'pleated', legwear: 'knee-socks', shoes: 'loafers', accent: 'ribbon', colors: { top: 'white', bottom: 'navy', legwear: 'navy', shoes: 'brown', accent: 'red', collar: 'navy' } },
  casual: { top: 'tee', bottom: 'pants', shoes: 'sneakers', colors: { top: 'sky', bottom: 'denim', shoes: 'white' } },
  office: { top: 'shirt', bottom: 'pants', shoes: 'loafers', accent: 'tie', colors: { top: 'white', bottom: 'grey', shoes: 'black', accent: 'wine' } },
  street: { top: 'jacket', bottom: 'shorts', legwear: 'thigh-highs', shoes: 'boots', colors: { top: 'black', bottom: 'denim', legwear: 'black', shoes: 'black' } },
  summer: { top: 'tank', bottom: 'skirt', shoes: 'sneakers', colors: { top: 'yellow', bottom: 'white', shoes: 'white' } },
};

export function resolveOutfit(o = {}) {
  const base = o.scheme ? OUTFITS[o.scheme] : {};
  const out = { top: 'none', bottom: 'none', legwear: 'none', shoes: 'none', accent: 'none', ...base, ...o, colors: { ...(base.colors || {}), ...(o.colors || {}) } };
  for (const k of Object.keys(OUTFIT_PREDICATES)) if (!OUTFIT_PREDICATES[k].includes(out[k])) throw new Error(`unknown ${k}: ${out[k]} (know: ${OUTFIT_PREDICATES[k].join(', ')})`);
  return out;
}
/**
 * The torso parts an outfit leaves bare on purpose, beside its hems: checkClothes holds
 * every other torso part in a garment's region to be covered, so a body part a garment
 * does not know about (a new mass under the bust, once) shows as a hole.
 */
export function bareParts(outfit) {
  if (!outfit) return [];
  const o = resolveOutfit(outfit), out = [];
  if (o.top === 'tank') out.push('deltoid_l', 'deltoid_r');
  return out;
}
export function outfitColors(o) {
  const c = o.colors || {};
  const pick = (k, d) => CLOTH_COLORS[c[k] || d] || CLOTH_COLORS[d];
  return { top: pick('top', 'white'), bottom: pick('bottom', 'navy'), legwear: pick('legwear', 'black'), shoes: pick('shoes', 'brown'), accent: pick('accent', 'red'), collar: pick('collar', 'navy') };
}

/** A plane that keeps the side of `p` opposite its normal: { n, d } with n·x ≤ d kept. */
const plane = (n, p) => { const u = norm(n); return [...u, dot(u, p)]; };

/**
 * The garment primitives on a solved pose. `byName` finds body primitives;
 * `mk` makes primitives the way body.js does.
 */
export function buildClothes(P, body, outfit, mk) {
  const o = resolveOutfit(outfit);
  const m = P.rig.m, J = P.J, F = P.F, kk = m.k;
  const by = (name) => body.find((q) => q.name === name);
  const prims = [];
  // cover: a body primitive inflated by t, into a garment group, cut by up to two planes
  const cover = (name, group, t, clips = []) => {
    const q = by(name);
    if (!q) return;
    const c = { ...q, group, name: `${group}:${name}`, clips: clips.slice(0, 2) };
    if (q.type === 0) { c.ra = q.ra + t; c.rb = q.rb + t; } else c.r = q.r.map((x) => x + t);
    prims.push(c);
  };
  const sides = ['l', 'r'];
  const up = F.chest.y;

  // ---- the top
  const top = o.top;
  if (top !== 'none') {
    const t = (top === 'jacket' ? 0.05 : 0.022) * kk;
    // the hem: at the hips for most, above the navel for a crop, a jacket a little longer
    const hemF = top === 'crop' ? 0.62 : top === 'jacket' ? -0.25 : 0.1;
    const hemY = lerp3(J.pelvis, J.waist, hemF);
    const hem = plane(scale(F.pelvis.y, -1), hemY);               // keep above the hem
    const neckY = madd(J.neck, up, 0.02 * kk);
    const collar = plane(up, neckY);                              // keep below the neck's base
    const vneck = top === 'sailor' || top === 'shirt' ? plane(add(F.chest.z, scale(up, 1.1)), madd(J.neck, F.chest.z, 0.12 * kk)) : null;
    for (const n of ['chest', 'belly', 'pelvis']) cover(n, 'top', t, [hem, vneck || collar]);
    for (const s of sides) {
      // every torso mass inside the hem: the bust's two, and the hip's cap where a bent
      // body brings it up to the hem (checkClothes finds a part left out)
      for (const n of [`breast_${s}`, `breastlow_${s}`, `hipcap_${s}`]) cover(n, 'top', t, [hem]);
      // the neckline's plane is for the neck: a raised arm lifts the shoulder above it, and
      // cut there the shoulder went bare (checkClothes, reachUp)
      if (top !== 'tank') cover(`deltoid_${s}`, 'top', t, []);
      cover(`trap_${s}`, 'top', t, [collar]);
      for (const i of [0, 1, 2]) cover(`clavicle_${s}${i}`, 'top', t, [vneck || collar]);
      if (top === 'tank') continue;
      // sleeves: to the elbow for a tee, to the wrist for the rest (a crop is short-sleeved)
      const S = J[`shoulder_${s}`], E = J[`elbow_${s}`], W = J[`wrist_${s}`];
      const short = top === 'tee' || top === 'crop';
      const end = short ? lerp3(S, E, 0.5) : lerp3(E, W, 0.92);
      const endDir = short ? norm(sub(E, S)) : norm(sub(W, E));
      const cuff = plane(endDir, end);
      for (const seg of ['upper', 'fore']) for (const i of [0, 1]) {
        if (short && seg === 'fore') continue;
        cover(`${seg}_${s}${i}`, 'top', t + 0.018 * kk, [cuff]);
      }
      if (!short) cover(`olecranon_${s}`, 'top', t + 0.018 * kk, [cuff]);
    }
  }

  // ---- the bottom
  const bottom = o.bottom;
  const waistPt = lerp3(J.pelvis, J.waist, 0.45);
  const waistband = plane(F.pelvis.y, waistPt);                   // keep below the waist
  if (bottom === 'pants' || bottom === 'shorts') {
    const t = 0.022 * kk;
    for (const n of ['pelvis', 'belly']) cover(n, 'bottom', t, [waistband]);
    for (const s of sides) {
      cover(`glute_${s}`, 'bottom', t, [waistband]); cover(`hipcap_${s}`, 'bottom', t, [waistband]);
      const H = J[`hip_${s}`], K = J[`knee_${s}`], A = J[`ankle_${s}`];
      const end = bottom === 'shorts' ? lerp3(H, K, 0.45) : lerp3(K, A, 0.93);
      const dir = bottom === 'shorts' ? norm(sub(K, H)) : norm(sub(A, K));
      const hemPl = plane(dir, end);
      cover(`thigh_${s}0`, 'bottom', t + 0.02 * kk, [hemPl]); cover(`thigh_${s}1`, 'bottom', t + 0.02 * kk, [hemPl]);
      if (bottom === 'pants') { cover(`kneecap_${s}`, 'bottom', t + 0.02 * kk, [hemPl]); cover(`shin_${s}0`, 'bottom', t + 0.03 * kk, [hemPl]); cover(`shin_${s}1`, 'bottom', t + 0.03 * kk, [hemPl]); }
    }
  }
  if (['skirt', 'mini', 'long-skirt', 'pleated'].includes(bottom)) {
    const t = 0.02 * kk;
    for (const n of ['pelvis', 'belly']) cover(n, 'bottom', t, [waistband]);
    for (const s of sides) { cover(`glute_${s}`, 'bottom', t, [waistband]); cover(`hipcap_${s}`, 'bottom', t, [waistband]); }
    // the skirt: hung from the hips, its axis along the thighs' mean. It starts wide
    // enough to hold both thighs, flares to hold them wherever they go (a stride, a
    // lap), and ends in a flat hem: a plane cut through a cone that runs on past it.
    const len = { mini: 0.36, skirt: 0.62, pleated: 0.55, 'long-skirt': 0.92 }[bottom] * (m.thighLen + m.shinLen);
    const coneLen = (a) => a;
    const top0 = add(J.pelvis, scale(F.pelvis.y, -0.1 * kk));
    const thighs = sides.map((s) => norm(sub(J[`knee_${s}`], J[`hip_${s}`])));
    let axis = norm(add(add(thighs[0], thighs[1]), scale(F.pelvis.y, -0.8)));
    // a skirt hangs: its axis tilts at most 25° from straight down, whatever the thighs do
    const downW = [0, -1, 0], tilt = Math.acos(Math.max(-1, Math.min(1, dot(axis, downW))));
    const maxTilt = 0.44;
    if (tilt > maxTilt) { const side = norm(sub(axis, scale(downW, dot(axis, downW)))); axis = norm(add(scale(downW, Math.cos(maxTilt)), scale(side, Math.sin(maxTilt)))); }
    const lap = tilt > 0.7;                                    // the thighs run forward: a lap
    // an oval: a skirt is shallower front to back than side to side, so it hangs from the hips
    // and doesn't stand off the belly and seat like a lampshade (DEPTH); radii are side to side
    const DEPTH = 0.8, Fs = frameAround(axis, F.pelvis.z);
    const oval = (p) => madd(p, Fs.z, (1 / DEPTH - 1) * dot(sub(p, top0), Fs.z));
    const radialAt = (pt) => { const off = sub(oval(pt), top0); return len3(sub(off, scale(axis, dot(off, axis)))); };
    const thighR = (f) => m.radii.thigh[0][1] * (1 - 0.35 * f) + t;
    let rTop = Math.max(m.pelvis.r[0], m.pelvis.r[2] / DEPTH) + t;
    for (const s of sides) rTop = Math.max(rTop, radialAt(J[`hip_${s}`]) + thighR(0) + 0.02 * kk);
    const flare = { mini: 1.18, skirt: 1.3, pleated: 1.35, 'long-skirt': 1.45 }[bottom];
    let rBot = rTop * flare;
    if (!lap) for (const s of sides) for (let f = 0.3; f <= 1.001; f += 0.1) {
      const c = add(top0, scale(axis, len * f));
      const legPt = closestOnSegment(c, J[`hip_${s}`], J[`ankle_${s}`]);
      const need = radialAt(legPt) + thighR(Math.min(1, dist3(legPt, J[`hip_${s}`]) / m.thighLen)) + 0.02 * kk;
      rBot = Math.max(rBot, rTop + (need - rTop) / f);
    }
    // the flare stays an A-line: a knee raised to the hip is the drape's job, not the cone's
    rBot = Math.min(rBot, rTop * 2.0);
    // a leg that leaves the cone (a lap, a raised knee, a crouch) gets the drape: the
    // skirt's cloth over the thigh to the hem's reach, as a real skirt rides a raised knee
    const coneD = (p) => {
      const hp = add(top0, scale(axis, lap ? Math.min(len, 0.35 * m.thighLen) : len));
      const b0x = add(hp, scale(axis, rBot)), hl = lap ? Math.min(len, 0.35 * m.thighLen) : len;
      const rBx = rTop + (rBot - rTop) * ((hl + rBot) / hl);
      return Math.max(mk.roundCone(oval(p), top0, b0x, rTop, rBx) * DEPTH, dot(axis, sub(p, hp)));
    };
    const outside = (s) => {
      // the thigh's own surface (its real radius, not a guess at it)
      for (const n of [`thigh_${s}0`, `thigh_${s}1`]) {
        const q = by(n);
        if (!q) continue;
        const ax = norm(sub(q.b, q.a)), u = norm(cross(ax, [0.001, 1, 0.002])), v = cross(ax, u);
        for (let f = 0; f <= 1.001; f += 0.2) {
          const c = lerp3(q.a, q.b, f), r0 = q.ra + (q.rb - q.ra) * f;
          for (let a = 0; a < 6.28; a += 0.6) {
            const p = add(c, add(scale(u, Math.cos(a) * r0), scale(v, Math.sin(a) * r0)));
            if (dot(axis, sub(p, add(top0, scale(axis, len)))) > -0.05) continue;     // below the hem: not the skirt's
            if (coneD(p) > -0.015) return true;
          }
        }
      }
      return false;
    };
    const draped = sides.filter((s) => lap || outside(s));
    // knees spread past what the hem can span (a squat, a wide crouch): the cloth is pulled
    // taut from knee to knee, so the hem rises to the knees and a panel spans the thighs
    const kneeGap = dist3(J.knee_l, J.knee_r), spread = draped.length === 2 && kneeGap > 2.6 * m.hipHalf;
    for (const s of draped) {
      const H = J[`hip_${s}`], K = J[`knee_${s}`], A = J[`ankle_${s}`];
      const reach = Math.min(1, len / m.thighLen);
      const hemPl = reach < 1 ? plane(norm(sub(K, H)), lerp3(H, K, reach)) : plane(norm(sub(A, K)), lerp3(K, A, Math.min(0.95, (len - m.thighLen) / m.shinLen)));
      // a hem plane cuts only the bone it lies across: past the knee, the whole thigh is
      // covered and only the shin is cut (a plane across the shin would slice a folded thigh)
      for (const n of [`thigh_${s}0`, `thigh_${s}1`, `kneecap_${s}`]) cover(n, 'bottom', t + 0.04 * kk, reach < 1 ? [hemPl] : []);
      if (reach >= 1) for (const n of [`shin_${s}0`, `shin_${s}1`]) cover(n, 'bottom', t + 0.07 * kk, [hemPl]);
    }
    // seated, the cone hangs only to the seat: the rest of the skirt is the drape on the lap;
    // spread, it hangs to the knees' line and no further
    const kneeDepth = Math.max(0.3 * m.thighLen, dot(sub(lerp3(J.knee_l, J.knee_r, 0.5), top0), axis));
    const hangLen = lap ? Math.min(len, 0.35 * m.thighLen) : spread ? Math.min(len, kneeDepth) : len;
    if (spread) {
      // the panel: a thin sheet from the crotch to the knees, its front edge sagging between them
      const crotch = madd(lerp3(J.hip_l, J.hip_r, 0.5), F.pelvis.y, -0.3 * kk);
      const Km = lerp3(J.knee_l, J.knee_r, 0.5), sag = Math.min(len - m.thighLen * 0.6, 0.12 * kneeGap + 0.1 * kk);
      const S = madd(Km, [0, -1, 0], Math.max(0.04 * kk, sag));
      const X = norm(sub(J.knee_l, J.knee_r));
      const Z = norm(sub(sub(S, crotch), scale(X, dot(sub(S, crotch), X))));
      const Fp = { x: X, y: cross(Z, X), z: Z };
      prims.push({ ...mk.ellipsoid('bottom', lerp3(crotch, S, 0.5), Fp, [kneeGap / 2 + 0.04 * kk, 0.03 * kk, dist3(S, crotch) / 2 + 0.03 * kk], 0.06 * kk, 'panel'), clips: [] });
      for (const s of sides) prims.push({ ...mk.cone('bottom', J[`knee_${s}`], S, t + 0.03 * kk, 0.03 * kk, 0.06 * kk, `panelEdge_${s}`), side: s === 'l' ? 1 : -1, clips: [] });
    }
    const hemPt = add(top0, scale(axis, hangLen));
    // pleated: 18 knife pleats; plain: a few soft folds, growing to the hem, which waves
    const pleats = bottom === 'pleated' ? 18 : bottom === 'mini' ? 6 : 7;
    // the cone runs on past the hem by its own radius, so its round end is cut away flat
    const b0 = add(hemPt, scale(axis, rBot));
    const rB = rTop + (rBot - rTop) * ((hangLen + rBot) / hangLen);
    prims.push({ type: 3, group: 'bottom', side: 0, a: top0, b: b0, ra: rTop, rb: rB, F: Fs, r: [pleats, (bottom === 'pleated' ? 0.025 : 0.05) * kk, 0.025 * kk], depth: DEPTH, k: 0.05 * kk, name: 'skirt', clips: [plane(axis, hemPt)] });
  }

  // ---- legwear
  const leg = o.legwear;
  if (leg !== 'none') {
    const t = 0.008 * kk;
    for (const s of sides) {
      const H = J[`hip_${s}`], K = J[`knee_${s}`], A = J[`ankle_${s}`];
      const topPt = leg === 'socks' ? lerp3(A, K, 0.18) : leg === 'knee-socks' ? lerp3(A, K, 0.86) : leg === 'thigh-highs' ? lerp3(K, H, 0.55) : H;
      const band = plane(norm(sub(H, A)), topPt);
      for (const n of [`ankle_${s}`, `foot_${s}`, `toes_${s}`, `shin_${s}0`, `shin_${s}1`, `kneecap_${s}`, `thigh_${s}0`, `thigh_${s}1`]) cover(n, 'legwear', t, [band]);
      if (leg === 'tights') for (const n of ['pelvis', `glute_${s}`, `hipcap_${s}`]) cover(n, 'legwear', t, [waistband]);
    }
  }

  // ---- shoes
  const sh = o.shoes;
  if (sh !== 'none') {
    for (const s of sides) {
      const K = J[`knee_${s}`], A = J[`ankle_${s}`];
      const topPt = sh === 'boots' ? lerp3(A, K, 0.55) : lerp3(A, K, sh === 'sneakers' ? 0.08 : 0.02);
      const band = plane(norm(sub(K, A)), topPt);
      const t = (sh === 'boots' ? 0.035 : 0.03) * kk;
      for (const n of [`foot_${s}`, `toes_${s}`, `ankle_${s}`]) cover(n, 'shoes', t, [band]);
      if (sh === 'boots') { cover(`shin_${s}1`, 'shoes', t + 0.01 * kk, [band]); cover(`shin_${s}0`, 'shoes', t + 0.01 * kk, [band]); }
    }
  }

  // ---- accents
  const ac = o.accent, withCollar = o.top === 'sailor' || ac === 'collar';
  if (withCollar) {
    // the sailor collar: a square flap down the back, and two lapels that come over
    // the shoulders and meet in a V on the chest, laid on the chest's own surface
    const t = 0.045 * kk;
    const flapBottom = plane(scale(up, -1), madd(J.neck, up, -0.5 * kk));          // keep above
    const backHalf = plane(F.chest.z, madd(J.neck, F.chest.z, -0.02 * kk));        // keep behind
    cover('chest', 'collar', t, [flapBottom, backHalf]);
    for (const s of sides) cover(`trap_${s}`, 'collar', t + 0.005 * kk, [flapBottom]);
    const vPt = madd(madd(J.neck, up, -0.42 * kk), F.chest.z, 0);
    for (const [s, sg] of [['l', 1], ['r', -1]]) {
      const from = madd(madd(J.neck, F.chest.x, sg * 0.2 * m.wide), up, 0.02 * kk), to = madd(vPt, F.chest.x, sg * 0.02);
      const onFront = (pt) => mk.surface ? mk.surface(pt, F.chest.z, 0.03 * kk) : pt;
      // the lapel follows the chest's curve: short segments, each laid on the surface
      const pts = [0, 0.33, 0.66, 1].map((f) => onFront(lerp3(from, to, f)));
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const along = norm(sub(b, a)), fz = F.chest.z;
        const Fl = { y: along, z: norm(sub(fz, scale(along, dot(fz, along)))), x: null };
        Fl.x = cross(Fl.y, Fl.z);
        prims.push({ ...mk.ellipsoid('collar', lerp3(a, b, 0.5), Fl, [0.08 * kk * (1 - 0.35 * i / 2), len3(sub(b, a)) / 2 + 0.03 * kk, 0.02 * kk], 0.03 * kk, `lapel_${s}${i}`), side: sg });
      }    }
  }
  if (ac === 'ribbon' || ac === 'tie') {
    const front0 = madd(J.neck, up, withCollar ? -0.38 * kk : -0.2 * kk);
    const front = mk.surface ? mk.surface(front0, F.chest.z, 0.08 * kk) : madd(front0, F.chest.z, m.chest.r[2] * 0.55 + 0.05 * kk);
    const Fc = F.chest;
    if (ac === 'ribbon') {
      prims.push(mk.ellipsoid('accent', front, Fc, [0.035 * kk, 0.035 * kk, 0.03 * kk], 0.02 * kk, 'knot'));
      for (const sg of [1, -1]) prims.push({ ...mk.ellipsoid('accent', add(front, scale(Fc.x, sg * 0.09 * kk)), rotFrame(Fc, sg * 0.35), [0.075 * kk, 0.04 * kk, 0.02 * kk], 0.03 * kk, `loop_${sg > 0 ? 'l' : 'r'}`), side: sg });
      for (const sg of [1, -1]) prims.push({ ...mk.cone('accent', front, add(front, add(scale(Fc.x, sg * 0.05 * kk), scale(up, -0.2 * kk))), 0.025 * kk, 0.018 * kk, 0.02 * kk, `tail_${sg > 0 ? 'l' : 'r'}`), side: sg });
    } else {
      prims.push(mk.cone('accent', front, add(front, add(scale(up, -0.85 * kk), scale(Fc.z, 0.02))), 0.03 * kk, 0.06 * kk, 0.02 * kk, 'tie'));
    }
  }
  for (const q of prims) q.clips = q.clips || [];
  return prims;
}

function closestOnSegment(p, a, b) { const ab = sub(b, a); const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab))); return add(a, scale(ab, t)); }
const len3 = (v) => Math.hypot(v[0], v[1], v[2]);
const dist3 = (a, b) => len3(sub(a, b));
function frameAround(axis, fwd) { const y = scale(axis, -1); let z = sub(fwd, scale(y, dot(fwd, y))); z = norm(z); return { x: cross(y, z), y, z }; }
function rotFrame(F, a) { const c = Math.cos(a), s = Math.sin(a); return { x: add(scale(F.x, c), scale(F.y, s)), y: add(scale(F.y, c), scale(F.x, -s)), z: F.z }; }
