#!/usr/bin/env node
// png.selftest.mjs — the decoder, with PNGs built here rather than fetched.
//
// The unfiltering is the part worth pinning. Every PNG filter is defined
// against the ALREADY-RECONSTRUCTED bytes above and to the left, so a decoder
// that skips it still produces plausible-looking numbers — and those numbers
// make a flat image look busy, which is the exact direction that turns this
// check into a no-op. So the fixtures below deliberately use every filter type,
// on an image whose true content is known.

import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePng, inkStats, looksBlank } from './png.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

const crcTable = (() => {
  const tbl = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tbl[i] = c;
  }
  return tbl;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Build an 8-bit RGB PNG from a pixel function, choosing a filter per row. */
function makePng(w, h, px, filterFor = () => 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = w * 3;
  const truth = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      truth[y * stride + x * 3] = r; truth[y * stride + x * 3 + 1] = g; truth[y * stride + x * 3 + 2] = b;
    }
  }
  const rows = [];
  for (let y = 0; y < h; y++) {
    const f = filterFor(y);
    const line = Buffer.alloc(stride + 1);
    line[0] = f;
    for (let x = 0; x < stride; x++) {
      const cur = truth[y * stride + x];
      const a = x >= 3 ? truth[y * stride + x - 3] : 0;
      const b = y > 0 ? truth[(y - 1) * stride + x] : 0;
      const c = x >= 3 && y > 0 ? truth[(y - 1) * stride + x - 3] : 0;
      let v;
      switch (f) {
        case 0: v = cur; break;
        case 1: v = cur - a; break;
        case 2: v = cur - b; break;
        case 3: v = cur - ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = cur - ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
          break;
        }
        default: throw new Error('bad filter');
      }
      line[x + 1] = v & 0xff;
    }
    rows.push(line);
  }
  return {
    png: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
    ]),
    truth,
  };
}

t('decodes a flat image', () => {
  const { png } = makePng(8, 8, () => [14, 14, 17]);
  const img = decodePng(png);
  assert.equal(img.width, 8); assert.equal(img.height, 8); assert.equal(img.channels, 3);
  assert.deepEqual([...img.data.subarray(0, 3)], [14, 14, 17]);
});

// EVERY FILTER. A decoder that mishandles one of these still returns numbers,
// and the numbers look like a picture.
t('reconstructs exactly, under all five filter types', () => {
  const px = (x, y) => [(x * 31 + y * 7) & 0xff, (x * 5) & 0xff, (y * 11 + 3) & 0xff];
  for (const f of [0, 1, 2, 3, 4]) {
    const { png, truth } = makePng(16, 12, px, () => f);
    assert.ok(decodePng(png).data.equals(truth), `filter ${f} did not round-trip`);
  }
  // Mixed per row, which is what a real encoder emits.
  const { png, truth } = makePng(16, 12, px, (y) => y % 5);
  assert.ok(decodePng(png).data.equals(truth), 'mixed filters did not round-trip');
});

t('refuses what it cannot read instead of guessing', () => {
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
  assert.throws(() => decodePng('a string'), /not a PNG/);
});

t('inkStats separates a flat image from a busy one', () => {
  const flat = decodePng(makePng(64, 64, () => [14, 14, 17]).png);
  const busy = decodePng(makePng(64, 64, (x, y) => [x * 4, y * 4, (x ^ y) * 3]).png);
  const fs = inkStats(flat), bs = inkStats(busy);
  assert.equal(fs.distinct, 1);
  assert.equal(fs.topShare, 1);
  assert.ok(bs.distinct > 20, `busy image only had ${bs.distinct} colours`);
  assert.ok(bs.topShare < 0.5);
});

// A page that is one flat rectangle is the failure this exists for. A page with
// a little content on a large background is NOT, and calling it blank would
// cost somebody a working build.
t('looksBlank fires on empty and stays quiet on sparse', () => {
  assert.equal(looksBlank({ distinct: 1, topShare: 1 }), true);
  assert.equal(looksBlank({ distinct: 3, topShare: 0.999 }), true);
  // Measured from the real estate: the sparsest published page.
  assert.equal(looksBlank({ distinct: 67, topShare: 0.9511 }), false, 'tube-stacker must not trip it');
  assert.equal(looksBlank({ distinct: 140, topShare: 0.63 }), false);
  // Right at the edge: lots of one colour, but real content in it.
  assert.equal(looksBlank({ distinct: 20, topShare: 0.999 }), false);
});

t('quantisation stops an anti-aliased gradient reading as thousands of colours', () => {
  // 8 bits per channel unquantised would be ~4000 distinct here.
  const grad = decodePng(makePng(64, 64, (x) => [x * 4, x * 4, x * 4]).png);
  assert.ok(inkStats(grad).distinct <= 16, `got ${inkStats(grad).distinct}`);
});

console.log(`\npng.selftest: ${n} checks passed`);
