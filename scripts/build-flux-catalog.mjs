// Build the flux catalog: generate + solve a band of seeds in JS and emit
//   • fable/flux/data/catalog.json — rich records for fast gallery/first-paint
//   • fable/flux/data/worldlist.txt — a compact token stream the Rust validator
//     (engine-rs/) independently re-checks in CI.
// Usage: node scripts/build-flux-catalog.mjs [count]   (default 256)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { worldForSeed } from '../fable/flux/js/atlas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'fable', 'flux', 'data');
const COUNT = parseInt(process.argv[2], 10) || 256;

const records = [];
const lines = [];
let made = 0;
for (let n = 1; n <= COUNT; n++) {
  const p = worldForSeed(n);
  if (!p) continue;
  made++;
  const w = p.world, a = p.report.answer;
  records.push({
    n, bundle: w.bundle,
    difficulty: p.report.difficulty, diffTier: p.report.diffTier, interest: p.report.interest,
    winFrac: +p.report.winFrac.toFixed(4), basins: p.report.basins, robustness: p.report.robustness,
    answer: { angle: +a.angle.toFixed(6), power: +a.power.toFixed(4), bounces: a.bounces },
    descriptor: p.report.descriptor,
  });
  // token-stream world record for the Rust validator
  const toks = [n, w.gravity ? 1 : 0, w.ball0.x, w.ball0.y, w.goal.x, w.goal.y, w.goal.rad];
  toks.push(w.attractors.length); for (const x of w.attractors) toks.push(x.x, x.y, x.q);
  toks.push(w.goo.length); for (const x of w.goo) toks.push(x.x, x.y, x.rad, x.drag);
  toks.push(w.bumpers.length); for (const x of w.bumpers) toks.push(x.x, x.y, x.rad, x.rest);
  toks.push(w.walls.length); for (const x of w.walls) toks.push(x.x1, x.y1, x.x2, x.y2);
  toks.push(a.angle, a.power);
  lines.push(toks.join(' '));
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'catalog.json'), JSON.stringify({ generated: COUNT, made, records }));
writeFileSync(join(outDir, 'worldlist.txt'), made + '\n' + lines.join('\n') + '\n');
console.log(`flux catalog: ${made}/${COUNT} worlds → catalog.json + worldlist.txt`);
