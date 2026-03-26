// Dominant color extraction via canvas sampling + median cut quantization.
// Extracts a palette from each image thumbnail, then aggregates per-user
// to produce an eigenpalette (the characteristic color signature).

const SAMPLE_SIZE = 64;  // thumbnail size for sampling
const PALETTE_K = 5;     // colors per image
const EIGEN_K = 8;       // colors per user eigenpalette

// Cache: "did/rkey/cid" → [{ r, g, b, pct }, ...]
const cache = new Map();
// Per-user eigenpalette cache: did → [{ r, g, b, pct }, ...]
const eigenCache = new Map();

// Extract dominant colors from a single image URL.
// Returns array of { r, g, b, pct } sorted by dominance.
export function extractColors(imgUrl, key) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

      const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
      const pixels = [];
      for (let i = 0; i < data.length; i += 4) {
        // Skip near-transparent pixels
        if (data[i + 3] < 128) continue;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }

      const palette = medianCut(pixels, PALETTE_K);
      cache.set(key, palette);
      resolve(palette);
    };
    img.onerror = () => resolve(null);
    img.src = imgUrl;
  });
}

// Batch extract colors for multiple images. Processes concurrently with a limit.
export async function extractColorsForImages(images, urlFn, onProgress) {
  const CONCURRENCY = 6;
  let done = 0;
  const total = images.length;
  const queue = [...images];
  const results = new Map();

  async function worker() {
    while (queue.length > 0) {
      const img = queue.shift();
      const key = `${img.did}/${img.rkey}/${img.cid}`;
      const url = urlFn(img);
      const palette = await extractColors(url, key);
      if (palette) results.set(key, palette);
      done++;
      if (onProgress) onProgress(done, total);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  return results;
}

// Get cached palette for an image
export function getColors(did, rkey, cid) {
  return cache.get(`${did}/${rkey}/${cid}`) || null;
}

// Compute eigenpalette for a user — the characteristic color signature
// aggregated from all their image palettes.
export function computeEigenpalette(did) {
  if (eigenCache.has(did)) return eigenCache.get(did);

  const allPixels = [];
  for (const [key, palette] of cache.entries()) {
    if (!key.startsWith(did + '/')) continue;
    for (const color of palette) {
      // Weight by dominance: more dominant colors contribute more samples
      const count = Math.max(1, Math.round(color.pct * 20));
      for (let i = 0; i < count; i++) {
        allPixels.push([color.r, color.g, color.b]);
      }
    }
  }

  if (allPixels.length === 0) return null;

  const eigen = medianCut(allPixels, EIGEN_K);
  eigenCache.set(did, eigen);
  return eigen;
}

export function hasColorData() {
  return cache.size > 0;
}

export function colorDataCount() {
  return cache.size;
}

// Clear eigenpalette cache (call when new images are added)
export function clearEigenCache() {
  eigenCache.clear();
}

// --- Median cut quantization ---

function medianCut(pixels, k) {
  if (pixels.length === 0) return [];
  if (k <= 0) return [];

  let buckets = [pixels];

  while (buckets.length < k) {
    // Find the bucket with the widest range in any channel
    let bestIdx = 0;
    let bestRange = -1;
    let bestChannel = 0;

    for (let i = 0; i < buckets.length; i++) {
      for (let ch = 0; ch < 3; ch++) {
        let min = 255, max = 0;
        for (const px of buckets[i]) {
          if (px[ch] < min) min = px[ch];
          if (px[ch] > max) max = px[ch];
        }
        const range = max - min;
        if (range > bestRange) {
          bestRange = range;
          bestIdx = i;
          bestChannel = ch;
        }
      }
    }

    if (bestRange <= 0) break; // all uniform

    const bucket = buckets[bestIdx];
    bucket.sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(bestIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  // Average each bucket
  const totalPixels = pixels.length;
  return buckets
    .map(b => {
      let r = 0, g = 0, bl = 0;
      for (const px of b) { r += px[0]; g += px[1]; bl += px[2]; }
      const n = b.length;
      return {
        r: Math.round(r / n),
        g: Math.round(g / n),
        b: Math.round(bl / n),
        pct: n / totalPixels,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

// Convert palette color to CSS
export function colorToHex({ r, g, b }) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// Hue of a color (0-360) for sorting
export function colorHue({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

// Euclidean distance between two colors
export function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// Named color regions for filtering
const COLOR_REGIONS = [
  { name: 'red', r: 220, g: 40, b: 40 },
  { name: 'orange', r: 240, g: 150, b: 30 },
  { name: 'yellow', r: 240, g: 220, b: 40 },
  { name: 'green', r: 50, g: 180, b: 60 },
  { name: 'blue', r: 40, g: 100, b: 220 },
  { name: 'purple', r: 150, g: 50, b: 200 },
  { name: 'pink', r: 230, g: 100, b: 170 },
  { name: 'brown', r: 140, g: 90, b: 50 },
  { name: 'gray', r: 140, g: 140, b: 140 },
  { name: 'black', r: 30, g: 30, b: 30 },
  { name: 'white', r: 240, g: 240, b: 240 },
];

// Classify an image into all matching color regions.
// Checks every palette color (not just the dominant one) and returns
// the set of region names where any color with >= 5% coverage matches.
export function imageColorRegions(did, rkey, cid) {
  const palette = getColors(did, rkey, cid);
  if (!palette || palette.length === 0) return null;

  const regions = new Set();
  for (const color of palette) {
    // Skip negligible colors
    if (color.pct < 0.05) continue;
    let best = COLOR_REGIONS[0];
    let bestDist = Infinity;
    for (const region of COLOR_REGIONS) {
      const d = colorDistance(color, region);
      if (d < bestDist) { bestDist = d; best = region; }
    }
    regions.add(best.name);
  }
  return regions;
}

// Legacy single-region function (kept for eigenpalette weighting)
export function dominantColorRegion(did, rkey, cid) {
  const palette = getColors(did, rkey, cid);
  if (!palette || palette.length === 0) return null;
  const dom = palette[0];
  let best = COLOR_REGIONS[0];
  let bestDist = Infinity;
  for (const region of COLOR_REGIONS) {
    const d = colorDistance(dom, region);
    if (d < bestDist) { bestDist = d; best = region; }
  }
  return best.name;
}
