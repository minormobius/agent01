#!/usr/bin/env node
// backend-inventory.mjs — every worker this repo configures, and what each one actually runs.
//
//   node scripts/backend-inventory.mjs            # summary to stdout
//   node scripts/backend-inventory.mjs --json     # the full inventory as JSON
//   node scripts/backend-inventory.mjs --write    # (re)write docs/BACKENDS.md
//   node scripts/backend-inventory.mjs --check    # exit 1 if docs/BACKENDS.md is stale
//
// The repo's habit is to avoid backends: most surfaces are static files a worker hands out.
// This measures how true that still is, from the only two things that decide it — the wrangler
// config (what is bound: D1, KV, R2, Durable Objects, queues, containers, crons, services) and
// the worker code (whether there is any, and whether it does more than serve assets).
//
// Tiers, cheapest first:
//   static    no `main` — Workers Static Assets only; there is no code to run
//   thin      code that only forwards to env.ASSETS (a fallback, a redirect, headers)
//   api       code with real handlers, but no storage of its own
//   stateful  binds D1 / KV / R2 / Durable Objects / queues / containers — holds data
//
// It sees the REPO. What exists in the Cloudflare ACCOUNT (a worker whose config was
// deleted, a database nothing binds) is the account half, listed by cf-capability-probe.yml;
// docs/BACKENDS.md reconciles the two when that listing is available.
//
// Names only, never values: secrets are reported as the env names the code reads that no
// config binds. IDs are not printed. Output is internet-facing (the root worker serves the
// repo), so it goes through scripts/lib/landing.mjs's redaction.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripJsonc } from './route-dns.mjs';
import { emit, REDACT, scrubText } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

// ---------------------------------------------------------------- config parsing --
/** Just enough TOML for wrangler: top-level keys, [tables], [[arrays of tables]]. */
export function parseWranglerToml(text) {
  const root = {}; let cur = root;
  const setPath = (obj, path, val) => { let o = obj; for (const k of path.slice(0, -1)) o = o[k] ??= {}; o[path.at(-1)] = val; };
  const getPath = (obj, path) => path.reduce((o, k) => (o[k] ??= {}), obj);
  const value = (v) => {
    v = v.trim();
    if (/^".*"$|^'.*'$/.test(v)) return v.slice(1, -1);
    if (v === 'true' || v === 'false') return v === 'true';
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (v.startsWith('[') && v.includes('{')) return [...v.matchAll(/\{[^}]*\}/g)].map((m) => value(m[0]));
    if (v.startsWith('[')) return [...v.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
    if (v.startsWith('{')) { const o = {}; for (const m of v.matchAll(/(\w+)\s*=\s*("[^"]*"|'[^']*'|true|false|[\d.]+)/g)) o[m[1]] = value(m[2]); return o; }
    return v;
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = line.match(/^\[\[([^\]]+)\]\]$/))) {
      const path = m[1].trim().split('.'); const parent = getPath(root, path.slice(0, -1)); const k = path.at(-1);
      if (parent[k] && !Array.isArray(parent[k])) parent[k] = Object.keys(parent[k]).length ? [parent[k]] : [];
      (parent[k] ??= []).push(cur = {}); continue;
    }
    if ((m = line.match(/^\[([^\]]+)\]$/))) { cur = getPath(root, m[1].trim().split('.')); continue; }
    if ((m = line.match(/^([\w.-]+)\s*=\s*(.*)$/))) {
      let v = m[2];
      if (v.trim().startsWith('[') && !v.includes(']')) { while (++i < lines.length && !lines[i].includes(']')) v += lines[i]; v += lines[i] ?? ''; }
      setPath(cur, m[1].split('.'), value(v));
    }
  }
  return root;
}

function readConfig(rel) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  return rel.endsWith('.toml') ? parseWranglerToml(text) : JSON.parse(stripJsonc(text));
}

// ------------------------------------------------------------------ code reading --
/** The worker's own source: its main file plus whatever it imports relatively, one level of src/. */
function codeOf(cfgDir, main) {
  if (!main) return '';
  const abs = join(ROOT, cfgDir, main);
  if (!existsSync(abs)) return '';
  const seen = new Set(); let out = '';
  const walk = (file, depth) => {
    if (seen.has(file) || depth > 6 || !existsSync(file) || statSync(file).isDirectory()) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8'); out += src + '\n';
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const base = join(dirname(file), m[1]);
      for (const cand of [base, `${base}.js`, `${base}.ts`, `${base}.mjs`, join(base, 'index.ts'), join(base, 'index.js')]) {
        if (existsSync(cand) && !statSync(cand).isDirectory()) { walk(cand, depth + 1); break; }
      }
    }
  };
  walk(abs, 0);
  return out;
}

const PUBLIC = /(^|\.)(mino\.mobi|minomobi\.com)$/i;
export function externalHosts(code) {
  const hosts = new Set();
  for (const m of code.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const h = m[1].toLowerCase();
    if (PUBLIC.test(h) || REDACT.test(h) || /^(www\.)?(w3|schemas|json-schema|github|developers\.cloudflare|cloudflare)\./.test(h)) continue;
    if (/example\.(com|org)$|localhost/.test(h)) continue;
    hosts.add(h);
  }
  return [...hosts].sort();
}

/** env.NAME the code reads that no binding or var provides: secrets, by elimination. */
export function secretNames(code, bound) {
  const out = new Set();
  for (const m of code.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g)) if (!bound.has(m[1])) out.add(m[1]);
  return [...out].sort();
}

// ---------------------------------------------------------------- one inventory --
export function describe(cfg, code) {
  const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const d1 = arr(cfg.d1_databases).map((d) => ({ binding: d.binding, name: d.database_name }));
  const kv = arr(cfg.kv_namespaces).map((k) => ({ binding: k.binding }));
  const r2 = arr(cfg.r2_buckets).map((b) => ({ binding: b.binding, name: b.bucket_name }));
  const doB = arr(cfg.durable_objects?.bindings).map((b) => ({ binding: b.name, cls: b.class_name, script: b.script_name || null }));
  const queues = [...arr(cfg.queues?.producers).map((q) => `→${q.queue}`), ...arr(cfg.queues?.consumers).map((q) => `←${q.queue}`)];
  const services = arr(cfg.services).map((s) => ({ binding: s.binding, service: s.service }));
  const containers = arr(cfg.containers).map((c) => c.class_name || c.name || 'container');
  const crons = arr(cfg.triggers?.crons);
  const other = [];
  if (cfg.ai) other.push('ai'); if (cfg.browser) other.push('browser'); if (arr(cfg.vectorize).length) other.push('vectorize');
  if (arr(cfg.analytics_engine_datasets).length) other.push('analytics'); if (cfg.images) other.push('images');
  if (arr(cfg.hyperdrive).length) other.push('hyperdrive'); if (arr(cfg.workflows).length) other.push('workflows');
  const bound = new Set([
    ...d1, ...kv, ...r2, ...services, ...arr(cfg.vectorize), ...arr(cfg.hyperdrive), ...arr(cfg.analytics_engine_datasets),
  ].map((b) => b.binding).concat(doB.map((b) => b.binding), Object.keys(cfg.vars || {}),
    cfg.assets?.binding || [], cfg.ai?.binding || [], cfg.browser?.binding || [], cfg.images?.binding || [],
    arr(cfg.queues?.producers).map((q) => q.binding)));
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const lines = bare ? bare.split('\n').filter((l) => l.trim()).length : 0;
  // thin: the only env it touches is ASSETS, it calls no URL of its own, queries nothing
  const onlyAssets = bare && /env\.ASSETS\.fetch/.test(bare) && lines < 150
    && !/env\.(?!ASSETS\b)[A-Za-z_]\w*/.test(bare) && !/\.prepare\(|fetch\(\s*['"`]https?:|fetch\(\s*new Request\(\s*['"`]https?:/.test(bare);
  const stateful = d1.length || kv.length || r2.length || doB.length || queues.length || containers.length;
  const tier = !cfg.main ? 'static' : stateful ? 'stateful' : onlyAssets ? 'thin' : 'api';
  return {
    name: cfg.name, main: cfg.main || null, tier, lines, assets: !!cfg.assets,
    d1, kv, r2, do: doB, queues, services, containers, crons, other,
    secrets: bare ? secretNames(bare, bound) : [], external: bare ? externalHosts(bare) : [],
    routes: arr(cfg.routes).map((r) => (typeof r === 'string' ? r : r.pattern + (r.custom_domain ? '' : ' (route)'))),
  };
}

export function inventory() {
  const registry = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));
  const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }).split('\n')
    .filter((f) => /(^|\/)wrangler[^/]*\.(jsonc|json|toml)$/.test(f) && !/node_modules|\/dist\/|fixtures?\//.test(f));
  const surfaceFor = (dir) => {
    const hits = registry.surfaces.filter((s) => s.dir === dir || (s.dir !== '.' && dir.startsWith(s.dir + '/')));
    if (hits.length) return hits.sort((a, b) => b.dir.length - a.dir.length)[0].surface;
    return dir === '.' ? 'root' : null;
  };
  const workers = [];
  for (const f of files) {
    let cfg; try { cfg = readConfig(f); } catch (e) { workers.push({ config: f, error: e.message }); continue; }
    if (!cfg.name) continue;
    const dir = dirname(f) === '.' ? '.' : dirname(f);
    const code = codeOf(dir, cfg.main);
    const w = { config: f, dir, surface: surfaceFor(dir), ...describe(cfg, code) };
    // a surface can ship several envs; wrangler's env.* blocks are separate workers only when named
    for (const [envName, envCfg] of Object.entries(cfg.env || {})) if (envCfg.name && envCfg.name !== cfg.name) {
      workers.push({ config: `${f} [env.${envName}]`, dir, surface: w.surface, ...describe({ ...cfg, ...envCfg }, code) });
    }
    workers.push(w);
  }
  // Pages Functions: code with no wrangler config of its own, served by the root Pages project
  const functions = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }).split('\n')
    .filter((f) => /(^|\/)functions\/.+\.(js|ts)$/.test(f) && !/node_modules|\.selftest\./.test(f) && !/^packages\//.test(f));
  return { workers, functions, registry };
}

// ---------------------------------------------------------------------- report --
function markdown({ workers, functions }) {
  const ok = workers.filter((w) => !w.error);
  const by = (t) => ok.filter((w) => w.tier === t);
  const d1 = new Map(), doCls = new Map(), ext = new Map();
  for (const w of ok) {
    for (const d of w.d1) (d1.get(d.name) || d1.set(d.name, []).get(d.name)).push(w.name);
    for (const d of w.do) if (!d.script) (doCls.get(w.name) || doCls.set(w.name, []).get(w.name)).push(d.cls);
    for (const h of w.external) (ext.get(h) || ext.set(h, []).get(h)).push(w.name);
  }
  const uniq = (a) => [...new Set(a)];
  const cell = (a) => (a.length ? a.join(', ') : '—');
  const rows = ok.slice().sort((a, b) => ['stateful', 'api', 'thin', 'static'].indexOf(a.tier) - ['stateful', 'api', 'thin', 'static'].indexOf(b.tier) || a.name.localeCompare(b.name));
  const out = [];
  out.push('# Backends — every worker this repo configures, and what it runs');
  out.push('');
  out.push('<!-- GENERATED by scripts/backend-inventory.mjs --write. Do not edit by hand. -->');
  out.push('');
  out.push(`**${ok.length} workers** across ${new Set(ok.map((w) => w.config.split(' ')[0])).size} wrangler configs, plus ${functions.length} Pages Functions files.`);
  out.push('');
  out.push('| tier | meaning | workers |');
  out.push('|---|---|---|');
  out.push(`| **static** | no code: Static Assets hands out files | ${by('static').length} |`);
  out.push(`| **thin** | code that only forwards to the assets (a fallback, a redirect) | ${by('thin').length} |`);
  out.push(`| **api** | real request handlers, no storage of its own | ${by('api').length} |`);
  out.push(`| **stateful** | binds D1 / KV / R2 / Durable Objects / queues / containers — holds data | ${by('stateful').length} |`);
  out.push('');
  out.push(`Scheduled (cron): **${ok.filter((w) => w.crons.length).length}** workers. Reading secrets: **${ok.filter((w) => w.secrets.length).length}**. Calling third-party hosts: **${ok.filter((w) => w.external.length).length}**.`);
  out.push('');
  out.push('## Shared state — the blast radius');
  out.push('');
  out.push('| D1 database | bound by |');
  out.push('|---|---|');
  for (const [name, ws] of [...d1].sort((a, b) => b[1].length - a[1].length)) out.push(`| \`${name}\` | ${uniq(ws).join(', ')} |`);
  out.push('');
  out.push('## Every worker with code');
  out.push('');
  out.push('| worker | surface | tier | storage | cron | secrets (names) | calls out to |');
  out.push('|---|---|---|---|---|---|---|');
  for (const w of rows.filter((x) => x.tier !== 'static')) {
    const store = [
      ...w.d1.map((d) => `D1 ${d.name}`), ...w.kv.map((k) => `KV ${k.binding}`), ...w.r2.map((r) => `R2 ${r.name}`),
      ...w.do.map((d) => `DO ${d.cls}${d.script ? ` (in ${d.script})` : ''}`), ...w.queues.map((q) => `queue ${q}`),
      ...w.containers.map((c) => `container ${c}`), ...w.services.map((s) => `→ ${s.service}`), ...w.other,
    ];
    out.push(`| \`${w.name}\` | ${w.surface || '**unregistered**'} | ${w.tier} | ${cell(store)} | ${cell(w.crons)} | ${cell(w.secrets)} | ${cell(w.external)} |`);
  }
  out.push('');
  out.push('## Static workers (no code)');
  out.push('');
  out.push(by('static').map((w) => `\`${w.name}\``).sort().join(' · ') || '—');
  out.push('');
  out.push('## Pages Functions');
  out.push('');
  out.push('Code with no wrangler config of its own, run by the root Pages project.');
  out.push('');
  out.push(functions.map((f) => `\`${f}\``).join(' · ') || '—');
  out.push('');
  const unreg = ok.filter((w) => !w.surface);
  if (unreg.length) {
    out.push('## Configured but not a registered surface');
    out.push('');
    out.push('A wrangler config the registry does not know: nothing deploys it through Actions, and preflight does not watch it.');
    out.push('');
    for (const w of unreg) out.push(`- \`${w.name}\` — \`${w.config}\` (${w.tier})`);
    out.push('');
  }
  const errs = workers.filter((w) => w.error);
  if (errs.length) { out.push('## Unparsed configs'); out.push(''); for (const e of errs) out.push(`- \`${e.config}\`: ${e.error}`); out.push(''); }
  return out.map((l) => (REDACT.test(l) ? scrubText(l) || '' : l)).join('\n');
}

function main() {
  const inv = inventory();
  if (args.has('--json')) { console.log(JSON.stringify(inv.workers, null, 1)); return; }
  const md = markdown(inv);
  const target = join(ROOT, 'docs/BACKENDS.md');
  if (args.has('--write') || args.has('--check')) {
    const r = emit(target, md, { write: args.has('--write') });
    if (args.has('--check')) { console.log(r.same ? 'docs/BACKENDS.md is current' : 'docs/BACKENDS.md is stale — run: node scripts/backend-inventory.mjs --write'); process.exit(r.same ? 0 : 1); }
    console.log(`wrote ${relative(ROOT, target)}`);
    return;
  }
  const ok = inv.workers.filter((w) => !w.error);
  const t = (x) => ok.filter((w) => w.tier === x).length;
  console.log(`${ok.length} workers: static ${t('static')} · thin ${t('thin')} · api ${t('api')} · stateful ${t('stateful')} · cron ${ok.filter((w) => w.crons.length).length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
