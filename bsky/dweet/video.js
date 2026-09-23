/**
 * Posting a dweet to Bluesky as a MOVING picture.
 *
 * `share.js` explains at length why a GIF cannot be one: the image CDN
 * transcodes every blob, and motion in the Bluesky app is an external-embed
 * player on a host allowlist. This file is the thing that actually works, and
 * the detail that makes it worth building is one field in the lexicon:
 *
 *     app.bsky.embed.video.presentation  knownValues: ["default", "gif"]
 *
 * `presentation: "gif"` is a hint the official client honours — it is branched
 * on in `social-app/src/components/Post/Embed/VideoEmbed/index.tsx`, which
 * swaps in `GifPresentationControls`. So a two-second clip posted this way
 * autoplays and loops in the feed with no scrubber: a dweet, moving, in
 * somebody's timeline.
 *
 * ─── why this needs no worker change, measured 2026-09-22 ──────────────────
 *
 *   video.bsky.app  OPTIONS  ->  204, `access-control-allow-origin: *`,
 *                                allow-headers `authorization,content-type`,
 *                                allow-methods including POST
 *   getUploadLimits unauthed ->  401 {"canUpload":false,"error":"missing_token"}
 *   uploadVideo     unauthed ->  401 {"error":"missing token"}
 *
 * So the browser talks to the video service DIRECTLY — no relay, and this
 * surface's worker never sees the bytes or the credential. The credential is
 * the reader's own: `com.atproto.server.getServiceAuth` on their PDS mints a
 * short-lived JWT with `aud: did:web:video.bsky.app` and
 * `lxm: com.atproto.repo.uploadBlob`, which is exactly what the official
 * client asks for (`social-app/src/lib/media/video/multipart/upload.ts`).
 * That route is already on the auth worker's `/pds/*` allowlist with
 * `repoScoped: false`, and `rpc:com.atproto.server.getServiceAuth` is already
 * in `RPC_SCOPES` and therefore in the live ceiling. Nothing to deploy.
 *
 * ─── ffmpeg ────────────────────────────────────────────────────────────────
 *
 * It is not the tool here, and not because of snobbery: ffmpeg in a browser
 * means ffmpeg.wasm, which is ~25 MB of download before a single frame is
 * encoded, on a page whose whole premise is that the artwork is 256 bytes.
 * The browser already ships an encoder — usually a hardware one — and
 * `MediaRecorder` is the two-line way to reach it.
 *
 * WebCodecs `VideoEncoder` is the other route and is better in one way
 * (faster than real time, because it is not paced by a stream). It is worse in
 * two: it emits raw H.264 chunks with no container, so it needs an MP4 muxer
 * we would have to write and keep correct, and it is absent in more browsers.
 * MediaRecorder hands back a finished, valid MP4 that the platform guarantees.
 * If the pacing ever becomes the complaint, WebCodecs plus a muxer is the
 * upgrade — not ffmpeg.
 */

export const VIDEO_SERVICE = 'https://video.bsky.app';
export const VIDEO_SERVICE_DID = 'did:web:video.bsky.app';

/** What the service-auth token is bound to. Anything else and the PDS mints a
 *  token the video service will refuse. */
export const UPLOAD_LXM = 'com.atproto.repo.uploadBlob';

/**
 * Accepted recording types, in order of preference.
 *
 * **Every entry names its codec explicitly, and that is load-bearing.** A bare
 * `'video/mp4'` passes `isTypeSupported` on builds that have no H.264 encoder
 * at all and then produces VP9-in-MP4 — measured: Chromium 1194 answers
 * `isTypeSupported('video/mp4') === true` while
 * `isTypeSupported('video/mp4;codecs=avc1') === false`, and the file it writes
 * carries `ftyp isom` with a `vp09` sample entry. That file is an mp4 by
 * extension and by mime type, and `app.bsky.embed.video` declares
 * `accept: ["video/mp4"]` — so it would sail past every check we could make
 * and land on a transcoder expecting H.264.
 *
 * Asking for the codec by name is the only way to know what came back.
 */
export const MP4_TYPES = Object.freeze([
  'video/mp4;codecs=avc1.42001f',   // Baseline 3.1 — the most widely decodable
  'video/mp4;codecs=avc1.4d401f',   // Main 3.1
  'video/mp4;codecs=avc1.42E01E',   // Baseline 3.0
]);

/** Bluesky's own limits, from social-app/src/lib/constants.ts. */
export const MAX_BYTES = 300_000_000;
export const MAX_DURATION_MS = 10 * 60 * 1000;

/**
 * Which recording type to use.
 *
 * Returns `{type, certain}`. `certain` is the interesting half:
 *
 *   • an explicit `avc1` string the browser accepted → certain, use it.
 *   • only the bare `video/mp4` accepted → **not** certain. That is the trap
 *     above; it may still be H.264, and on Safari quite possibly is, but the
 *     probe has not told us. Record it and CHECK THE OUTPUT.
 *   • nothing → null.
 *
 * Treating the bare type as an outright no would be the safe-looking choice
 * and is wrong in the direction that matters: if a browser accepts only the
 * short form it is very likely a Safari, which is most of this surface's
 * traffic, and telling it "no H.264 encoder" would be a false negative it
 * could do nothing about. Better to try and then verify what came back.
 *
 * @param {(type: string) => boolean} isSupported  injected, so this is testable
 *   without a browser and so the bare-'video/mp4' trap can be asserted.
 * @returns {{type: string, certain: boolean}|null}
 */
export function pickMimeType(isSupported) {
  const probe = (t) => { try { return !!isSupported(t); } catch { return false; } };
  for (const t of MP4_TYPES) if (probe(t)) return { type: t, certain: true };
  if (probe('video/mp4')) return { type: 'video/mp4', certain: false };
  return null;
}

/** Feature detection for the page. @returns {{type,certain}|null} */
export function mp4Support() {
  if (typeof MediaRecorder === 'undefined') return null;
  return pickMimeType((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * The codec actually inside an MP4, read from its box tree.
 *
 * This exists because `isTypeSupported` is not a promise about the output.
 * Measured in Chromium 1194: it answers true for `video/mp4`, false for
 * `video/mp4;codecs=avc1`, and then writes `ftyp isom` with a **`vp09`**
 * sample entry. Nothing downstream would catch that — the file is an mp4 by
 * extension, by mime type, and by `app.bsky.embed.video`'s own `accept` list —
 * until a transcoder expecting H.264 got it.
 *
 * So the container is opened and asked. The path is
 * `moov > trak > mdia > minf > stbl > stsd > <sample entry>`, and the sample
 * entry's type IS the codec: `avc1` / `avc3` for H.264, `vp09`, `av01`,
 * `hvc1`/`hev1` for the others.
 *
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {string|null} the fourcc, or null if the tree cannot be read
 */
export function mp4Codec(data) {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const fourcc = (at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

  // Containers on the path to stsd. Everything else is skipped wholesale,
  // which is what keeps this a walk rather than a scan for magic bytes.
  const NEST = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

  const walk = (start, end, depth) => {
    let at = start;
    // 64 levels is far past anything legal; it is here so a malformed file
    // cannot spin this forever.
    if (depth > 64) return null;
    while (at + 8 <= end) {
      let size = dv.getUint32(at);
      const type = fourcc(at + 4);
      let header = 8;
      if (size === 1) {                       // 64-bit extended size
        if (at + 16 > end) return null;
        const hi = dv.getUint32(at + 8), lo = dv.getUint32(at + 12);
        size = hi * 4294967296 + lo;
        header = 16;
      } else if (size === 0) {
        size = end - at;                      // "to end of file"
      }
      if (size < header || at + size > end) return null;

      if (type === 'stsd') {
        // stsd: 4 bytes version/flags, 4 bytes entry count, then entries —
        // each of which is itself a sized box whose TYPE is the codec.
        const first = at + header + 8;
        if (first + 8 > end) return null;
        return fourcc(first + 4);
      }
      if (NEST.has(type)) {
        const found = walk(at + header, at + size, depth + 1);
        if (found) return found;
      }
      at += size;
    }
    return null;
  };
  try { return walk(0, b.length, 0); } catch { return null; }
}

/** Is this fourcc H.264? */
export function isH264(fourcc) {
  return fourcc === 'avc1' || fourcc === 'avc3';
}

// ── the job state machine ─────────────────────────────────────────

/**
 * Read one `app.bsky.video.defs#jobStatus`.
 *
 * The lexicon is explicit and easy to get backwards: *"All values not listed
 * as a known value indicate that the job is in process."* So an unrecognised
 * state means KEEP WAITING, not "something went wrong" — treating it as a
 * failure would abandon perfectly good uploads the day Bluesky adds a stage.
 *
 * @returns {{done: boolean, ok: boolean, blob: object|null, progress: number,
 *            state: string, error: string|null}}
 */
export function jobOutcome(jobStatus) {
  const state = String(jobStatus?.state || '');
  const progress = Number.isFinite(jobStatus?.progress) ? jobStatus.progress : 0;
  if (state === 'JOB_STATE_COMPLETED') {
    const blob = jobStatus?.blob || null;
    return blob
      ? { done: true, ok: true, blob, progress: 100, state, error: null }
      // Completed with no blob is not success — it is a result we cannot post,
      // and saying so beats writing a record with an undefined video.
      : { done: true, ok: false, blob: null, progress: 100, state,
          error: 'the video service finished but returned no blob' };
  }
  if (state === 'JOB_STATE_FAILED') {
    return { done: true, ok: false, blob: null, progress, state,
             error: jobStatus?.error || jobStatus?.message || 'the video service rejected it' };
  }
  return { done: false, ok: false, blob: null, progress, state: state || 'JOB_STATE_UNKNOWN', error: null };
}

/** Something a person can read, for each stage of a ~30s wait. */
export function jobLabel(state) {
  return {
    JOB_STATE_CREATED: 'queued',
    JOB_STATE_ENCODING: 'encoding',
    JOB_STATE_ENCODED: 'encoded',
    JOB_STATE_SCANNING: 'scanning',
    JOB_STATE_SCANNED: 'scanned',
    JOB_STATE_UPLOADING: 'storing',
    JOB_STATE_UPLOADED: 'stored',
    JOB_STATE_COMPLETED: 'done',
    JOB_STATE_FAILED: 'failed',
  }[state] || 'processing';
}

// ── the record ────────────────────────────────────────────────────

/**
 * `app.bsky.embed.video`, presented as a GIF.
 *
 * `aspectRatio` matters for the same reason it does on a picture: every client
 * lays the embed out from it before a byte of media arrives, so a wrong one
 * makes the feed jump under the reader's thumb as the post loads.
 */
export function videoEmbed({ blob, width, height, alt, presentation = 'gif' }) {
  if (!blob) throw new Error('no video blob');
  const embed = {
    $type: 'app.bsky.embed.video',
    video: blob,
    aspectRatio: { width, height },
  };
  if (alt) embed.alt = alt;
  // Only 'default' and 'gif' are known values. Anything else is a hint no
  // client understands, which renders as the default anyway — so send nothing
  // rather than something meaningless.
  if (presentation === 'gif' || presentation === 'default') embed.presentation = presentation;
  return embed;
}

// ── recording ─────────────────────────────────────────────────────

/**
 * RGBA frames → an MP4, through the browser's own encoder.
 *
 * Deterministic by construction: `captureStream(0)` produces a track that
 * emits a frame only when `requestFrame()` is called, so the clip contains
 * exactly the frames handed to it, in order, however busy the machine is. A
 * stream left to free-run would drop or duplicate frames under load and the
 * same dweet would export differently on two devices.
 *
 * It is still paced in REAL TIME — MediaRecorder timestamps a frame by when it
 * arrives — so a two-second clip takes two seconds to record. That is the
 * honest cost of using the platform encoder instead of shipping a muxer.
 *
 * @param {object} o
 * @param {ArrayLike<number>[]} o.frames  RGBA, width*height*4 each
 * @returns {Promise<{blob: Blob, mimeType: string, width: number, height: number, ms: number}>}
 */
export function recordMp4({ frames, width, height, fps, mimeType, onProgress, bitsPerSecond = 3_000_000 }) {
  return new Promise((resolve, reject) => {
    if (!frames?.length) return reject(new Error('no frames to record'));
    const picked = typeof mimeType === 'string'
      ? { type: mimeType, certain: mimeType.includes('codecs=') }
      : (mimeType || mp4Support());
    if (!picked) {
      return reject(new Error('this browser cannot record MP4 — make a GIF instead'));
    }
    const type = picked.type;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    let stream;
    try { stream = canvas.captureStream(0); }
    catch (err) { return reject(new Error(`captureStream unavailable: ${err.message}`)); }
    const track = stream.getVideoTracks()[0];
    if (!track) return reject(new Error('the canvas produced no video track'));

    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitsPerSecond }); }
    catch (err) { return reject(new Error(`recorder refused ${type}: ${err.message}`)); }

    const chunks = [];
    let settled = false;
    const fail = (err) => { if (!settled) { settled = true; try { rec.stop(); } catch { /* gone */ } reject(err); } };

    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onerror = (e) => fail(new Error(`recording failed: ${e?.error?.message || 'unknown'}`));
    rec.onstop = async () => {
      if (settled) return;
      settled = true;
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      if (!blob.size) return reject(new Error('the recorder produced no data'));

      // ASK THE FILE, do not trust the probe. This is the whole reason
      // mp4Codec exists: a browser that accepted only the bare `video/mp4`
      // may have written VP9 or AV1 inside it, and that file is an mp4 by
      // every check anything downstream makes.
      let codec = null;
      try { codec = mp4Codec(await blob.arrayBuffer()); } catch { /* unreadable */ }
      if (codec && !isH264(codec)) {
        return reject(new Error(
          `this browser encoded ${codec}, not H.264 — Bluesky needs H.264, so `
          + 'make a GIF instead'));
      }
      // An unreadable box tree is not proof of anything either way. Say so
      // rather than either blocking a good file or promising a bad one.
      resolve({ blob, mimeType: type, codec, verified: isH264(codec),
                width, height, ms: (frames.length / fps) * 1000 });
    };

    const step = 1000 / fps;
    let i = 0;
    const pump = () => {
      if (settled) return;
      if (i >= frames.length) {
        // One frame's worth of grace, or the last frame has zero duration and
        // some players show a clip one frame shorter than it is.
        setTimeout(() => { try { rec.stop(); } catch (err) { fail(err); } }, step);
        return;
      }
      try {
        ctx.putImageData(new ImageData(frames[i], width, height), 0, 0);
        track.requestFrame();
      } catch (err) { return fail(err); }
      onProgress?.(++i, frames.length);
      setTimeout(pump, step);
    };

    try { rec.start(); } catch (err) { return fail(err); }
    pump();
  });
}

// ── the service ───────────────────────────────────────────────────

/**
 * Ask whether this account may upload at all, BEFORE spending anything.
 *
 * Bluesky rate-limits video by count and by bytes per day. Finding that out
 * after a two-second recording and a thirty-second transcode is the worst
 * possible moment — the same reason the shuffle composer checks its blob scope
 * while nothing is at stake.
 */
export async function uploadLimits({ token, fetchImpl = fetch }) {
  const res = await fetchImpl(`${VIDEO_SERVICE}/xrpc/app.bsky.video.getUploadLimits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!body) throw new Error(`the video service gave no answer (${res.status})`);
  return body;
}

/**
 * POST the mp4. The response is a JOB, not a blob — encoding happens after.
 *
 * `did` and `name` are query parameters, not headers or a body field; the
 * endpoint takes the file as the raw request body with `Content-Type:
 * video/mp4`.
 */
export async function uploadVideo({ data, did, name, token, fetchImpl = fetch, signal }) {
  const params = new URLSearchParams({ did, name });
  const res = await fetchImpl(`${VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4' },
    body: data,
    signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // A 409 here means this exact video is already being processed, and its
    // job status is the useful thing to return rather than an error.
    const known = body?.jobStatus || (body?.jobId ? body : null);
    if (known?.jobId) return known;
    throw new Error(body?.message || body?.error || `upload refused (${res.status})`);
  }
  const job = body?.jobStatus || body;
  if (!job?.jobId) throw new Error('the video service returned no job');
  return job;
}

/**
 * Poll until the job settles.
 *
 * `fetchImpl` and `sleep` are injected so the whole state machine — including
 * failure, an unknown intermediate state, and the timeout — runs in node
 * against a scripted sequence. This is code whose real failure modes take
 * thirty seconds and somebody's daily quota to reproduce.
 */
export async function awaitJob({
  jobId, token, onState, fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  intervalMs = 1500, timeoutMs = 180_000, now = () => Date.now(),
}) {
  const started = now();
  for (;;) {
    const res = await fetchImpl(
      `${VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`,
      { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => null);
    const out = jobOutcome(body?.jobStatus || body);
    onState?.(out);
    if (out.done) {
      if (!out.ok) throw new Error(out.error);
      return out.blob;
    }
    if (now() - started > timeoutMs) {
      throw new Error(`the video service is still ${jobLabel(out.state)} after `
        + `${Math.round(timeoutMs / 1000)}s — it may still finish, but nothing was posted`);
    }
    await sleep(intervalMs);
  }
}
