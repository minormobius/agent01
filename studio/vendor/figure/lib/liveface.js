// liveface.js — a face alive: blinks, the eyes' small darts, and one expression turning
// into the next instead of switching.
//
// A face that holds still between cuts reads as a doll: people blink every few seconds (a
// fast close, a slower open), their eyes move in small jumps even while they look at you,
// and a smile grows rather than appearing. All of it is a function of TIME and a seed,
// never of history, so a seek, a still and a check see the same face.

import { EXPRESSIONS, BASE } from './face.js';

const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * How shut the eyes are for a blink at time t (seconds): 0 open … 1 closed. One blink every
 * 2.2–4.6 s, now and then a double; each closes in 50 ms, stays shut 30 ms, opens in 90 ms.
 */
export function blinkAt(t, seed = 0) {
  const cell = 3.4, i = Math.floor(t / cell + seed * 0.61);
  let shut = 0;
  for (const j of [i - 1, i]) {
    const c = (j - seed * 0.61) * cell + 0.2 + hash(j + seed * 7.3) * (cell - 0.6);
    for (const at of hash(j * 3.1 + seed) < 0.15 ? [c, c + 0.28] : [c]) {
      const d = t - at;
      if (d < 0 || d > 0.17) continue;
      shut = Math.max(shut, d < 0.05 ? d / 0.05 : d < 0.08 ? 1 : 1 - (d - 0.08) / 0.09);
    }
  }
  return shut;
}

/** The eyes' darts: a small offset held 0.6–1.5 s, a fast jump between; every third returns home. */
export function saccadeAt(t, seed = 0) {
  const cell = 1.05, i = Math.floor(t / cell + seed * 0.37);
  const off = (j) => (j % 3 === 0 ? [0, 0] : [(hash(j + seed * 5.1) - 0.5) * 0.5, (hash(j * 1.7 + seed) - 0.5) * 0.24]);
  const u = Math.min(1, (t / cell + seed * 0.37 - i) / 0.04);       // 40 ms to jump
  const a = off(i - 1), b = off(i);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

// every numeric field any expression sets, with what it is when an expression leaves it alone
const FIELDS = [...new Set(Object.values(EXPRESSIONS).flatMap((e) => Object.keys(e)))];
const DEFAULT = Object.fromEntries(FIELDS.map((k) => [k, k === 'open' ? 1 : k === 'wink' ? 0 : BASE[k] ?? 0]));

/** Expressions mixed: [[name or overrides, weight], …] → one expression (an object). */
export function blendExpressions(parts) {
  const total = parts.reduce((s, [, w]) => s + w, 0) || 1, out = {};
  for (const k of FIELDS) out[k] = parts.reduce((s, [e, w]) => { const E = typeof e === 'string' ? EXPRESSIONS[e] : e; return s + (E[k] ?? DEFAULT[k]) * w; }, 0) / total;
  return out;
}

/**
 * The expression at time t, from a function naming the expression at any time: the names
 * over the last `ease` seconds, averaged (a box filter), so a change takes `ease` to happen.
 */
export function easedExpression(nameAt, t, ease = 0.22, samples = 6) {
  const parts = [];
  for (let i = 0; i < samples; i++) parts.push([nameAt(t - (ease * i) / (samples - 1)), 1]);
  if (parts.every(([n]) => n === parts[0][0])) return parts[0][0];
  return blendExpressions(parts);
}
