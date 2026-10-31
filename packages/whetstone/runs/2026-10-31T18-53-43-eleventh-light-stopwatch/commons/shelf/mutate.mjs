// node shelf/mutate.mjs SOURCE TESTFILE MUTANTS.json
// Do the tests bite? Copies SOURCE + TESTFILE into a temp dir, applies each mutant (an exact
// string replacement in SOURCE), runs the tests, and reports per mutant: KILLED (tests failed),
// CRASH (non-zero exit with no FAIL lines — the test file didn't run; not evidence either way),
// SURVIVED (tests still pass: they can't see this change), or MISSING (the `from` text isn't there).
// MUTANTS.json: [{ "name": "...", "from": "exact text", "to": "replacement" }, ...]
// --with copies extra files (flat, by basename) next to them: a CLI, data fixtures.
// --tree a,b copies directories recursively, keeping their relative path (e.g. tools/des, imported as
// './tools/des/des.mjs'). A mutant may carry "file": "x.mjs" to mutate a --with file instead of SOURCE.
// The test file must import SOURCE by its basename ('./x.mjs') and print lines starting "FAIL".
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const argv = process.argv.slice(2);
const wi = argv.indexOf('--with');
const extra = wi >= 0 ? argv.splice(wi, 2)[1].split(',').filter(Boolean) : [];
const ti = argv.indexOf('--tree');
const trees = ti >= 0 ? argv.splice(ti, 2)[1].split(',').filter(Boolean) : [];
const [src, testFile, mutFile] = argv;
if (!mutFile) { console.error('usage: node shelf/mutate.mjs SOURCE TESTFILE MUTANTS.json [--with a,b,c]'); process.exit(2); }
const code = readFileSync(src, 'utf8');
const mutants = JSON.parse(readFileSync(mutFile, 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'mutate-'));
copyFileSync(testFile, join(dir, basename(testFile)));
for (const f of extra) copyFileSync(f, join(dir, basename(f))); // e.g. a CLI that imports SOURCE, fixtures
for (const t of trees) cpSync(t, join(dir, t), { recursive: true });
const run = () => spawnSync(process.execPath, [join(dir, basename(testFile))], { encoding: 'utf8', timeout: 120000 });

writeFileSync(join(dir, basename(src)), code);
const base = run();
if (base.status !== 0) { console.error('baseline does not pass; fix that first'); process.exit(1); }
let survived = 0;
for (const m of mutants) {
  const target = join(dir, basename(m.file || src));
  const orig = m.file ? readFileSync(target, 'utf8') : code;
  const n = orig.split(m.from).length - 1;
  if (n === 0) { console.log(`MISSING   ${m.name}`); continue; }
  writeFileSync(target, orig.replace(m.from, m.to));
  const r = run();
  writeFileSync(target, orig);
  const fails = (r.stdout.match(/^FAIL/gm) || []).length;
  const verdict = fails ? `KILLED    ${m.name} (${fails} FAIL)` : r.status !== 0 ? `CRASH     ${m.name} (exit ${r.status}, no FAIL lines)` : `SURVIVED  ${m.name}`;
  if (!fails && r.status === 0) survived++;
  console.log(verdict + (n > 1 ? `  [note: 'from' occurs ${n}×, only the first replaced]` : ''));
}
process.exit(survived ? 1 : 0);
