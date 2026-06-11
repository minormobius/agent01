// pod.mino.mobi — podcast studio worker.
//
// The service is deliberately minimal: it constructs RSS and serves blobs.
// There is NO central index of episodes and no editorial surface — every
// episode/track/subscription lives in its author's own PDS, and that is their
// responsibility, not ours.
//
// Surfaces:
//   /                       landing (static)
//   /room/                  live recording lobby (WebRTC mesh + dual local recording)
//   /prod/                  multitrack clip editor → publish (writes to YOUR PDS)
//   /listen, /app/          per-show viewer + general podcast client (static)
//   /u/<handle>/feed.xml    per-publisher RSS, built live from THEIR repo
//   /enclosure?uri=         streams an episode's chunked blobs as one file
//   /api/episodes?handle=   one publisher's episodes, read from their PDS
//   /api/fetch?url=         guarded RSS proxy for the in-house app
//   /api/room/<id>/ws       room signaling (Durable Object)
//
// The room coordinator (RoomCoordinator Durable Object) is a thin signaling
// relay: it relays WebRTC offer/answer/ICE for the live monitoring mesh, stamps
// a shared RECORDING EPOCH when the host arms recording, and answers NTP-style
// time-sync pings so each client can estimate its clock skew. No audio ever
// touches the server — each browser records its own mic locally and uploads
// chunked atproto blobs straight to its own PDS.

const SITE = { link: 'https://pod.mino.mobi' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/health' || pathname === '/api/health') {
      return json({ ok: true, surface: 'pod', ts: Date.now() });
    }
    // Per-publisher feed, owned by their PDS: /u/<handle-or-did>/feed.xml. The
    // episode records live in the user's repo, so we list them live — no central
    // index, no editorial surface. This worker only builds RSS + serves blobs.
    const userFeed = pathname.match(/^\/u\/([^/]+)\/feed(?:\.xml)?$/);
    if (userFeed) {
      return userFeedXml(decodeURIComponent(userFeed[1]));
    }
    // Per-publisher episode list (powers /listen?handle=) — read from their PDS.
    if (pathname === '/api/episodes') {
      const who = url.searchParams.get('handle') || url.searchParams.get('did');
      if (!who) return json({ error: 'handle or did required' }, 400);
      try { const { items } = await episodesFromPds(who); return json({ items, source: 'pds' }); }
      catch (e) { return json({ items: [], error: String(e.message || e) }); }
    }
    if (pathname === '/api/fetch') {
      return proxyFeed(url.searchParams.get('url'));
    }
    if (pathname === '/enclosure') {
      return serveEnclosure(url.searchParams.get('uri'), request);
    }

    // Room coordinator: /api/room/<roomId>/ws  (WebSocket)  and  /api/room/<roomId>  (info)
    const room = pathname.match(/^\/api\/room\/([A-Za-z0-9_-]{1,64})(\/ws)?$/);
    if (room) {
      const roomId = room[1];
      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }

    // Everything else (landing, /room/, /prod/, assets) → ASSETS binding.
    return env.ASSETS.fetch(request);
  },
};

// --- RSS item rendering ------------------------------------------------------

function itemXml(e) {
  const lines = [
    '    <item>',
    `      <title>${esc(e.title || 'Untitled')}</title>`,
    `      <description>${esc(e.description || '')}</description>`,
  ];
  if (e.audio_url) {
    lines.push(
      `      <enclosure url="${esc(e.audio_url)}" length="${e.length_bytes || 0}" type="${esc(e.mime || 'audio/mpeg')}"/>`
    );
  }
  if (e.pub_date) lines.push(`      <pubDate>${new Date(e.pub_date).toUTCString()}</pubDate>`);
  if (e.duration_sec) lines.push(`      <itunes:duration>${hms(e.duration_sec)}</itunes:duration>`);
  lines.push(`      <guid>${esc(e.guid || e.audio_url || '')}</guid>`);
  lines.push('    </item>');
  return lines.join('\n');
}

function hms(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// --- per-publisher feed (PDS-owned) ------------------------------------------
//
// The episode records live in each publisher's repo and the enclosure streams
// from their PDS, so a per-user feed needs no central state: resolve identity,
// list that repo's com.minomobi.podcast.episode records, render RSS. Writing the
// record IS publishing the feed — there's nothing to register with us.
async function userFeedXml(idOrHandle) {
  let did, items;
  try {
    ({ did, items } = await episodesFromPds(idOrHandle));
  } catch (e) {
    return new Response(`<!-- could not resolve "${esc(idOrHandle)}": ${esc(e.message || '')} -->`, {
      status: 404, headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
    });
  }
  const profile = await getProfileServer(did);
  const handle = (profile && profile.handle) || idOrHandle;
  const name = (profile && profile.displayName) || handle;
  const desc = (profile && profile.description) || `Episodes by ${name}, published on the minomobi Podcast Studio.`;
  const image = profile && profile.avatar;
  const self = `${SITE.link}/u/${encodeURIComponent(handle)}/feed.xml`;
  const imageTags = image
    ? `    <itunes:image href="${esc(image)}"/>\n    <image><url>${esc(image)}</url><title>${esc(name)}</title><link>${esc(SITE.link)}</link></image>\n`
    : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(name)}</title>
    <link>${esc(SITE.link)}/listen?handle=${esc(handle)}</link>
    <description>${esc(desc)}</description>
    <language>en</language>
    <atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
    <itunes:author>${esc(name)}</itunes:author>
    <itunes:summary>${esc(desc)}</itunes:summary>
    <itunes:owner><itunes:name>${esc(name)}</itunes:name></itunes:owner>
    <itunes:explicit>false</itunes:explicit>
${imageTags}${items.map(itemXml).join('\n')}
  </channel>
</rss>`;
  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}

// List a publisher's episode records straight from their repo, newest first,
// mapped to the same row shape the D1 feed + the /listen player consume.
async function episodesFromPds(idOrHandle) {
  const did = idOrHandle.startsWith('did:') ? idOrHandle : await resolveHandleServer(idOrHandle);
  const pds = await resolvePdsServer(did);
  const records = await listRecordsServer(pds, did, 'com.minomobi.podcast.episode', 100);
  const items = records.map((r) => episodeRow(r.uri, r.value || {}, did));
  items.sort((a, b) => String(b.pub_date).localeCompare(String(a.pub_date)));
  return { did, items };
}

function episodeRow(uri, v, did) {
  return {
    guid: uri,
    did,
    title: v.title || 'Untitled',
    description: v.description || '',
    audio_url: `${SITE.link}/enclosure?uri=${encodeURIComponent(uri)}`,
    mime: v.mimeType || 'audio/wav',
    length_bytes: v.lengthBytes || 0,
    duration_sec: v.durationSec || 0,
    pub_date: v.pubDate || v.createdAt || '',
    episode_number: v.episodeNumber ?? null,
    season_number: v.seasonNumber ?? null,
  };
}

async function resolveHandleServer(handle) {
  const h = handle.replace(/^@/, '');
  const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`);
  if (!res.ok) throw new Error('resolveHandle HTTP ' + res.status);
  const j = await res.json();
  if (!j.did) throw new Error('no DID for handle');
  return j.did;
}

async function listRecordsServer(pds, did, collection, limit) {
  const out = [];
  let cursor = '';
  do {
    const q = new URLSearchParams({ repo: did, collection, limit: String(Math.min(limit, 100)) });
    if (cursor) q.set('cursor', cursor);
    const res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${q}`);
    if (!res.ok) throw new Error('listRecords HTTP ' + res.status);
    const j = await res.json();
    out.push(...(j.records || []));
    cursor = j.cursor || '';
  } while (cursor && out.length < limit);
  return out.slice(0, limit);
}

async function getProfileServer(did) {
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

// --- feed proxy --------------------------------------------------------------
//
// Server-side RSS fetch so the in-house podcast app can read ANY feed (browsers
// block cross-origin XML). Guarded against SSRF/abuse: http(s) only, private
// hosts blocked, feed-ish content-types only, size-capped. Audio enclosures are
// played directly by the <audio> element and do NOT go through here.
async function proxyFeed(target) {
  if (!target) return new Response('missing url', { status: 400 });
  let u;
  try { u = new URL(target); } catch { return new Response('bad url', { status: 400 }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return new Response('bad scheme', { status: 400 });
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // unwrap [::1] etc.
  if (isBlockedHost(host)) return new Response('blocked host', { status: 403 });
  let res;
  try {
    res = await fetch(u.toString(), {
      redirect: 'follow',
      headers: { 'user-agent': 'minomobi-pod/1.0 (+https://pod.mino.mobi)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
  } catch (_) { return new Response('fetch failed', { status: 502 }); }
  const ct = res.headers.get('content-type') || '';
  if (!/xml|rss|atom|text|html/i.test(ct)) return new Response('not a feed', { status: 415 });
  const text = await res.text();
  if (text.length > 5_000_000) return new Response('feed too large', { status: 413 });
  return new Response(text, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}

function isBlockedHost(h) {
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === 'metadata.google.internal') return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  if (h === '::1' || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

// --- enclosure ---------------------------------------------------------------
//
// Enclosure: stitch the episode's ordered audio chunks behind one URL. STREAMS
// the chunks (one ≤4 MB chunk in memory at a time) instead of buffering the
// whole file, and honours Range requests so podcast players can seek.
async function serveEnclosure(uri, request) {
  if (!uri) return new Response('missing uri', { status: 400 });
  let did, rec;
  try {
    ({ did } = parseAtUri(uri));
    rec = await getRecordServer(uri);
  } catch (e) {
    return new Response('could not resolve episode', { status: 404 });
  }
  const v = rec.value || {};
  const chunks = v.audio || [];
  if (!chunks.length) return new Response('no audio', { status: 404 });
  const mime = v.mimeType || 'audio/wav';
  const sizes = chunks.map((c) => (c && c.size) || 0);
  const total = sizes.reduce((a, b) => a + b, 0);
  const haveSizes = total > 0;

  let start = 0, end = haveSizes ? total - 1 : Number.MAX_SAFE_INTEGER, status = 200;
  const range = request.headers.get('Range');
  const rm = range && range.match(/bytes=(\d+)-(\d*)/);
  if (rm && haveSizes) {
    start = parseInt(rm[1], 10);
    end = rm[2] ? Math.min(parseInt(rm[2], 10), total - 1) : total - 1;
    if (start > end || start >= total) {
      return new Response('range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    }
    status = 206;
  }

  const pds = await resolvePdsServer(did);
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let pos = 0;
        for (let i = 0; i < chunks.length; i++) {
          const cStart = pos, cEnd = pos + sizes[i];
          pos = cEnd;
          if (haveSizes && (cEnd <= start || cStart > end)) continue; // outside range
          const bytes = await getBlobServer(pds, did, blobCid(chunks[i]));
          const from = haveSizes ? Math.max(0, start - cStart) : 0;
          const to = haveSizes ? Math.min(bytes.length, end - cStart + 1) : bytes.length;
          controller.enqueue(bytes.subarray(from, to));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  const headers = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
  };
  if (haveSizes) headers['Content-Length'] = String(end - start + 1);
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
  return new Response(stream, { status, headers });
}

// --- server-side ATProto reads (public, unauthenticated) ---------------------
const _pdsCacheServer = new Map();
function parseAtUri(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) throw new Error('bad at-uri');
  return { did: m[1], collection: m[2], rkey: m[3] };
}
async function resolvePdsServer(did) {
  if (_pdsCacheServer.has(did)) return _pdsCacheServer.get(did);
  let doc;
  if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replace(/:/g, '/');
    doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
  } else {
    doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
  }
  const svc = (doc.service || []).find((s) => /#atproto_pds$/.test(s.id) || s.id === '#atproto_pds');
  if (!svc) throw new Error('no PDS in DID doc');
  const ep = svc.serviceEndpoint.replace(/\/$/, '');
  _pdsCacheServer.set(did, ep);
  return ep;
}
async function getRecordServer(uri) {
  const { did, collection, rkey } = parseAtUri(uri);
  const pds = await resolvePdsServer(did);
  const q = new URLSearchParams({ repo: did, collection, rkey });
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${q}`);
  if (!res.ok) throw new Error('getRecord HTTP ' + res.status);
  return res.json();
}
async function getBlobServer(pds, did, cid) {
  const q = new URLSearchParams({ did, cid });
  const res = await fetch(`${pds}/xrpc/com.atproto.sync.getBlob?${q}`);
  if (!res.ok) throw new Error('getBlob HTTP ' + res.status);
  return new Uint8Array(await res.arrayBuffer());
}
function blobCid(ref) { return ref && ref.ref && (ref.ref.$link || ref.ref['$link']); }

// --- RoomCoordinator Durable Object -----------------------------------------
//
// One instance per roomId. Holds the live peer set in memory (a room only
// matters while occupied; an eviction simply forces reconnects). It NEVER sees
// audio — only JSON control messages.
//
// Client → server messages:
//   join          { identity:{did,handle,displayName}, asHost }
//   sdp-offer     { targetDid, sdp }
//   sdp-answer    { targetDid, sdp }
//   ice           { targetDid, candidate }
//   time-sync     { t0 }                         → time-sync-reply
//   arm-recording {}                  (host)     → server stamps epoch, broadcasts recording-armed
//   session-started { sessionUri }    (host)     → broadcast so guests know which session to stamp
//   stop-recording  {}                (host)     → broadcast recording-stopped
//   track-ready   { trackUri, durationMs, localStartOffsetMs }  → broadcast (host assembles manifest)
//
// Server → client messages:
//   welcome        { selfDid, roomId, peers[], recording:{armed,epochMs,sessionUri,hostDid} }
//   peer-joined    { peer }
//   peer-left      { did }
//   sdp-offer/-answer { fromDid, sdp }
//   ice            { fromDid, candidate }
//   time-sync-reply{ t0, tServer }
//   recording-armed{ epochMs, hostDid }
//   session-started{ sessionUri }
//   recording-stopped {}
//   track-ready    { did, trackUri, durationMs, localStartOffsetMs }
//   error          { message }

export class RoomCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.peers = new Map(); // did → { ws, identity, role }
    this.didOf = new WeakMap(); // ws → did
    this.hostDid = null;
    this.recording = { armed: false, epochMs: 0, sessionUri: null, hostDid: null };
    this.roomId = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9_-]{1,64})(\/ws)?$/);
    this.roomId = m ? m[1] : this.roomId;

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this._wire(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Info endpoint (read-only, unauthenticated).
    return json({
      roomId: this.roomId,
      count: this.peers.size,
      recording: { armed: this.recording.armed, epochMs: this.recording.epochMs },
      peers: [...this.peers.values()].map((p) => ({
        did: p.identity.did,
        handle: p.identity.handle,
        role: p.role,
      })),
    });
  }

  _wire(ws) {
    ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      try {
        this._onMessage(ws, msg);
      } catch (e) {
        this._send(ws, { type: 'error', message: String(e && e.message || e) });
      }
    });
    const drop = () => this._onClose(ws);
    ws.addEventListener('close', drop);
    ws.addEventListener('error', drop);
  }

  _onMessage(ws, msg) {
    switch (msg.type) {
      case 'join':
        return this._onJoin(ws, msg);
      case 'time-sync':
        return this._send(ws, { type: 'time-sync-reply', t0: msg.t0, tServer: Date.now() });
      case 'sdp-offer':
      case 'sdp-answer':
        return this._relay(ws, msg.targetDid, { type: msg.type, fromDid: this.didOf.get(ws), sdp: msg.sdp });
      case 'ice':
        return this._relay(ws, msg.targetDid, { type: 'ice', fromDid: this.didOf.get(ws), candidate: msg.candidate });
      case 'arm-recording':
        return this._onArm(ws);
      case 'session-started':
        if (this.didOf.get(ws) !== this.hostDid) return;
        this.recording.sessionUri = msg.sessionUri;
        return this._broadcast({ type: 'session-started', sessionUri: msg.sessionUri });
      case 'stop-recording':
        if (this.didOf.get(ws) !== this.hostDid) return;
        this.recording.armed = false;
        return this._broadcast({ type: 'recording-stopped' });
      case 'track-ready':
        return this._broadcast({
          type: 'track-ready',
          did: this.didOf.get(ws),
          trackUri: msg.trackUri,
          durationMs: msg.durationMs,
          localStartOffsetMs: msg.localStartOffsetMs,
        });
      default:
        return;
    }
  }

  _onJoin(ws, msg) {
    const identity = msg.identity || {};
    if (!identity.did) {
      return this._send(ws, { type: 'error', message: 'join requires identity.did' });
    }
    // Re-join from the same DID replaces the old socket.
    const existing = this.peers.get(identity.did);
    if (existing && existing.ws !== ws) {
      try { existing.ws.close(1000, 'replaced'); } catch {}
    }
    let role = 'guest';
    if (msg.asHost && !this.hostDid) {
      this.hostDid = identity.did;
      role = 'host';
    } else if (identity.did === this.hostDid) {
      role = 'host';
    }
    this.didOf.set(ws, identity.did);
    this.peers.set(identity.did, { ws, identity, role });

    this._send(ws, {
      type: 'welcome',
      selfDid: identity.did,
      roomId: this.roomId,
      recording: this.recording,
      peers: [...this.peers.values()]
        .filter((p) => p.identity.did !== identity.did)
        .map((p) => ({ did: p.identity.did, handle: p.identity.handle, displayName: p.identity.displayName, role: p.role })),
    });
    this._broadcast(
      { type: 'peer-joined', peer: { did: identity.did, handle: identity.handle, displayName: identity.displayName, role } },
      identity.did
    );
  }

  _onArm(ws) {
    if (this.didOf.get(ws) !== this.hostDid) {
      return this._send(ws, { type: 'error', message: 'only the host can arm recording' });
    }
    this.recording = {
      armed: true,
      epochMs: Date.now(),
      sessionUri: null,
      hostDid: this.hostDid,
    };
    this._broadcast({ type: 'recording-armed', epochMs: this.recording.epochMs, hostDid: this.hostDid });
  }

  _onClose(ws) {
    const did = this.didOf.get(ws);
    if (!did) return;
    const p = this.peers.get(did);
    if (p && p.ws !== ws) return; // a newer socket already replaced this one
    this.peers.delete(did);
    if (did === this.hostDid) this.hostDid = null;
    this._broadcast({ type: 'peer-left', did });
  }

  _relay(ws, targetDid, payload) {
    const target = this.peers.get(targetDid);
    if (target) this._send(target.ws, payload);
  }

  _broadcast(payload, exceptDid) {
    for (const [did, p] of this.peers) {
      if (did === exceptDid) continue;
      this._send(p.ws, payload);
    }
  }

  _send(ws, payload) {
    try { ws.send(JSON.stringify(payload)); } catch {}
  }
}
