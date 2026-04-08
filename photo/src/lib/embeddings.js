// Client-side text embeddings via transformers.js
// Uses bge-small-en-v1.5 (384 dims) — WASM only for stability

const MODEL_ID = 'Xenova/bge-small-en-v1.5';
let pipeline = null;
let loadingPromise = null;
let transformersModule = null;

async function loadTransformers() {
  if (transformersModule) return transformersModule;
  // Dynamic import from CDN — @vite-ignore prevents Vite from processing
  transformersModule = await import(
    /* @vite-ignore */
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.1/dist/transformers.min.js'
  );
  return transformersModule;
}

// Detect mobile/low-memory environments
function isMobile() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
}

export async function initEmbeddings(onProgress) {
  if (pipeline) return pipeline;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    if (onProgress) onProgress({ status: 'loading', message: 'Loading embedding library...' });

    const { pipeline: createPipeline } = await loadTransformers();

    const mobile = isMobile();
    if (onProgress) onProgress({ status: 'loading', message: `Loading model (wasm${mobile ? ', mobile' : ''})...` });

    pipeline = await createPipeline('feature-extraction', MODEL_ID, {
      device: 'wasm',
      // q4 on mobile for less memory, q8 on desktop
      dtype: mobile ? 'q4' : 'q8',
      progress_callback: (p) => {
        if (onProgress && p.status === 'progress') {
          onProgress({
            status: 'loading',
            message: `Downloading model: ${Math.round(p.progress || 0)}%`,
          });
        }
      },
    });

    if (onProgress) onProgress({ status: 'ready', message: 'Model ready' });
    return pipeline;
  })();

  try {
    const result = await loadingPromise;
    return result;
  } catch (err) {
    loadingPromise = null;
    pipeline = null;
    throw err;
  }
}

// Embed a batch of texts, returns Float32Array[] of shape [n, 384]
// Batch size adapts to device: 8 on mobile (avoids OOM), 32 on desktop
export async function embedTexts(texts, { batchSize, onProgress } = {}) {
  const pipe = await initEmbeddings();
  const effectiveBatch = batchSize || (isMobile() ? 8 : 32);
  const embeddings = [];

  for (let i = 0; i < texts.length; i += effectiveBatch) {
    const batch = texts.slice(i, i + effectiveBatch);
    const output = await pipe(batch, { pooling: 'mean', normalize: true });

    const vectors = output.tolist();
    for (const vec of vectors) {
      embeddings.push(new Float32Array(vec));
    }

    // Dispose tensors to free memory
    if (output.dispose) output.dispose();

    if (onProgress) {
      onProgress({ done: Math.min(i + effectiveBatch, texts.length), total: texts.length });
    }

    // Yield to UI thread every batch
    await new Promise(r => setTimeout(r, 0));
  }

  return embeddings;
}

// Embed a single query
export async function embedQuery(text) {
  const pipe = await initEmbeddings();
  const output = await pipe([text], { pooling: 'mean', normalize: true });
  const vec = new Float32Array(output.tolist()[0]);
  if (output.dispose) output.dispose();
  return vec;
}

export function isReady() {
  return pipeline !== null;
}
