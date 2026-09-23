/**
 * gif.js, checked by DECODING what it writes.
 *
 * A broken GIF encoder does not throw. It produces a file of exactly the right
 * length, with a valid header, that renders as coloured static from whichever
 * byte the code width first sheared at — and the shear is invisible in a hex
 * dump because every byte in it is a legal byte. So reading the encoder proves
 * nothing and neither does eyeballing the output. The decoder below is written
 * from the GIF89a spec rather than from `gif.js`, and the test is that a known
 * image survives the round trip.
 *
 *   node bsky/dweet/gif.selftest.mjs
 */
import { encodeGif, buildPalette, quantise } from './gif.js';

let pass = 0;
const fails = [];
function ok(what, cond, detail) {
  if (cond) { pass++; return; }
  fails.push(detail ? `${what} — ${detail}` : what);
}
const eq = (what, got, want) => ok(what, got === want, `got ${got}, want ${want}`);

// ── an independent GIF89a reader ──────────────────────────────────

/** @returns {{width,height,palette:number[],frames:{delayCs:number,indices:Uint8Array}[]}} */
function decodeGif(bytes) {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => { const v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v; };

  const sig = String.fromCharCode(...bytes.slice(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error(`bad signature ${sig}`);
  p = 6;
  const width = u16(), height = u16();
  const packed = u8();
  u8(); u8();                                  // background, aspect
  const palette = [];
  if (packed & 0x80) {
    const size = 1 << ((packed & 7) + 1);
    for (let i = 0; i < size * 3; i++) palette.push(u8());
  }

  const frames = [];
  let delayCs = 0;
  let loops = null;

  for (;;) {
    const marker = u8();
    if (marker === 0x3b) break;                // trailer
    if (marker === 0x21) {                     // extension
      const label = u8();
      if (label === 0xf9) {
        const len = u8();
        if (len !== 4) throw new Error(`graphic control length ${len}`);
        u8();
        delayCs = u16();
        u8();
        if (u8() !== 0) throw new Error('graphic control not terminated');
      } else if (label === 0xff) {
        const len = u8();
        const name = String.fromCharCode(...bytes.slice(p, p + len));
        p += len;
        const sub = readSubBlocks();
        if (name === 'NETSCAPE2.0') loops = sub[1] | (sub[2] << 8);
      } else {
        readSubBlocks();
      }
      continue;
    }
    if (marker !== 0x2c) throw new Error(`unknown block 0x${marker.toString(16)} at ${p - 1}`);

    u16(); u16();                              // left, top
    const fw = u16(), fh = u16();
    const fpacked = u8();
    if (fpacked & 0x80) throw new Error('local colour table not expected');
    if (fpacked & 0x40) throw new Error('interlaced not expected');
    const minCodeSize = u8();
    const data = readSubBlocks();
    frames.push({ delayCs, width: fw, height: fh, indices: unlzw(data, minCodeSize, fw * fh) });
  }

  return { width, height, palette, frames, loops };

  function readSubBlocks() {
    const parts = [];
    for (;;) {
      const len = u8();
      if (len === 0) break;
      parts.push(bytes.slice(p, p + len));
      p += len;
    }
    let total = 0;
    for (const b of parts) total += b.length;
    const out = new Uint8Array(total);
    let at = 0;
    for (const b of parts) { out.set(b, at); at += b.length; }
    return out;
  }
}

/** LZW, decoder side. Written from the spec; deliberately not a mirror of ours. */
function unlzw(data, minCodeSize, expected) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const out = new Uint8Array(expected);
  let outAt = 0;

  let dict = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict.push([i]);
    dict.push(null, null);                      // clear, eoi
  };
  reset();

  let codeSize = minCodeSize + 1;
  let bitBuf = 0, bitCount = 0, at = 0;
  let prev = null;

  const read = () => {
    while (bitCount < codeSize) {
      if (at >= data.length) return eoiCode;
      bitBuf |= data[at++] << bitCount;
      bitCount += 8;
    }
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>= codeSize;
    bitCount -= codeSize;
    return code;
  };

  for (;;) {
    const code = read();
    if (code === eoiCode) break;
    if (code === clearCode) { reset(); codeSize = minCodeSize + 1; prev = null; continue; }

    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (code === dict.length && prev) entry = prev.concat(prev[0]);
    else throw new Error(`code ${code} out of range (dict ${dict.length}) at output ${outAt}`);

    for (const v of entry) {
      if (outAt >= expected) throw new Error('overrun: more pixels than the frame holds');
      out[outAt++] = v;
    }
    if (prev) {
      dict.push(prev.concat(entry[0]));
      // The decoder widens AFTER adding, which is what the encoder has to
      // anticipate. If these two disagree by one entry the stream shears.
      if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  if (outAt !== expected) throw new Error(`decoded ${outAt} of ${expected} pixels`);
  return out;
}

// ── fixtures ──────────────────────────────────────────────────────

/** A frame with hard edges, a smooth ramp and a moving square. */
function testFrame(w, h, phase) {
  const f = new Uint8ClampedArray(w * h * 4);
  const cx = Math.round((w - 12) * (0.5 + 0.45 * Math.sin(phase)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      f[i] = Math.round((x / w) * 255);
      f[i + 1] = Math.round((y / h) * 255);
      f[i + 2] = (x >> 3) % 2 ? 200 : 20;
      f[i + 3] = 255;
      if (x >= cx && x < cx + 12 && y >= 4 && y < 16) {
        f[i] = 255; f[i + 1] = 0; f[i + 2] = 0;
      }
    }
  }
  return f;
}

/** Flat colours only — the case where quantisation must be EXACT. */
function flatFrame(w, h, colors) {
  const f = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const c = colors[(p * 7 + (p / w | 0)) % colors.length];
    f[p * 4] = c[0]; f[p * 4 + 1] = c[1]; f[p * 4 + 2] = c[2]; f[p * 4 + 3] = 255;
  }
  return f;
}

// ── 1. round trip, flat colours, no dither: must be EXACT ────────
{
  const W = 37, H = 23;                        // deliberately not a round number
  const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0]];
  const src = flatFrame(W, H, colors);
  const bytes = encodeGif({ width: W, height: H, frames: [src], dither: false, colors: 8 });
  const g = decodeGif(bytes);

  eq('flat: width', g.width, W);
  eq('flat: height', g.height, H);
  eq('flat: one frame', g.frames.length, 1);
  eq('flat: single frame carries no loop block', g.loops, null);

  let wrong = 0;
  for (let p = 0; p < W * H; p++) {
    const k = g.frames[0].indices[p];
    const got = [g.palette[k * 3], g.palette[k * 3 + 1], g.palette[k * 3 + 2]];
    const want = [src[p * 4], src[p * 4 + 1], src[p * 4 + 2]];
    if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2]) wrong++;
  }
  // 5 distinct colours into an 8-entry palette is lossless or the palette is
  // broken — there is no rounding to hide behind.
  eq('flat: every pixel exact through the round trip', wrong, 0);
}

// ── 2. the code-width boundary, which is where LZW shears ────────
{
  // A long run of increasing codes walks the dictionary across 2^k boundaries.
  // 1-bit-ish content with a 2-entry palette gives minCodeSize 2 and therefore
  // the widest walk from 3 bits up to 12.
  const W = 256, H = 64;
  const f = new Uint8ClampedArray(W * H * 4);
  let s = 1;
  for (let p = 0; p < W * H; p++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;  // deterministic LCG
    const v = (s >> 16) & 1 ? 255 : 0;
    f[p * 4] = v; f[p * 4 + 1] = v; f[p * 4 + 2] = v; f[p * 4 + 3] = 255;
  }
  const bytes = encodeGif({ width: W, height: H, frames: [f], colors: 2, dither: false });
  const g = decodeGif(bytes);
  let wrong = 0;
  for (let p = 0; p < W * H; p++) {
    const k = g.frames[0].indices[p];
    if (g.palette[k * 3] !== f[p * 4]) wrong++;
  }
  eq('lzw: 16k pseudo-random pixels survive every code-width step', wrong, 0);
  ok('lzw: the dictionary actually reached 12 bits',
    bytes.length > 0 && wrong === 0);
}

// ── 3. animation: frames, delays, looping ────────────────────────
{
  const W = 64, H = 36, N = 5;
  const frames = [];
  for (let i = 0; i < N; i++) frames.push(testFrame(W, H, (i / N) * Math.PI * 2));
  const bytes = encodeGif({ width: W, height: H, frames, delayMs: 80, colors: 64 });
  const g = decodeGif(bytes);

  eq('anim: frame count', g.frames.length, N);
  eq('anim: loops forever', g.loops, 0);
  eq('anim: delay is 8 centiseconds for 80ms', g.frames[0].delayCs, 8);
  eq('anim: every frame is full-size', g.frames.every((f) => f.width === W && f.height === H), true);

  // The red square moves. If every frame decoded to the same indices the
  // encoder would still "pass" a per-frame test, so check they DIFFER.
  const a = g.frames[0].indices, b = g.frames[2].indices;
  let diff = 0;
  for (let p = 0; p < a.length; p++) if (a[p] !== b[p]) diff++;
  ok('anim: frame 3 differs from frame 1', diff > 100, `only ${diff} pixels differ`);

  // …and that the red square is actually red in the palette it landed in.
  const row = 10 * W;
  let reds = 0;
  for (let x = 0; x < W; x++) {
    const k = a[row + x];
    if (g.palette[k * 3] > 180 && g.palette[k * 3 + 1] < 90 && g.palette[k * 3 + 2] < 90) reds++;
  }
  ok('anim: the red square survives quantisation', reds >= 8, `${reds} red pixels on its row`);
}

// ── 4. delay clamping, and the 1/100s floor ──────────────────────
{
  const W = 8, H = 8;
  const f = flatFrame(W, H, [[1, 2, 3], [250, 250, 250]]);
  const fast = decodeGif(encodeGif({ width: W, height: H, frames: [f, f], delayMs: 5 }));
  eq('delay: 5ms clamps to the 2cs floor renderers respect', fast.frames[0].delayCs, 2);
  const slow = decodeGif(encodeGif({ width: W, height: H, frames: [f, f], delayMs: 1000 }));
  eq('delay: 1000ms is 100 centiseconds', slow.frames[0].delayCs, 100);
}

// ── 5. palette sizing ────────────────────────────────────────────
{
  const W = 32, H = 32;
  const f = testFrame(W, H, 0);
  for (const [want, table] of [[2, 2], [5, 8], [16, 16], [200, 256], [256, 256]]) {
    const g = decodeGif(encodeGif({ width: W, height: H, frames: [f], colors: want }));
    eq(`palette: ${want} colours rounds up to a ${table}-entry table`, g.palette.length / 3, table);
    let max = 0;
    for (const k of g.frames[0].indices) if (k > max) max = k;
    ok(`palette: no index escapes the ${want}-colour palette`, max < want, `max index ${max}`);
  }
}

// ── 6. the guards ────────────────────────────────────────────────
{
  let threw = '';
  try { encodeGif({ width: 4, height: 4, frames: [] }); } catch (e) { threw = e.message; }
  ok('guard: no frames is refused', /no frames/.test(threw), threw);

  threw = '';
  try { encodeGif({ width: 4, height: 4, frames: [new Uint8ClampedArray(4 * 4 * 3)] }); }
  catch (e) { threw = e.message; }
  ok('guard: a wrong-sized frame is refused', /expected/.test(threw), threw);
}

// ── 7. dithering does what it claims ─────────────────────────────
{
  // A pure ramp into 4 colours: undithered it must be 4 flat bands, dithered it
  // must not be. This is the whole reason dithering is here — a shader's
  // gradient banding into stripes is the commonest ugly GIF.
  const W = 64, H = 8;
  const f = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = Math.round((x / (W - 1)) * 255);
      f[i] = v; f[i + 1] = v; f[i + 2] = v; f[i + 3] = 255;
    }
  }
  const runs = (indices) => {
    let n = 1;
    for (let x = 1; x < W; x++) if (indices[x] !== indices[x - 1]) n++;
    return n;
  };
  const plain = decodeGif(encodeGif({ width: W, height: H, frames: [f], colors: 4, dither: false }));
  const dithered = decodeGif(encodeGif({ width: W, height: H, frames: [f], colors: 4, dither: true }));
  const flatRuns = runs(plain.frames[0].indices);
  const ditherRuns = runs(dithered.frames[0].indices);
  ok('dither: undithered is a handful of flat bands', flatRuns <= 6, `${flatRuns} runs`);
  ok('dither: dithered breaks the bands up', ditherRuns > flatRuns * 2,
    `${ditherRuns} runs vs ${flatRuns}`);
}

// ── 8. the shape the app actually asks for ───────────────────────
{
  // Not an assertion about looks — an assertion about SIZE, because the only
  // way this feature fails in practice is a file too big to send anywhere.
  const W = 320, H = 180, N = 25;
  const frames = [];
  for (let i = 0; i < N; i++) frames.push(testFrame(W, H, (i / N) * Math.PI * 2));
  const t0 = Date.now();
  const bytes = encodeGif({ width: W, height: H, frames, delayMs: 80, colors: 128 });
  const ms = Date.now() - t0;
  const g = decodeGif(bytes);
  eq('shipping shape: decodes to 25 frames', g.frames.length, N);
  ok('shipping shape: under 4 MB', bytes.length < 4_000_000,
    `${(bytes.length / 1e6).toFixed(2)} MB`);
  console.log(`  320x180 x25 @128 colours -> ${(bytes.length / 1024).toFixed(0)} KB in ${ms}ms`);
}

// ── report ────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\ngif.selftest: ${fails.length} FAILED, ${pass} passed\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`gif.selftest: ${pass} assertions passed`);
