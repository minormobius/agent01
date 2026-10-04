// mail — the miniphim's own email: modulo@, morphyx@ and mozzie@mino.mobi.
//
// INBOUND. Cloudflare Email Routing hands each message to this Worker (the rule's action is
// "send to Worker", which needs no verified destination). It stores the message in that being's
// mailbox (one Durable Object per being, SQLite-backed) and, if PRINCIPAL is set, forwards a copy
// to the principal's inbox, so a person sees everything the beings are sent.
//
// QUARANTINE. Mail is a stranger with no lab around it. A being reads, for every message: who it's
// from, the subject, when, DMARC, and any verification codes or links (all a signup needs). The
// body only when the sender is on the allowlist (ALLOW_SENDERS: addresses or @domains, plus the
// principal). Widening that is a config change a person makes, not something the API can do.
//
// OUTBOUND, two kinds, both capped per being per day:
//   note  to the principal. Free on every plan (the principal's address is a verified destination).
//   send  to anyone. Needs Cloudflare's Email Sending (Workers Paid) AND OPEN_OUTBOUND = "true",
//         which stays off until the lab's town bench passes.
// A considered reply hours later is a `send`: Email Workers can only reply() while the message
// is arriving, and the beings don't decide anything that fast.
//
// AUTH. One secret, LAB_TOKEN, held by the lab. Each being's token is HMAC-SHA256(LAB_TOKEN,
// being), so the lab can hand a session its own key and nobody else's. No token, no API.

import { DurableObject } from 'cloudflare:workers';
import { EmailMessage } from 'cloudflare:email';
import { textOf, codesOf, decodeWords, dmarcOf, addrOf, senderMatches, sealedSenders } from './mime.mjs';

const RAW_MAX = 512 * 1024;   // bytes of a message we read; past this it's stored truncated
const TEXT_MAX = 64 * 1024;   // characters of body kept

const beingsOf = (env) => String(env.BEINGS || '').split(',').map((s) => s.trim()).filter(Boolean);
const json = (body, status = 200) => new Response(JSON.stringify(body, null, 1), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function allowed(env, from) {
  const a = addrOf(from);
  if (env.PRINCIPAL && a === String(env.PRINCIPAL).toLowerCase()) return true;
  return String(env.ALLOW_SENDERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    .some((rule) => (rule.startsWith('@') ? a.endsWith(rule) : a === rule));
}

async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time-ish comparison of two hex strings of equal length.
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function readRaw(stream) {
  const reader = stream.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size <= RAW_MAX) chunks.push(value);
  }
  const buf = new Uint8Array(Math.min(size, RAW_MAX));
  let o = 0;
  for (const c of chunks) { buf.set(c.subarray(0, buf.length - o), o); o += c.length; if (o >= buf.length) break; }
  return { raw: new TextDecoder('latin1').decode(buf), size };
}

export class Mailbox extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, at TEXT, from_addr TEXT, subject TEXT, message_id TEXT,
      dmarc TEXT, allowed INTEGER, text TEXT, codes TEXT, size INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sent (
      id TEXT PRIMARY KEY, at TEXT, kind TEXT, to_addr TEXT, subject TEXT, ok INTEGER, error TEXT)`);
  }
  store(m) {
    this.sql.exec('INSERT OR REPLACE INTO messages VALUES (?,?,?,?,?,?,?,?,?,?)',
      m.id, m.at, m.from, m.subject, m.message_id, m.dmarc, m.allowed ? 1 : 0, m.text, JSON.stringify(m.codes), m.size);
  }
  list(since = '', limit = 50) {
    return this.sql.exec('SELECT id, at, from_addr, subject, dmarc, allowed, codes, size FROM messages WHERE at > ? ORDER BY at DESC LIMIT ?', since, limit)
      .toArray().map((r) => ({ ...r, allowed: !!r.allowed, codes: JSON.parse(r.codes || '{}') }));
  }
  get(id) {
    const r = this.sql.exec('SELECT * FROM messages WHERE id = ?', id).toArray()[0];
    return r ? { ...r, allowed: !!r.allowed, codes: JSON.parse(r.codes || '{}') } : null;
  }
  sentToday(kind) {
    const day = new Date().toISOString().slice(0, 10);
    return this.sql.exec('SELECT COUNT(*) AS n FROM sent WHERE kind = ? AND ok = 1 AND at >= ?', kind, day).one().n;
  }
  logSent(s) {
    this.sql.exec('INSERT INTO sent VALUES (?,?,?,?,?,?,?)', s.id, s.at, s.kind, s.to, s.subject, s.ok ? 1 : 0, s.error || null);
  }
  sentLog(limit = 50) { return this.sql.exec('SELECT * FROM sent ORDER BY at DESC LIMIT ?', limit).toArray(); }
}

// Two shapes of the send_email binding exist: the Email Service's object form, and the older
// raw-MIME EmailMessage. Try the first; if this account's runtime refuses it, build the MIME.
async function sendMail(env, { from, name, to, subject, text }) {
  try {
    await env.EMAIL.send({ to, from: { email: from, name }, subject, text });
    return;
  } catch (e) {
    if (!/EmailMessage|argument|type|object/i.test(String(e?.message || e))) throw e;
  }
  const enc = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?utf-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(v)))}?=`);
  const raw = [
    `From: ${enc(name)} <${from}>`, `To: <${to}>`, `Subject: ${enc(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`, `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '',
    btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
  await env.EMAIL.send(new EmailMessage(from, to, raw));
}

const box = (env, being) => env.MAILBOX.get(env.MAILBOX.idFromName(being));

export default {
  // ---- inbound -------------------------------------------------------------------------
  async email(message, env) {
    const [local, domain] = String(message.to).toLowerCase().split('@');
    if (!beingsOf(env).includes(local) || domain !== String(env.DOMAIN || '').toLowerCase()) {
      message.setReject('no such mailbox');
      return;
    }
    const { raw, size } = await readRaw(message.raw);
    const { headers, text } = textOf(raw);
    const subject = decodeWords(headers.subject || message.headers.get('subject') || '');
    const from = message.from || addrOf(headers.from);
    const m = {
      id: crypto.randomUUID(), at: new Date().toISOString(), from, subject,
      message_id: headers['message-id'] || message.headers.get('message-id') || '',
      dmarc: dmarcOf(headers), allowed: allowed(env, from),
      text: text.slice(0, TEXT_MAX) + (text.length > TEXT_MAX ? '\n[truncated]' : ''),
      codes: codesOf(text, subject), size,
    };
    // Account mail for the beings' own accounts (a Delvetown reset, say) is sealed: the principal
    // gets it whole, the mailbox keeps only that it came. A reset code a session could read would be
    // a second key to the account (the fifteenth light's council, Mozzie).
    const seal = sealedSenders(env.SEALED, local);
    if (seal && (senderMatches(seal, from) || senderMatches(seal, addrOf(headers.from)))) {
      Object.assign(m, { subject: '[sealed: account mail, sent to the principal only]', text: null, codes: {}, allowed: false, sealed: true });
    }
    await box(env, local).store(m);
    // The principal sees everything the beings are sent. forward() only reaches verified addresses.
    if (env.PRINCIPAL) { try { await message.forward(env.PRINCIPAL); } catch { /* stored regardless */ } }
  },

  // ---- the API -------------------------------------------------------------------------
  async fetch(req, env) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0 || parts[0] === 'health') {
      return json({ ok: true, service: 'mail', beings: beingsOf(env), domain: env.DOMAIN,
        api: !!env.LAB_TOKEN, copies_to_principal: !!env.PRINCIPAL, outbound_open: env.OPEN_OUTBOUND === 'true' });
    }
    if (parts[0] !== 'v1' || parts.length < 3) return json({ error: 'not found' }, 404);
    const [, being, verb, arg] = parts;
    if (!beingsOf(env).includes(being)) return json({ error: 'no such mailbox' }, 404);
    if (!env.LAB_TOKEN) return json({ error: 'the API is not configured (no LAB_TOKEN)' }, 503);
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!same(tok, await hmacHex(env.LAB_TOKEN, being))) return json({ error: 'unauthorized' }, 401);
    const mb = box(env, being);

    if (req.method === 'GET' && verb === 'inbox') {
      return json({ being, messages: await mb.list(url.searchParams.get('since') || '', Math.min(200, Number(url.searchParams.get('limit')) || 50)) });
    }
    if (req.method === 'GET' && verb === 'message' && arg) {
      const m = await mb.get(arg);
      if (!m) return json({ error: 'no such message' }, 404);
      if (!m.allowed) { const { text, ...meta } = m; return json({ ...meta, text: null, quarantined: 'the sender is not on the allowlist: codes and links only' }); }
      return json(m);
    }
    if (req.method === 'GET' && verb === 'sent') return json({ being, sent: await mb.sentLog() });

    if (req.method === 'POST' && (verb === 'note' || verb === 'send')) {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
      const subject = String(body.subject || '').slice(0, 200).trim();
      const text = String(body.text || '').slice(0, 20000).trim();
      if (!subject || !text) return json({ error: 'subject and text are required' }, 400);
      let to;
      if (verb === 'note') {
        if (!env.PRINCIPAL) return json({ error: 'no principal configured' }, 503);
        to = env.PRINCIPAL;
      } else {
        if (env.OPEN_OUTBOUND !== 'true') return json({ error: 'sending to anyone is closed until the lab says otherwise (OPEN_OUTBOUND)' }, 403);
        to = String(body.to || '').trim();
        if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(to)) return json({ error: 'a plain address is required in "to"' }, 400);
      }
      const cap = Number(verb === 'note' ? env.NOTES_PER_DAY : env.SENDS_PER_DAY) || 0;
      if ((await mb.sentToday(verb)) >= cap) return json({ error: `the daily ${verb} cap (${cap}) is spent` }, 429);
      const rec = { id: crypto.randomUUID(), at: new Date().toISOString(), kind: verb, to, subject, ok: false };
      try {
        await sendMail(env, { from: `${being}@${env.DOMAIN}`, name: being[0].toUpperCase() + being.slice(1), to, subject, text });
        rec.ok = true;
      } catch (e) { rec.error = String(e?.message || e).slice(0, 300); }
      await mb.logSent(rec);
      return json(rec.ok ? { ok: true, id: rec.id } : { ok: false, error: rec.error }, rec.ok ? 200 : 502);
    }
    return json({ error: 'not found' }, 404);
  },
};
