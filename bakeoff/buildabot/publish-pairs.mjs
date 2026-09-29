#!/usr/bin/env node
// publish-pairs.mjs — stage one A/B run's blinded sites into imp/ab/<run>/.
//
//   node bakeoff/buildabot/publish-pairs.mjs <run-id>            # from origin/buildabot/<run-id>
//   node bakeoff/buildabot/publish-pairs.mjs <run-id> --from <dir>
//
// Copies sites/<pair>-<side>/ and pairs.json. NEVER mapping.json, report.md or
// builds/ — those say which builder made which site, and imp/ is public.
// Also refreshes imp/ab/_kit/ from the factory branch, so tenant pages get the
// kit they were built against (imp/worker.js serves it for ../_kit/ and /_kit/).
//
// Review what it stages before committing: these are model-written pages that
// will be served on imp.minomobi.com. The script prints anything that looks
// like a credential or a non-public host, and refuses on a credential shape.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const runId = args[0];
const fromAt = args.indexOf('--from');
if (!/^ab-[a-z0-9-]+$/.test(runId || '')) { console.error('usage: publish-pairs.mjs <ab-run-id> [--from <dir>]'); process.exit(2); }
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'buffer', maxBuffer: 256 << 20 });

// files: [relative path, Buffer]
let files = [];
if (fromAt >= 0) {
  const base = path.resolve(args[fromAt + 1]);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  files = walk(base).map((f) => [path.relative(base, f), fs.readFileSync(f)]);
} else {
  const ref = `origin/buildabot/${runId}`;
  git('fetch', '-q', 'origin', `buildabot/${runId}`);
  files = git('ls-tree', '-r', '--name-only', ref).toString().split('\n').filter(Boolean).map((f) => [f, git('show', `${ref}:${f}`)]);
}
const keep = files.filter(([f]) => f === 'pairs.json' || f.startsWith('sites/'));
if (!keep.some(([f]) => f === 'pairs.json')) throw new Error('no pairs.json in the source');

const TOKEN_SHAPES = [/sk-ant-[A-Za-z0-9_-]{10,}/, /ghp_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /xox[bp]-[A-Za-z0-9-]{10,}/, /AKIA[0-9A-Z]{16}/];
const HOST_HINTS = /\b[a-z0-9-]+\.(internal|corp|local|lan)\b/i;
let refused = false;
for (const [f, buf] of keep) {
  if (!/\.(html?|js|mjs|css|json|md|txt|svg)$/i.test(f)) continue;
  const t = buf.toString('utf8');
  for (const re of TOKEN_SHAPES) if (re.test(t)) { console.error(`✘ ${f}: looks like a credential (${re})`); refused = true; }
  const h = t.match(HOST_HINTS);
  if (h) console.warn(`! ${f}: mentions ${h[0]} — check it before committing`);
}
if (refused) process.exit(1);

const out = path.join(ROOT, 'imp', 'ab', runId);
fs.rmSync(out, { recursive: true, force: true });
for (const [f, buf] of keep) {
  const dst = path.join(out, f.startsWith('sites/') ? f.slice('sites/'.length) : f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, buf);
}

// the kit, from the factory branch
const KREF = 'origin/claude/minomobi-landing-page-vg37b8';
git('fetch', '-q', 'origin', 'claude/minomobi-landing-page-vg37b8');
const kitDir = path.join(ROOT, 'imp', 'ab', '_kit');
fs.rmSync(kitDir, { recursive: true, force: true });
for (const f of git('ls-tree', '-r', '--name-only', KREF, 'lab/_kit/').toString().split('\n').filter(Boolean)) {
  if (f.includes('/fixtures/')) continue; // test fixtures, not served in production either way
  const dst = path.join(kitDir, f.slice('lab/_kit/'.length));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, git('show', `${KREF}:${f}`));
}
const pairs = JSON.parse(fs.readFileSync(path.join(out, 'pairs.json'), 'utf8')).pairs;
console.log(`imp/ab/${runId}: ${pairs.length} pairs, ${keep.length - 1} site files; kit refreshed`);
for (const p of pairs) console.log(`  ${p.id}  https://imp.minomobi.com/ab/${runId}/${p.id}-a/  |  ${p.id}-b/   ${p.slug}`);
