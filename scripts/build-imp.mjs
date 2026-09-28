#!/usr/bin/env node
// build-imp.mjs — import Imp bench results into the imp.mino.mobi surface.
//
//   node scripts/build-imp.mjs imp-01 imp-02 imp-03 imp-04   # from origin/bakeoff/<id>
//
// Each Imp bench run (.github/workflows/imp-bench.yml) pushes its evidence to a
// `bakeoff/<run-id>` results branch: report.md, results.json, per-model tool
// traces and compiled programs. This copies those files into imp/runs/<id>/ and
// rewrites imp/runs/index.json, the list the page renders. It is an import, not
// a generator preflight re-derives: the source is a set of branches, not the
// tree. Run it once per new run, review the diff, commit.
//
// imp/ is internet-facing (its worker serves the directory), so every text file
// goes through landing.mjs's scrubText, the repo's one redaction layer.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scrubText } from './lib/landing.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'imp', 'runs');
//   node scripts/build-imp.mjs --from-dir <dir> <run-id>     # a report.mjs output dir instead
//
// --from-dir is for a run whose results branch never landed (its collect job
// could not push): download the run's cell artifacts, run
// `node bakeoff/imp/report.mjs <id> --from <cells>`, and import that directory.
const args = process.argv.slice(2);
const fromDirAt = args.indexOf('--from-dir');
const fromDir = fromDirAt >= 0 ? path.resolve(args[fromDirAt + 1]) : null;
const ids = args.filter((a, i) => a !== '--from-dir' && i !== fromDirAt + 1);
if (!ids.length || (fromDir && ids.length !== 1)) {
  console.error('usage: build-imp.mjs <run-id> ...   (reads origin/bakeoff/<run-id>)\n       build-imp.mjs --from-dir <dir> <run-id>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

for (const id of fromDir ? [] : ids) {
  const ref = `origin/bakeoff/${id}`;
  git('fetch', '-q', 'origin', `bakeoff/${id}`);
  const files = git('ls-tree', '-r', '--name-only', ref, `bakeoff/results/${id}/`).split('\n').filter(Boolean);
  if (!files.length) throw new Error(`${ref} has no bakeoff/results/${id}/`);
  const dir = path.join(OUT, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    const body = git('show', `${ref}:${f}`);
    fs.writeFileSync(path.join(dir, path.basename(f)), scrubText(body));
  }
  console.log(`${id}: ${files.length} files`);
}

if (fromDir) {
  const [id] = ids;
  const dir = path.join(OUT, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(fromDir).filter((f) => fs.statSync(path.join(fromDir, f)).isFile());
  if (!files.includes('results.json')) throw new Error(`${fromDir} has no results.json`);
  for (const f of files) fs.writeFileSync(path.join(dir, f), scrubText(fs.readFileSync(path.join(fromDir, f), 'utf8')));
  console.log(`${id}: ${files.length} files from ${fromDir}`);
}

// index.json: every run on disk, with its note and the per-cell headline numbers.
const runs = fs
  .readdirSync(OUT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()
  .map((id) => {
    const r = JSON.parse(fs.readFileSync(path.join(OUT, id, 'results.json'), 'utf8'));
    return {
      id,
      note: r.note,
      files: fs.readdirSync(path.join(OUT, id)).sort(),
      cells: r.cells.map((c) => ({
        model: c.model,
        model_id: c.model_id,
        status: c.status,
        seconds: c.seconds,
        probe: c.probe,
        tasks: Object.fromEntries(
          Object.entries(c.tasks || {}).map(([t, v]) => [
            t,
            {
              n_test: v.n_test,
              arms: Object.fromEntries(
                Object.entries(v.arms || {}).map(([a, x]) => [
                  a,
                  { score: x.score, errors: x.errors, seconds: x.seconds, optimize_seconds: x.optimize_seconds, tool_calls: x.tool_calls },
                ]),
              ),
              tool_calls: v.tool_calls,
              usage: v.usage,
              gepa: v.gepa && { reflection: v.gepa.reflection, max_metric_calls: v.gepa.max_metric_calls, error: v.gepa.error, changed: v.gepa.changed },
            },
          ]),
        ),
      })),
    };
  });

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ runs }, null, 1) + '\n');
console.log(`index.json: ${runs.length} runs`);
