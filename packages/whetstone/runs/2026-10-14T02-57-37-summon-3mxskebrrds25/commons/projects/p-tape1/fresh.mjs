// fresh — evidence that knows what it was evidence of. Each evidence entry is stamped
// with the SHA-256 of every artifact that implements a requirement its check verifies;
// when any of those files changes, the entry stops counting.
import { createHash } from 'node:crypto';

const sha = (x) => createHash('sha256').update(typeof x === 'string' ? x : Buffer.from(x)).digest('hex');

// The artifacts an entry's check depends on: check -verifies-> req <-implements- artifact.
export function dependsOn(check, links) {
  const reqs = new Set(links.filter((l) => l.kind === 'verifies' && l.from === check).map((l) => l.to));
  return [...new Set(links.filter((l) => l.kind === 'implements' && reqs.has(l.to)).map((l) => l.from))].sort();
}

export function stamp(entry, links, readFile) {
  const digests = {};
  for (const path of dependsOn(entry.check, links)) digests[path] = sha(readFile(path));
  return { ...entry, digests };
}

// DECISION: an entry with no `digests` was never stamped, so nothing vouches for it: it is
// dropped. An entry stamped with an empty set (its check's requirements have no
// implementing artifact) has nothing that can go stale, so it stays. A file that can't be
// read no longer matches.
export function filter(evidence, links, readFile) {
  const cache = new Map();
  const now = (p) => {
    if (!cache.has(p)) { let d = null; try { d = sha(readFile(p)); } catch { d = null; } cache.set(p, d); }
    return cache.get(p);
  };
  return evidence.filter((e) => e && e.digests && typeof e.digests === 'object'
    && Object.entries(e.digests).every(([p, d]) => now(p) === d));
}
