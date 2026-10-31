// /pumpkin/live — the jack-o'-lantern as a puppet.
//
// Every emotion is a face this pumpkin could really be carved with: the same
// seed carves a face for each of the eight moods onto the same body (engine's
// `faceFor`). To move between them, every cut is resampled to N points and the
// cuts are matched up by part and position (eye0, eye1, brow0, …, mouth0, …),
// so one face morphs into another point by point. A part one face has and the
// other lacks grows from, or shrinks to, a point on the nearest cut of its kind
// — a stitched mouth's dashes run together into a grin.
//
// On top of the morph, live: the mouth opens and rounds as it talks (the jaw
// drops, the lips part, corners hold), the eyes blink, the brows lift, the face
// turns toward whoever is talking, and the whole pumpkin breathes, sways, bobs
// while it talks and shifts in its seat. The candle flares with speech and
// changes colour with the mood.
//
// `buildRig` and `pose` are pure (the selftest drives them in node); `Puppet`
// owns an SVG and moves it every frame.

import { carve, faceFor, render, MOODS, MOOD_KEYS, FIRE } from './engine.js';

export const N = 64;                 // points per cut, in every face
const PARTS = ['eye', 'brow', 'nose', 'mouth', 'tear'];

// The candle's colour per mood: what burns behind each face.
export const PALETTES = {
  classic: FIRE,
  jolly: ['#fffde8', '#fff07a', '#ffb52e', '#c8500e'],
  sinister: ['#fff1d6', '#ffb04a', '#ff4d12', '#7d0d06'],
  vampire: ['#ffe9e4', '#ff8a6a', '#e0182a', '#5a0010'],
  goofy: ['#fffbe0', '#ffe94d', '#ffa21f', '#c0420c'],
  spooked: ['#f4fbff', '#d6f0ff', '#8fc8ff', '#2a4a9a'],
  sad: ['#f6f2ff', '#cdbcff', '#8a6ad8', '#3a2a7a'],
  stitched: ['#f8ffe8', '#d9ff8a', '#7fd13a', '#245a14'],
};

// ---------- geometry ----------

const centroid = (pts) => {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
};
const signedArea = (pts) => {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return s / 2;
};

/**
 * A closed outline as exactly n points, evenly spaced along it, starting at its
 * leftmost point and always wound the same way — so any two outlines can be
 * morphed point by point.
 */
export function resample(pts, n = N) {
  let poly = pts.slice();
  if (signedArea(poly) < 0) poly.reverse();
  let s = 0;
  for (let i = 1; i < poly.length; i++) if (poly[i][0] < poly[s][0] || (poly[i][0] === poly[s][0] && poly[i][1] < poly[s][1])) s = i;
  poly = [...poly.slice(s), ...poly.slice(0, s)];
  const segs = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push([a, b, L]); total += L;
  }
  if (!total) return Array.from({ length: n }, () => poly[0].slice());
  const out = [];
  let k = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const want = (i / n) * total;
    while (k < segs.length - 1 && acc + segs[k][2] < want) { acc += segs[k][2]; k++; }
    const [a, b, L] = segs[k];
    const t = L ? (want - acc) / L : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** A face's cuts keyed by part and left-to-right order: eye0, eye1, mouth0, … */
function slotsOf(cuts) {
  const by = {};
  for (const c of cuts) (by[c.part] ||= []).push(c.pts);
  const out = {};
  for (const part of Object.keys(by)) {
    by[part].sort((a, b) => centroid(a)[0] - centroid(b)[0]);
    by[part].forEach((pts, i) => { out[part + i] = pts; });
  }
  return out;
}

/**
 * Everything the puppet needs, computed once: the pumpkin, the slot keys, and
 * for each mood one N-point outline per slot.
 */
export function buildRig(seed) {
  const p = carve(seed);
  const faces = {};
  for (const m of MOOD_KEYS) faces[m] = slotsOf(m === p.mood ? p.cuts : faceFor(p.seed, m, p.body).cuts);
  const keys = [...new Set(MOOD_KEYS.flatMap((m) => Object.keys(faces[m])))]
    .sort((a, b) => PARTS.indexOf(a.replace(/\d+$/, '')) - PARTS.indexOf(b.replace(/\d+$/, '')) || parseInt(a.match(/\d+$/)[0]) - parseInt(b.match(/\d+$/)[0]));
  const polys = {};
  for (const m of MOOD_KEYS) {
    polys[m] = keys.map((k) => {
      if (faces[m][k]) return resample(faces[m][k]);
      // Missing here: a point where it would be, pulled onto this face's
      // nearest cut of the same kind, so it grows out of (or into) that cut.
      const part = k.replace(/\d+$/, '');
      const home = MOOD_KEYS.map((o) => faces[o][k]).find(Boolean);
      const ref = centroid(home);
      const kin = Object.keys(faces[m]).filter((kk) => kk.replace(/\d+$/, '') === part).flatMap((kk) => faces[m][kk]);
      let at = ref;
      if (kin.length) {
        let best = Infinity;
        for (const q of kin) { const d = Math.hypot(q[0] - ref[0], q[1] - ref[1]); if (d < best) { best = d; at = q; } }
      }
      return Array.from({ length: N }, () => at.slice());
    });
  }
  return { p, keys, parts: keys.map((k) => k.replace(/\d+$/, '')), polys };
}

// ---------- the pose ----------

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * The face at one instant. `s` holds:
 *   from, to, k     the moods being morphed between, and how far (0..1)
 *   open            -0.6 (lips pressed) … 0 (as carved) … 1 (wide open)
 *   round           0 (wide, "ee") … 1 (round, "oo")
 *   blink           0 open … 1 shut
 *   brow            brow lift, px
 *   look            -1 … 1, the face turned left … right
 * Returns one outline per slot.
 */
export function pose(rig, s) {
  const { p, parts, polys } = rig;
  const A = polys[s.from], B = polys[s.to], k = ease(clamp(s.k, 0, 1));
  const out = A.map((poly, i) => poly.map((a, j) => [a[0] + (B[i][j][0] - a[0]) * k, a[1] + (B[i][j][1] - a[1]) * k]));

  // The mouth, all of its pieces together.
  const mouths = [];
  out.forEach((poly, i) => { if (parts[i] === 'mouth') mouths.push(i); });
  if (mouths.length && (s.open || s.round)) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of mouths) for (const [x, y] of out[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const mcx = (x0 + x1) / 2, w = Math.max(1, x1 - x0), h = Math.max(10, y1 - y0);
    const open = clamp(s.open || 0, -0.6, 1), round = clamp(s.round || 0, 0, 1);
    for (const i of mouths) {
      const [, cy] = centroid(out[i]);
      out[i] = out[i].map(([x, y]) => {
        const u = clamp((x - x0) / w, 0, 1), bell = Math.pow(Math.sin(Math.PI * u), 0.7);
        const dy = y - cy;
        // Lips part about the mouth's own middle; the jaw drops; the corners hold.
        const ny = cy + dy * (1 + open * 1.25 * bell) + Math.max(0, open) * bell * h * 0.35;
        const nx = mcx + (x - mcx) * (1 - round * Math.max(0.25, open) * 0.32);
        return [nx, ny];
      });
    }
  }
  // Eyes blink about their own middles; brows lift.
  out.forEach((poly, i) => {
    if (parts[i] === 'eye' && s.blink) {
      const [, cy] = centroid(poly), f = 1 - 0.9 * clamp(s.blink, 0, 1);
      out[i] = poly.map(([x, y]) => [x, cy + (y - cy) * f]);
    } else if (parts[i] === 'brow' && s.brow) {
      out[i] = poly.map(([x, y]) => [x, y - s.brow]);
    }
  });
  // The face turns: everything slides toward the turn and narrows a little.
  if (s.look) {
    const { cx, cy, ry } = p.body, L = clamp(s.look, -1, 1);
    for (let i = 0; i < out.length; i++) out[i] = out[i].map(([x, y]) => [cx + (x - cx) * (1 - 0.1 * Math.abs(L)) + L * 13 * (1 - 0.3 * Math.abs(y - cy) / ry), y]);
  }
  return out;
}

/** Mix two palettes. */
export function mixPalette(a, b, k) {
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  return a.map((c, i) => {
    const x = hex(c), y = hex(b[i]);
    return '#' + x.map((v, j) => Math.round(v + (y[j] - v) * k).toString(16).padStart(2, '0')).join('');
  });
}

// ---------- the puppet ----------

const pathOf = (pts) => {
  let d = 'M';
  for (let i = 0; i < pts.length; i++) d += (i ? 'L' : '') + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1);
  return d + 'Z';
};

/** Smooth noise in [-1, 1]: a few incommensurate sines. */
const wob = (t, s) => (Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 2.9 + s * 2.1) * 0.3 + Math.sin(t * 5.3 + s * 3.7) * 0.2);

export class Puppet {
  /**
   * host: an element to fill with the pumpkin's SVG. opts: { lit, id, calm }.
   * Drive it by setting `talk = { open, round }` each frame (or leave it
   * idle), call `feel(mood)` to change emotion, and call `frame(dt, t)` from
   * requestAnimationFrame.
   */
  constructor(host, seed, opts = {}) {
    this.rig = buildRig(seed);
    this.host = host;
    this.lit = opts.lit ?? true;
    this.calm = opts.calm ? 0.35 : 1;          // reduced motion
    const { p, keys } = this.rig;
    this.mood = p.mood;
    this.s = { from: p.mood, to: p.mood, k: 1, open: 0, round: 0, blink: 0, brow: 0, look: 0 };
    const first = this.rig.polys[p.mood];
    host.innerHTML = render({ ...p, cuts: keys.map((k, i) => ({ part: this.rig.parts[i], pts: first[i] })) },
      { rig: true, bg: false, lit: this.lit, id: opts.id || 'live' });
    const svg = this.svg = host.querySelector('svg');
    this.slots = keys.map((_, i) => [...svg.querySelectorAll(`[data-slot="${i}"]`)]);
    this.fire = keys.map((_, i) => svg.querySelector(`[data-slot="${i}"][data-rig="fire"]`));
    this.bodyG = svg.querySelector('[data-rig="body"]');
    this.shadow = svg.querySelector('[data-rig="shadow"]');
    this.glow = svg.querySelector('[data-rig="glow"]');
    this.halo = svg.querySelector('[data-rig="halo"]');
    this.spill = svg.querySelector('[data-rig="spill"]');
    this.stops = [...svg.querySelectorAll('[data-rig="stop"]')];
    this.palFrom = this.palTo = PALETTES[p.mood];

    // Life: blink, lean, look, hop.
    const h = (this.rig.p.seed.length * 7919 + [...this.rig.p.seed].reduce((a, c) => a + c.charCodeAt(0), 0)) % 1000;
    this.phase = h / 100;
    this.talk = { open: 0, round: 0 };
    this.energy = 0;
    this.nextBlink = 1 + Math.random() * 3; this.blinkT = -1;
    this.lean = 0; this.leanV = 0; this.leanTo = 0; this.nextShift = 2 + Math.random() * 4;
    this.lookTo = 0; this.nextLook = 1 + Math.random() * 3; this.lookAt = null;
    this.hop = 0; this.hopV = 0; this.tilt = 0; this.tiltTo = 0; this.squash = 0;
    this.speed = 1;
  }

  get title() { return this.rig.p.title.replace(MOODS[this.rig.p.mood].label, MOODS[this.mood].label); }

  /** Change emotion, morphing over `dur` seconds. */
  feel(mood, dur = 0.5) {
    if (!MOODS[mood] || mood === this.mood) return;
    // Start from wherever the face is now: freeze the current morph as `from`.
    const s = this.s;
    if (s.k < 1) {
      const now = pose(this.rig, { ...s, open: 0, round: 0, blink: 0, brow: 0, look: 0 });
      this.rig.polys.__now = now;
      s.from = '__now';
      this.palFrom = mixPalette(this.palFrom, this.palTo, ease(s.k));
    } else {
      s.from = this.mood; this.palFrom = this.palTo;
    }
    s.to = mood; s.k = 0; this.dur = dur;
    this.palTo = PALETTES[mood];
    this.mood = mood;
    this.jump(0.35);
  }

  /** A little hop: 1 is a proper jump. */
  jump(size = 1) { if (this.hop <= 0.5) this.hopV = 160 * size * this.calm; }
  /** Cock the head, for a question. */
  cock(dir = 1) { this.tiltTo = 6 * dir * this.calm; this.tiltHold = 1.2; }

  frame(dt, t) {
    dt = Math.min(dt, 0.05);
    const s = this.s, calm = this.calm;
    if (s.k < 1) s.k = Math.min(1, s.k + dt / (this.dur || 0.5));

    // Talking: ease toward the driver's target, fast up, a touch slower down.
    const target = this.talk.open || 0;
    s.open += (target - s.open) * Math.min(1, dt * (target > s.open ? 28 : 16));
    s.round += ((this.talk.round || 0) - s.round) * Math.min(1, dt * 18);
    const speaking = Math.max(0, s.open);
    this.energy += (speaking - this.energy) * Math.min(1, dt * 6);

    // Blink every few seconds, sometimes twice.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) { this.blinkT = 0; this.nextBlink = 2 + Math.random() * 4.5; if (Math.random() < 0.18) this.nextBlink = 0.32; }
    if (this.blinkT >= 0) { this.blinkT += dt; s.blink = Math.sin(Math.min(1, this.blinkT / 0.16) * Math.PI); if (this.blinkT > 0.16) { this.blinkT = -1; s.blink = 0; } }
    // Brows ride the voice.
    s.brow += (this.energy * 5 * calm - s.brow) * Math.min(1, dt * 8);

    // Shift in the seat: a new lean every few seconds, sprung.
    this.nextShift -= dt;
    if (this.nextShift <= 0) {
      this.nextShift = 3 + Math.random() * 6;
      this.leanTo = (Math.random() * 2 - 1) * 0.9;
      if (Math.random() < 0.3) this.jump(0.45);
    }
    this.leanV += ((this.leanTo - this.lean) * 30 - this.leanV * 7) * dt;
    this.lean += this.leanV * dt;

    // Look about, or at whoever is talking.
    this.nextLook -= dt;
    if (this.nextLook <= 0) { this.nextLook = 1.5 + Math.random() * 3.5; this.lookTo = (Math.random() * 2 - 1) * 0.7; }
    const lookGoal = this.lookAt ?? this.lookTo;
    s.look += (lookGoal - s.look) * Math.min(1, dt * 5);

    // Hop under gravity; land with a squash.
    if (this.hopV || this.hop > 0) {
      this.hopV -= 900 * dt; this.hop += this.hopV * dt;
      if (this.hop <= 0) { this.hop = 0; this.squash = Math.min(1, Math.abs(this.hopV) / 300); this.hopV = 0; }
    }
    this.squash *= Math.exp(-dt * 10);
    if (this.tiltHold > 0) { this.tiltHold -= dt; if (this.tiltHold <= 0) this.tiltTo = 0; }
    this.tilt += (this.tiltTo - this.tilt) * Math.min(1, dt * 6);

    this.draw(t);
  }

  draw(t) {
    const { p } = this.rig, { cx, cy, ry } = p.body, s = this.s, calm = this.calm;
    const polys = pose(this.rig, s);
    for (let i = 0; i < polys.length; i++) {
      const d = pathOf(polys[i]);
      for (const el of this.slots[i]) el.setAttribute('d', d);
      const f = this.fire[i];
      if (f) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [x, y] of polys[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const dx = -(mx - cx) * 0.07 - Math.sign(mx - cx) * 0.66, dy = -(my - cy) * 0.07 + 2.2;
        f.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
      }
    }
    // The body: breathe, sway, lean, bob while talking, hop, squash on landing.
    const bottom = cy + ry * 0.95;
    const breathe = Math.sin(t * 1.6 + this.phase) * 0.012 * calm;
    const bob = this.energy * 5 * Math.abs(Math.sin(t * 9 + this.phase)) * calm;
    const sq = this.squash * 0.08;
    const sx = 1 - breathe * 0.6 + sq, sy = 1 + breathe - sq + this.energy * 0.02 * calm;
    const rotDeg = (this.lean * 4 + wob(t * 0.5, this.phase) * 1.4 + this.tilt) * calm + s.look * 1.5;
    const lift = this.hop + bob;
    this.bodyG.setAttribute('transform',
      `translate(${(this.lean * 7 * calm).toFixed(2)} ${(-lift).toFixed(2)}) rotate(${rotDeg.toFixed(2)} ${cx} ${bottom.toFixed(1)}) ` +
      `translate(${cx} ${bottom.toFixed(1)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-cx} ${(-bottom).toFixed(1)})`);
    if (this.shadow) {
      const k = Math.max(0.6, 1 - lift / 90);
      this.shadow.setAttribute('transform', `translate(${(cx + this.lean * 7 * calm).toFixed(1)} 0) scale(${k.toFixed(3)} 1) translate(${-cx} 0)`);
      this.shadow.setAttribute('opacity', (0.45 * k).toFixed(3));
    }
    // The candle: flickers, flares with the voice, takes the mood's colour.
    if (this.lit) {
      const flick = 0.9 + 0.08 * wob(t * 6, this.phase) + 0.04 * Math.sin(t * 23 + this.phase);
      const flare = flick + this.energy * 0.25;
      for (const f of this.fire) if (f) f.setAttribute('opacity', Math.min(1, flick + this.energy * 0.1).toFixed(3));
      if (this.halo) this.halo.setAttribute('opacity', Math.min(1, 0.75 * flare).toFixed(3));
      if (this.glow) this.glow.setAttribute('opacity', (0.13 * flare * (1 + this.energy)).toFixed(3));
      if (this.spill) this.spill.setAttribute('opacity', Math.min(1, flare).toFixed(3));
      if (this.stops.length) {
        const pal = s.k < 1 ? mixPalette(this.palFrom, this.palTo, ease(s.k)) : this.palTo;
        this.stops.forEach((st, i) => st.setAttribute('stop-color', pal[i]));
      }
    }
  }
}
