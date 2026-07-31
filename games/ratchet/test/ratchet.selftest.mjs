/* node games/ratchet/test/ratchet.selftest.mjs
 *
 * Gates The Ratchet. The load-bearing properties:
 *
 *   1. The state graph is acyclic and every run terminates. The solver is a
 *      plain memoised DFS with no depth limit; a cycle would hang it.
 *   2. The memo does not change any answer. Everything the game says about your
 *      run comes through it, so it is checked against an unmemoised search.
 *   3. Every route handed to a player is completable with the supply they
 *      actually arrive with. Losing has to be something you did.
 *   4. The post-mortem names the right move.
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { loadRatchet, playRoute, playRun } from "./harness.mjs";

const R = await loadRatchet();
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

/* A hand-built route, so scenarios are exact rather than hunted for. */
function route(kinds, kit, supply = 8, rewards = {}) {
  return {
    seed: "hand", route: 1,
    stages: kinds.map((k, i) => ({ kind: k, toll: R.OBSTACLES[k].toll, reward: rewards[i] || null })),
    at: 0, kit: Object.assign({}, kit), supply, maxSupply: 10,
    phase: "travel", history: [], events: [],
  };
}
const fp = (s) => R.keyOf(s) + "|" + s.phase + "|" + s.stages.map((x) => x.kind + x.toll + (x.reward || "")).join(",");

console.log("— determinism —");
{
  const a = R.buildRoute("alpha", 3, 8, 10), b = R.buildRoute("alpha", 3, 8, 10);
  ck(fp(a) === fp(b), "same (seed, route, supply) → identical route");
  ck(fp(a) !== fp(R.buildRoute("beta", 3, 8, 10)), "different seeds differ");
  ck(fp(a) !== fp(R.buildRoute("alpha", 4, 8, 10)), "different route numbers differ");
  // Supply is an input to generation (the guarantee is checked against it), so
  // arriving poor may legitimately yield a different road.
  const poor = R.buildRoute("alpha", 3, 2, 10);
  ck(poor.supply === 2, "the route is built against the supply you arrive with");

  const r1 = playRun(R, "rr-4", "thrifty", 8), r2 = playRun(R, "rr-4", "thrifty", 8);
  ck(r1.routes === r2.routes, `a full run reproduces (${r1.routes} routes)`);
}

console.log("\n— the graph is acyclic and everything terminates —");
{
  let ok = true, maxLen = 0;
  for (let i = 0; i < 40; i++) {
    const s = R.buildRoute(`term-${i}`, 1 + (i % 8), 8, 10);
    for (const p of ["eager", "hoarder", "thrifty", "optimal"]) {
      const out = playRoute(R, s, p, R.newMemo());
      if (out.phase === "travel") ok = false;
      maxLen = Math.max(maxLen, out.history.length);
    }
  }
  ck(ok, `every policy reaches a terminal state (longest run ${maxLen} actions)`);

  // Every action strictly advances the stage or removes a tool — the property
  // that makes the graph acyclic in the first place.
  let monotone = true;
  for (let i = 0; i < 25; i++) {
    let s = R.buildRoute(`mono-${i}`, 4, 8, 10);
    let guard = 0;
    while (s.phase === "travel" && guard++ < 80) {
      const before = { at: s.at, tools: R.kitTotal(s.kit) };
      const acts = R.legalActions(s);
      const a = acts[guard % acts.length];
      const n = R.cloneState(s);
      R.applyAction(n, a);
      const advanced = n.at > before.at;
      const spent = R.kitTotal(n.kit) < before.tools;
      // A reward can add a tool, but only while advancing. A toll that strands
      // you does neither — it ends the run outright, which terminates the graph
      // just as effectively, so it is exempt.
      if (n.phase === "travel" && !advanced && !spent) monotone = false;
      s = n;
    }
  }
  ck(monotone, "every action either advances a stage or consumes a tool");
}

console.log("\n— the memo changes no answers —");
{
  // Unmemoised reference search. Slow, so only on short routes.
  function viableRaw(s, depth = 0) {
    if (s.phase === "won") return true;
    if (s.phase === "lost" || depth > 40) return false;
    for (const a of R.legalActions(s)) {
      const n = R.cloneState(s);
      if (!R.applyAction(n, a)) continue;
      if (viableRaw(n, depth + 1)) return true;
    }
    return false;
  }
  let agree = true, checked = 0;
  for (let i = 0; i < 24; i++) {
    const s = R.buildRoute(`memo-${i}`, 1 + (i % 3), 6, 10);
    if (viableRaw(s) !== R.viable(s, R.newMemo())) agree = false;
    checked++;
  }
  ck(agree, `memoised and unmemoised search agree on all ${checked} routes`);

  // And the memo must not leak between differing supplies.
  const s1 = R.buildRoute("leak", 5, 10, 10);
  const memo = R.newMemo();
  const rich = R.viable(s1, memo);
  const poor = R.cloneState(s1); poor.supply = 0;
  ck(R.viable(poor, memo) === R.viable(poor, R.newMemo()),
    "a shared memo gives the same answer as a fresh one (supply is in the key)");
  ck(rich === true, "a generated route is completable at full supply");
}

console.log("\n— the rules —");
{
  const s = route(["scree", "ravine"], { rope: 1 });
  ck(R.legalActions(s).some((a) => a.type === "pay"), "walking through is always offered");
  ck(R.legalActions(s).some((a) => a.type === "use" && a.tool === "rope"), "a carried, accepted tool is offered");
  ck(!R.legalActions(s).some((a) => a.type === "use" && a.tool === "charge"), "a tool you do not carry is not offered");

  const s2 = route(["tunnel"], { rope: 1 });
  ck(!R.legalActions(s2).some((a) => a.type === "use"), "a carried tool the stage rejects is not offered");
  ck(R.legalActions(s2).some((a) => a.type === "scrap" && a.tool === "rope"), "but it can still be scrapped");

  // Scrap trades but does not travel.
  const s3 = route(["ravine"], { rope: 1, coin: 1 }, 5);
  R.applyAction(s3, { type: "scrap", tool: "coin" });
  ck(s3.at === 0, "scrapping does not advance the stage");
  ck(s3.supply === 5 + R.SCRAP_VALUE, `scrapping pays ${R.SCRAP_VALUE} supply`);
  ck(R.kitCount(s3.kit, "coin") === 0, "and consumes the tool");

  const cap = route(["ravine"], { coin: 1 }, 10);
  R.applyAction(cap, { type: "scrap", tool: "coin" });
  ck(cap.supply === 10, "scrap never exceeds max supply");

  // Paying costs the toll; overpaying strands you.
  const s4 = route(["ravine"], {}, 5);
  R.applyAction(s4, { type: "pay" });
  ck(s4.supply === 2 && s4.phase === "won", "paying a toll you can afford costs exactly the toll");
  const s5 = route(["ravine", "ravine"], {}, 2);
  R.applyAction(s5, { type: "pay" });
  ck(s5.phase === "lost" && s5.supply === 0, "a toll you cannot afford strands the run");

  // Using a tool crosses and consumes.
  const s6 = route(["ravine"], { bridge: 1 });
  R.applyAction(s6, { type: "use", tool: "bridge" });
  ck(s6.phase === "won" && R.kitCount(s6.kit, "bridge") === 0, "using a tool crosses and consumes it");
}

console.log("\n— caches pay for solving, never for surviving —");
{
  const solved = route(["ravine", "scree"], { bridge: 1 }, 8, { 0: "lantern" });
  R.applyAction(solved, { type: "use", tool: "bridge" });
  ck(R.kitCount(solved.kit, "lantern") === 1, "solving a cache stage grants the tool");

  const walked = route(["ravine", "scree"], { bridge: 1 }, 8, { 0: "lantern" });
  R.applyAction(walked, { type: "pay" });
  ck(R.kitCount(walked.kit, "lantern") === 0, "walking through a cache stage grants nothing");
}

console.log("\n— the solver —");
{
  // Exactly enough: one bridge, one ravine, no supply for the toll.
  const tight = route(["ravine"], { bridge: 1 }, 0);
  ck(R.viable(tight, R.newMemo()) === true, "a route with exactly the right tool is completable");
  const doomed = route(["ravine"], { coin: 1 }, 0);
  ck(R.viable(doomed, R.newMemo()) === false, "no tool and no supply is not completable");
  // ...but scrapping the useless coin buys the toll.
  const saved = route(["ravine"], { coin: 1 }, 1);
  ck(R.viable(saved, R.newMemo()) === true, "scrapping a useless tool can buy the crossing");

  const s = R.buildRoute("solve-2", 5, 8, 10);
  const memo = R.newMemo();
  const a = R.analyseChoice(s, memo);
  ck(a.legal > 0 && a.viable <= a.legal, `${a.viable} of ${a.legal} opening options keep the route alive`);
  ck(a.alive === true, "a generated route reports itself alive before the first move");

  // The solver's claim must survive being played out.
  let played = 0, kept = 0;
  for (const opt of a.options.filter((o) => o.viable)) {
    const n = R.cloneState(s);
    R.applyAction(n, opt.action);
    const out = playRoute(R, n, "optimal", memo);
    played++;
    if (out.phase === "won") kept++;
  }
  ck(played > 0 && played === kept, `every option marked viable really completes (${kept}/${played})`);

  // And the ones marked fatal really are.
  let fatalOk = true, fatalN = 0;
  for (const opt of a.options.filter((o) => !o.viable)) {
    const n = R.cloneState(s);
    R.applyAction(n, opt.action);
    if (playRoute(R, n, "optimal", memo).phase === "won") fatalOk = false;
    fatalN++;
  }
  ck(fatalOk, `every option marked fatal really is (${fatalN} checked)`);
}

console.log("\n— the post-mortem names the right move —");
{
  // Two ravines, one bridge, and just enough supply for one toll. Scrapping the
  // bridge at stage 1 is legal, survivable right now, and kills the run.
  const s = route(["ravine", "ravine"], { bridge: 1 }, 3);
  const memo = R.newMemo();
  ck(R.viable(s, memo) === true, "the trap route starts completable");
  const live = R.cloneState(s);
  R.applyAction(live, { type: "scrap", tool: "bridge" });   // fatal, but survivable
  ck(live.phase === "travel", "the fatal move does not end the run immediately");
  R.applyAction(live, { type: "pay" });                     // stage 1
  R.applyAction(live, { type: "pay" });                     // stage 2 — stranded
  ck(live.phase === "lost", "the run ends two moves later");

  const pm = R.postMortem(s, live.history, memo);
  ck(pm !== null, "a post-mortem is produced");
  ck(pm && pm.index === 0 && pm.action.action === "scrap",
    `it names the scrap, not the final step (index ${pm && pm.index}, ${pm && pm.action.action})`);
  ck(pm && pm.stage === 0, "and the stage the run actually died on");

  // A won run has no fatal move.
  const winner = route(["ravine"], { bridge: 1 }, 0);
  const w = R.cloneState(winner);
  R.applyAction(w, { type: "use", tool: "bridge" });
  ck(R.postMortem(winner, w.history, R.newMemo()) === null, "a completed route has no fatal move");
}

console.log("\n— the generator's contract —");
{
  let bad = [];
  for (let i = 0; i < 40; i++) {
    const level = 1 + (i % 9);
    // Include arriving-poor cases: the guarantee is against real supply.
    const supply = [8, 5, 3, 10][i % 4];
    const s = R.buildRoute(`gen-${i}`, level, supply, 10);
    if (!R.viable(s, R.newMemo())) bad.push(`gen-${i}@L${level}/s${supply}`);
  }
  ck(bad.length === 0, `all 40 generated routes are completable on arrival${bad.length ? " — " + bad.join(", ") : ""}`);

  let shapeOk = true;
  for (let i = 0; i < 30; i++) {
    const s = R.buildRoute(`shape-${i}`, 1 + (i % 8), 8, 10);
    if (s.stages.length < 3) shapeOk = false;
    if (R.kitTotal(s.kit) < 1) shapeOk = false;
    for (const st of s.stages) if (!R.OBSTACLES[st.kind]) shapeOk = false;
    for (const st of s.stages) if (st.reward && !R.TOOLS[st.reward]) shapeOk = false;
  }
  ck(shapeOk, "routes are well-formed: real obstacles, real rewards, a non-empty kit");

  const first = R.newGame("curve");
  ck(first.route === 1 && first.supply === R.START_SUPPLY, "a new game starts at route 1, full supply");
  const nxt = R.nextRoute(Object.assign(R.cloneState(first), { supply: 2 }));
  ck(nxt.route === 2 && nxt.supply === 2 + R.REFILL_PER_ROUTE, "crossing refills a little supply");
  const full = R.nextRoute(Object.assign(R.cloneState(first), { supply: 10 }));
  ck(full.supply === 10, "the refill never exceeds max");
}

console.log("\n— choice actually matters —");
{
  const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const depth = (p) => med(Array.from({ length: 14 }, (_, i) => playRun(R, `g-${i}`, p, 10).routes));
  const opt = depth("optimal"), thr = depth("thrifty"), hrd = depth("hoarder");
  ck(opt > thr, `perfect play beats a decent heuristic (${opt} vs ${thr} routes)`);
  ck(thr >= hrd, `spending sometimes beats never spending (${thr} vs ${hrd})`);

  // The reason this game exists: a run must be able to die well before it stops.
  let gaps = [];
  for (let i = 0; i < 60; i++) {
    const s = R.buildRoute(`fs-${i}`, 4 + (i % 5), 8, 10);
    const out = playRoute(R, s, "eager", R.newMemo());
    if (out.foresight !== null) gaps.push(out.foresight);
  }
  ck(gaps.length > 0, `naive play does fail sometimes (${gaps.length}/60)`);
  ck(Math.max(...gaps) >= 3,
    `a run can become unwinnable well before it ends (max gap ${Math.max(...gaps)} stages)`);
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
