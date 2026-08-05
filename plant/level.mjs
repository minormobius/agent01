// level.mjs — is a set of placed objects both LEGAL and SATISFIABLE?
//
// `solids.mjs` knows about geometry: whether a constellation's own seeds are
// mutually legal (`selfCompatible`) and how close two constellations come to
// each other (`pairGap`). `production.mjs` knows about rates: whether a flow
// network meets its sinks' demand (`feasible`). Nothing called both against ONE
// ordered list of placements, so "I put a source next to a processor — does
// that work?" had no answer in this tree. That gap is this file.
//
// It COMPOSES, it does not reimplement. Every geometric predicate here is a
// call into `solids.mjs` and every rate number is a call into `production.mjs`.
// A second copy of either would be a second thing to keep in step, and this
// repo has already paid for that once (`seedGap` was hand-copied out of
// `foamworld.js` before the port existed).
//
// -------------------------------------------------------------- the scope ---
//
// **Session-local legality only.** These predicates answer "are the objects
// placed in this session legal with respect to EACH OTHER", and nothing else.
// They do not look at a pocket: not its existing seeds, not its hull, not its
// closure or nav gates. So:
//
//     placementReport(...).ok === false   ⟹   the summon is illegal, certainly
//     placementReport(...).ok === true    ⟹   nothing in THIS SESSION forbids it
//
// The pocket half is deliberately not called from here: `placement.mjs`'s
// `legalSummon(pocket, con)` reproduces `reformPocket`'s hull clamp and
// seed-gap refusal, and `foamworld.js`'s `reformPocketAll` is the authority
// that actually plants. **`pocketLevel.mjs` is that composition** — it walks
// the same ordered list against a real pocket, accumulating each legal object's
// seeds so later objects are checked against the pocket AS IT WILL BE. Reach
// for it when you have a pocket; reach for this file when you do not. Do not
// read `ok: true` from THIS file as "it will plant".
//
// Node-and-browser, no dependencies, no randomness — the foam rules.

import { selfCompatible, pairGap } from './solids.mjs';
import { MIN_SEED_GAP } from './placement.mjs';
import { feasible } from './production.mjs';

/**
 * Walk `objects` IN ORDER and report, per object, whether it could be summoned
 * given everything legal that came before it.
 *
 * `objects` is an ordered array of `{ id, con }`, where `con` is whatever
 * `solids.mjs`'s `constellation()` returned (it needs `.seeds` and `.aniso`).
 * Order is the placement order and it matters: an object is checked against the
 * objects BEFORE it, never after, so the report reads like a build log.
 *
 * Two ways to be refused, checked in this order:
 *
 *   `'self-collision'`              — the constellation's own seeds are inside
 *                                     each other's gap. It can never be summoned
 *                                     anywhere, so this is checked first and a
 *                                     self-colliding object never reports a
 *                                     collision with a neighbour it could not
 *                                     have reached in the first place.
 *   `'collides with existing summon'` — some EARLIER object that was itself
 *                                     legal comes within `minSeedGap`.
 *
 * Returns one entry per input object, in input order:
 *
 *     { id, ok: true,  reason: null }
 *     { id, ok: false, reason: 'self-collision' }
 *     { id, ok: false, reason: 'collides with existing summon', blockedBy, gap }
 *
 * `gap` is the actual anisotropic distance that fell short. The ticket's shape
 * did not ask for it; it is here because a refusal that returns only `false`
 * throws away the interesting half — the same argument `placement.mjs` makes
 * for naming the seed index and the real gap — and because it lets a test
 * cross-check the verdict against an independently computed number instead of
 * re-calling `pairGap` and proving nothing.
 *
 * ONLY EARLIER **LEGAL** OBJECTS BLOCK. A refused summon was never placed, so
 * it occupies no space and cannot refuse anything after it. Without that rule
 * one bad placement would poison every later one and a level would report a
 * cascade of failures with a single cause — which is a worse lie than reporting
 * nothing, because it points the player at the wrong object.
 *
 * When several earlier objects collide, the FIRST in placement order is named.
 * Deterministic by construction, and it is the same first-wins tie-break
 * `production.mjs` uses for its binding input.
 */
export function placementReport(objects, minSeedGap = MIN_SEED_GAP) {
  const seenIds = new Set();
  const results = [];
  const placed = []; // { id, con } — objects that were themselves legal

  for (const obj of objects) {
    if (!obj || typeof obj.id !== 'string' || obj.id === '') {
      throw new Error('level: every object needs a non-empty string id');
    }
    if (seenIds.has(obj.id)) throw new Error(`level: duplicate object id "${obj.id}"`);
    seenIds.add(obj.id);
    if (!obj.con || !Array.isArray(obj.con.seeds) || obj.con.seeds.length === 0) {
      throw new Error(`level: object "${obj.id}" carries no constellation`);
    }

    if (!selfCompatible(obj.con, minSeedGap)) {
      results.push({ id: obj.id, ok: false, reason: 'self-collision' });
      continue;
    }

    let hit = null;
    for (const earlier of placed) {
      const gap = pairGap(earlier.con, obj.con);
      if (gap < minSeedGap) { hit = { id: earlier.id, gap }; break; }
    }
    if (hit) {
      results.push({
        id: obj.id, ok: false, reason: 'collides with existing summon',
        blockedBy: hit.id, gap: hit.gap,
      });
      continue;
    }

    results.push({ id: obj.id, ok: true, reason: null });
    placed.push(obj);
  }

  return results;
}

/**
 * The production network implied by a placement report: the nodes of every
 * object the report found LEGAL, and every edge that names none of the refused
 * ones. Returns `{ nodes, edges }`, ready to hand to `feasible()`.
 *
 * A REFUSED SUMMON IS NOT IN THE FACTORY. Its node is left out of the network
 * and every edge naming it on either end is dropped, because an object that was
 * never placed cannot supply or demand anything. Keeping the edge would let a
 * level "pass" on a factory it could never actually stand — the exact failure
 * this file exists to make impossible.
 *
 * An edge naming an id that is not an object at all is NOT dropped: it is
 * passed through so `feasible()` raises its own `edge names unknown node`
 * error. Dropping it would swallow a typo in a level literal, and a silently
 * shrunken network is the hardest kind of wrong answer to notice.
 *
 * Exported — rather than left inside `levelVerdict` where it started — because
 * `pocketLevel.mjs` computes a DIFFERENT placement report (session legality AND
 * pocket legality, accumulating) and then needs this exact rule applied to it.
 * A second copy of these fifteen lines would be a second place for the
 * drop-the-edge rule to drift, and this repo has already paid for that kind of
 * duplication once. The `placement` argument is any array of
 * `{ id, ok }` in object order.
 */
export function networkFrom(objects, placement, edges = []) {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const refused = new Set(placement.filter((r) => !r.ok).map((r) => r.id));

  const nodes = [];
  for (const r of placement) {
    if (!r.ok) continue;
    const obj = byId.get(r.id);
    if (!obj.node) throw new Error(`level: object "${r.id}" is legal but carries no node`);
    if (obj.node.id !== r.id) {
      throw new Error(`level: object "${r.id}" carries a node whose id is "${obj.node.id}"`);
    }
    nodes.push(obj.node);
  }

  return { nodes, edges: edges.filter((e) => !refused.has(e.from) && !refused.has(e.to)) };
}

/**
 * The full certificate: is this level buildable AND winnable?
 *
 * `objects` is `placementReport`'s input, plus — on every object that turns out
 * to be LEGAL — a `node` field shaped exactly like a `production.mjs` node
 * (`source` / `processor` / `sink`; see that file's docstring for the three
 * shapes). Its `id` must equal the object's `id`, so that `edges` address one
 * namespace rather than two. `edges` is `production.mjs`'s edge array, written
 * in terms of those same ids. Refused objects and their edges are dropped by
 * `networkFrom` above; read its docstring for why.
 *
 * Returns `{ ok, placement, network }`, where `network` is `feasible()`'s full
 * result over the surviving subset. `ok` requires BOTH halves: every placement
 * legal and every sink fed. Note the asymmetry that follows and is deliberate —
 * dropping a refused sink can make `network.ok` vacuously TRUE (a network with
 * no sinks is trivially satisfiable), so `network.ok` alone is never the
 * verdict.
 *
 * Throws whatever `feasible()` throws (cycles, unknown nodes, unshared edge
 * resources, un-split fan-out); this layer adds no error handling of its own,
 * so a level author sees `production.mjs`'s own wording.
 */
export function levelVerdict(objects, edges = [], minSeedGap = MIN_SEED_GAP) {
  const placement = placementReport(objects, minSeedGap);
  const network = feasible(networkFrom(objects, placement, edges));

  return { ok: placement.every((r) => r.ok) && network.ok, placement, network };
}
