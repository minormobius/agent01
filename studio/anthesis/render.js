// render.js — Anthesis at one size: the thing both the page and the video draw.
//
// makeRenderer(W, H, dpr) returns draw(ctx, t, opts), which paints second t
// into a canvas of W·dpr × H·dpr device pixels. The live page and the video
// exporter call the same function. (The drawing modules were written against
// p5's API; they only ever use its drawingContext, and makeSoil its
// createGraphics, so a two-member shim stands in for p5 here.)

import { cues } from './score.js';
import { clamp, span, ease, rgba } from './util.js';
import {
  makeClock, lightAt, drawSky, makeStars, drawStars, drawLights, makeHills, drawHills,
  makeSoil, makeDrops, drawDropsFalling, drawSplashes, drawSoak, imbibed,
} from './world.js';
import { makePlant, drawPlant, flowerPoint } from './plant.js';

const clock = makeClock(cues);
const P = makePlant(cues);
const drops = makeDrops(cues);
const stars = makeStars();
const hills = makeHills();
const day0 = Math.floor(clock(0));

const CAPTIONS = [
  [0, 'a poppy seed, in the dark'],
  [cues.drops[0].at, 'water'],
  [cues.crack, 'the root goes first'],
  [cues.hypocotyl, 'the shoot comes up hooked, head down'],
  [cues.emerge, 'light'],
  [cues.cotyledons, 'seed leaves'],
  [cues.leaves[0], 'true leaves'],
  [cues.bud, 'a bud, nodding'],
  [cues.lift, 'it lifts its head'],
  [cues.petals[0], 'anthesis'],
  [cues.last, ''],
];


function shim(ctx) {
  return {
    drawingContext: ctx,
    createGraphics(w, h) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return { elt: c, canvas: c, width: w, height: h, drawingContext: c.getContext('2d'), pixelDensity() {}, remove() {} };
    },
  };
}

export function makeRenderer(W, H, dpr) {
  const gy = Math.round(H * 0.7);
  const u = Math.min(H * 0.98, W * 1.45);
  const soil = makeSoil(shim(null), W, H, gy);

  /**
   * opts.captions: draw the stage captions (the page hides them before Begin).
   * opts.twinkle:  the clock the stars twinkle by (wall time on the page).
   */
  function draw(target, t, { captions = true, twinkle = t } = {}) {
    const p = shim(target);
    const ctx = target;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const env = lightAt(clock(t));
    P.imbibed = imbibed(t, drops);

    // Sky, in screen space: it does not zoom.
    const sky = drawSky(p, W, gy, env);
    drawStars(p, W, gy, env, stars, twinkle);
    drawLights(p, W, gy, env);
    drawHills(p, W, H, gy, env, hills, sky);

    // The world: ground at y = 0, units of u. The camera eases toward the
    // flower after it opens.
    const zoom = 1 + 0.13 * ease(span(t, cues.bloom - 4, cues.end - 4));
    const F = zoom > 1 ? flowerPoint(P, t, env) : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(W / 2, gy);
    ctx.scale(u, u);
    ctx.translate(F.x, F.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-F.x, -F.y);

    // Soil slab (image in pixels, so undo the unit scale for it).
    ctx.save();
    ctx.scale(1 / u, 1 / u);
    ctx.drawImage(soil.elt ?? soil.canvas, -W / 2, 0, W, soil.height);
    ctx.restore();
    drawSoak(p, t, drops);
    // Night falls on the cutaway too.
    ctx.fillStyle = rgba([6, 8, 22], (1 - env.light) * 0.5);
    ctx.fillRect(-W / u, 0, (2 * W) / u, (H - gy) / u + 0.1);
    // Surface line.
    ctx.strokeStyle = rgba([150, 118, 88], 0.55 + 0.3 * env.light);
    ctx.lineWidth = 0.0025;
    ctx.beginPath(); ctx.moveTo(-W / u, 0); ctx.lineTo(W / u, 0); ctx.stroke();

    // Shadow of the plant on the soil, cast away from the sun.
    if (t > cues.cotyledons) {
      const h = clamp((t - cues.cotyledons) / 40);
      const sx = -env.sunX * 0.09 * h;
      const g = ctx.createRadialGradient(sx, 0, 0, sx, 0, 0.1 + 0.08 * h);
      g.addColorStop(0, `rgba(20,12,8,${0.28 * env.light})`);
      g.addColorStop(1, 'rgba(20,12,8,0)');
      ctx.save(); ctx.scale(1, 0.12);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, 0, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawPlant(p, P, t, env);
    drawDropsFalling(p, t, drops, -gy / u - 0.05, env);
    drawSplashes(p, t, drops, env);
    ctx.restore();

    drawOverlay(p, t, env, captions);
    ctx.restore();
  }

  function drawOverlay(p, t, env, captions) {
    const ctx = p.drawingContext;
    const pad = Math.max(14, Math.min(W, H) * 0.03);
    // The timelapse camera's timestamp.
    const ph = clock(t);
    const day = Math.floor(ph) - day0 + 1;
    const mins = Math.floor((((ph % 1) + 1) % 1) * 24 * 60);
    const stamp = `DAY ${String(day).padStart(2, '0')}  ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    ctx.font = `500 ${Math.round(Math.max(11, W * 0.011))}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.2 * (1 - env.light)})`;
    ctx.textBaseline = 'top';
    ctx.fillText(stamp, pad, pad);

    // What is happening, in a line, down in the soil.
    let cap = null, capAt = 0, next = Infinity;
    for (let i = 0; i < CAPTIONS.length; i++) {
      if (t >= CAPTIONS[i][0]) { cap = CAPTIONS[i][1]; capAt = CAPTIONS[i][0]; next = CAPTIONS[i + 1]?.[0] ?? Infinity; }
    }
    if (cap && captions) {
      const a = ease(span(t, capAt, capAt + 1)) * (1 - ease(span(t, next - 0.8, next)));
      ctx.font = `italic 400 ${Math.round(Math.max(15, Math.min(W, H) * 0.028))}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillStyle = `rgba(246,236,218,${0.85 * a})`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(cap, pad, H - pad);
    }
  }

  return { draw, soil };
}
