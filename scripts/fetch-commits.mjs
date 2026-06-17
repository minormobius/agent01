#!/usr/bin/env node
/**
 * scripts/fetch-commits.mjs
 *
 * Ranks each top-level surface by the number of git commits that have touched
 * the files it deploys from — "commits that impact that endpoint". Writes
 * data/commits.json, the stand-in metric for /iceberg/ until Cloudflare page
 * views are wired up (the iceberg prefers page views when present, else this).
 *
 * Endpoint → pathspec resolution:
 *   • subdomain surfaces (hoop.mino.mobi) → the `paths` globs from
 *     deploy-registry.json (authoritative; e.g. airchat also counts its D1
 *     migrations), falling back to the dir / subdomain label.
 *   • apex path surfaces (mino.mobi/judge/) → the leading path segment as a dir
 *     (judge/), since the registry's apex entry is the whole landing bundle.
 *
 * Usage: node scripts/fetch-commits.mjs [--out path] [--dry]
 * History note: counts are over whatever history is present; CI should checkout
 * with fetch-depth: 0 for the full count. The window is identical for every
 * surface, so the ranking is fair regardless of depth.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hostOf } from './fetch-traffic.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APEX = new Set(['mino.mobi', 'minomobi.com', 'www.mino.mobi']);

/** "fable/**" → "fable"; "functions/**" → "functions"; "index.html" → "index.html". */
export function globToPathspec(g) {
  return g.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
}

/** First path segment of an apex URL: "/judge/" → "judge", "/wars/cult/" → "wars/cult". */
export function apexDir(pathname) {
  const segs = (pathname || '/').split('/').filter(Boolean);
  return segs.join('/');
}

/** Build host → registry-entry map (endpoints can be comma/slash-separated). */
export function indexRegistry(registry) {
  const arr = Array.isArray(registry) ? registry
    : Array.isArray(registry.surfaces) ? registry.surfaces
    : Object.values(registry)[0];
  const byHost = new Map();
  const byName = new Map();
  for (const e of arr) {
    if (e.surface) byName.set(e.surface, e);
    const tokens = String(e.endpoint || '').split(/[,/]/).map((s) => s.trim());
    for (const t of tokens) {
      const m = t.match(/[a-z0-9.-]+\.[a-z]{2,}/i);
      if (m && !APEX.has(m[0])) byHost.set(m[0], e);
    }
  }
  return { byHost, byName };
}

/** Pathspecs whose commits "impact" a given site. */
export function pathspecsFor(site, reg) {
  const { byHost, byName } = reg;
  const host = hostOf(site.url);
  let pathname = '/';
  try { pathname = new URL(site.url).pathname || '/'; } catch {}

  // apex path surface → the path segment as a dir
  if (APEX.has(host) && pathname !== '/') return [apexDir(pathname)];

  // subdomain (or apex root) → registry by host, then by surface name, then dir
  const entry = byHost.get(host) || byName.get(site.name);
  if (entry && Array.isArray(entry.paths) && entry.paths.length) {
    return entry.paths.map(globToPathspec);
  }
  if (entry && entry.dir && entry.dir !== '.') return [entry.dir];
  if (existsSync(resolve(ROOT, site.name))) return [site.name];
  if (APEX.has(host)) return ['index.html'];
  return [host.split('.')[0]]; // subdomain label as last resort
}

function countCommits(specs) {
  const real = specs.filter((s) => s && (existsSync(resolve(ROOT, s)) || s.includes('*') || s.endsWith('.sql') || s.endsWith('.html')));
  const use = real.length ? real : specs;
  try {
    const out = execFileSync('git', ['rev-list', '--count', 'HEAD', '--', ...use], { cwd: ROOT })
      .toString().trim();
    return Number(out) || 0;
  } catch { return 0; }
}

function flattenTopLevel(sitesJson) {
  const out = [];
  for (const c of sitesJson.constellations || [])
    for (const s of c.sites || []) if (!s.parent)
      out.push({ name: s.name, url: s.url, category: (s.tags && s.tags[0]) || 'other' });
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const outPath = args.includes('--out')
    ? resolve(args[args.indexOf('--out') + 1]) : resolve(ROOT, 'data/commits.json');

  const sites = flattenTopLevel(JSON.parse(readFileSync(resolve(ROOT, 'io/sites.json'), 'utf8')));
  const reg = indexRegistry(JSON.parse(readFileSync(resolve(ROOT, 'deploy-registry.json'), 'utf8')));

  const ranked = sites.map((s) => {
    const specs = pathspecsFor(s, reg);
    return { name: s.name, url: s.url, category: s.category, commits: countCommits(specs), specs };
  }).sort((a, b) => b.commits - a.commits);

  if (dry) {
    ranked.slice(0, 20).forEach((r) => console.log(String(r.commits).padStart(4), r.name, '←', r.specs.join(' ')));
    console.log(`… ${ranked.length} surfaces total`);
    return;
  }

  const total = ranked.reduce((n, s) => n + s.commits, 0);
  const payload = {
    generated: new Date().toISOString(),
    metric: 'commits',
    source: 'git rev-list --count per endpoint pathspec (deploy-registry paths)',
    status: total > 0 ? 'ok' : 'no-data',
    history_commits: countCommits(['.']),
    total_commits: total,
    sites: ranked.map(({ specs, ...keep }) => keep),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${outPath}: ${ranked.length} surfaces ranked by commit impact (top: ${ranked[0]?.name} ${ranked[0]?.commits})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
