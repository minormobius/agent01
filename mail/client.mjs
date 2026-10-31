#!/usr/bin/env node
// client.mjs — the lab's side of mail.mino.mobi. Holds MAIL_LAB_TOKEN and derives each being's
// key from it (HMAC-SHA256(token, being)), so whatever this hands a session can read that
// being's mailbox and no other.
//
//   MAIL_LAB_TOKEN=… node mail/client.mjs <being> inbox [--since <iso>]
//   MAIL_LAB_TOKEN=… node mail/client.mjs <being> codes          newest verification codes and links
//   MAIL_LAB_TOKEN=… node mail/client.mjs <being> message <id>   (body only if the sender is allowlisted)
//   MAIL_LAB_TOKEN=… node mail/client.mjs <being> note "<subject>" "<text>"   to the principal
//   MAIL_LAB_TOKEN=… node mail/client.mjs <being> key            print the being's own key
import { createHmac } from 'node:crypto';

export const BASE = process.env.MAIL_BASE || 'https://mail.mino.mobi';
export const keyFor = (labToken, being) => createHmac('sha256', labToken).update(being).digest('hex');

export async function mail(being, { token = keyFor(process.env.MAIL_LAB_TOKEN || '', being), method = 'GET', path = 'inbox', body } = {}) {
  const r = await fetch(`${BASE}/v1/${being}/${path}`, {
    method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function main([being, cmd = 'inbox', ...rest]) {
  if (!being || !process.env.MAIL_LAB_TOKEN) { console.error('usage: MAIL_LAB_TOKEN=… node mail/client.mjs <being> inbox|codes|message <id>|note <subject> <text>|key'); return 1; }
  if (cmd === 'key') { console.log(keyFor(process.env.MAIL_LAB_TOKEN, being)); return 0; }
  if (cmd === 'inbox' || cmd === 'codes') {
    const i = rest.indexOf('--since');
    const { messages } = await mail(being, { path: `inbox${i >= 0 ? `?since=${encodeURIComponent(rest[i + 1])}` : ''}` });
    if (cmd === 'codes') for (const m of messages) { if (m.codes.codes.length || m.codes.links.length) console.log(`${m.at}  ${m.from_addr}  ${[...m.codes.codes, ...m.codes.links].join('  ')}`); }
    else for (const m of messages) console.log(`${m.id}  ${m.at}  ${m.from_addr}  dmarc=${m.dmarc}${m.allowed ? '' : '  [quarantined]'}  ${m.subject}`);
    return 0;
  }
  if (cmd === 'message') { console.log(JSON.stringify(await mail(being, { path: `message/${rest[0]}` }), null, 2)); return 0; }
  if (cmd === 'note') { console.log(JSON.stringify(await mail(being, { method: 'POST', path: 'note', body: { subject: rest[0], text: rest[1] } }))); return 0; }
  console.error(`unknown command ${cmd}`); return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`mail: ${e.message}`); process.exit(1); });
