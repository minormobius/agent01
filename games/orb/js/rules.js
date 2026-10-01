/* Orb — the rules.

   Minesweeper with the grid taken away. Everything here talks to the mesh only
   through `mesh.nbrs` — a cell is a number and a list of neighbours — so the
   same rules run on the sphere, and on the square and hex tori that
   test/analysis.mjs uses as controls.

   A state is plain data:
     open[i]  1 once revealed        flag[i]  1 if the player flagged it
     mine[i]  1 if a mine            count[i] mined neighbours
   Mines are not placed until the first reveal, so the first cell and its
   neighbours are always clear and the game always opens on a region. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB = NS.ORB || {};

  function newState(mesh, nMines) {
    var n = mesh.n;
    return {
      mesh: mesh, n: n, nMines: nMines,
      mine: new Uint8Array(n), count: new Int8Array(n),
      open: new Uint8Array(n), flag: new Uint8Array(n),
      opened: 0, flags: 0, phase: "ready", boom: -1, first: -1,
      moves: 0, t0: 0, t1: 0,
    };
  }

  function plant(s, mineList) {
    s.mine.fill(0); s.count.fill(0);
    for (var k = 0; k < mineList.length; k++) s.mine[mineList[k]] = 1;
    var nb = s.mesh.nbrs;
    for (var i = 0; i < s.n; i++) {
      var c = 0;
      for (var j = 0; j < nb[i].length; j++) c += s.mine[nb[i][j]];
      s.count[i] = c;
    }
  }

  /* Open a cell; zeros flood. Returns the cells opened, in order (the view
     animates them as a ripple). Opening a mine ends the game. */
  function reveal(s, i) {
    if (s.phase === "won" || s.phase === "lost" || s.open[i] || s.flag[i]) return [];
    if (s.mine[i]) { s.open[i] = 1; s.boom = i; s.phase = "lost"; s.t1 = Date.now(); return [i]; }
    var out = [], stack = [i], nb = s.mesh.nbrs;
    s.open[i] = 1;
    while (stack.length) {
      var c = stack.pop();
      out.push(c); s.opened++;
      if (s.count[c] !== 0) continue;
      for (var k = 0; k < nb[c].length; k++) {
        var j = nb[c][k];
        if (!s.open[j] && !s.mine[j]) {
          if (s.flag[j]) { s.flag[j] = 0; s.flags--; } // a wrong flag inside a flood is cleared
          s.open[j] = 1; stack.push(j);
        }
      }
    }
    if (s.opened === s.n - s.nMines) { s.phase = "won"; s.t1 = Date.now(); }
    return out;
  }

  function toggleFlag(s, i) {
    if (s.phase !== "play" || s.open[i]) return false;
    s.flag[i] ^= 1; s.flags += s.flag[i] ? 1 : -1;
    return true;
  }

  /* Tap an open number whose flags are all placed: open the rest. */
  function chord(s, i) {
    if (s.phase !== "play" || !s.open[i] || s.count[i] === 0) return [];
    var nb = s.mesh.nbrs[i], f = 0, k;
    for (k = 0; k < nb.length; k++) f += s.flag[nb[k]];
    if (f !== s.count[i]) return [];
    var out = [];
    for (k = 0; k < nb.length; k++) {
      var r = reveal(s, nb[k]);
      for (var q = 0; q < r.length; q++) out.push(r[q]);
    }
    return out;
  }

  /* The tiers. Densities were chosen by measurement (test/analysis.mjs prints
     the generator's cost per tier): the no-guess oracle holds up to about a
     quarter of the cells mined on 1000 cells (~0.1 s median, ~0.3 s worst to
     prove a board) and starts to strain past that.
     A board's difficulty is its cell and mine count, so that pair IS the
     leaderboard's game id: retune a tier and its old times stop being
     compared with the new ones, instead of quietly mixing. */
  O.SIZES = {
    s: { n: 160, m: 28, label: "small" },
    m: { n: 320, m: 62, label: "medium" },
    l: { n: 600, m: 132, label: "large" },
    x: { n: 1000, m: 250, label: "huge" },
  };
  O.gameId = function (size) { var c = O.SIZES[size]; return "pure-" + c.n + "-" + c.m; };

  O.newState = newState;
  O.plant = plant;
  O.reveal = reveal;
  O.toggleFlag = toggleFlag;
  O.chord = chord;
})();
