#!/usr/bin/env node
// build-moji-data.mjs — parse Unicode's emoji-test.txt into the compact JSON the
// moji wiki serves (moji/data/emoji.json).
//
// Source of truth is moji/data/emoji-test.txt (a pinned copy of
// https://unicode.org/Public/emoji/latest/emoji-test.txt). Re-download it with
//   curl -fsSL https://unicode.org/Public/emoji/latest/emoji-test.txt \
//        -o moji/data/emoji-test.txt
// then re-run this script. The output is committed so the site is fully static
// and self-contained — no build step at deploy time.
//
// We keep only the RGI set (status == fully-qualified): that is exactly the
// "all emoji" set a keyboard shows, including every skin-tone / gender variant,
// which are themselves fully-qualified sequences. Components (bare skin-tone and
// hair swatches) are modifiers, not standalone emoji, so they're dropped.
//
// Usage: node scripts/build-moji-data.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'moji', 'data', 'emoji-test.txt');
const OUT = join(ROOT, 'moji', 'data', 'emoji.json');

const raw = readFileSync(SRC, 'utf8');
const lines = raw.split('\n');

let version = '';
let date = '';
const groups = [];          // [{ name, subgroups: [{ name, idx: [emojiIndex...] }] }]
const emojis = [];          // flat list, index-stable
let gi = -1, si = -1;

// A data line: "1F600 ; fully-qualified # 😀 E1.0 grinning face"
// comment part after '#': "<glyph> E<major>.<minor> <name>"
const COMMENT = /^(\S+)\s+E(\d+\.\d+)\s+(.+)$/;

for (const line of lines) {
  const vm = line.match(/^#\s*Version:\s*([\d.]+)/);
  if (vm) { version = vm[1]; continue; }
  const dm = line.match(/^#\s*Date:\s*([\d-]+)/);
  if (dm) { date = dm[1]; continue; }

  const gm = line.match(/^#\s*group:\s*(.+?)\s*$/);
  if (gm) {
    groups.push({ name: gm[1], subgroups: [] });
    gi = groups.length - 1;
    si = -1;
    continue;
  }
  const sm = line.match(/^#\s*subgroup:\s*(.+?)\s*$/);
  if (sm) {
    groups[gi].subgroups.push({ name: sm[1], idx: [] });
    si = groups[gi].subgroups.length - 1;
    continue;
  }

  if (!line.trim() || line.startsWith('#')) continue;

  const semi = line.indexOf(';');
  if (semi === -1) continue;
  const cps = line.slice(0, semi).trim();
  const rest = line.slice(semi + 1);
  const hash = rest.indexOf('#');
  if (hash === -1) continue;
  const status = rest.slice(0, hash).trim();
  if (status !== 'fully-qualified') continue;      // RGI only

  const comment = rest.slice(hash + 1).trim();
  const cm = comment.match(COMMENT);
  if (!cm) continue;
  const [, glyph, ever, name] = cm;

  const id = cps.toLowerCase().split(/\s+/).join('-');   // canonical permalink id
  const rec = {
    e: glyph,                                    // the emoji glyph
    n: name,                                     // CLDR name
    v: ever,                                     // Emoji version introduced (e.g. "1.0")
    cp: cps.split(/\s+/).map(c => 'U+' + c),     // code points, display form
    id,                                          // hyphen-joined lowercase hex — the /e/<id> permalink
    g: gi,                                        // group index
    s: si,                                        // subgroup index (within group)
  };
  const eidx = emojis.length;
  emojis.push(rec);
  groups[gi].subgroups[si].idx.push(eidx);
}

// Sanity: ids must be unique (they key the permalinks).
const dup = new Map();
for (const em of emojis) dup.set(em.id, (dup.get(em.id) || 0) + 1);
const collisions = [...dup].filter(([, c]) => c > 1);
if (collisions.length) {
  console.error('FATAL: duplicate emoji ids:', collisions.slice(0, 10));
  process.exit(1);
}

// Drop empty subgroups/groups (e.g. the "Component" group, whose members are
// all `component`-status modifiers we filter out), then RE-INDEX: each emoji's
// g/s must point at its position in the cleaned arrays, not the original ones —
// the detail page reverse-looks-up group/subgroup names and siblings by g/s.
const cleanGroups = groups
  .map(g => ({ name: g.name, subgroups: g.subgroups.filter(s => s.idx.length).map(s => ({ name: s.name, idx: s.idx })) }))
  .filter(g => g.subgroups.length);
cleanGroups.forEach((g, gi2) => g.subgroups.forEach((s, si2) => {
  for (const ei of s.idx) { emojis[ei].g = gi2; emojis[ei].s = si2; }
}));

const out = {
  unicodeVersion: version,
  date,
  count: emojis.length,
  groups: cleanGroups,
  emojis,
};

writeFileSync(OUT, JSON.stringify(out));
const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
console.log(`✓ ${emojis.length} emoji · Unicode ${version} (${date}) · ${groups.length} groups → moji/data/emoji.json (${kb} KB)`);
