/**
 * Run a dweet against an INSTRUMENTED canvas and report what it did.
 *
 * This is the worker half of `check.mjs`. It runs in a `node:worker_threads`
 * Worker for the same reason the browser runs a dweet in a web Worker:
 * `while(1)` is seven characters, and `terminate()` is the only primitive that
 * reliably stops one. The parent gives it a deadline and kills it.
 *
 * ─── instrumented, not rasterised, and the difference matters ──────────────
 *
 * There is no canvas in node and this does not pretend otherwise. The context
 * is a Proxy that RECORDS every property set and method call and draws
 * nothing. What that buys is the question an agent cannot otherwise answer
 * without a browser:
 *
 *     does this dweet do anything at all at t?
 *
 * which is worth more than it sounds. A dweet that draws nothing in its first
 * seconds is the commonest way one looks broken — the house `heartbeat` runs
 * `for(a=t%8;a>0;a-=.01)`, which at t=0 executes zero times and produced a
 * perfectly black 1280x720 still the first time this surface captured one.
 * A call count of 0 at t=0 and 193 at t=2 says that immediately, in
 * milliseconds, with no browser.
 *
 * What it CANNOT tell you is whether the result looks like anything. Draw
 * calls are not pixels: a dweet can make a thousand of them all off-screen, or
 * in black on black. For pixels, use `render.mjs`, which drives the real
 * browser.
 *
 * And one case it detects and refuses to guess about: a dweet that READS THE
 * CANVAS BACK (`getImageData`, `createPattern`, `drawImage` of itself) branches
 * on pixels this context never produced, so its call counts here are not what
 * a browser would do. `readsBack` says so and `check.mjs` prints it.
 */
import { parentPort, workerData } from 'node:worker_threads';

const { src, times, width, height } = workerData;

/** Every canvas member the dweet touched, and how often. */
const used = new Map();
const note = (k) => used.set(k, (used.get(k) || 0) + 1);

/** Members whose value a dweet might branch on. Returning junk changes the run. */
const READBACK = new Set(['getImageData', 'createPattern', 'measureText', 'isPointInPath',
                          'isPointInStroke', 'createImageData', 'getLineDash', 'drawImage']);
let readsBack = false;

/** Calls that put marks on the canvas, as opposed to setting up state. */
const DRAWS = new Set(['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'fillText',
                       'strokeText', 'drawImage', 'putImageData', 'ellipse', 'arc', 'arcTo',
                       'rect', 'lineTo', 'moveTo', 'bezierCurveTo', 'quadraticCurveTo',
                       'roundRect', 'closePath']);
/** …of those, the ones that actually commit ink. A path built and never filled draws nothing. */
const INK = new Set(['fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText',
                     'drawImage', 'putImageData']);

let draws = 0, ink = 0;

function makeCtx() {
  const target = {};
  const stub = (name) => (...args) => {
    note(name);
    if (DRAWS.has(name)) draws++;
    if (INK.has(name)) ink++;
    if (READBACK.has(name)) readsBack = true;
    // A few methods have return values a dweet may go on to use. Hand back
    // something shaped right so the program continues rather than throwing on
    // our account — and record that it happened.
    if (name === 'getImageData' || name === 'createImageData') {
      return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    }
    if (name === 'measureText') return { width: 0, actualBoundingBoxAscent: 0 };
    if (name === 'createLinearGradient' || name === 'createRadialGradient'
        || name === 'createConicGradient') {
      return { addColorStop() { note('gradient.addColorStop'); } };
    }
    if (name === 'getLineDash') return [];
    return undefined;
  };
  return new Proxy(target, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      note(prop);
      if (READBACK.has(prop)) readsBack = true;
      if (!(prop in target)) target[prop] = stub(prop);
      return target[prop];
    },
    set(_t, prop, value) {
      if (typeof prop === 'string') note(`${prop}=`);
      target[prop] = value;
      return true;
    },
  });
}

/** The canvas itself. `c.width|=0` is the ten-character clear, so writes count. */
let clears = 0;
function makeCanvas(ctx) {
  const box = { width, height };
  return new Proxy(box, {
    get(_t, prop) {
      if (prop === 'getContext') return () => ctx;
      if (prop === 'width' || prop === 'height') { note(`c.${String(prop)}`); return box[prop]; }
      note(`c.${String(prop)}`);
      return box[prop];
    },
    set(_t, prop, value) {
      if (prop === 'width' || prop === 'height') { clears++; note(`c.${String(prop)}=`); }
      box[prop] = value;
      return true;
    },
  });
}

const S = Math.sin, C = Math.cos, T = Math.tan;
const R = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a === undefined ? 1 : a})`;

const result = { ok: false, frames: [], api: [], readsBack: false, clears: 0, error: null };

try {
  const ctx = makeCtx();
  const canvas = makeCanvas(ctx);
  let u;
  try {
    u = new Function('t', 'S', 'C', 'T', 'R', 'c', 'x', src);
  } catch (err) {
    result.error = { stage: 'compile', message: String(err.message || err) };
    parentPort.postMessage(result);
    process.exit(0);
  }

  for (const t of times) {
    const before = { draws, ink, clears };
    try {
      u(t, S, C, T, R, canvas, ctx);
    } catch (err) {
      result.error = { stage: 'runtime', message: String(err.message || err), t };
      break;
    }
    result.frames.push({
      t,
      draws: draws - before.draws,
      ink: ink - before.ink,
      cleared: clears > before.clears,
    });
  }

  result.ok = !result.error;
  result.readsBack = readsBack;
  result.clears = clears;
  result.api = [...used.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ member: k, calls: n }));
} catch (err) {
  result.error = { stage: 'harness', message: String(err?.message || err) };
}

parentPort.postMessage(result);
