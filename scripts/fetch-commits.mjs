#!/usr/bin/env node
/**
 * scripts/fetch-commits.mjs
 *
 * Ranks EVERY endpoint (top-level surfaces AND their sub-paths) by how much git
 * history touches the files it deploys from, and writes data/commits.json — the
 * stand-in metric for /iceberg/ until Cloudflare page views are wired up.
 *
 * Three numbers per endpoint:
 *   • commits    — commits touching the path on the CURRENT branch (HEAD only).
 *   • commitsAll — commits touching the path across ALL refs (every fetched
 *                  feature branch). Most work happens on claude/* branches and
 *                  is squash/merged down to a handful of HEAD commits, so this
 *                  is the real depth. The gap (commitsAll − commits) is work
 *                  that lived OFF the main line.
 *   • churn      — insertions + deletions across all refs at that path.
 * The iceberg ranks depth by commitsAll; the tooltip shows all three.
 *
 * Endpoint → repo path resolution walks the URL path under the surface's repo
 * dir(s) from deploy-registry.json, existence-checked (handles irregular maps
 * like g.mino.mobi/emsim/ → clock/emsim, mino.mobi/judge/ → judge).
 *
 * Usage: node scripts/fetch-commits.mjs [--out p] [--dry]
 * CI should checkout with fetch-depth: 0 AND fetch every ref (the workflow runs
 * `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`) so --all is complete.
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

// ─── git history (all refs) ─────────────────────────────────────────────────

const count = (revArgs, specs) => {
  try { return Number(git(['rev-list', '--count', ...revArgs, '--', ...specs]).trim()) || 0; }
  catch { return 0; }
};

/** Commits + churn for a path on HEAD and across every ref. */
function statsFor(pathspecs) {
  const commits = count(['HEAD'], pathspecs);
  const commitsAll = count(['--all'], pathspecs);
  let churn = 0;
  try {
    const out = git(['log', '--all', '--numstat', '--format=', '--', ...pathspecs]);
    for (const line of out.split('\n')) {
      const m = line.split('\t');
      if (m.length >= 3) { churn += (Number(m[0]) || 0) + (Number(m[1]) || 0); }
    }
  } catch {}
  return { commits, commitsAll, churn };
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
  const outPath = args.includes('--out')
    ? resolve(args[args.indexOf('--out') + 1]) : resolve(ROOT, 'data/commits.json');

  const sites = flattenAll(JSON.parse(readFileSync(resolve(ROOT, 'io/sites.json'), 'utf8')));
  const reg = indexRegistry(JSON.parse(readFileSync(resolve(ROOT, 'deploy-registry.json'), 'utf8')));

  const ranked = sites.map((s) => {
    const specs = pathspecsFor(s, reg);
    const a = statsFor(specs);
    return { name: s.name, url: s.url, category: s.category, parent: s.parent,
             commits: a.commits, commitsAll: a.commitsAll, churn: a.churn, specs };
  }).sort((x, y) => y.commitsAll - x.commitsAll);

  if (dry) {
    ranked.slice(0, 24).forEach((r) => console.log(
      String(r.commitsAll).padStart(4), `(HEAD ${String(r.commits).padStart(3)}, +${r.commitsAll - r.commits} off-main)`,
      String(r.churn).padStart(7) + ' churn ', r.name, r.parent ? `(${r.parent})` : '', '←', r.specs.join(' ')));
    console.log(`… ${ranked.length} endpoints total`);
    return;
  }

  const topLevel = ranked.filter((r) => !r.parent);
  const payload = {
    generated: new Date().toISOString(),
    metric: 'commits-all',
    source: 'git rev-list --count --all per endpoint pathspec (every fetched ref); churn = insertions+deletions across all refs',
    status: ranked.some((r) => r.commitsAll > 0) ? 'ok' : 'no-data',
    head_commits: count(['HEAD'], ['.']),
    all_commits: count(['--all'], ['.']),
    total_commits_all: topLevel.reduce((n, s) => n + s.commitsAll, 0),
    total_off_main: topLevel.reduce((n, s) => n + (s.commitsAll - s.commits), 0),
    sites: ranked.map(({ specs, ...keep }) => keep),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  const top = ranked[0];
  console.log(`Wrote ${outPath}: ${ranked.length} endpoints. Repo: ${payload.head_commits} on HEAD, ${payload.all_commits} across all refs. Top: ${top.name} ${top.commitsAll} (${top.commits} on HEAD, ${top.commitsAll - top.commits} off-main).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
