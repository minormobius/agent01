#!/usr/bin/env node
// binding-check.mjs — the golden rule, as code: does each surface's wrangler config bind the
// host its registry entry says it serves?
//
//   node scripts/binding-check.mjs          # the table: every surface, how its host is bound
//   node scripts/binding-check.mjs --check  # the preflight form: exit 1 on an unbound host
//
// A host can be bound two ways, and since 2026-09-23 both are first-class:
//
//   custom domain  { pattern: "x.mino.mobi", custom_domain: true }
//                  Cloudflare makes the DNS. Costs one of the zone's 100 slots.
//   route          { pattern: "x.mino.mobi/*", zone_name: "mino.mobi" }
//                  Costs no slot (1000 per zone), makes NO DNS — the surface's deploy
//                  workflow must run scripts/route-dns.mjs before wrangler deploy, and this
//                  checks that it does.
//
// Neither is the golden rule's failure: a config that binds nothing, so `wrangler deploy`
// updates a stray <name>.workers.dev and the live host never changes, from a green run.
//
// A host bound OUTSIDE the config is declared in the registry entry's `binding` field, and is
// reported rather than failed: "dashboard" (a custom domain attached by hand to the worker the
// config names — works, but is one rename away from the golden rule's failure), "pages" (served
// by a Pages project), "pending" (no host attached yet). Every other unbound host fails.
//
// Out of scope, reported as such rather than failed: endpoints with a path
// (cad.mino.mobi/parts — mounted by a parent through a service binding), surfaces with no
// wrangler.jsonc/.json of their own (Pages, toml-configured, or built elsewhere), and hosts
// outside mino.mobi.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripJsonc } from './route-dns.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const registry = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));

/** host(s) an endpoint string names, and whether it is a path mount */
export function endpointHosts(endpoint) {
  const hosts = [], mounts = [];
  for (const tok of String(endpoint || '').split(/[\s,]+/)) {
    const m = tok.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/\S*)?$/i);
    if (!m) continue;
    (m[2] && m[2] !== '/' ? mounts : hosts).push(m[1].toLowerCase());
  }
  return { hosts, mounts };
}

/** how a config binds a host: 'custom_domain' | 'route' | null */
export function bindingFor(config, host) {
  for (const r of config.routes || (config.route ? [config.route] : [])) {
    const pat = typeof r === 'string' ? r : r.pattern;
    if (typeof r === 'object' && r.custom_domain && pat === host) return 'custom_domain';
    if (pat === `${host}/*` || pat === host) {
      if (typeof r === 'object' && !r.custom_domain && (r.zone_name || r.zone_id)) return 'route';
    }
  }
  return null;
}

function main() {
  const rows = [];
  for (const s of registry.surfaces) {
    const { hosts, mounts } = endpointHosts(s.endpoint);
    const dir = join(ROOT, s.dir);
    // every wrangler*.json[c] in the dir: some surfaces deploy a second worker from a second
    // config (farm/wrangler.next.jsonc is farm-next)
    const cfgs = existsSync(dir) ? readdirSync(dir).filter((f) => /^wrangler[\w.-]*\.jsonc?$/.test(f)) : [];
    if (!hosts.length) { rows.push({ s, kind: mounts.length ? 'mounted' : 'no host', ok: true }); continue; }
    if (s.binding) { for (const host of hosts) rows.push({ s, host, kind: `${s.binding} (declared)`, ok: true }); continue; }
    if (!cfgs.length) { rows.push({ s, kind: 'no jsonc config', ok: true }); continue; }
    const configs = [];
    for (const f of cfgs) {
      try { configs.push(JSON.parse(stripJsonc(readFileSync(join(dir, f), 'utf8')))); }
      catch (e) { rows.push({ s, kind: 'unparseable config', ok: false, why: `${s.dir}/${f}: ${e.message}` }); }
    }
    const config = configs[0] || {};
    for (const host of hosts) {
      if (!host.endsWith('.mino.mobi') && host !== 'mino.mobi') { rows.push({ s, host, kind: 'other zone', ok: true }); continue; }
      const kind = configs.map((c) => bindingFor(c, host)).find(Boolean) || null;
      let ok = !!kind, why = kind ? '' : `${s.dir}/wrangler.jsonc binds no route for ${host} — a deploy would go to ${config.name}.workers.dev (bound by hand? declare it in the registry entry's "binding")`;
      if (kind === 'route') {
        // A route makes no DNS, so the workflow that deploys it must make it.
        const wf = join(ROOT, '.github/workflows', `deploy-${s.surface}.yml`);
        const hasDns = existsSync(wf) && /route-dns\.mjs/.test(readFileSync(wf, 'utf8'));
        if (!hasDns) { ok = false; why = `route for ${host}, but deploy-${s.surface}.yml never runs scripts/route-dns.mjs — the host would have no DNS`; }
      }
      rows.push({ s, host, kind: kind || 'UNBOUND', ok, why });
    }
  }
  const count = (k) => rows.filter((r) => r.kind === k).length;
  const bad = rows.filter((r) => !r.ok);
  if (!CHECK) for (const r of rows) console.log(`  ${r.ok ? ' ' : '✗'} ${r.s.surface.padEnd(18)} ${(r.host || '').padEnd(28)} ${r.kind}${r.why ? '  — ' + r.why : ''}`);
  for (const r of bad) if (CHECK) console.log(`  ✗ ${r.s.surface}: ${r.why || r.kind}`);
  console.log(`custom_domain ${count('custom_domain')} · route ${count('route')} · unbound ${bad.length}`);
  process.exit(CHECK && bad.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
