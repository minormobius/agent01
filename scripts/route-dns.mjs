#!/usr/bin/env node
// route-dns.mjs — give every plain Worker route in a wrangler config the DNS record it needs.
//
//   node scripts/route-dns.mjs <dir>/wrangler.jsonc            # plan: what exists, what is missing
//   node scripts/route-dns.mjs <dir>/wrangler.jsonc --apply    # create what is missing
//
// WHY. The mino.mobi zone allows 100 Workers Custom Domains and hit that ceiling on
// 2026-09-22. A plain Worker ROUTE ({ pattern: "x.mino.mobi/*", zone_name: "mino.mobi" },
// no custom_domain) is capped at 1000 per zone and costs no slot — but, unlike a custom
// domain, it creates no DNS. A route on a hostname with no record is a green deploy onto a
// dead host (docs/DEPLOYS.md). wrangler has no DNS command, so this is the missing half:
// for each such route it ensures a PROXIED record exists, using the placeholder Cloudflare
// documents for Worker-only hosts — AAAA 100:: — which never receives traffic because the
// route intercepts it at the edge.
//
// WHAT IT WILL NOT DO. It never modifies or deletes a record. If the hostname already has a
// record that is not proxied, or is the read-only record a Custom Domain manages, it stops and
// says so: that host is still bound somewhere else, and taking it over is a decision (detach
// the custom domain first), not a side effect of a deploy. Wildcard hosts are refused too.
//
// Token: CLOUDFLARE_DNS_TOKEN if set (a narrow Zone.DNS:Edit credential), else
// CLOUDFLARE_API_TOKEN. Exit 0 = every route has a usable record; 1 = one does not; 2 = usage.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function stripJsonc(text) {
  let out = '', inStr = false, i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === '"') inStr = false;
      i++; continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1'); // trailing commas are legal JSONC
}

/** The plain (non-custom-domain) routes of a wrangler config, as { host, zone, pattern }. */
export function plainRoutes(config) {
  const routes = [...(config.routes || []), ...(config.route ? [config.route] : [])];
  const out = [];
  for (const r of routes) {
    if (typeof r !== 'object' || r.custom_domain || !r.zone_name) continue;
    const host = String(r.pattern).split('/')[0];
    out.push({ host, zone: r.zone_name, pattern: r.pattern, wildcard: host.includes('*') });
  }
  return out;
}

/** What to do about one host, given the records Cloudflare returned for exactly that name. */
export function decide(all) {
  // Only address records compete for the name; a TXT or MX alongside is fine to keep.
  const records = all.filter((d) => ['A', 'AAAA', 'CNAME'].includes(d.type));
  if (!records.length) return { action: 'create' };
  const usable = records.find((d) => d.proxied && !d.meta?.read_only);
  if (usable) return { action: 'ok', record: `${usable.type} ${usable.content} proxied` };
  const ro = records.find((d) => d.meta?.read_only);
  if (ro) return { action: 'refuse', why: `a read-only ${ro.type} record is managed for it — it is still a Custom Domain; detach that first` };
  return { action: 'refuse', why: `it has ${records.map((d) => `${d.type}${d.proxied ? ' proxied' : ' DNS-only'}`).join(', ')} — DNS-only, so the route would never see the traffic` };
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) { console.error('usage: route-dns.mjs <wrangler.jsonc> [--apply]'); process.exit(2); }
  const apply = flags.includes('--apply');
  const config = JSON.parse(stripJsonc(readFileSync(file, 'utf8')));
  const routes = plainRoutes(config);
  console.log(`route-dns — ${file}: ${routes.length} plain route(s)${apply ? '' : '  [plan only; --apply to create]'}`);
  if (!routes.length) return;

  const token = process.env.CLOUDFLARE_DNS_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!token) { console.error('  no CLOUDFLARE_DNS_TOKEN / CLOUDFLARE_API_TOKEN in the environment'); process.exit(1); }
  const api = async (method, path, body) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.success === false) throw new Error(`${method} ${path} -> ${res.status} ${j?.errors?.[0]?.message ?? ''}`);
    return j.result;
  };

  const zoneIds = new Map();
  let bad = 0;
  for (const r of routes) {
    if (r.wildcard) { console.log(`  ✗ ${r.pattern}: wildcard hosts are not handled here`); bad++; continue; }
    if (!zoneIds.has(r.zone)) zoneIds.set(r.zone, (await api('GET', `/zones?name=${encodeURIComponent(r.zone)}`))[0]?.id);
    const zid = zoneIds.get(r.zone);
    if (!zid) { console.log(`  ✗ ${r.host}: zone ${r.zone} not visible to this token`); bad++; continue; }
    const d = decide(await api('GET', `/zones/${zid}/dns_records?name=${encodeURIComponent(r.host)}`));
    if (d.action === 'ok') { console.log(`  ✓ ${r.host}: ${d.record}`); continue; }
    if (d.action === 'refuse') { console.log(`  ✗ ${r.host}: ${d.why}`); bad++; continue; }
    if (!apply) { console.log(`  + ${r.host}: no record — would create AAAA 100:: proxied`); continue; }
    await api('POST', `/zones/${zid}/dns_records`, {
      type: 'AAAA', name: r.host, content: '100::', proxied: true, ttl: 1,
      comment: `Worker route ${r.pattern} (${config.name}); created by scripts/route-dns.mjs`,
    });
    console.log(`  + ${r.host}: created AAAA 100:: proxied`);
  }
  if (bad) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`  ✗ ${e.message}`); process.exit(1); });
}
