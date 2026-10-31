// fresh.mjs — evidence that knows what it was evidence about. (Modulo, day 1)
//
// stamp(entry, links, readFile)      → { ...entry, digests: { [artifactPath]: sha256hex | null } }
// filter(evidence, links, readFile)  → the entries whose recorded digests all still match
//
// An entry names its check (`entry.check`). links say which requirements a check `verifies` and
// which artifacts `implements` each requirement. The digests cover every artifact implementing any
// requirement the check verifies; change one byte of one and exactly those entries drop out.
//
// LINK SHAPE: tools/vv/ was NOT in the folder on day 1, so vv's own links format is unknown. links()
// below accepts the shapes we could guess, and every other function goes through it, so when vv
// arrives this is the one place to fix:
//   [{ from, rel|type|kind, to }]                         (our links.json uses this)
//   { links: [...same...] }
//   { implements: [[artifact, req], ...] | [{from,to}], verifies: [[check, req], ...] }
//
// DECISIONS:
//  F-a  An entry with no `digests` was never stamped: filter drops it (nothing vouches for it).
//       An entry whose check verifies nothing, or whose requirements have no implementing artifact,
//       stamps `digests: {}` and is kept: there is nothing it could go stale against.
//  F-b  An artifact that can't be read stamps as null, and null never matches, not even null:
//       evidence about a file that isn't there can't stand.
//  F-c  readFile may return a string (hashed as UTF-8) or bytes.
//  F-d  filter judges each entry against the links as they are now (Morphyx, day 2). A requirement
//       that gains an implementing file drops the evidence stamped before it (that file was never
//       hashed); a file that stops implementing stops counting. Day 1 checked recorded digests only,
//       so evidence outlived a change in what it was evidence about.
import { createHash } from 'node:crypto';

function norm(l) {
  return { from: l.from ?? l.source ?? l.src, rel: l.rel ?? l.type ?? l.kind, to: l.to ?? l.target ?? l.dst };
}
export function linksOf(links) {
  if (Array.isArray(links)) return links.map(norm);
  if (links && Array.isArray(links.links)) return links.links.map(norm);
  const out = [];
  for (const rel of ['implements', 'verifies']) {
    for (const x of (links && links[rel]) || []) {
      out.push(Array.isArray(x) ? { from: x[0], rel, to: x[1] } : { ...norm(x), rel });
    }
  }
  return out;
}

export function artifactsFor(check, links) {
  const ls = linksOf(links);
  const reqs = new Set(ls.filter((l) => l.rel === 'verifies' && l.from === check).map((l) => l.to));
  return [...new Set(ls.filter((l) => l.rel === 'implements' && reqs.has(l.to)).map((l) => l.from))].sort();
}

function digest(path, readFile) {
  let data;
  try { data = readFile(path); } catch { return null; }
  if (data == null) return null;
  return createHash('sha256').update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data).digest('hex');
}

export function stamp(entry, links, readFile) {
  const digests = {};
  for (const p of artifactsFor(entry.check, links)) digests[p] = digest(p, readFile);
  return { ...entry, digests };
}

export function filter(evidence, links, readFile) {
  const cache = new Map();
  const now = (p) => { if (!cache.has(p)) cache.set(p, digest(p, readFile)); return cache.get(p); };
  return evidence.filter((e) => {
    if (!e || !e.digests || typeof e.digests !== 'object') return false;
    // F-d: judge against what the links say *now*. A file linked since the stamp was never hashed,
    // so nothing vouches for it: drop. A file unlinked since no longer bears on the check: ignore it.
    return artifactsFor(e.check, links).every((p) => Object.hasOwn(e.digests, p) && e.digests[p] !== null && now(p) === e.digests[p]);
  });
}
