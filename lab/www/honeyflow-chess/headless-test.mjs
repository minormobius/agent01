#!/usr/bin/env node
// Headless play-tester for Honeyflow Chess — run with `node headless-test.mjs`.
//
// Not part of the site (index.html never loads this — the build rule for this
// tenant is one self-contained HTML file with no imports). This is a
// standalone rig so a move's effect on the fluid field, and on a neighbouring
// piece's drag offset, can be MEASURED instead of guessed. It duplicates the
// solver and the piece-physics formulas from index.html byte-for-byte on
// purpose — see BRIEF.md's Gotchas for why there's no shared module, and for
// the discipline this creates: if you tune a constant in index.html, mirror
// it here too, or this rig starts measuring a different simulation than the
// one that ships.
//
// This turn (see BRIEF.md) replaced the old single-cell injection with a
// wide splat kernel (splatVelocity/splatDensity, radius SPREAD_RADIUS) so a
// neighbouring square gets a materially large share of a move's disturbance
// directly, instead of waiting on diffusion to leak an ever-more-dilute
// signal there over dozens of frames. That was the actual cause of "pieces
// aren't moving their neighbors at all" — mirrored here byte-for-byte too.
//
// What it does:
//   1. Sets up an 8x8 board with the standard opening position.
//   2. Plays a single move (default: white pawn e2-e4, the move named in the
//      request this file was built for), exactly as doMove()/injectFlow() do
//      in index.html.
//   3. Steps the fluid solver forward for a few seconds' worth of ticks,
//      running the same updatePiecePhysics() every tick, and records the
//      peak drag offset of every OTHER occupied square — the "neighbouring
//      pieces get caught in the flow" claim, measured rather than asserted.
//   4. Sweeps a small grid of DRAG values (the one constant this turn's
//      request asked to have tuned) and prints a table, plus a recommended
//      value against a target window explained below.
//   5. Runs an isFinite() check on every array after every tick — if the
//      solver is ever going to explode into NaN, this is what would catch it
//      before a visitor's browser does.
//
// Usage:
//   node headless-test.mjs                    # default scenario, DRAG sweep
//   node headless-test.mjs --move=d2d4        # a different opening push
//   node headless-test.mjs --drag=1.4         # single DRAG value, verbose trace

'use strict';

// ---------------------------------------------------------------------
// Solver — copied from index.html's <script> block. Keep these two files'
// solver code identical; this rig is only meaningful if it matches.
// ---------------------------------------------------------------------
const N = 50;
function IX(x, y) { return x + y * N; }
function clampi(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function clampf(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function Fluid() {
  this.Vx = new Float32Array(N * N);
  this.Vy = new Float32Array(N * N);
  this.Vx0 = new Float32Array(N * N);
  this.Vy0 = new Float32Array(N * N);
  this.dens = new Float32Array(N * N);
  this.dens0 = new Float32Array(N * N);
  this.visc = 0.00006 * 5; // "med" thickness slider default (value 5)
  this.diff = 0.00003 * 5;
  this.dt = 1;
}

Fluid.prototype.splatVelocity = function (x, y, ax, ay, radius) {
  const i0 = clampi(Math.floor(x - radius), 1, N - 2), i1 = clampi(Math.ceil(x + radius), 1, N - 2);
  const j0 = clampi(Math.floor(y - radius), 1, N - 2), j1 = clampi(Math.ceil(y + radius), 1, N - 2);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - x, dy = j - y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= radius) continue;
      const w = 1 - r / radius;
      this.Vx[IX(i, j)] += ax * w;
      this.Vy[IX(i, j)] += ay * w;
    }
  }
};
Fluid.prototype.splatDensity = function (x, y, amt, radius) {
  const i0 = clampi(Math.floor(x - radius), 1, N - 2), i1 = clampi(Math.ceil(x + radius), 1, N - 2);
  const j0 = clampi(Math.floor(y - radius), 1, N - 2), j1 = clampi(Math.ceil(y + radius), 1, N - 2);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - x, dy = j - y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= radius) continue;
      this.dens[IX(i, j)] += amt * (1 - r / radius);
    }
  }
};

function setBnd(b, x) {
  for (let i = 1; i < N - 1; i++) {
    x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
    x[IX(i, N - 1)] = b === 2 ? -x[IX(i, N - 2)] : x[IX(i, N - 2)];
  }
  for (let j = 1; j < N - 1; j++) {
    x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
    x[IX(N - 1, j)] = b === 1 ? -x[IX(N - 2, j)] : x[IX(N - 2, j)];
  }
  x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
  x[IX(0, N - 1)] = 0.5 * (x[IX(1, N - 1)] + x[IX(0, N - 2)]);
  x[IX(N - 1, 0)] = 0.5 * (x[IX(N - 2, 0)] + x[IX(N - 1, 1)]);
  x[IX(N - 1, N - 1)] = 0.5 * (x[IX(N - 2, N - 1)] + x[IX(N - 1, N - 2)]);
}

function linSolve(b, x, x0, a, c, iter) {
  const cRecip = 1 / c;
  for (let k = 0; k < iter; k++) {
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        x[IX(i, j)] = (x0[IX(i, j)] + a * (x[IX(i + 1, j)] + x[IX(i - 1, j)] +
          x[IX(i, j + 1)] + x[IX(i, j - 1)])) * cRecip;
      }
    }
    setBnd(b, x);
  }
}

function diffuse(b, x, x0, diffAmt, dt, iter) {
  const a = dt * diffAmt * (N - 2) * (N - 2);
  linSolve(b, x, x0, a, 1 + 6 * a, iter);
}

function project(vx, vy, p, div, iter) {
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      div[IX(i, j)] = -0.5 * (vx[IX(i + 1, j)] - vx[IX(i - 1, j)] +
        vy[IX(i, j + 1)] - vy[IX(i, j - 1)]) / N;
      p[IX(i, j)] = 0;
    }
  }
  setBnd(0, div); setBnd(0, p);
  linSolve(0, p, div, 1, 6, iter);
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      vx[IX(i, j)] -= 0.5 * (p[IX(i + 1, j)] - p[IX(i - 1, j)]) * N;
      vy[IX(i, j)] -= 0.5 * (p[IX(i, j + 1)] - p[IX(i, j - 1)]) * N;
    }
  }
  setBnd(1, vx); setBnd(2, vy);
}

function advect(b, d, d0, vx, vy, dt) {
  const dtx = dt * (N - 2), dty = dt * (N - 2);
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      let x = i - dtx * vx[IX(i, j)];
      let y = j - dty * vy[IX(i, j)];
      if (x < 0.5) x = 0.5; if (x > N - 1.5) x = N - 1.5;
      if (y < 0.5) y = 0.5; if (y > N - 1.5) y = N - 1.5;
      const i0 = Math.floor(x), i1 = i0 + 1, j0 = Math.floor(y), j1 = j0 + 1;
      const s1 = x - i0, s0 = 1 - s1, t1 = y - j0, t0 = 1 - t1;
      d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
                    s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
    }
  }
  setBnd(b, d);
}

Fluid.prototype.step = function () {
  const iter = 4, dt = this.dt;
  diffuse(1, this.Vx0, this.Vx, this.visc, dt, iter);
  diffuse(2, this.Vy0, this.Vy, this.visc, dt, iter);
  project(this.Vx0, this.Vy0, this.Vx, this.Vy, iter);
  advect(1, this.Vx, this.Vx0, this.Vx0, this.Vy0, dt);
  advect(2, this.Vy, this.Vy0, this.Vx0, this.Vy0, dt);
  project(this.Vx, this.Vy, this.Vx0, this.Vy0, iter);
  diffuse(0, this.dens0, this.dens, this.diff, dt, iter);
  advect(0, this.dens, this.dens0, this.Vx, this.Vy, dt);
  for (let k = 0; k < this.dens.length; k++) this.dens[k] *= 0.996;
};

Fluid.prototype.sampleVel = function (bx, by) {
  const sx = clampf(1 + bx * (N - 2) / 8, 1, N - 2);
  const sy = clampf(1 + by * (N - 2) / 8, 1, N - 2);
  const i0 = Math.floor(sx), j0 = Math.floor(sy);
  const i1 = Math.min(i0 + 1, N - 2), j1 = Math.min(j0 + 1, N - 2);
  const s1 = sx - i0, s0 = 1 - s1, t1 = sy - j0, t0 = 1 - t1;
  const vx = s0 * (t0 * this.Vx[IX(i0, j0)] + t1 * this.Vx[IX(i0, j1)]) +
             s1 * (t0 * this.Vx[IX(i1, j0)] + t1 * this.Vx[IX(i1, j1)]);
  const vy = s0 * (t0 * this.Vy[IX(i0, j0)] + t1 * this.Vy[IX(i0, j1)]) +
             s1 * (t0 * this.Vy[IX(i1, j0)] + t1 * this.Vy[IX(i1, j1)]);
  return [vx, vy];
};

const SPREAD_RADIUS = 14; // must match index.html

function injectFlow(fluid, flowStrength, fx, fy, tx, ty, dist) {
  if (dist < 1e-4) return;
  const dx = tx - fx, dy = ty - fy;
  const ux = dx / dist, uy = dy / dist;
  const pathLen = dist * (N - 2) / 8;
  const steps = Math.max(1, Math.round(pathLen / (SPREAD_RADIUS * 0.7)));
  const base = flowStrength * (0.7 + dist * 0.55);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bx = fx + dx * t, by = fy + dy * t;
    const sx = 1 + bx * (N - 2) / 8, sy = 1 + by * (N - 2) / 8;
    const fall = Math.max(0.2, 1 - Math.abs(t - 0.5) * 1.3);
    fluid.splatVelocity(sx, sy, ux * base * fall * 0.045, uy * base * fall * 0.045, SPREAD_RADIUS);
    fluid.splatDensity(sx, sy, base * fall * 3.0, SPREAD_RADIUS);
  }
}

// ---------------------------------------------------------------------
// Board + piece physics — mirrors board setup and updatePiecePhysics()
// from index.html.
// ---------------------------------------------------------------------
const PIECE_MASS = { P: 1, N: 2.2, B: 2.2, R: 3.4, Q: 5.2, K: 4 };
const RESTORE = 0.90;
const MAX_OFFSET = 0.3;

const START = [
  ['bR','bN','bB','bQ','bK','bB','bN','bR'],
  ['bP','bP','bP','bP','bP','bP','bP','bP'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['wP','wP','wP','wP','wP','wP','wP','wP'],
  ['wR','wN','wB','wQ','wK','wB','wN','wR'],
];

function sqToRC(sq) {
  const c = sq.charCodeAt(0) - 97, r = 8 - Number(sq[1]);
  return [r, c];
}

function isFiniteField(arr) {
  for (let k = 0; k < arr.length; k++) if (!Number.isFinite(arr[k])) return false;
  return true;
}

function runScenario(moveStr, drag, flowStrength, ticks, verbose) {
  const board = START.map(row => row.slice());
  const [fr, fc] = sqToRC(moveStr.slice(0, 2));
  const [tr, tc] = sqToRC(moveStr.slice(2, 4));
  const piece = board[fr][fc];
  if (!piece) throw new Error('no piece on ' + moveStr.slice(0, 2));
  board[tr][tc] = piece;
  board[fr][fc] = null;

  const fluid = new Fluid();
  const dx = tc - fc, dy = tr - fr;
  const dist = Math.hypot(dx, dy);
  injectFlow(fluid, flowStrength, fc + 0.5, fr + 0.5, tc + 0.5, tr + 0.5, dist);

  // offset state for every occupied square, chess coords
  const offsets = [];
  for (let r = 0; r < 8; r++) {
    offsets.push(Array.from({ length: 8 }, () => ({ ox: 0, oy: 0 })));
  }

  const peak = {}; // "sq" -> { ox, oy } peak-magnitude offset seen
  let sane = true;

  for (let tick = 0; tick < ticks; tick++) {
    fluid.step();
    if (!isFiniteField(fluid.Vx) || !isFiniteField(fluid.Vy) || !isFiniteField(fluid.dens)) {
      sane = false;
      break;
    }
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        const st = offsets[r][c];
        if (!p) { st.ox = 0; st.oy = 0; continue; }
        const bx = c + 0.5 + st.ox, by = r + 0.5 + st.oy;
        const v = fluid.sampleVel(bx, by);
        const fvx = v[0] * 8, fvy = v[1] * 8;
        const m = PIECE_MASS[p[1]] || 2;
        st.ox = clampf((st.ox + fvx * drag / m) * RESTORE, -MAX_OFFSET, MAX_OFFSET);
        st.oy = clampf((st.oy + fvy * drag / m) * RESTORE, -MAX_OFFSET, MAX_OFFSET);
        const key = String.fromCharCode(97 + c) + (8 - r);
        const prev = peak[key] || { ox: 0, oy: 0 };
        if (Math.hypot(st.ox, st.oy) > Math.hypot(prev.ox, prev.oy)) peak[key] = { ox: st.ox, oy: st.oy };
      }
    }
    if (verbose && tick % 20 === 0) {
      let maxSpeed = 0;
      for (let k = 0; k < fluid.Vx.length; k++) maxSpeed = Math.max(maxSpeed, Math.hypot(fluid.Vx[k], fluid.Vy[k]));
      console.log('  tick', tick, 'field max speed', maxSpeed.toFixed(5));
    }
  }

  return { peak, sane, movedTo: String.fromCharCode(97 + tc) + (8 - tr) };
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const MOVE = args.move || 'e2e4';
const TICKS = Number(args.ticks) || 240; // ~4s at 60fps
const FLOW = Number(args.flow) || 2.6;   // matches the page's new default

console.log('Honeyflow Chess — headless play tester');
console.log('move=' + MOVE + '  ticks=' + TICKS + '  flowStrength=' + FLOW);
console.log('(no browser/shell exists to have run this before shipping — verify it does what this header claims before trusting its numbers)');
console.log('');

if (args.drag) {
  const drag = Number(args.drag);
  const { peak, sane, movedTo } = runScenario(MOVE, drag, FLOW, TICKS, true);
  console.log('');
  console.log('sane (no NaN/divergence):', sane);
  console.log('peak offsets by square (ox, oy in board-units; oy<0 is "forward" for White):');
  for (const [sq, o] of Object.entries(peak).sort()) {
    if (Math.hypot(o.ox, o.oy) < 0.005) continue;
    if (sq === movedTo) continue;
    console.log('  ' + sq + '  ox=' + o.ox.toFixed(3) + '  oy=' + o.oy.toFixed(3));
  }
  process.exit(0);
}

// Sweep: the request asked specifically to tune DRAG so a pawn's two-square
// advance "barely pulls neighbouring pawns forward one". "Barely" plus the
// existing MAX_OFFSET=0.3 tap-target ceiling (see BRIEF.md) reads as a
// target window well under the clamp — 0.08 to 0.18 board-units of forward
// offset on the immediate neighbour is the working definition used here;
// change TARGET_MIN/MAX below if that reading is wrong.
const TARGET_MIN = 0.08, TARGET_MAX = 0.18;
const sweep = [0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.6];
console.log('DRAG sweep — peak forward |oy| on the two immediate lateral neighbours:');
console.log('(neighbours of e2e4 are d2 and f2; adjust by hand for other openings)');
let best = null;
for (const drag of sweep) {
  const { peak, sane } = runScenario(MOVE, drag, FLOW, TICKS, false);
  const [fr] = sqToRC(MOVE.slice(0, 2));
  const nbCols = [sqToRC(MOVE.slice(0, 2))[1] - 1, sqToRC(MOVE.slice(0, 2))[1] + 1];
  const nbSquares = nbCols.filter(c => c >= 0 && c < 8).map(c => String.fromCharCode(97 + c) + (8 - fr));
  const mags = nbSquares.map(sq => Math.abs((peak[sq] || { oy: 0 }).oy));
  const peakMag = Math.max(...mags, 0);
  const inWindow = peakMag >= TARGET_MIN && peakMag <= TARGET_MAX;
  console.log('  DRAG=' + drag.toFixed(1).padStart(4) + '  sane=' + sane +
    '  ' + nbSquares.map((sq, i) => sq + '=' + mags[i].toFixed(3)).join('  ') +
    (inWindow ? '   <-- in target window' : ''));
  if (sane && inWindow && !best) best = drag;
}
console.log('');
console.log(best
  ? 'Recommended DRAG: ' + best + ' (first sweep value landing in the ' + TARGET_MIN + '-' + TARGET_MAX + ' window)'
  : 'No swept value landed in the ' + TARGET_MIN + '-' + TARGET_MAX + ' window — widen the sweep array above, or the window is wrong for what "barely" should mean here.');
console.log('index.html currently ships DRAG=1.0 — rerun with --drag=1.0 (add --move/--ticks/--flow as needed) for that value\'s full per-square trace.');
