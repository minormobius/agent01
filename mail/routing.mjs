#!/usr/bin/env node
// routing.mjs — make each being's address deliver to the `mail` Worker. Run by deploy-mail.yml
// after the Worker exists (a rule can't name a Worker that isn't there). Idempotent: an existing
// rule for the address is updated in place, never duplicated.
//
//   node mail/routing.mjs           # report what it would do
//   node mail/routing.mjs --apply   # do it
//
// The rule's action is "send to Worker", which needs no verified destination address, so this is
// a zone-level change only (Email Routing Rules: Edit). Following setup-email-routing.yml's rule,
// learned the hard way: a read this token cannot perform means UNKNOWN, never "no rules". So a
// token without that permission is a warning (measured 2026-10-04: this repo's token is one), and
// the rules are made by hand once.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(HERE, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const ZONE = cfg.vars.DOMAIN, WORKER = cfg.name;
const BEINGS = cfg.vars.BEINGS.split(',').map((s) => s.trim());
const apply = process.argv.includes('--apply');
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const API = 'https://api.cloudflare.com/client/v4';

async function cf(path, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  let j = null;
  try { j = await r.json(); } catch { /* unreadable */ }
  if (!j?.success) {
    const why = (j?.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${r.status}`;
    const err = new Error(why); err.auth = /10000|authentication|permission/i.test(why) || r.status === 403; throw err;
  }
  return j.result;
}

const say = (m) => console.log(m);
if (!TOKEN) { say('::error::CLOUDFLARE_API_TOKEN is not set'); process.exit(1); }

try {
  const zone = (await cf(`/zones?name=${ZONE}`))[0];
  if (!zone) throw new Error(`zone ${ZONE} not on this account`);
  let rules;
  try { rules = await cf(`/zones/${zone.id}/email/routing/rules?per_page=100`); }
  catch (e) { if (e.auth) throw Object.assign(new Error(`cannot read the routing rules (${e.message})`), { auth: true }); throw e; }
  for (const being of BEINGS) {
    const addr = `${being}@${ZONE}`;
    const body = { name: `miniphim: ${being} -> worker ${WORKER}`, enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: addr }], actions: [{ type: 'worker', value: [WORKER] }] };
    const existing = rules.find((r) => (r.matchers || []).some((m) => m.field === 'to' && String(m.value).toLowerCase() === addr));
    const already = existing && existing.enabled && (existing.actions || []).some((a) => a.type === 'worker' && (a.value || []).includes(WORKER));
    if (already) { say(`✓ ${addr} already delivers to worker ${WORKER}`); continue; }
    const what = existing ? `update rule ${existing.id} (now: ${JSON.stringify(existing.actions)})` : 'create a rule';
    if (!apply) { say(`· ${addr}: would ${what}`); continue; }
    if (existing) await cf(`/zones/${zone.id}/email/routing/rules/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
    else await cf(`/zones/${zone.id}/email/routing/rules`, { method: 'POST', body: JSON.stringify(body) });
    say(`✓ ${addr}: ${existing ? 'updated' : 'created'} -> worker ${WORKER}`);
  }
} catch (e) {
  // A permission gap is UNKNOWN, not broken: the rules may well exist, made by hand. Warn, say
  // exactly what to check, and don't paint every later deploy red for it. Anything else fails.
  const level = e.auth ? 'warning' : 'error';
  say(`::${level}::email routing for the miniphim could not be reconciled: ${e.message}`);
  if (e.auth) {
    say('::warning::This token cannot read or manage Email Routing rules, so whether mail arrives is unknown from here.');
    say(`::warning::If not done yet: Cloudflare → ${ZONE} → Email → Email Routing → Routing rules → Create address,`);
    say(`::warning::one per being (${BEINGS.map((b) => `${b}@${ZONE}`).join(', ')}), action "Send to a Worker", worker "${WORKER}".`);
    say('::warning::Or widen the token (Zone → Email Routing Rules → Edit) and this step will do it.');
  }
  process.exit(e.auth ? 0 : 1);
}
