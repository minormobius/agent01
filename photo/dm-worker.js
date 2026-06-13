// /api/dm/post — the backend for photo.mino.mobi/dm.
//
// Flow: an authed Bluesky user uploads a single picture. We (acting as the
// service account `morphyx`) post that picture as a standalone, comment-free
// Bluesky post, then drop a DM into morphyx's group chat that quote-embeds the
// post — so the picture lands in the group as a standalone message.
//
// Why a worker does the posting (not the user): the post must come *from*
// morphyx with no attribution to the uploader, and DMs require morphyx's own
// chat-scoped credentials. The uploading user is authenticated only as an
// anti-abuse gate (validated against the shared auth worker), never as the
// author.
//
// Requirements (set out-of-band, not committed):
//   - secret MORPHYX_APP_PASSWORD — a Bluesky app password for morphyx with
//     **"Allow access to your direct messages" enabled**. A plain app password
//     is rejected by chat.bsky.* with "Bad token scope".
//   - var    MORPHYX_HANDLE        — defaults to morphyxmino.bsky.social.
//   - var    MORPHYX_CONVO_ID      — optional. If unset we auto-pick morphyx's
//     single group convo; set it to pin a specific group chat.

import { resolveHandle, resolvePds, PdsClient } from '../packages/atproto/pds.js';

const AUTH_URL = 'https://auth.mino.mobi';
const CHAT_PROXY = 'did:web:api.bsky.chat#bsky_chat';
// Bluesky rejects image blobs over 1,000,000 bytes at post-creation time.
const MAX_IMAGE_BYTES = 1_000_000;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

// Validate the uploading user against the shared auth worker. Accepts either a
// Bearer token (sites that hold one in localStorage) or the .mino.mobi SSO
// cookie (forwarded as-is). Returns the user object or null.
async function validateUser(request) {
  const authHeader = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');
  if (!authHeader && !cookie) return null;
  const headers = {};
  if (authHeader) headers['authorization'] = authHeader;
  if (cookie) headers['cookie'] = cookie;
  try {
    const res = await fetch(`${AUTH_URL}/api/me`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// chat.bsky.* calls go to morphyx's PDS host with the bsky_chat service-proxy
// header; the PDS forwards them to the chat service.
async function chatGet(pds, accessJwt, method, params) {
  const qs = params ? '?' + new URLSearchParams(params) : '';
  const res = await fetch(`${pds}/xrpc/${method}${qs}`, {
    headers: { authorization: `Bearer ${accessJwt}`, 'atproto-proxy': CHAT_PROXY },
  });
  if (!res.ok) throw new Error(`${method} (${res.status}): ${await res.text()}`);
  return res.json();
}

async function chatPost(pds, accessJwt, method, body) {
  const res = await fetch(`${pds}/xrpc/${method}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessJwt}`,
      'atproto-proxy': CHAT_PROXY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function handleDmPost(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const appPassword = env.MORPHYX_APP_PASSWORD;
  const handle = env.MORPHYX_HANDLE || 'morphyxmino.bsky.social';
  if (!appPassword) {
    return json({ ok: false, error: 'service not configured (MORPHYX_APP_PASSWORD secret is unset)' }, 503);
  }

  // 1. Gate on a valid mino.mobi session.
  const user = await validateUser(request);
  if (!user) return json({ ok: false, error: 'not authenticated — sign in first' }, 401);

  // 2. Read the single uploaded image.
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'expected multipart/form-data' }, 400);
  }
  const file = form.get('image');
  if (!file || typeof file === 'string') return json({ ok: false, error: 'missing "image" field' }, 400);
  const mime = file.type || 'image/jpeg';
  if (!mime.startsWith('image/')) return json({ ok: false, error: 'file must be an image' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return json({ ok: false, error: 'empty image' }, 400);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return json({ ok: false, error: `image too large (${bytes.byteLength} bytes; max ${MAX_IMAGE_BYTES})` }, 413);
  }
  const w = parseInt(form.get('width'), 10);
  const h = parseInt(form.get('height'), 10);
  const aspectRatio = w > 0 && h > 0 ? { width: w, height: h } : undefined;

  // 3. Authenticate as morphyx against its real PDS host.
  let did, pds, client;
  try {
    did = await resolveHandle(handle);
    pds = await resolvePds(did);
    client = new PdsClient(pds);
    await client.login(handle, appPassword);
  } catch (e) {
    return json({ ok: false, error: `morphyx login failed: ${e.message}` }, 502);
  }
  const accessJwt = client.session.accessJwt;

  // 4. Upload the blob and create a standalone, comment-free image post.
  let postUri, postCid;
  try {
    const blob = await client.uploadBlob(bytes, mime);
    const record = {
      $type: 'app.bsky.feed.post',
      text: '',
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{ alt: '', image: blob, ...(aspectRatio ? { aspectRatio } : {}) }],
      },
    };
    const result = await client.createRecord('app.bsky.feed.post', record);
    postUri = result.uri;
    postCid = result.cid;
  } catch (e) {
    return json({ ok: false, error: `posting failed: ${e.message}` }, 502);
  }

  // 5. Resolve the group convo morphyx belongs to.
  let convoId = env.MORPHYX_CONVO_ID;
  try {
    if (!convoId) {
      const { convos } = await chatGet(pds, accessJwt, 'chat.bsky.convo.listConvos', { limit: '100' });
      const groups = (convos || []).filter((c) => (c.members || []).length > 2);
      if (groups.length === 0) {
        return json({
          ok: false,
          error: 'morphyx is in no group chat — create a group DM including morphyx, or set MORPHYX_CONVO_ID',
          post: { uri: postUri, cid: postCid },
        }, 409);
      }
      convoId = groups[0].id;
    }
  } catch (e) {
    return json({ ok: false, error: `could not list convos: ${e.message}`, post: { uri: postUri, cid: postCid } }, 502);
  }

  // 6. Drop the post into the group chat as a standalone (quote-embed) DM.
  try {
    await chatPost(pds, accessJwt, 'chat.bsky.convo.sendMessage', {
      convoId,
      message: {
        text: '',
        embed: { $type: 'app.bsky.embed.record', record: { uri: postUri, cid: postCid } },
      },
    });
  } catch (e) {
    return json({ ok: false, error: `sending DM failed: ${e.message}`, post: { uri: postUri, cid: postCid } }, 502);
  }

  const rkey = postUri.split('/').pop();
  return json({
    ok: true,
    post: { uri: postUri, cid: postCid, url: `https://bsky.app/profile/${did}/post/${rkey}` },
    convoId,
  });
}
