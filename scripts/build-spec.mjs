#!/usr/bin/env node
// build-spec.mjs — generate spec/data.js, the machine layer of the site-wide
// technical spec sheet served at mino.mobi/spec/.
//
// Merges four sources, all already in the repo (deterministic, no network):
//   1. deploy-registry.json         — the 66 managed surfaces + unmanaged workers
//                                     (endpoint, type, owning branch, deps, status, notes)
//   2. index.html `var P` + <li>    — the curated project taxonomy (236 nodes) and
//      description blocks             their descriptions/tags; children become the
//                                     per-surface FEATURE list
//   3. <dir>/wrangler.jsonc|toml    — worker name, custom domains, compat date,
//                                     D1 / DO / KV / AI bindings, crons
//   4. .github/workflows/           — deploy-<surface>.yml presence
//
// The curated layer (families, capability matrix, description overrides) is
// hand-authored in spec/curated.js — this script never touches it.
//
// Usage:
//   node scripts/build-spec.mjs            # dry run (prints summary)
//   node scripts/build-spec.mjs --write    # write spec/data.js

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

// ---------------------------------------------------------------- registry --
const reg = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));

// ------------------------------------------------------- landing taxonomy P --
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const marker = html.indexOf('var P = [');
if (marker < 0) throw new Error('could not find `var P = [` in index.html');
const arrStart = html.indexOf('[', marker);
let depth = 0, arrEnd = -1;
for (let i = arrStart; i < html.length; i++) {
  const ch = html[i];
  if (ch === '[') depth++;
  else if (ch === ']') { depth--; if (depth === 0) { arrEnd = i; break; } }
}
if (arrEnd < 0) throw new Error('unbalanced brackets parsing P array');
// eslint-disable-next-line no-new-func
const P = Function(`"use strict"; return (${html.slice(arrStart, arrEnd + 1)});`)();

// curated <li> description blocks: url -> { desc, tags }
function decode(s) {
  return s
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}
const descMap = new Map();
for (const m of html.matchAll(/<li>\s*<div class="name-row">([\s\S]*?)<\/div>\s*<div class="desc">([\s\S]*?)<\/div>\s*<\/li>/g)) {
  const href = (m[1].match(/href="([^"]+)"/) || [])[1];
  if (!href) continue;
  const tags = [...m[1].matchAll(/<span class="tag">([^<]+)<\/span>/g)].map((t) => t[1]);
  const desc = decode(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  descMap.set(norm(href), { desc, tags });
}
function norm(u) { return String(u).replace(/^https?:\/\//, '').replace(/\/+$/, ''); }

// -------------------------------------------------- wrangler config parsing --
function stripJsonc(text) {
  // strip /* */ and // comments outside strings (good enough for our configs)
  let out = '', inStr = false, strCh = '', i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === strCh) inStr = false;
      i++; continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

function readWrangler(dir) {
  const candidates = dir === '.'
    ? ['wrangler.jsonc', 'wrangler.toml']
    : [
        `${dir}/wrangler.jsonc`, `${dir}/wrangler.toml`, `${dir}/wrangler.json`,
        `${dir}/apps/api/wrangler.jsonc`, `${dir}/apps/api/wrangler.toml`,
      ];
  for (const rel of candidates) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const raw = readFileSync(abs, 'utf8');
    try {
      if (rel.endsWith('.toml')) return { config: rel, ...parseTomlLoose(raw) };
      // eslint-disable-next-line no-new-func
      const cfg = Function(`"use strict"; return (${stripJsonc(raw)});`)();
      return {
        config: rel,
        name: cfg.name ?? null,
        compat: cfg.compatibility_date ?? null,
        flags: cfg.compatibility_flags ?? [],
        assetsDir: cfg.assets?.directory ?? null,
        main: cfg.main ?? null,
        domains: (cfg.routes ?? []).map((r) => (typeof r === 'string' ? r : r.pattern)).filter(Boolean),
        d1: (cfg.d1_databases ?? []).map((d) => d.database_name).filter(Boolean),
        kv: (cfg.kv_namespaces ?? []).map((k) => k.binding).filter(Boolean),
        durableObjects: (cfg.durable_objects?.bindings ?? []).map((b) => b.class_name).filter(Boolean),
        ai: Boolean(cfg.ai),
        crons: cfg.triggers?.crons ?? [],
      };
    } catch { return { config: rel, parseError: true }; }
  }
  return null;
}

// loose TOML scrape — enough for name/crons/d1/DO in the few .toml configs
function parseTomlLoose(raw) {
  const name = (raw.match(/^\s*name\s*=\s*"([^"]+)"/m) || [])[1] ?? null;
  const compat = (raw.match(/^\s*compatibility_date\s*=\s*"([^"]+)"/m) || [])[1] ?? null;
  const crons = [...raw.matchAll(/crons\s*=\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  const d1 = [...raw.matchAll(/database_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const durableObjects = [...raw.matchAll(/class_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const domains = [...raw.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const assetsDir = (raw.match(/\[assets\][^[]*?directory\s*=\s*"([^"]+)"/s) || [])[1] ?? null;
  return { name, compat, flags: [], assetsDir, main: null, domains, d1, kv: [], durableObjects, ai: /\[ai\]/.test(raw), crons };
}

// ------------------------------------------------------ host/dir -> surface --
const hostToSurface = new Map([['mino.mobi', 'root'], ['www.mino.mobi', 'root'], ['minomobi.com', 'root']]);
const dirToSurface = new Map();
for (const s of reg.surfaces) {
  for (const raw of String(s.endpoint || '').split(/[,/]/)) {
    const host = raw.replace(/\(.*?\)/g, '').trim().split('/')[0];
    if (host.includes('.') && !hostToSurface.has(host)) hostToSurface.set(host, s.surface);
  }
  const dirs = s.dirs ?? [s.dir];
  for (const d of dirs) if (d && d !== '.') dirToSurface.set(d.split('/')[0], s.surface);
}

// resolve a P node URL to its owning surface key (or 'root' for bundled subsites)
function ownerOf(url) {
  const u = norm(url);
  const host = u.split('/')[0];
  const surf = hostToSurface.get(host);
  if (!surf) return null;
  if (surf !== 'root') return surf;
  const seg = u.split('/')[1];
  if (seg && dirToSurface.has(seg)) return dirToSurface.get(seg);
  return 'root';
}

// ------------------------------------------------------------ merge P nodes --
// per surface: primary node (URL == surface home) + feature nodes (everything else)
const bySurface = new Map(reg.surfaces.map((s) => [s.surface, { primary: null, features: [] }]));
const orphanNodes = [];
for (const p of P) {
  const node = {
    name: p.n, url: p.u, cat: p.c || 'misc', commits: p.k || 0, age: p.a || 'cold',
    parent: p.p || null,
    desc: descMap.get(norm(p.u))?.desc ?? null,
    tags: descMap.get(norm(p.u))?.tags ?? [],
  };
  const owner = ownerOf(p.u);
  if (!owner) { orphanNodes.push(node); continue; }
  const slot = bySurface.get(owner);
  const u = norm(p.u), host = u.split('/')[0];
  const isHome = owner !== 'root'
    ? (u === host || u === `${host}`)
    : false; // root's own home is the landing page itself
  if (isHome && !slot.primary) slot.primary = node;
  else slot.features.push(node);
}

// ------------------------------------------------------------------ probes --
function probeHosts(s) {
  const hosts = [];
  for (const raw of String(s.endpoint || '').split(',')) {
    const cleaned = raw.replace(/\(.*?\)/g, '').trim();
    for (const piece of cleaned.split(/[\s/]+/)) {
      if (piece.includes('.') && /^[a-z0-9.-]+$/i.test(piece)) hosts.push(piece);
    }
  }
  return [...new Set(hosts)];
}

// ------------------------------------------------------------------ output --
const surfaces = reg.surfaces.map((s) => {
  const slot = bySurface.get(s.surface);
  const wr = readWrangler(s.dir === '.' ? '.' : (s.dir || ''));
  const pending = /pending/i.test(s.endpoint || '') || /\(domain pending\)/i.test(s.status || '');
  return {
    surface: s.surface,
    dir: s.dir,
    dirs: s.dirs ?? null,
    endpoint: s.endpoint,
    hosts: probeHosts(s),
    pending,
    type: s.type,
    branch: s.branch,
    uses: s.uses ?? [],
    provides: s.provides ?? null,
    serves: s.serves ?? null,
    status: s.status ?? null,
    note: s.note ?? null,
    paths: s.paths ?? [],
    workflow: existsSync(join(ROOT, '.github', 'workflows', `deploy-${s.surface}.yml`))
      ? `deploy-${s.surface}.yml` : null,
    wrangler: wr,
    desc: slot?.primary?.desc ?? null,
    tags: slot?.primary?.tags ?? [],
    commits: slot?.primary?.commits ?? 0,
    age: slot?.primary?.age ?? null,
    features: slot?.features ?? [],
  };
});

let gitMeta = { commit: 'unknown', date: new Date().toISOString().slice(0, 10) };
try {
  const [commit, date] = execSync('git log -1 "--format=%h %cI"', { cwd: ROOT }).toString().trim().split(' ');
  gitMeta = { commit, date: date.slice(0, 10) };
} catch { /* fine — keep fallback */ }

// ------------------------------------------------------------------- probe --
// Optional --probe: curl every public host once (via the shell so the sandbox
// proxy applies) and bake the HTTP status snapshot into data.js. The spec page
// ALSO re-probes client-side on load; this snapshot is the "last verified from
// CI/sandbox" layer that can read real status codes (browser no-cors cannot).
// Health paths for API workers whose / is a 404 by design:
const HEALTH_PATHS = {
  'auth.mino.mobi': '/client-metadata.json',
  'feed.mino.mobi': '/health',
  'scores.mino.mobi': '/api/scores/top?game=curve',
};
let probe = null;
if (process.argv.includes('--probe')) {
  const allHosts = [...new Set(surfaces.flatMap((s) => s.hosts))];
  const list = allHosts.map((h) => `https://${h}${HEALTH_PATHS[h] ?? '/'}`).join('\n');
  const out = execSync(
    `printf '%s\n' "${list.replace(/"/g, '')}" | xargs -P 8 -I{} sh -c 'code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "{}" 2>/dev/null); echo "{} $code"'`,
    { cwd: ROOT, shell: '/bin/bash' }
  ).toString().trim();
  const results = {};
  for (const line of out.split('\n')) {
    const [url, code] = line.trim().split(/\s+/);
    const host = url.replace(/^https?:\/\//, '').split('/')[0];
    results[host] = { code: Number(code) || 0, path: HEALTH_PATHS[host] ?? '/' };
  }
  probe = { at: gitMeta.date, results };
  const down = Object.entries(results).filter(([, r]) => r.code === 0 || r.code >= 500);
  console.log(`probe: ${Object.keys(results).length} hosts, ${down.length} unreachable/erroring${down.length ? ' -> ' + down.map(([h]) => h).join(', ') : ''}`);
}

const data = {
  $comment: 'GENERATED by scripts/build-spec.mjs from deploy-registry.json + index.html. Do not hand-edit — re-run `node scripts/build-spec.mjs --write`. Curated layer lives in spec/curated.js.',
  generated: gitMeta,
  trunk: reg.trunk,
  probe,
  healthPaths: HEALTH_PATHS,
  surfaces,
  unmanaged: reg.unmanaged,
  orphanNodes,
};

const totalFeatures = surfaces.reduce((n, s) => n + s.features.length, 0);
console.log(`spec: ${surfaces.length} surfaces, ${totalFeatures} feature nodes, ${orphanNodes.length} orphan nodes`);
console.log(`      ${surfaces.filter((s) => s.wrangler).length} wrangler configs read, ${surfaces.filter((s) => s.workflow).length} deploy workflows found, ${surfaces.filter((s) => s.pending).length} pending-attach`);
for (const o of orphanNodes) console.log('      orphan:', o.name, o.url);

if (write) {
  const dest = join(ROOT, 'spec', 'data.js');
  writeFileSync(dest, '// GENERATED by scripts/build-spec.mjs — do not hand-edit.\nwindow.SPEC_DATA = ' + JSON.stringify(data, null, 1) + ';\n');
  console.log('wrote', dest);
} else {
  console.log('(dry run — pass --write to emit spec/data.js)');
}
