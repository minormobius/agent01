// mesh-worker.js — triangulate off the main thread.
//
// Triangulating the county layer costs 110 ms coarse and 270 ms full. Done
// inline that is a visible stall on load, and a worse one when the full-detail
// tier arrives behind the coarse one and the map is already interactive. Done
// here it costs nothing anybody can see.
//
// Everything crosses as transferables, so neither the projected coordinates
// going in nor the mesh coming back is ever copied.
//
// Deliberately NOT a build-time artefact. A pre-baked mesh would save this work
// but the index buffer is about a megabyte per tier, and a megabyte of download
// is worse than 270 ms of a worker nobody is waiting on. It would also have to
// agree with the runtime about the exact point ordering of every arc, which is
// a coupling that would eventually drift and produce a subtly wrong map.

/* global importScripts, self, ATLAS_MESH */

importScripts('triangulate.js', 'mesh.js');

self.onmessage = function (e) {
  const { id, refs, ringStart, polyStart, count, px, arcOff } = e.data;
  try {
    const topo = { ids: { length: count }, refs, ringStart, polyStart };
    const t0 = (self.performance || Date).now();
    const mesh = ATLAS_MESH.buildMesh(topo, px, arcOff);
    const ms = (self.performance || Date).now() - t0;
    self.postMessage({ id, ok: true, mesh, ms }, [
      mesh.srcIdx.buffer, mesh.unitIdx.buffer, mesh.tris.buffer,
      mesh.triStart.buffer, mesh.vertStart.buffer,
    ]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
