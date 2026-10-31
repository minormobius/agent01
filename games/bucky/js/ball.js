/* Bucky — the board: C60, the buckyball, built from the icosahedron.

   Cut every corner off an icosahedron a third of the way along its edges:
   each of its 30 edges leaves two atoms (60), each corner leaves a
   pentagon (12), each face a hexagon (20). Every atom has exactly three
   bonds (90 in all), which is what makes this a board for logic: two in
   and one out is a gate, one in and two out a splitter.

   ball.atoms[i]  unit position [x, y, z]
   ball.nbrs[i]   its three neighbours
   ball.bonds     [a, b] pairs, a < b
   ball.faces     { pent: [[5 atoms in ring order] × 12], hex: [[6] × 20] } */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BUCKY = NS.BUCKY || {};

  function build() {
    var p = (1 + Math.sqrt(5)) / 2, V = [];
    [[0, 1, p], [0, -1, p], [0, 1, -p], [0, -1, -p]].forEach(function (v) { V.push(v, [v[1], v[2], v[0]], [v[2], v[0], v[1]]); });
    var d2 = function (a, b) { return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]); };
    var adj = V.map(function () { return []; });
    for (var i = 0; i < 12; i++) for (var j = 0; j < 12; j++) if (i !== j && Math.abs(d2(V[i], V[j]) - 4) < 1e-9) adj[i].push(j);
    // an atom for each (corner, neighbour): a third of the way from the corner
    var id = {}, atoms = [];
    for (i = 0; i < 12; i++) adj[i].forEach(function (j) {
      id[i + "," + j] = atoms.length;
      var q = [V[i][0] + (V[j][0] - V[i][0]) / 3, V[i][1] + (V[j][1] - V[i][1]) / 3, V[i][2] + (V[j][2] - V[i][2]) / 3], l = Math.hypot(q[0], q[1], q[2]);
      atoms.push([q[0] / l, q[1] / l, q[2] / l]);
    });
    var nbrs = atoms.map(function () { return []; }), bonds = [];
    var bond = function (a, b) { if (nbrs[a].indexOf(b) >= 0) return; nbrs[a].push(b); nbrs[b].push(a); bonds.push(a < b ? [a, b] : [b, a]); };
    for (i = 0; i < 12; i++) adj[i].forEach(function (j) {
      bond(id[i + "," + j], id[j + "," + i]); // across the old edge: between two hexagons
      adj[i].forEach(function (k) { if (k !== j && adj[j].indexOf(k) >= 0) bond(id[i + "," + j], id[i + "," + k]); }); // round the old corner: a pentagon
    });
    // faces, in ring order
    var pent = [], hex = [];
    for (i = 0; i < 12; i++) {
      var ring = [adj[i][0]], left = adj[i].slice(1);
      while (left.length) { var last = ring[ring.length - 1], nx = left.filter(function (k) { return adj[last].indexOf(k) >= 0; })[0]; ring.push(nx); left.splice(left.indexOf(nx), 1); }
      pent.push(ring.map(function (j) { return id[i + "," + j]; }));
    }
    for (i = 0; i < 12; i++) adj[i].forEach(function (j) { adj[i].forEach(function (k) {
      if (i < j && j < k && adj[j].indexOf(k) >= 0) hex.push([id[i + "," + j], id[j + "," + i], id[j + "," + k], id[k + "," + j], id[k + "," + i], id[i + "," + k]]);
    }); });
    return { n: atoms.length, atoms: atoms, nbrs: nbrs, bonds: bonds, faces: { pent: pent, hex: hex } };
  }
  /* Graph distances from atom a. */
  function dist(ball, a) {
    var d = new Array(ball.n).fill(-1), q = [a]; d[a] = 0;
    for (var h = 0; h < q.length; h++) ball.nbrs[q[h]].forEach(function (b) { if (d[b] < 0) { d[b] = d[q[h]] + 1; q.push(b); } });
    return d;
  }
  var BALL = null;
  B.ball = function () { return BALL || (BALL = build()); };
  B.dist = dist;
  B.key = function (a, b) { return a < b ? a + "-" + b : b + "-" + a; };
})();
