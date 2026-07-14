// Node selftest for uni/lib/uni.js — run before touching the shared helpers:
//   node uni/lib/uni.selftest.mjs
import UNI from './uni.js';

let fail = 0;
const eq = (got, want, label) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.error(`✗ ${label}: got ${g}, want ${w}`); fail++; }
};

// encodings: 'A' (U+0041)
const A = UNI.encodings(0x41);
eq(A.utf8, '41', 'A utf8');
eq(A.utf16, '0041', 'A utf16');
eq(A.htmlHex, '&#x0041;', 'A htmlHex');

// € U+20AC (3-byte utf8)
const euro = UNI.encodings(0x20AC);
eq(euro.utf8, 'E2 82 AC', '€ utf8');
eq(euro.urlEncoded, '%E2%82%AC', '€ url');

// 😀 U+1F600 (4-byte, surrogate pair)
const grin = UNI.encodings(0x1F600);
eq(grin.utf8, 'F0 9F 98 80', '😀 utf8');
eq(grin.utf16, 'D83D DE00', '😀 utf16 surrogate pair');
eq(grin.jsEscape, '\\uD83D\\uDE00', '😀 js surrogate escape');
eq(grin.jsEs6, '\\u{1F600}', '😀 js es6 escape');
eq(grin.pyEscape, '\\U0001F600', '😀 python escape');

// algorithmic names
eq(UNI.algorithmicName(0x4E00, 'cjk'), 'CJK UNIFIED IDEOGRAPH-4E00', 'cjk name');
eq(UNI.algorithmicName(0xAC00, 'hangul'), 'HANGUL SYLLABLE GA', 'hangul GA');
eq(UNI.algorithmicName(0xC544, 'hangul'), 'HANGUL SYLLABLE A', 'hangul A (silent ieung)');
eq(UNI.algorithmicName(0xD7A3, 'hangul'), 'HANGUL SYLLABLE HIH', 'hangul last');
eq(UNI.algorithmicName(0x17000, 'tangut'), 'TANGUT IDEOGRAPH-17000', 'tangut name');

// category + plane
eq(UNI.categoryName('Lu'), 'Uppercase Letter', 'category Lu');
eq(UNI.planeName(0x1F600), 'Supplementary Multilingual Plane', 'plane of emoji');
eq(UNI.glyph(0x41), 'A', 'glyph A');
eq(UNI.glyph(0xD800), '', 'glyph surrogate empty');

if (fail) { console.error(`\n${fail} check(s) failed`); process.exit(1); }
console.log('✓ uni/lib/uni.js — all checks passed');
