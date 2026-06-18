// biome/sprite/muscle-proof.mjs — render grown musculature onto skeletons (sandbox, no browser).
//   node biome/sprite/muscle-proof.mjs [id,id,...] > sheet.svg
// Bones are drawn faint; muscles bold (agonist/extensor warm, antagonist/flexor cool, width ∝ √force).
// Centre of mass (gold dot) over the support line (grey) shows the standing balance.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from './bauplan.mjs';
import { solve, bbox } from './render.mjs';
import { growMuscles } from './myology.mjs';
import { evaluateStanding, evaluateWalking } from './mechanics.mjs';
import { attachPos } from './muscle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ORG = JSON.parse(readFileSync(join(here, '../gacha/catalog.json'), 'utf8')).organisms;
const want = (process.argv[2] || 'horse,bear,rabbit,wolf,roedeer,rat').split(',');
const CELL = 300, COLS = 2, ROWS = Math.ceil(want.length / COLS);
const f = (n) => (+n).toFixed(2);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function cell(id, box) {
  const org = ORG[id];
  const sprite = build(org);
  const muscles = growMuscles(sprite).muscles;
  const st = evaluateStanding(sprite, muscles);
  const wlk = evaluateWalking(sprite, muscles);
  const W = solve(sprite, 0);
  const bb = bbox(sprite, 0);
  const scale = (box * 0.8) / Math.max(bb.w, bb.h, 1);
  const cxc = (bb.x0 + bb.x1) / 2, cyc = (bb.y0 + bb.y1) / 2;
  let g = `<g transform="translate(${box / 2} ${box * 0.52}) scale(${f(scale)}) translate(${f(-cxc)} ${f(-cyc)})">`;

  // bones (faint)
  for (const s of sprite.segs) {
    const w = W[s.id];
    g += `<line x1="${f(w.base.x)}" y1="${f(w.base.y)}" x2="${f(w.tip.x)}" y2="${f(w.tip.y)}" stroke="#5b6b63" stroke-width="${f(((s.w0||1)+(s.w1||1))/2*0.7)}" stroke-linecap="round"/>`;
  }
  // muscles (bold, coloured by role, width ∝ √force)
  for (const m of muscles) {
    const a = attachPos(W, m.a), b = attachPos(W, m.b);
    const lw = Math.max(1.5, Math.min(13, Math.sqrt(m.fmax) * 5));
    const col = m.role === 'agonist' ? 'rgba(214,96,74,0.78)' : 'rgba(86,170,200,0.66)';
    g += `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${col}" stroke-width="${f(lw)}" stroke-linecap="round"/>`;
  }
  // support line + centre of mass
  if (st.contacts.length) {
    const xs = st.contacts.map((c) => c.x), gy = Math.max(...st.contacts.map((c) => c.y)) + 6;
    g += `<line x1="${f(Math.min(...xs))}" y1="${f(gy)}" x2="${f(Math.max(...xs))}" y2="${f(gy)}" stroke="#3a4a42" stroke-width="2" stroke-dasharray="4 3"/>`;
    g += `<line x1="${f(st.com.x)}" y1="${f(st.com.y)}" x2="${f(st.com.x)}" y2="${f(gy)}" stroke="#d8b25a" stroke-width="1" stroke-dasharray="2 2"/>`;
    g += `<circle cx="${f(st.com.x)}" cy="${f(st.com.y)}" r="5" fill="#d8b25a"/>`;
  }
  g += `</g>`;
  const ok = st.stable ? '#62b87a' : '#e0795a';
  g += `<text x="12" y="${box - 30}" fill="#cfe6da" font-size="13" font-family="monospace">${esc(org.common)} · ${esc(growMeta(sprite))}</text>`;
  g += `<text x="12" y="${box - 12}" fill="${ok}" font-size="12" font-family="monospace">stand ${st.stable ? '✓' : '✗'} ${st.joints.filter(j=>j.stable).length}/${st.joints.length} joints · ${muscles.length} muscles · walk ${(wlk.coverage*100).toFixed(0)}%</text>`;
  return g;
}
const growMeta = (sp) => `${sp.meta.family}`;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS*CELL}" height="${ROWS*CELL}" viewBox="0 0 ${COLS*CELL} ${ROWS*CELL}">`;
svg += `<rect width="100%" height="100%" fill="#0b120f"/>`;
want.forEach((id, i) => {
  const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
  svg += `<g transform="translate(${cx} ${cy})"><rect x="2" y="2" width="${CELL-4}" height="${CELL-4}" fill="#0e1814" stroke="#27362f" rx="8"/>`;
  svg += cell(id, CELL) + `</g>`;
});
svg += `</svg>`;
process.stdout.write(svg);
