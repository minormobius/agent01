#!/usr/bin/env node
/**
 * scripts/fetch-commits.mjs
 *
 * Ranks EVERY endpoint (top-level surfaces AND their sub-paths) by how much git
 * history touches the files it deploys from, and writes data/commits.json — the
 * stand-in metric for /iceberg/ until Cloudflare page views are wired up.
 *
 * Three numbers per endpoint:
 *   • commits       — commits touching the path at its CURRENT location (naive).
 *   • commitsFollow — rename-aware: unions `git log --follow` over the path's
 *                     current files, so work that was REFACTORED IN (e.g. the
 *                     whole `clock/` subtree was moved from elsewhere) still
 *                     counts. The gap (commitsFollow − commits) is history the
 *                     naive count loses to refactors.
 *   • churn         — insertions + deletions over that follow-aware history.
 * The iceberg ranks depth by commitsFollow; the tooltip shows all three.
 *
 * Endpoint → repo path resolution walks the URL path under the surface's repo
 * dir(s) from deploy-registry.json, existence-checked (handles irregular maps
 * like g.mino.mobi/emsim/ → clock/emsim, mino.mobi/judge/ → judge).
 *
 * Usage: node scripts/fetch-commits.mjs [--out p] [--dry] [--no-follow]
 * The one cost is a `git log --follow` per tracked file (~one pass); CI should
 * checkout with fetch-depth: 0 so the follow history is complete.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hostOf } from './fetch-traffic.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APEX = new Set(['mino.mobi', 'minomobi.com', 'www.mino.mobi']);
const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();

// ─── pure helpers (unit-tested) ─────────────────────────────────────────────

/** "fable/**" → "fable"; "functions/**" → "functions"; "index.html" → "index.html". */
export function globToPathspec(g) {
  return g.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
}

/** Path segments of a URL: "/judge/" → ["judge"], "/wars/cult/" → ["wars","cult"]. */
export function apexDir(pathname) {
  return (pathname || '/').split('/').filter(Boolean).join('/');
}
const segsOf = (pathname) => (pathname || '/').split('/').filter(Boolean);

/** Build host→entry and surface-name→entry maps (endpoints can be comma/slash-separated). */
export function indexRegistry(registry) {
  const arr = Array.isArray(registry) ? registry
    : Array.isArray(registry.surfaces) ? registry.surfaces
    : Object.values(registry)[0];
  const byHost = new Map(), byName = new Map();
  for (const e of arr) {
    if (e.surface) byName.set(e.surface, e);
    for (const t of String(e.endpoint || '').split(/[,/]/).map((s) => s.trim())) {
      const m = t.match(/[a-z0-9.-]+\.[a-z]{2,}/i);
      if (m && !APEX.has(m[0])) byHost.set(m[0], e);
    }
  }
  return { byHost, byName };
}

/** Candidate base dirs a surface deploys from (dir + every registry pathspec dir). */
function candidateBases(entry) {
  const bases = [];
  if (entry) {
    if (entry.dir && entry.dir !== '.') bases.push(entry.dir);
    for (const p of entry.paths || []) {
      const b = globToPathspec(p);
      if (b && !b.includes('.') && !b.startsWith('.github')) bases.push(b);
    }
  }
  return [...new Set(bases)];
}

const here = (p) => existsSync(resolve(ROOT, p));

/** Repo pathspecs whose history "impacts" a given endpoint (any depth). */
export function pathspecsFor(site, reg) {
  const { byHost, byName } = reg;
  const host = hostOf(site.url);
  let pathname = '/';
  try { pathname = new URL(site.url).pathname || '/'; } catch {}
  const segs = segsOf(pathname);
  const entry = byHost.get(host) || byName.get(site.name);

  // apex path surface (mino.mobi/judge/) → the path itself as a dir
  if (APEX.has(host) && segs.length) {
    const joined = segs.join('/');
    return here(joined) ? [joined] : [segs[0]];
  }

  // subdomain (or apex root) with a sub-path → walk under the surface's dir(s)
  if (segs.length) {
    const bases = candidateBases(entry);
    const tail = segs.join('/');
    for (const b of bases) if (here(`${b}/${tail}`)) return [`${b}/${tail}`];
    if (here(tail)) return [tail];                         // e.g. clock/emsim at root
    for (const b of bases) if (here(`${b}/${segs[segs.length - 1]}`)) return [`${b}/${segs[segs.length - 1]}`];
    return bases.length ? [`${bases[0]}/${tail}`] : [tail];
  }

  // host root → the whole surface
  if (entry && entry.paths && entry.paths.length) return entry.paths.map(globToPathspec);
  if (entry && entry.dir && entry.dir !== '.') return [entry.dir];
  if (here(site.name)) return [site.name];
  if (APEX.has(host)) return ['index.html'];
  return [host.split('.')[0]];
}

// ─── git history (follow-aware) ─────────────────────────────────────────────

/** Map every tracked file → { commits:Set<sha>, ins, del } across renames. */
function buildFileHistory(follow) {
  const files = git(['ls-files']).split('\n').filter(Boolean);
  const map = new Map();
  const fmt = '\x01%H';
  let done = 0;
  for (const f of files) {
    const commits = new Set();
    let ins = 0, del = 0, sha = null;
    let out = '';
    try {
      out = git(['log', ...(follow ? ['--follow'] : []), '--numstat', `--format=${fmt}`, '--', f]);
    } catch { out = ''; }
    for (const line of out.split('\n')) {
      if (line[0] === '\x01') { sha = line.slice(1); if (sha) commits.add(sha); continue; }
      if (!line.trim()) continue;
      const m = line.split('\t');
      if (m.length >= 3) { ins += Number(m[0]) || 0; del += Number(m[1]) || 0; }
    }
    map.set(f, { commits, churn: ins + del });
    if (++done % 500 === 0) process.stderr.write(`  …history ${done}/${files.length}\n`);
  }
  return map;
}

function aggregate(pathspecs, fileHist) {
  let files = [];
  try { files = git(['ls-files', '--', ...pathspecs]).split('\n').filter(Boolean); } catch {}
  const commits = new Set();
  let churn = 0;
  for (const f of files) {
    const h = fileHist.get(f);
    if (!h) continue;
    for (const c of h.commits) commits.add(c);
    churn += h.churn;
  }
  let naive = 0;
  try { naive = Number(git(['rev-list', '--count', 'HEAD', '--', ...pathspecs]).trim()) || 0; } catch {}
  return { commits: naive, commitsFollow: commits.size, churn, files: files.length };
}

// ─── main ─────────────────────────────────────────────────────────────────--

function flattenAll(sitesJson) {
  const out = [];
  for (const c of sitesJson.constellations || [])
    for (const s of c.sites || [])
      out.push({ name: s.name, url: s.url, category: (s.tags && s.tags[0]) || 'other', parent: s.parent || null });
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const follow = !args.includes('--no-follow');
  const outPath = args.includes('--out')
    ? resolve(args[args.indexOf('--out') + 1]) : resolve(ROOT, 'data/commits.json');

  const sites = flattenAll(JSON.parse(readFileSync(resolve(ROOT, 'io/sites.json'), 'utf8')));
  const reg = indexRegistry(JSON.parse(readFileSync(resolve(ROOT, 'deploy-registry.json'), 'utf8')));
  process.stderr.write(`Building follow-aware file history (${follow ? 'follow' : 'no-follow'})…\n`);
  const fileHist = buildFileHistory(follow);

  const ranked = sites.map((s) => {
    const specs = pathspecsFor(s, reg);
    const a = aggregate(specs, fileHist);
    return { name: s.name, url: s.url, category: s.category, parent: s.parent,
             commits: a.commits, commitsFollow: a.commitsFollow, churn: a.churn, specs };
  }).sort((x, y) => y.commitsFollow - x.commitsFollow);

  if (dry) {
    ranked.slice(0, 24).forEach((r) => console.log(
      String(r.commitsFollow).padStart(4), `(naive ${String(r.commits).padStart(3)}, +${r.commitsFollow - r.commits} hidden)`,
      String(r.churn).padStart(7) + ' churn ', r.name, r.parent ? `(${r.parent})` : '', '←', r.specs.join(' ')));
    console.log(`… ${ranked.length} endpoints total`);
    return;
  }

  const topLevel = ranked.filter((r) => !r.parent);
  const payload = {
    generated: new Date().toISOString(),
    metric: 'commits-follow',
    source: 'git log --follow per file, unioned per endpoint pathspec (rename-aware); churn = insertions+deletions',
    status: ranked.some((r) => r.commitsFollow > 0) ? 'ok' : 'no-data',
    history_commits: Number(git(['rev-list', '--count', 'HEAD']).trim()) || 0,
    total_commits_follow: topLevel.reduce((n, s) => n + s.commitsFollow, 0),
    total_hidden: topLevel.reduce((n, s) => n + (s.commitsFollow - s.commits), 0),
    sites: ranked.map(({ specs, ...keep }) => keep),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  const top = ranked[0];
  console.log(`Wrote ${outPath}: ${ranked.length} endpoints (incl sub-paths). Top: ${top.name} ${top.commitsFollow} follow-commits (${top.commits} naive, ${top.commitsFollow - top.commits} recovered from refactors).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
