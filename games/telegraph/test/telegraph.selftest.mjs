/* node games/telegraph/test/telegraph.selftest.mjs
 *
 * Gates the Telegraph rules. The load-bearing properties here are different
 * from an action game's:
 *
 *   1. The forecast must be exactly right. The whole game is a promise that
 *      what you are shown is what will happen — if resolution ever disagrees
 *      with the telegraph, the game is lying and every decision is void.
 *   2. Shoving must redirect. Moving a body has to move its attack, or there
 *      is no game.
 *   3. Every generated opening must be answerable. The contract of a
 *      perfect-information puzzle is that a right answer exists.
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { loadTelegraph, playRun } from "./harness.mjs";

const T = await loadTelegraph();

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

/* A bare board with nothing on it, for hand-built scenarios. */
function blank(w = 6, h = 6) {
  return {
    seed: "test", level: 1, w, h, turn: 1, maxTurns: 5,
    integrity: 8, maxIntegrity: 8,
    tiles: new Array(w * h).fill("floor"),
    units: [], enemies: [], spawns: [], phase: "plan", nextId: 1,
    stats: { integrityLost: 0, kills: 0, unitDamage: 0, perfectTurns: 0 },
    events: [],
  };
}
const addUnit = (s, kind, x, y) => {
  const u = { id: s.nextId++, kind, x, y, hp: T.UNITS[kind].hp, maxHp: T.UNITS[kind].hp, alive: true, moved: false, acted: false };
  s.units.push(u); return u;
};
const addEnemy = (s, kind, x, y, dir) => {
  const e = { id: s.nextId++, kind, x, y, hp: T.ENEMIES[kind].hp, maxHp: T.ENEMIES[kind].hp, alive: true, dir };
  s.enemies.push(e); return e;
};
const setTile = (s, x, y, t) => { s.tiles[y * s.w + x] = t; };
const fingerprint = (s) => T.keyOf(s) + "#" + s.turn + "#" + s.phase;

console.log("— determinism —");
{
  const a = T.buildEncounter("alpha", 3, 8, 8), b = T.buildEncounter("alpha", 3, 8, 8);
  ck(fingerprint(a) === fingerprint(b), "same (seed, level) → identical board");
  ck(fingerprint(a) !== fingerprint(T.buildEncounter("beta", 3, 8, 8)), "different seeds differ");
  ck(fingerprint(a) !== fingerprint(T.buildEncounter("alpha", 4, 8, 8)), "different levels differ");

  // Level 4 of a seed must not depend on what happened in levels 1–3.
  const direct = T.buildEncounter("gamma", 4, 8, 8);
  const viaRun = T.buildEncounter("gamma", 4, 3, 8);
  ck(T.keyOf(direct).replace(/^\d+/, "") === T.keyOf(viaRun).replace(/^\d+/, ""),
    "a level's board does not depend on the run that led to it");

  const r1 = playRun(T, "run-7", { policy: "optimal", maxLevel: 8 });
  const r2 = playRun(T, "run-7", { policy: "optimal", maxLevel: 8 });
  ck(r1.reachedLevel === r2.reachedLevel && r1.integrity === r2.integrity,
    `a full optimal run reproduces (level ${r1.reachedLevel}, integrity ${r1.integrity})`);
}

console.log("\n— the forecast is exactly what happens —");
{
  // The single most important property in the game.
  let mismatches = 0, checked = 0;
  for (let i = 0; i < 40; i++) {
    let s = T.buildEncounter(`fc-${i}`, 1 + (i % 8), 40, 40);
    for (let turn = 0; turn < 4 && s.phase === "plan"; turn++) {
      const predicted = T.costOf(s);
      const before = s.integrity;
      const after = T.endTurn(T.cloneState(s));
      checked++;
      if (before - after.integrity !== predicted.integrity) mismatches++;
      s = T.endTurn(s);
    }
  }
  ck(mismatches === 0, `forecast matched resolution on all ${checked} turns checked`);
}

console.log("\n— shoving redirects —");
{
  const s = blank();
  setTile(s, 3, 1, "node");
  const e = addEnemy(s, "crawler", 3, 2, 0);   // faces N, will hit the node above
  ck(T.impactTile(s, e).x === 3 && T.impactTile(s, e).y === 1, "crawler telegraphs the tile it faces");
  ck(T.costOf(s).integrity === 1, "that costs a point of integrity if left alone");

  const ram = addUnit(s, "ram", 3, 3);
  ck(T.abilityTargets(s, ram).some((t) => t.x === 3 && t.y === 2), "RAM can reach the adjacent enemy");
  T.useAbility(s, ram.id, 3, 2);
  ck(!e.alive, "a 1 hp crawler dies to the shove damage");
  ck(T.costOf(s).integrity === 0, "the node is now safe");
}
{
  // Shove something too tough to kill: it should move, taking its attack with it.
  const s = blank();
  setTile(s, 3, 1, "node");
  const e = addEnemy(s, "hulk", 3, 2, 0);
  const ram = addUnit(s, "ram", 3, 3);
  ck(T.costOf(s).integrity === 2, "a hulk threatens the node for 2");
  T.useAbility(s, ram.id, 3, 2);
  ck(e.alive && e.y === 1, "the hulk survives and is shoved onto the node tile");
  // It now stands ON the node and faces N, so it hits (3,0) — empty floor.
  ck(T.impactTile(s, e).y === 0, "its attack moved with it");
  ck(T.costOf(s).integrity === 0, "the node is spared without killing anything");
}

console.log("\n— push, collision and walls —");
{
  const s = blank();
  const e = addEnemy(s, "hulk", 0, 0, 1);
  T.push(s, e, 3);                       // shove west, into the wall
  ck(e.x === 0 && e.y === 0, "a body shoved into the boundary does not move");
  ck(e.hp === T.ENEMIES.hulk.hp - 1, "it takes 1 from the impact");

  const s2 = blank();
  const a = addEnemy(s2, "hulk", 2, 2, 0), b = addEnemy(s2, "hulk", 3, 2, 0);
  T.push(s2, a, 1);                      // shove east into b
  ck(a.x === 2 && a.hp === 2 && b.hp === 2, "shoving one body into another damages both, neither moves");

  const s3 = blank();
  setTile(s3, 3, 2, "rock");
  const c = addEnemy(s3, "hulk", 2, 2, 0);
  T.push(s3, c, 1);
  ck(c.x === 2 && c.hp === 2, "rock blocks a shove and hurts the shoved body");

  const s4 = blank();
  const d = addEnemy(s4, "crawler", 2, 2, 0);
  ck(T.push(s4, d, 2) === true && d.y === 3, "an unobstructed shove moves one tile");
}

console.log("\n— body-blocking —");
{
  const s = blank();
  setTile(s, 3, 1, "node");
  addEnemy(s, "crawler", 3, 2, 0);
  const before = T.costOf(s);
  ck(before.integrity === 1 && before.unitDmg === 0, "unguarded, the node takes it");

  const u = addUnit(s, "ram", 3, 0);
  T.moveUnit(s, u.id, 3, 1);             // stand on the node
  const after = T.costOf(s);
  ck(after.integrity === 0 && after.unitDmg === 1, "a unit on the node eats the hit instead");

  const resolved = T.endTurn(T.cloneState(s));
  ck(resolved.integrity === s.integrity, "and resolution agrees — no integrity lost");
}

console.log("\n— enemies can hit each other —");
{
  const s = blank();
  const a = addEnemy(s, "hulk", 2, 2, 1);
  const b = addEnemy(s, "crawler", 3, 2, 0);
  // a faces E onto b. retarget would avoid this, so force the dir directly.
  ck(T.impactTile(s, a).x === 3 && T.impactTile(s, a).y === 2, "the hulk is aimed at the crawler");
  const out = T.endTurn(s);
  ck(!out.enemies.some((e) => e.id === b.id && e.alive), "friendly fire kills the crawler");
  ck(out.stats.integrityLost === 0, "and costs you nothing");
}
{
  // Simultaneity: two crawlers aimed at each other must both die.
  const s = blank();
  const a = addEnemy(s, "crawler", 2, 2, 1);
  const b = addEnemy(s, "crawler", 3, 2, 3);
  const out = T.endTurn(s);
  ck(out.enemies.filter((e) => e.alive).length === 0, "mutual fire resolves simultaneously — both die");
}

console.log("\n— the spitter flies over —");
{
  const s = blank();
  setTile(s, 3, 0, "node");
  const e = addEnemy(s, "spitter", 3, 2, 0);
  ck(T.impactTile(s, e).y === 0, "a spitter hits two tiles away");
  const u = addUnit(s, "ram", 3, 1);      // stand directly in front of it
  ck(T.costOf(s).unitDmg === 0 && T.costOf(s).integrity === 1,
    "standing next to a spitter is safe — the shot passes over");
  ck(u.alive, "the blocker is untouched");
}

console.log("\n— movement —");
{
  const s = blank();
  const u = addUnit(s, "ram", 2, 2);
  const spots = T.reachable(s, u);
  ck(spots.some((p) => p.x === 2 && p.y === 2), "staying put is always an option");
  ck(spots.every((p) => Math.abs(p.x - 2) + Math.abs(p.y - 2) <= T.UNITS.ram.move), "never exceeds move range");
  ck(!spots.some((p) => p.x === 4 && p.y === 4), "diagonal distance 4 is out of reach");

  setTile(s, 3, 2, "rock"); setTile(s, 2, 3, "rock");
  setTile(s, 1, 2, "rock"); setTile(s, 2, 1, "rock");
  ck(T.reachable(s, u).length === 1, "fully walled in, only the current tile is reachable");

  const s2 = blank();
  const u2 = addUnit(s2, "ram", 2, 2);
  T.moveUnit(s2, u2.id, 2, 4);
  ck(u2.moved === true, "moving marks the unit as moved");
  ck(T.moveUnit(s2, u2.id, 2, 5) === false, "a unit cannot move twice");
  ck(T.reachable(s2, u2).length === 1, "and has nowhere left to go");
}

console.log("\n— the mortar —");
{
  const s = blank();
  const m = addUnit(s, "mortar", 0, 0);
  const targets = T.abilityTargets(s, m);
  ck(targets.every((t) => Math.abs(t.x) + Math.abs(t.y) >= 2), "the mortar cannot hit anything adjacent");
  ck(targets.every((t) => Math.abs(t.x) + Math.abs(t.y) <= 3), "nor anything beyond range 3");
  ck(targets.length === 0, "an empty board offers no targets worth listing");

  const s2 = blank();
  const m2 = addUnit(s2, "mortar", 0, 0);
  const centre = addEnemy(s2, "hulk", 2, 0, 0);
  const side = addEnemy(s2, "hulk", 2, 1, 0);
  ck(T.abilityTargets(s2, m2).some((t) => t.x === 2 && t.y === 0), "it can target an occupied tile in range");
  T.useAbility(s2, m2.id, 2, 0);
  ck(centre.hp === T.ENEMIES.hulk.hp - 1, "the struck tile takes damage");
  ck(side.y === 2, "a neighbour is shoved outward");

  // It shoves your own units too — that is the cost of using it.
  const s3 = blank();
  const m3 = addUnit(s3, "mortar", 0, 3);
  const friend = addUnit(s3, "ram", 2, 2);
  addEnemy(s3, "hulk", 2, 3, 0);
  T.useAbility(s3, m3.id, 2, 3);
  ck(friend.y === 1, "the mortar shoves friendly units as well");
}

console.log("\n— the generator —");
{
  let nodesOk = true, boundsOk = true, overlapOk = true, unitsOk = true, spawnOk = true;
  for (let i = 0; i < 60; i++) {
    const level = 1 + (i % 10);
    const s = T.buildEncounter(`gen-${i}`, level, 8, 8);
    const nodes = s.tiles.filter((t) => t === "node").length;
    if (nodes !== 3) nodesOk = false;
    if (s.units.length !== 2) unitsOk = false;
    const seen = {};
    for (const ent of [...s.units, ...s.enemies]) {
      if (!T.inBounds(s, ent.x, ent.y)) boundsOk = false;
      if (s.tiles[ent.y * s.w + ent.x] === "rock") boundsOk = false;
      const k = ent.x + "," + ent.y;
      if (seen[k]) overlapOk = false;
      seen[k] = true;
    }
    for (const sp of s.spawns) if (!T.inBounds(s, sp.x, sp.y)) spawnOk = false;
  }
  ck(nodesOk, "every board has exactly 3 nodes");
  ck(unitsOk, "every board has both units");
  ck(boundsOk, "nothing is placed out of bounds or inside rock");
  ck(overlapOk, "nothing is placed on top of anything else");
  ck(spawnOk, "reinforcement tiles are in bounds");
}

console.log("\n— every opening is answerable —");
{
  // The contract. If this fails, players are being handed unwinnable turns.
  const bad = [];
  for (let i = 0; i < 45; i++) {
    const level = 1 + (i % 10);
    const s = T.buildEncounter(`ans-${i}`, level, 8, 8);
    const a = T.analyseTurn(s);
    if (a.clean === 0) bad.push(`ans-${i}@L${level}`);
  }
  ck(bad.length === 0, `all 45 generated openings have at least one clean line${bad.length ? " — failed: " + bad.join(", ") : ""}`);
}

console.log("\n— the solver —");
{
  const s = T.buildEncounter("solve-1", 4, 8, 8);
  const a = T.analyseTurn(s);
  ck(a.total > 0, `the turn has ${a.total} distinct outcomes`);
  ck(a.clean <= a.total && a.flawless <= a.clean, "flawless ⊆ clean ⊆ total");
  ck(!a.capped, "a normal board searches to completion");
  ck(a.bestState !== null, "the solver returns the board behind its best line");

  // The claimed best line must actually deliver when played out.
  const played = T.endTurn(T.cloneState(a.bestState));
  const lost = s.integrity - played.integrity;
  ck(a.clean === 0 || lost === 0, `taking the best line loses no integrity (lost ${lost})`);
  ck(T.costOf(a.bestState).score === a.bestScore, "bestScore matches the state it came from");

  // Doing nothing must never beat the solver's pick.
  ck(T.costOf(s).score >= a.bestScore, "the best line is at least as good as passing");

  // Deduplication must actually bite: enumerating both act-orders on a board
  // with two live units should produce fewer outcomes than raw plans.
  ck(a.visited > a.total, `dedup collapses ${a.visited} plans into ${a.total} outcomes`);
}

console.log("\n— win, loss and the run —");
{
  let s = T.buildEncounter("term-1", 1, 8, 8);
  const maxTurns = s.maxTurns;
  for (let i = 0; i < maxTurns && s.phase === "plan"; i++) s = T.endTurn(s);
  ck(s.phase === "won" || s.phase === "lost", `an encounter terminates within ${maxTurns} turns (${s.phase})`);

  const dead = T.buildEncounter("term-2", 3, 1, 8);
  let d = dead, guard = 0;
  while (d.phase === "plan" && guard++ < 30) d = T.endTurn(d);
  ck(d.phase !== "plan", "a 1-integrity board resolves rather than hanging");

  const won = T.buildEncounter("term-3", 2, 8, 8);
  won.integrity = 5;
  const next = T.nextEncounter(won);
  ck(next.level === won.level + 1, "clearing advances the level");
  ck(next.integrity === 6, "and patches one point of integrity");
  const full = T.buildEncounter("term-4", 2, 8, 8);
  ck(T.nextEncounter(full).integrity === 8, "the patch never exceeds the maximum");
}

console.log("\n— choice actually matters —");
{
  // A guard rail on the design, not a balance report (that is test/analysis.mjs).
  const seeds = Array.from({ length: 14 }, (_, i) => `guard-${i}`);
  const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const depth = (p) => med(seeds.map((s) => playRun(T, s, { policy: p, maxLevel: 12 }).reachedLevel));
  const optimal = depth("optimal"), greedy = depth("greedy"), idle = depth("idle");
  ck(optimal > greedy, `playing well beats grabbing the nearest thing (${optimal} vs ${greedy})`);
  ck(greedy >= idle, `acting at all beats standing still (${greedy} vs ${idle})`);

  // And the boards must not be answerable by accident.
  let tight = 0;
  for (let i = 0; i < 20; i++) {
    const a = T.analyseTurn(T.buildEncounter(`t-${i}`, 5, 8, 8));
    if (a.tightness <= 0.5) tight++;
  }
  ck(tight >= 18, `at level 5, ${tight}/20 boards need a real choice (≤50% of lines work)`);
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
