// pocketLevel.mjs — is a set of placed objects legal IN A REAL POCKET, and is
// the factory they form satisfiable?
//
// Two halves of this question were already answered separately and nothing
// called both:
//
//   `level.mjs`      "are these objects legal with respect to EACH OTHER"
//                    — session-local, no pocket, no hull, no existing seeds.
//   `placement.mjs`  "is this ONE object legal in THIS pocket"
//                    — hull + the 1.5 m anisotropic gap against the pocket's
//                      own seeds, but blind to anything else being placed.
//
// A player standing in a pocket needs both at once, and vision item 3 calls
// that composition the bridge between `production.mjs`'s rates and real
// geometry. This file is it. It COMPOSES and reimplements nothing: every
// geometric verdict is one `legalSummon` call, and the production half is
// `level.mjs`'s own `networkFrom` handed to `feasible`.
//
// ----------------------------------------------- THE ORDER DECISION, made ---
//
// `legalSummon(pocket, con)` checks `con` against the pocket's seeds AS GIVEN.
// With several objects going in one after another that is not the question the
// second object faces: by then the first object's seeds are IN the pocket. So
// there are two possible designs and only one of them is correct:
//
//   STATIC     — check every object against the original pocket. Cheap, and
//                WRONG in exactly the way `buildcert.mjs` exists to prevent: two
//                objects can each be clear of the pocket and land on top of each
//                other, and a level built on that verdict cannot be stood up.
//   ACCUMULATE — after each LEGAL object, commit its seeds and check the next
//                object against the pocket AS IT WILL BE.
//
// This file accumulates, using the same state-view technique `buildcert.mjs`
// already uses for the steps of one build: a `{ W, H, D, seeds, faces, opts }`
// object carrying the real pocket's box and metric with the committed seeds
// appended. `legalSummon` reads exactly those fields, so this is the SAME
// question asked of a later state, not a re-implementation of it.
//
// A consequence worth stating, because it is why no `pairGap` call appears
// below: THE ACCUMULATED SEED CHECK SUBSUMES `level.mjs`'s PAIRWISE ONE,
// exactly. `pairGap(conA, conB)` is the minimum of `seedGap` over every pair of
// their seeds under `conA.aniso`; the accumulated check is the minimum of
// `seedGap` over the same pairs under `pocket.opts.aniso`. Those are the same
// number, because a constellation whose `aniso` differs from the pocket's is
// refused for `metric` before it can ever commit a seed. Calling `pairGap` too
// would be a second copy of a check already being made.
//
// A REFUSED OBJECT COMMITS NOTHING. It was never placed, so it occupies no
// space, blocks nothing after it, and contributes no node and no edge to the
// factory. That is `level.mjs`'s rule and it survives the move to a pocket
// unchanged — see `plant/test/pocket-level.selftest.mjs`, which pins it by
// checking that the seed indices of consecutive legal objects are contiguous.
//
// ------------------------------------------------------------- the claim ---
//
// Inherited from `placement.mjs` and it cannot be stronger:
//
//   ok:false  →  CERTAIN refusal. `reformPocket`'s own pre-checks, restated.
//   ok:true   →  no KNOWN obstruction. `reformPocketAll` is still the authority;
//                it also refuses on closure and nav failures, and neither is
//                decidable without doing the rebuild.
//
// And one inherited under-report, recorded rather than papered over:
// `legalSummon` blames only the NEAREST existing seed to each summon seed, so a
// summon inside the gap of both a pocket seed and an earlier object's seed
// reports whichever is nearer. `blames` carries every category that fired; it
// is not a claim that no other category could have.
//
// Node-and-browser, no dependencies, no randomness — the foam rules.

import { legalSummon, MIN_SEED_GAP } from './placement.mjs';
import { BLAME_PRECEDENCE } from './buildcert.mjs';
import { networkFrom } from './level.mjs';
import { feasible } from './production.mjs';

/**
 * `legalSummon`'s vocabulary, split by WHO owns the seed that was hit, mapped
 * onto the reason strings a caller reads.
 *
 * The three pocket reasons are `placement.mjs`'s own words (`'metric'`,
 * `'hull'`, `'seed'`) and the two session reasons are `level.mjs`'s own words
 * (`'self-collision'`, `'collides with existing summon'`), so a UI already
 * written against either module keeps working against this one. Nothing here
 * invents a third vocabulary.
 */
export const REASON_OF = {
  metric: 'metric',
  hull: 'hull',
  self: 'self-collision',
  pocket: 'seed',
  step: 'collides with existing summon',
};

/** First-wins pick, so every tie-break below is decided by input order rather
 *  than by whatever the loop happened to see last. */
function pick(list, better) {
  return list.reduce((a, b) => (better(b, a) ? b : a));
}

/**
 * Walk `objects` IN ORDER and report, per object, whether it could be summoned
 * into `pocket` given the pocket's own seeds AND everything legal that came
 * before it.
 *
 * `objects` is an ordered array of `{ id, con }` — `con` is whatever
 * `solids.mjs`'s `constellation()` returned. Order is placement order and it
 * matters: an object is checked against what precedes it, never what follows.
 *
 * Every entry carries `level.mjs`'s shape, plus more:
 *
 *     { id, ok:true,  reason:null, seedIndices, refusals:[], first:null }
 *     { id, ok:false, reason, blame, blames, refusals, first, …detail }
 *
 * `seedIndices` are the positions this object's seeds will occupy in the final
 * pocket, counting from `pocket.seeds.length`. They are contiguous across
 * consecutive LEGAL objects — that is the observable form of "a refused object
 * commits nothing", and it is what the gate asserts.
 *
 * `reason` is decided by `BLAME_PRECEDENCE`, imported from `buildcert.mjs`
 * rather than restated, so the two files cannot disagree about which of several
 * simultaneous refusals is the one to fix first:
 *
 *     metric  →  'metric'                        (built for the wrong aniso)
 *     hull    →  'hull'                          (reaches outside the pocket)
 *     self    →  'self-collision'                (its own seeds fight)
 *     pocket  →  'seed'                          (a pre-existing pocket seed)
 *     step    →  'collides with existing summon' (an earlier LEGAL object)
 *
 * That ordering agrees with `level.mjs`, which also puts self-collision ahead
 * of a neighbour collision; it merely adds the two categories `level.mjs` has
 * no concept of, ahead of both.
 *
 * The detail fields per reason, all of them `legalSummon`'s own:
 *
 *   metric           `conAniso`, `pocketAniso`
 *   hull             `summonSeed`, `role`, `at`, `wall`, `axis`, `depth`,
 *                    `value`, `limit`, `clamped` — the DEEPEST violation, which
 *                    is the one a player must move furthest to fix. Note that
 *                    `clamped` is reported and NOT applied: `reformPocket`
 *                    silently clamps an out-of-hull point and plants somewhere
 *                    else, and a constellation whose centre moved is not the
 *                    solid that was verified, so this refuses instead. Same
 *                    divergence `placement.mjs` and `foamworld.js`'s
 *                    `reformPocketAll` already made, for the same reason.
 *   self-collision   `summonSeed`, `otherSummonSeed`, `gap`, `need` — tightest.
 *   seed             `summonSeed`, `role`, `seedIndex`, `seed`, `gap`, `need` —
 *                    tightest, and `seedIndex` indexes `pocket.seeds` directly
 *                    because a pocket seed is by definition below the base.
 *   collides…        `blockedBy`, `gap`, `blockers`, `seedIndex`, `summonSeed`,
 *                    `need`. `blockers` is one entry per earlier object hit,
 *                    each carrying the TIGHTEST gap against it; `blockedBy` is
 *                    the EARLIEST-PLACED of them, which is `level.mjs`'s
 *                    documented tie-break, and `gap` is the gap against that
 *                    one. `seedIndex` here indexes the ACCUMULATED seed list
 *                    (pocket seeds first, then each legal object's, in
 *                    placement order), so it is `>= pocket.seeds.length` —
 *                    the same convention `buildcert.mjs` uses for its plan.
 *
 * The two tie-breaks differ on purpose and it is not an oversight: pocket seeds
 * have no order, so the tightest is the informative one; earlier objects DO
 * have an order, and `level.mjs` already promises the first of them.
 *
 * Throws — rather than refusing — for malformed input, because that is a fact
 * about the caller and not about the geometry.
 */
export function pocketPlacementReport(pocket, objects, { minSeedGap = MIN_SEED_GAP } = {}) {
  const base = pocket.seeds.length;
  const seeds = pocket.seeds.map((s) => s.slice());
  const owners = pocket.seeds.map(() => null);
  const placedAt = new Map();   // object id → its index among the LEGAL objects
  const seenIds = new Set();
  const results = [];

  for (const obj of objects) {
    if (!obj || typeof obj.id !== 'string' || obj.id === '') {
      throw new Error('pocketLevel: every object needs a non-empty string id');
    }
    if (seenIds.has(obj.id)) throw new Error(`pocketLevel: duplicate object id "${obj.id}"`);
    seenIds.add(obj.id);
    if (!obj.con || !Array.isArray(obj.con.seeds) || obj.con.seeds.length === 0) {
      throw new Error(`pocketLevel: object "${obj.id}" carries no constellation`);
    }

    // The pocket AS IT WILL BE. `legalSummon` reads exactly W/H/D, `seeds` and
    // `opts.aniso`, so this is the same question asked of a later state.
    const state = { W: pocket.W, H: pocket.H, D: pocket.D, seeds, faces: pocket.faces, opts: pocket.opts };
    const verdict = legalSummon(state, obj.con, { minSeedGap });

    if (!verdict.ok) {
      results.push(classify(obj.id, verdict, owners, base, placedAt, minSeedGap));
      continue;
    }

    const seedIndices = obj.con.seeds.map((_, k) => seeds.length + k);
    for (const s of obj.con.seeds) { seeds.push(s.slice()); owners.push(obj.id); }
    placedAt.set(obj.id, placedAt.size);
    results.push({ id: obj.id, ok: true, reason: null, seedIndices, refusals: [], first: null });
  }

  return results;
}

/** Turn `legalSummon`'s refusals into one report entry. Split out only for
 *  legibility; it holds no state and is not exported. */
function classify(id, verdict, owners, base, placedAt, minSeedGap) {
  // The ONLY new judgement in this file: a `seed` refusal is attributed by
  // WHO OWNS the seed it hit. Below the base it is the pocket's — nothing the
  // player did puts it there. At or above the base it belongs to an object
  // placed earlier in this very report, which is a different problem with a
  // different fix, and telling a player "a rock is in the way" when they in
  // fact parked their own smelter there is the kind of confident wrong answer
  // this repo keeps recording.
  const refusals = verdict.refusals.map((r) => {
    if (r.reason !== 'seed') return { ...r, blame: r.reason };
    if (r.seedIndex < base) return { ...r, blame: 'pocket' };
    return { ...r, blame: 'step', blockedByNode: owners[r.seedIndex] };
  });

  const blames = BLAME_PRECEDENCE.filter((b) => refusals.some((r) => r.blame === b));
  const blame = blames[0] ?? null;
  const blamed = (b) => refusals.filter((r) => r.blame === b);
  const entry = {
    id, ok: false, reason: REASON_OF[blame] ?? 'refused',
    blame, blames, refusals, first: refusals[0] ?? null,
  };

  if (blame === 'metric') {
    const m = blamed('metric')[0];
    entry.conAniso = m.conAniso;
    entry.pocketAniso = m.pocketAniso;
  } else if (blame === 'hull') {
    const h = pick(blamed('hull'), (b, a) => b.depth > a.depth);
    entry.summonSeed = h.summonSeed; entry.role = h.role; entry.at = h.at.slice();
    entry.wall = h.wall; entry.axis = h.axis; entry.depth = h.depth;
    entry.value = h.value; entry.limit = h.limit; entry.clamped = h.clamped.slice();
  } else if (blame === 'self') {
    const s = pick(blamed('self'), (b, a) => b.gap < a.gap);
    entry.summonSeed = s.summonSeed; entry.otherSummonSeed = s.otherSummonSeed;
    entry.gap = s.gap; entry.need = s.need;
  } else if (blame === 'pocket') {
    const p = pick(blamed('pocket'), (b, a) => b.gap < a.gap || (b.gap === a.gap && b.seedIndex < a.seedIndex));
    entry.summonSeed = p.summonSeed; entry.role = p.role;
    entry.seedIndex = p.seedIndex; entry.seed = p.seed.slice();
    entry.gap = p.gap; entry.need = p.need;
  } else if (blame === 'step') {
    const byNode = new Map();
    for (const r of blamed('step')) {
      const prev = byNode.get(r.blockedByNode);
      if (!prev || r.gap < prev.gap) {
        byNode.set(r.blockedByNode, {
          id: r.blockedByNode, gap: r.gap,
          seedIndex: r.seedIndex, summonSeed: r.summonSeed, need: minSeedGap,
        });
      }
    }
    const blockers = [...byNode.values()].sort((a, b) => placedAt.get(a.id) - placedAt.get(b.id));
    entry.blockers = blockers;
    entry.blockedBy = blockers[0].id;
    entry.gap = blockers[0].gap;
    entry.seedIndex = blockers[0].seedIndex;
    entry.summonSeed = blockers[0].summonSeed;
    entry.need = minSeedGap;
  }

  return entry;
}

/**
 * The full certificate for a pocket: is this level buildable HERE, and winnable?
 *
 * `objects` is `pocketPlacementReport`'s input plus — on every object that turns
 * out to be LEGAL — a `node` field shaped like a `production.mjs` node, whose
 * `id` equals the object's. `edges` is `production.mjs`'s edge array over those
 * same ids.
 *
 * Returns `{ ok, placement, network }`. `network` is `feasible()`'s full result
 * over the surviving subset, assembled by `level.mjs`'s `networkFrom` — the
 * drop-the-refused-object rule is that function's, not a second copy of it.
 *
 * `ok` REQUIRES BOTH HALVES and `network.ok` is never the verdict on its own.
 * The trap is sharper here than it looks: dropping a refused SINK can leave a
 * network with no sinks at all, which `production.mjs` documents as vacuously
 * satisfiable with margin 0. So a level whose depot is standing inside a rock
 * reports `network.ok === true`, and a caller that renders the field which
 * sounds like the answer would tell the player they had won. The gate asserts
 * that whole shape explicitly rather than just asserting the verdict, because
 * asserting only the verdict passes for an implementation that reached it by
 * accident.
 *
 * Throws whatever `feasible()` and `networkFrom` throw — including
 * `networkFrom`'s messages, which say `level:` because they are `level.mjs`'s
 * checks and nothing is gained by re-badging them.
 */
export function pocketLevelVerdict(pocket, objects, edges = [], opts = {}) {
  const placement = pocketPlacementReport(pocket, objects, opts);
  const network = feasible(networkFrom(objects, placement, edges));

  return { ok: placement.every((r) => r.ok) && network.ok, placement, network };
}
