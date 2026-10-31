/* Orb — bending the double torus into 3D, off the main thread.

   js/pretzel.js builds its map from the octagon onto a pretzel in about a
   second (more on a phone), so the page asks for it here when you switch to
   the 3D view. Like forge.js, it rebuilds the board's mesh from the seed and
   sends back only what the view draws. */
importScripts("prng.js", "sphere.js", "torus.js", "hyper.js", "pretzel.js", "rules.js");

self.onmessage = function (e) {
  var O = self.ORB, mesh = O.meshFor(e.data.size, e.data.seed);
  self.postMessage({ key: e.data.key, data: O.pretzel.cells(mesh) });
};
