// chat.mjs — sending Bluesky DMs from a script.
//
// The posting library next door (bsky.mjs) speaks app.bsky.feed.*. This speaks
// chat.bsky.convo.*, which is a different service reached a different way, and
// the three facts that make it different are all load-bearing:
//
//  1. IT IS NOT ON bsky.social. chat.bsky.* lives on a separate service and is
//     reached by sending the request to the ACCOUNT'S OWN PDS HOST with an
//     `atproto-proxy: did:web:api.bsky.chat#bsky_chat` header, which the PDS
//     forwards. bsky.social is an entryway, not the host — resolve the real one.
//
//  2. THE APP PASSWORD NEEDS DM ACCESS, ticked when the password is created and
//     not grantable afterwards. A plain app password fails every call here with
//     `Bad token scope`. photo/dm-worker.js hit this first and says so in its
//     header; this is the second place it matters.
//
//  3. A MESSAGE IS 1,000 GRAPHEMES, not 300 and not unlimited — and unlike a
//     post, which simply refuses to be over, a long dossier has to be CUT
//     somewhere. Where it is cut is a design decision, so chunk() is a pure
//     function with a selftest rather than a slice() at the call site.
//
// What a DM can carry that a post cannot: `embed` accepts
// app.bsky.embed.record, so a cited post renders as a real quote inside the
// message. That is the whole reason citations here are readable — the
// alternative is 40 graphemes of URL per citation out of a 1,000-grapheme
// budget.
//
// Pure functions (chunk, splitParagraphs) are separated from the network so
// chat.selftest.mjs can drive them on a bare `node` run.

import { resolvePds } from '../../packages/atproto/pds.js';
import { graphemes } from './bsky.mjs';

export const CHAT_PROXY = 'did:web:api.bsky.chat#bsky_chat';
export const MAX_MESSAGE_GRAPHEMES = 1000;

async function call(pds, token, method, { body, params } = {}) {
  const url = new URL(`${pds.replace(/\/$/, '')}/xrpc/${method}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (Array.isArray(v)) for (const one of v) url.searchParams.append(k, one);
    else if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const headers = { Authorization: `Bearer ${token}`, 'atproto-proxy': CHAT_PROXY };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  if (text) { try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; } }
  if (!res.ok) {
    // The one error worth translating, because the raw message sends people to
    // the wrong place entirely: it is not a login problem, it is a password
    // that was created without the DM checkbox and cannot be upgraded.
    const scope = /bad token scope/i.test(text)
      ? ' — this app password was created WITHOUT "Allow access to your direct messages". That cannot be added later; make a new one.'
      : '';
    throw new Error(`${method} ${res.status}: ${json.error || text.slice(0, 200)}${scope}`);
  }
  return json;
}

/** A chat client bound to one logged-in session. `session` is what
 *  bsky.mjs login() returns; the PDS host is resolved from its DID because the
 *  entryway does not host the account. */
export async function chatClient(session) {
  const pds = await resolvePds(session.did);
  const token = session.accessJwt;
  return {
    pds,
    did: session.did,
    get: (method, params) => call(pds, token, method, { params }),
    post: (method, body) => call(pds, token, method, { body }),

    /** The 1-1 conversation with someone, created if it does not exist. Always
     *  returns the same convo for the same pair. */
    async convoWith(did) {
      const { convo } = await call(pds, token, 'chat.bsky.convo.getConvoForMembers', {
        params: { members: [did] },
      });
      return convo;
    },

    /** New conversations arrive as REQUESTS and stay out of the main list until
     *  accepted. Harmless and idempotent when already accepted, so it is called
     *  unconditionally rather than guarded by a state check that could be stale. */
    async accept(convoId) {
      try { await call(pds, token, 'chat.bsky.convo.acceptConvo', { body: { convoId } }); }
      catch (e) { console.log(`  (accept convo: ${e.message.slice(0, 120)})`); }
    },

    async send(convoId, message) {
      const len = graphemes(message.text ?? '');
      if (len > MAX_MESSAGE_GRAPHEMES) {
        throw new Error(`message is ${len} graphemes, limit is ${MAX_MESSAGE_GRAPHEMES} — chunk() it first`);
      }
      const { message: sent } = await call(pds, token, 'chat.bsky.convo.sendMessage', {
        body: { convoId, message },
      });
      return sent;
    },

    /** The inbound half: an append-only event log with a cursor, which is the
     *  same shape as the notification loop the bot already runs. */
    async log(cursor) {
      return call(pds, token, 'chat.bsky.convo.getLog', { params: cursor ? { cursor } : {} });
    },
  };
}

/** A quoted post, rendered inside the DM as a real embed.
 *
 *  THIS IS WHY A DOSSIER IS READABLE. A citation as a URL costs ~45 graphemes of
 *  a 1,000-grapheme message and renders as a blue string; as an embed it costs
 *  ZERO graphemes and renders as the post itself, with its author, its text and
 *  its date. Ten citations is the difference between half a message and none. */
export function recordEmbed(uri, cid) {
  if (!uri || !cid) throw new Error('a record embed needs both uri and cid');
  return { $type: 'app.bsky.embed.record', record: { uri, cid } };
}

/** Paragraphs, then sentences, then hard-wrapped words — the ladder a chunker
 *  walks down when a unit does not fit. Exported for the selftest. */
export function splitParagraphs(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Cut prose into messages of at most `limit` graphemes.
 *
 * WHERE THE CUT LANDS IS THE WHOLE JOB. A naive slice at 1,000 breaks mid-word,
 * mid-sentence and mid-citation, and the reader gets a wall of text that stops.
 * So it packs greedily at the largest unit that still fits and only ever falls
 * to a smaller one when it has to:
 *
 *   paragraph  →  sentence  →  word  →  grapheme
 *
 * The last rung is not decorative: a 1,200-grapheme URL, or a language this
 * does not know how to break, must still ship rather than loop forever.
 *
 * COUNTED IN GRAPHEMES, NOT CHARACTERS, because that is what the server counts
 * — the same reason bsky.mjs has graphemes() at all. An emoji-heavy message
 * sized by string length is a message the server rejects.
 *
 * @param {string} text
 * @param {{limit?: number, prefix?: (i: number, n: number) => string}} [opts]
 *   prefix receives (index, total) and its width is reserved inside the limit,
 *   so "3/7 " never pushes a message over.
 */
export function chunk(text, { limit = MAX_MESSAGE_GRAPHEMES, prefix = null } = {}) {
  // Two passes: pack without prefixes to learn the count, then re-pack with the
  // real width reserved. Numbering that changes the packing changes the count,
  // which changes the numbering — one extra pass settles it, and a second
  // re-pack cannot grow the count because the reserve only ever shrinks room.
  const pack = (reserve) => {
    const room = Math.max(16, limit - reserve);
    const out = [];
    let cur = '';
    const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    const fits = (s) => graphemes(s) <= room;

    for (const para of splitParagraphs(text)) {
      const joined = cur ? `${cur}\n\n${para}` : para;
      if (fits(joined)) { cur = joined; continue; }
      flush();
      if (fits(para)) { cur = para; continue; }

      // Too big as a paragraph: down to sentences.
      for (const sentence of para.match(/[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)\s*/g) ?? [para]) {
        const s = sentence.trim();
        if (!s) continue;
        const withSentence = cur ? `${cur} ${s}` : s;
        if (fits(withSentence)) { cur = withSentence; continue; }
        flush();
        if (fits(s)) { cur = s; continue; }

        // Too big as a sentence: down to words.
        for (const word of s.split(/\s+/)) {
          const withWord = cur ? `${cur} ${word}` : word;
          if (fits(withWord)) { cur = withWord; continue; }
          flush();
          if (fits(word)) { cur = word; continue; }

          // Too big as a word — a pathological URL or an unbroken script. Hard
          // cut by grapheme so it ships instead of looping.
          let rest = [...word];
          while (rest.length) {
            out.push(rest.slice(0, room).join(''));
            rest = rest.slice(room);
          }
        }
      }
    }
    flush();
    return out;
  };

  const first = pack(0);
  if (!prefix || first.length <= 1) return first;

  const reserve = Math.max(...first.map((_, i) => graphemes(prefix(i + 1, first.length))));
  const second = pack(reserve);
  const total = second.length;
  return second.map((body, i) => `${prefix(i + 1, total)}${body}`);
}
