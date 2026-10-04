// fresh.mjs — reference: stamp evidence with digests of what it verified; drop it when they change.
import { createHash } from 'node:crypto';
const sha = (s) => createHash('sha256').update(s).digest('hex');
function artifactsFor(check, links) {
  const reqs = links.filter((l) => l.kind === 'verifies' && l.from === check).map((l) => l.to);
  return [...new Set(links.filter((l) => l.kind === 'implements' && reqs.includes(l.to)).map((l) => l.from))].sort();
}
export function stamp(entry, links, readFile) {
  return { ...entry, digests: Object.fromEntries(artifactsFor(entry.check, links).map((p) => [p, sha(readFile(p))])) };
}
export function filter(evidence, links, readFile) {
  return evidence.filter((e) => Object.entries(e.digests || {}).every(([p, d]) => { try { return sha(readFile(p)) === d; } catch { return false; } }));
}
