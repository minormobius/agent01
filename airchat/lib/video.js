// airchat/lib/video.js — caption-synced video generator via ffmpeg.wasm.
//
// Pipeline:
//   1. Render N PNG frames on an offscreen canvas, one per video frame
//      time-slice. Each frame draws the active caption segment, the
//      author identity row, a progress bar, and a brand footer.
//   2. Write all PNGs + the audio blob into ffmpeg.wasm's virtual FS.
//   3. Run ffmpeg to mux PNG sequence + audio into a single H.264/AAC
//      mp4 (`-c:v libx264 -c:a aac -shortest`).
//   4. Read the mp4 out, return as a video/mp4 Blob.
//
// We use the single-threaded core (`@ffmpeg/core`, not `core-mt`) so
// we don't need COOP+COEP headers — SharedArrayBuffer is avoided
// entirely. Encoding is slower than realtime but bounded (~2-4×
// audio duration on a modern laptop for a 720p square video).
//
// LOADING NOTE: the FFmpeg class spawns an internal Worker pointing at
// coreURL. Browsers refuse to construct a Worker from a cross-origin
// URL, so passing unpkg/jsdelivr URLs *directly* makes ff.load() hang
// forever (no error, just never resolves). The fix is `toBlobURL` from
// @ffmpeg/util — it fetches the file, wraps it in a blob: URL, and
// the Worker happily loads the same-origin blob. This is the canonical
// pattern from ffmpegwasm.netlify.app/docs.
//
// We also use the UMD core build (not ESM) — that's the build the
// FFmpeg main class spawns into a Worker; the ESM core triggers
// import-resolution issues inside the worker context.

// Helper: race a promise against a timeout. Surfaces "load is still
// hanging after N seconds" as an actionable error rather than an
// infinite spinner.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const FFMPEG_VERSION = '0.12.15';
const CORE_VERSION = '0.12.6';
const UTIL_VERSION = '0.12.2';
const LOAD_TIMEOUT_MS = 90_000;

let _ffmpegInstance = null;
let _ffmpegLoading = null;

export async function getFFmpeg(onProgress) {
  if (_ffmpegInstance) return _ffmpegInstance;
  if (_ffmpegLoading) return _ffmpegLoading;
  _ffmpegLoading = (async () => {
    try {
      onProgress?.({ stage: 'loading-ffmpeg', message: 'loading vendored ffmpeg…' });
      // IMPORTANT: ffmpeg packages are vendored at deploy time into
      // /vendor/ffmpeg/ (see .github/workflows/deploy-airchat.yml). The
      // FFmpeg class spawns its internal Worker via
      //   `new Worker(new URL("./worker.js", import.meta.url))`
      // which fails with SecurityError ("The operation is insecure")
      // if the module's origin doesn't match the page. Same-origin
      // vendoring is the canonical fix; CDN imports of @ffmpeg/ffmpeg
      // can't work without a bundler that rewrites that line.
      const ffMod   = await withTimeout(
        import('/vendor/ffmpeg/ffmpeg/dist/esm/index.js'),
        30_000, 'ffmpeg module load',
      );
      const utilMod = await withTimeout(
        import('/vendor/ffmpeg/util/dist/esm/index.js'),
        30_000, '@ffmpeg/util load',
      );
      const ff = new ffMod.FFmpeg();

      // Pipe ffmpeg's internal log to the UI. On mobile especially this
      // is the only way to tell whether wasm is instantiating, OOMing,
      // or stuck waiting on the worker.
      ff.on('log', ({ message }) => {
        console.log('[ffmpeg]', message);
        onProgress?.({ stage: 'ffmpeg-log', message });
      });
      ff.on('progress', ({ progress }) => {
        if (typeof progress === 'number' && progress >= 0 && progress <= 1) {
          onProgress?.({ stage: 'encoding', progress });
        }
      });

      onProgress?.({ stage: 'loading-ffmpeg', message: 'wrapping core (~30 MB) as blob URL…' });
      const baseURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
      const [coreURL, wasmURL] = await Promise.all([
        withTimeout(utilMod.toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'), 60_000, 'core.js download'),
        withTimeout(utilMod.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'), 60_000, 'core.wasm download'),
      ]);

      onProgress?.({ stage: 'loading-ffmpeg', message: 'spawning worker + instantiating wasm…' });
      await withTimeout(ff.load({ coreURL, wasmURL }), LOAD_TIMEOUT_MS, 'ff.load (worker spawn + wasm instantiation)');

      _ffmpegInstance = ff;
      onProgress?.({ stage: 'loaded' });
      return ff;
    } catch (e) {
      // Reset the loading lock so a subsequent click can retry.
      _ffmpegLoading = null;
      throw e;
    }
  })();
  return _ffmpegLoading;
}

// ─── public api ─────────────────────────────────────────────────────────
//
//   await makeCaptionedVideo({
//     audioBlob: Blob,                  // the voice audio to mux in
//     audioMime: 'audio/wav' | …,
//     segments:  [{ start, end, text }] // seconds (float)
//     duration:  Number,                // total audio length, seconds
//     displayName, handle, avatarUrl,
//     musicBlob: Blob | null,           // optional background track
//     musicName: string | null,         // for ext detection
//     musicGain: 0..1 (default 0.25)    // mix level for background
//     onProgress: ({ stage, progress, message }) => void
//   })  → Blob (video/mp4)

export async function makeCaptionedVideo(opts) {
  const {
    audioBlob, audioMime, segments = [], duration,
    displayName, handle, avatarUrl,
    musicBlob = null, musicName = '', musicGain = 0.25,
    onProgress,
  } = opts;
  if (!audioBlob || !duration) throw new Error('missing audio or duration');

  const W = 720, H = 720;
  const FPS = 12;                                       // captions don't move fast, 12fps is plenty
  const totalFrames = Math.max(1, Math.ceil(duration * FPS));

  const ff = await getFFmpeg(onProgress);

  const avatarBitmap = await loadAvatarBitmap(avatarUrl);

  // Render frames → PNG → virtual FS.
  onProgress?.({ stage: 'rendering', progress: 0, totalFrames });
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  for (let f = 0; f < totalFrames; f++) {
    const tSec = f / FPS;
    drawFrame(ctx, W, H, {
      time: tSec, duration, segments, handle, displayName, avatarBitmap,
    });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const ab = await blob.arrayBuffer();
    const name = `f_${String(f).padStart(5, '0')}.png`;
    await ff.writeFile(name, new Uint8Array(ab));
    if (f % 8 === 0 || f === totalFrames - 1) {
      onProgress?.({ stage: 'rendering', progress: (f + 1) / totalFrames });
      // Yield so the UI repaints; otherwise the page freezes for the
      // entire render duration.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Voice audio → virtual FS. Pick a sensible extension from the mime so
  // ffmpeg's demuxer picks the right format.
  const voiceName = 'voice.' + extFromMime(audioMime);
  await ff.writeFile(voiceName, new Uint8Array(await audioBlob.arrayBuffer()));

  // Optional background music → virtual FS. We let ffmpeg loop it
  // (via -stream_loop -1 on its input) so a short track tiles across
  // a longer voice clip; -shortest + amix duration=first cut the mix
  // to voice length so the music doesn't overrun.
  let musicFileName = null;
  if (musicBlob) {
    musicFileName = 'music.' + extFromMime(musicBlob.type, musicName);
    await ff.writeFile(musicFileName, new Uint8Array(await musicBlob.arrayBuffer()));
  }

  onProgress?.({ stage: 'encoding', progress: 0 });

  const args = [
    '-framerate', String(FPS),
    '-i', 'f_%05d.png',
    '-i', voiceName,
  ];
  if (musicFileName) {
    // -stream_loop -1 must precede its corresponding -i. Loops the
    // music indefinitely; the amix:duration=first below clips the mix
    // to voice length.
    args.push('-stream_loop', '-1', '-i', musicFileName);
    // Mix voice (input 1) with attenuated music (input 2). dropout_transition=0
    // avoids the auto-ducking that amix applies when one input ends.
    const gain = Math.max(0, Math.min(1, musicGain)).toFixed(3);
    args.push(
      '-filter_complex',
      `[2:a]volume=${gain}[m];[1:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`,
      '-map', '0:v',
      '-map', '[a]',
    );
  } else {
    args.push('-map', '0:v', '-map', '1:a');
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',                              // 2-3× faster encode, slightly larger files
    '-crf', '24',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    '-y',
    'out.mp4',
  );
  await ff.exec(args);

  const out = await ff.readFile('out.mp4');
  const result = new Blob([out.buffer], { type: 'video/mp4' });

  // Best-effort cleanup of the virtual FS. Reusing the FFmpeg instance
  // across multiple videos requires we clear out previous frames first.
  for (let f = 0; f < totalFrames; f++) {
    try { await ff.deleteFile(`f_${String(f).padStart(5, '0')}.png`); } catch {}
  }
  try { await ff.deleteFile(voiceName); } catch {}
  if (musicFileName) { try { await ff.deleteFile(musicFileName); } catch {} }
  try { await ff.deleteFile('out.mp4'); } catch {}

  onProgress?.({ stage: 'done', progress: 1, size: result.size });
  return result;
}

// ─── realtime (MediaRecorder) encoder ───────────────────────────────────
//
// Browser-native, no wasm. Output is webm (Chrome/Firefox/Edge) or
// mp4 (Safari/iOS) — both accepted by bsky's upload. Runs in
// wall-clock time: a 30s clip takes 30s. Mobile-friendly because
// there's no big wasm download and no large working memory.
//
//   await makeCaptionedVideoRealtime({
//     audioBlob, audioMime, segments, duration,
//     displayName, handle, avatarUrl,
//     musicBlob, musicGain,
//     onProgress,
//   })  → Blob (video/webm or video/mp4)

export async function makeCaptionedVideoRealtime(opts) {
  const {
    audioBlob, segments = [], duration,
    displayName, handle, avatarUrl,
    musicBlob = null, musicGain = 0.25,
    onProgress,
  } = opts;
  if (!audioBlob || !duration) throw new Error('missing audio or duration');

  const W = 720, H = 720;
  const FPS = 30;

  const avatarBitmap = await loadAvatarBitmap(avatarUrl);

  // Canvas (offscreen via DOM element kept off-screen).
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Draw the first frame *before* captureStream so the recorder
  // doesn't start with a black frame.
  drawFrame(ctx, W, H, { time: 0, duration, segments, handle, displayName, avatarBitmap });

  // Audio graph: voice (one-shot) + optional looped music mixed to
  // a MediaStreamDestinationNode. The destination's .stream gives us
  // a real-time audio track we can hand to MediaRecorder.
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new Ctx();
  const audioBuffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());
  let musicBuffer = null;
  if (musicBlob) {
    try {
      musicBuffer = await audioCtx.decodeAudioData(await musicBlob.arrayBuffer());
    } catch (e) {
      console.warn('music decode failed; proceeding without', e);
    }
  }
  const audioDest = audioCtx.createMediaStreamDestination();
  const voiceSrc = audioCtx.createBufferSource();
  voiceSrc.buffer = audioBuffer;
  voiceSrc.connect(audioDest);
  let musicSrc = null;
  if (musicBuffer) {
    musicSrc = audioCtx.createBufferSource();
    musicSrc.buffer = musicBuffer;
    musicSrc.loop = true;                              // tile short tracks under longer voice
    const g = audioCtx.createGain();
    g.gain.value = Math.max(0, Math.min(1, musicGain));
    musicSrc.connect(g);
    g.connect(audioDest);
  }

  // Combined stream: canvas video + mixed audio.
  const videoStream = canvas.captureStream(FPS);
  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  // Pick the best MIME type the browser supports. mp4 first (Safari +
  // recent Chrome land directly on the format bsky prefers); webm
  // fallback for Firefox.
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  let mimeType = '';
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
  }
  const recorderOpts = mimeType ? { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 } : {};
  const recorder = new MediaRecorder(stream, recorderOpts);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const recorderDone = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (e) => reject(new Error('MediaRecorder error: ' + (e.error?.message || e)));
  });

  onProgress?.({ stage: 'encoding', progress: 0, message: `realtime · ${mimeType || 'browser default'}` });
  recorder.start(200);

  // Start audio playback — this is what drives the recording timeline.
  // Tiny lead-in so the recorder sees the first sample.
  const startAt = audioCtx.currentTime + 0.05;
  voiceSrc.start(startAt);
  if (musicSrc) musicSrc.start(startAt);

  // Animation loop: redraw the canvas with the current segment caption.
  const t0 = performance.now();
  let stopRequested = false;
  function tick() {
    const tSec = (performance.now() - t0) / 1000;
    drawFrame(ctx, W, H, { time: tSec, duration, segments, handle, displayName, avatarBitmap });
    onProgress?.({ stage: 'encoding', progress: Math.min(1, tSec / duration) });
    if (tSec < duration + 0.3) {
      requestAnimationFrame(tick);
    } else if (!stopRequested) {
      stopRequested = true;
      // Small lag-tail so the last frame is in the output before we cut.
      setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 100);
    }
  }
  requestAnimationFrame(tick);

  await recorderDone;
  try { audioCtx.close(); } catch {}

  const blob = new Blob(chunks, { type: mimeType || (chunks[0]?.type) || 'video/webm' });
  onProgress?.({ stage: 'done', progress: 1, size: blob.size, mimeType: blob.type });
  return blob;
}

async function loadAvatarBitmap(avatarUrl) {
  if (!avatarUrl) return null;
  try {
    const r = await fetch(avatarUrl, { mode: 'cors' });
    if (!r.ok) return null;
    const ab = await r.blob();
    return await createImageBitmap(ab);
  } catch (e) {
    console.warn('avatar fetch failed', e);
    return null;
  }
}

// ─── canvas frame rendering ─────────────────────────────────────────────
function drawFrame(ctx, W, H, opts) {
  // Background
  ctx.fillStyle = '#0f0f0f';
  ctx.fillRect(0, 0, W, H);

  // Subtle accent gradient at the top for visual interest
  const grad = ctx.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, 'rgba(201, 112, 112, 0.10)');
  grad.addColorStop(1, 'rgba(201, 112, 112, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 160);

  // Avatar + handle header
  const padX = 48;
  const avatarSize = 64;
  const avatarY = 48;
  if (opts.avatarBitmap) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(padX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(opts.avatarBitmap, padX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } else {
    // Initial-letter placeholder
    ctx.fillStyle = 'rgba(201, 112, 112, 0.15)';
    ctx.beginPath();
    ctx.arc(padX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c97070';
    ctx.font = 'bold 32px ui-monospace, "SF Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const initial = (opts.displayName || opts.handle || '?').replace(/^@/, '').charAt(0).toUpperCase();
    ctx.fillText(initial, padX + avatarSize / 2, avatarY + avatarSize / 2);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#d4d4d4';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText(opts.displayName || opts.handle || '', padX + avatarSize + 16, avatarY + 30);
  ctx.fillStyle = '#c97070';
  ctx.font = '18px ui-monospace, "SF Mono", monospace';
  ctx.fillText('@' + (opts.handle || ''), padX + avatarSize + 16, avatarY + 56);

  // Caption — the current segment, wrapped, centered vertically in the
  // middle band of the frame.
  const t = opts.time;
  const current = (opts.segments || []).find((s) => t >= s.start && t < s.end);
  if (current && current.text) {
    ctx.fillStyle = '#fafafa';
    ctx.font = '34px Georgia, "Iowan Old Style", serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const maxWidth = W - padX * 2;
    const lines = wrapText(ctx, current.text, maxWidth);
    const lineHeight = 48;
    const totalH = lines.length * lineHeight;
    const startY = 200 + (W - 280 - totalH) / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], padX, startY + i * lineHeight);
    }
  }

  // Progress bar
  const barH = 4;
  const barY = H - 64;
  ctx.fillStyle = 'rgba(201, 112, 112, 0.18)';
  ctx.fillRect(padX, barY, W - padX * 2, barH);
  ctx.fillStyle = '#c97070';
  const progress = Math.min(1, t / opts.duration);
  ctx.fillRect(padX, barY, (W - padX * 2) * progress, barH);

  // Footer brand
  ctx.fillStyle = '#666';
  ctx.font = '14px ui-monospace, "SF Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('yapchat · airchat.mino.mobi', padX, H - 28);
}

// Pick an extension ffmpeg's demuxer will recognize, falling back to
// the filename if mime doesn't disambiguate. Default mp3 because that's
// the most common upload format and ffmpeg autodetects most files
// anyway via probing.
function extFromMime(mime, filename) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('wav'))                       return 'wav';
  if (m.includes('webm'))                      return 'webm';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('flac'))                      return 'flac';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  const fname = String(filename || '').toLowerCase();
  const fm = fname.match(/\.([a-z0-9]+)$/);
  return fm ? fm[1] : 'mp3';
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
