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

This page is scaffolding and you may replace it. What it must keep doing is
make the work **judgeable by a stranger in thirty seconds** — that is its only
requirement, and a prettier page that fails it is worse.

`production.mjs` — gate 5, the production-feasibility oracle (`FACTORIO.md`
§2/§3): exact linear feasibility over a source/processor/sink flow network, no
search, no model opinion. `test/production.selftest.mjs` pins it.

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
