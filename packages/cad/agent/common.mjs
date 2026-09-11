// Shared bits for the headless scripts: load the engine and Manifold under
// node, read a document, resolve bench refs.
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from '../lib/engine.js';
import Module from '../vendor/manifold.js';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const readDoc = (p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
export const isAssembly = (doc) => Array.isArray(doc.components);
export const benchRef = async (ref) => (typeof ref === 'string' && ref.startsWith('bench:') ? readDoc(path.join(ROOT, 'bench', ref.slice(6) + '.json')) : structuredClone(ref));

let engine, manifold;
export async function kernels() {
  engine ??= await loadEngine(fs.readFileSync(path.join(ROOT, 'cad.wasm')));
  if (!manifold) { manifold = await Module(); manifold.setup(); }
  return { engine, manifold };
}
export const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
export const has = (flag) => process.argv.includes(flag);
