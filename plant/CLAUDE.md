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

## Status: not a surface yet

There is **no `wrangler.jsonc`, no registry entry and no deploy workflow.**
Nothing written here reaches the internet. That is deliberate for the first
turns — the loop can be exercised without anything it produces being published,
which makes a bad first turn cost nothing but runner minutes.

Registering the surface is a separate, signed step. When it happens the intended
shape is `plant.minomobi.com`:

- **not `plant.mino.mobi`** — that would put agent-generated content inside the
  SSO cookie's `Domain=.mino.mobi` scope, inside the auth worker's wildcard
  origin allowlist, and inside the operator's reputation. `CLOSED-LOOP.md` §6.1:
  *`minomobi.com` carries agent-generated content and nothing else.*
- **not `minomobi.com/plant/`** — that path is served by the `lab` worker, so a
  loop push would fire `deploy-lab.yml` and republish forty tenant sites on
  every sprint.

## What the loop may do here

Everything under `plant/**`, and nothing outside it. Enforced twice:
`.github/loop/config.json` declares the write paths, and `loop-work.yml`'s
containment gate reverts any diff that escapes them.

`scripts/loop-blast-radius.mjs` confirms a commit here wakes no workflow that
has not been declared — currently `preflight` and `deploy-loop` only, neither of
which publishes anything from this tree.

## Seeding from foam

The port is a *copy*, not a symlink or a shared import: static sites cannot
import across directories, and the two trees are meant to diverge. When
hand-authored foam moves, bringing the change across is an explicit **port**
bead, not an automatic rebase. That is a real maintenance cost and it was
chosen knowingly — see `LOOP-SPRINTS.md` §7.2.

**Read [`../foam/FACTORIO.md`](../foam/FACTORIO.md) §1 before touching the
summon primitive.** The anisotropic metric rotates a naive constellation by 22°,
and a cube looks perfect anyway.
