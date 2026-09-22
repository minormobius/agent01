/**
 * video.js — the parts that can be wrong without anything throwing.
 *
 * Three of them, and the first is the one that would have shipped:
 *
 *  1. CODEC SELECTION. `MediaRecorder.isTypeSupported('video/mp4')` answers
 *     true on builds with no H.264 encoder at all, and the file they then
 *     write is VP9 in an mp4 container. Measured in Chromium 1194: bare
 *     `video/mp4` true, `video/mp4;codecs=avc1` false, output `ftyp isom` with
 *     a `vp09` sample entry. That file is an mp4 by extension, by mime type
 *     and by `app.bsky.embed.video`'s own `accept` list — so nothing downstream
 *     would catch it before a transcoder expecting H.264 did.
 *
 *  2. THE JOB STATE MACHINE. The lexicon says "All values not listed as a
 *     known value indicate that the job is in process", so an unrecognised
 *     state means WAIT. Reading it as a failure abandons good uploads the day
 *     Bluesky adds a stage.
 *
 *  3. THE EMBED. `presentation: 'gif'` is the whole point of the feature; a
 *     typo there is a post that looks fine and does not loop.
 *
 * Everything here runs in node against injected fetch/sleep, because the real
 * failure modes cost thirty seconds and a slice of somebody's daily video
 * quota to reproduce.
 *
 *   node bsky/dweet/video.selftest.mjs
 */
import {
  pickMimeType, jobOutcome, jobLabel, videoEmbed, awaitJob, uploadVideo, uploadLimits,
  mp4Codec, isH264,
  MP4_TYPES, VIDEO_SERVICE, VIDEO_SERVICE_DID, UPLOAD_LXM, MAX_BYTES,
} from './video.js';

/** Build a minimal MP4 box tree with a given sample-entry fourcc. */
function fakeMp4(codec, { extendedSize = false } = {}) {
  const enc = new TextEncoder();
  const box = (type, payload) => {
    const size = 8 + payload.length;
    const out = new Uint8Array(size);
    new DataView(out.buffer).setUint32(0, size);
    out.set(enc.encode(type), 4);
    out.set(payload, 8);
    return out;
  };
  const cat = (...parts) => {
    const n = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(n);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };
  // A sample entry is itself a sized box whose TYPE is the codec.
  const entry = box(codec, new Uint8Array(78));
  const stsdPayload = cat(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]), entry);
  let stsd = box('stsd', stsdPayload);
  if (extendedSize) {
    // size==1 means "the real size is in the next 8 bytes".
    const out = new Uint8Array(stsd.length + 8);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 1);
    out.set(enc.encode('stsd'), 4);
    dv.setUint32(8, 0);
    dv.setUint32(12, stsd.length + 8);
    out.set(stsdPayload, 16);
    stsd = out;
  }
  return cat(
    box('ftyp', enc.encode('isom\0\0\0\0isomiso2')),
    box('moov', box('trak', box('mdia', box('minf', box('stbl', stsd))))),
    box('mdat', new Uint8Array(32)),
  );
}

let pass = 0;
const fails = [];
const ok = (what, cond, detail) => {
  if (cond) { pass++; return; }
  fails.push(detail ? `${what} — ${detail}` : what);
};
const eq = (what, got, want) =>
  ok(what, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── 1. codec selection ───────────────────────────────────────────
{
  // Exactly what Chromium 1194 reports: bare yes, explicit no.
  const bareOnly = pickMimeType((t) => t === 'video/mp4');
  eq('bare-mp4-only is accepted…', bareOnly.type, 'video/mp4');
  eq('…but explicitly NOT certain — the output must be checked', bareOnly.certain, false);

  const realChrome = pickMimeType((t) => t.startsWith('video/mp4;codecs=avc1'));
  eq('a browser with H.264 gets an EXPLICIT codec string', realChrome.type, MP4_TYPES[0]);
  eq('…and that one is certain', realChrome.certain, true);

  eq('preference order is honoured',
    pickMimeType((t) => t === MP4_TYPES[1]).type, MP4_TYPES[1]);
  eq('nothing supported', pickMimeType(() => false), null);
  eq('a probe that throws counts as unsupported',
    pickMimeType(() => { throw new Error('nope'); }), null);
  // An explicit avc1 must win over the bare type even when both are accepted,
  // or we would take the unverifiable option for no reason.
  eq('explicit beats bare when both pass', pickMimeType(() => true).certain, true);

  ok('no candidate is a bare container type',
    MP4_TYPES.every((t) => t.includes('codecs=')), MP4_TYPES.join(' '));
  ok('every candidate is H.264', MP4_TYPES.every((t) => t.includes('avc1')));
  // WebM would be rejected by the service and is not an mp4 whatever we call it.
  ok('no webm candidates', MP4_TYPES.every((t) => !t.includes('webm')));
}

// ── 1b. reading the codec out of the file ───────────────────────
{
  // The whole reason this function exists: a browser that accepted only the
  // bare type can still write VP9, and nothing else downstream would notice.
  eq('mp4Codec: finds avc1', mp4Codec(fakeMp4('avc1')), 'avc1');
  eq('mp4Codec: finds vp09 — the measured Chromium case', mp4Codec(fakeMp4('vp09')), 'vp09');
  eq('mp4Codec: finds av01', mp4Codec(fakeMp4('av01')), 'av01');
  eq('mp4Codec: finds hvc1', mp4Codec(fakeMp4('hvc1')), 'hvc1');
  eq('mp4Codec: walks a 64-bit size field', mp4Codec(fakeMp4('avc1', { extendedSize: true })), 'avc1');

  ok('isH264: avc1 and avc3 are H.264', isH264('avc1') && isH264('avc3'));
  ok('isH264: nothing else is', !isH264('vp09') && !isH264('av01') && !isH264('hvc1') && !isH264(null));

  // Unreadable input must be null, never a guess and never a throw — a
  // half-read container is exactly how you end up trusting the wrong codec.
  eq('mp4Codec: empty', mp4Codec(new Uint8Array(0)), null);
  eq('mp4Codec: not an mp4', mp4Codec(new TextEncoder().encode('GIF89a...........')), null);
  const truncated = fakeMp4('avc1').slice(0, 30);
  eq('mp4Codec: truncated mid-tree', mp4Codec(truncated), null);
  // A box claiming a size larger than the file must not be followed.
  const lying = fakeMp4('avc1');
  new DataView(lying.buffer).setUint32(0, 0x7fffffff);
  eq('mp4Codec: a box lying about its size is refused', mp4Codec(lying), null);
  // A zero size means "to end of file" and must not loop forever.
  const zero = fakeMp4('avc1');
  new DataView(zero.buffer).setUint32(0, 0);
  ok('mp4Codec: a zero-size box terminates', mp4Codec(zero) === null || typeof mp4Codec(zero) === 'string');
  eq('mp4Codec: an ArrayBuffer works too', mp4Codec(fakeMp4('avc1').buffer), 'avc1');
}

// ── 2. the job state machine ─────────────────────────────────────
{
  const blob = { $type: 'blob', ref: { $link: 'bafkrei' }, mimeType: 'video/mp4', size: 12 };

  const done = jobOutcome({ state: 'JOB_STATE_COMPLETED', blob });
  ok('completed: done and ok', done.done && done.ok);
  eq('completed: hands back the blob', done.blob, blob);

  // Completed with no blob is NOT success: there is nothing to post.
  const empty = jobOutcome({ state: 'JOB_STATE_COMPLETED' });
  ok('completed with no blob is a failure, not an undefined embed',
    empty.done && !empty.ok, JSON.stringify(empty));

  const failed = jobOutcome({ state: 'JOB_STATE_FAILED', error: 'too_big' });
  ok('failed: done, not ok', failed.done && !failed.ok);
  eq('failed: carries the reason', failed.error, 'too_big');

  for (const s of ['JOB_STATE_CREATED', 'JOB_STATE_ENCODING', 'JOB_STATE_SCANNING',
                   'JOB_STATE_UPLOADING', 'JOB_STATE_SOMETHING_NEW_IN_2027']) {
    const o = jobOutcome({ state: s, progress: 40 });
    ok(`${s}: keeps waiting`, !o.done, JSON.stringify(o));
    eq(`${s}: progress carried`, o.progress, 40);
  }
  // The lexicon's rule, stated as a test: unknown means IN PROGRESS.
  ok('an unknown state is never reported as a failure',
    jobOutcome({ state: 'WHATEVER' }).error === null);
  ok('a missing status is treated as in-progress, not as a crash',
    jobOutcome(undefined).done === false);
  eq('an unknown state still gets a human label', jobLabel('WHATEVER'), 'processing');
  eq('a known state gets its own label', jobLabel('JOB_STATE_ENCODING'), 'encoding');
}

// ── 3. the embed ─────────────────────────────────────────────────
{
  const blob = { $type: 'blob', ref: { $link: 'bafkrei' } };
  const e = videoEmbed({ blob, width: 320, height: 180, alt: 'a dweet' });
  eq('embed: $type', e.$type, 'app.bsky.embed.video');
  eq('embed: presentation defaults to gif — the entire point', e.presentation, 'gif');
  eq('embed: alt carried', e.alt, 'a dweet');
  eq('embed: aspect ratio width', e.aspectRatio.width, 320);
  eq('embed: aspect ratio height', e.aspectRatio.height, 180);
  eq('embed: the blob goes in as a ref', e.video, blob);

  eq('embed: default presentation is allowed',
    videoEmbed({ blob, width: 1, height: 1, presentation: 'default' }).presentation, 'default');
  // A hint no client knows renders as the default anyway, so send nothing.
  ok('embed: an unknown presentation is omitted, not passed through',
    !('presentation' in videoEmbed({ blob, width: 1, height: 1, presentation: 'loop' })));
  ok('embed: no alt means no empty alt field',
    !('alt' in videoEmbed({ blob, width: 1, height: 1 })));

  let threw = '';
  try { videoEmbed({ width: 1, height: 1 }); } catch (err) { threw = err.message; }
  ok('embed: refuses to build without a blob', /no video blob/.test(threw), threw);
}

// ── 4. upload, against a scripted service ────────────────────────
{
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts?.method || 'GET', auth: opts?.headers?.Authorization,
                 ctype: opts?.headers?.['Content-Type'] });
    return { ok: true, status: 200, json: async () => ({ jobStatus: { jobId: 'j1', did: 'did:plc:me', state: 'JOB_STATE_CREATED' } }) };
  };
  const job = await uploadVideo({ data: new Uint8Array(8), did: 'did:plc:me', name: 'dweet.mp4', token: 'TKN', fetchImpl });
  eq('upload: returns the job', job.jobId, 'j1');
  const c = calls[0];
  ok('upload: goes to the video service', c.url.startsWith(`${VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo`), c.url);
  ok('upload: did and name are QUERY params', /[?&]did=did%3Aplc%3Ame/.test(c.url) && /[&]name=dweet\.mp4/.test(c.url), c.url);
  eq('upload: POST', c.method, 'POST');
  eq('upload: bearer token', c.auth, 'Bearer TKN');
  eq('upload: raw body, declared as mp4', c.ctype, 'video/mp4');

  // A 409 carrying a job is not an error — it is the job.
  const dup = await uploadVideo({ data: new Uint8Array(1), did: 'd', name: 'n', token: 't',
    fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ jobStatus: { jobId: 'existing', state: 'JOB_STATE_ENCODING' } }) }) });
  eq('upload: a duplicate returns the existing job rather than throwing', dup.jobId, 'existing');

  let threw = '';
  try {
    await uploadVideo({ data: new Uint8Array(1), did: 'd', name: 'n', token: 't',
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'missing token' }) }) });
  } catch (err) { threw = err.message; }
  ok('upload: a refusal surfaces the service\'s own words', /missing token/.test(threw), threw);

  threw = '';
  try {
    await uploadVideo({ data: new Uint8Array(1), did: 'd', name: 'n', token: 't',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  } catch (err) { threw = err.message; }
  ok('upload: a 200 with no job is still a failure', /no job/.test(threw), threw);
}

// ── 5. polling, including the cases that cost 30s each ───────────
{
  const script = (states) => {
    let i = 0;
    return async () => ({ ok: true, status: 200,
      json: async () => ({ jobStatus: states[Math.min(i++, states.length - 1)] }) });
  };
  const seen = [];
  const blob = { $type: 'blob', ref: { $link: 'bafkrei' } };

  const got = await awaitJob({
    jobId: 'j1', token: 't', sleep: async () => {},
    onState: (s) => seen.push(s.state),
    fetchImpl: script([
      { state: 'JOB_STATE_CREATED' },
      { state: 'JOB_STATE_ENCODING', progress: 50 },
      { state: 'JOB_STATE_A_NEW_STAGE' },        // unknown: must not abort
      { state: 'JOB_STATE_COMPLETED', blob },
    ]),
  });
  eq('poll: returns the blob', got, blob);
  eq('poll: walked every stage', seen.length, 4);
  ok('poll: an unknown stage did not abort the run', seen.includes('JOB_STATE_A_NEW_STAGE'));

  let threw = '';
  try {
    await awaitJob({ jobId: 'j', token: 't', sleep: async () => {},
      fetchImpl: script([{ state: 'JOB_STATE_FAILED', error: 'unsupported_codec' }]) });
  } catch (err) { threw = err.message; }
  ok('poll: a failed job throws its reason', /unsupported_codec/.test(threw), threw);

  // A job that never settles must end, and must say nothing was posted —
  // otherwise the share sheet spins forever with no end state, which is the
  // exact bug the AppView's video button had.
  threw = '';
  let clock = 0;
  try {
    await awaitJob({ jobId: 'j', token: 't', sleep: async () => { clock += 1500; },
      now: () => clock, timeoutMs: 9000,
      fetchImpl: script([{ state: 'JOB_STATE_ENCODING' }]) });
  } catch (err) { threw = err.message; }
  ok('poll: gives up eventually', /still encoding after 9s/.test(threw), threw);
  ok('poll: and says nothing was posted', /nothing was posted/.test(threw), threw);
}

// ── 6. limits are checked before anything is spent ───────────────
{
  const lim = await uploadLimits({ token: 't',
    fetchImpl: async (url, opts) => {
      ok('limits: bearer token sent', opts.headers.Authorization === 'Bearer t');
      ok('limits: correct endpoint', url.endsWith('/xrpc/app.bsky.video.getUploadLimits'), url);
      return { ok: true, status: 200, json: async () => ({ canUpload: true, remainingDailyVideos: 9 }) };
    } });
  eq('limits: parsed', lim.remainingDailyVideos, 9);

  // The real unauthenticated answer, measured: 401 with a BODY that explains.
  const denied = await uploadLimits({ token: 'bad',
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ canUpload: false, error: 'missing_token' }) }) });
  eq('limits: a 401 body is read rather than thrown away', denied.error, 'missing_token');
  eq('limits: and canUpload is honoured', denied.canUpload, false);
}

// ── 7. the constants nobody should edit casually ─────────────────
{
  eq('the service DID the token is minted for', VIDEO_SERVICE_DID, 'did:web:video.bsky.app');
  eq('the lxm the video service expects', UPLOAD_LXM, 'com.atproto.repo.uploadBlob');
  eq('the service host', VIDEO_SERVICE, 'https://video.bsky.app');
  eq('the published size ceiling', MAX_BYTES, 300_000_000);
}

if (fails.length) {
  console.error(`\nvideo.selftest: ${fails.length} FAILED, ${pass} passed\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`video.selftest: ${pass} assertions passed`);
