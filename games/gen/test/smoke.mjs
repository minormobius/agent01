/* Smoke test for the Ludographer engine.
 *
 * Runs the deterministic generator over thousands of seeds and asserts the
 * coherence invariants that ARE the v1 playability guarantee: every generated
 * game is structurally legal, winnable-by-construction, and byte-identical on
 * re-roll. Also prints a distribution read-out so we can see how big the
 * realised design space actually is.
 *
 * Run:  node games/gen/test/smoke.mjs [N]
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
// The engine files are plain IIFEs that attach to globalThis; importing them
// for side effects is enough.
await import(path.join(here, "../js/prng.js"));
await import(path.join(here, "../js/lexicon.js"));
await import(path.join(here, "../js/generate.js"));

const L = globalThis.LUDO;
const N = parseInt(process.argv[2] || "5000", 10);

let fails = 0;
const seen = { topo: {}, core: {}, win: {}, theme: {}, mech: {}, combo: new Set() };
const sample = (o) => Object.keys(o).length;

function check(cond, n, msg) {
  if (!cond) { fails++; if (fails <= 25) console.error(`  ✗ seed ${n}: ${msg}`); }
}

// strip functions for a determinism compare
function stable(g) {
  return JSON.stringify(g, (k, v) => (typeof v === "function" ? undefined : v));
}

const WIN_TAG = { "vp-threshold": "vp", "race-finish": "race", "area-control": "majority",
  "last-standing": "elimination", "network-complete": "network", "set-monopoly": "set", "economic": "market" };

for (let n = 1; n <= N; n++) {
  let g;
  try { g = L.generate(n); }
  catch (e) { check(false, n, "threw: " + e.message); continue; }

  check(typeof g.title === "string" && g.title.length > 0, n, "no title");
  check(g.mechanics.length >= 1, n, "no mechanics");
  check(g.mechanics[0].family === "core", n, "first mechanic not a core");
  check(g.win && g.win.id, n, "no win condition");
  // the win condition's required tag must be present in the assembled set
  check(g._tags[WIN_TAG[g.win.id]], n, `win ${g.win.id} needs tag ${WIN_TAG[g.win.id]} but absent`);
  check(g.components.length >= 2, n, "too few components");
  check(g.resources.length >= 3 && g.r0, n, "thin economy");
  check(g.players.min >= 1 && g.players.min <= g.players.max, n, "bad player range");
  check(g.complexity >= 1.2 && g.complexity <= 5, n, "complexity out of range");
  check(g.turn && g.turn.text, n, "no turn structure");
  check(g.setup.length >= 4, n, "thin setup");
  check(typeof g.twist === "string" && g.twist.length > 10, n, "no twist");
  check(g.playtime >= 15, n, "implausible playtime");
  // every mechanic must be topology-compatible
  for (const m of g.mechanics) {
    const def = L.lex.byId(m.id);
    const ok = def.topos.indexOf("*") >= 0 || def.topos.indexOf(g.topology.id) >= 0;
    check(ok, n, `mechanic ${m.id} incompatible with topology ${g.topology.id}`);
  }
  // no conflicting mechanics co-present
  for (const m of g.mechanics) {
    const def = L.lex.byId(m.id);
    for (const c of (def.conflicts || [])) check(g.mechIds.indexOf(c) < 0, n, `conflict ${m.id} + ${c}`);
  }
  // rules text rendered without leaving raw template holes
  for (const m of g.mechanics) check(!/undefined|\bnull\b/.test(m.rule), n, `rule for ${m.id} has a hole`);

  // determinism
  if (n % 7 === 0) check(stable(g) === stable(L.generate(n)), n, "not deterministic");

  // distribution
  seen.topo[g.topology.id] = (seen.topo[g.topology.id] || 0) + 1;
  seen.core[g.mechanics[0].id] = (seen.core[g.mechanics[0].id] || 0) + 1;
  seen.win[g.win.id] = (seen.win[g.win.id] || 0) + 1;
  seen.theme[g.theme.id] = (seen.theme[g.theme.id] || 0) + 1;
  g.mechIds.forEach((id) => (seen.mech[id] = (seen.mech[id] || 0) + 1));
  seen.combo.add(g.topology.id + "|" + g.mechIds.slice().sort().join(",") + "|" + g.win.id);
}

console.log(`\nLudographer smoke — ${N} seeds`);
console.log(fails === 0 ? "  ✓ all invariants held" : `  ✗ ${fails} failures`);
console.log(`\n  distinct (topology · mechanic-set · win) combos in first ${N}: ${seen.combo.size}`);
console.log(`  topologies used: ${sample(seen.topo)}/${L.lex.TOPOLOGIES.length}` +
            `   cores used: ${sample(seen.core)}` +
            `   wins used: ${sample(seen.win)}/${L.lex.WINS.length}` +
            `   themes: ${sample(seen.theme)}/${L.lex.THEMES.length}` +
            `   mechanics: ${sample(seen.mech)}/${L.lex.MECH.length}`);

// show three sample games
console.log("\n  three sample games:");
for (const n of [1, 42, 1729]) {
  const g = L.generate(n);
  console.log(`   #${n}  "${g.title}" — ${g.theme.name}, ${g.topology.short}, [${g.mechIds.join(", ")}] → ${g.win.name} (wt ${g.complexity})`);
}

process.exit(fails === 0 ? 0 : 1);
