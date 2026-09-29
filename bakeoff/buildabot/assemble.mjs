#!/usr/bin/env node
// assemble.mjs — turn one A/B run's builds into blinded pairs.
//
//   node bakeoff/buildabot/assemble.mjs <run-id> --from <artifacts dir> --out <results dir>
//
// <from>/<request>--<arm>/ is what run-arm.sh wrote (site/, meta.json, …). Each
// request with both arms becomes a pair with a random id (p01…) and a random
// side (a/b) per arm, so neither the order nor the letter says which builder
// made which. Writes:
//
//   sites/<pair>-<side>/   the two sites, as they would ship. A build production
//                          would have refused gets a placeholder saying so —
//                          that IS what its requester would have got.
//   pairs.json             what the ballot shows: pair id, request, task. No arms.
//   mapping.json           THE KEY: pair → which side is which arm. Read it after voting.
//   builds/<req>--<arm>/   meta, prompts, critiques, smoke output, screenshots,
//                          transcripts (gzipped). Unblinded.
//   report.md              the unblinded summary: status, turns, cost, time per arm.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomInt } from 'node:crypto';

const args = process.argv.slice(2);
const runId = args[0];
const from = path.resolve(args[args.indexOf('--from') + 1]);
const out = path.resolve(args[args.indexOf('--out') + 1]);
if (!runId || args.indexOf('--from') < 0 || args.indexOf('--out') < 0) {
  console.error('usage: assemble.mjs <run-id> --from <dir> --out <dir>');
  process.exit(2);
}
const HERE = path.dirname(new URL(import.meta.url).pathname);

const builds = {};
for (const d of fs.existsSync(from) ? fs.readdirSync(from) : []) {
  const m = d.match(/^(.+)--(baseline|challenger)$/);
  if (!m) continue;
  const dir = path.join(from, d);
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch {}
  (builds[m[1]] ||= {})[m[2]] = { dir, meta: meta || { status: 'no result', failed_at: 'the build job produced no meta.json' } };
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'sites'), { recursive: true });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const placeholder = (why) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>No site</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 16px;color:#333;background:#fafaf7}h1{font-size:1.3rem}</style>
<h1>This build did not ship.</h1>
<p>The factory's gates refused it (${esc(why)}), so the person who asked would have got an error reply instead of a site.</p>
<p>Judge the pair on that: a working site beats no site.</p>\n`;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), t = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, t);
    else if (e.isFile()) fs.copyFileSync(s, t);
  }
}

const reqs = Object.keys(builds).filter((r) => builds[r].baseline && builds[r].challenger);
// shuffle so pair numbers carry no order either
for (let i = reqs.length - 1; i > 0; i--) { const j = randomInt(i + 1); [reqs[i], reqs[j]] = [reqs[j], reqs[i]]; }

const pairs = [], mapping = {};
reqs.forEach((req, i) => {
  const id = `p${String(i + 1).padStart(2, '0')}`;
  const aIsBaseline = randomInt(2) === 0;
  const side = { a: aIsBaseline ? 'baseline' : 'challenger', b: aIsBaseline ? 'challenger' : 'baseline' };
  mapping[id] = { request: req, ...side };
  for (const s of ['a', 'b']) {
    const b = builds[req][side[s]];
    const dst = path.join(out, 'sites', `${id}-${s}`);
    const site = path.join(b.dir, 'site');
    if (b.meta.status === 'built' && fs.existsSync(path.join(site, 'index.html'))) copyDir(site, dst);
    else { fs.mkdirSync(dst, { recursive: true }); fs.writeFileSync(path.join(dst, 'index.html'), placeholder(b.meta.failed_at || b.meta.status)); }
  }
  const r = JSON.parse(fs.readFileSync(path.join(HERE, 'requests', `${req}.json`), 'utf8'));
  pairs.push({ id, slug: r.slug, requester: r.requester || null, task: r.task });
});
pairs.sort((x, y) => x.id.localeCompare(y.id));

// Unblinded evidence, site files excluded (they are under sites/), transcripts gzipped.
for (const [req, arms] of Object.entries(builds)) {
  for (const [arm, b] of Object.entries(arms)) {
    const dst = path.join(out, 'builds', `${req}--${arm}`);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(b.dir)) {
      const src = path.join(b.dir, f);
      if (!fs.statSync(src).isFile()) continue;
      if (f.endsWith('.jsonl')) fs.writeFileSync(path.join(dst, f + '.gz'), zlib.gzipSync(fs.readFileSync(src)));
      else fs.copyFileSync(src, path.join(dst, f));
    }
  }
}

fs.writeFileSync(path.join(out, 'pairs.json'), JSON.stringify({ run: runId, pairs }, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'mapping.json'), JSON.stringify({ run: runId, note: 'THE KEY. Do not read before voting.', mapping }, null, 2) + '\n');

const row = (m) => m ? `${m.status}${m.failed_at ? ` (${m.failed_at})` : ''} · ${m.turns ?? '—'} turns · $${m.cost_usd ?? '—'} · ${m.seconds ? Math.round(m.seconds / 60) + ' min' : '—'}` : 'missing';
const lines = [
  `# Build-a-bot A/B \`${runId}\``, '',
  '**Unblinded.** This page says which builder made which site. If you are voting, vote first.', '',
  `${reqs.length} complete pairs of ${Object.keys(builds).length} requests.`, '',
  '| request | baseline (production replica) | challenger (eyes + critique, uncapped) |', '|---|---|---|',
  ...Object.keys(builds).sort().map((r) => `| ${r} | ${row(builds[r].baseline?.meta)} | ${row(builds[r].challenger?.meta)} |`),
  '',
];
for (const arm of ['baseline', 'challenger']) {
  const ms = Object.values(builds).map((b) => b[arm]?.meta).filter(Boolean);
  const shipped = ms.filter((m) => m.status === 'built').length;
  const cost = ms.reduce((a, m) => a + (m.cost_usd || 0), 0);
  const mins = ms.reduce((a, m) => a + (m.seconds || 0), 0) / 60;
  lines.push(`- **${arm}**: ${shipped}/${ms.length} shipped · $${cost.toFixed(2)} list-price equivalent · ${Math.round(mins)} agent-minutes`);
}
fs.writeFileSync(path.join(out, 'report.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
