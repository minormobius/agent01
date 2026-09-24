// render.js — Coquelicots at one size: the thing both the page and the video draw.
//
// makeRenderer(W, H, dpr) builds the painting for a W×H layout (CSS pixels) at
// a pixel ratio, and returns draw(ctx, t), which paints second t into a canvas
// of W·dpr × H·dpr device pixels. The live page and the video exporter call the
// same function, so the file on your phone is the piece, not a recording of it.

import { cues } from './score.js';
import { Painter, makePaper, makeGrain, clamp } from '../lib/paint.js';
import { layout, clipPath, buildWorld, drawSeal } from './world.js';
import { paintPoppy } from './poppy.js';

const DRAWINGS = 12;           // plant drawings per second: animation on twos

export function makeRenderer(W, H, dpr) {
  const L = layout(W, H);
  const paper = makePaper(W, H, dpr);
  const world = document.createElement('canvas');
  world.width = Math.round(W * dpr); world.height = Math.round(H * dpr);
  const painter = new Painter(world, paper, dpr, clipPath(L));
  painter.setMarks(buildWorld(L, cues));
  const plant = document.createElement('canvas');
  plant.width = world.width; plant.height = world.height;
  const pctx = plant.getContext('2d');
  const grainTile = makeGrain();
  let grain = null, lastDrawing = null;

  function draw(ctx, t) {
    painter.advance(t);
    const k = Math.floor(t * DRAWINGS);
    if (k !== lastDrawing) {
      lastDrawing = k;
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, plant.width, plant.height);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintPoppy(pctx, k / DRAWINGS, cues, L, ((k % 3) + 3) % 3);
    }
    grain ??= ctx.createPattern(grainTile, 'repeat');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(world, 0, 0);
    ctx.drawImage(plant, 0, 0);
    // the tooth of the paper, over everything
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.restore();
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSeal(ctx, L, clamp((t - cues.last - 3) / 0.25));
    ctx.restore();
  }

  return { draw, width: world.width, height: world.height };
}
