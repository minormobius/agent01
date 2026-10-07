// coast.js — the second kind of scene: a beach on the open sea, a headland with a lighthouse.
// Pure: node, browser, worker. Same contract as scene.js's lake (an index map, a palette of at most
// 256 entries, cycles, layers), so the light, the weather, the night sky and the page all work on it.
//
// What moves is the palette, as in the lake:
//   - THE SURF is one cycle of 16 phases laid across the sea's last stretch and up the beach. Each
//     pixel's phase is how far shoreward it is, so turning the cycle carries every crest in: lines of
//     breakers roll toward the beach, break into foam, and the foam runs up the sand and drains, the
//     wet sand shining behind it. The sea's half and the sand's half are two sets of the same 16
//     phases on one beat, so the wave that breaks is the wave that washes up. sound.js times each
//     breaker's crash from the same numbers (`surf`).
//   - the open sea is the lake's banded shimmer, with a glitter path under the sun and the moon;
//   - the lighthouse's beam sweeps by the clock: the beam's pixels are binned by side and distance
//     from the lamp, and each bin is lit for the angle the lamp has turned to (palette, not cycles);
//   - spray at the headland's foot is a short cycle, like the lake's foam.
// Boats and gulls are drawn over the frame (life.js), as the stars are.
import { W, H, mulberry32, hash2, clamp, smooth, lerp, fbm1, fbm2, ridge1, rock, dq, canvas, paintSky } from './scene.js';

// albedos: far land, the headland's rock, its grass, the dune grass, sand, deep and shallow water,
// the lighthouse's white and its bands, the cottage's roof
export const COASTS = {
  atlantic: { far: [0.40, 0.45, 0.50], cliff: [0.46, 0.44, 0.40], ground: [0.30, 0.42, 0.20], dune: [0.46, 0.48, 0.28], sand: [0.80, 0.72, 0.55], water: [0.05, 0.14, 0.18], shallow: [0.10, 0.27, 0.27], wall: [0.88, 0.86, 0.82], band: [0.62, 0.12, 0.10], roof: [0.24, 0.26, 0.30], skyTurn: 0 },
  tropic: { far: [0.30, 0.46, 0.36], cliff: [0.54, 0.46, 0.36], ground: [0.22, 0.48, 0.18], dune: [0.38, 0.52, 0.22], sand: [0.94, 0.88, 0.72], water: [0.02, 0.15, 0.26], shallow: [0.08, 0.50, 0.50], wall: [0.94, 0.92, 0.86], band: [0.12, 0.12, 0.14], roof: [0.62, 0.24, 0.14], skyTurn: 0 },
  nordic: { far: [0.36, 0.38, 0.44], cliff: [0.17, 0.17, 0.19], ground: [0.28, 0.38, 0.20], dune: [0.32, 0.38, 0.24], sand: [0.17, 0.17, 0.18], water: [0.04, 0.10, 0.14], shallow: [0.08, 0.17, 0.19], wall: [0.84, 0.84, 0.82], band: [0.56, 0.12, 0.10], roof: [0.14, 0.14, 0.16], skyTurn: 0 },
};

/** The surf's pattern by phases behind the crest: the sea's (foam > 0, the darker face < 0), the sand's. */
const CREST = 12;
const SEA = [1, 0.86, 0.62, 0.42, 0.28, 0.18, 0.12, 0.08, 0.05, 0, 0, 0, 0, -0.05, -0.12, -0.2];
const SAND = [[0.95, 1], [0.55, 1], [0.12, 1], [0, 0.92], [0, 0.8], [0, 0.66], [0, 0.52], [0, 0.4], [0, 0.3], [0, 0.22], [0, 0.17], [0, 0.14], [0, 0.12], [0, 0.12], [0, 0.14], [0, 0.2]];   // [foam, wet]
const SURF = 16, SURF_BEATS = 2;               // a wave every 16 / 2 = 8 beats: two bars of the music

export function generateCoast(seed = 1) {
  const rnd = mulberry32(seed * 7919 + 101);
  const S = (seed * 173 + 31) % 100000;
  const biome = Object.keys(COASTS)[Math.floor(rnd() * 3)], B = COASTS[biome];
  const LAYER = { sky: 0, far: 1, snow: 2, mid: 3, cliff: 4, fall: 5, tree: 6, cloud: 7, ground: 8, lake: 9, cabin: 10, sand: 11, beam: 12 };
  const cv = canvas(), { index, layer, entries, cycles, alloc, cycle, set } = cv;
  const bpm = 48 + Math.floor(rnd() * 18);
  const yH = Math.round(H * (0.5 + rnd() * 0.05));           // the sea's horizon: a true level line
  const headLeft = rnd() < 0.5;
  const cloudiness = 0.12 + rnd() * 0.32;
  const toX = (u) => (headLeft ? u : W - 1 - u);              // headland-side coordinates → screen
  const { core, NB, NH, elevAt } = paintSky(cv, yH, S, cloudiness, LAYER);
  const facing = (alb, depth, name, n = 8) => alloc(n, (i, nn) => ({ k: 'land', alb, nx: (i / (nn - 1)) * 2 - 1, depth, name }));
  const FAC = 8;

  // ---- far land on the horizon, across the bay: a low coast running out from the other side, and
  // sometimes an island
  const far = facing(B.far, 0.72, 'far');
  const farHt = new Float32Array(W);
  const reach = W * (0.28 + rnd() * 0.3), island = rnd() < 0.6 ? { u: W * (0.45 + rnd() * 0.25), w: 20 + rnd() * 40, h: 5 + rnd() * 7 } : null;
  for (let u = 0; u < W; u++) {
    const v = W - 1 - u;                                        // from the far side's edge
    let h = smooth(reach, reach * 0.55, v) * (6 + ridge1(u / 70, S + 5) * 16);
    if (island) h = Math.max(h, island.h * smooth(island.w, island.w * 0.3, Math.abs(u - island.u)) * (0.7 + 0.5 * ridge1(u / 25, S + 6)));
    farHt[toX(u)] = h;
  }
  for (let x = 0; x < W; x++) {
    const slope = (farHt[Math.min(W - 1, x + 2)] - farHt[Math.max(0, x - 2)]) / 4;
    for (let y = Math.floor(yH - farHt[x]); y < yH; y++) {
      const g = (rock((x + 1) * 0.06, y * 0.05, S + 7) - rock((x - 1) * 0.06, y * 0.05, S + 7)) * 6;
      set(x, y, far + dq((clamp(slope * 2 + g, -1, 1) + 1) / 2, FAC, x, y), LAYER.far);
    }
  }

  // ---- the headland: a rounded top, grass on it, a cliff face down to the sea, a stack offshore
  const hw = W * (0.3 + rnd() * 0.12);                        // how far it reaches across the view
  const topY = yH - H * (0.17 + rnd() * 0.1);
  const baseY = yH + 22 + Math.floor(rnd() * 14);             // where it stands in the water
  const cliff = facing(B.cliff, 0.1, 'cliff'), grass = facing(B.ground, 0.06, 'ground', 6);
  const headTop = new Float32Array(W).fill(Infinity);
  for (let u = 0; u < hw * 1.1; u++) {
    const edge = Math.pow(smooth(hw * 0.68, hw * 1.04, u), 0.7);
    headTop[u] = lerp(topY + fbm1(u * 0.025, S + 10) * 12 + (u / hw) * 8, baseY + 2, edge);
  }
  const stack = { u: hw * (1.12 + rnd() * 0.12), w: 5 + rnd() * 5, top: lerp(topY, baseY, 0.45 + rnd() * 0.25) };
  for (let u = Math.floor(stack.u - stack.w); u <= stack.u + stack.w; u++) {
    const d = Math.abs(u - stack.u) / stack.w;
    if (u >= 0 && u < W) headTop[u] = Math.min(headTop[u], stack.top + d * d * 14 + fbm1(u * 0.2, S + 11) * 4);
  }
  for (let u = 0; u < W; u++) {
    if (!(headTop[u] < baseY)) continue;
    const x = toX(u), slopeR = ((headTop[Math.min(W - 1, u + 2)] || baseY) - (headTop[Math.max(0, u - 2)] || baseY)) / 4;
    for (let y = Math.floor(headTop[u]); y < baseY + 2; y++) {
      const below = y - headTop[u];
      const g = (rock((u + 1) * 0.05, y * 0.02, S + 12) - rock((u - 1) * 0.05, y * 0.02, S + 12)) * 10;
      const strata = Math.floor(y / 9 + fbm1(u * 0.05, S + 13) * 2) % 2 ? 0.22 : -0.1;
      // the slope, in the screen's sense: a face falling seaward turns to the sea's side
      let nx = clamp((slopeR * 1.6 + g + strata) * (headLeft ? 1 : -1), -1, 1);
      if (below < 3 + 5 * fbm2(u * 0.05, 1, S + 14, 2) && Math.abs(slopeR) < 1.2) set(x, y, grass + dq((nx + 1) / 2, 6, x, y), LAYER.ground);
      else set(x, y, cliff + dq((nx + 1) / 2, FAC, x, y), LAYER.cliff);
    }
  }

  // ---- the sea: the lake's shimmer, bluer and rougher, shallow and turquoise toward the beach
  const LK = 10;
  const hl = (i) => [1, 0.15, 0, 0.35, 0, 0.7, 0.1, 0, 0.45, 0][i];
  const seaFar = alloc(LK, (i) => ({ k: 'lake', e: 0.45, hl: hl(i) * 0.8 }));
  const seaNear = alloc(LK, (i) => ({ k: 'lake', e: 0.12, hl: hl(i) }));
  const seaShallow = alloc(LK, (i) => ({ k: 'lake', e: 0.06, hl: hl(i), w: B.shallow }));
  const glit = alloc(NH, (i) => ({ k: 'glitter', b: i }));
  cycle(seaFar, LK, 0.75, 'sea far'); cycle(seaNear, LK, 1.25, 'sea'); cycle(seaShallow, LK, 1.5, 'shallows');
  // the shoreline: a bay, the beach running out to the headland's foot
  const shoreAt = new Float32Array(W), duneAt = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = headLeft ? x : W - 1 - x;
    shoreAt[x] = lerp(baseY + 8, H * (0.74 + fbm1(x * 0.008, S + 20) * 0.05), smooth(hw * 0.75, hw * 1.9, u));
    const hump = smooth(0.3, 0.75, fbm1(x / 110, S + 21, 3)) * 0.07 + fbm1(x * 0.03, S + 19, 3) * 0.012;
    duneAt[x] = Math.max(shoreAt[x] + 12, H * (0.93 - hump) - smooth(hw * 1.4, hw * 0.6, u) * H * 0.05);
  }
  // the surf: the sea's half and the sand's half, one cycle each, on one beat
  const surfSea = alloc(SURF, (i) => ({ k: 'surf', s: SEA[((CREST - i) % SURF + SURF) % SURF] }));
  const surfSand = alloc(SURF, (i) => { const [f, wet] = SAND[((CREST - i) % SURF + SURF) % SURF]; return { k: 'wash', s: f, wet }; });
  cycle(surfSea, SURF, SURF_BEATS, 'surf'); cycle(surfSand, SURF, SURF_BEATS, 'surf on the sand');
  const lineAt = (x) => fbm1(x * 0.006, S + 22) * 10 + fbm1(x * 0.03, S + 23) * 2.5;   // the wave lines' wander
  const colBucket = (x) => Math.min(NH - 1, Math.floor(x * NH / W));
  const deepY = H * 0.76 - yH;
  for (let y = yH; y < H; y++) for (let x = 0; x < W; x++) {
    if (y >= shoreAt[x] || layer[y * W + x] === LAYER.cliff || layer[y * W + x] === LAYER.ground) continue;
    const depth = (y - yH) / deepY;
    const wob = Math.sin(x * 0.05 + y * 0.8) * 1.6 + Math.sin(x * 0.017 - y * 0.3) * 2.2;
    const ph = (Math.floor(y * 0.7 + wob + hash2(x >> 3, y, S + 24) * 1.5) % LK + LK) % LK;
    const zone = Math.max(6, (shoreAt[x] - yH) * 0.32), d = shoreAt[x] - y;
    let id = (depth < 0.3 + hash2(x >> 2, y, S + 25) * 0.06 ? seaFar : d < zone * 1.6 + hash2(x >> 2, y, S + 26) * 4 ? seaShallow : seaNear) + ph;
    if (d < zone) {
      // in the surf: the phase is how far shoreward, so the cycle rolls the lines in; out where the
      // waves only begin to break, the foam comes and goes
      const inner = smooth(0.45, 0.1, d / zone);                // broken white water near the beach
      const phi = -(d / zone) * 40 + lineAt(x) + (hash2(x, y, S + 27) - 0.5) * (1.2 + inner * 5);
      if (hash2(x, y, S + 28) < 1.15 - d / zone) id = surfSea + ((Math.floor(phi) % SURF) + SURF) % SURF;
    }
    if (id < surfSea && depth < 0.75 && hash2(x >> 2, y, S + 29) < 0.2 * (1 - depth) && hash2(x, y, S + 30) < 0.7) id = glit + colBucket(x);
    set(x, y, id, LAYER.lake);
  }

  // ---- the beach: the swash zone (the surf's sand half), then dry sand rippled by the wind
  const sand = facing(B.sand, 0, 'sand', 6), dune = facing(B.dune, 0, 'dune', 6);
  for (let x = 0; x < W; x++) {
    const swash = Math.max(5, (shoreAt[x] - yH) * 0.16);
    for (let y = Math.floor(shoreAt[x]); y < H; y++) {
      if (layer[y * W + x] === LAYER.cliff || layer[y * W + x] === LAYER.ground) continue;
      const up = y - shoreAt[x];
      if (y >= duneAt[x]) {
        // the dunes: their faces by the ridge's slope, marram grass in tufts on the crests and backs
        const sl = (duneAt[Math.min(W - 1, x + 3)] - duneAt[Math.max(0, x - 3)]) / 6, below = y - duneAt[x];
        const t = fbm2(x * 0.06, y * 0.1, S + 40, 4) * 2 - 1, tuft = hash2(x, y, S + 41);
        const grassy = fbm2(x * 0.03, y * 0.05, S + 42, 3) + below / 30 - Math.abs(sl) * 0.6 > 0.5;
        // a blade of grass is a short vertical run: hashed per column, lit by its lean
        const blade = hash2(x, Math.floor((y + hash2(x, 0, S + 47) * 7) / 5), S + 48) < 0.55;
        if (grassy && blade && tuft < 0.85) set(x, y, dune + dq((clamp(t * 0.7 + (hash2(x, 1, S + 49) - 0.5) * 1.6, -1, 1) + 1) / 2, 6, x, y), LAYER.ground);
        else set(x, y, sand + dq((clamp(-sl * 1.2 * Math.exp(-below / 10) + t * 0.3, -0.7, 0.7) + 1) / 2, 6, x, y), LAYER.sand);
        continue;
      }
      if (up < swash * 1.4 && hash2(x, y, S + 43) < 1.4 - up / swash) {
        const phi = (up / swash) * 14 + lineAt(x) + (hash2(x, y, S + 44) - 0.5) * 0.8;
        set(x, y, surfSand + ((Math.floor(phi) % SURF) + SURF) % SURF, LAYER.sand); continue;
      }
      // the tide line: wrack (weed and shells) where the last high water left it, then dry sand
      // rippled by the wind, with a pebble or two
      const tide = swash * 1.9 + fbm1(x * 0.05, S + 52) * 4;
      if (Math.abs(up - tide) < 1.2 && hash2(x, y, S + 53) < 0.55) { set(x, y, sand + (hash2(x, y, S + 54) < 0.5 ? 0 : 1), LAYER.sand); continue; }
      if (hash2(x, y, S + 55) < 0.006) { set(x, y, sand + (hash2(x, y, S + 56) < 0.5 ? 0 : 5), LAYER.sand); continue; }
      const ripple = Math.sin(y * 1.3 + fbm2(x * 0.04, y * 0.06, S + 45, 3) * 8) * 0.5;
      set(x, y, sand + dq((clamp(ripple * 0.35 + (up > tide ? 0.15 : -0.1) + (hash2(x, y, S + 46) - 0.5) * 0.4, -1, 1) + 1) / 2, 6, x, y), LAYER.sand);
    }
  }

  // ---- spray at the headland's foot and round the stack: the lake's foam, faster
  const FOAM = 8, foam = alloc(FOAM, (i) => ({ k: 'foam', s: [1, 0.7, 0.45, 0.3, 0.55, 0.85, 0.4, 0.25][i] }));
  cycle(foam, FOAM, 4, 'spray');
  for (let u = 0; u < W; u++) {
    if (!(headTop[u] < baseY)) continue;
    const x = toX(u);
    for (let y = baseY - 4; y < baseY + 5; y++) {
      if (hash2(x, y, S + 50) > 0.75 - Math.abs(y - baseY) * 0.08) continue;
      const l = layer[y * W + x];
      if (l === LAYER.lake || (l === LAYER.cliff && y > baseY - 3)) set(x, y, foam + ((Math.floor(hash2(x >> 1, y, S + 51) * 3 + y * 0.5 + u * 0.13) % FOAM) + FOAM) % FOAM, LAYER.fall);
    }
  }

  // ---- the lighthouse: a tapering white tower with two bands, a gallery, the lantern and its lamp
  const lu = Math.round(hw * (0.42 + rnd() * 0.16)), lx = toX(lu), lBase = Math.round(headTop[lu] + 2);
  const tower = alloc(5, (i) => [
    { k: 'land', alb: B.wall, nx: -0.6, depth: 0.04, name: 'tower' }, { k: 'land', alb: B.wall, nx: 0.6, depth: 0.04, name: 'tower' },
    { k: 'land', alb: B.band, nx: -0.6, depth: 0.04, name: 'tower' }, { k: 'land', alb: B.band, nx: 0.6, depth: 0.04, name: 'tower' },
    { k: 'land', alb: [0.1, 0.1, 0.11], nx: 0, depth: 0.04, name: 'tower' }][i]);
  const lamp = alloc(1, () => ({ k: 'lamp' }));
  const TH = 30 + Math.floor(rnd() * 10);
  for (let r = 0; r < TH; r++) {
    const y = lBase - r, half = lerp(4.5, 3, r / TH), band = Math.floor(r / (TH / 5)) % 2 === 1;
    for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) if (Math.abs(dx) <= half) set(lx + dx, y, tower + (band ? 2 : 0) + (dx > 0 ? 1 : 0), LAYER.cabin);
  }
  const gy = lBase - TH;
  for (let dx = -5; dx <= 5; dx++) set(lx + dx, gy, tower + 4, LAYER.cabin);              // the gallery
  for (let r = 1; r <= 5; r++) for (let dx = -3; dx <= 3; dx++) set(lx + dx, gy - r, Math.abs(dx) === 3 ? tower + 4 : lamp, LAYER.cabin);
  for (let r = 6; r <= 8; r++) for (let dx = -(9 - r); dx <= 9 - r; dx++) set(lx + dx, gy - r, tower + 4, LAYER.cabin);   // the cap
  const ly = gy - 3;

  // ---- the keeper's cottage beside it
  const cabin = alloc(8, (i) => [
    { k: 'land', alb: B.wall, nx: 0, depth: 0.04, name: 'wall' }, { k: 'land', alb: B.wall, nx: -0.15, depth: 0.04, name: 'wall' },
    { k: 'land', alb: B.wall, nx: 0.85, depth: 0.04, name: 'side' }, { k: 'land', alb: B.roof, nx: -0.75, depth: 0.04, name: 'roof' },
    { k: 'land', alb: B.roof, nx: 0.75, depth: 0.04, name: 'roof' }, { k: 'window', ph: 0 }, { k: 'window', ph: 1 },
    { k: 'land', alb: [0.08, 0.06, 0.05], nx: 0, depth: 0.04, name: 'door' }][i]);
  const cu = Math.max(10, lu - 18 - Math.floor(rnd() * 8)), cx = toX(cu), cBase = Math.round(headTop[cu] + 3), cw = 16, ch = 8;
  for (let y = cBase - ch; y < cBase; y++) for (let x = cx - cw / 2; x < cx + cw / 2; x++) set(x, y, cabin + ((x + y) % 5 === 0 ? 1 : 0), LAYER.cabin);
  for (let r = 0; r < 7; r++) for (let x = cx - cw / 2 - 2 + r; x < cx + cw / 2 + 2 - r; x++) set(x, cBase - ch - 1 - r, cabin + (x > cx ? 4 : 3), LAYER.cabin);
  for (let y = cBase - 6; y < cBase - 2; y++) for (let x = cx - 5; x < cx - 1; x++) set(x, y, cabin + 5 + ((x + y) & 1), LAYER.cabin);
  for (let y = cBase - 6; y < cBase; y++) for (let x = cx + 2; x < cx + 5; x++) set(x, y, cabin + 7, LAYER.cabin);

  // ---- the beam: out to either side of the lamp, a thin cone over the sky, binned by side and
  // distance so the palette can sweep it (beam entries know the sky behind them)
  const BB = 8, beam = alloc(2 * BB, (i) => ({ k: 'beam', side: i < BB ? -1 : 1, d: ((i % BB) + 0.5) / BB, e: elevAt(ly) }));
  const blen = W * 0.95;
  for (const side of [-1, 1]) for (let dd = 4; dd < blen; dd++) {
    const x = lx + side * dd, half = 1.2 + dd * 0.035;
    if (x < 0 || x >= W) break;
    for (let y = Math.floor(ly - half); y <= ly + half; y++) {
      if (y < 0 || y >= yH - 1 || layer[y * W + x] !== LAYER.sky) continue;
      const bin = Math.min(BB - 1, Math.floor(dd / blen * BB + BAYER4(x, y) - 0.5));
      set(x, y, beam + (side < 0 ? 0 : BB) + Math.max(0, bin), LAYER.sky);
    }
  }

  if (entries.length > 256) throw new Error(`palette overflow: ${entries.length}`);
  const used = entries.length;
  while (entries.length < 256) entries.push({ k: 'unused' });
  // the surf, for the sound: the cycle position at which a crest reaches the break line (where the
  // foam begins, ~0.6 of the zone out) — index ≡ crest + pos (mod 16)
  const breakSlot = Math.floor(-0.6 * 40 + 6);
  return {
    kind: 'coast', seed, biome, W, H, index, entries, cycles, bpm, yH, cliffLeft: headLeft,
    path: { lo: core, NB, NH, rc: 6.5, day: null }, layer, LAYER,
    cabin: { x: cx, y: cBase }, waterfall: { x: lx, width: 0 }, lighthouse: { x: lx, y: ly, beam: [beam, BB], period: 12 },
    coast: { shoreAt, duneAt, baseY, headLeft, hw, stack: toX(Math.round(stack.u)) },
    surf: { lo: surfSea, len: SURF, perBeat: SURF_BEATS, breakPos: ((breakSlot - CREST) % SURF + SURF) % SURF },
    slots: { glitter: glit, fireflies: glit, fall: foam },
    used, skyTurn: B.skyTurn, water: B.water, shallow: B.shallow, sand: B.sand, midAlb: B.far,
  };
}
const BAYER4 = (x, y) => [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16 + 1 / 32;
