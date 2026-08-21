// silk/word/build.mjs — prebuild the data file the page loads on first paint.
//
//   node silk/word/build.mjs <handle-or-did> [--car path] [--k 12]
//   node silk/word/build.mjs --sync-stopwords
//
// This is a thin CLI. Every decision lives in engine.mjs, which is also what
// runs in the Web Worker when a visitor types their own handle — so the picture
// a stranger gets is built by the same rules as the one committed here, and the
// selftest asserts the two agree byte for byte.
//
// WHAT GOES IN THE OUTPUT, AND WHAT DOES NOT. Word types, their counts, their
// first and mean dates, and a topic assignment. NOT ONE SENTENCE OF POST TEXT.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCarParser, streamCarFile } from './car.mjs';
import { createCollector, analyzeCollected, resolveHandle, pdsFor, POST_TYPE, POST_FIELDS } from './engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : dflt;
};

// ─── regenerate the stopword module from rite/lexicon ───────────────────────
//
// The list lives in rite/lexicon/lexicons.js and must not fork. It used to be
// read from that file at build time; the browser has no filesystem, so it is
// now copied into stopwords.mjs and the selftest fails if the copy drifts.
if (argv.includes('--sync-stopwords')) {
  const src = readFileSync(join(ROOT, 'rite', 'lexicon', 'lexicons.js'), 'utf8');
  const raw = src.match(/STOPWORDS\s*=\s*new Set\(\s*`([\s\S]*?)`/)[1];
  const words = raw.split(/\s+/).filter(Boolean);
  const wrapped = words.join(' ').replace(/(.{1,76})(\s|$)/g, '$1\n').trimEnd();
  writeFileSync(join(HERE, 'stopwords.mjs'),
`// silk/word/stopwords.mjs — GENERATED. Do not edit by hand.
//
// Copied verbatim from rite/lexicon/lexicons.js so the two surfaces measure the
// same thing. It lives here as a module rather than being read out of that file
// at build time because this pipeline now also runs in a Web Worker, where
// there is no filesystem to read it from.
//
// Regenerate:  node silk/word/build.mjs --sync-stopwords
// The selftest fails if this drifts from rite/lexicon, so it cannot rot quietly.

export const STOPWORDS = new Set(\`
${wrapped}
\`.split(/\\s+/).filter(Boolean));
`);
  console.log(`wrote stopwords.mjs (${new Set(words).size} unique)`);
  process.exit(0);
}

const handle = argv.find((a) => !a.startsWith('--')) || 'minormobius.bsky.social';
const K = +arg('k', 12);
const carPath = arg('car', join(HERE, '.cache', 'repo.car'));

const did = await resolveHandle(handle);
if (!existsSync(carPath)) {
  const pds = await pdsFor(did);
  console.log(`fetching ${pds}/xrpc/com.atproto.sync.getRepo?did=${did}`);
  const r = await fetch(`${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`);
  if (!r.ok) throw new Error(`getRepo ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(carPath), { recursive: true });
  writeFileSync(carPath, buf);
  console.log(`  ${(buf.length / 1e6).toFixed(1)} MB → ${carPath}`);
}

// Streamed through the same parser and the same collector the Web Worker uses,
// off disk instead of off the network. Not for this machine's sake — node would
// cope with the whole file — but so that rebuilding data.json exercises the
// exact path a visitor's browser takes. A second, more comfortable code path
// here is how the two would drift.
console.log(`reading ${carPath}`);
const collector = createCollector();
const { blocks } = await streamCarFile(carPath, createCarParser({
  wantTypes: new Set([POST_TYPE]),
  keep: POST_FIELDS,
  onRecord: (rec) => collector.add(rec),
}));
console.log(`${blocks.toLocaleString()} blocks → ${collector.posts.toLocaleString()} posts`
  + ` (${collector.withWords.toLocaleString()} with words)`);

let last = '';
const out = analyzeCollected(collector, {
  handle, did, K,
  onProgress: ({ stage }) => { if (stage !== last) { last = stage; process.stdout.write(`  ${stage}…\n`); } },
});

const path = join(HERE, 'data.json');
writeFileSync(path, JSON.stringify(out));
console.log(`\nwrote ${path} (${(readFileSync(path).length / 1024).toFixed(0)} KB)`);
console.log(`${out.tokens.toLocaleString()} content tokens, ${out.types.toLocaleString()} types`);
console.log('wedges, in ring order:');
for (const s of out.sectors) {
  console.log(`  [${String(s.k).padStart(2)}] ${String(s.types).padStart(6)} types ${String(s.mass).padStart(7)} tokens  ${s.label.join(' ')}`);
}
