/* Telegraph — the encounter generator.
 *
 * (seed, level) -> a board. Everything is decided here and nothing after, so an
 * encounter is a fixed puzzle: two players on one seed face identical problems,
 * and test/analysis.mjs can search the exact boards a player would be handed.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TELEGRAPH = NS.TELEGRAPH || {};

  var W = 6, H = 6;
  var START_INTEGRITY = 12;

  function levelPlan(level) {
    return {
      enemies: Math.min(6, 2 + Math.floor(level * 0.6)),
      turns: Math.min(7, 4 + Math.floor((level - 1) / 3)),
      rocks: 3 + (level % 3),
      // Heavier bodies unlock with depth; crawlers stay the backbone.
      pool: level >= 4 ? ["crawler", "crawler", "spitter", "spitter", "hulk"]
        : level >= 2 ? ["crawler", "crawler", "crawler", "spitter"]
        : ["crawler"],
      reinforcements: level >= 3 ? 1 + (level >= 6 ? 1 : 0) : 0,
    };
  }

  function buildEncounter(seed, level, integrity, maxIntegrity) {
    var rng = T.rngFor(seed, level);
    var plan = levelPlan(level);
    var i, j;

    var s = {
      seed: String(seed), level: level, w: W, h: H,
      turn: 1, maxTurns: plan.turns,
      integrity: integrity, maxIntegrity: maxIntegrity,
      tiles: new Array(W * H).fill("floor"),
      units: [], enemies: [], spawns: [],
      phase: "plan", nextId: 1,
      stats: { integrityLost: 0, kills: 0, unitDamage: 0, perfectTurns: 0 },
      events: [],
    };

    // --- nodes: what you are defending, kept off the outer ring so there is
    // always room to manoeuvre around them ---------------------------------
    var inner = [];
    for (j = 1; j < H - 1; j++) for (i = 1; i < W - 1; i++) inner.push({ x: i, y: j });
    var nodes = rng.shuffled(inner).slice(0, 3);
    for (i = 0; i < nodes.length; i++) s.tiles[nodes[i].y * W + nodes[i].x] = "node";

    // --- rocks: cover, push-targets, and walls to shove things into --------
    var free = [];
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      if (s.tiles[j * W + i] === "floor") free.push({ x: i, y: j });
    }
    free = rng.shuffled(free);
    var rocks = 0;
    for (i = 0; i < free.length && rocks < plan.rocks; i++) {
      var r = free[i];
      // Never wall a node in completely — it must stay approachable.
      if (adjacentToNode(s, r.x, r.y) && rng.chance(0.6)) continue;
      s.tiles[r.y * W + r.x] = "rock";
      rocks++;
    }

    // --- your units, placed near the nodes they are meant to cover ---------
    var spots = rng.shuffled(free.filter(function (p) { return s.tiles[p.y * W + p.x] === "floor"; }));
    var kinds = ["ram", "mortar"];
    for (i = 0; i < kinds.length; i++) {
      for (j = 0; j < spots.length; j++) {
        var p = spots[j];
        if (T.entityAt(s, p.x, p.y)) continue;
        if (distToNearestNode(s, p.x, p.y) > 3) continue;
        s.units.push({
          id: s.nextId++, kind: kinds[i], x: p.x, y: p.y,
          hp: T.UNITS[kinds[i]].hp, maxHp: T.UNITS[kinds[i]].hp,
          alive: true, moved: false, acted: false,
        });
        break;
      }
    }

    // --- enemies, each placed so it already telegraphs a node --------------
    // Turn one has to be a dilemma immediately. Dropping enemies at random and
    // letting them aim produces a first turn where half of them point at empty
    // floor, which is not a puzzle — it is a wait.
    // Spread the opening threats across *different* nodes. Aiming each enemy at
    // a node independently piles three of them onto the same tile, and a tile
    // taking three hits when you can body-block one is not a puzzle, it is a
    // bill. Least-threatened node first.
    var threatCount = {};
    for (i = 0; i < nodes.length; i++) threatCount[nodes[i].x + "," + nodes[i].y] = 0;
    for (i = 0; i < plan.enemies; i++) {
      var kind = rng.pick(plan.pool);
      var ordered = nodes.slice().sort(function (a, b) {
        return threatCount[a.x + "," + a.y] - threatCount[b.x + "," + b.y];
      });
      var hit = placeThreatening(s, rng, kind, ordered);
      if (hit) threatCount[hit.x + "," + hit.y]++;
      else placeAnywhere(s, rng, kind);
    }

    // --- reinforcements, landing on the outer ring on later turns ----------
    for (i = 0; i < plan.reinforcements; i++) {
      var edge = rng.shuffled(edgeTiles(s)).filter(function (p) { return T.passable(s, p.x, p.y, true); })[0];
      if (edge) s.spawns.push({ turn: 2 + i, x: edge.x, y: edge.y, kind: rng.pick(plan.pool) });
    }

    for (i = 0; i < s.enemies.length; i++) T.retarget(s, s.enemies[i]);
    return ensureAnswerable(s, rng);
  }

  /* The contract of a perfect-information game is that there IS a right answer.
     A board where every one of your ~800 options still costs integrity is not a
     hard puzzle, it is a bill — and the first tightness report had one opening
     in five like that.

     So: search turn one, and if nothing is clean, thin the assault until
     something is. Re-aiming an enemy is tried first because it preserves the
     board's shape; dropping one is the fallback that always terminates.

     This guarantees the *opening* only. Later turns can absolutely corner you,
     and that is the game — what it rules out is being handed an opening you
     were never able to answer.

     Deterministic: every draw comes from the same seeded rng, so a given
     (seed, level) still yields exactly one board. */
  function ensureAnswerable(s, rng) {
    if (typeof T.analyseTurn !== "function") return s;   // solver not loaded
    for (var attempt = 0; attempt < 16; attempt++) {
      var a = T.analyseTurn(s, 40000);
      if (a.clean > 0) return s;

      // 1. Give, don't take. Standing a unit on the most-battered node lets it
      //    body-block, which answers the board without making it emptier.
      //    Deleting enemies works too but costs the encounter its character,
      //    so it is the last resort rather than the first.
      if (attempt < 3 && stationUnitOnHotNode(s)) { retargetAll(s); continue; }

      // 2. Re-aim whichever enemy is doubling up on an already-covered tile.
      if (attempt < 9 && s.enemies.length > 1 && reaimRedundant(s, rng)) { retargetAll(s); continue; }

      // 3. Thin the assault. Always terminates.
      if (s.enemies.length <= 1) return s;
      s.enemies.pop();
      retargetAll(s);
    }
    return s;
  }

  function retargetAll(s) {
    for (var i = 0; i < s.enemies.length; i++) T.retarget(s, s.enemies[i]);
  }

  /* Move a unit onto the node taking the most incoming fire, so it can absorb
     the hit itself. */
  function stationUnitOnHotNode(s) {
    var f = T.forecast(s), counts = {}, i, best = null, bestN = 0;
    for (i = 0; i < f.length; i++) {
      if (!f[i].hitsNode) continue;
      var k = f[i].x + "," + f[i].y;
      counts[k] = (counts[k] || 0) + 1;
      if (counts[k] > bestN) { bestN = counts[k]; best = { x: f[i].x, y: f[i].y }; }
    }
    if (!best || T.entityAt(s, best.x, best.y)) return false;
    for (i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      if (!u.alive) continue;
      u.x = best.x; u.y = best.y;
      return true;
    }
    return false;
  }

  function reaimRedundant(s, rng) {
    var victim = mostRedundant(s, rng);
    if (!victim) return false;
    s.enemies = s.enemies.filter(function (e) { return e !== victim; });
    if (!placeThreatening(s, rng, victim.kind, rng.shuffled(allNodes(s)))) {
      placeAnywhere(s, rng, victim.kind);
    }
    return true;
  }

  /* The enemy whose impact tile is already covered by someone else — the one
     whose removal costs the board the least character. */
  function mostRedundant(s, rng) {
    var f = T.forecast(s), counts = {}, i;
    for (i = 0; i < f.length; i++) {
      var k = f[i].x + "," + f[i].y;
      counts[k] = (counts[k] || 0) + 1;
    }
    var dupes = [];
    for (i = 0; i < f.length; i++) {
      if (counts[f[i].x + "," + f[i].y] > 1) dupes.push(f[i].from);
    }
    if (!dupes.length) return s.enemies[s.enemies.length - 1] || null;
    var id = rng.pick(dupes);
    for (i = 0; i < s.enemies.length; i++) if (s.enemies[i].id === id) return s.enemies[i];
    return null;
  }

  function allNodes(s) {
    var out = [];
    for (var j = 0; j < s.h; j++) for (var i = 0; i < s.w; i++) {
      if (s.tiles[j * s.w + i] === "node") out.push({ x: i, y: j });
    }
    return out;
  }

  /* Put an enemy where its telegraph already lands on a node: choose a node,
     choose a facing, and place it `reach` tiles back along that facing.
     Returns the node it ended up threatening, or null. `nodes` arrives already
     ordered by preference, so it is walked in order rather than shuffled. */
  function placeThreatening(s, rng, kind, nodes) {
    var reach = T.ENEMIES[kind].reach;
    var order = nodes;
    for (var n = 0; n < order.length; n++) {
      var dirs = rng.shuffled([0, 1, 2, 3]);
      for (var d = 0; d < dirs.length; d++) {
        var dir = dirs[d];
        var x = order[n].x - T.DIRS[dir].dx * reach;
        var y = order[n].y - T.DIRS[dir].dy * reach;
        if (!T.passable(s, x, y, true)) continue;
        if (distToNearestUnit(s, x, y) < 2) continue;  // never start on top of a unit
        s.enemies.push({
          id: s.nextId++, kind: kind, x: x, y: y,
          hp: T.ENEMIES[kind].hp, maxHp: T.ENEMIES[kind].hp, alive: true, dir: dir,
        });
        return order[n];
      }
    }
    return null;
  }

  function placeAnywhere(s, rng, kind) {
    var all = [];
    for (var j = 0; j < s.h; j++) for (var i = 0; i < s.w; i++) all.push({ x: i, y: j });
    var order = rng.shuffled(all);
    for (var k = 0; k < order.length; k++) {
      var p = order[k];
      if (!T.passable(s, p.x, p.y, true)) continue;
      if (distToNearestUnit(s, p.x, p.y) < 2) continue;
      s.enemies.push({
        id: s.nextId++, kind: kind, x: p.x, y: p.y,
        hp: T.ENEMIES[kind].hp, maxHp: T.ENEMIES[kind].hp, alive: true, dir: 0,
      });
      return true;
    }
    return false;
  }

  function edgeTiles(s) {
    var out = [];
    for (var j = 0; j < s.h; j++) for (var i = 0; i < s.w; i++) {
      if (i === 0 || j === 0 || i === s.w - 1 || j === s.h - 1) out.push({ x: i, y: j });
    }
    return out;
  }

  function adjacentToNode(s, x, y) {
    for (var d = 0; d < 4; d++) {
      var nx = x + T.DIRS[d].dx, ny = y + T.DIRS[d].dy;
      if (T.inBounds(s, nx, ny) && s.tiles[ny * s.w + nx] === "node") return true;
    }
    return false;
  }

  function distToNearestNode(s, x, y) {
    var n = T.nearestNode(s, x, y);
    return n ? Math.abs(n.x - x) + Math.abs(n.y - y) : 99;
  }

  function distToNearestUnit(s, x, y) {
    var best = 99;
    for (var i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      if (!u.alive) continue;
      best = Math.min(best, Math.abs(u.x - x) + Math.abs(u.y - y));
    }
    return best;
  }

  function newGame(seed) {
    return buildEncounter(seed, 1, START_INTEGRITY, START_INTEGRITY);
  }

  /* Clearing an encounter patches one point of integrity — enough that a clean
     run recovers slowly, never enough to make damage cheap. */
  function nextEncounter(s) {
    return buildEncounter(s.seed, s.level + 1,
      Math.min(s.maxIntegrity, s.integrity + 1), s.maxIntegrity);
  }

  T.W = W;
  T.H = H;
  T.START_INTEGRITY = START_INTEGRITY;
  T.levelPlan = levelPlan;
  T.buildEncounter = buildEncounter;
  T.newGame = newGame;
  T.nextEncounter = nextEncounter;
})();
