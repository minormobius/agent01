// gait.js — a walk in which a planted foot cannot slide.
//
// Each footfall is a point on the ground, fixed for its whole stance: the heel
// strikes and the foot rolls down AROUND THE HEEL, stands flat, then the heel
// lifts AROUND THE BALL. The pivots never move, so the foot cannot skate.
// The swing foot travels from one toe-off to the next heel strike.
//
// The pelvis is not animated up and down: its height is the highest the planted
// legs allow (a leg is never straighter than `straight`), softened a little. The
// bob, the dip at double support and the rise over the planted leg all fall out
// of that. Pelvis turn, drop and sway, the chest's counter-twist and the arms'
// swing are the only authored curves.

import { add, sub, apply, lerp3, madd, dot, ypr } from './vec.js';
import { ankleFor } from './rig.js';

export const WALK = { step: 0.3, cadence: 1.8, duty: 0.62, strike: 0.32, pushoff: 0.62, lift: 0.22, straight: 0.985, sway: 0.05, turn: 0.1, drop: 0.05, arm: 0.24, smooth: 4 };

const ease = (x) => x * x * (3 - 2 * x);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** Where each foot is at time t: the leg targets and the contact report. */
function feetAt(rig, t, o) {
  const m = rig.m, H = m.spec.heads;
  // the step scales with the leg, not the height: a chibi's legs are short
  const stepLen = o.step * 7 * (m.hipY / 3.66), T = 2 / o.cadence, speed = (2 * stepLen) / T;
  const sole = rig.foot.sole[2], heelZ = rig.foot.heel[2], ballZ = rig.foot.ball[2];
  const xs = { l: m.hipHalf * 0.85, r: -m.hipHalf * 0.85 };
  const phase0 = { l: 0, r: 0.5 };
  const heelAt = (s, k) => [xs[s], 0, speed * (k + phase0[s] + 0.3) * T - (sole - heelZ)];
  const feet = {}, legs = {};
  for (const s of ['l', 'r']) {
    const u = t / T - phase0[s];
    const k = Math.floor(u), ph = u - k;
    const H0 = heelAt(s, k);
    const ball0 = [H0[0], 0, H0[2] + (ballZ - heelZ)];
    if (ph < o.duty) {
      // stance: heel roll, flat, heel rise
      const a = 0.1, b = 0.38 / 0.62 * o.duty;
      if (ph < a) { const f = ease(ph / a); legs[s] = { at: H0, pivot: 'heel', pitch: o.strike * (1 - f) }; feet[s] = { contact: true, pivot: 'heel', point: H0 }; }
      else if (ph < b) { const at = [H0[0], 0, H0[2] + (sole - heelZ)]; legs[s] = { at, pivot: 'flat', pitch: 0 }; feet[s] = { contact: true, pivot: 'flat', point: at }; }
      else { const f = ease((ph - b) / (o.duty - b)); legs[s] = { at: ball0, pivot: 'ball', pitch: -o.pushoff * f }; feet[s] = { contact: true, pivot: 'ball', point: ball0 }; }
    } else {
      // swing: from this toe-off to the next heel strike
      const f = (ph - o.duty) / (1 - o.duty);
      const A0 = ankleFor(rig, ball0, 0, -o.pushoff, 'ball').ankle;
      const A1 = ankleFor(rig, heelAt(s, k + 1), 0, o.strike, 'heel').ankle;
      const ankle = lerp3(A0, A1, ease(f));
      ankle[1] += o.lift * m.footLen / 0.9 * Math.sin(Math.PI * Math.pow(f, 0.8));
      const pitch = -o.pushoff + (o.pushoff + o.strike) * ease(clamp(f * 1.3 - 0.1));
      legs[s] = { ankle, pitch };
      feet[s] = { contact: false, swing: f };
    }
  }
  return { feet, legs, T, speed };
}

/** The pelvis's authored motion at t: turn, drop, sway. */
function pelvisAt(rig, t, o, T) {
  const w = 2 * Math.PI * (t / T);
  return { w, yaw: -o.turn * Math.cos(w), roll: -o.drop * Math.sin(w), x: o.sway * rig.m.k * Math.sin(w) };
}

/** The highest the pelvis can be at t with neither leg straighter than `straight`. */
function heightLimit(rig, t, o) {
  const m = rig.m;
  const { legs, T, speed } = feetAt(rig, t, o);
  const { yaw, roll, x } = pelvisAt(rig, t, o, T);
  const z = speed * t;
  const reach = o.straight * (m.thighLen + m.shinLen);
  const F = ypr(yaw, 0, roll);
  let y = rig.rootY;
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const L = legs[s];
    const A = L.ankle || ankleFor(rig, L.at, 0, L.pitch, L.pivot).ankle;
    const hipOff = apply(F, [sg * m.hipHalf, -0.08 * m.k, 0.02]);          // as rig.solve places the hip
    const dx = x + hipOff[0] - A[0], dz = z + hipOff[2] - A[2];
    y = Math.min(y, A[1] - hipOff[1] + Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz)));
  }
  return y;
}

/**
 * The pelvis height over one cycle, as a table. The limit above has corners:
 * troughs where the constraint passes from one leg to the other, peaks where a
 * pivot changes. A morphological OPENING with a parabola of curvature 2a rounds
 * both — erode (the lower envelope of upward parabolas: troughs become curves),
 * then dilate (the upper envelope of downward ones: peaks become curves) — and
 * an opening never exceeds what it opens: the pelvis never rises above what the
 * legs can reach. The walk is periodic, so this is done once, on a fine grid.
 */
const TABLES = new WeakMap();
function heightTable(rig, o) {
  const key = JSON.stringify(o);
  let per = TABLES.get(rig);
  if (!per) TABLES.set(rig, (per = new Map()));
  if (per.has(key)) return per.get(key);
  const T = 2 / o.cadence, N = 480, dt = T / N;
  const f = Array.from({ length: N }, (_, i) => heightLimit(rig, i * dt, o));
  const a = o.smooth * rig.m.k, J = Math.ceil((0.3 * T) / dt);
  const at = (arr, i) => arr[((i % N) + N) % N];
  const ero = f.map((_, i) => { let v = Infinity; for (let j = -J; j <= J; j++) v = Math.min(v, at(f, i + j) + a * (j * dt) ** 2); return v; });
    // dilate with twice the curvature: the eroded troughs are parabolas of exactly
  // 2a, and dilating those with the same parabola is degenerate (unbounded in the
  // window). With 2a it is bounded, and still never above f (take σ = −τ).
  const op = ero.map((_, i) => { let v = -Infinity; for (let j = -J; j <= J; j++) v = Math.max(v, at(ero, i + j) - 2 * a * (j * dt) ** 2); return v; });
  const tab = { T, N, y: op };
  per.set(key, tab);
  return tab;
}
function sampleTable(tab, t) {
  const u = (((t / tab.T) % 1) + 1) % 1 * tab.N, i = Math.floor(u), f = u - i;
  const y = (k) => tab.y[((k % tab.N) + tab.N) % tab.N];
  const p0 = y(i - 1), p1 = y(i), p2 = y(i + 1), p3 = y(i + 2);
  return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
}

/**
 * The walk at time t: { pose, feet } where feet[s] = { contact, pivot, point }
 * gives, while a foot is planted, the ground point it pivots on.
 */
export function walk(rig, t, opt = {}) {
  const o = { ...WALK, ...opt };
  const m = rig.m;
  const { feet, legs, T, speed } = feetAt(rig, t, o);
  const { w, yaw, roll, x } = pelvisAt(rig, t, o, T);
  const y = sampleTable(heightTable(rig, o), t);
  const pelvisZ = speed * t;
  // the hair lags the body: the pelvis's acceleration a moment ago (finite differences
  // of the same analytic motion, so the walk stays a pure function of t)
  const at = (tt) => { const q = pelvisAt(rig, tt, o, T); return [q.x, sampleTable(heightTable(rig, o), tt), speed * tt]; };
  const lag = 0.12, h = 0.02, t0 = t - lag;
  const a0 = at(t0 - h), a1 = at(t0), a2 = at(t0 + h);
  const hairAccel = [0, 1, 2].map((k) => (a2[k] - 2 * a1[k] + a0[k]) / (h * h));
  const pose = {
    hairAccel,
    root: { pos: [x, y, pelvisZ], yaw, roll },
    spine: { twist: -2.2 * yaw, bend: 0.05 },
    lookAt: [0, m.chin + 0.3, pelvisZ + 40],
    legs: { l: { ...legs.l, yaw: 0 }, r: { ...legs.r, yaw: 0 } },
    arms: {},
  };
  for (const [s] of [['l'], ['r']]) {
    // each arm swings against its own leg: left leg forward (w = 0) → left arm back
    const fb = -o.arm * Math.cos(w + (s === 'r' ? Math.PI : 0));
    const outA = 0.15;
    pose.arms[s] = { raise: Math.hypot(outA, fb), out: Math.atan2(outA, fb), elbow: 0.2 + 0.2 * Math.max(0, fb) / o.arm };
  }
  return { pose, feet, cycle: T, speed };
}
