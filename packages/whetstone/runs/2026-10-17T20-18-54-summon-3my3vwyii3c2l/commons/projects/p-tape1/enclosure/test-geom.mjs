// node enclosure/test-geom.mjs — regenerate the trees from gen.mjs, then measure them. Exit 1 on any failure.
// Exists for mutants: test.mjs's T-E-GEN catches *any* change to gen.mjs as a stale tree, which says
// nothing about whether the measurements would catch bad geometry. This one asks only the latter.
// node shelf/mutants.mjs . shelf/tape1-enc-mutants.json enclosure/test-geom.mjs
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath, [join(here, 'gen.mjs')], { stdio: 'ignore' });
const { measure } = await import('./measure.mjs');
const m = measure();
for (const f of m.fail) console.log('FAIL', f);
console.log(m.fail.length ? `${m.fail.length} enclosure failures` : 'enclosure ok');
process.exit(m.fail.length ? 1 : 0);
