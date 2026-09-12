// Shared bits for the headless scripts: load the engine and Manifold under
// node, read a document, resolve bench refs.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from '../lib/engine.js';
import Module from '../vendor/manifold.js';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const readDoc = (p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
export const isAssembly = (doc) => Array.isArray(doc.components);
/// A component ref: `bench:<name>` (a file in bench/), an AT URI (a part head or a
/// pinned revision in any public repo — resolved over the network), or an inline tree.
export async function benchRef(ref) {
  if (typeof ref !== 'string') return structuredClone(ref);
  if (ref.startsWith('bench:')) return readDoc(path.join(ROOT, 'bench', ref.slice(6) + '.json'));
  if (ref.startsWith('at://')) {
    const { Drive, PublicBackend, resolvePds, parseAtUri, PART } = await import('../lib/drive.js');
    const { did, collection } = parseAtUri(ref);
    const d = new Drive(new PublicBackend(did, await resolvePds(did)));
    if (collection === PART) { const f = await d.get(ref); if (!f) throw new Error(`no file at ${ref}`); return f.revision.tree; }
    return d.treeAt(ref);
  }
  throw new Error(`unknown ref ${ref}`);
}

let engine, manifold;
export async function kernels() {
  engine ??= await loadEngine(fs.readFileSync(path.join(ROOT, 'cad.wasm')));
  if (!manifold) { manifold = await Module(); manifold.setup(); }
  return { engine, manifold };
}
/// Named faces of a part for place-by-feature references (`at: "@plate.pivot[2]"`):
/// the exact kernel's report, built once per distinct tree. Pass to flatten as `facesOf`.
const faceCache = new Map();
export async function facesOf(partKey, treeJson) {
  if (faceCache.has(treeJson)) return faceCache.get(treeJson);
  const { engine } = await kernels();
  const r = engine.build(treeJson, { kernel: 'truck' });
  if (!r.ok) throw new Error(`${partKey}: the exact build failed (${r.report.error?.op}: ${r.report.error?.msg}), so its faces cannot be referenced`);
  faceCache.set(treeJson, r.report.faces);
  return r.report.faces;
}
export const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
export const has = (flag) => process.argv.includes(flag);
