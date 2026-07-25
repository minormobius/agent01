# golem — golem.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

golem.mino.mobi — Minecraft-like builder world over cube3D's smart cellular bricks (sequel to tjs.mino.mobi/cube/)…

## Facts

| | |
|---|---|
| Surface | `golem` |
| Dir | `golem/` |
| Endpoint | `golem.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/cube3d-browser-port-ufh9gy` |
| Deploy | `.github/workflows/deploy-golem.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "golem"`.

## How it works

golem.mino.mobi — Minecraft-like builder world over cube3D's smart cellular bricks (sequel to tjs.mino.mobi/cube/). Build a body brick-by-brick on a 15³ pad (face-snap raycast placement, mirror symmetry, undo/redo, template shapes from the real 487-shape dataset, permalink codec: whole structure = 563-char #b= URL) while every cube runs the EXACT trained ESP32 firmware network and gossips class beliefs with face-neighbours — the consensus bars run live as you build. Wake it and identity becomes a verb, decentralized where it counts: throttle = vote consensus × Kuramoto sync order-parameter (per-cube phase oscillators coupled to face-neighbours + shared-body mean field — the gait clock no one owns), undecided cubes fidget (twitch = belief entropy). Verbs: car drives, plane taxis/flies a circuit/lands, boat sails (water disc), chair+table waddle on their legs, guitar stays and plucks pentatonic WebAudio on clock beats, house refuses to move (settles + chimney smoke). BIOMES: a Workshop/Reef switch swaps the entire vocabulary — Reef loads the self-trained marine model (reef/model/weights-reef.js, 95% held-out majority; vendored with reef/js/species.js into golem/js/vendor/ at deploy time by deploy-golem.yml, gitignored) with marine verbs: fish school (emergent cohesion steering), eel undulates via a genuine traveling wave (shared Kuramoto clock + spatial phase lag along the body axis — the CPG trick), ray glides banking, jellyfish pulses on the clock beat, turtle paddles, anemone sways, coral GROWS via nca.place() with gossip recruiting each new brick; swimmers own the vertical axis so collisions are 3D (vertical-extent gap check). Creatures collide: footprint circles, mass-weighted shoving (mass = brick count), houses/guitars immovable, airborne planes exempt; a hard crash (closing speed threshold) knocks the brick nearest the impact off BOTH parties — crash damage feeds back into consensus/throttle and can split a creature. Erase cuts awake creatures: connected components become independent creatures carrying their beliefs and clock phases forward (mitosis); fragments <3 bricks die as debris. Engine: 4 pure ES modules (nca/body/gaits/builder), one InstancedMesh, no build step, no physics engine; node-tested in golem/js/golem.selftest.mjs (37 checks incl. numpy-golden parity <5e-6) — the deploy workflow runs the selftest as a gate.

## Deploy status

MANAGED — new surface via deploy-golem.yml (Worker `golem`). Assets-only static worker, selftest gate before deploy.

## Deploying

Pushes to `claude/cube3d-browser-port-ufh9gy` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-golem.yml`](../.github/workflows/deploy-golem.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
