/* phylofiction — engine tests. Pure node, no build:  node --test phylofiction/test
 *
 * Two things must hold for the whole premise (SPEC §0, §1.2):
 *   1. Determinism — page n yields the identical tree for ever.
 *   2. The Great-Oxygenation scar *emerges* unauthored on some seeds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evolveWorld, findSeed } from "../js/evolve.js";

function fingerprint(w) {
  // a cheap structural hash: ids, parents, births, deaths, caps
  return w.tree.nodes
    .map((n) => `${n.id}:${n.parentId}:${n.birth}-${n.last}:${n.extinct ? "x" : "o"}:${n.caps.sort().join(",")}`)
    .join("|") + "#events=" + w.events.length;
}

test("deterministic: same seed → identical tree", () => {
  const a = evolveWorld(7);
  const b = evolveWorld(7);
  assert.equal(fingerprint(a), fingerprint(b));
});

test("different seeds → different trees (overwhelmingly)", () => {
  const seen = new Set();
  for (let n = 0; n < 25; n++) seen.add(fingerprint(evolveWorld(n)));
  // allow the rare collision but demand real variety
  assert.ok(seen.size >= 20, `expected variety, got ${seen.size} distinct of 25`);
});

test("basic sanity: a root, a tree, bounded sizes", () => {
  const w = evolveWorld(3);
  const roots = w.tree.nodes.filter((n) => n.parentId === null);
  assert.equal(roots.length, 1, "exactly one root lineage");
  assert.ok(w.tree.nodes.length >= 3, "tree grew past the root");
  assert.ok(w.tree.nodes.length < 2000, "tree stayed bounded");
  // every non-root has a valid parent
  const ids = new Set(w.tree.nodes.map((n) => n.id));
  for (const n of w.tree.nodes) if (n.parentId !== null) assert.ok(ids.has(n.parentId));
  // oxidant never leaves [0,1]
  for (const s of w.env) assert.ok(s.oxidant >= 0 && s.oxidant <= 1);
});

test("the Great Oxygenation emerges on some seed (the proof-of-concept)", () => {
  // a composed predicate — a taste of the interestingness filter (SPEC §6.2):
  // a world that both oxygenated AND had its dominant metabolism overturned.
  const hit = findSeed((w) => w.summary.oxygenated && w.score.reversal > 0.2, 0, 300);
  assert.ok(hit, "no seed in 0..300 told the full oxygenation story — the loop is broken");
  const w = hit.world;
  // the scar must be causal, not cosmetic: anaerobes died *of the oxidant*…
  const poisoned = w.tree.nodes.filter((n) => n.extinct && n.deathCause === "oxidant").length;
  assert.ok(poisoned > 0, "oxygenated but no anaerobes were poisoned — scar is cosmetic");
  // …and aerobes inherited the world they poisoned (survivorship reversal).
  const survAerobic = w.tree.nodes.filter((n) => !n.extinct && n.caps.includes("respireOx")).length;
  assert.ok(survAerobic > 0, "no aerobic lineage survived to inherit the oxygenated world");
});

test("findSeed is itself deterministic", () => {
  const p = (w) => w.summary.oxygenated && w.score.reversal > 0.2;
  assert.equal(findSeed(p, 0, 300).n, findSeed(p, 0, 300).n);
});
