// Backend for photo.mino.mobi/dm.
//
// An authed Bluesky user uploads a single picture. We (acting as the service
// account `morphyx`) post that picture as a standalone, comment-free Bluesky
// post, then drop it as a DM into one or more group chats the user picked —
// quote-embedding the post so it lands in each group as a standalone message.
//
// The chat picker IS the access-control model: a user may only target group
// chats that *both* they and morphyx belong to ("mutual group chats"). That
// mutual-membership set is the whitelist — a user can't fan a picture into a
// group they aren't already in. Selection is enforced server-side on every
// send (see the eligibility re-check in handleDmPost); the client's list is
// only a hint.
//
// Two endpoints:
//   GET  /api/dm/convos — list the caller's mutual group chats with morphyx.
//   POST /api/dm/post   — post the image + DM it into the selected groups.
//
// Requirements (set out-of-band, not committed):
//   - secret MORPHYX_APP_PASSWORD — a Bluesky app password for morphyx with
//     **"Allow access to your direct messages" enabled**. A plain app password
//     is rejected by chat.bsky.* with "Bad token scope". deploy-photo.yml
//     pushes this onto the worker from the BLUESKY_MORPHYX_APP_PASSWORD secret.
//   - var    MORPHYX_HANDLE — defaults to morphyxmino.bsky.social.

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

// Validate the calling user against the shared auth worker. Accepts either a
// Bearer token (sites that hold one in localStorage) or the .mino.mobi SSO
// cookie (forwarded as-is). Returns the user object ({ did, handle, ... }) or null.
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

// Log in as morphyx against its real PDS host.
async function loginMorphyx(env) {
  const appPassword = env.MORPHYX_APP_PASSWORD;
  const handle = env.MORPHYX_HANDLE || 'morphyxmino.bsky.social';
  const did = await resolveHandle(handle);
  const pds = await resolvePds(did);
  const client = new PdsClient(pds);
  await client.login(handle, appPassword);
  return { client, pds, did: client.session.did, accessJwt: client.session.accessJwt };
}

// Every group chat (>2 members) that morphyx shares with `userDid`. Paginated.
async function listMutualGroups(pds, accessJwt, userDid) {
  const groups = [];
  let cursor;
  for (let page = 0; page < 6; page++) {
    const params = { limit: '100' };
    if (cursor) params.cursor = cursor;
    const { convos, cursor: next } = await chatGet(pds, accessJwt, 'chat.bsky.convo.listConvos', params);
    for (const c of convos || []) {
      const members = c.members || [];
      if (members.length > 2 && members.some((m) => m.did === userDid)) groups.push(c);
    }
    if (!next || !(convos || []).length) break;
    cursor = next;
  }
  return groups;
}

// A human label for a group: its name if it has one, else the other members.
function convoLabel(convo, morphyxDid, userDid) {
  if (convo.name) return convo.name;
  const others = (convo.members || [])
    .filter((m) => m.did !== morphyxDid && m.did !== userDid)
    .map((m) => m.displayName || '@' + m.handle);
  if (others.length === 0) return 'Group chat';
  if (others.length <= 3) return others.join(', ');
  return `${others.slice(0, 3).join(', ')} +${others.length - 3}`;
}

// ── GET /api/dm/convos ────────────────────────────────────────────
export async function handleDmConvos(request, env) {
  if (request.method !== 'GET') return json({ ok: false, error: 'GET only' }, 405);
  if (!env.MORPHYX_APP_PASSWORD) {
    return json({ ok: false, error: 'service not configured (MORPHYX_APP_PASSWORD secret is unset)' }, 503);
  }
  const user = await validateUser(request);
  if (!user) return json({ ok: false, error: 'not authenticated — sign in first' }, 401);

  let m;
  try {
    m = await loginMorphyx(env);
  } catch (e) {
    return json({ ok: false, error: `morphyx login failed: ${e.message}` }, 502);
  }

  try {
    const groups = await listMutualGroups(m.pds, m.accessJwt, user.did);
    return json({
      ok: true,
      convos: groups.map((c) => ({
        id: c.id,
        label: convoLabel(c, m.did, user.did),
        memberCount: (c.members || []).length,
      })),
    });
  } catch (e) {
    return json({ ok: false, error: `could not list convos: ${e.message}` }, 502);
  }
}

// ── POST /api/dm/post ─────────────────────────────────────────────
export async function handleDmPost(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  if (!env.MORPHYX_APP_PASSWORD) {
    return json({ ok: false, error: 'service not configured (MORPHYX_APP_PASSWORD secret is unset)' }, 503);
  }

  // 1. Gate on a valid mino.mobi session.
  const user = await validateUser(request);
  if (!user) return json({ ok: false, error: 'not authenticated — sign in first' }, 401);

  // 2. Parse the form: image + selected convo ids.
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'expected multipart/form-data' }, 400);
  }

  let requested = [];
  const rawConvos = form.get('convoIds');
  if (rawConvos) {
    try {
      requested = JSON.parse(rawConvos);
    } catch {
      requested = String(rawConvos).split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(requested) || requested.length === 0) {
    return json({ ok: false, error: 'select at least one group chat' }, 400);
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

  // 3. Authenticate as morphyx.
  let m;
  try {
    m = await loginMorphyx(env);
  } catch (e) {
    return json({ ok: false, error: `morphyx login failed: ${e.message}` }, 502);
  }

  // 4. Enforce the whitelist server-side: only send to mutual group chats.
  //    Never trust the client's convo ids.
  let eligibleIds;
  try {
    const groups = await listMutualGroups(m.pds, m.accessJwt, user.did);
    eligibleIds = new Set(groups.map((c) => c.id));
  } catch (e) {
    return json({ ok: false, error: `could not verify chats: ${e.message}` }, 502);
  }
  const targets = requested.filter((id) => eligibleIds.has(id));
  const rejected = requested.filter((id) => !eligibleIds.has(id));
  if (targets.length === 0) {
    return json({ ok: false, error: 'none of the selected chats are group chats you share with morphyx' }, 403);
  }

  // 5. Upload the blob and create one standalone, comment-free image post.
  let postUri, postCid;
  try {
    const blob = await m.client.uploadBlob(bytes, mime);
    const record = {
      $type: 'app.bsky.feed.post',
      text: '',
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{ alt: '', image: blob, ...(aspectRatio ? { aspectRatio } : {}) }],
      },
    };
    const result = await m.client.createRecord('app.bsky.feed.post', record);
    postUri = result.uri;
    postCid = result.cid;
  } catch (e) {
    return json({ ok: false, error: `posting failed: ${e.message}` }, 502);
  }

  // 6. Fan the post into each selected group chat as a quote-embed DM.
  const sent = [];
  const failed = [];
  for (const convoId of targets) {
    try {
      await chatPost(m.pds, m.accessJwt, 'chat.bsky.convo.sendMessage', {
        convoId,
        message: {
          text: '',
          embed: { $type: 'app.bsky.embed.record', record: { uri: postUri, cid: postCid } },
        },
      });
      sent.push(convoId);
    } catch (e) {
      failed.push({ convoId, error: e.message });
    }
  }

  const rkey = postUri.split('/').pop();
  return json({
    ok: sent.length > 0,
    post: { uri: postUri, cid: postCid, url: `https://bsky.app/profile/${m.did}/post/${rkey}` },
    sent,
    failed,
    rejected,
  });
}
