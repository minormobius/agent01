# plant — the loop's tree

**This directory is written by the agent loop. `foam/` is not.** That is the
whole point of it existing, and it is the only rule here that must never bend.

| | |
|---|---|
| `foam/` | hand-authored, humans only, deploys to `foam.mino.mobi` |
| `plant/` | **the loop's output**, seeded from foam, diverges from here |
| `loop/` | the monitoring surface — apparatus, not artifact |

"Did a human or a machine write this?" is answered by which directory a file is
in. No annotation to maintain, no exceptions to remember. Design record:
[`../docs/LOOP-SPRINTS.md`](../docs/LOOP-SPRINTS.md) §1.

The name: foam's third shiva tool is **plant** (insert a voronoi node and the
lattice reforms around it), and a plant is a factory. The mechanic and the genre
in one word.

## Status: LIVE at `plant.minomobi.com`

**What you write here reaches the internet.** A push touching `plant/**` fires
`deploy-plant.yml`, and there is no human between your turn and the publish.
That is deliberate — the programme's premise is that a loop grading itself
against gates it also writes goes blind, and the only correction is people
outside the loop, who need something they can open. But it means the
containment gate in `loop-work.yml` is now the only thing between a turn and
the public web. Write accordingly.

### The domain is NOT `plant.mino.mobi`, and that is a security decision

Every other surface in this repo is on `*.mino.mobi`. This one must not be,
because **this tree is written by agents**:

- `workers/auth` sets its session cookie with `Domain=.mino.mobi`, so a
  signed-in visitor's cookie is sent to **every** host under that domain.
- `isAllowedOrigin()` returns true for any hostname ending `.mino.mobi`, so
  such a host is CORS-allowlisted at the auth worker **automatically**, with no
  entry in the explicit list.

Agent-written JavaScript on `plant.mino.mobi` could therefore call
`auth.mino.mobi/pds/*` with a visitor's session and act on their ATProto
account. `plant.minomobi.com` is outside the cookie scope and outside the
allowlist. `CLOSED-LOOP.md` §6.1: *`minomobi.com` carries agent-generated
content and nothing else.*

Nor `minomobi.com/plant/` — that **path** is served by the `lab` worker, so a
loop push would fire `deploy-lab.yml` and republish every tenant site. A
**subdomain** is a separate worker and does not.

### What is served

`index.html` — the summon inspector. Drag to orbit a constellation; push the
anisotropy up and watch the space stretch while the shape stays exact; tick
*naive placement* to see the 22°, then try it on a cube and see nothing, which
is why that bug is dangerous. `view.js` is its renderer and
`test/view.selftest.mjs` checks the two things the page **claims** — that the
wireframe is the right polyhedron (against Euler, not a copied table) and that
the 22° is real and the cube really is exempt.

It also carries the **summon panel** — the first thing on this page that
touches real foam rather than a diagram. A top-down plan of a `generatePocket`
pocket; click it, pick a solid and a height, press summon, and the constellation
lands or is refused with a sentence that says *what it hit*. Every decision in
it belongs to `summon-session.mjs`: the handlers read a control, call the
session, and render what comes back — there is no threshold, no legality test
and no pocket arithmetic in the page, which is what
`test/index-summon-wiring.selftest.mjs` asserts (it reads `index.html` as text,
derives the six blame branches from the module's own `BLAME` export, and fails
on a placement constant re-typed into the page).

`summon-view.js` — the panel's **words and its map**, as two pure functions:
`summonSentence(res)` (the ✓/✗ line for any `preview()` *or* `place()` result,
branched on `blame`) and `planShapes(pocket, bounds, cands, cursor,
originCount)` (plain descriptors the page turns into SVG; `mine` is the one
judgement in it). They lived inside `index.html` until `lp-250e23`, where the
strongest reachable check was a regex over the page text — *six sentences exist
and differ*, which passes for a sentence reading `1.50 m` while the verdict says
`2.30 m`. `test/summon-view.selftest.mjs` drives a **real session** on the MACRO
fixture and, for every blame it can reach, **re-extracts each printed number
with a clause-specific regex and compares it to the field it came from**; the
`pocket` section runs a session at a deliberately non-default `minSeedGap` so a
hardcoded threshold fails. `blame:'foam'` is closure/nav and is not decidable
before the rebuild, so it may not occur on a fixture — the gate says so **out
loud** and checks that clause structurally rather than skipping quietly.

This page is scaffolding and you may replace it. What it must keep doing is
make the work **judgeable by a stranger in thirty seconds** — that is its only
requirement, and a prettier page that fails it is worse.

`production.mjs` — gate 5, the production-feasibility oracle (`FACTORIO.md`
§2/§3): exact linear feasibility over a source/processor/sink flow network, no
search, no model opinion. `test/production.selftest.mjs` pins it.

`placement.mjs` — "can this be summoned **here**?", answered before anything is
tried. It reproduces `reformPocket`'s two pre-checks — the hull clamp and the
1.5 m anisotropic seed gap — so a refusal is certain and names what it hit (a
seed index and the real gap, or a hull wall `B0`…`B5`). It is a **necessary**
condition only: `reformPocket` also refuses on closure and nav failures, and
neither is decidable without doing the rebuild, so `ok: true` means "no known
obstruction", never "it will work". Note the hull divergence, which is
deliberate: `reformPocket` silently *clamps* an out-of-bounds point and plants
somewhere else, and a summon whose centre moved is not the solid that was
verified — so out-of-hull is a refusal here. `test/placement.selftest.mjs` pins
it against real inserts.

The hull check also owns the **finiteness contract**, and it did not always:
`legalSeed(pocket, [NaN, 18, 40]).ok` was once `true`, because NaN does not
*fail* a range check — every ordered comparison against it is false, so a chain
of `<`/`>` falls through to the final `else`, and the final else in a validator
is almost always "fine". `undefined` (a point with too few coordinates) and an
un-coerced string went through the same hole. `hullViolation` now tests
`Number.isFinite` explicitly and refuses with `nonFinite: true` at
`depth: Infinity`, naming the axis and the wall; §7 of the selftest pins all
three cases against the kernel's independent answer. `summon-session.mjs` keeps
its own guard on top — not because the predicate is still wrong, but because
only the session can say `blame:'caller'`, which is "a bug in the code" rather
than "a move the player made", and a bad point must not count as a move.

`level.mjs` — the bridge. `production.mjs` knows about rates and `solids.mjs`
knows about geometry; nothing called both against **one ordered list of
placements**, so "I put a source next to a processor — does that work?" had no
answer here. `placementReport` walks the list in order and refuses each object
for `self-collision` or for colliding with an earlier one (naming which, and by
how much); `levelVerdict` then builds a `production.mjs` network from **only the
legal objects**, dropping every edge that names a refused one — a summon that
was never placed cannot supply or demand anything, and keeping the edge would
let a level "pass" on a factory it could never stand. Scope is **session-local**
and deliberately so: it composes, it does not reimplement, and it never looks at
a pocket. The pocket half is `placement.mjs`'s `legalSummon`.
`test/level.selftest.mjs` pins it.

`pocketLevel.mjs` — the two halves, joined. `pocketPlacementReport` walks the
same ordered list against a **real pocket**, so an object is refused for the
pocket's own reasons (`hull`, `seed`, `metric`) as well as the session's
(`self-collision`, `collides with existing summon`), and `pocketLevelVerdict`
then runs `level.mjs`'s `networkFrom` over what survived. **It ACCUMULATES**: a
legal object's seeds are committed before the next object is checked, so two
objects that each clear the static pocket and land on top of each other are
caught — the static version is cheap and wrong in exactly the way
`buildcert.mjs` exists to prevent. Precedence comes from `buildcert.mjs`'s
`BLAME_PRECEDENCE` rather than a second copy, and a refused object commits no
seeds, no node and no edge. Read `ok: true` as `placement.mjs` reads it — no
*known* obstruction, never "it will plant".
`test/pocket-level.selftest.mjs` pins it against a `generatePocket` fixture, and
proves the accumulation is real by first asserting that `legalSummon` on the
static pocket would have said yes.

`foamworld.js` — the ported pocket kernel, **and no longer byte-identical to
foam's**. It gained `reformPocketAll`, the atomic multi-insert: `reformPocket`
plants one seed, a summon is 5–21 of them, and planting them one at a time lets
the seventh call refuse after six have committed — six of thirteen seeds is not
a dodecahedron, it is a broken pocket every later verdict is then computed
against. The transaction runs every pre-check first and then does **one**
closure-and-nav pass, so it is also |seeds|× cheaper than the loop. A refusal
names what it hit (`hull` / `seed` / `batch` / `closure` / `nav`) and leaves the
pocket byte-for-byte untouched; `test/multi-insert.selftest.mjs` asserts that by
deep-comparing a snapshot, and first proves the naive loop really would have
half-applied. One deliberate divergence from `reformPocket`: **out-of-hull is
refused, not clamped** — same call `placement.mjs` made, for the same reason.

`levels/level2.mjs` — a discrete three-way machine choice (pick a smelter,
no dragging toward the answer), the direct alternative to `levels/level1.mjs`'s
continuous ore-rate slider. `test/level2.selftest.mjs` pins it.

`campaign.mjs` — **the six levels as one game**, and the half of vision item 1
that is not the page: `start()`, `move(value)`, `verdict()`, `next()`,
`state()`, no DOM, no events, no randomness, so `test/campaign.selftest.mjs`
plays the whole thing through in node.

Each level declares a **knob**: the *finite* set of settings the player is
offered, and an `apply` that turns one of them into a level. Every `apply`
calls the level's own helper (`withSourceRate` / `withProcessorCapacity`,
`SMELTER_OPTIONS`, each level's `withShareA`) — no level mutation is
reimplemented here.

**The play order is COMPUTED, not written down.** `ORDER` sorts the six by
`winFraction` — of all the settings offered, what proportion win — descending,
ties by id. `vision.md` suggests ordering by feasibility margin and **that
measure is wrong**: LEVEL_1 ships at margin 0.02 *by design* ("barely
satisfiable") and LEVEL_6 at 0, so shipped margin makes the tutorial the
hardest level in the game. Shipped margin measures how taut the designer left
the knob; win fraction measures how much of the player's own domain wins. The
computed answer is `level1, level4, level3, level2, level5, level6`, and the
gate **pins it as a literal** so retuning a level cannot silently reshuffle the
game.

Two things to know before changing it. **A knob's `samples` is exactly the range
and step of that level's control in `index.html` today** — that is what keeps
the measure honest rather than chosen, and the follow-up that wires the page
must take its control bounds *from here* instead of keeping a second copy.
And **`won` is `ok && moves > 0`**: five of the six levels open already fed, and
a level you win by arriving is not a level.

Not imported by `index.html` yet — turning the page into one-level-at-a-time is
the follow-up, and this module was deliberately built first so that work is
wiring rather than design.

> `withSourceRate` and `withProcessorCapacity` are **pure level transforms that
> happen to live in `level-view.js`**, a view file. `campaign.mjs`, `level2`,
> `level3` and `level4`'s gates all import them from there. Moving them
> somewhere more honest is a real (small) ticket of its own — it touches five
> importers — and it was deliberately **not** done here.

### `tools/` is PARKED WORK, not part of the game — and it is waiting on a human

`tools/loop-brief.mjs` + `tools/loop-brief.selftest.mjs` are **loop
infrastructure that lives here only because a fleet turn cannot write anywhere
else.** They implement relevance selection for the brief's memory section
(ticket `lp-14c7f5`): score each finding against the ticket's own words, keep
the top N, and exempt every dead-end and every operator answer unconditionally.

**Their home is `scripts/`, and moving them there is two `git mv` and nothing
else** — the module imports nothing, the test imports it as `./loop-brief.mjs`,
and the pair is location-independent as long as they move together. Read the
box at the top of either file.

Until somebody does that move, **the bead can never close**: its gate names
`node scripts/loop-brief.selftest.mjs`, no seat can create a file at that path,
so the gate fails, the outbox is never applied, and the reactor dispatches the
same bead again. Three turns have now landed here. Each one's findings died
with its outbox, which is why the reasoning lives in the file headers instead —
a comment in a committed file is the only channel a turn on this bead has.

They are in `tools/` and deliberately **not** `test/`: everything matching
`plant/test/*.selftest.mjs` is run by `loop-work`'s whole-suite check and by
`deploy-plant` before it publishes, and a bug in loop infrastructure must not
fail unrelated turns or block a deploy. Nothing runs them today. **Nobody has
ever executed either file.**

## What the loop may do here

Everything under `plant/**`, and nothing outside it. Enforced twice:
`.github/loop/config.json` declares the write paths, and `loop-work.yml`'s
containment gate reverts any diff that escapes them.

`scripts/loop-blast-radius.mjs` confirms a commit here wakes no workflow that
has not been declared — now `preflight`, `deploy-loop` and **`deploy-plant`**,
and that third one *does* publish this tree. The firewall is what keeps that
list honest: adding a workflow that watches `plant/**` without declaring it in
`.github/loop/config.json` fails the check.

## Seeding from foam

The port is a *copy*, not a symlink or a shared import: static sites cannot
import across directories, and the two trees are meant to diverge. When
hand-authored foam moves, bringing the change across is an explicit **port**
bead, not an automatic rebase. That is a real maintenance cost and it was
chosen knowingly — see `LOOP-SPRINTS.md` §7.2.

**Read [`../foam/FACTORIO.md`](../foam/FACTORIO.md) §1 before touching the
summon primitive.** The anisotropic metric rotates a naive constellation by 22°,
and a cube looks perfect anyway.
