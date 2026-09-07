// draw.js — rendering for /qgol/.
//
// Two things get drawn: the board, and the population trace. The board is the
// interesting one, because the whole point of splitting a generation into four
// operators is that the intermediate state — the LEDGER — becomes visible. In
// ordinary Life there is nothing between generation n and n+1 to look at. Here
// there is, and it is what the player is actually manipulating, so it has to
// read at a glance:
//
//   a pale square          a live cell, with no verdict against it
//   a blue square          a live cell marked by W — it dies for loneliness
//   a red square           a live cell marked by O — it dies for crowding
//   a small green pip      an empty cell marked by Q — it is about to be born
//
// Colours here are by MEANING, not by key position: green for coming, blue for
// cold, red for hot, amber for the clock. That deliberately breaks the
// key-colour convention the other pages on this surface use, because on those
// pages the four keys are four interchangeable cilia and here they are four
// different kinds of thing.

import { neighbourCounts } from './life.js';

export const COLOURS = {
  bg: '#050d14',
  grid: '#0d1823',
  live: '#c9d2da',
  birth: '#4fc6a0',
  lonely: '#6aa8f0',
  crowded: '#f0655a',
  commit: '#f0b03c',
  dim: '#5c646d',
  fg: '#d8dde2',
};

function fit(cnv) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cnv.clientWidth * dpr));
  const h = Math.max(1, Math.round(cnv.clientHeight * dpr));
  if (cnv.width !== w || cnv.height !== h) { cnv.width = w; cnv.height = h; }
  const ctx = cnv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cnv.clientWidth, h: cnv.clientHeight };
}

// A scratch neighbour array per canvas, so drawing does not allocate per frame.
const scratch = new WeakMap();

export function drawBoard(cnv, world, opts = {}) {
  const { showMarks = true, flash = 0 } = opts;
  const { ctx, w: W, h: H } = fit(cnv);

  ctx.fillStyle = COLOURS.bg;
  ctx.fillRect(0, 0, W, H);

  const cell = Math.max(1, Math.min(W / world.w, H / world.h));
  const ox = (W - cell * world.w) / 2;
  const oy = (H - cell * world.h) / 2;

  // Grid, only when the cells are big enough for it to be structure rather
  // than noise.
  if (cell >= 6) {
    ctx.strokeStyle = COLOURS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= world.w; x++) {
      const px = Math.round(ox + x * cell) + 0.5;
      ctx.moveTo(px, oy); ctx.lineTo(px, oy + cell * world.h);
    }
    for (let y = 0; y <= world.h; y++) {
      const py = Math.round(oy + y * cell) + 0.5;
      ctx.moveTo(ox, py); ctx.lineTo(ox + cell * world.w, py);
    }
    ctx.stroke();
  }

  // Only compute neighbour counts when there is actually a death mark to
  // attribute. The ledger records THAT a cell is condemned, not by which
  // operator — which is correct for the model (a death is a death, and two
  // operators marking the same cell must not kill it twice) but leaves the
  // renderer to work out the reason. It is recoverable: a condemned live cell
  // with fewer than two neighbours was W's, more than three was O's.
  let n = null;
  let anyDeath = false;
  if (showMarks) {
    for (let i = 0; i < world.deathMark.length; i++) {
      if (world.deathMark[i]) { anyDeath = true; break; }
    }
    if (anyDeath) {
      let buf = scratch.get(cnv);
      if (!buf || buf.length !== world.w * world.h) {
        buf = new Uint8Array(world.w * world.h);
        scratch.set(cnv, buf);
      }
      n = neighbourCounts(world, buf);
    }
  }

  const inset = cell >= 6 ? 1 : 0;
  const s = Math.max(1, cell - inset);

  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const i = y * world.w + x;
      const px = ox + x * cell, py = oy + y * cell;
      if (world.cells[i]) {
        let col = COLOURS.live;
        if (showMarks && world.deathMark[i] && n) {
          col = n[i] < 2 ? COLOURS.lonely : COLOURS.crowded;
        }
        ctx.fillStyle = col;
        ctx.fillRect(px, py, s, s);
      } else if (showMarks && world.birthMark[i]) {
        // A pip rather than a full square: it is not alive yet, and the
        // difference between pending and actual has to survive a glance.
        const p = Math.max(1, cell * 0.42);
        ctx.fillStyle = COLOURS.birth;
        ctx.fillRect(px + (cell - p) / 2, py + (cell - p) / 2, p, p);
      }
    }
  }

  // The commit flash. P is the only key that changes anything, so it is the
  // only one that gets a whole-board acknowledgement.
  if (flash > 0) {
    ctx.fillStyle = COLOURS.commit;
    ctx.globalAlpha = 0.13 * flash;
    ctx.fillRect(ox, oy, cell * world.w, cell * world.h);
    ctx.globalAlpha = 1;
  }
}

// The population trace. The whole showcase is a COMPARISON — this controller
// against plain Conway on the same soup — so the baseline is drawn as a ghost
// with the generation it died at marked. Without that the live curve is just a
// wiggly line and proves nothing.
export function drawTrace(cnv, trace, opts = {}) {
  const { baseline = null, gens = 600, capacity = 1 } = opts;
  const { ctx, w: W, h: H } = fit(cnv);

  ctx.fillStyle = COLOURS.bg;
  ctx.fillRect(0, 0, W, H);

  const padL = 4, padR = 4, padT = 6, padB = 12;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  let peak = 8;
  for (const t of trace) peak = Math.max(peak, t.pop);
  if (baseline) for (const b of baseline) peak = Math.max(peak, b.pop);

  const X = (g) => padL + (g / gens) * plotW;
  const Y = (p) => padT + plotH - (p / peak) * plotH;

  // The saturation line: above this the board is mostly full, which is a way
  // of "surviving" that does not count. Drawn so it is visible that the run is
  // nowhere near it.
  const satPop = capacity * 0.7;
  if (satPop <= peak) {
    ctx.strokeStyle = '#2a1f16';
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(padL, Y(satPop)); ctx.lineTo(W - padR, Y(satPop)); ctx.stroke();
    ctx.setLineDash([]);
  }

  if (baseline && baseline.length) {
    ctx.strokeStyle = '#33404d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    baseline.forEach((b, i) => (i ? ctx.lineTo(X(b.gen), Y(b.pop)) : ctx.moveTo(X(b.gen), Y(b.pop))));
    ctx.stroke();
    const last = baseline[baseline.length - 1];
    if (last.pop === 0) {
      ctx.strokeStyle = COLOURS.crowded;
      ctx.beginPath();
      ctx.moveTo(X(last.gen), Y(0)); ctx.lineTo(X(last.gen), Y(0) - 9);
      ctx.stroke();
      ctx.fillStyle = COLOURS.crowded;
      ctx.font = '9px ui-monospace, Menlo, monospace';
      ctx.fillText(`conway dies @${last.gen}`, Math.min(W - 92, X(last.gen) + 4), Y(0) - 3);
    }
  }

  if (trace.length) {
    ctx.strokeStyle = COLOURS.birth;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    trace.forEach((t, i) => (i ? ctx.lineTo(X(t.gen), Y(t.pop)) : ctx.moveTo(X(t.gen), Y(t.pop))));
    ctx.stroke();

    // Every generation where the controller deviated from Conway gets a tick
    // along the floor. The claim being made is that the rescue is CHEAP, and a
    // sparse row of ticks is what cheap looks like.
    ctx.fillStyle = COLOURS.commit;
    for (const t of trace) {
      if (t.ops.length !== 3) ctx.fillRect(X(t.gen), H - padB + 2, 1.5, 4);
    }
  }

  ctx.fillStyle = COLOURS.dim;
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillText(`peak ${peak}`, padL + 1, padT + 8);
}
