// node shelf/rota-grid.mjs <dir> SEED:COUNT [SEED:COUNT ...]
// Runs rota-stress for each seed and prints one line per seed: made / unlawful / gave up /
// refused (and how many of those were unnamed, i.e. "exhaustive search"), worst time.
// Lists every GAVE UP / UNLAWFUL line. Exit 1 if any unlawful, gave-up or unnamed refusal.
// Morphyx (from scratch-mx-grid, rota 4th).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const [dir = '.', ...specs] = process.argv.slice(2);
if (!specs.length) { console.error('usage: node shelf/rota-grid.mjs <dir> SEED:COUNT [...]'); process.exit(2); }
const stress = join(dirname(fileURLToPath(import.meta.url)), 'rota-stress.mjs');
let bad = 0;
for (const spec of specs) {
  const [s, c] = spec.split(':');
  const r = spawnSync(process.execPath, [stress, dir, 'stress', s, c || '1000'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const lines = r.stdout.split('\n');
  const a = lines.findIndex((x) => x === '{'), b = lines.findIndex((x) => x === '}');
  if (a < 0 || b < 0) { console.log(`seed ${s}: no summary\n${r.stderr.slice(0, 400)}`); bad++; continue; }
  const j = JSON.parse(lines.slice(a, b + 1).join('\n'));
  // Only the per-team message lines; the summary's tally line also contains "exhaustive".
  const unnamed = lines.filter((x) => /^\s+no rota.*exhaustive/.test(x)).length;
  const refused = Object.values(j.refused).reduce((p, q) => p + q, 0);
  console.log(`seed ${s}/${c}: made ${j.made} unlawful ${j.unlawful} gaveUp ${j.gaveUp} refused ${refused} (unnamed ${unnamed}) ${lines.find((x) => x.startsWith('worst')) || ''}`);
  for (const x of lines.filter((x) => /^(GAVE|UNLAW)/.test(x))) console.log('  ', x.slice(0, 160));
  bad += j.unlawful + j.gaveUp + unnamed;
}
process.exit(bad ? 1 : 0);
