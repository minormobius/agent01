// Checks that www/rhizome/perc.js (what the page runs) gives the same digits as shelf/perc-calib.mjs.
// usage: node shelf/rhizome-twin.mjs <absolute path to www/rhizome/perc.js> [samples=2000] [seed=1]
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const [file, N = '2000', SEED = '1'] = process.argv.slice(2);
const { rng, spanAt } = await import(pathToFileURL(file).href);
const here = path.dirname(fileURLToPath(import.meta.url));
const ref = execFileSync('node', [path.join(here, 'perc-calib.mjs'), N, SEED], { encoding: 'utf8' })
  .split('\n').filter(l => l.startsWith('L=')).map(l => l.match(/mean=(\S+) ± (\S+)/).slice(1).join(' '));
const rand = rng(+SEED), mine = [];
for (const L of [32, 64, 128, 256]) {
  let s = 0, s2 = 0;
  for (let i = 0; i < +N; i++) { const p = spanAt(L, rand); s += p; s2 += p * p; }
  const m = s / +N, se = Math.sqrt((s2 / +N - m * m) / (+N - 1));
  mine.push(`${m.toFixed(5)} ${se.toFixed(5)}`);
}
// the mutant must move far off p_c, or the check can't fail
const r2 = rng(3); let b = 0; for (let i = 0; i < 200; i++) b += spanAt(64, r2, true); b /= 200;
const same = ref.length === 4 && ref.every((x, i) => x === mine[i]);
console.log('perc-calib:', ref.join(' | ')); console.log('page code: ', mine.join(' | '));
console.log('mutant (no right link) L=64 mean', b.toFixed(4));
if (!same || b < 0.68) { console.log('FAIL'); process.exit(1); } console.log('ok: same digits, mutant caught');
