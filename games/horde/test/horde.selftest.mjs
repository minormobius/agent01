/* node games/horde/test/horde.selftest.mjs
 *
 * Gates the Hold the Line simulation. Three things matter here:
 *
 *   1. Determinism. A seed must reproduce a run exactly, or the balance bot is
 *      measuring noise and `?seed=` is a lie.
 *   2. Conservation. Every zombie that spawns must end as a kill or a leak.
 *      Silent disappearances would make the difficulty curve unreadable.
 *   3. That the mechanics do what their card text says — including the ceilings
 *      on the repeatable cards, which is where the first draft broke.
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { loadHorde, playRun } from "./harness.mjs";

const H = await loadHorde();

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

/* A cheap structural fingerprint of a run — enough to catch any divergence in
   the horde, the gun, or the wall without serialising the whole object. */
function fingerprint(run) {
  const z = run.zombies.map((q) => `${q.arc}:${q.r.toFixed(6)}:${q.hp.toFixed(4)}:${q.type}`).join("|");
  const a = run.arcs.map((q) => `${q.heat.toFixed(6)}/${q.jam.toFixed(6)}`).join(",");
  return [
    run.t.toFixed(4), run.wave, run.phase, run.wall.hp, run.focus,
    run.stats.kills, run.stats.leaks, run.taken.join(">"),
    run.mods.dps.toFixed(6), run.mods.spill.toFixed(6),
    a, z,
  ].join("#");
}

console.log("— determinism —");
{
  const runN = (seed) => {
    const r = H.newRun(seed, { quiet: true });
    for (let i = 0; i < 4000; i++) H.step(r, H.CONFIG.dt);
    return r;
  };
  ck(fingerprint(runN("alpha")) === fingerprint(runN("alpha")), "same seed → identical state");
  ck(fingerprint(runN("alpha")) !== fingerprint(runN("beta")), "different seeds diverge");

  // Whole games, played by a bot, must also reproduce — this is the property
  // the balance report actually depends on.
  const a = playRun(H, "seed-42"), b = playRun(H, "seed-42");
  ck(a.diedOn === b.diedOn && a.kills === b.kills && a.taken.join() === b.taken.join(),
    `full run reproduces (died wave ${a.diedOn}, ${a.kills} kills)`);

  // The two rng streams must be independent: drawing cards must not disturb
  // the horde. Compare the wave plan against a run that opened extra gates.
  const plan = (seed) => {
    const r = H.newRun(seed, { quiet: true });
    const out = [];
    for (let w = 1; w <= 6; w++) { r.wave = w; H.buildWave(r, w); out.push(JSON.stringify(r.spawns)); }
    return out.join("");
  };
  const withCards = (seed) => {
    const r = H.newRun(seed, { quiet: true });
    r.wave = 6; r.mods.gateOffers = 4;
    for (let i = 0; i < 5; i++) { r.gate = null; r.phase = "wave"; r.stats.wavesCleared = 0; r.spawns = []; r.spawnIdx = 0; r.zombies = []; H.step(r, H.CONFIG.dt); if (r.phase === "gate") H.pickGate(r, 0); }
    const out = [];
    for (let w = 1; w <= 6; w++) { r.wave = w; H.buildWave(r, w); out.push(JSON.stringify(r.spawns)); }
    return out.join("");
  };
  ck(plan("streams") === withCards("streams"), "card draws do not disturb the wave stream");
}

console.log("\n— conservation: nothing vanishes —");
{
  let spawned = 0;
  const run = H.newRun("conserve", { quiet: true });
  const realSpawns = [];
  // Count spawns by watching the plan get released, rather than instrumenting
  // the sim (which would mean testing a different code path than ships).
  let guard = 0;
  while (run.phase !== "dead" && run.wave <= 25 && guard++ < 400000) {
    const before = run.nextId;
    if (run.phase === "gate") H.pickGate(run, 0);
    else {
      H.setFocus(run, (Math.floor(run.t / 1.3)) % H.CONFIG.ARCS);
      H.step(run, H.CONFIG.dt);
    }
    spawned += run.nextId - before;
    realSpawns.push(run.nextId - before);
  }
  const accounted = run.stats.kills + run.stats.leaks + run.zombies.length;
  ck(spawned === accounted,
    `${spawned} spawned = ${run.stats.kills} killed + ${run.stats.leaks} leaked + ${run.zombies.length} alive`);
  ck(run.stats.kills > 0 && run.stats.leaks > 0, "the bot both killed and leaked (test is exercising both paths)");
}

console.log("\n— invariants across many runs —");
{
  let heatOk = true, radiusOk = true, wallOk = true, dupOk = true, endsOk = true;
  for (let i = 0; i < 60; i++) {
    const run = H.newRun(`inv-${i}`, { quiet: true });
    let guard = 0;
    while (run.phase !== "dead" && run.wave <= 20 && guard++ < 200000) {
      if (run.phase === "gate") { H.pickGate(run, guard % run.gate.offers.length); continue; }
      H.setFocus(run, guard % H.CONFIG.ARCS);
      if (H.grenadeReady(run) && guard % 900 === 0) H.throwGrenade(run);
      H.step(run, H.CONFIG.dt);

      for (const a of run.arcs) if (!(a.heat >= 0 && a.heat <= 1) || a.jam < 0) heatOk = false;
      for (const z of run.zombies) if (!(z.r >= 0 && z.r <= 1.25) || z.hp <= 0) radiusOk = false;
      if (run.wall.hp > run.wall.max || run.wall.hp < 0) wallOk = false;
    }
    if (run.phase !== "dead" && run.wave <= 20) endsOk = false;
    // Non-repeatable cards must never be taken twice.
    for (const u of H.UPGRADES) {
      if (u.repeatable) continue;
      if (run.taken.filter((id) => id === u.id).length > 1) dupOk = false;
    }
  }
  ck(heatOk, "heat stays in [0,1] and jam never goes negative");
  ck(radiusOk, "zombies stay in [0,1.25] and no zombie is alive at hp<=0");
  ck(wallOk, "wall hp stays within [0, max]");
  ck(dupOk, "non-repeatable cards are never offered twice");
  ck(endsOk, "every run reaches a terminal state");
}

console.log("\n— the gun —");
{
  const run = H.newRun("gun", { quiet: true });
  run.phase = "wave";
  ck(H.arcMultiplier(run, run.focus) > H.arcMultiplier(run, run.focus + 1),
    "a cold focused arc out-damages an unfocused one");

  // Droop: the same arc, hot, must do measurably less.
  const cold = H.arcMultiplier(run, run.focus);
  run.arcs[run.focus].heat = 1;
  const hot = H.arcMultiplier(run, run.focus);
  ck(hot < cold * 0.45, `full heat costs most of your damage (${cold.toFixed(2)} → ${hot.toFixed(2)})`);

  run.arcs[run.focus].jam = 1;
  ck(H.arcMultiplier(run, run.focus) === run.mods.spill, "a jammed arc drops to spill");

  // Jamming: hold focus and it must jam, then recover. The pending spawn is
  // load-bearing — a wave with an empty plan and a clear field completes on the
  // first step, and arcs cool at a gate rather than heating.
  const j = H.newRun("jam", { quiet: true });
  j.phase = "wave"; j.focus = 0;
  j.spawns = [{ at: 1e6, arc: 0, type: "walker", clump: 1 }];
  j.spawnIdx = 0;
  let jammed = false;
  for (let i = 0; i < 2000; i++) { H.step(j, H.CONFIG.dt); if (j.arcs[0].jam > 0) { jammed = true; break; } }
  ck(jammed, "camping one arc eventually jams it");
  for (let i = 0; i < 4000; i++) H.step(j, H.CONFIG.dt);
  ck(j.arcs[0].jam >= 0, "the jam clears without going negative");

  // Twin mount reaches the neighbours; without it they get spill only.
  const t = H.newRun("twin", { quiet: true });
  t.phase = "wave"; t.focus = 2;
  const beforeN = H.arcMultiplier(t, 3);
  t.mods.twin = 0.45;
  ck(H.arcMultiplier(t, 3) > beforeN && H.arcMultiplier(t, 1) > beforeN,
    "TWIN MOUNT lifts both neighbours above spill");
  ck(H.arcMultiplier(t, 5) === t.mods.spill, "TWIN MOUNT does not reach the far side");
}

console.log("\n— the grenade —");
{
  const run = H.newRun("nade", { quiet: true });
  run.phase = "wave";
  // Put a body in the focused arc and both neighbours.
  for (const arc of [0, 1, 5]) {
    run.zombies.push({ id: run.nextId++, arc, r: 0.6, hp: 100, maxHp: 100, type: "brute", speed: 0, dmg: 1, dead: false });
  }
  run.focus = 0;
  ck(H.grenadeReady(run), "grenade starts ready");
  ck(H.throwGrenade(run) === true, "grenade throws");
  ck(H.throwGrenade(run) === false, "grenade respects its cooldown");
  const byArc = {};
  for (const z of run.zombies) byArc[z.arc] = z.hp;
  ck(byArc[0] < byArc[1] && byArc[1] === byArc[5] && byArc[1] < 100,
    `focused arc takes full damage, neighbours take splash (${byArc[0]} vs ${byArc[1]})`);
  ck(run.zombies.every((z) => z.arc !== 3), "grenade does not reach the opposite arc");

  // A grenade must clear a swarm outright — that is its job.
  const s = H.newRun("nade2", { quiet: true });
  s.phase = "wave"; s.focus = 0;
  for (let i = 0; i < 8; i++) {
    s.zombies.push({ id: s.nextId++, arc: 0, r: 0.5, hp: 1, maxHp: 1, type: "swarm", speed: 0, dmg: 1, dead: false });
  }
  H.throwGrenade(s);
  ck(s.zombies.filter((z) => !z.dead && z.arc === 0).length === 0, "one grenade wipes a swarm");
}

console.log("\n— the gates —");
{
  const run = H.newRun("gate", { quiet: true });
  run.wave = 6;
  run.phase = "wave"; run.spawns = []; run.spawnIdx = 0; run.zombies = [];
  H.step(run, H.CONFIG.dt);
  ck(run.phase === "gate", "clearing the field opens a gate");
  ck(run.gate.offers.length === H.CONFIG.gateOffers, `gate offers ${H.CONFIG.gateOffers} cards`);
  ck(new Set(run.gate.offers.map((u) => u.id)).size === run.gate.offers.length, "offers are distinct");
  ck(run.gate.offers.every((u) => u.minWave <= run.wave), "offers respect minWave");

  // Timeout hands you the weakest card on the table, not nothing.
  const weakest = run.gate.offers[H.weakestOffer(run.gate)];
  const minWeight = Math.min(...run.gate.offers.map((u) => u.weight));
  ck(weakest.weight === minWeight, "weakestOffer really is the weakest");
  for (let i = 0; i < Math.ceil(H.CONFIG.gateTime / H.CONFIG.dt) + 2; i++) H.step(run, H.CONFIG.dt);
  ck(run.phase === "brief", "the gate times out instead of hanging");
  ck(run.taken[run.taken.length - 1] === weakest.id, `timeout takes the weakest card (${weakest.id})`);

  ck(H.pickGate(run, 0) === false, "pickGate is a no-op outside a gate");
}

console.log("\n— every card applies, and the ceilings hold —");
{
  for (const u of H.UPGRADES) {
    const run = H.newRun("card-" + u.id, { quiet: true });
    run.wall.hp = 4;
    const before = JSON.stringify(run.mods) + "|" + run.wall.hp + "|" + run.wall.max;
    let threw = null;
    try { u.apply(run); } catch (e) { threw = e; }
    const after = JSON.stringify(run.mods) + "|" + run.wall.hp + "|" + run.wall.max;
    ck(!threw && before !== after, `${u.id} applies and changes something${threw ? " — threw " + threw.message : ""}`);
  }

  // The four repeatables that broke the first build. Apply each 30 times and
  // assert it converges instead of running away.
  const spam = (id, n) => {
    const run = H.newRun("spam-" + id, { quiet: true });
    const u = H.UPGRADES.find((x) => x.id === id);
    for (let i = 0; i < n; i++) u.apply(run);
    return run.mods;
  };
  ck(spam("spill", 30).spill <= 0.30 + 1e-9, "SPILLOVER is capped (direction keeps mattering)");
  ck(spam("tar", 30).speedMul >= 0.55 - 1e-9, "TAR PITS is capped (the horde never stops)");
  ck(spam("grenade_cd", 30).grenadeCd >= 3.5 - 1e-9, "BANDOLIER cooldown has a floor");
  ck(spam("autoloader", 30).jamTime >= 0.4 - 1e-9, "AUTOLOADER jam time has a floor");
  ck(spam("coolant", 30).heatRate >= 0.12 - 1e-9, "COOLANT LOOP heat rate has a floor");

  // SNIPER'S NEST must actually bite on the far half and nowhere else.
  const far = H.newRun("sniper", { quiet: true });
  far.phase = "wave"; far.mods.outer = 1.2;
  far.zombies.push({ id: 1, arc: 0, r: 0.9, hp: 50, maxHp: 50, type: "walker", speed: 0, dmg: 1, dead: false });
  far.zombies.push({ id: 2, arc: 1, r: 0.2, hp: 50, maxHp: 50, type: "walker", speed: 0, dmg: 1, dead: false });
  H.step(far, 0.5);
  const outerHit = 50 - far.zombies.find((z) => z.arc === 0).hp;
  const innerHit = 50 - far.zombies.find((z) => z.arc === 1).hp;
  ck(outerHit > innerHit, `SNIPER'S NEST hits the far half harder (${outerHit.toFixed(1)} vs ${innerHit.toFixed(1)})`);
}

console.log("\n— the director —");
{
  const run = H.newRun("director", { quiet: true });
  let arcsOk = true, typesOk = true, budgetOk = true, timeOk = true;
  for (let w = 1; w <= 30; w++) {
    run.wave = w;
    H.buildWave(run, w);
    const arcs = new Set(run.spawns.map((s) => s.arc));
    if (arcs.size > H.CONFIG.waveArcs(w)) arcsOk = false;
    for (const s of run.spawns) {
      if (H.ZOMBIES[s.type].minWave > w) typesOk = false;
      if (s.at < 0 || s.at > H.CONFIG.waveDuration(w)) timeOk = false;
    }
    const pts = run.spawns.reduce((a, s) => a + H.ZOMBIES[s.type].pts * s.clump, 0);
    // The loop overshoots by at most one spawn's worth.
    if (pts < H.CONFIG.waveBudget(w) || pts > H.CONFIG.waveBudget(w) + 5) budgetOk = false;
  }
  ck(arcsOk, "waves never use more arcs than waveArcs() allows");
  ck(typesOk, "waves only contain types unlocked at that wave");
  ck(timeOk, "spawn times fall inside the wave duration");
  ck(budgetOk, "waves spend their budget without overshooting wildly");

  ck(H.CONFIG.hpScale(10) > H.CONFIG.hpScale(9), "hp scaling is monotonic");
  ck(H.CONFIG.waveArcs(1) === 2 && H.CONFIG.waveArcs(20) === 6, "wave 1 is two arcs; late waves surround you");
}

console.log("\n— the difficulty curve still has a shape —");
{
  // A guard rail, not a balance report (that is test/balance.mjs). If a tuning
  // change makes competent play indistinguishable from panic, or makes runs
  // absurdly short or endless, this fails.
  const seeds = Array.from({ length: 60 }, (_, i) => `curve-${i}`);
  const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const waveOf = (r) => r.diedOn ?? r.run.wave;
  const rotate = med(seeds.map((s) => waveOf(playRun(H, s, { policy: "rotate" }))));
  const sweep = med(seeds.map((s) => waveOf(playRun(H, s, { policy: "sweep" }))));
  const worst = med(seeds.map((s) => waveOf(playRun(H, s, { policy: "rotate", cards: "worst" }))));

  ck(rotate > sweep, `reading the board beats sweeping blindly (${rotate} vs ${sweep} waves)`);
  ck(rotate > worst, `choosing cards beats taking the dregs (${rotate} vs ${worst} waves)`);
  ck(rotate >= 8 && rotate <= 30, `a competent run lasts a sensible number of waves (${rotate})`);
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
