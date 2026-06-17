// biome/sprite/gait-proof.mjs — headless walk strip: step the muscle-driven gait and draw the skeleton
// (bones + firing muscles) across a stride, so the treadmill motion can be eyeballed without a browser.
//   node biome/sprite/gait-proof.mjs [id]  > strip.svg
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from './bauplan.mjs';
import { solve, bbox } from './render.mjs';
import { growMuscles } from './myology.mjs';
import { makeGait } from './gait.mjs';
import { attachPos } from './muscle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ORG = JSON.parse(readFileSync(join(here, '../gacha/catalog.json'), 'utf8')).organisms;
const id = process.argv[2] || 'horse';
const sp = build(ORG[id]); const muscles = growMuscles(sp).muscles;
const gait = makeGait(sp, muscles);
const FR = 6, gap = Math.round((2 * Math.PI / 2.4) * 60 / FR); // frames between snapshots ≈ even over a stride
const CELL = 230, f = (n) => (+n).toFixed(2);

const b = bbox(sp, 0), pad = 26, scale = (CELL - pad * 2) / Math.max(b.w, b.h);
const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FR * CELL}" height="${CELL}" viewBox="0 0 ${FR * CELL} ${CELL}"><rect width="100%" height="100%" fill="#0b120f"/>`;
let af = 0;
for (let k = 0; k < FR; k++) {
  let r; for (let i = 0; i < (k === 0 ? 1 : gap); i++) r = gait.step(1 / 60); af = r.activations;
  const W = solve(gait.sprite, 0);
  svg += `<g transform="translate(${k * CELL} 0)"><rect x="2" y="2" width="${CELL - 4}" height="${CELL - 4}" fill="#0e1814" stroke="#27362f" rx="8"/>`;
  svg += `<g transform="translate(${CELL / 2} ${CELL * 0.52}) scale(${f(scale)}) translate(${f(-cx)} ${f(-cy)})">`;
  for (const s of sp.segs) { const w = W[s.id]; svg += `<line x1="${f(w.base.x)}" y1="${f(w.base.y)}" x2="${f(w.tip.x)}" y2="${f(w.tip.y)}" stroke="#5b6b63" stroke-width="${f(((s.w0||1)+(s.w1||1))/2*0.7)}" stroke-linecap="round"/>`; }
  for (const m of muscles) { const a = attachPos(W, m.a), bb = attachPos(W, m.b); const act = af.get(m.id) || 0;
    const col = act > 0.02 ? `rgb(${230},${Math.round(100+act*60)},70)` : 'rgba(120,128,124,0.25)';
    svg += `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(bb.x)}" y2="${f(bb.y)}" stroke="${col}" stroke-width="${f(1.4+act*4)}" stroke-linecap="round"/>`; }
  svg += `</g><text x="10" y="${CELL-10}" fill="#7f9b8d" font-size="11" font-family="monospace">t${k}</text></g>`;
}
svg += `</svg>`;
process.stdout.write(svg);
