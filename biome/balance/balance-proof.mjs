// biome/balance/balance-proof.mjs — headless proof of the balance controller. Renders the SAME scene the
// page draws (trunk-carried skeleton + IK leg struts + solved ground-reaction arrows + CoM) across a strip
// of frames covering: settle → SHOVE → recover → walk. Eyeball the controller without a browser.
//   node balance-proof.mjs [id] > out.svg
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from '../sprite/bauplan.mjs';
import { solve } from '../sprite/render.mjs';
import { makeBalancer } from './balance.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ORG = JSON.parse(readFileSync(join(here, '../gacha/catalog.json'), 'utf8')).organisms;
const id = process.argv[2] || 'horse';
const sp = build(ORG[id]);
const W = solve(sp, 0);
const skel = sp.segs.filter((s) => !s.leg).map((s) => ({ base: W[s.id].base, tip: W[s.id].tip, w: Math.max(0.8, ((s.w0 || 1) + (s.w1 || 1)) / 2) }));
const bal = makeBalancer(sp, {});
const restCom = bal.restCom;

let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
for (const s of skel) for (const p of [s.base, s.tip]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
y1 = Math.max(y1, bal.groundY);

const CELL = 260, FR = 6, gyS = CELL * 0.80;
const scale = Math.min((CELL * 0.62) / Math.max(40, x1 - x0), (CELL * 0.66) / Math.max(40, y1 - y0));
const f = (n) => (+n).toFixed(2);
const xf = (p) => { const t = bal.trunk, dx = p.x - restCom.x, dy = p.y - restCom.y, c = Math.cos(t.a), s = Math.sin(t.a); return { x: t.x + dx * c - dy * s, y: t.y + dx * s + dy * c }; };
const ik = (H, F, l1, l2, bend) => { let dx = F.x - H.x, dy = F.y - H.y, d = Math.hypot(dx, dy); d = Math.min(d, (l1 + l2) * 0.999); d = Math.max(d, Math.abs(l1 - l2) + 1e-3); const a = Math.atan2(dy, dx); const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d); const ang = Math.acos(Math.max(-1, Math.min(1, ca))); const ka = a + bend * ang; return { x: H.x + Math.cos(ka) * l1, y: H.y + Math.sin(ka) * l1 }; };

// scenario timeline: which step-options at each instant
function run(out, opt, n) { let r = out; for (let i = 0; i < n; i++) r = bal.step(1 / 240, opt); return r; }

const labels = ['settle', 'SHOVE ⇢', 'recover', 'recovered', 'walk', 'walk →'];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FR * CELL}" height="${CELL + 22}" viewBox="0 0 ${FR * CELL} ${CELL + 22}"><rect width="100%" height="100%" fill="#0b120f"/>`;
let out = bal.step(1 / 240, { mode: 'stand' });
for (let k = 0; k < FR; k++) {
  if (k === 0) out = run(out, { mode: 'stand' }, 240);
  else if (k === 1) out = run(out, { mode: 'stand', push: bal.M * 2600 }, 10), out = run(out, { mode: 'stand' }, 40);
  else if (k === 2) out = run(out, { mode: 'stand' }, 120);
  else if (k === 3) out = run(out, { mode: 'stand' }, 240);
  else out = run(out, { mode: 'walk', vTarget: 24, cadence: Math.min(2.6, 1.1 + 24 * 0.05) }, 180);

  const camX = k >= 4 ? bal.trunk.x : bal.com0.x;
  const W2S = (wx, wy) => ({ x: (wx - camX) * scale + CELL / 2, y: (wy - bal.groundY) * scale + gyS });
  svg += `<g transform="translate(${k * CELL} 0)"><rect x="2" y="2" width="${CELL - 4}" height="${CELL - 4}" fill="#0e1814" stroke="#27362f" rx="8"/>`;
  svg += `<line x1="6" y1="${gyS}" x2="${CELL - 6}" y2="${gyS}" stroke="#3a5446" stroke-width="2"/>`;
  // legs
  for (const L of out.legs) {
    const bend = L.lp[0] === 'F' ? 1 : -1, reach = (L.thigh + L.shank) * 0.999;
    let foot = L.foot, dx = L.foot.x - L.hip.x, dy = L.foot.y - L.hip.y, dlen = Math.hypot(dx, dy);
    if (dlen > reach) { const s = reach / dlen; foot = { x: L.hip.x + dx * s, y: L.hip.y + dy * s }; }
    const K = ik(L.hip, foot, L.thigh, L.shank, bend);
    const Hs = W2S(L.hip.x, L.hip.y), Ks = W2S(K.x, K.y), Fs = W2S(foot.x, foot.y);
    svg += `<polyline points="${f(Hs.x)},${f(Hs.y)} ${f(Ks.x)},${f(Ks.y)} ${f(Fs.x)},${f(Fs.y)}" fill="none" stroke="${L.stance ? '#8a9a90' : '#5d6b63'}" stroke-width="${f(Math.max(2, 5 * scale))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += `<circle cx="${f(Fs.x)}" cy="${f(Fs.y)}" r="${f(Math.max(2.5, 3.6 * scale))}" fill="${L.stance ? '#d8b25a' : '#5a6b62'}"/>`;
  }
  // skeleton
  for (const s of skel) { const a = W2S(...vals(xf(s.base))), b = W2S(...vals(xf(s.tip))); svg += `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="#9fb4aa" stroke-width="${f(Math.max(0.8, s.w * scale * 0.62))}" stroke-linecap="round"/>`; }
  // GRF
  const wRef = bal.M * 1400;
  for (const G of out.grf) { const mag = Math.hypot(G.fx, G.fy); if (mag < 1e-6) continue; const len = Math.min(CELL * 0.34, (mag / wRef) * 64); const fs = W2S(G.x, G.y); const ux = G.fx / mag, uy = G.fy / mag; svg += `<line x1="${f(fs.x)}" y1="${f(fs.y)}" x2="${f(fs.x + ux * len)}" y2="${f(fs.y + uy * len)}" stroke="#62b87a" stroke-width="2"/>`; }
  // CoM
  const cm = W2S(out.com.x, out.com.y);
  svg += `<circle cx="${f(cm.x)}" cy="${f(cm.y)}" r="4.5" fill="#5aa6e0"/><circle cx="${f(cm.x)}" cy="${f(cm.y)}" r="7.5" fill="none" stroke="#5aa6e0"/>`;
  svg += `<text x="10" y="20" fill="#d8b25a" font-size="12" font-family="monospace">${labels[k]}</text>`;
  svg += `<text x="10" y="${CELL - 10}" fill="#7f9b8d" font-size="10" font-family="monospace">pitch ${(out.trunk.a * 180 / Math.PI).toFixed(1)}° · dy ${(out.com.y - bal.com0.y).toFixed(0)} · ${out.legs.filter((l) => l.stance).length}/4 down</text></g>`;
}
svg += `<text x="10" y="${CELL + 16}" fill="#7f9b8d" font-size="11" font-family="monospace">${id} — VMC balance controller: settle, shove + recover, walk</text></svg>`;
function vals(o) { return [o.x, o.y]; }
process.stdout.write(svg);
