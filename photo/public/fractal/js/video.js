// Offline fractal-video encoder via ffmpeg.wasm.
//
// Why offline (not MediaRecorder): deep-zoom fractal frames can take
// 50-500ms each to render, far slower than realtime. MediaRecorder's
// captureStream samples the canvas on a wall-clock cadence, so slow
// frames stutter and the playback speed is wrong. Encoding an explicit
// PNG sequence at a fixed framerate gives a perfectly smooth dive whose
// duration is exactly totalFrames / fps regardless of render time.
//
// Loading mirrors airchat/lib/video.js: the @ffmpeg/ffmpeg + @ffmpeg/util
// packages are vendored same-origin under /vendor/ffmpeg/ (so the worker
// the FFmpeg class spawns is same-origin and not blocked), while the big
// ~30MB core wasm is fetched from CDN and wrapped via toBlobURL.

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const CORE_VERSION = '0.12.6';
const LOAD_TIMEOUT_MS = 90_000;

let _ffmpeg = null;
let _loading = null;

export async function getFFmpeg(onProgress) {
  if (_ffmpeg) return _ffmpeg;
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      onProgress?.({ stage: 'loading-ffmpeg', message: 'loading vendored ffmpeg…' });
      // Vendored under /vendor/ffmpeg/ with the package's internal `dist/`
      // folder flattened to `esm/` (the repo .gitignore excludes any dist/).
      // Internal imports are relative, so the rename is transparent.
      const ffMod = await withTimeout(
        import('/vendor/ffmpeg/ffmpeg/esm/index.js'), 30_000, 'ffmpeg module load');
      const utilMod = await withTimeout(
        import('/vendor/ffmpeg/util/esm/index.js'), 30_000, '@ffmpeg/util load');
      const ff = new ffMod.FFmpeg();
      ff.on('log', ({ message }) => { onProgress?.({ stage: 'ffmpeg-log', message }); });
      ff.on('progress', ({ progress }) => {
        if (typeof progress === 'number' && progress >= 0 && progress <= 1)
          onProgress?.({ stage: 'encoding', progress });
      });
      onProgress?.({ stage: 'loading-ffmpeg', message: 'fetching core (~30 MB, first time only)…' });
      // The @ffmpeg/ffmpeg worker is spawned as `type: "module"`, so it loads
      // the core via dynamic import() (not importScripts) — which requires the
      // ESM core build (it has `export default createFFmpegCore`). The UMD core
      // has no default export and fails with "failed to import ffmpeg-core.js".
      const baseURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
      const [coreURL, wasmURL] = await Promise.all([
        withTimeout(utilMod.toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'), 60_000, 'core.js download'),
        withTimeout(utilMod.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'), 60_000, 'core.wasm download'),
      ]);
      onProgress?.({ stage: 'loading-ffmpeg', message: 'instantiating wasm…' });
      await withTimeout(ff.load({ coreURL, wasmURL }), LOAD_TIMEOUT_MS, 'ff.load');
      _ffmpeg = ff;
      onProgress?.({ stage: 'loaded' });
      return ff;
    } catch (e) {
      _loading = null;
      throw e;
    }
  })();
  return _loading;
}

// Encode a fractal animation.
//   getFrame(i): async (frameIndex) => PNG Blob, rendered at width×height
//   totalFrames, fps, format ('mp4'), quality (crf), onProgress
// Returns a Blob (video/mp4).
export async function encodeVideo({ getFrame, totalFrames, fps, crf = 18, onProgress }) {
  const ff = await getFFmpeg(onProgress);

  onProgress?.({ stage: 'rendering', progress: 0, totalFrames });
  for (let f = 0; f < totalFrames; f++) {
    const blob = await getFrame(f);
    const ab = await blob.arrayBuffer();
    await ff.writeFile(`f_${String(f).padStart(5, '0')}.png`, new Uint8Array(ab));
    onProgress?.({ stage: 'rendering', progress: (f + 1) / totalFrames, frame: f + 1, totalFrames });
    // Yield so the UI can repaint the progress bar.
    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.({ stage: 'encoding', progress: 0 });
  // Single-threaded core: force x264 to one thread (it can otherwise stall
  // waiting on pthreads that don't exist) and use the ultrafast preset, which
  // is dramatically faster in wasm. tune=fastdecode/zerolatency not needed.
  await ff.exec([
    '-framerate', String(fps),
    '-i', 'f_%05d.png',
    '-threads', '1',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', 'out.mp4',
  ]);

  const out = await ff.readFile('out.mp4');
  const result = new Blob([out.buffer], { type: 'video/mp4' });

  for (let f = 0; f < totalFrames; f++) {
    try { await ff.deleteFile(`f_${String(f).padStart(5, '0')}.png`); } catch {}
  }
  try { await ff.deleteFile('out.mp4'); } catch {}

  onProgress?.({ stage: 'done', progress: 1, size: result.size });
  return result;
}
