#!/usr/bin/env node
// cf-ops.mjs — carry out the Cloudflare operations listed in .github/cf-ops/plan.json.
//
//   node scripts/cf-ops.mjs              # dry run: evaluate every guard, change nothing
//   node scripts/cf-ops.mjs --apply      # ...and do the ops whose guards pass, if the plan says "apply": true
//
// Run by .github/workflows/cf-ops.yml when the plan changes. The plan is the audit trail: every
// operation is a reviewed commit with a `why`, and the Actions log records what each guard saw.
//
// Operations:
//   delete-worker     { name }         delete a worker script the repo no longer deploys
//   convert-to-route  { worker, host } move a live host from a Custom Domain (one of the zone's
//                                      100 slots) to a plain Worker route (1000/zone), keeping
//                                      the host and every URL. Order keeps the gap to a few
//                                      API calls: create the route, detach the custom domain,
//                                      create the proxied AAAA 100:: once the managed record is
//                                      gone, then check the host answers. The surface's own
//                                      wrangler.jsonc must be switched to the same route in a
//                                      follow-up commit, or its next deploy re-attaches the domain.
//
// A deletion is permanent in Cloudflare (the code survives only in git history, so check that
// first), so every guard is re-evaluated against the LIVE account immediately before acting:
//   - the worker exists (else: already gone — nothing to do)
//   - no Custom Domain serves it, and no zone route points at it (it would take a site down)
//   - it owns no Durable Object namespace (deleting the script deletes the objects' data)
//   - no wrangler config in this repo names it (then something still means to deploy it)
// Any failing guard skips that op and says why; the others proceed. Exit 1 if any op failed.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The guards for delete-worker, as a pure function of what the account and repo say. */
export function deleteWorkerGuards(name, facts) {
  const why = [];
  if (!facts.exists) return { ok: false, skip: true, why: ['already gone'] };
  if (facts.domains.length) why.push(`serves custom domain(s): ${facts.domains.join(', ')}`);
  if (facts.routes.length) why.push(`zone route(s) point at it: ${facts.routes.join(', ')}`);
  if (facts.durableObjects.length) why.push(`owns Durable Object namespace(s) ${facts.durableObjects.join(', ')} — deleting it deletes their data`);
  if (facts.configuredIn.length) why.push(`still configured in the repo: ${facts.configuredIn.join(', ')}`);
  return { ok: why.length === 0, why };
}

/** The guards for convert-to-route, as a pure function of what the account says. */
export function convertGuards(host, worker, facts) {
  if (!facts.customDomain && facts.routeWorker === worker) return { ok: false, skip: true, why: ['already a route to this worker'] };
  const why = [];
  if (!facts.workerExists) why.push(`worker ${worker} does not exist`);
  if (!facts.customDomain) why.push(`${host} is not a custom domain`);
  else if (facts.customDomain !== worker) why.push(`${host} is held by ${facts.customDomain}, not ${worker}`);
  if (facts.routeWorker && facts.routeWorker !== worker) why.push(`a route for ${host} already points at ${facts.routeWorker}`);
  if (!facts.zoneId) why.push(`no zone visible for ${host}`);
  return { ok: why.length === 0, why };
}

/** wrangler configs in the repo that name this worker (top-level or env name). */
export function configsNaming(name, files) {
  const re = new RegExp(`(^|[\\s{,])("name"\\s*:\\s*"${name}"|name\\s*=\\s*"${name}")`, 'm');
  return files.filter((f) => re.test(readFileSync(join(ROOT, f), 'utf8')));
}

async function main() {
  const plan = JSON.parse(readFileSync(join(ROOT, '.github/cf-ops/plan.json'), 'utf8'));
  const apply = process.argv.includes('--apply') && plan.apply === true;
  const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!TOKEN || !ACCOUNT) { console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required'); process.exit(2); }
  const api = async (method, path) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers: { Authorization: `Bearer ${TOKEN}` } });
    const j = await res.json().catch(() => null);
    return { ok: res.ok && j?.success !== false, status: res.status, body: j, err: j?.errors?.[0]?.message };
  };
  const A = `/accounts/${ACCOUNT}`;
  console.log(`cf-ops — ${plan.ops.length} op(s), ${apply ? 'APPLYING' : 'DRY RUN (plan.apply is not true, or --apply not passed)'}\n`);

  // the live facts every guard reads, fetched once
  const scripts = await api('GET', `${A}/workers/scripts`);
  if (!scripts.ok) { console.error(`cannot list scripts: ${scripts.status} ${scripts.err}`); process.exit(1); }
  const existing = new Set(scripts.body.result.map((s) => s.id));
  const domains = (await api('GET', `${A}/workers/domains?per_page=500`)).body?.result || [];
  const dos = (await api('GET', `${A}/workers/durable_objects/namespaces?per_page=500`)).body?.result || [];
  const zones = (await api('GET', '/zones?per_page=50')).body?.result || [];
  const routes = [];
  for (const z of zones) routes.push(...((await api('GET', `/zones/${z.id}/workers/routes`)).body?.result || []));
  const configs = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }).split('\n')
    .filter((f) => /(^|\/)wrangler[^/]*\.(jsonc|json|toml)$/.test(f) && !/node_modules/.test(f));

  const send = async (method, path, body) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => null); // a custom-domain DELETE answers with an empty body
    return { ok: res.ok && j?.success !== false, status: res.status, body: j, err: j?.errors?.[0]?.message };
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let failed = 0;
  for (const op of plan.ops) {
    if (op.op === 'convert-to-route') {
      const { host, worker } = op;
      const zone = zones.find((z) => host === z.name || host.endsWith('.' + z.name));
      const cd = domains.find((d) => d.hostname === host);
      const rt = routes.find((r) => r.pattern === `${host}/*`);
      const facts = { workerExists: existing.has(worker), customDomain: cd?.service || null, routeWorker: rt?.script || null, zoneId: zone?.id || null };
      const g = convertGuards(host, worker, facts);
      if (g.skip) { console.log(`· convert-to-route ${host}: ${g.why.join('; ')}`); continue; }
      if (!g.ok) { console.log(`✗ convert-to-route ${host}: REFUSED — ${g.why.join('; ')}`); failed++; continue; }
      if (!apply) { console.log(`~ convert-to-route ${host}: guards pass — would add route ${host}/* -> ${worker}, detach the custom domain, create AAAA 100:: proxied  (${op.why})`); continue; }
      const step = async (label, fn) => { const r = await fn(); if (!r.ok) throw new Error(`${label}: ${r.status} ${r.err || ''}`); return r; };
      try {
        if (!rt) await step('create route', () => send('POST', `/zones/${zone.id}/workers/routes`, { pattern: `${host}/*`, script: worker }));
        await step('detach custom domain', () => send('DELETE', `${A}/workers/domains/${cd.id}`));
        for (let i = 0; i < 20; i++) {
          const recs = (await send('GET', `/zones/${zone.id}/dns_records?name=${encodeURIComponent(host)}`)).body?.result || [];
          if (!recs.some((x) => x.meta?.read_only)) break;
          await sleep(1500);
        }
        const recs = (await send('GET', `/zones/${zone.id}/dns_records?name=${encodeURIComponent(host)}`)).body?.result || [];
        if (!recs.some((x) => ['A', 'AAAA', 'CNAME'].includes(x.type) && x.proxied)) {
          await step('create DNS', () => send('POST', `/zones/${zone.id}/dns_records`, { type: 'AAAA', name: host, content: '100::', proxied: true, ttl: 1, comment: `Worker route ${host}/* (${worker}); created by scripts/cf-ops.mjs convert-to-route` }));
        }
        let live = false;
        for (let i = 0; i < 12 && !live; i++) { await sleep(5000); try { live = (await fetch(`https://${host}/`, { redirect: 'manual' })).status < 500; } catch {} }
        if (live) console.log(`✓ convert-to-route ${host}: route -> ${worker}, custom domain detached, DNS in place, host answers  (${op.why})`);
        else { console.log(`✗ convert-to-route ${host}: converted, but the host did not answer within ~60s — CHECK IT`); failed++; }
      } catch (e) { console.log(`✗ convert-to-route ${host}: ${e.message} — CHECK THE HOST NOW`); failed++; }
      continue;
    }
    if (op.op !== 'delete-worker') { console.log(`✗ ${op.op} ${op.name}: unknown op`); failed++; continue; }
    const facts = {
      exists: existing.has(op.name),
      domains: domains.filter((d) => d.service === op.name).map((d) => d.hostname),
      routes: routes.filter((r) => r.script === op.name).map((r) => r.pattern),
      durableObjects: dos.filter((n) => n.script === op.name).map((n) => n.class),
      configuredIn: configsNaming(op.name, configs),
    };
    const g = deleteWorkerGuards(op.name, facts);
    if (g.skip) { console.log(`· delete-worker ${op.name}: ${g.why.join('; ')}`); continue; }
    if (!g.ok) { console.log(`✗ delete-worker ${op.name}: REFUSED — ${g.why.join('; ')}`); failed++; continue; }
    if (!apply) { console.log(`~ delete-worker ${op.name}: guards pass — would delete  (${op.why})`); continue; }
    const r = await api('DELETE', `${A}/workers/scripts/${encodeURIComponent(op.name)}`);
    if (r.ok) console.log(`✓ delete-worker ${op.name}: deleted  (${op.why})`);
    else { console.log(`✗ delete-worker ${op.name}: ${r.status} ${r.err}`); failed++; }
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
