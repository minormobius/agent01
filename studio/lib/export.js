// export.js — a piece as a video file, for the camera roll.
//
// A studio piece is a pure function of time and its music is a fixed
// performance, so it does not have to be RECORDED: it can be RENDERED, frame by
// frame, as fast as the machine allows, with no dropped frames and no drift
// between picture and sound. That is the fast path here: WebCodecs encodes
// H.264 video, and mediabunny (vendored, MPL-2.0) encodes AAC audio and writes
// the MP4. AAC goes through the browser's own encoder where there is one and
// through a WebAssembly build of FFmpeg's where there is not (Firefox, Safari).
// H.264 + AAC in MP4 is what a phone's photo library takes, and now every
// browser with an H.264 encoder can make it.
//
// Where WebCodecs cannot (no encoder, or no H.264), the piece is played in real
// time into a MediaRecorder instead. Slower, and the container is whatever the
// browser records (Safari: MP4; others may give WebM), but it always works.
//
// Getting it into Photos: the web cannot write to a photo library directly.
// It can hand a file to the system share sheet (Web Share, level 2), whose
// "Save Video" puts it there. Sharing needs a fresh tap, so the export ends by
// offering the button rather than opening the sheet itself.

import { instantiate, begin, DEFAULT_GAIN } from './pfsynth-core.js';

export const FORMATS = {
  vertical: { label: 'Vertical 9:16', w: 1080, h: 1920 },
  square: { label: 'Square 1:1', w: 1080, h: 1080 },
  wide: { label: 'Wide 16:9', w: 1920, h: 1080 },
};

const AUDIO_RATE = 48000;
const FPS = 30;

let mbPromise = null;
/**
 * mediabunny, with OUR AAC encoder (a WebAssembly build of FFmpeg's) registered
 * in every browser, even one with its own. Firefox and Safari have none, and
 * which native encoders emit what they claim is exactly what cost two silent
 * exports; one encoder everywhere is one path to test, and it is the path the
 * selftest decodes with FFmpeg. Loaded on first export only (1.7 MB).
 */
function mediabunny() {
  mbPromise ??= (async () => {
    const MB = await import('../vendor/mediabunny/mediabunny.min.mjs');
    const { registerAacEncoder } = await import('../vendor/mediabunny/mediabunny-aac-encoder.min.mjs');
    registerAacEncoder();
    return MB;
  })();
  return mbPromise;
}

const PHOTOS_MIMES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs="avc1,mp4a"'];
// Safari's MediaRecorder writes H.264 + AAC for a plain 'video/mp4'; Chrome's
// may write Opus into it. So the plain type counts only on Safari.
const isSafari = () => /^((?!chrome|chromium|crios|android|edg).)*safari/i.test(navigator.userAgent);

/**
 * How to make the file, best first. A camera roll wants H.264 + AAC in MP4:
 *
 *   offline  H.264 + AAC       fast; Photos takes it. Any browser with an H.264
 *                              encoder: the AAC is ours where the browser has none.
 *   realtime MediaRecorder MP4 as long as the piece (Safari writes AAC)
 *   offline  VP9/AV1 + AAC     fast; plays in browsers, NOT in Apple's players
 *   realtime whatever MediaRecorder can do
 *
 * History (2026-09-24): the first version needed the BROWSER's AAC encoder,
 * which Firefox and Safari do not have, so both fell through to Opus audio,
 * whose sound Apple's players silently drop. Their exports had no sound.
 */
export async function plan(w, h) {
  const wc = 'VideoEncoder' in window && 'VideoFrame' in window;
  const mr = window.MediaRecorder?.isTypeSupported ? window.MediaRecorder : null;
  let MB = null;
  if (wc) { try { MB = await mediabunny(); } catch { MB = null; } }
  const aac = MB && (await MB.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: AUDIO_RATE }));
  if (MB && aac && (await MB.canEncodeVideo('avc', { width: w, height: h }))) return { mode: 'offline', MB, video: 'avc', audio: 'aac' };
  const mp4 = mr && (PHOTOS_MIMES.find((m) => mr.isTypeSupported(m)) || (isSafari() && mr.isTypeSupported('video/mp4') ? 'video/mp4' : null));
  if (mp4) return { mode: 'realtime', mime: mp4 };
  if (MB) {
    for (const v of ['vp9', 'av1']) {
      if (!(await MB.canEncodeVideo(v, { width: w, height: h }))) continue;
      for (const a of ['aac', 'opus']) {
        if (await MB.canEncodeAudio(a, { numberOfChannels: 2, sampleRate: AUDIO_RATE })) return { mode: 'offline', MB, video: v, audio: a };
      }
    }
  }
  const any = mr && ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => mr.isTypeSupported(m));
  if (any) return { mode: 'realtime', mime: any };
  return null;
}

/**
 * What is actually in the file, read from the file: the codecs named by its
 * sample entries, and whether its sound is sound. `photos` is true only for
 * H.264 + AAC in MP4, the combination Apple's Photos is known to take.
 */
export async function inspect(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // The sample entries live in the moov box: at the head (fast start, and
  // MediaRecorder's fragmented files) or else at the tail. Scan both ends only.
  const W = 2 << 20;
  const ends = bytes.length <= 2 * W ? [bytes] : [bytes.subarray(0, W), bytes.subarray(bytes.length - W)];
  const has = (tag) => {
    const [a, b, c, d] = [...tag].map((ch) => ch.charCodeAt(0));
    for (const x of ends) for (let i = 0; i < x.length - 3; i++) if (x[i] === a && x[i + 1] === b && x[i + 2] === c && x[i + 3] === d) return true;
    return false;
  };
  const mp4 = has('ftyp');
  const video = mp4 ? (has('avc1') ? 'h264' : has('hvc1') ? 'hevc' : has('vp09') ? 'vp9' : has('av01') ? 'av1' : '?') : 'webm';
  const audio = mp4 ? (has('mp4a') ? 'aac' : has('Opus') || has('opus') ? 'opus' : 'none') : '?';
  let level = null;
  try {
    const ac = new OfflineAudioContext(1, 48000, 48000);
    const ab = await ac.decodeAudioData(bytes.buffer);   // detaches it: the scan is done
    const d = ab.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i += 7) sum += d[i] * d[i];
    level = 10 * Math.log10(sum / Math.ceil(d.length / 7) + 1e-12);
  } catch { /* this browser cannot decode its own file's audio: say nothing about level */ }
  const silent = audio === 'none' || (level !== null && level < -60);
  return { video, audio, level, silent, photos: mp4 && video === 'h264' && audio === 'aac' && !silent };
}

/**
 * Render the piece's audio at 48 kHz, in a worker, as planar stereo.
 * The same performance the page plays, just at the rate a video wants.
 */
export async function renderAudio(events, seconds, { onProgress, signal, band = null } = {}) {
  if (!band) return renderPiano(events, seconds, { onProgress, signal });
  // A piece with a band: the band first (a few seconds), then the piano, mixed.
  const { loadBand } = await import('./band-load.js');
  const { mix } = await import('./band.js');
  onProgress?.(0);
  const b = await loadBand(band, AUDIO_RATE, seconds, { signal });
  const a = await renderPiano(events, seconds, { onProgress: (f) => onProgress?.(0.1 + f * 0.9), signal });
  mix(a.L, a.R, b);
  return a;
}

function renderPiano(events, seconds, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const n = Math.ceil(seconds * AUDIO_RATE);
    const L = new Float32Array(n), R = new Float32Array(n);
    let w;
    try { w = new Worker(new URL('./piano-worker.js', import.meta.url), { type: 'module' }); }
    catch { w = null; }
    if (!w) {
      // no module worker: render here, in slices
      (async () => {
        const X = await instantiate(await (await fetch(new URL('../vendor/pfsynth/pfsynth.wasm', import.meta.url))).arrayBuffer());
        const r = begin(X, events, AUDIO_RATE, DEFAULT_GAIN);
        let f = 0, p;
        while ((p = r.pull()) && f < n) {
          for (let i = 0; i < p.length / 2 && f + i < n; i++) { L[f + i] = p[2 * i]; R[f + i] = p[2 * i + 1]; }
          f += p.length / 2;
          onProgress?.(Math.min(1, f / n));
          if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
          await new Promise((ok) => setTimeout(ok, 0));
        }
        resolve({ L, R, sampleRate: AUDIO_RATE });
      })().catch(reject);
      return;
    }
    const events2 = events.map(({ at, dur, midi, velocity }) => ({ at, dur, midi, velocity }));
    signal?.addEventListener('abort', () => { w.terminate(); reject(new DOMException('cancelled', 'AbortError')); }, { once: true });
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'chunk') {
        const pcm = new Float32Array(m.pcm);
        for (let i = 0; i < m.frames && m.frame + i < n; i++) { L[m.frame + i] = pcm[2 * i]; R[m.frame + i] = pcm[2 * i + 1]; }
        onProgress?.(Math.min(1, (m.frame + m.frames) / n));
        if (m.frame + m.frames >= n) { w.terminate(); resolve({ L, R, sampleRate: AUDIO_RATE }); }
      } else if (m.type === 'done') { w.terminate(); resolve({ L, R, sampleRate: AUDIO_RATE }); }
      else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)); }
    };
    w.postMessage({ type: 'render', id: 1, events: events2, sampleRate: AUDIO_RATE, gain: DEFAULT_GAIN });
  });
}

/** A short fade at the very end, so the file does not stop on a click. */
function fadeTail(L, R, rate, seconds = 1.2) {
  const n = Math.min(L.length, Math.floor(seconds * rate));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    L[L.length - 1 - i] *= g; R[R.length - 1 - i] *= g;
  }
}

const tick = () => new Promise((ok) => setTimeout(ok, 0));

/**
 * The fast path: every frame drawn and encoded offline, the audio interleaved
 * with it a frame at a time.
 *
 * draw(ctx, t) paints the frame for second t into a canvas of the format's
 * size. Returns a Blob (video/mp4).
 */
export async function renderOffline({ w, h, seconds, draw, audio, support, onProgress, signal }) {
  const MB = support.MB;
  const target = new MB.BufferTarget();
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  const video = new MB.CanvasSource(canvas, { codec: support.video, bitrate: 6_000_000, keyFrameInterval: 2 });
  const sound = new MB.AudioSampleSource({ codec: support.audio, bitrate: 192_000 });
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(sound);
  await output.start();

  fadeTail(audio.L, audio.R, AUDIO_RATE);
  const BLOCK = 4800;                        // 0.1 s
  let af = 0;
  const feedAudioUntil = async (t) => {
    while (af < audio.L.length && af / AUDIO_RATE < t) {
      const n = Math.min(BLOCK, audio.L.length - af);
      const planar = new Float32Array(n * 2);
      planar.set(audio.L.subarray(af, af + n), 0);
      planar.set(audio.R.subarray(af, af + n), n);
      const sample = new MB.AudioSample({ data: planar, format: 'f32-planar', numberOfChannels: 2, sampleRate: AUDIO_RATE, timestamp: af / AUDIO_RATE });
      await sound.add(sample);
      sample.close();
      af += n;
    }
  };

  const frames = Math.ceil(seconds * FPS);
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
      draw(ctx, i / FPS);
      await video.add(i / FPS, 1 / FPS);
      await feedAudioUntil((i + 1) / FPS);
      if (i % 6 === 0) { onProgress?.(i / frames); await tick(); }
    }
    await feedAudioUntil(Infinity);
    await output.finalize();
  } catch (err) {
    try { await output.cancel(); } catch { /* already gone */ }
    throw err;
  }
  onProgress?.(1);
  return new Blob([target.buffer], { type: 'video/mp4' });
}

/**
 * `ac` must be an AudioContext made and resumed INSIDE the tap that started the
 * export (see extras.js): one made later, after the awaits, is left suspended
 * by Safari, and records silence.
 */
export async function renderRealtime({ w, h, seconds, draw, audio, mime, ac, onProgress, signal }) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  await ac.resume();
  if (ac.state !== 'running') throw new Error('the browser would not start audio for the recording; tap Render again');
  const buf = ac.createBuffer(2, audio.L.length, AUDIO_RATE);   // resampled by the context if its rate differs
  fadeTail(audio.L, audio.R, AUDIO_RATE);
  buf.copyToChannel(audio.L, 0); buf.copyToChannel(audio.R, 1);
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  src.buffer = buf; src.connect(dest);
  const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  if (!mime) throw new Error('this browser cannot record video');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise((ok) => { rec.onstop = ok; });
  draw(ctx, 0);
  rec.start(1000);
  const t0 = ac.currentTime + 0.1;
  src.start(t0);
  await new Promise((resolve, reject) => {
    const step = () => {
      if (signal?.aborted) { rec.stop(); src.stop(); reject(new DOMException('cancelled', 'AbortError')); return; }
      const t = ac.currentTime - t0;
      draw(ctx, Math.max(0, t));
      onProgress?.(Math.min(1, t / seconds));
      if (t >= seconds) { resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await stopped;
  return new Blob(parts, { type: mime.split(';')[0] });
}

/** Title at the start and a credit at the end, drawn over a frame. */
export function drawCredits(ctx, w, h, t, seconds, { title, subtitle, ink = '#2a2426', paper = 'rgba(244,238,226,0.0)' }) {
  const s = Math.min(w, h);
  const inA = Math.min(1, t / 0.6) * (1 - Math.min(1, Math.max(0, (t - 2.8) / 0.8)));
  const outA = Math.min(1, Math.max(0, (t - (seconds - 7)) / 1.2));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  if (inA > 0) {
    ctx.globalAlpha = inA;
    ctx.font = `italic 400 ${Math.round(s * 0.085)}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(title, w / 2, h * 0.3);
    ctx.font = `400 ${Math.round(s * 0.03)}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(subtitle, w / 2, h * 0.3 + s * 0.06);
  }
  if (outA > 0) {
    ctx.globalAlpha = outA * 0.85;
    ctx.font = `500 ${Math.round(s * 0.022)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`${title} · studio.mino.mobi`, w * 0.045, h - s * 0.03);
  }
  ctx.restore();
  void paper;
}

/**
 * Hand the file to the share sheet ("Save Video" puts it in Photos), or fall
 * back to a download. Must be called from a tap.
 */
export async function shareOrSave(blob, name) {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `${name}.${ext}`, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (err) { if (err?.name === 'AbortError') return 'dismissed'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return 'downloaded';
}
