#!/usr/bin/env node
// Build rethink/data.js — the data behind the landing (index.html), /rethink/
// and /procgen/. Joins catalogue.json (entries, descriptions) to stats/data.json
// (per-surface git activity), to the last probe, and to the hand-written
// content pass in rethink/proposal.json. Refuses to build unless the
// proposal places each catalogue entry at most once; an entry it does not
// mention is auto-placed as a standalone site marked look.
//
//   node scripts/build-rethink.mjs            # check only
//   node scripts/build-rethink.mjs --write    # write rethink/data.js

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { surfaceResolver, norm, pathGlob } from './lib/landing.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
const read = (p) => readFileSync(join(root, p), 'utf8');

const catalogue = JSON.parse(read('catalogue.json'));
const registry = JSON.parse(read('deploy-registry.json'));
const stats = JSON.parse(read('stats/data.json'));
const proposal = JSON.parse(read('rethink/proposal.json'));
const key = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

// --- curated descriptions: the catalogue's own d and tags -------------------
const desc = {};
for (const e of catalogue.entries) if (e.d) desc[key(e.u)] = { d: e.d, tags: e.tags || [] };

// --- registry notes: fallback prose for entries the landing never described --
const regNote = {};
for (const s of registry.surfaces) {
  // registry notes are operator prose: drop deploy chatter before a visitor sees them
  const n = (s.note || '')
    .replace(/\s*\(full description: [^)]*\)\s*$/, '')
    .replace(/^(MANAGED|NEW|FIXED|UNVERIFIED)[^.—–-]*[—–-]\s*/i, '')
    .replace(/\s*\((?:[^()]*\b(?:worker|custom_domain|wrangler|assets? worker|deploy)\b[^()]*)\)/gi, '')
    .replace(/[`*]/g, '')
    .replace(/…$/, '').replace(/\s+/g, ' ').trim();
  if (n) regNote[s.surface] = n.length > 220 ? n.slice(0, 217).replace(/\s+\S*$/, '') + '…' : n;
}
const hostSurface = {};
for (const s of registry.surfaces) {
  const ep = (s.endpoint || '').split(/\s*[\/,]\s*/)[0].trim();
  if (ep && !/[ ()]/.test(ep)) hostSurface[ep] = s.surface;
}

// --- catalogue rows with audit flags ----------------------------------------
const bySurface = Object.fromEntries(stats.surfaces.map((s) => [s.surface, s]));
const entries = catalogue.entries;
const byName = {};
entries.forEach((e) => (byName[e.n] = byName[e.n] || []).push(e));
const kids = {};
entries.forEach((e) => { if (e.p) kids[e.p] = (kids[e.p] || 0) + 1; });
const today = new Date(stats.generated + 'T00:00:00Z').getTime();

const rows = entries.map((e, i) => {
  const f = [];
  if (byName[e.n].length > 1) f.push('dup');
  const g = bySurface[e.surface];
  if (!e.p && e.k <= 1 && g && g.total > 50) f.push('weight');
  if (g && e.t && g.last > e.t) f.push('stale');
  if (!e.t) f.push('nodate');
  const d = desc[key(e.u)];
  if (!d) f.push('nodesc');
  const days = e.t ? (today - new Date(e.t + 'T00:00:00Z').getTime()) / 864e5 : null;
  return {
    id: key(e.u), n: e.n, u: e.u, c: e.c, k: e.k, t: e.t || '', b: e.b || '', p: e.p || '', s: e.surface,
    live: days == null ? 'none' : days <= 7 ? 'hot' : days <= 14 ? 'warm' : 'cold',
    g: g ? g.total : null, gl: g ? g.last : '', ch: kids[e.n] || 0, f,
    d: d ? d.d : '', tags: d ? d.tags : [], rn: d ? '' : (regNote[e.surface] || ''),
  };
});
const rowById = Object.fromEntries(rows.map((r) => [r.id, r]));

// --- flatten the proposal ----------------------------------------------------
const seen = new Map();
const problems = [];
const flat = [];
function walk(m, top, parent, depth) {
  const isNew = m.u.startsWith('+');
  const id = isNew ? m.u.slice(1) : m.u;
  if (seen.has(id)) problems.push(`listed twice: ${id} (${seen.get(id)} and ${top.id})`);
  seen.set(id, top.id);
  if (!isNew && !rowById[id]) problems.push(`not in catalogue: ${id} (under ${top.id})`);
  if (isNew && rowById[id]) problems.push(`marked new but already catalogued: ${id}`);
  if (m.into && !rowById[m.into] && !seen.has(m.into)) problems.push(`merge target unknown: ${m.into} (from ${id})`);
  const row = rowById[id];
  const host = id.split('/')[0];
  const surface = row ? row.s : (rowById[parent] || {}).s || hostSurface[host] || '';
  flat.push({
    id, top: top.id, parent, depth, isNew, action: m.action, into: m.into || '', note: m.note || '',
    group: m.group || '', from: m.from || '', kind: m.kind || top.kind, domain: m.domain || top.domain,
    tech: m.tech || [], label: m.label || '', s: surface, rn: row && row.d ? '' : (regNote[surface] || ''),
    wing: m.wing || top.wing || '',
    n: row ? row.n : (m.label || id.split('/').pop()), row,
  });
  for (const p of m.pages || []) walk(p, top, id, depth + 1);
}
for (const top of proposal.top) for (const m of top.members) walk(m, top, top.id, 1);
// A catalogue entry nobody has placed yet lands as a standalone site under the
// wing its old bucket implies, marked look, so adding a site is one catalogue
// entry and the placement debt shows on /rethink/ instead of failing the build.
const sitesTop = proposal.top.find((t) => t.id === 'sites');
const wingOfBucket = { bluesky: 'bluesky', games: 'play', tools: 'bench', data: 'bench', work: 'bench' };
const kindOfBucket = { bluesky: 'app', games: 'game', tools: 'app', data: 'lens', work: 'app' };
const autoPlaced = [];
for (const r of rows) if (!seen.has(r.id)) {
  walk({ u: r.id, action: 'look', note: 'not yet placed in the content pass; auto-placed from its old bucket', kind: kindOfBucket[r.c] || 'app', domain: r.c, wing: wingOfBucket[r.c] || 'bench' }, sitesTop, 'sites', 1);
  autoPlaced.push(r.id);
}
if (autoPlaced.length) console.warn(`rethink: ${autoPlaced.length} catalogue entr${autoPlaced.length === 1 ? 'y' : 'ies'} auto-placed as look (add them to rethink/proposal.json when you know where they go):\n  ` + autoPlaced.join('\n  '));

if (problems.length) {
  console.error(`rethink proposal: ${problems.length} problem(s)\n  ` + problems.join('\n  '));
  process.exit(1);
}

// --- before / after ------------------------------------------------------------
const count = (list, fn) => list.reduce((o, x) => { const v = fn(x); o[v] = (o[v] || 0) + 1; return o; }, {});
const actions = count(flat, (m) => m.action);
const removed = flat.filter((m) => m.action === 'merge' || m.action === 'retire').length;
const added = flat.filter((m) => m.isNew).length;
const topAfter = proposal.top.filter((t) => t.id !== 'sites').length
  + proposal.top.find((t) => t.id === 'sites').members.length;
const hubsAfter = proposal.top.filter((t) => t.id !== 'sites').length;
const summary = {
  before: { entries: rows.length, top: rows.filter((r) => !r.p).length, buckets: 5 },
  after: { entries: rows.length - removed + added, top: topAfter, hubs: hubsAfter, sites: topAfter - hubsAfter, removed, added },
  actions,
  flags: count(rows.flatMap((r) => r.f), (x) => x),
};

// --- the whole space: every reachable endpoint, with a fate --------------------
// Same crawl as scripts/catalogue-coverage.mjs: every directory holding an
// index.html, minus what .assetsignore keeps off the apex. Each endpoint is
// then placed in the proposal's tree: a door (a hub on the landing), a site
// (standalone, on the landing under its kind), a page (inside a hub), content
// (a page inside a page, reached through it), or internal (should stop being
// served). Anything left is an orphan and is reported.
const SKIP_ALWAYS = new Set(['.git', 'node_modules', '.wrangler', 'target', '.venv', '__pycache__']);
const ignored = existsSync(join(root, '.assetsignore'))
  ? read('.assetsignore').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.replace(/\/+$/, ''))
  : [];
const reachable = [];
const reachableSet = new Set();
(function walk(abs) {
  let ents; try { ents = readdirSync(abs, { withFileTypes: true }); } catch { return; }
  const rel = relative(root, abs) || '(root)';
  if (ents.some((e) => e.isFile() && e.name === 'index.html')) reachable.push(rel);
  for (const e of ents) {
    if (!e.isDirectory() || SKIP_ALWAYS.has(e.name)) continue;
    const childRel = relative(root, join(abs, e.name));
    if (ignored.some((ig) => childRel === ig || childRel.startsWith(ig + '/'))) continue;
    walk(join(abs, e.name));
  }
})(root);
reachable.sort();

const { hostToSurface, dirToSurface } = surfaceResolver(registry);
reachable.forEach((p) => reachableSet.add(p));
const dirOf = new Map(registry.surfaces.map((s) => [s.surface, s.dir]));
const hostOf = new Map();
for (const [h, s] of hostToSurface) if (!hostOf.has(s) && s !== 'root') hostOf.set(s, h);
// A surface can stage several root directories under one host (canvas ships
// draw/, paint/, mmo/, curve/ and pizza/ as canvas.mino.mobi/<name>/). The
// registry's paths[] say so; coverage's dir-only mapping does not know it.
const staged = new Map(); // surface -> Set of root dirs it stages besides dir
for (const s of registry.surfaces) {
  const roots = new Set();
  for (const pat of s.paths || []) { const m = /^([A-Za-z0-9_.-]+)\/\*\*$/.exec(pat); if (m && m[1] !== s.dir && !/^(scripts|packages|functions|workers|\.github)$/.test(m[1])) roots.add(m[1]); }
  if (roots.size) staged.set(s.surface, roots);
}
function repoPath(u) {
  const n = norm(u);
  const host = n.split('/')[0];
  const rest = n.split('/').slice(1).join('/').replace(/#.*$/, '').replace(/\.html$/, '').replace(/\/+$/, '');
  if (/^(www\.)?mino\.mobi$|^minomobi\.com$/.test(host)) return rest || '(root)';
  const surf = hostToSurface.get(host);
  if (!surf) return null;
  const d = dirOf.get(surf);
  if (d === undefined) return null;
  const direct = [d === '.' ? '' : d, rest].filter(Boolean).join('/') || '(root)';
  if (reachableSet.size && !reachableSet.has(direct) && rest) {
    // the surface may stage other root dirs under its host: canvas ships pizza/ as
    // canvas.mino.mobi/pizza/, g ships clock/<toy> as g.mino.mobi/<toy>/
    const roots = staged.get(surf);
    if (roots) {
      if (roots.has(rest.split('/')[0]) && reachableSet.has(rest)) return rest;
      for (const r of roots) if (reachableSet.has(r + '/' + rest)) return r + '/' + rest;
    }
  }
  return direct;
}
function urlOfPath(p) {
  if (p === '(root)') return 'https://mino.mobi/';
  const seg = p.split('/');
  // longest registry dir that prefixes this path wins its host
  let best = null;
  for (const [d, s] of dirToSurface) if (p === d || p.startsWith(d + '/')) if (!best || d.length > best[0].length) best = [d, s];
  if (!best) for (const [s, roots] of staged) if (roots.has(seg[0]) && hostOf.get(s)) return 'https://' + hostOf.get(s) + '/' + seg.join('/') + '/';
  if (best && hostOf.get(best[1])) {
    const rest = p.slice(best[0].length).replace(/^\//, '');
    return 'https://' + hostOf.get(best[1]) + '/' + (rest ? rest + '/' : '');
  }
  return 'https://mino.mobi/' + seg.join('/') + '/';
}
const rules = (catalogue.notListed || []).map((r) => ({ ...r, re: pathGlob(r.glob) }));
// a member's real URL: the catalogue's where listed; a trailing slash only for directory paths
const memberUrl = (m) => { const u = rowById[m.id] ? rowById[m.id].u : 'https://' + m.id; return /\.html$|#/.test(u) ? u : u.replace(/\/?$/, '/'); };
const pathToMember = new Map();
for (const m of flat) { const p = repoPath('https://' + m.id + '/'); if (p && !pathToMember.has(p)) pathToMember.set(p, m); }
const topIds = new Set(proposal.top.map((t) => t.id));
function fateOfMember(m) {
  if (m.action === 'merge' || m.action === 'retire') return 'folded';
  if (m.top === 'sites') return 'site';
  if (m.depth === 1 && m.id === (proposal.top.find((t) => t.id === m.top) || {}).u) return 'door';
  return 'page';
}
const space = [];
const seenPath = new Set();
for (const p of reachable) {
  seenPath.add(p);
  const m = pathToMember.get(p);
  if (m) { space.push({ p, id: m.id, n: m.n, u: memberUrl(m), fate: fateOfMember(m), via: m.parent === m.top ? m.top : m.parent, top: m.top, kind: m.kind }); continue; }
  const rule = rules.find((r) => r.re.test(p));
  // internal dirs are only reachable where the root worker leaks them: on the apex
  if (rule && rule.kind === 'internal') { space.push({ p, id: p, n: p.split('/').pop(), u: 'https://mino.mobi/' + p + '/', fate: 'internal', via: '', top: '', kind: '', why: rule.reason }); continue; }
  // nearest placed ancestor
  let anc = null, q = p;
  while (q.includes('/')) { q = q.slice(0, q.lastIndexOf('/')); if (pathToMember.has(q)) { anc = pathToMember.get(q); break; } }
  if (!anc) {
    // a surface dir with no catalogue entry at all (e.g. a backend that also serves a page)
    const top = p.split('/')[0];
    const s = dirToSurface.get(top);
    if (s) { space.push({ p, id: p, n: p.split('/').pop(), u: urlOfPath(p), fate: 'orphan', via: s, top: '', kind: '', why: 'surface ' + s + ' has no catalogue entry' }); continue; }
    space.push({ p, id: p, n: p.split('/').pop(), u: urlOfPath(p), fate: 'orphan', via: '', top: '', kind: '', why: rule ? rule.kind + ': ' + rule.reason : 'no placed ancestor' });
    continue;
  }
  // content lives under its placed ancestor: derive the URL from the ancestor's, not from a dir guess
  const ancPath = repoPath('https://' + anc.id + '/');
  const relPath = p.slice(ancPath.length + 1);
  space.push({ p, id: p, n: relPath, u: memberUrl(anc).replace(/\/$/, '') + '/' + relPath + '/', fate: 'content', via: anc.id, top: anc.top, kind: anc.kind, why: rule ? rule.reason : '' });
}
// proposal members that are not directories (hash routes, .html pages, hosts served by workers) still count as nodes of the tree
for (const m of flat) { const p = repoPath('https://' + m.id + '/'); if (!p || !seenPath.has(p)) space.push({ p: p || '', id: m.id, n: m.n, u: memberUrl(m), fate: fateOfMember(m), via: m.parent === m.top ? m.top : m.parent, top: m.top, kind: m.kind, virtual: true }); }
const fates = count(space.filter((s) => !s.virtual), (s) => s.fate);
summary.space = { reachable: reachable.length, ...fates, nodes: space.length };
const orphans = space.filter((s) => s.fate === 'orphan');
console.log(`  space: ${reachable.length} reachable · ` + Object.entries(fates).map(([k, v]) => `${k} ${v}`).join(' · '));
if (orphans.length) console.log('  orphans:\n    ' + orphans.map((o) => o.p + '  (' + o.why + ')').join('\n    '));

// --- health: the last probe of every endpoint (scripts/probe-endpoints.mjs) ------
let health = null;
try { health = JSON.parse(read('rethink/health.json')); } catch { health = null; }
const hv = (u) => health ? (health.results[u] || health.results[u.replace(/\/$/, '')] || health.results[u + '/'] || null) : null;
const deadOf = (u) => { const h = hv(u); return h && h.dead ? h.dead : ''; };
for (const s of space) { const d = deadOf(s.u); if (d) s.dead = d; }
for (const m of flat) { const d = deadOf(memberUrl(m)); if (d) m.dead = d; }
for (const r of rows) { const d = deadOf(r.u.replace(/\/?$/, '/')); if (d) { r.dead = d; r.f.push('dead'); } }
summary.flags = count(rows.flatMap((r) => r.f), (x) => x);
summary.health = health ? { checked: health.checked, probed: health.probed, dead: new Set(space.filter((s) => s.dead).map((s) => s.u)).size, deadListed: flat.filter((m) => m.dead).length } : null;

// --- this week: surfaces git touched in the last seven days -------------------
const weekAgo = new Date(today - 7 * 864e5).toISOString().slice(0, 10);
const surfaceDoor = {};
for (const m of flat) if (m.s && !surfaceDoor[m.s]) surfaceDoor[m.s] = m.id;
for (const r of rows) if (r.s && (!surfaceDoor[r.s] || r.p)) surfaceDoor[r.s] = surfaceDoor[r.s] || r.id;
const thisWeek = stats.surfaces
  .filter((s) => s.last >= weekAgo && s.url)
  .sort((a, b) => b.last.localeCompare(a.last) || b.total - a.total)
  .map((s) => ({ surface: s.surface, last: s.last, total: s.total, agent: s.agent, url: s.url, door: surfaceDoor[s.surface] || '' }));
summary.thisWeek = thisWeek.length;

// best prose per member, in the order a visitor would want it
for (const m of flat) { const r = rowById[m.id]; m.d = (r && r.d) || m.rn || ''; m.gl = r ? r.gl : (bySurface[m.s] || {}).last || ''; }

// members inherit their hub's wing; a hub's pages inherit the hub's
for (const m of flat) if (!m.wing) { const t = proposal.top.find((x) => x.id === m.top); m.wing = (t && t.wing) || (rowById[m.parent] && flat.find((x) => x.id === m.parent) || {}).wing || ''; }
for (const s of space) { const m = flat.find((x) => x.id === s.id) || flat.find((x) => x.id === s.via); s.wing = m ? m.wing : ''; }

const out = { generated: stats.generated, summary, space, thisWeek, wings: proposal.wings || [], kinds: proposal.kinds, top: proposal.top.map((t) => ({ id: t.id, label: t.label, u: t.u, kind: t.kind, domain: t.domain, action: t.action, from: t.from || '', why: t.why || '', pinned: !!t.pinned, blurb: t.blurb || '', wing: t.wing || '' })), members: flat.map(({ row, ...m }) => m), rows };
summary.procgen = flat.filter((m) => m.top === 'procgen' || m.domain === 'procgen').length;
summary.lookWithoutAnyProse = flat.filter((m) => m.action === 'look' && !m.rn && !(rowById[m.id] || {}).d).length;

console.log(`rethink: ${rows.length} entries placed · ${hubsAfter} hubs + ${topAfter - hubsAfter} sites at the top (was ${summary.before.top}) · ${removed} merged/retired · ${added} new`);
console.log('  actions: ' + Object.entries(actions).map(([k, v]) => `${k} ${v}`).join(' · '));
const text = '// GENERATED by scripts/build-rethink.mjs — do not edit. Edit rethink/proposal.json.\nwindow.RETHINK = ' + JSON.stringify(out) + ';\n';
if (check) {
  let cur = ''; try { cur = read('rethink/data.js'); } catch {}
  if (cur === text) { console.log('rethink/data.js is current'); process.exit(0); }
  console.error('STALE: rethink/data.js differs from its sources — run: node scripts/build-rethink.mjs --write');
  process.exit(1);
}
if (write) {
  writeFileSync(join(root, 'rethink/data.js'), text);
  console.log('wrote rethink/data.js');
}
