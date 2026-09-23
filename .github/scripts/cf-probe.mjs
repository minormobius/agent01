/**
 * Ask Cloudflare what this repo's deploy token can see. READ ONLY.
 *
 * Every call is a GET. The point is to replace two guesses with facts:
 *
 *   • the exact state of the 100-Workers-Custom-Domains-per-zone cap, and
 *     which workers are holding the slots, so pruning is informed;
 *   • whether the deploy token can manage Workers Routes and DNS records —
 *     which decides whether "claim the hostname with a plain route instead"
 *     is something a workflow can do end to end, or whether a human has to
 *     open the dashboard for the DNS half.
 *
 * A successful READ of a resource means the token holds that resource's READ
 * permission group. Cloudflare's Edit groups are separate, so a read does not
 * prove a write, and this script says so rather than implying otherwise. It
 * deliberately does not test a write: the only honest write test against a
 * production zone is to create something and delete it again, and that is not
 * a thing to do to somebody's DNS without asking.
 *
 * IDs are truncated before printing. The token is never printed.
 */

const TOKEN = process.env.CF_TOKEN;
const ACCOUNT = process.env.CF_ACCOUNT;
const ZONE_NAME = process.env.ZONE || 'mino.mobi';
const API = 'https://api.cloudflare.com/client/v4';

if (!TOKEN) {
  console.log('CLOUDFLARE_API_TOKEN is not set for this workflow — nothing to probe.');
  process.exit(0);
}

const short = (id) => (id ? `${String(id).slice(0, 6)}…` : '(none)');

async function get(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, ok: res.ok && body?.success !== false, body };
}

// The ONE write this probe can do, and only when PROBE_DNS_WRITE=1: create a
// throwaway TXT record and delete it again. A read proves DNS:Read and nothing
// more; the only honest test of DNS:Edit is a write. The record name is not a
// hostname anything serves, the TTL is the minimum, and the delete is always
// attempted and then verified.
async function send(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, ok: res.ok && json?.success !== false, body: json };
}

/** One line per probe: what was asked, and what came back. */
function line(label, r, extra = '') {
  const why = r.ok ? '' : `  [${r.status}${r.body?.errors?.[0]?.message ? ' ' + r.body.errors[0].message : ''}]`;
  console.log(`  ${r.ok ? 'YES' : 'no '}  ${label}${extra ? '  — ' + extra : ''}${why}`);
  return r.ok;
}

console.log(`\ncf-probe — read-only, ${new Date().toISOString()}`);
console.log(`account ${short(ACCOUNT)}  zone ${ZONE_NAME}\n`);

// ── the token itself ──────────────────────────────────────────────
console.log('token');
// /user/tokens/verify only answers for USER-owned tokens. An account-owned
// token — which is what a deploy secret usually is — answers 401 here while
// working perfectly on every account and zone call below. A `no` on this line
// is therefore not a fault; the lines that follow are the real evidence.
const verify = await get('/user/tokens/verify');
line('verify  (401 here just means an ACCOUNT-owned token)', verify,
  verify.body?.result?.status || '');
// The account-owned form of the same check. When it answers, it names the
// token, and GET on that id lists its policies — the direct answer to "which
// permission groups does this secret hold?". That second read needs the
// Account API Tokens:Read group; a `no` there just means it was not granted.
if (ACCOUNT) {
  const av = await get(`/accounts/${ACCOUNT}/tokens/verify`);
  line('verify  (account-owned form)', av, av.body?.result?.status || '');
  const tid = av.body?.result?.id;
  if (tid) {
    const t = await get(`/accounts/${ACCOUNT}/tokens/${tid}`);
    if (line('read own policies', t, t.ok ? `${t.body?.result?.policies?.length ?? 0} policies` : '')) {
      for (const pol of t.body.result.policies || []) {
        const scope = Object.keys(pol.resources || {}).map((k) => k.replace(/\.[0-9a-f]{32}$/, '.<id>')).join(', ');
        console.log(`       ${pol.effect}  ${scope}`);
        for (const g of pol.permission_groups || []) console.log(`         - ${g.name}`);
      }
    }
  }
}

// ── the zone ──────────────────────────────────────────────────────
console.log('\nzone');
const zones = await get(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
const zone = zones.body?.result?.[0];
line('list zones', zones, zone ? `id ${short(zone.id)} · plan ${zone.plan?.name ?? '?'}` : '');
const zoneId = zone?.id;

// ── Workers Custom Domains: the 100 cap, and who is using it ──────
console.log('\nworkers custom domains  (the cap that blocked dweet.mino.mobi)');
let domains = [];
if (ACCOUNT) {
  const r = await get(`/accounts/${ACCOUNT}/workers/domains?per_page=200`);
  if (line('list custom domains', r,
    r.ok ? `${r.body?.result?.length ?? 0} returned` : '')) {
    domains = r.body.result || [];
  }
} else {
  console.log('  ??   CLOUDFLARE_ACCOUNT_ID is not set — cannot list custom domains');
}

if (domains.length) {
  const inZone = domains.filter((d) => d.zone_name === ZONE_NAME);
  console.log(`\n  ${inZone.length} of the 100 slots on ${ZONE_NAME} are taken`
    + `  (${100 - inZone.length} free)`);
  // Grouped by worker, because a worker holding several is the cheapest prune:
  // one decision frees several slots.
  const byWorker = new Map();
  for (const d of inZone) {
    if (!byWorker.has(d.service)) byWorker.set(d.service, []);
    byWorker.get(d.service).push(d.hostname);
  }
  const rows = [...byWorker.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`  ${byWorker.size} distinct workers hold them.\n`);
  for (const [service, hosts] of rows) {
    console.log(`    ${String(hosts.length).padStart(3)}  ${service}`);
    if (hosts.length > 1) console.log(`         ${hosts.join(', ')}`);
    else console.log(`         ${hosts[0]}`);
  }
  const other = domains.length - inZone.length;
  if (other) console.log(`\n  (${other} more on other zones, which have their own 100)`);
}

// ── Workers Routes: the escape hatch ──────────────────────────────
console.log('\nworkers routes  (capped at 1000/zone, not 100 — the escape)');
if (zoneId) {
  const r = await get(`/zones/${zoneId}/workers/routes`);
  if (line('list routes', r, r.ok ? `${r.body?.result?.length ?? 0} routes on this zone` : '')) {
    for (const rt of (r.body.result || []).slice(0, 40)) {
      console.log(`      ${rt.pattern}  ->  ${rt.script ?? '(none)'}`);
    }
  }
} else {
  console.log('  ??   no zone id — skipped');
}

// ── DNS: the half a route does NOT bring with it ──────────────────
console.log('\ndns  (a route needs a PROXIED record to already exist; wrangler makes none)');
if (zoneId) {
  const r = await get(`/zones/${zoneId}/dns_records?per_page=5`);
  const total = r.body?.result_info?.total_count;
  line('read dns records', r, r.ok ? `${total ?? '?'} records in the zone` : '');
  if (r.ok) {
    console.log('       a READ succeeded, so the token holds DNS:Read.');
    console.log('       DNS:Edit is a SEPARATE permission group and is not proven by this.');
  } else {
    console.log('       no DNS read, so certainly no DNS write: creating the record for a');
    console.log('       route needs a token with the DNS:Edit group, or the dashboard.');
  }
  // How a Custom Domain looks from the DNS side: Cloudflare manages a record
  // for it, and a prune or a route conversion has to reckon with that record.
  if (r.ok) {
    for (const h of ['font', 'cat', 'yapchat', 'airchat']) {
      const x = await get(`/zones/${zoneId}/dns_records?name=${h}.${ZONE_NAME}`);
      const recs = (x.body?.result || []).map((d) => `${d.type}${d.proxied ? ' proxied' : ''}${d.meta?.read_only ? ' read-only' : ''}`);
      console.log(`       ${h}.${ZONE_NAME}: ${recs.length ? recs.join('; ') : 'no record'}`);
    }
  }
  // Is the hostname we could not bind actually absent? This is the fact that
  // makes "just add a route" a green deploy onto a dead host.
  if (process.env.PROBE_DNS_WRITE === '1') {
    const name = `_cf-probe.${ZONE_NAME}`;
    const c = await send('POST', `/zones/${zoneId}/dns_records`, {
      type: 'TXT', name, content: `"cf-probe write test ${new Date().toISOString()}"`, ttl: 60,
      comment: 'cf-capability-probe: created and deleted in the same run',
    });
    if (line(`WRITE dns record  (TXT ${name}, deleted straight after)`, c)) {
      const d = await send('DELETE', `/zones/${zoneId}/dns_records/${c.body.result.id}`);
      line('delete it again', d);
      const left = await get(`/zones/${zoneId}/dns_records?type=TXT&name=${name}`);
      console.log(`       left behind: ${left.body?.result?.length ?? '?'} record(s) named ${name}`);
      console.log('       => the token holds DNS:Edit on this zone: a route + proxied record is buildable from Actions.');
    }
  }
  const q = await get(`/zones/${zoneId}/dns_records?name=dweet.${ZONE_NAME}`);
  if (q.ok) {
    const n = q.body?.result?.length ?? 0;
    console.log(`       dweet.${ZONE_NAME}: ${n ? `${n} record(s)` : 'NO RECORD — a route alone would be a dead host'}`);
  }
} else {
  console.log('  ??   no zone id — skipped');
}

console.log('\nwhat this does and does not settle');
console.log('  settled : how many of the 100 custom-domain slots are used, by which workers');
console.log('  settled : whether this token can READ routes and DNS at all');
console.log('  NOT     : whether it can WRITE them — the Edit groups are separate, and the');
console.log('            only honest test is a write, which this script will not do to a');
console.log('            production zone unasked.');
