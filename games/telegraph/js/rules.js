/* Telegraph — the rules.
 *
 * A perfect-information tactics game. Every enemy shows you the exact tile it
 * will hit at the end of the turn, and you never have enough actions to stop
 * all of them. There is no hidden information, no dice, and no execution skill:
 * the entire difficulty is deciding what to allow.
 *
 * Because nothing here is random and nothing is hidden, a turn can be searched
 * exhaustively — see js/solve.js. That is the whole reason the game is built
 * this way round: it makes "how many of your options were correct" a number
 * rather than a feeling.
 *
 * Pure. No DOM, no clock, no Math.random. Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TELEGRAPH = NS.TELEGRAPH || {};

  // N, E, S, W. Index order is the deterministic tie-break everywhere.
  var DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
  var DIR_NAME = ["N", "E", "S", "W"];

  /* Your two units. Deliberately two, not three: it keeps a whole turn's
     option space small enough to enumerate exactly — including the order you
     act in — while you wait. A readout that says "4 of 2,310" is worth more
     than a third unit. */
  var UNITS = {
    ram: {
      kind: "ram", name: "RAM", glyph: "▲", move: 2, hp: 2,
      blurb: "Shoves an adjacent enemy one tile away. 1 damage.",
    },
    mortar: {
      kind: "mortar", name: "MORTAR", glyph: "◆", move: 2, hp: 2,
      blurb: "Strikes a tile at range 2–3 for 1 damage, and shoves everything around it outward — including you.",
    },
  };

  /* The bestiary. `reach` is how far along its facing the attack lands: a
     spitter's shot flies *over* the adjacent tile, so standing next to one is
     safe and standing two away is not. */
  var ENEMIES = {
    crawler: { kind: "crawler", name: "crawler", glyph: "c", hp: 1, reach: 1, dmg: 1 },
    spitter: { kind: "spitter", name: "spitter", glyph: "s", hp: 2, reach: 2, dmg: 1 },
    hulk:    { kind: "hulk",    name: "hulk",    glyph: "H", hp: 3, reach: 1, dmg: 2 },
  };

  // ------------------------------------------------------------- geometry --

  function idx(s, x, y) { return y * s.w + x; }
  function inBounds(s, x, y) { return x >= 0 && y >= 0 && x < s.w && y < s.h; }
  function tileAt(s, x, y) { return inBounds(s, x, y) ? s.tiles[idx(s, x, y)] : null; }

  function unitAt(s, x, y) {
    for (var i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      if (u.alive && u.x === x && u.y === y) return u;
    }
    return null;
  }
  function enemyAt(s, x, y) {
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (e.alive && e.x === x && e.y === y) return e;
    }
    return null;
  }
  function entityAt(s, x, y) { return unitAt(s, x, y) || enemyAt(s, x, y); }

  /* A tile you can stand on: in bounds, not rock, not already occupied.

     Nodes are floor to YOUR units — standing on one to shield it is a real and
     important option — but solid to enemies. That asymmetry is deliberate. When
     enemies could walk onto nodes they simply parked on them, and an enemy
     standing on a node cannot shoot the tile beneath itself, so the board went
     quiet and unreadable. "They can shoot the grid but never set foot on it" is
     also just a clearer rule to hold in your head. */
  function passable(s, x, y, forEnemy) {
    if (!inBounds(s, x, y)) return false;
    var t = s.tiles[idx(s, x, y)];
    if (t === "rock") return false;
    if (forEnemy && t === "node") return false;
    return !entityAt(s, x, y);
  }

  // ---------------------------------------------------------------- clone --

  /* Hand-rolled because the solver calls it tens of thousands of times per
     turn and structuredClone is far too slow for that. */
  function cloneState(s) {
    var i, out = {
      seed: s.seed, level: s.level, w: s.w, h: s.h,
      turn: s.turn, maxTurns: s.maxTurns,
      integrity: s.integrity, maxIntegrity: s.maxIntegrity,
      tiles: s.tiles.slice(),
      units: new Array(s.units.length),
      enemies: new Array(s.enemies.length),
      phase: s.phase, nextId: s.nextId,
      spawns: s.spawns ? s.spawns.slice() : [],
      stats: { integrityLost: s.stats.integrityLost, kills: s.stats.kills, unitDamage: s.stats.unitDamage, perfectTurns: s.stats.perfectTurns },
      events: [],
    };
    for (i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      out.units[i] = { id: u.id, kind: u.kind, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, alive: u.alive, moved: u.moved, acted: u.acted };
    }
    for (i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      out.enemies[i] = { id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, alive: e.alive, dir: e.dir };
    }
    return out;
  }

  function emit(s, ev) { if (s.events) s.events.push(ev); }

  // -------------------------------------------------------------- movement --

  /* Every tile a unit can reach this turn, including where it already stands.
     Plain BFS — movement is orthogonal and blocked by rock and by anyone
     standing in the way, so enemies wall you off just by existing. */
  function reachable(s, unit) {
    var out = [{ x: unit.x, y: unit.y }];
    if (!unit.alive || unit.moved) return out;
    var seen = {}, frontier = [{ x: unit.x, y: unit.y, d: 0 }];
    seen[unit.x + "," + unit.y] = true;
    while (frontier.length) {
      var cur = frontier.shift();
      if (cur.d >= UNITS[unit.kind].move) continue;
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + DIRS[d].dx, ny = cur.y + DIRS[d].dy, key = nx + "," + ny;
        if (seen[key] || !passable(s, nx, ny)) continue;
        seen[key] = true;
        out.push({ x: nx, y: ny });
        frontier.push({ x: nx, y: ny, d: cur.d + 1 });
      }
    }
    return out;
  }

  function moveUnit(s, unitId, x, y) {
    var u = getUnit(s, unitId);
    if (!u || !u.alive || u.moved) return false;
    if (x === u.x && y === u.y) { u.moved = true; return true; }
    var ok = reachable(s, u).some(function (p) { return p.x === x && p.y === y; });
    if (!ok) return false;
    u.x = x; u.y = y; u.moved = true;
    return true;
  }

  function getUnit(s, id) {
    for (var i = 0; i < s.units.length; i++) if (s.units[i].id === id) return s.units[i];
    return null;
  }

  // ----------------------------------------------------------------- push --

  /* Shove an entity one tile along `dir`.
     Into something solid — a wall, a rock, another body — and it goes nowhere
     and takes 1; a body it collides with takes 1 as well. Collisions are where
     most of your damage comes from, because you have far more shoving power
     than killing power. */
  function push(s, ent, dir) {
    var nx = ent.x + DIRS[dir].dx, ny = ent.y + DIRS[dir].dy;
    // Note nodes are NOT solid here, even to enemies. They refuse to *walk*
    // onto your grid, but shoving one on top of it is allowed and is one of
    // your best tools: an enemy standing on a node cannot shoot the tile under
    // its own feet. Blocking that too made the game markedly harsher — optimal
    // play fell from sector 9 to 4 — because it quietly deleted a whole class
    // of answers.
    if (!inBounds(s, nx, ny) || s.tiles[idx(s, nx, ny)] === "rock") {
      damage(s, ent, 1, "collision");
      return false;
    }
    var blocker = entityAt(s, nx, ny);
    if (blocker) {
      damage(s, ent, 1, "collision");
      damage(s, blocker, 1, "collision");
      return false;
    }
    ent.x = nx; ent.y = ny;
    emit(s, { type: "push", id: ent.id, x: nx, y: ny });
    return true;
  }

  function isUnit(ent) { return !!UNITS[ent.kind]; }

  function damage(s, ent, n, cause) {
    if (!ent.alive) return;
    ent.hp -= n;
    if (isUnit(ent)) s.stats.unitDamage += n;
    emit(s, { type: "damage", id: ent.id, n: n, cause: cause, x: ent.x, y: ent.y, unit: isUnit(ent) });
    if (ent.hp <= 0) {
      ent.hp = 0;
      ent.alive = false;
      if (!isUnit(ent)) s.stats.kills++;
      emit(s, { type: "down", id: ent.id, x: ent.x, y: ent.y, unit: isUnit(ent) });
    }
  }

  // ------------------------------------------------------------ abilities --

  /* Where a unit could aim right now. The solver walks exactly this list, so
     anything not in here is not a legal option and will never be counted. */
  function abilityTargets(s, unit) {
    var out = [];
    if (!unit.alive || unit.acted) return out;
    var d, i, j;
    if (unit.kind === "ram") {
      for (d = 0; d < 4; d++) {
        var tx = unit.x + DIRS[d].dx, ty = unit.y + DIRS[d].dy;
        if (enemyAt(s, tx, ty)) out.push({ x: tx, y: ty, dir: d });
      }
      return out;
    }
    // Mortar: arcs, so it cannot hit anything adjacent, and only tiles whose
    // cross touches something are worth listing — an empty patch of floor with
    // nothing around it is not a decision, just noise in the option count.
    for (i = 0; i < s.w; i++) {
      for (j = 0; j < s.h; j++) {
        var dist = Math.abs(i - unit.x) + Math.abs(j - unit.y);
        if (dist < 2 || dist > 3) continue;
        if (s.tiles[idx(s, i, j)] === "rock") continue;
        var touches = !!entityAt(s, i, j);
        for (d = 0; d < 4 && !touches; d++) {
          if (entityAt(s, i + DIRS[d].dx, j + DIRS[d].dy)) touches = true;
        }
        if (touches) out.push({ x: i, y: j });
      }
    }
    return out;
  }

  function useAbility(s, unitId, x, y) {
    var u = getUnit(s, unitId);
    if (!u || !u.alive || u.acted) return false;
    var legal = abilityTargets(s, u).some(function (t) { return t.x === x && t.y === y; });
    if (!legal) return false;

    if (u.kind === "ram") {
      var target = enemyAt(s, x, y);
      if (!target) return false;
      var dir = dirBetween(u.x, u.y, x, y);
      damage(s, target, 1, "ram");
      if (target.alive) push(s, target, dir);
      emit(s, { type: "ability", kind: "ram", x: x, y: y });
    } else {
      var hit = entityAt(s, x, y);
      if (hit) damage(s, hit, 1, "mortar");
      // Outward shove on the four neighbours, resolved in a fixed direction
      // order so the result is reproducible. Your own units are not exempt.
      for (var d = 0; d < 4; d++) {
        var e = entityAt(s, x + DIRS[d].dx, y + DIRS[d].dy);
        if (e && e.alive) push(s, e, d);
      }
      emit(s, { type: "ability", kind: "mortar", x: x, y: y });
    }
    u.acted = true;
    // Acting ends that unit's turn — you cannot shove and then walk away.
    u.moved = true;
    return true;
  }

  function dirBetween(x0, y0, x1, y1) {
    if (x1 === x0 && y1 < y0) return 0;
    if (x1 > x0 && y1 === y0) return 1;
    if (x1 === x0 && y1 > y0) return 2;
    return 3;
  }

  // ------------------------------------------------------------ telegraph --

  /* The tile this enemy will hit. Reach is measured along its facing, so the
     tiles it flies over are safe. */
  function impactTile(s, e) {
    var spec = ENEMIES[e.kind];
    return { x: e.x + DIRS[e.dir].dx * spec.reach, y: e.y + DIRS[e.dir].dy * spec.reach };
  }

  /* Pick a facing. Enemies want your infrastructure first, your units second,
     and will never deliberately aim at each other. Highest score wins, ties go
     to the lowest direction index — so it is fully predictable, which is the
     point of the whole game. */
  function retarget(s, e) {
    var best = -Infinity, bestDir = e.dir || 0;
    for (var d = 0; d < 4; d++) {
      var spec = ENEMIES[e.kind];
      var tx = e.x + DIRS[d].dx * spec.reach, ty = e.y + DIRS[d].dy * spec.reach;
      var score;
      if (!inBounds(s, tx, ty)) score = -3;
      else if (enemyAt(s, tx, ty)) score = -2;
      else if (unitAt(s, tx, ty)) score = 2;
      else if (s.tiles[idx(s, tx, ty)] === "node") score = 3;
      else score = 0;
      if (score > best) { best = score; bestDir = d; }
    }
    e.dir = bestDir;
  }

  /* One step toward the nearest node, greedy on the larger axis first. Ties and
     blocks resolve deterministically. */
  function advance(s, e) {
    var target = nearestNode(s, e.x, e.y);
    if (!target) return;
    var dx = target.x - e.x, dy = target.y - e.y;
    if (dx === 0 && dy === 0) return;
    // Try the longer axis first, then the other. A zero component is never
    // queued, so an enemy already aligned on one axis only tries the other.
    var horiz = dx > 0 ? 1 : 3, vert = dy > 0 ? 2 : 0;
    var order = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx !== 0) order.push(horiz);
      if (dy !== 0) order.push(vert);
    } else {
      if (dy !== 0) order.push(vert);
      if (dx !== 0) order.push(horiz);
    }
    for (var i = 0; i < order.length; i++) {
      var d = order[i];
      var nx = e.x + DIRS[d].dx, ny = e.y + DIRS[d].dy;
      if (passable(s, nx, ny, true)) { e.x = nx; e.y = ny; return; }
    }
  }

  /* Nearest node, never counting the tile being asked about. An enemy shoved
     on top of a node must have somewhere to go, or it would compute a distance
     of zero, decide it has arrived, and sit there for ever. */
  function nearestNode(s, x, y) {
    var best = null, bestD = Infinity;
    for (var j = 0; j < s.h; j++) {
      for (var i = 0; i < s.w; i++) {
        if (s.tiles[idx(s, i, j)] !== "node") continue;
        if (i === x && j === y) continue;
        var d = Math.abs(i - x) + Math.abs(j - y);
        if (d < bestD) { bestD = d; best = { x: i, y: j }; }
      }
    }
    return best;
  }

  // ----------------------------------------------------------- resolution --

  /* End of turn. Damage is collected from every enemy's current position and
     then applied all at once, so two enemies really can take each other out and
     a dying enemy still gets its shot off. Simultaneity is what makes
     redirection feel fair. */
  function resolve(s) {
    var i, pending = [];
    for (i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (!e.alive) continue;
      var t = impactTile(s, e);
      if (!inBounds(s, t.x, t.y)) continue;
      pending.push({ x: t.x, y: t.y, dmg: ENEMIES[e.kind].dmg, from: e.id });
    }

    var integrityBefore = s.integrity;

    /* Resolve every victim against the board as it stands BEFORE any damage
       lands, then apply. Looking victims up one at a time as damage was applied
       meant a blocker killed by the first hit stopped blocking the second, and
       the node behind it took a hit the forecast never predicted — the game
       silently breaking its own promise. Two hits aimed at a body both land on
       that body, even if the first one kills it. */
    for (i = 0; i < pending.length; i++) {
      pending[i].victim = entityAt(s, pending[i].x, pending[i].y);
    }

    var byVictim = {}, victims = [], nodeDamage = 0;
    for (i = 0; i < pending.length; i++) {
      var p = pending[i];
      if (p.victim) {
        // A body on the tile eats the hit — including one of yours standing on
        // a node to shield it. That trade is the game's central decision.
        if (byVictim[p.victim.id] === undefined) { byVictim[p.victim.id] = 0; victims.push(p.victim); }
        byVictim[p.victim.id] += p.dmg;
        emit(s, { type: "hit", x: p.x, y: p.y, dmg: p.dmg, blocked: true });
      } else if (s.tiles[idx(s, p.x, p.y)] === "node") {
        nodeDamage += p.dmg;
        emit(s, { type: "hit", x: p.x, y: p.y, dmg: p.dmg, node: true });
      } else {
        emit(s, { type: "hit", x: p.x, y: p.y, dmg: 0, miss: true });
      }
    }
    for (i = 0; i < victims.length; i++) damage(s, victims[i], byVictim[victims[i].id], "attack");
    s.integrity -= nodeDamage;
    s.stats.integrityLost += nodeDamage;

    compact(s);
    if (s.integrity <= 0) {
      s.integrity = 0;
      s.phase = "lost";
      return s;
    }
    if (integrityBefore === s.integrity) s.stats.perfectTurns++;

    s.turn++;
    if (s.turn > s.maxTurns) { s.phase = "won"; return s; }

    // Survivors close in, then re-aim; reinforcements land last so they always
    // arrive already telegraphing.
    for (i = 0; i < s.enemies.length; i++) if (s.enemies[i].alive) advance(s, s.enemies[i]);
    releaseSpawns(s);
    for (i = 0; i < s.enemies.length; i++) if (s.enemies[i].alive) retarget(s, s.enemies[i]);

    for (i = 0; i < s.units.length; i++) { s.units[i].moved = false; s.units[i].acted = false; }
    if (!s.units.some(function (u) { return u.alive; })) s.phase = "lost";
    return s;
  }

  function releaseSpawns(s) {
    var keep = [];
    for (var i = 0; i < s.spawns.length; i++) {
      var sp = s.spawns[i];
      if (sp.turn !== s.turn) { keep.push(sp); continue; }
      if (!passable(s, sp.x, sp.y, true)) { keep.push({ turn: sp.turn + 1, x: sp.x, y: sp.y, kind: sp.kind }); continue; }
      s.enemies.push({
        id: s.nextId++, kind: sp.kind, x: sp.x, y: sp.y,
        hp: ENEMIES[sp.kind].hp, maxHp: ENEMIES[sp.kind].hp, alive: true, dir: 0,
      });
      emit(s, { type: "spawn", x: sp.x, y: sp.y, kind: sp.kind });
    }
    s.spawns = keep;
  }

  function compact(s) {
    s.enemies = s.enemies.filter(function (e) { return e.alive; });
  }

  function endTurn(s) {
    if (s.phase !== "plan") return s;
    return resolve(s);
  }

  /* Every tile that will be hit if you end the turn right now, with what it
     would cost. The renderer draws it; the solver scores it. One definition, so
     the warning you see and the number you are graded on cannot disagree. */
  function forecast(s) {
    var out = [];
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (!e.alive) continue;
      var t = impactTile(s, e);
      if (!inBounds(s, t.x, t.y)) continue;
      var victim = entityAt(s, t.x, t.y);
      out.push({
        x: t.x, y: t.y, dmg: ENEMIES[e.kind].dmg, from: e.id, dir: e.dir,
        hitsUnit: !!(victim && isUnit(victim)),
        hitsEnemy: !!(victim && !isUnit(victim)),
        hitsNode: !victim && s.tiles[idx(s, t.x, t.y)] === "node",
      });
    }
    return out;
  }

  /* What ending the turn right now would cost you. The solver minimises this.
     Integrity is weighted above unit damage because integrity is the only thing
     that actually ends a run. */
  function costOf(s) {
    var f = forecast(s), integrity = 0, unitDmg = 0;
    for (var i = 0; i < f.length; i++) {
      if (f[i].hitsNode) integrity += f[i].dmg;
      else if (f[i].hitsUnit) unitDmg += f[i].dmg;
    }
    return { integrity: integrity, unitDmg: unitDmg, score: integrity * 10 + unitDmg };
  }

  T.DIRS = DIRS;
  T.DIR_NAME = DIR_NAME;
  T.UNITS = UNITS;
  T.ENEMIES = ENEMIES;
  T.idx = idx;
  T.inBounds = inBounds;
  T.tileAt = tileAt;
  T.unitAt = unitAt;
  T.enemyAt = enemyAt;
  T.entityAt = entityAt;
  T.passable = passable;
  T.cloneState = cloneState;
  T.reachable = reachable;
  T.moveUnit = moveUnit;
  T.getUnit = getUnit;
  T.abilityTargets = abilityTargets;
  T.useAbility = useAbility;
  T.impactTile = impactTile;
  T.retarget = retarget;
  T.advance = advance;
  T.nearestNode = nearestNode;
  T.resolve = resolve;
  T.endTurn = endTurn;
  T.forecast = forecast;
  T.costOf = costOf;
  T.damage = damage;
  T.push = push;
  T.isUnit = isUnit;
  T.compact = compact;
})();
