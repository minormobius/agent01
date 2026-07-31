// worker.js — v8 milestone 1: generation off the main thread.
//
// A module Web Worker: receives a chunk spec, runs the pure solveChunk(), posts the record back.
// This is the boundary a Rust/WASM generator would later slot behind unchanged. The main thread
// stays responsive while a chunk solves; if the platform lacks Workers the page falls back to
// calling solveChunk() synchronously (same module), so the contract is identical either way.

import { solveChunk } from './chunkgen.js';

self.onmessage = (e) => {
  const { id, opts } = e.data || {};
  try {
    const rec = solveChunk(opts || {});
    // typed arrays in the record are transferable; cells/rooms/ports are small structured clones
    self.postMessage({ id, rec }, [rec.road.buffer, rec.roomOf.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
