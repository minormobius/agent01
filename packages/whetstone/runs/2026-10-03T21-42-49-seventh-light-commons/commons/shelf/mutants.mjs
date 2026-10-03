// shelf/mutants.mjs — does the test suite notice when a fix is undone?
// usage: node shelf/mutants.mjs <project-dir> <mutants.json> [test-file=test.mjs] [TZ=UTC]
// mutants.json: [{ "name": "...", "file": "dashboard.mjs", "from": "exact text", "to": "replacement" }, ...]
// Copies <project-dir> (top level files only) to a temp dir, applies each mutant alone, runs the
// test file, and reports caught (test exit != 0) / SURVIVED / NOT FOUND (text no longer in source).
// Exit 1 if any mutant survived or wasn't found. Leaves nothing behind.
import { readFileSync, writeFileSync, copyFileSync, cpSync, mkdtempSync, readdirSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [dir, spec, testFile = 'test.mjs', TZ = 'UTC'] = process.argv.slice(2);
if (!dir || !spec) { console.error('usage: node shelf/mutants.mjs <project-dir> <mutants.json> [test-file] [TZ]'); process.exit(2); }
const src = resolve(dir);
const tmp = mkdtempSync(join(tmpdir(), 'mutants-'));
let bad = 0;
try {
  // top-level files, plus subdirectories (e.g. lib/) except shelf/, node_modules/ and dot-dirs; "file" may be "lib/x.mjs"
  for (const f of readdirSync(src)) {
    const p = join(src, f);
    if (statSync(p).isFile()) copyFileSync(p, join(tmp, f));
    else if (!['shelf', 'node_modules'].includes(f) && !f.startsWith('.')) cpSync(p, join(tmp, f), { recursive: true });
  }
  for (const m of JSON.parse(readFileSync(spec, 'utf8'))) {
    const orig = readFileSync(join(src, m.file), 'utf8');
    if (!orig.includes(m.from)) { console.log('NOT FOUND', m.name); bad++; continue; }
    writeFileSync(join(tmp, m.file), orig.replace(m.from, m.to));
    const r = spawnSync(process.execPath, [testFile], { cwd: tmp, env: { ...process.env, TZ }, timeout: 120000 });
    console.log(r.status !== 0 ? 'caught  ' : 'SURVIVED', m.name);
    if (r.status === 0) bad++;
    writeFileSync(join(tmp, m.file), orig);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);
