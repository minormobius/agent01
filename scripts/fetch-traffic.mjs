#!/usr/bin/env node
/**
 * scripts/fetch-traffic.mjs
 *
 * Pulls per-surface PAGE VIEWS from the Cloudflare GraphQL Analytics API and
 * writes data/traffic.json — the data source for the /iceberg/ diagram.
 *
 * "Page view" here = an HTML document request at the edge
 * (edgeResponseContentTypeName = "html"), estimated from Cloudflare's adaptive
 * sampling (count × sampleInterval), grouped by (host, path). Server-side, so
 * no per-site beacon is required and ~30 days of history is available
 * immediately.
 *
 * Requirements (GitHub Actions secrets):
 *   CLOUDFLARE_API_TOKEN   — must include **Zone Analytics: Read** (or account
 *                            Analytics: Read) for the mino zones, in addition
 *                            to the Pages deploy scope it already carries.
 *   CLOUDFLARE_ACCOUNT_ID  — the account whose zones we enumerate.
 *
 * Usage:
 *   node scripts/fetch-traffic.mjs               # last 30 days → data/traffic.json
 *   node scripts/fetch-traffic.mjs --days 7
 *   node scripts/fetch-traffic.mjs --dry         # print plan, no network, no write
 *   node scripts/fetch-traffic.mjs --out path.json
 *
 * The site list is read from io/sites.json (generated from index.html PROJECTS),
 * so the iceberg ranks exactly the surfaces the landing page knows about.
 *
 * Pure helpers (hostOf / pathPrefix / attributeViews / estimateGroups /
 * depthFor) are exported for scripts/fetch-traffic.selftest.mjs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const GQL = 'https://api.cloudflare.com/client/v4/graphql';
const REST = 'https://api.cloudflare.com/client/v4';

// ─── pure helpers (unit-tested) ─────────────────────────────────────────────

export function hostOf(url) {
  try { return new URL(url).host; } catch { return ''; }
}

/** Normalized path prefix: always starts with '/', always ends with '/'. */
export function pathPrefix(url) {
  let p = '/';
  try { p = new URL(url).pathname || '/'; } catch { /* keep '/' */ }
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p += '/';
  return p;
}

/** Does a concrete request path belong under a site's prefix? */
export function pathMatches(reqPath, prefix) {
  if (prefix === '/') return true;
  const rp = reqPath || '/';
  // exact hit without the trailing slash, or anything beneath the prefix
  return rp === prefix.replace(/\/$/, '') || rp.startsWith(prefix);
}

/**
 * Collapse raw Cloudflare adaptive groups into [{host, path, views}].
 * Each group's estimated views = round(count × avg sampleInterval).
 */
export function estimateGroups(rawGroups) {
  const out = [];
  for (const g of rawGroups || []) {
    const dims = g.dimensions || {};
    const host = dims.clientRequestHTTPHost || '';
    const path = dims.clientRequestPath || '/';
    const count = Number(g.count || 0);
    const si = Number(g.avg && g.avg.sampleInterval) || 1;
    out.push({ host, path, views: Math.round(count * (si > 0 ? si : 1)) });
  }
  return out;
}

/**
 * Attribute estimated groups to each top-level site.
 * Returns Map(url → views). A site collects every group on its host whose
 * request path falls under the site's path prefix.
 */
export function attributeViews(sites, groups) {
  const byUrl = new Map();
  for (const s of sites) {
    const host = hostOf(s.url);
    const prefix = pathPrefix(s.url);
    let sum = 0;
    for (const g of groups) {
      if (g.host === host && pathMatches(g.path, prefix)) sum += g.views;
    }
    byUrl.set(s.url, sum);
  }
  return byUrl;
}

/**
 * Depth in [0,1] for the iceberg: 0 = surface (most viewed), 1 = benthic floor.
 * Log scale (page views span orders of magnitude). Unknown / zero → floor.
 */
export function depthFor(views, minV, maxV) {
  if (!(views > 0)) return 1;
  const lo = Math.log10(Math.max(1, minV));
  const hi = Math.log10(Math.max(10, maxV));
  if (hi <= lo) return 0;
  const d = 1 - (Math.log10(views) - lo) / (hi - lo);
  return Math.max(0, Math.min(1, d));
}

// ─── network ────────────────────────────────────────────────────────────────

async function cfRest(path, token) {
  const r = await fetch(REST + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (!j.success) throw new Error(`CF REST ${path}: ${JSON.stringify(j.errors)}`);
  return j.result;
}

async function listZones(token, accountId) {
  const zones = [];
  for (let page = 1; page < 20; page++) {
    const r = await fetch(
      `${REST}/zones?per_page=50&page=${page}&account.id=${accountId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const j = await r.json();
    if (!j.success) throw new Error(`CF zones: ${JSON.stringify(j.errors)}`);
    zones.push(...j.result.map((z) => ({ name: z.name, tag: z.id })));
    if (j.result.length < 50) break;
  }
  return zones;
}

const ZONE_QUERY = `
query Traffic($zoneTag: String!, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(
        limit: 10000
        orderBy: [count_DESC]
        filter: { datetime_geq: $since, datetime_leq: $until, edgeResponseContentTypeName: "html" }
      ) {
        count
        avg { sampleInterval }
        dimensions { clientRequestHTTPHost clientRequestPath }
      }
    }
  }
}`;

async function queryZone(token, zoneTag, since, until) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: ZONE_QUERY, variables: { zoneTag, since, until } }),
  });
  const j = await r.json();
  if (j.errors && j.errors.length) {
    throw new Error(`CF GraphQL: ${JSON.stringify(j.errors)}`);
  }
  const z = j.data?.viewer?.zones?.[0];
  return z?.httpRequestsAdaptiveGroups || [];
}

// ─── main ─────────────────────────────────────────────────────────────────--

function flattenTopLevelSites(sitesJson) {
  const out = [];
  for (const c of sitesJson.constellations || []) {
    for (const s of c.sites || []) {
      if (s.parent) continue; // top-level surfaces only — children share a host
      out.push({
        name: s.name,
        url: s.url,
        category: (s.tags && s.tags[0]) || 'other',
        weight: s.weight || 0,
        heat: s.heat || 'cold',
      });
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const days = Number((args[args.indexOf('--days') + 1]) || 30) || 30;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outPath = args.includes('--out')
    ? resolve(args[args.indexOf('--out') + 1])
    : resolve(root, 'data/traffic.json');

  const sitesJson = JSON.parse(readFileSync(resolve(root, 'io/sites.json'), 'utf8'));
  const sites = flattenTopLevelSites(sitesJson);
  const wantHosts = new Set(sites.map((s) => hostOf(s.url)));
  const until = new Date();
  const since = new Date(until.getTime() - days * 864e5);

  if (dry) {
    console.log(`[dry] would rank ${sites.length} top-level surfaces across ${wantHosts.size} hosts`);
    console.log(`[dry] window: ${since.toISOString()} → ${until.toISOString()} (${days}d)`);
    console.log(`[dry] hosts: ${[...wantHosts].join(', ')}`);
    return;
  }

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required (token needs Zone Analytics: Read).');
  }

  const zones = await listZones(token, account);
  // Only query zones that actually own one of our hosts.
  const relevant = zones.filter((z) =>
    [...wantHosts].some((h) => h === z.name || h.endsWith('.' + z.name)),
  );
  console.log(`Querying ${relevant.length} zone(s): ${relevant.map((z) => z.name).join(', ')}`);

  let groups = [];
  for (const z of relevant) {
    const raw = await queryZone(token, z.tag, since.toISOString(), until.toISOString());
    groups = groups.concat(estimateGroups(raw));
    console.log(`  ${z.name}: ${raw.length} (host,path) groups`);
  }

  const byUrl = attributeViews(sites, groups);
  const ranked = sites
    .map((s) => ({ name: s.name, url: s.url, category: s.category, views: byUrl.get(s.url) || 0 }))
    .sort((a, b) => b.views - a.views);
  const total = ranked.reduce((n, s) => n + s.views, 0);

  const payload = {
    generated: new Date().toISOString(),
    window_days: days,
    source: 'cloudflare-graphql httpRequestsAdaptiveGroups (edge HTML page loads, sampling-adjusted)',
    status: total > 0 ? 'ok' : 'no-data',
    total_pageviews: total,
    sites: ranked,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${outPath}: ${ranked.length} surfaces, ${total.toLocaleString()} page views over ${days}d`);
}

// run only when invoked directly (not when imported by the selftest)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
