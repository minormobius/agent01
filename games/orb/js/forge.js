/* Orb — hard mode's forge, off the main thread.

   Climbing a board toward more hard moments (solve.js generateHard) takes
   from a fraction of a second to a few seconds, so it runs here and reports
   progress while the page stays responsive. It loads the same engine files
   the page does and rebuilds the same mesh from the same seed, so the board
   it returns is the board the page would have made itself. */
importScripts("prng.js", "sphere.js", "rules.js", "solve.js");

self.onmessage = function (e) {
  var q = e.data, O = self.ORB;
  var mesh = O.buildMesh(q.seed, q.n, 2);
  var g = O.generateHard(mesh, q.m, q.first, q.seed, q.steps, function (step, hard) {
    self.postMessage({ progress: true, step: step, hard: hard });
  });
  self.postMessage({ done: true, mines: g.mines, hard: g.hard, start: g.start });
};
