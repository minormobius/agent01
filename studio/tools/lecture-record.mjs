#!/usr/bin/env node
// lecture-record.mjs — the record "The Minormobius Lectures" reads (lecture/record.js, GENERATED, and the
// faces in lecture/faces/): minormobius's public Bluesky repo (a CAR, com.atproto.sync.getRepo, no auth)
// reduced to counts per month, the closest accounts per era with their profile pictures, a sample of his
// own top-level posts per era for the orb, the quoted posts exactly, and this repository's history
// (commits per month; the month each served directory first appeared). Needs the network and a full
// clone (`git fetch --unshallow`), and python3 with Pillow (to shrink the pictures). Only his own posts are
// quoted, with their own pictures; other accounts appear by handle and face.
//
//   node studio/tools/lecture-record.mjs [--car path/to/repo.car]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { uvarint, cidLength, hex, decode } from '../../packages/atproto/car.js';
import { ERAS, QUOTED, HANDLE } from '../lecture/script.js';

const here = dirname(fileURLToPath(import.meta.url)), OUT = join(here, '..', 'lecture'), ROOT = join(here, '..', '..');
const api = (p) => fetch('https://public.api.bsky.app/xrpc/' + p).then((r) => r.json());
if (execSync('git rev-parse --is-shallow-repository', { cwd: ROOT }).toString().trim() === 'true') throw new Error('shallow clone: git fetch --unshallow first');

// ---- the repo ----------------------------------------------------------------------------------
const ME = (await api('com.atproto.identity.resolveHandle?handle=' + HANDLE)).did;
const carArg = process.argv.indexOf('--car');
let bytes;
if (carArg > 0) bytes = new Uint8Array(readFileSync(process.argv[carArg + 1]));
else {
  const doc = await fetch('https://plc.directory/' + ME).then((r) => r.json());
  const pds = doc.service.find((s) => s.id === '#atproto_pds').serviceEndpoint;
  bytes = new Uint8Array(await (await fetch(`${pds}/xrpc/com.atproto.sync.getRepo?did=${ME}`)).arrayBuffer());
}
const TD = new TextDecoder(), recs = new Map(), keys = new Map();
let pos = uvarint(bytes, 0); pos = pos[1] + pos[0];
while (pos < bytes.length) {
  const [len, ds] = uvarint(bytes, pos), end = ds + len, cl = cidLength(bytes, ds), cid = hex(bytes.subarray(ds, ds + cl));
  try {
    const v = decode(bytes, ds + cl)[0];
    if (v && Array.isArray(v.e)) { let last = ''; for (const e of v.e) { const k = last.slice(0, e.p || 0) + TD.decode(e.k); last = k; if (e.v?.$link) keys.set(e.v.$link, k); } }
    else if (v && v.$type) recs.set(cid, v);
  } catch { /* a block we cannot read */ }
  pos = end;
}
const R = {};
for (const [cid, v] of recs) { const k = keys.get(cid); if (!k) continue; const [col, rkey] = k.split('/'); (R[col] ||= []).push({ rkey, ...v }); }
for (const c in R) R[c].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
const posts = R['app.bsky.feed.post'], likes = R['app.bsky.feed.like'], reposts = R['app.bsky.feed.repost'], follows = R['app.bsky.graph.follow'];

// ---- per month, and who he paid attention to ------------------------------------------------------
const mo = (t) => String(t).slice(0, 7), did = (u) => u?.split('/')[2];
const MONTHS = {}, W = {};                       // W[era][did] = weight: replies 3, mentions/quotes 2, reposts 1, likes 0.3
const eraOf = (m) => ERAS.find(([, , a, b]) => m >= a && m <= b)?.[0];
const give = (m, d, w) => { const e = eraOf(m); if (!e || !d || d === ME) return; (W[e] ||= {})[d] = (W[e][d] || 0) + w; };
for (const p of posts) {
  const m = mo(p.createdAt); (MONTHS[m] ||= { posts: 0 }).posts++;
  if (p.reply) give(m, did(p.reply.parent?.uri), 3);
  for (const f of p.facets || []) for (const x of f.features || []) if (x.did) give(m, x.did, 2);
  const q = p.embed?.record?.uri || p.embed?.record?.record?.uri; if (q) give(m, did(q), 2);
}
for (const l of likes) give(mo(l.createdAt), did(l.subject?.uri), 0.3);
for (const l of reposts) give(mo(l.createdAt), did(l.subject?.uri), 1);

const top = {}, want = new Set();
for (const [e] of ERAS) { top[e] = Object.entries(W[e] || {}).sort((a, b) => b[1] - a[1]).slice(0, 12); top[e].forEach(([d]) => want.add(d)); }
const prof = {};
const dids = [...want];
for (let i = 0; i < dids.length; i += 25) {
  const r = await api('app.bsky.actor.getProfiles?' + dids.slice(i, i + 25).map((d) => 'actors=' + d).join('&'));
  for (const p of r.profiles || []) prof[p.did] = p;
}
// the faces: each profile picture's thumbnail, saved beside the piece (a canvas that draws another
// host's image cannot be exported)
const FACES = join(OUT, 'faces');
if (existsSync(FACES)) rmSync(FACES, { recursive: true });
mkdirSync(FACES, { recursive: true });
const face = {};
await Promise.all(dids.map(async (d) => {
  const url = prof[d]?.avatar; if (!url) return;
  const r = await fetch(url.replace('/avatar/', '/avatar_thumbnail/')); if (!r.ok) return;
  const name = d.slice(8, 20) + '.jpg';
  writeFileSync(join(FACES, name), Buffer.from(await r.arrayBuffer())); face[d] = 'faces/' + name;
}));
const PEOPLE = {};
for (const [e] of ERAS) {
  const max = top[e][0]?.[1] || 1;
  PEOPLE[e] = top[e].map(([d, w]) => prof[d] ? { h: prof[d].handle, n: (prof[d].displayName || '').trim() || prof[d].handle, f: face[d] || null, w: +(w / max).toFixed(3) } : { h: null, w: +(w / max).toFixed(3) });
}

// ---- his own words: the orb's posts per era (top-level posts WITH their images, few enough to read), and
// the quotes (with an image where the post has one). The images are his posts' own, fetched as the
// AppView's thumbnails and shrunk to 420 px (python3 + Pillow), saved beside the piece in posts/.
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const cidStr = (h) => { const b = Buffer.from(h, 'hex'); let bits = 0, v = 0, out = 'b'; for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; };
const link = (blob) => blob?.ref?.$link ? cidStr(blob.ref.$link) : null;
/** A post's pictures: its images (or a quote-with-media's), a video's poster frame, a link card's thumb. */
function pictures(p) {
  const e = p.embed || {}, m = e.media || e, out = [];
  for (const im of m.images || []) { const c = link(im.image); if (c) out.push({ url: `https://cdn.bsky.app/img/feed_thumbnail/plain/${ME}/${c}@jpeg`, alt: im.alt || '' }); }
  if (m.video) { const c = link(m.video); if (c) out.push({ url: `https://video.bsky.app/watch/${ME}/${c}/thumbnail.jpg`, alt: m.alt || '' }); }
  if (m.external?.thumb) { const c = link(m.external.thumb); if (c) out.push({ url: `https://cdn.bsky.app/img/feed_thumbnail/plain/${ME}/${c}@jpeg`, alt: m.external.title || '' }); }
  return out;
}
const PICS = join(OUT, 'posts');
if (existsSync(PICS)) rmSync(PICS, { recursive: true });
mkdirSync(PICS, { recursive: true });
const saved = [];
async function keep(p) {
  const pics = pictures(p).slice(0, 2), files = [];
  for (const [i, pic] of pics.entries()) {
    const r = await fetch(pic.url); if (!r.ok) continue;
    const name = `${p.rkey}-${i}.jpg`; writeFileSync(join(PICS, name), Buffer.from(await r.arrayBuffer())); files.push(['posts/' + name, pic.alt]); saved.push(join(PICS, name));
  }
  return files;
}
const readable = (p) => !p.reply && pictures(p).length && p.text && p.text.length >= 12 && p.text.length <= 180 && !/https?:|@/.test(p.text) && !(p.embed?.record && !p.embed?.media);
const ORB = {};
for (const [e, , a, b] of ERAS) {
  const pool = posts.filter((p) => readable(p) && mo(p.createdAt) >= a && mo(p.createdAt) <= b);
  const n = 16, step = pool.length / n, pick = Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[Math.floor((i + 0.5) * step)]);
  ORB[e] = [];
  for (const p of pick) { const files = await keep(p); if (files.length) ORB[e].push([String(p.createdAt).slice(0, 10), p.text.replace(/\s*\n\s*/g, ' '), files]); }
}
const QUOTES = {};
for (const k of QUOTED) { const p = posts.find((x) => x.rkey === k); if (!p) throw new Error('quoted post gone: ' + k); QUOTES[k] = [String(p.createdAt).slice(0, 10), p.text.replace(/\s*\n\s*/g, ' '), await keep(p)]; }
// shrink every picture to 420 px on its long side
execSync(`python3 -c "import sys\nfrom PIL import Image\nfor f in sys.argv[1:]:\n  im=Image.open(f).convert('RGB'); im.thumbnail((420,420)); im.save(f,quality=74)" ${saved.map((f) => JSON.stringify(f)).join(' ')}`);

// ---- the repository -------------------------------------------------------------------------------
const log = execSync('git log --all --format=@%ad --date=format:%Y-%m-%d --name-only', { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\n');
const GIT = {}, first = {};
let d0 = null;
for (const l of log) {
  if (l.startsWith('@')) { d0 = l.slice(1); GIT[d0.slice(0, 7)] = (GIT[d0.slice(0, 7)] || 0) + 1; continue; }
  if (!l) continue;
  const top = l.split('/')[0];
  if (!first[top] || d0 < first[top]) first[top] = d0;
}
// a site: a top-level directory that serves a page today
const BIRTHS = Object.entries(first).filter(([dir]) => /^[a-z0-9][a-z0-9-]*$/.test(dir) && existsSync(join(ROOT, dir, 'index.html')))
  .map(([dir, dd]) => [dd, dir]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

const TOTALS = { posts: posts.length, likes: likes.length, reposts: reposts.length, follows: follows.length, commits: Object.values(GIT).reduce((a, b) => a + b, 0), first: String(posts[0].createdAt).slice(0, 10) };
const js = `// GENERATED by studio/tools/lecture-record.mjs from ${HANDLE}'s public Bluesky repo and this repository's history.
// Only his own posts are quoted; other accounts appear by handle, display name and profile picture.
export const TOTALS = ${JSON.stringify(TOTALS)};
export const MONTHS = ${JSON.stringify(Object.keys(MONTHS).sort().map((m) => [m, MONTHS[m].posts]))};
export const GIT = ${JSON.stringify(GIT && Object.fromEntries(Object.entries(GIT).filter(([m]) => m >= '2026').sort()))};
export const PEOPLE = ${JSON.stringify(PEOPLE, null, 0)};
export const QUOTES = ${JSON.stringify(QUOTES, null, 1)};
export const ORB = ${JSON.stringify(ORB, null, 0)};
export const BIRTHS = ${JSON.stringify(BIRTHS)};
`;
writeFileSync(join(OUT, 'record.js'), js);
console.log(`record.js ${(js.length / 1024).toFixed(0)} KB · ${saved.length} pictures · ${Object.keys(face).length} faces · ${BIRTHS.length} sites · ${TOTALS.posts} posts`);
