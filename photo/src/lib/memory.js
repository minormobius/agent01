// Memory-aware pipeline for Sleuth
// Bypasses DuckDB entirely — parses text directly from NDJSON
// Manages memory budget: CAR → text docs → model → embeddings

// ---- Memory detection ----

export function getMemoryInfo() {
  const info = {
    deviceMemoryGB: navigator.deviceMemory || null, // Chrome/Edge: 0.25, 0.5, 1, 2, 4, 8
    heapLimit: null,
    heapUsed: null,
    heapAvailable: null,
  };

  if (performance.memory) {
    info.heapLimit = performance.memory.jsHeapSizeLimit;
    info.heapUsed = performance.memory.usedJSHeapSize;
    info.heapAvailable = info.heapLimit - info.heapUsed;
  }

  return info;
}

// Estimate available memory in bytes
// Conservative: assume we can use ~60% of what the browser reports available
export function estimateAvailableMemory() {
  const info = getMemoryInfo();

  // Best case: Chrome with heap stats
  if (info.heapAvailable) {
    return Math.floor(info.heapAvailable * 0.6);
  }

  // Fallback: deviceMemory API (rough)
  if (info.deviceMemoryGB) {
    // Browser gets ~25-50% of device RAM as heap
    // Be conservative: 25% of device RAM, 60% of that usable
    return Math.floor(info.deviceMemoryGB * 1e9 * 0.25 * 0.6);
  }

  // No memory info: assume 512MB available (conservative mobile default)
  return 512 * 1e6;
}

// ---- Memory budget constants ----

// Embedding model sizes (approximate, compressed download → in-memory)
const MODEL_SIZE_Q8 = 50 * 1e6;   // ~50MB in memory for bge-small q8
const MODEL_SIZE_Q4 = 30 * 1e6;   // ~30MB in memory for bge-small q4

// Per-post memory costs
const BYTES_PER_DOC = 200;        // avg: text (~120) + rkey (13) + did (32) + date (10) + overhead
const BYTES_PER_EMBEDDING = 384 * 4; // Float32Array, 384 dims = 1,536 bytes

export function getModelSize(mobile) {
  return mobile ? MODEL_SIZE_Q4 : MODEL_SIZE_Q8;
}

// ---- Extract text docs from NDJSON (no DuckDB) ----

export function extractTextDocs(ndjson, did) {
  const docs = [];
  const lines = ndjson.split('\n');

  for (const line of lines) {
    if (!line || !line.includes('"app.bsky.feed.post"')) continue;

    try {
      const record = JSON.parse(line);
      if (record.collection !== 'app.bsky.feed.post') continue;

      const value = record.value;
      if (!value || typeof value !== 'object') continue;

      const text = value.text;
      if (!text || typeof text !== 'string' || text.trim().length === 0) continue;

      // Truncate timestamp to day precision
      let createdAt = value.createdAt || '';
      if (createdAt.length > 10) createdAt = createdAt.slice(0, 10);

      docs.push({
        text,
        rkey: record.rkey || '',
        did: did,
        createdAt,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return docs;
}

// ---- Memory-aware trimming ----

export function computeMemoryBudget(docCount, mobile) {
  const modelSize = getModelSize(mobile);
  const docsMemory = docCount * BYTES_PER_DOC;
  const embeddingsMemory = docCount * BYTES_PER_EMBEDDING;
  const totalNeeded = modelSize + docsMemory + embeddingsMemory;

  return {
    modelSize,
    docsMemory,
    embeddingsMemory,
    totalNeeded,
    perPostCost: BYTES_PER_DOC + BYTES_PER_EMBEDDING,
  };
}

// Trim docs to fit within memory budget
// Strategy: keep newest posts, drop oldest
export function trimToFit(docs, availableMemory, mobile) {
  const modelSize = getModelSize(mobile);
  const memoryForData = availableMemory - modelSize;

  if (memoryForData <= 0) {
    // Can barely fit the model — keep minimum viable set
    return { docs: docs.slice(0, 500), trimmed: true, kept: 500, dropped: docs.length - 500 };
  }

  const perPost = BYTES_PER_DOC + BYTES_PER_EMBEDDING;
  const maxPosts = Math.floor(memoryForData / perPost);

  if (maxPosts >= docs.length) {
    return { docs, trimmed: false, kept: docs.length, dropped: 0 };
  }

  // Sort newest first, keep maxPosts
  const sorted = [...docs].sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const kept = sorted.slice(0, maxPosts);
  return {
    docs: kept,
    trimmed: true,
    kept: maxPosts,
    dropped: docs.length - maxPosts,
  };
}

// ---- Pipeline orchestrator ----

export async function runSleuthPipeline({
  pdsUrl,
  did,
  handle,
  downloadRepo,
  parseCar,
  onProgress,
}) {
  const mobile = isMobile();

  // Step 1: Download CAR
  onProgress({ step: 'download', message: 'Downloading repo...' });
  let carBytes = await downloadRepo(pdsUrl, did, {
    onProgress: ({ received, total }) => {
      const mb = (received / 1e6).toFixed(1);
      onProgress({
        step: 'download',
        message: total
          ? `Downloading: ${mb}/${(total / 1e6).toFixed(1)} MB`
          : `Downloading: ${mb} MB`,
      });
    },
  });

  // Step 2: Parse CAR → NDJSON
  onProgress({ step: 'parse', message: 'Parsing repo...' });
  let ndjson = await parseCar(carBytes, did);

  // Free CAR bytes immediately
  carBytes = null;

  // Step 3: Extract text docs (no DuckDB!)
  onProgress({ step: 'extract', message: 'Extracting posts...' });
  let docs = extractTextDocs(ndjson, did);

  // Free NDJSON immediately
  ndjson = null;

  // Force GC hint
  if (globalThis.gc) globalThis.gc();

  const totalPosts = docs.length;
  onProgress({ step: 'extract', message: `${totalPosts.toLocaleString()} text posts found` });

  // Step 4: Memory budget check
  const available = estimateAvailableMemory();
  const budget = computeMemoryBudget(docs.length, mobile);
  const memInfo = getMemoryInfo();

  onProgress({
    step: 'budget',
    message: `Memory: ~${(available / 1e6).toFixed(0)}MB available, ~${(budget.totalNeeded / 1e6).toFixed(0)}MB needed`,
  });

  let trimResult = { docs, trimmed: false, kept: docs.length, dropped: 0 };

  if (budget.totalNeeded > available * 0.9) {
    // Need to trim
    onProgress({ step: 'budget', message: 'Trimming older posts to fit memory...' });
    trimResult = trimToFit(docs, available, mobile);
    docs = trimResult.docs;

    if (trimResult.trimmed) {
      onProgress({
        step: 'budget',
        message: `Keeping ${trimResult.kept.toLocaleString()} newest posts (dropped ${trimResult.dropped.toLocaleString()} older)`,
      });
    }
  }

  return {
    docs,
    totalPosts,
    trimmed: trimResult.trimmed,
    kept: trimResult.kept,
    dropped: trimResult.dropped,
    mobile,
    memoryInfo: {
      available,
      needed: computeMemoryBudget(docs.length, mobile).totalNeeded,
      deviceMemoryGB: memInfo.deviceMemoryGB,
    },
  };
}

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
}
