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
//   delete-worker  { name }   delete a worker script the repo no longer deploys
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

  let failed = 0;
  for (const op of plan.ops) {
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
