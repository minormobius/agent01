/* node games/outbound/test/outbound.selftest.mjs
 *
 * Gates Outbound. The load-bearing properties:
 *
 *   1. The state graph is acyclic. `rest` is new and dangerous — it lowers
 *      strain, so it could in principle undo an earlier action and let the
 *      solver walk in circles for ever. This is checked EXHAUSTIVELY over whole
 *      reachable graphs, not sampled, because a memoised DFS with no depth
 *      limit does not fail politely on a cycle: it hangs.
 *   2. The memo does not change any answer.
 *   3. Every haul handed to a player is finishable with the fuel and the crew
 *      they actually arrive with. Losing people has to be something you did.
 *   4. The post-mortem names the move that killed the haul, not the last one.
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { loadOutbound, playLeg, playHaul } from "./harness.mjs";

const O = await loadOutbound();
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

/* A hand-built leg, so scenarios are exact rather than hunted for. */
function leg(kinds, roles, fuel = 8, rewards = {}) {
  return {
    seed: "hand", leg: 1,
    stages: kinds.map((k, i) => ({
      kind: k, place: "Hand " + i, prose: "a hand-built system", toll: O.HAZARDS[k].toll, reward: rewards[i] || null,
    })),
    at: 0,
    crew: roles.map((r, i) => ({ id: i + 1, name: "Crew " + (i + 1), role: r, strain: 0, alive: true, lostAt: null })),
    fuel, maxFuel: 14,
    phase: "travel", history: [], log: [], events: [],
  };
}
const fp = (s) => O.keyOf(s) + "|" + s.phase
  + "|" + s.stages.map((x) => x.kind + x.place + x.toll + JSON.stringify(x.reward)).join(",")
  + "|" + s.crew.map((c) => c.name + c.role).join(",");

console.log("— determinism —");
{
  const a = O.buildLeg("alpha", 3, 8, 14, null), b = O.buildLeg("alpha", 3, 8, 14, null);
  ck(fp(a) === fp(b), "same (seed, leg, fuel) → identical haul");
  ck(fp(a) !== fp(O.buildLeg("beta", 3, 8, 14, null)), "different seeds differ");
  ck(fp(a) !== fp(O.buildLeg("alpha", 4, 8, 14, null)), "different leg numbers differ");

  const h1 = playHaul(O, "hh-4", "thrifty", 8), h2 = playHaul(O, "hh-4", "thrifty", 8);
  ck(h1.legs === h2.legs && h1.buried === h2.buried,
    `a full haul reproduces (${h1.legs} legs, ${h1.buried} lost)`);
}

console.log("\n— the graph is acyclic —");
{
  /* The real check. Walk the ENTIRE reachable graph and assert the ordering the
     rules.js header claims: every action either raises the stage, or holds the
     stage and strictly lowers the fuel. Nothing else is permitted, because
     anything else could close a loop. */
  function walk(s0, cap = 60000) {
    const seen = new Set();
    const stack = [s0];
    let violations = [], n = 0;
    while (stack.length && n < cap) {
      const s = stack.pop();
      const k = O.keyOf(s) + "|" + s.phase;
      if (seen.has(k)) continue;
      seen.add(k); n++;
      if (s.phase !== "travel") continue;
      for (const a of O.legalActions(s)) {
        const t = O.cloneState(s);
        if (!O.applyAction(t, a)) continue;
        // A burn that empties the tanks ends the haul where it stands: it moves
        // neither counter, but it terminates, which closes the graph just as
        // effectively as advancing it. Everything else must move forward.
        const forward = t.phase === "lost"
          || t.at > s.at
          || (t.at === s.at && t.fuel < s.fuel);
        if (!forward) violations.push(`${O.keyOf(s)} -${O.actionKey(a)}-> ${O.keyOf(t)}`);
        stack.push(t);
      }
    }
    return { states: n, violations, capped: n >= cap };
  }

  let total = 0, bad = [], capped = 0;
  for (let i = 0; i < 24; i++) {
    const s = O.buildLeg(`acyc-${i}`, 1 + (i % 6), 8 + (i % 5), 14, null);
    const r = walk(s);
    total += r.states;
    bad = bad.concat(r.violations);
    if (r.capped) capped++;
  }
  ck(bad.length === 0,
    `every transition in ${total} reachable states moves forward in (stage↑, fuel↓)${bad.length ? " — " + bad.slice(0, 3).join("; ") : ""}`);
  ck(capped === 0, "no graph needed truncating to finish walking");

  /* And the property that makes `rest` safe, stated on its own so a future
     change to REST_COST cannot quietly break the solver. */
  ck(O.REST_COST > 0, `rest costs fuel (${O.REST_COST}) — at 0 the graph would cycle`);
  const r = leg(["breach"], ["engineer"], 8);
  r.crew[0].strain = 1;
  const before = r.fuel;
  O.applyAction(r, { type: "rest", crew: 1 });
  ck(r.at === 0 && r.fuel === before - O.REST_COST && r.crew[0].strain === 1 - O.REST_RELIEF,
    "a layover holds station, spends fuel, and relieves the one person named");
  const two = leg(["breach"], ["engineer", "rigger"], 8);
  two.crew[0].strain = 1; two.crew[1].strain = 1;
  O.applyAction(two, { type: "rest", crew: 1 });
  ck(two.crew[1].strain === 1, "…and nobody else — a layover is not a reset");

  // Termination, from the other direction: every policy reaches an ending.
  let ok = true, longest = 0;
  for (let i = 0; i < 40; i++) {
    const s = O.buildLeg(`term-${i}`, 1 + (i % 8), 9, 14, null);
    for (const p of ["eager", "miser", "thrifty", "careful", "optimal"]) {
      const out = playLeg(O, s, p, O.newMemo());
      if (out.phase === "travel") ok = false;
      longest = Math.max(longest, out.history.length);
    }
  }
  ck(ok, `every policy reaches a terminal state (longest leg ${longest} actions)`);
}

console.log("\n— the memo changes no answers —");
{
  function viableRaw(s, depth = 0) {
    if (s.phase === "arrived") return true;
    if (s.phase === "lost" || depth > 40) return false;
    for (const a of O.legalActions(s)) {
      const n = O.cloneState(s);
      if (!O.applyAction(n, a)) continue;
      if (viableRaw(n, depth + 1)) return true;
    }
    return false;
  }
  let agree = true, checked = 0;
  for (let i = 0; i < 20; i++) {
    const s = O.buildLeg(`memo-${i}`, 1 + (i % 3), 7, 14, null);
    if (viableRaw(s) !== O.viable(s, O.newMemo())) agree = false;
    checked++;
  }
  ck(agree, `memoised and unmemoised search agree on all ${checked} hauls`);

  // Fuel and strain are both in the key, so a shared memo cannot leak an answer
  // between two states that differ only in one of them.
  const s1 = O.buildLeg("leak", 5, 12, 14, null);
  const memo = O.newMemo();
  const rich = O.viable(s1, memo);
  const dry = O.cloneState(s1); dry.fuel = 0;
  ck(O.viable(dry, memo) === O.viable(dry, O.newMemo()), "a shared memo agrees with a fresh one on fuel");
  const worn = O.cloneState(s1); worn.crew.forEach((c) => { c.strain = O.MAX_STRAIN - 1; });
  ck(O.viable(worn, memo) === O.viable(worn, O.newMemo()), "…and on strain");
  ck(rich === true, "a generated haul is finishable on arrival");
}

console.log("\n— the rules —");
{
  const s = leg(["breach", "drift"], ["engineer", "gunner"]);
  ck(O.legalActions(s).some((a) => a.type === "burn"), "burning through is always offered");
  ck(O.legalActions(s).some((a) => a.type === "send" && a.crew === 1), "a qualified hand is offered");
  ck(!O.legalActions(s).some((a) => a.type === "send" && a.crew === 2),
    "a hand this hazard has no use for is not offered");
  ck(!O.legalActions(s).some((a) => a.type === "rest"), "resting a rested crew is not offered");

  /* Strain accumulates and the last send is fatal. Written against MAX_STRAIN
     rather than against the number 3, because that number is a tuning knob —
     the sweep has already moved it once, and a test that hard-codes it fails
     for the wrong reason the next time it moves. */
  const M = O.MAX_STRAIN;
  const road = Array.from({ length: M + 1 }, () => "breach");
  const w = leg(road, ["engineer", "pilot"], 20);
  for (let k = 1; k <= M; k++) {
    O.applyAction(w, { type: "send", crew: 1 });
    if (k < M) {
      ck(w.crew[0].strain === k && w.at === k, `send ${k} advances and costs one trip outside`);
      ck(O.condition(w.crew[0]) !== "steady" && O.condition(w.crew[0]) !== "gone",
        `…and shows in their condition (${O.condition(w.crew[0])})`);
    }
  }
  ck(w.crew[0].alive === false && w.crew[0].lostAt === M - 1, `send ${M} loses them`);
  ck(O.condition(w.crew[0]) === "gone", "…and the word for it is 'gone'");
  ck(w.at === M, "and the ship still moves on — you did get past it");
  ck(!O.legalActions(w).some((a) => a.type === "send" && a.crew === 1), "the dead are not offered");

  // Burning costs the toll; overspending strands you.
  const b = leg(["breach"], ["engineer"], 5);
  O.applyAction(b, { type: "burn" });
  ck(b.fuel === 5 - O.HAZARDS.breach.toll && b.phase === "arrived", "burning costs exactly the toll");
  const dry = leg(["breach", "breach"], ["engineer"], 2);
  O.applyAction(dry, { type: "burn" });
  ck(dry.phase === "lost" && dry.fuel === 0, "a toll you cannot pay strands the haul");

  // Rest is refused, not half-applied, when it cannot help.
  const idle = leg(["breach"], ["engineer"], 8);
  const fuelBefore = idle.fuel;
  ck(O.applyAction(idle, { type: "rest", crew: 1 }) === false, "a layover for someone rested is refused");
  ck(idle.fuel === fuelBefore, "…and costs nothing when refused");
  const broke = leg(["breach"], ["engineer"], 1);
  broke.crew[0].strain = 1;
  ck(O.applyAction(broke, { type: "rest", crew: 1 }) === false && broke.fuel === 1,
    "a layover without the fuel for it is refused, and costs nothing");
}

console.log("\n— what you find out there —");
{
  const solved = leg(["breach", "dark"], ["engineer"], 8, { 0: { kind: "fuel", amount: 4 } });
  O.applyAction(solved, { type: "send", crew: 1 });
  ck(solved.fuel === 12, "handling a stage with salvage collects it");

  const burned = leg(["breach", "dark"], ["engineer"], 8, { 0: { kind: "fuel", amount: 4 } });
  O.applyAction(burned, { type: "burn" });
  ck(burned.fuel === 5, "burning past it collects nothing");

  const cap = leg(["breach", "dark"], ["engineer"], 13, { 0: { kind: "fuel", amount: 5 } });
  O.applyAction(cap, { type: "send", crew: 1 });
  ck(cap.fuel === cap.maxFuel, "salvage never overfills the tanks");

  const hire = leg(["breach", "dark"], ["engineer"], 8,
    { 0: { kind: "crew", name: "Wren Quist", role: "gunner" } });
  O.applyAction(hire, { type: "send", crew: 1 });
  ck(hire.crew.length === 2 && hire.crew[1].name === "Wren Quist", "a stage can sign on another hand");
  ck(hire.crew[1].id !== hire.crew[0].id, "…with an id that collides with nobody");
  ck(O.legalActions(hire).some((a) => a.type === "send" && a.crew === hire.crew[1].id),
    "…who is immediately usable");
}

console.log("\n— the solver —");
{
  // Exactly enough: one engineer, one breach, no fuel for the toll.
  const tight = leg(["breach"], ["engineer"], 0);
  ck(O.viable(tight, O.newMemo()) === true, "one hazard and exactly the right hand is finishable");
  const doomed = leg(["breach"], ["gunner"], 0);
  ck(O.viable(doomed, O.newMemo()) === false, "wrong discipline and no fuel is not");
  /* Exactly MAX_STRAIN breaches and one engineer, with no fuel: the last send
     kills them, which is legal, so the haul still completes. Losing people is
     not the same as losing. */
  const grim = leg(Array.from({ length: O.MAX_STRAIN }, () => "breach"), ["engineer"], 0);
  ck(O.viable(grim, O.newMemo()) === true, "a haul you finish by burying someone still counts as finished");

  const s = O.buildLeg("solve-2", 5, 9, 14, null);
  const memo = O.newMemo();
  const a = O.analyseChoice(s, memo);
  ck(a.legal > 0 && a.viable <= a.legal, `${a.viable} of ${a.legal} opening options keep the haul alive`);
  ck(a.alive === true, "a generated haul reports itself alive before the first move");

  let played = 0, kept = 0;
  for (const opt of a.options.filter((o) => o.viable)) {
    const n = O.cloneState(s);
    O.applyAction(n, opt.action);
    if (playLeg(O, n, "optimal", memo).phase === "arrived") kept++;
    played++;
  }
  ck(played > 0 && played === kept, `every option marked viable really arrives (${kept}/${played})`);

  let fatalOk = true, fatalN = 0;
  for (const opt of a.options.filter((o) => !o.viable)) {
    const n = O.cloneState(s);
    O.applyAction(n, opt.action);
    if (playLeg(O, n, "optimal", memo).phase === "arrived") fatalOk = false;
    fatalN++;
  }
  ck(fatalOk, `every option marked fatal really is (${fatalN} checked)`);
}

console.log("\n— the post-mortem names the right move —");
{
  /* Two breaches, one engineer, and fuel for exactly one of them. Spending the
     engineer on the FIRST breach is legal, survivable right now, and kills the
     haul three systems later — the shape the whole game is built around. */
  const s = leg(["breach", "breach", "dark"], ["engineer"], 3);
  const memo = O.newMemo();
  ck(O.viable(s, memo) === true, "the trap haul starts finishable");
  const live = O.cloneState(s);
  O.applyAction(live, { type: "burn" });          // fatal: spends the only fuel
  ck(live.phase === "travel", "the fatal move does not end the haul immediately");
  O.applyAction(live, { type: "send", crew: 1 }); // stage 1
  O.applyAction(live, { type: "burn" });          // stage 2 — dry
  ck(live.phase === "lost", "the haul ends two moves later");

  const pm = O.postMortem(s, live.history, memo);
  ck(pm !== null, "a post-mortem is produced");
  ck(pm && pm.index === 0 && pm.action.action === "burn",
    `it names the first burn, not the last (index ${pm && pm.index}, ${pm && pm.action.action})`);
  ck(pm && pm.stage === 0, "and the system the haul actually died at");

  const winner = leg(["breach"], ["engineer"], 0);
  const w = O.cloneState(winner);
  O.applyAction(w, { type: "send", crew: 1 });
  ck(O.postMortem(winner, w.history, O.newMemo()) === null, "a completed leg has no fatal move");
}

console.log("\n— the generator's contract —");
{
  let bad = [];
  for (let i = 0; i < 40; i++) {
    const n = 1 + (i % 9);
    const fuel = [10, 7, 5, 14][i % 4];      // include arriving poor
    const s = O.buildLeg(`gen-${i}`, n, fuel, 14, null);
    if (!O.viable(s, O.newMemo())) bad.push(`gen-${i}@L${n}/f${fuel}`);
  }
  ck(bad.length === 0, `all 40 generated hauls are finishable on arrival${bad.length ? " — " + bad.join(", ") : ""}`);

  let shapeOk = true, notes = [];
  for (let i = 0; i < 30; i++) {
    const s = O.buildLeg(`shape-${i}`, 1 + (i % 8), 9, 14, null);
    if (s.stages.length < 3) { shapeOk = false; notes.push("short route"); }
    if (O.alive(s).length < 2) { shapeOk = false; notes.push("crew of " + O.alive(s).length); }
    const ids = new Set(s.crew.map((c) => c.id));
    if (ids.size !== s.crew.length) { shapeOk = false; notes.push("duplicate crew id"); }
    for (const st of s.stages) {
      if (!O.HAZARDS[st.kind]) { shapeOk = false; notes.push("unknown hazard"); }
      if (!st.place || !st.prose) { shapeOk = false; notes.push("unnamed system"); }
      if (st.reward && st.reward.kind === "crew" && !O.ROLES[st.reward.role]) {
        shapeOk = false; notes.push("bad hire");
      }
    }
    for (const c of s.crew) if (!O.ROLES[c.role]) { shapeOk = false; notes.push("bad role"); }
  }
  ck(shapeOk, `hauls are well-formed: real hazards, named systems, a real crew${shapeOk ? "" : " — " + [...new Set(notes)].join(", ")}`);

  // Carrying between legs: fuel refills, people do not, and strain persists.
  const first = O.newGame("curve");
  ck(first.leg === 1 && first.fuel === O.START_FUEL, "a new haul starts at leg 1, full tanks");
  const worn = O.cloneState(first);
  worn.fuel = 3;
  worn.crew[0].strain = 2;
  const dead = worn.crew[1]; dead.alive = false;
  const nxt = O.nextLeg(worn);
  ck(nxt.leg === 2, "arriving starts the next leg");
  ck(nxt.fuel >= 3 + O.REFUEL_PER_LEG, "arriving buys fuel");
  const carried = nxt.crew.find((c) => c.name === worn.crew[0].name);
  ck(carried && carried.strain === 2, "…and the wear you arrived with comes with you");
  ck(!nxt.crew.some((c) => c.name === dead.name && c.id === dead.id), "the dead do not come with you");
  const full = O.cloneState(first); full.fuel = full.maxFuel;
  ck(O.nextLeg(full).fuel === full.maxFuel, "the refuel never exceeds the tanks");
}

console.log("\n— choice actually matters —");
{
  const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const depth = (p) => med(Array.from({ length: 14 }, (_, i) => playHaul(O, `d-${i}`, p, 10).legs));
  const opt = depth("optimal"), car = depth("careful"), thr = depth("thrifty"), eag = depth("eager");
  ck(opt > thr, `perfect play beats a decent heuristic (${opt} vs ${thr} legs)`);
  ck(thr >= eag, `judgement beats spending people freely (${thr} vs ${eag})`);
  ck(car >= thr, `paying for a layover is at least not a mistake (${car} vs ${thr})`);

  // The reason this game exists: a haul must be able to die well before it stops.
  let gaps = [];
  for (let i = 0; i < 60; i++) {
    const s = O.buildLeg(`fs-${i}`, 4 + (i % 5), 9, 14, null);
    const out = playLeg(O, s, "eager", O.newMemo());
    if (out.foresight !== null) gaps.push(out.foresight);
  }
  ck(gaps.length > 0, `naive play does fail sometimes (${gaps.length}/60)`);
  ck(Math.max(...gaps) >= 3,
    `a haul can become unwinnable well before it ends (max gap ${Math.max(...gaps)} systems)`);
}


console.log("\n— dead reckoning and the ways-through chart —");
{
  /* Both are new and both are load-bearing for the UI: reckoning draws the fog
     on the horizon during play, the ceiling series draws the chart at the end. */
  const s = O.buildLeg("reck-1", 4, 10, 16, null);
  const r = O.reckon(s);
  ck(r.at >= s.at && r.at <= s.stages.length, `reckoning stops somewhere on the route (${r.at}/${s.stages.length})`);
  ck(typeof r.arrived === "boolean", "…and says whether it thinks it gets there");

  // It must be a pure read: drawing the fog cannot move the game on.
  const fp0 = O.keyOf(s) + s.phase + s.history.length;
  O.reckon(s); O.reckon(s);
  ck(O.keyOf(s) + s.phase + s.history.length === fp0, "reckoning never mutates the state it is handed");

  // A policy that COMPLETES proves the route is completable — so reckoning
  // reaching the end must never contradict the solver.
  let contradictions = 0, arrived = 0, viableN = 0;
  for (let i = 0; i < 60; i++) {
    const t = O.buildLeg(`reck-${i}`, 1 + (i % 8), 10, 16, null);
    const v = O.viable(t, O.newMemo());
    if (v) viableN++;
    const rr = O.reckon(t);
    if (rr.arrived) { arrived++; if (!v) contradictions++; }
  }
  ck(contradictions === 0, "reckoning never claims to arrive on a route the solver calls dead");
  /* The one-sided leak, pinned. Reckoning reaching the end does imply the run is
     alive, so if this ever approached 100% the fog would become a viability
     oracle and the silence rule would be dead. It sits far below that. */
  ck(arrived / viableN < 0.6,
    `it clears to the end on only ${(100 * arrived / viableN).toFixed(0)}% of live routes — a short frontier is the norm, not an alarm`);

  // The chart.
  const memo2 = O.newMemo();
  const played = playLeg(O, s, "eager", memo2);
  const series = O.ceilingSeries(s, played.history, memo2);
  ck(series.length > 0 && series.length <= played.history.length, `the chart has a column per decision (${series.length})`);
  ck(series.every((p) => p.viable <= p.legal && p.legal > 0), "every column is viable-of-legal");
  ck(series.every((p) => typeof p.place === "string" && p.place.length), "every column knows where it was");
  // The ratchet itself: once the ceiling reaches zero it can never come back.
  let hitZero = false, resurrected = false;
  for (const p of series) {
    if (p.viable === 0) hitZero = true;
    else if (hitZero) resurrected = true;
  }
  ck(!resurrected, "the ceiling never rises again once it hits zero — that is the ratchet");
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
