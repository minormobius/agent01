# deal — card games no one wrote, opponents included

Live: **fable.mino.mobi/deal** · certified by tribunal · the bot that certified it is your opponent.

The eighth wing of [fable](https://mino.mobi/), and a new **oracle family**:
adversarial games with **hidden information**. BFS has no purchase here — there
is no "the answer" when someone plays back at you — so certification changes
shape: a **tribunal of simulated opponents** plays each candidate game hundreds
of times (seeded, reproducible) and it ships only if three gates pass with
measured evidence:

- **Terminates** — every probe game ends within the move cap.
- **Rewards skill** — a heuristic bot beats a random bot by a real margin:
  quantified proof the game's decisions *matter*. This gate has teeth — roughly
  two-thirds of raw genomes die here (decision-free games are the common
  failure mode of generated card games).
- **Plays fair** — bot-vs-bot shows no crushing first-seat edge, tolerable draws.

Interest is graded from the same evidence: skill depth, **tension** (lead
changes per game), **agency** (real choices per turn), pace, balance.

## The genome

Two structural families × a sampled deck (3–4 suits × 6–9 ranks):

- **trick-taking** — follow-suit or free, optional trump suit; scored by most
  tricks, captured points, or hearts-style point *avoidance*.
- **shedding** — match by suit/rank, suit-only, or rank-climbing; optional wild
  rank and skip rank; draw-when-stuck; stock recycling with a two-dry-stocks
  terminator.

Hearts-like, Crazy-Eights-like, and games with no family name fall out of the
same sampler. `describe()` generates the rulebook from the genome.

## The engine is a pure reducer — multiplayer by construction

```
init(genome, seed) → state
legalMoves(genome, state) → moves
apply(genome, state, move) → state'
```

No mutation, no hidden randomness (the only shuffle is seeded in `init`). A bot
and a remote human are **interchangeable move sources**, which is exactly the
contract the existing multiplayer stack speaks:

- `games/worker.js` + **RoomCoordinator DO** (games.mino.mobi) — OAuth rooms,
  phone-as-controller. A `deal` room = the reducer in the DO, two clients
  sending moves, the DO enforcing `legalMoves` and dealing per-seat views
  (each player sees only their own hand — the DO holds the full state).
- **hoop / ar / mmo** transports are alternative fronts for the same shape.

The migration is deliberately mechanical: serialize `{genome, seed, moves[]}`
— the full game is just its move log, replayable by any client. The bot is the
first opponent, not the last.

## The opponents (`policies.js`)

- `randomPolicy` — the tribunal's baseline.
- `greedyPolicy` — objective-aware, search-free: wins tricks cheaply, ducks
  poison in avoidance games, sheds inflexible cards, holds wilds, chains skips
  when ahead. Strong enough that the skill gate means something; weak enough
  to beat. This is also the opponent you play.

## Files

| File | Role |
|---|---|
| `js/genome.js` | The card-game grammar sampler + self-writing rulebook. |
| `js/engine.js` | The pure reducer (init / legalMoves / apply / scoreline). |
| `js/policies.js` | The simulated opponents (random + objective-aware greedy). |
| `js/tribunal.js` | The oracle: seeded playouts → gates (terminates/skillful/fair) + interest. |
| `js/atlas.js` | Seed → certified game; rank; hunt. |
| `js/app.js` / `index.html` | The felt table, tribunal certificate panel, bot-vs-bot exhibition. |
| `test/engine.test.mjs` | Reducer closure, skill-gate teeth, termination, determinism, rulebooks. |

## Run the tests

```bash
node fable/deal/test/engine.test.mjs
```

Deploys with `fable/**` via `.github/workflows/deploy-fable.yml`.
