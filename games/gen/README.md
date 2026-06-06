# The Ludographer — `games.mino.mobi/gen/`

A **procedurally generated, endless catalogue of board games**. Give it a
number; it gives you back the same complete board game — deterministically, on
any machine, for ever: a theme, a board topology, a tight set of mechanics that
*actually fit each other*, the components those mechanics imply, a generated
rulebook, an imaginary designer, a win condition the game can really be driven
toward, and one deliberately "shaken-loose" rule.

This is the `borges/` trick (seeded combinatorial generation, mulberry32+xmur3)
re-aimed from medieval tales at the games table. It lives **inside** the
existing `games/` party-game platform but touches none of it: `/gen/` is pure
static HTML/JS served through the assets fallback in `games/worker.js`. No
worker route, no Durable Object, no D1, no build step, no secrets.

## Why this isn't noise

~95% of *random* mechanic mash-ups are unplayable. The interesting part is the
**grammar** (`js/lexicon.js`): every mechanic primitive is tagged with what it
`provides`, what it `requires`, what it `conflicts` with, and which board
topologies it's compatible with. Generation (`js/generate.js`) is then a
**constraint walk**, not a dice-roll:

1. pick a **core engine** mechanic (one that reaches a win-eligible capability)
2. pick a **topology** it's compatible with
3. add **secondary mechanics** that legally fit (requires satisfied, no
   conflicts, topology-compatible, within a complexity budget)
4. derive the **components** as the union the mechanics imply
5. pick a **win condition** whose required capability the assembled set provides
6. derive turn structure, setup, player count, complexity, playtime
7. skin it with a **theme** (renames the whole resource economy + piece nouns)
8. name it, invent a designer, write the rulebook prose, flag one **twist**

Because the grammar can only *express* combinations that cohere, **every number
you can open is a game that holds together** — winnable by construction. That is
the v1 playability guarantee.

> **What v1 does NOT do:** catch the *boring-but-legal* games (a coherent
> ruleset can still be a solved or degenerate game). That needs a bot that
> auto-playtests each generated game a few hundred times and rejects/re-rolls
> the degenerate ones — the **phase-2** milestone, which arrives together with
> actually being able to *play* the games (see roadmap).

## Files

```
games/gen/
  index.html        the lobby — pitch, go-to-a-number, random, featured cards, live stats
  game.html         the reader — loads the engine + renders one rulebook with endless nav
  css/gen.css       one stylesheet for both (per-game palette via --accent / --accent2 / --board)
  js/prng.js        seeded deterministic RNG (mulberry32 + xmur3). attaches to LUDO.prng
  js/lexicon.js     THE GRAMMAR — topologies, mechanics (provides/requires/conflicts), wins,
                    components, themes, designer banks. attaches to LUDO.lex
  js/generate.js    THE ENGINE — n -> full coherent spec. attaches to LUDO.generate(n)
  js/board.js       one stylised SVG board diagram per topology. attaches to LUDO.board(g)
  js/render.js      spec -> rulebook DOM + nav wiring. attaches to LUDO.render / LUDO.mountReader
  test/smoke.mjs    node harness: thousands of seeds, asserts the coherence invariants
```

The engine files attach to `globalThis` (not just `window`), so they unit-test
in plain node — same convention as `borges/`.

## URLs

- `games.mino.mobi/gen/` — the catalogue lobby
- `games.mino.mobi/gen/game.html?n=<number>` — the permalink for one game

`n` is the whole identity. `?n=42` is the same game tomorrow, on your phone, on
mine. That stability is what makes a permalink meaningful (and what will let a
future "publish this game to my PDS" step mean something).

## Test

```bash
node games/gen/test/smoke.mjs 5000
```

Asserts, per seed: a title, ≥1 mechanic with a core first, a win condition whose
required tag is actually present, ≥2 components, a real economy, a sane player
range, in-range complexity, a turn structure, a setup, a twist, topology-
compatibility of every mechanic, no conflicting mechanics co-present, no raw
template holes in the prose, and **determinism** (re-roll equals first roll).
Also prints the distribution: in the first 5,000 numbers there are **~2,900
distinct (topology · mechanic-set · win) skeletons**, and all topologies /
themes / mechanics get exercised. The seed space itself is unbounded.

## How big is the space?

- **8** board topologies × **~20** core engines × legal secondary combinations
  (~12 spice/economy primitives, constraint-filtered) × **7** win conditions ×
  **14** themes × parameter tuning (board size, targets, economy subset).
- Conservatively **10⁴–10⁶ structurally distinct games** before parameter
  tuning; effectively endless once you count the tuned numbers — same posture as
  borges' page numbers.

To grow it: add a mechanic to `MECH` (tagged), a topology to `TOPOLOGIES` (+ an
SVG case in `board.js`), a win to `WINS`, or a skin to `THEMES`. Each addition
multiplies — and the smoke test guards coherence as the grammar grows.

## Deploy

Owned by branch `claude/procedural-board-games-iFAiZ` in `deploy-registry.json`.
Pushes to that branch (or `main`) touching `games/**` fire
`.github/workflows/deploy-games.yml` → `wrangler deploy` of the `games` worker,
which serves `/gen/` as static assets. Nothing about the party platform changes.

## The self-test (Rung 0 + 1) — `js/operational.js` · `js/sim.js` · `test/playtest.mjs`

The grammar guarantees *coherent*; the self-test measures *good*. It cannot
write a bespoke engine for 10⁶ games, so it **projects every game onto a common
abstract economy** (`operational.js`: resources, a parameterised action menu
with costs/yields, an end trigger) and plays that with a generic simulator
(`sim.js`) and pluggable agents (random, greedy). The action costs/yields are
themselves rolled from the seed, so some games come out balanced and some
degenerate — which is the point.

`test/playtest.mjs` scores each game on the measurable aesthetics of a good game
(after Cameron Browne's automated game-design battery):

| Signal | Question | Weight |
|---|---|---|
| **skill** | does a greedy agent beat a random one above chance? | 45 |
| **completion** | does the game reliably end? | 20 |
| **decisiveness** | do skilled games resolve, or stalemate into ties? | 15 |
| **fairness** | is first-player win-rate near its fair share? | 10 |
| **non-dominance** | is there more than one good action? | 10 |

→ a 0..100 quality score + verdict flags. Over 300 seeds it means 55/100 with a
real spread, cleanly separating top games (skill 1.0, decisive, fair) from
degenerate ones (luck-driven, never-ending, one dominant action).

```bash
node games/gen/test/playtest.mjs 300 60            # summary report
node games/gen/test/playtest.mjs --dataset out.json 2000   # emit NN training table
```

> *Limitation:* this is an **economic** projection — it models the resource /
> tempo / scoring spine, not spatial tactics (blocking, adjacency, hidden info).
> Enough to catch the big degeneracies cheaply; spatial-heavy mechanics get
> bespoke semantics in a later rung. Decisiveness/fairness are read conservatively
> (symmetric greedy-vs-greedy ties inflate the draw count); the quality score is
> the headline.

## Roadmap

1. ~~**Bot self-playtest (the real balance filter).**~~ **Done — Rung 0 + 1**
   above. Next within this line:
   - **Rung 1.5 — MCTS agent** for a sharper skill signal than 1-ply greedy.
   - **Rung 2 — the tiny NN critic.** `js/features.js` already emits the static
     66-dim feature vector; `--dataset` already emits `(features → quality)`
     rows. A small `tanh` MLP (the `descent/` net, wider input), trained in
     node/browser with hand-rolled backprop, learns to predict quality *without
     simulating* — so the generator can screen seeds in microseconds and do
     guided search ("a great 3-player area-control game").
   - **Rung 3 — cross-game value/policy net** trained by self-play across the
     catalogue: one net that plays *unseen* generated games.
2. **Play modes** (the showcase becomes a game):
   - *solo vs bots* — the interpreter above, with a UI;
   - *hot-seat* — pass-and-play on one screen;
   - *multiplayer* — feed a generated spec into the existing `RoomCoordinator`
     DO (the party platform's runtime already does rooms + OAuth + broadcast).
3. **Curation / favourites.** Star a number; a public "best of the catalogue"
   shelf. Possibly a like-count via the shared `mino-scores` worker.
4. **Games as ATProto records.** Publish a generated (or hand-tweaked) game to
   your own PDS as `com.minomobi.games.boardgame`; discovery via a feed
   generator — same arc the party platform's README sketches.
5. **Richer boards.** Real generated maps (named sites, region adjacency) rather
   than stylised diagrams, once play needs a true surface.
```
