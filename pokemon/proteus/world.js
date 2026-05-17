// world.js — procedural generation of the hidden world.
// Four scalar fields stored as Float32Array (or Uint8Array for obstacle).
// All fields are normalized to roughly [0, 1].

// Tiny deterministic RNG. Mulberry32.
function makeRng(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sum-of-gaussians scalar field. Returns Float32Array sized w*h, clipped to [0, 1].
// blobs: { x, y, r, amp }[]
function rasterizeGaussians(w, h, blobs) {
  const out = new Float32Array(w * h);
  for (const b of blobs) {
    const invR2 = 1 / (b.r * b.r);
    const x0 = Math.max(0, Math.floor(b.x - b.r * 3));
    const y0 = Math.max(0, Math.floor(b.y - b.r * 3));
    const x1 = Math.min(w, Math.ceil(b.x + b.r * 3));
    const y1 = Math.min(h, Math.ceil(b.y + b.r * 3));
    for (let y = y0; y < y1; y++) {
      const dy = y - b.y;
      const dy2 = dy * dy;
      const row = y * w;
      for (let x = x0; x < x1; x++) {
        const dx = x - b.x;
        const d2 = dx * dx + dy2;
        out[row + x] += b.amp * Math.exp(-d2 * invR2);
      }
    }
  }
  // Normalize to [0, 1] with a soft tanh-ish clip
  let max = 0;
  for (let i = 0; i < out.length; i++) if (out[i] > max) max = out[i];
  const scale = max > 0 ? 1 / max : 1;
  for (let i = 0; i < out.length; i++) {
    const v = out[i] * scale;
    out[i] = v < 0 ? 0 : (v > 1 ? 1 : v);
  }
  return out;
}

// Sample a Float32Array field bilinearly.
function sample(field, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const i00 = yi * w + xi;
  const v00 = field[i00];
  const v10 = field[i00 + 1];
  const v01 = field[i00 + w];
  const v11 = field[i00 + w + 1];
  const a = v00 * (1 - fx) + v10 * fx;
  const b = v01 * (1 - fx) + v11 * fx;
  return a * (1 - fy) + b * fy;
}

export function createWorld({ w = 800, h = 800, seed = 1, level = 1 } = {}) {
  const rng = makeRng(seed);
  const rand = (lo, hi) => lo + rng() * (hi - lo);

  // Substrate adhesion. Level 1 keeps the substrate clean: a few broad,
  // smooth patches so the cell has differential traction without chaos.
  const adhBlobs = [];
  if (level === 1) {
    for (let i = 0; i < 3; i++) {
      adhBlobs.push({ x: rand(150, w - 150), y: rand(150, h - 150), r: rand(160, 260), amp: rand(0.7, 1.0) });
    }
  } else {
    for (let i = 0; i < 7; i++) {
      adhBlobs.push({ x: rand(80, w - 80), y: rand(80, h - 80), r: rand(120, 220), amp: rand(0.5, 1.0) });
    }
    for (let i = 0; i < 14; i++) {
      adhBlobs.push({ x: rand(40, w - 40), y: rand(40, h - 40), r: rand(35, 70), amp: rand(0.3, 0.7) });
    }
  }

  // Light — directional gradient + a few bright lobes.
  const lightBlobs = [];
  const dir = rng() * Math.PI * 2;
  const lcx = w / 2 + Math.cos(dir) * w * 0.45;
  const lcy = h / 2 + Math.sin(dir) * h * 0.45;
  lightBlobs.push({ x: lcx, y: lcy, r: Math.max(w, h) * 1.1, amp: 1.0 });
  for (let i = 0; i < 4; i++) {
    lightBlobs.push({ x: rand(60, w - 60), y: rand(60, h - 60), r: rand(80, 160), amp: rand(0.3, 0.6) });
  }

  // Food + chemistry. Level 1 places exactly one food point and makes it the
  // only chem source so the gradient leads cleanly to it.
  const food = [];
  const chemBlobs = [];
  if (level === 1) {
    const fx = rand(180, w - 180);
    const fy = rand(180, h - 180);
    food.push({ x: fx, y: fy, value: 0.4, consumed: false, r: 14 });
    chemBlobs.push({ x: fx, y: fy, r: 160, amp: 1.0 });
  } else {
    for (let i = 0; i < 3; i++) {
      chemBlobs.push({ x: rand(120, w - 120), y: rand(120, h - 120), r: rand(80, 140), amp: rand(0.7, 1.0) });
    }
  }

  const adhesion = rasterizeGaussians(w, h, adhBlobs);
  const light    = rasterizeGaussians(w, h, lightBlobs);
  const chem     = rasterizeGaussians(w, h, chemBlobs);

  // Obstacles. Level 1 has none.
  const obstacle = new Uint8Array(w * h);
  const obstacleBlobs = [];
  if (level !== 1) {
    for (let i = 0; i < 5; i++) {
      obstacleBlobs.push({
        x: rand(80, w - 80),
        y: rand(80, h - 80),
        r: rand(30, 70),
      });
    }
    for (const ob of obstacleBlobs) {
      const x0 = Math.max(0, Math.floor(ob.x - ob.r));
      const y0 = Math.max(0, Math.floor(ob.y - ob.r));
      const x1 = Math.min(w, Math.ceil(ob.x + ob.r));
      const y1 = Math.min(h, Math.ceil(ob.y + ob.r));
      const r2 = ob.r * ob.r;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const dx = x - ob.x, dy = y - ob.y;
          if (dx * dx + dy * dy < r2) obstacle[y * w + x] = 1;
        }
      }
    }
  }

  // Starting position: on the substrate but a healthy distance from food so
  // the player has to walk up the chem gradient to engulf.
  let best = { x: w / 2, y: h / 2, v: -1 };
  for (let i = 0; i < 300; i++) {
    const x = rand(80, w - 80);
    const y = rand(80, h - 80);
    if (obstacle[Math.floor(y) * w + Math.floor(x)]) continue;
    let v = 0.6 * sample(adhesion, w, h, x, y);
    // Prefer somewhere food isn't.
    for (const f of food) {
      const dx = x - f.x, dy = y - f.y;
      const d = Math.hypot(dx, dy);
      v -= Math.max(0, 1 - d / 260) * 0.8;
    }
    if (v > best.v) best = { x, y, v };
  }

  return {
    w, h, level,
    adhesion, light, chem, obstacle,
    food,
    suggestedStart: { x: best.x, y: best.y },
    sample(field, x, y) { return sample(field, w, h, x, y); },
    isObstacle(x, y) {
      if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return true;
      return obstacle[Math.floor(y) * w + Math.floor(x)] === 1;
    },
    obstacleBlobs,
    blobs: { adhesion: adhBlobs, light: lightBlobs, chem: chemBlobs },
  };
}
