#!/usr/bin/env node
// build-uni-data.mjs — parse the Unicode Character Database (UCD) into the
// block-partitioned JSON the uni browser serves.
//
// Source of truth: uni/data/ucd/*.txt, pinned copies of
//   https://www.unicode.org/Public/UCD/latest/ucd/{UnicodeData,Blocks,Scripts,DerivedAge}.txt
// Re-download those, then re-run this script. Output is committed → the site is
// fully static, no build at deploy time.
//
// The scale problem: ~150k assigned codepoints, but ~100k of them are CJK /
// Hangul / Tangut ideographs that UnicodeData.txt represents as First/Last range
// markers and names ALGORITHMICALLY. We store those ranges, not the chars — the
// client generates names via uni/lib/uni.js. Only the ~40k explicitly-named
// codepoints get stored, partitioned by block so each block page loads just its
// own slice.
//
// Outputs (all under uni/data/):
//   meta.json          — version + counts
//   blocks.json        — [{name,slug,start,end,plane,kind,assigned}] (~330)
//   blocks/<slug>.json — [[cp,name,gc], …] for each NAMED block
//   index.json         — [[cp,name,blockIdx], …] search index over named chars
//   ranges.json        — {scripts:[[s,e,name]], ages:[[s,e,ver]]} for char detail

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UCD = join(ROOT, 'uni', 'data', 'ucd');
const OUT = join(ROOT, 'uni', 'data');
const rd = (f) => readFileSync(join(UCD, f), 'utf8');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ── Blocks.txt → block list ──
const blocks = [];
for (const line of rd('Blocks.txt').split('\n')) {
  const m = line.match(/^([0-9A-F]+)\.\.([0-9A-F]+);\s*(.+?)\s*$/);
  if (!m) continue;
  const start = parseInt(m[1], 16), end = parseInt(m[2], 16);
  blocks.push({ name: m[3], slug: slugify(m[3]), start, end, plane: start >> 16, kind: null, assigned: 0 });
}
blocks.sort((a, b) => a.start - b.start);
const blockOf = (cp) => {
  let lo = 0, hi = blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < blocks[mid].start) hi = mid - 1;
    else if (cp > blocks[mid].end) lo = mid + 1;
    else return mid;
  }
  return -1;
};

// ── UnicodeData.txt → named chars + algorithmic ranges ──
const KIND = (label) =>
  /CJK Ideograph/.test(label) ? 'cjk' :
  /Tangut Ideograph/.test(label) ? 'tangut' :
  /Hangul Syllable/.test(label) ? 'hangul' :
  /Khitan Small Script/.test(label) ? 'khitan' :
  /Nushu/.test(label) ? 'nushu' :
  /Private Use/.test(label) ? 'pua' :
  /Surrogate/.test(label) ? 'surrogate' : 'other';

const named = [];              // { cp, name, gc }
const algoRanges = [];         // { start, end, kind }
let pendingFirst = null;

for (const line of rd('UnicodeData.txt').split('\n')) {
  if (!line) continue;
  const f = line.split(';');
  const cp = parseInt(f[0], 16);
  const rawName = f[1];
  const gc = f[2];
  const u1name = f[10];        // Unicode 1.0 name — the readable label for controls

  if (/, First>$/.test(rawName)) { pendingFirst = { cp, label: rawName }; continue; }
  if (/, Last>$/.test(rawName)) {
    if (pendingFirst) algoRanges.push({ start: pendingFirst.cp, end: cp, kind: KIND(pendingFirst.label) });
    pendingFirst = null;
    continue;
  }

  // A normal (individually-named) codepoint. Controls have name "<control>":
  // surface the Unicode 1.0 name (NULL, BELL, …) so they're searchable/labelled.
  let name = rawName;
  if (name.startsWith('<') && name.endsWith('>')) name = u1name ? u1name : name;
  named.push({ cp, name, gc });
}

// ── assign algorithmic kind + counts to blocks ──
for (const r of algoRanges) {
  const bi = blockOf(r.start);
  if (bi >= 0) {
    blocks[bi].kind = r.kind;
    blocks[bi].assigned = r.end - r.start + 1;
  }
}
// bucket named chars into their blocks
const blockChars = new Map();  // blockIdx -> [[cp,name,gc]]
for (const n of named) {
  const bi = blockOf(n.cp);
  if (bi < 0) continue;
  if (blocks[bi].kind) continue;          // algorithmic block — don't store per-char
  if (!blockChars.has(bi)) blockChars.set(bi, []);
  blockChars.get(bi).push([n.cp, n.name, n.gc]);
}
for (const [bi, arr] of blockChars) { arr.sort((a, b) => a[0] - b[0]); blocks[bi].assigned = arr.length; }

// ── interval tables (Scripts + DerivedAge) ──
function parseIntervals(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const s = line.split('#')[0].trim();
    if (!s) continue;
    const m = s.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(.+?)\s*$/);
    if (!m) continue;
    const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a;
    out.push([a, b, m[3]]);
  }
  out.sort((x, y) => x[0] - y[0]);
  return out;
}
const scripts = parseIntervals(rd('Scripts.txt'));
const ages = parseIntervals(rd('DerivedAge.txt'));

// Unicode version = highest age seen (e.g. "16.0")
const unicodeVersion = ages.map(a => a[2]).sort((a, b) => parseFloat(b) - parseFloat(a))[0];

// ── emit ──
rmSync(join(OUT, 'blocks'), { recursive: true, force: true });
mkdirSync(join(OUT, 'blocks'), { recursive: true });

// keep only blocks that have something (assigned>0); reserved-empty blocks stay
// listed too (they're real), but mark them.
// a handful of assigned sample codepoints per block, spread across it, for the
// home-page cards (printable chars only — skip controls/format/surrogate).
const NONPRINT = new Set(['Cc', 'Cf', 'Cs', 'Zl', 'Zp']);
function samplesFor(bi, b) {
  let pool;
  if (b.kind === 'pua' || b.kind === 'surrogate') return [];
  if (b.kind) {
    pool = [];
    for (let cp = b.start; cp <= b.end; cp++) pool.push(cp);   // algorithmic: all assigned
  } else {
    pool = (blockChars.get(bi) || []).filter(e => !NONPRINT.has(e[2])).map(e => e[0]);
  }
  if (!pool.length) return [];
  const n = Math.min(6, pool.length);
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.floor(i * (pool.length - 1) / Math.max(1, n - 1))]);
  return [...new Set(out)];
}
const blocksOut = blocks.map((b, i) => ({
  name: b.name, slug: b.slug, start: b.start, end: b.end,
  plane: b.plane, kind: b.kind, assigned: b.assigned, samples: samplesFor(i, b),
}));
writeFileSync(join(OUT, 'blocks.json'), JSON.stringify(blocksOut));

// per-named-block files
for (const [bi, arr] of blockChars) {
  writeFileSync(join(OUT, 'blocks', blocks[bi].slug + '.json'), JSON.stringify(arr));
}

// search index over named chars (skip surrogates — not real chars)
const index = named
  .filter(n => n.gc !== 'Cs')
  .map(n => [n.cp, n.name, blockOf(n.cp)]);
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

writeFileSync(join(OUT, 'ranges.json'), JSON.stringify({ scripts, ages }));

// Honest counts: real graphic/assigned characters exclude Private-Use (reserved,
// not assigned characters) and surrogates (not characters at all).
const sumAlgo = (pred) => algoRanges.filter(pred).reduce((a, r) => a + (r.end - r.start + 1), 0);
const ideographCount = sumAlgo(r => r.kind !== 'pua' && r.kind !== 'surrogate');
const puaCount = sumAlgo(r => r.kind === 'pua');
const assignedCount = named.length + ideographCount;   // real assigned code points
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({
  unicodeVersion,
  blockCount: blocks.length,
  assignedCount,                 // named + algorithmically-named ideographs
  namedCount: named.length,      // individually named (incl. controls)
  ideographCount,                // CJK / Hangul / Tangut / … (algorithmic names)
  puaCount,                      // private-use code points (reserved)
  generatedFrom: 'UCD latest',
}));

const kb = (p) => (readFileSync(join(OUT, p)).length / 1024).toFixed(0);
console.log(`✓ Unicode ${unicodeVersion}`);
console.log(`  ${named.length.toLocaleString()} named + ${ideographCount.toLocaleString()} ideographs = ${assignedCount.toLocaleString()} assigned across ${blocks.length} blocks (+${puaCount.toLocaleString()} private-use)`);
console.log(`  blocks.json ${kb('blocks.json')}KB · index.json ${kb('index.json')}KB · ranges.json ${kb('ranges.json')}KB · ${blockChars.size} block files`);
