// pod.mino.mobi — podcast studio + feed worker.
//
// Surfaces:
//   /            landing + episode listing (static index.html)
//   /room/       live recording lobby (WebRTC mesh + dual local recording)
//   /prod/       multitrack alignment verifier / editor
//   /feed.xml    iTunes-compatible RSS of published episodes
//   /api/*       JSON + WebSocket endpoints
//
// The room coordinator (RoomCoordinator Durable Object) is a thin signaling
// relay: it relays WebRTC offer/answer/ICE for the live monitoring mesh, stamps
// a shared RECORDING EPOCH when the host arms recording, and answers NTP-style
// time-sync pings so each client can estimate its clock skew. No audio ever
// touches the server — each browser records its own mic locally and uploads
// chunked atproto blobs straight to its own PDS.
//
// Storage model: chunked atproto blobs (see pod/README.md). Published episodes
// are `com.minomobi.podcast.episode` records cached in D1 (`pod_episodes`).

const SITE = {
  title: 'minomobi — Podcast Studio',
  link: 'https://pod.mino.mobi',
  description:
    'Record conversations in the browser, edit them down, publish a podcast — built on ATProto.',
  language: 'en-us',
  author: 'minomobi',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/health' || pathname === '/api/health') {
      return json({ ok: true, surface: 'pod', ts: Date.now() });
    }
    if (pathname === '/feed.xml' || pathname === '/feed' || pathname === '/rss') {
      return feedXml(env);
    }
    if (pathname === '/api/episodes') {
      return json({ items: await listEpisodes(env) });
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

// --- RSS / episodes ----------------------------------------------------------

async function listEpisodes(env) {
  // Guarded: `pod_episodes` arrives in a later migration. Until then the feed is
  // valid but empty, so the surface deploys before the schema lands.
  try {
    const rows = await env.DB.prepare(
      `SELECT guid, title, description, audio_url, mime, length_bytes,
              duration_sec, pub_date, episode_number, season_number
         FROM pod_episodes
        ORDER BY pub_date DESC
        LIMIT 200`
    ).all();
    return rows.results || [];
  } catch (_) {
    return [];
  }
}

async function feedXml(env) {
  const items = (await listEpisodes(env)).map(itemXml).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE.title)}</title>
    <link>${esc(SITE.link)}</link>
    <description>${esc(SITE.description)}</description>
    <language>${esc(SITE.language)}</language>
    <atom:link href="${esc(SITE.link)}/feed.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>${esc(SITE.author)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
${items}
  </channel>
</rss>`;
  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}

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
