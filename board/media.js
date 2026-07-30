// board/media.js — everything between "a file arrived" and "an item exists".
//
// Blobs are the reason this app is worth building on ATProto rather than in
// localStorage: the picture you drop stays yours, on your PDS, at a URL anyone
// can read without going through us. That URL is `com.atproto.sync.getBlob` on
// the author's own PDS, which is public, cacheable and CORS-clean — so an
// <img src> is all a viewer needs, signed in or not.

const PLC = 'https://plc.directory';
const PUBLIC_API = 'https://public.api.bsky.app';
/** Bluesky's public link-card extractor. Best effort — a failure just means a
 *  bare link card with the hostname on it, which is still a usable object. */
const CARD_SERVICE = 'https://cardyb.bsky.app/v1/extract';

const pdsCache = new Map();
const handleCache = new Map();

// ------------------------------------------------------------ identity ----

/** Resolve a DID to its PDS host. Cached for the session. */
export async function resolvePds(did) {
  if (!did) return null;
  if (pdsCache.has(did)) return pdsCache.get(did);
  const p = (async () => {
    try {
      let doc;
      if (did.startsWith('did:web:')) {
        const host = decodeURIComponent(did.slice('did:web:'.length)).split(':')[0];
        doc = await fetch(`https://${host}/.well-known/did.json`).then((r) => r.json());
      } else {
        doc = await fetch(`${PLC}/${encodeURIComponent(did)}`).then((r) => r.json());
      }
      const svc = (doc?.service || []).find(
        (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer',
      );
      return svc?.serviceEndpoint?.replace(/\/$/, '') || null;
    } catch {
      return null;
    }
  })();
  pdsCache.set(did, p);
  return p;
}

/** handle → did. */
export async function resolveHandle(handle) {
  const h = String(handle || '').replace(/^@/, '').trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith('did:')) return h;
  if (handleCache.has(h)) return handleCache.get(h);
  const p = fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => j?.did || null)
    .catch(() => null);
  handleCache.set(h, p);
  return p;
}

/** did → handle, for breadcrumbs on someone else's board. */
export async function describeRepo(did) {
  try {
    const pds = await resolvePds(did);
    if (!pds) return null;
    const r = await fetch(`${pds}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`);
    if (!r.ok) return null;
    return (await r.json())?.handle || null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- blobs ----

export function blobCid(blob) {
  return blob?.ref?.$link || blob?.ref?.toString?.() || blob?.cid || null;
}

/**
 * A public URL for a blob. Resolves the owner's PDS once, then hands back a
 * plain getBlob URL the browser can cache like any other image.
 */
export async function blobUrl(did, blob) {
  const cid = blobCid(blob);
  if (!did || !cid) return null;
  const pds = await resolvePds(did);
  if (!pds) return null;
  return `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
}

// ---------------------------------------------------------- file intake ---

export const MAX_BLOB = 24 * 1024 * 1024;

/** Downscale a picture before upload. A whiteboard shows cards at a few hundred
 *  pixels; shipping a 12 MP phone photo to a PDS to render it at 320px wide is
 *  rude to everyone's quota. */
export async function shrinkImage(file, maxEdge = 2048, quality = 0.86) {
  if (!/^image\//.test(file.type) || /svg|gif/.test(file.type)) {
    return { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, width: 0, height: 0 };
  }
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, width: 0, height: 0 };
  const srcW = bmp.width;
  const srcH = bmp.height;
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  if (scale === 1 && file.size < 900 * 1024) {
    bmp.close?.();
    return { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, width: srcW, height: srcH };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const out = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  bmp.close?.();
  if (!out) return { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, width: w, height: h };
  return { data: new Uint8Array(await out.arrayBuffer()), mimeType: 'image/jpeg', width: w, height: h };
}

/** Amplitude envelope for a waveform, 0–100, so a voice note is legible on the
 *  canvas without decoding the audio. */
export async function audioPeaks(arrayBuffer, buckets = 64) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return { peaks: [], durationMs: 0 };
    const ctx = new Ctx();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const ch = decoded.getChannelData(0);
    const per = Math.max(1, Math.floor(ch.length / buckets));
    const peaks = [];
    let max = 0;
    for (let b = 0; b < buckets; b++) {
      let peak = 0;
      for (let i = b * per, end = Math.min(ch.length, (b + 1) * per); i < end; i++) {
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
      if (peak > max) max = peak;
    }
    ctx.close?.();
    const norm = peaks.map((p) => Math.round((max ? p / max : 0) * 100));
    return { peaks: norm, durationMs: Math.round(decoded.duration * 1000) };
  } catch {
    return { peaks: [], durationMs: 0 };
  }
}

/** Which item kind a dropped file becomes. */
export function kindForFile(file) {
  if (/^image\//.test(file.type)) return 'image';
  if (/^audio\//.test(file.type)) return 'audio';
  return 'file';
}

// ------------------------------------------------------ voice recording ---

/** Push-to-talk recorder around MediaRecorder. */
export class VoiceRecorder {
  constructor() {
    this.rec = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = 0;
  }

  static get supported() {
    return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      .find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
    this.rec.start(250);
    this.startedAt = Date.now();
  }

  get elapsedMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  /** Stop and hand back { data, mimeType, peaks, durationMs }. */
  async stop() {
    if (!this.rec) return null;
    const done = new Promise((res) => { this.rec.onstop = res; });
    this.rec.stop();
    await done;
    this.stream?.getTracks().forEach((t) => t.stop());
    const type = this.rec.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type });
    const buf = await blob.arrayBuffer();
    const { peaks, durationMs } = await audioPeaks(buf);
    this.rec = null;
    this.stream = null;
    return {
      data: new Uint8Array(buf),
      mimeType: type.split(';')[0],
      peaks,
      durationMs: durationMs || this.elapsedMs,
    };
  }

  cancel() {
    try { this.rec?.stop(); } catch { /* already stopped */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.rec = null;
    this.stream = null;
  }
}

// ----------------------------------------------------------- link cards ---

export function looksLikeUrl(text) {
  const t = String(text || '').trim();
  if (/\s/.test(t)) return false;
  return /^https?:\/\/[^\s]+$/i.test(t);
}

/** Title/description/thumb for a URL. Falls back to the hostname. */
export async function unfurl(url) {
  const fallback = { uri: url, title: hostOf(url), description: '' };
  try {
    const r = await fetch(`${CARD_SERVICE}?url=${encodeURIComponent(url)}`, { mode: 'cors' });
    if (!r.ok) return fallback;
    const j = await r.json();
    return {
      uri: j.url || url,
      title: (j.title || hostOf(url)).slice(0, 300),
      description: (j.description || '').slice(0, 600),
      imageUrl: j.image || null,
    };
  } catch {
    return fallback;
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** An `at://` uri that names a Bluesky post, if this URL is one. */
export function bskyPostUri(url) {
  const m = /^https?:\/\/(?:bsky\.app|bsky\.social)\/profile\/([^/]+)\/post\/([^/?#]+)/.exec(url || '');
  return m ? { actor: m[1], rkey: m[2] } : null;
}

/** Fetch a post so an embed card has something to say. */
export async function fetchPost(actor, rkey) {
  try {
    const did = await resolveHandle(actor);
    if (!did) return null;
    const pds = await resolvePds(did);
    if (!pds) return null;
    const params = new URLSearchParams({ repo: did, collection: 'app.bsky.feed.post', rkey });
    const r = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!r.ok) return null;
    const j = await r.json();
    return { uri: j.uri, cid: j.cid, text: j.value?.text || '', did, actor };
  } catch {
    return null;
  }
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
