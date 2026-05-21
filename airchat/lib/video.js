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
// ffmpeg.wasm is heavy (~30 MB first load) and pulls from a CDN.
// We surface progress through the onProgress callback so the UI can
// show a meaningful spinner.

const FFMPEG_VERSION = '0.12.10';
const CORE_VERSION = '0.12.6';
const CDN_BASE = 'https://unpkg.com';

let _ffmpegInstance = null;
let _ffmpegLoading = null;

export async function getFFmpeg(onProgress) {
  if (_ffmpegInstance) return _ffmpegInstance;
  if (_ffmpegLoading) return _ffmpegLoading;
  _ffmpegLoading = (async () => {
    onProgress?.({ stage: 'loading-ffmpeg', message: 'fetching ffmpeg.wasm…' });
    const mod = await import(`${CDN_BASE}/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/index.js`);
    const ff = new mod.FFmpeg();
    ff.on('log', ({ message }) => onProgress?.({ stage: 'ffmpeg-log', message }));
    ff.on('progress', ({ progress }) => {
      if (typeof progress === 'number' && progress >= 0 && progress <= 1) {
        onProgress?.({ stage: 'encoding', progress });
      }
    });
    await ff.load({
      coreURL:  `${CDN_BASE}/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`,
      wasmURL:  `${CDN_BASE}/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`,
    });
    _ffmpegInstance = ff;
    onProgress?.({ stage: 'loaded' });
    return ff;
  })();
  return _ffmpegLoading;
}

// ─── public api ─────────────────────────────────────────────────────────
//
//   await makeCaptionedVideo({
//     audioBlob: Blob,                  // the audio to mux in
//     audioMime: 'audio/wav' | …,
//     segments:  [{ start, end, text }] // seconds (float)
//     duration:  Number,                // total audio length, seconds
//     displayName, handle, avatarUrl,
//     onProgress: ({ stage, progress, message }) => void
//   })  → Blob (video/mp4)

export async function makeCaptionedVideo(opts) {
  const {
    audioBlob, audioMime, segments = [], duration,
    displayName, handle, avatarUrl,
    onProgress,
  } = opts;
  if (!audioBlob || !duration) throw new Error('missing audio or duration');

  const W = 720, H = 720;
  const FPS = 12;                                       // captions don't move fast, 12fps is plenty
  const totalFrames = Math.max(1, Math.ceil(duration * FPS));

  const ff = await getFFmpeg(onProgress);

  // Pre-load the avatar bitmap. Cross-origin images can taint the canvas
  // and break toBlob; we fetch the bytes and create an ImageBitmap which
  // bypasses the taint flag.
  let avatarBitmap = null;
  if (avatarUrl) {
    try {
      const r = await fetch(avatarUrl, { mode: 'cors' });
      if (r.ok) {
        const ab = await r.blob();
        avatarBitmap = await createImageBitmap(ab);
      }
    } catch (e) {
      console.warn('avatar fetch failed', e);
    }
  }

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

  // Audio → virtual FS. Pick a sensible extension from the mime so
  // ffmpeg's demuxer picks the right format.
  const audioExt = audioMime.includes('wav')  ? 'wav'
                 : audioMime.includes('mp4')  ? 'mp4'
                 : audioMime.includes('ogg')  ? 'ogg'
                 : audioMime.includes('mpeg') ? 'mp3'
                 : 'webm';
  const audioName = 'audio.' + audioExt;
  await ff.writeFile(audioName, new Uint8Array(await audioBlob.arrayBuffer()));

  onProgress?.({ stage: 'encoding', progress: 0 });
  await ff.exec([
    '-framerate', String(FPS),
    '-i', 'f_%05d.png',
    '-i', audioName,
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
  ]);

  const out = await ff.readFile('out.mp4');
  const result = new Blob([out.buffer], { type: 'video/mp4' });

  // Best-effort cleanup of the virtual FS. Reusing the FFmpeg instance
  // across multiple videos requires we clear out previous frames first.
  for (let f = 0; f < totalFrames; f++) {
    try { await ff.deleteFile(`f_${String(f).padStart(5, '0')}.png`); } catch {}
  }
  try { await ff.deleteFile(audioName); } catch {}
  try { await ff.deleteFile('out.mp4'); } catch {}

  onProgress?.({ stage: 'done', progress: 1, size: result.size });
  return result;
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
