# words — words.mino.mobi

Words with friends, without the ads, the accounts or the nagging. One to four
seats, any of them a bot, on boards that have hazards as well as bonuses.

## Facts

| | |
|---|---|
| Surface | `words` |
| Dir | `words/` |
| Endpoint | `words.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/word-game-surface-ai-x1nuys` |
| Deploy | `.github/workflows/deploy-words.yml` |
| Uses | `atpolls-db` (migrations `0035_words.sql`, `0036_words_push.sql`) |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "words"`.

## What is actually new here

The rules of the word game are the rules everybody knows. The two things worth
reading the code for are the **board** and the **opponent**.

### The board

Beside double/triple letter and word, five squares of our own — described in
full at the top of [`engine/board.js`](engine/board.js), summarised here:

| | | |
|---|---|---|
| `q` | **quad letter** | the letter counts four times |
| `m` | **mire** | a letter placed here scores **zero** (word multipliers still apply) |
| `h` | **half** | the word through it is **halved**, rounded down, *after* every multiplier |
| `x` | **toll** | a flat **8 points off the play** — not the word |
| `#` | **stone** | nothing may ever be placed here; words break on it like the edge |

Four design rules held the whole way, and are worth keeping:

1. **Everything resolves on the turn it is played.** No square waits a turn and
   surprises somebody. That is what keeps the game readable — and it is also
   what keeps the AI honest, because a delayed effect would make the position
   an incomplete description of the game.
2. **Hazards are arithmetic, stones are topology.** The first four all live
   inside `scorePlay`. `STONE` is the only one that changes the *shape* of the
   board, which is why Archipelago plays like a different game rather than the
   same game with different numbers.
3. **The toll taxes the wrong move, not the small player.** Flat, against the
   play, so it wipes out a six-point shuffle and barely dents a sixty-point
   one. A play is never taxed below zero.
4. **The half punishes greed specifically.** It scales with what you were about
   to win, so it costs a bingo far more than it costs a two-letter tuck.

A layout is eight rows of eight characters — the top-left quadrant, mirrored
both ways — and it must be symmetric about its own diagonal or the board is
only two-fold symmetric. `assertLayouts()` enforces that, plus a playable star
and a connectivity check: an early Archipelago draft ringed the start square
with stones and made the first move impossible, which is precisely the class of
mistake a designer cannot see by looking at a quadrant.

### The opponent

`engine/ai.js` is **deterministic — there is no RNG in it at all**. Same
position, same rack, same level, same move, forever. That is load-bearing three
times over: a game replays from `{seed, moves[]}` without storing what the bot
did, a bug reproduces from the position alone, and each difficulty level is a
sentence rather than a dice roll.

The three levels differ in **what they can see**, never in how honestly they
play — a bot that knew the best move and threw it is a bot that feels rigged:

| level | sees | measured vs steady |
|---|---|---|
| **mild** | plays of up to four tiles, points only | **−93 ± 8** a game, wins 6 of 60 |
| **steady** | every play, points + the rack it would keep | — |
| **sharp** | steady, plus real endgame reasoning: once the bag is empty a "good leave" is dead weight you will be charged for, and going out first takes everyone else's tiles | **+0.6 ± 9.3**, level |

Measurements are **mirrored pairs** — every seed played twice with the bots
swapped, so the seat and the deal cancel exactly. Do not measure this any other
way: a game score has a standard deviation around 50 points, so an unmirrored
twenty-game sample routinely shows a forty-point "difference" between a bot and
an identical copy of itself. `analysis.mjs` runs steady-against-steady as a
control for exactly this reason, and that row must print `0.0`.

**Sharp is level with steady, and that is the honest result.** Three attempts to
beat greedy-plus-leave all failed, and they are recorded at the top of
[`engine/ai.js`](engine/ai.js) so nobody repeats them:

- penalising the premium squares a play leaves open — **−16 a game** at the
  weight it was first written with, and nothing at any weight worth having;
- weighing the rack leave harder — nothing;
- one-ply Monte Carlo against opponent racks sampled from the unseen pool
  (seeded from the position, so determinism survived) — **−25** when each
  candidate drew its own samples, **0** once they shared them (common random
  numbers, which is the bit that was actually wrong), **−9** with the budget
  moved from candidates to samples. It cost eighty move generations per turn
  and made a 60-game match take 327 seconds instead of 11.

Greedy-plus-leave is simply a strong baseline. What would actually beat it is a
real multi-ply equity with a serious sample count — a different project, not a
tuning pass.

Move generation is Appel & Jacobson (1988) over a minimal DAWG:
`engine/movegen.js`. It proposes placements only — **scoring is done by
`rules.js`, the same function the server banks the points with**. A generator
that scores its own candidates drifts from the referee, and the drift shows up
as a bot proposing moves the server then rejects.

### The lexicon

ENABLE, public domain, the list Words With Friends uses: 172,823 entries,
168,551 of them playable (2–15 letters, the longest word a board can hold). Built into a minimal acyclic DFA —
121,439 edges, **474 KiB** committed at [`dict/lexicon.dawg`](dict/) — by
`tools/build-dawg.mjs`, which round-trips every word before it writes.

ENABLE is **not** the tournament lists: 96 two-letter words where Collins has
127, so no `ZA` and no `QI`. That is asserted in the selftest rather than left
to be discovered by somebody with a tournament habit.

**The lexicon is committed, not built at deploy.** A deploy that rebuilt it
would put the bot's behaviour at the mercy of whatever the word list looked
like that morning, and every stored game replays its bot moves against the
lexicon of the day it was played. The workflow rebuilds it into a temp file and
`cmp`s — a stale binary fails the deploy instead of silently changing the game.

## How it fits together

```
engine/          the rules. Imported UNCHANGED by both the worker and the browser
  rng · tiles · board · rules · movegen · dawg · game · ai
worker.js        the API; owns hidden information, runs the bots, writes D1
app.js           the client; same engine, for live scoring and offline play
sw.js            precaches the shell + the engine + the lexicon
dict/            enable1.txt (source) and lexicon.dawg (committed artefact)
lib/webpush.js   VAPID + aes128gcm on WebCrypto; no dependency, no Node
tools/           build-dawg.mjs, make-icons.mjs — run by hand, output committed
test/            *.selftest.mjs gate the deploy; *-check.mjs need a browser;
                 serve-local.mjs runs the whole surface with no Cloudflare
```

**Hidden information never leaves the server.** Racks and the bag order live in
the state blob; `redact()` in `engine/game.js` is the only function that
produces a client-safe view, and every response path goes through it. The game
seed is a random token rather than anything derived from the game code —
otherwise a player could compute every tile their opponent will draw.

**A move is a compare-and-set.** One D1 row per game holds the whole state as
JSON with a `version` column, and the UPDATE only lands if the row has not
changed underneath it. What the CLIENT quotes is `ply`, not `version` — see the
testing section for why that distinction was not optional. Two people moving at once is normal
in a four-hander, and the alternative to a compare-and-set is a lost turn.

**No accounts.** A seat is a random token, stored hashed, kept in the player's
`localStorage`. This surface deliberately does *not* use `auth.mino.mobi`: it
would be a real improvement (a name that follows you between devices) but the
auth worker belongs to another branch, and the game does not need it to work.
See "If you pick this up next".

## Turn notifications

Asynchronous games die of being forgotten, so the surface can wake you:

- **the badge** — `navigator.setAppBadge`, a number on the installed icon, no
  sound and no banner. It means *games waiting on you* and nothing else, which
  is why it is set and cleared from three places that all agree: the service
  worker on a push, the page when polling notices your turn, and immediately on
  taking a turn or looking at the game.
- **Web Push** — the only thing that works when the app is CLOSED. Implemented
  here, in [`lib/webpush.js`](lib/webpush.js): VAPID (RFC 8292) is an ES256 JWT
  and the payload is aes128gcm (RFC 8188/8291), both about forty lines of
  WebCrypto. `web-push` is a Node library and a Worker has no Node.

**The keypair is self-provisioned into `words_config`** on first use, because
worker secrets can only be set from the dashboard or CI and neither is
reachable from the sandbox this was written in. The honest trade is in
[`0036_words_push.sql`](../poll/apps/api/migrations/0036_words_push.sql): the
signing key sits in the game database rather than a secret store, and what it
authorises is narrow — sending notifications to endpoints that already
subscribed here. To harden it, set `WORDS_VAPID_PUBLIC`/`WORDS_VAPID_PRIVATE`
as worker secrets; the worker prefers them whenever they exist. **Do it before
anyone subscribes**: a subscription is bound to the key it was made with, so
changing the key silently orphans every existing subscriber.

Permission is asked from a button in the game view and never on load — a site
that opens the prompt on arrival gets denied once and then forever. The row
only appears in games with more than one human, because there is nothing to
wait for otherwise. On iOS both push and the badge need the app added to the
Home Screen first; the copy says so when the API is missing.

A failed push never fails the move that triggered it: everything in
`notifyTurn` is caught, and a 404/410 deletes the subscription everywhere,
because a browser that threw one away has thrown away all of them.

## Tiles

The rack is **a list of tiles, not a list of letters**. Every tile carries an id
that survives a reorder, a refill and a re-render, and `pending` refers to those
ids — with duplicates on a rack ("two Es") an index stops meaning anything the
moment one is dragged past the other.

Dragging is Pointer Events, one path for mouse, finger and pen; HTML5
drag-and-drop does not exist on touch and this is a phone game first. A press
becomes a drag on six pixels of movement OR after 180 ms of stillness, so
tap-and-hold works without moving first, and a plain tap still selects. The
dragged tile is a `.dragtile` copy lifted above the pointer, because a thumb
covers exactly the square you are aiming at.

`.rt` and `.tile.pending` set `touch-action: none` — without it the browser
scrolls the page instead of moving the tile. The play area sets `user-select:
none` and `-webkit-touch-callout: none`, or a drag turns into a text selection
with handles and a copy bubble over the board.

## Testing

```bash
node words/test/engine.selftest.mjs   # ~4s, no deps; a deploy gate
node words/test/worker.selftest.mjs   # the real worker on a real database
node words/test/push.selftest.mjs     # Web Push crypto vs RFC 8291's vectors
node words/test/analysis.mjs          # a measurement report, not pass/fail

node words/test/serve-local.mjs 8788 &   # the whole surface, locally
node words/test/ui-check.mjs http://127.0.0.1:8788    # the client, in a browser
node words/test/multi-check.mjs                      # two players, two browsers
node words/tools/build-dawg.mjs       # rebuild the lexicon (commit the result)
node words/tools/make-icons.mjs       # rebuild the PWA icons (commit the result)
```

The selftest's load-bearing part is **cross-validation**: every move the
generator emits on several real positions is fed back through the referee with
the real lexicon and re-scored, and each of the twelve full bot-versus-bot games
(three layouts × one to four players) is replayed from its seed and move log and
compared to the position it reached. Tile conservation is checked at the end of
each — bag plus racks plus board must still be 100.

`worker.selftest.mjs` runs the **actual worker** against node's built-in SQLite
behind a D1-shaped adapter, with the **real migration file** and the ASSETS
binding served off disk. The sandbox cannot reach Cloudflare, and a worker whose
first execution is somebody's game is a worker nobody has tested; this one found
two bugs that no amount of reading would have:

- `redact()` was shipping the game **seed**, which reconstructs the whole bag —
  every tile every opponent would ever draw;
- the engine state's `version` field (a state-shape number, always 1) was
  spread over the stored row's concurrency version, so every move after the
  first would have been rejected as stale. The game would have been unplayable
  online, and the engine selftest could never have seen it.

**The client had no coverage at all until `ui-check.mjs`, and the first thing
that opened the page in a browser found a bug that made the whole site
unusable**: `.modal` sets `display: grid`, and any `display` rule silently
overrides the `hidden` attribute — so a `position: fixed; inset: 0` overlay
marked hidden was laid out across the page and swallowed every click. Nothing
was clickable, and a screenshot looked perfect, because the thing eating the
clicks was invisible. `[hidden] { display: none !important; }` is therefore a
load-bearing line in `styles.css`; `.pending` had the same latent flaw.

Both server-side bugs are now asserted in both selftests. `preflight` picks up `*.selftest.mjs`
under any directory the branch touched, so a change under `words/` runs them
automatically.

`analysis.mjs` is a **report**, in the spirit of
[`packages/pressure-lab/`](../packages/pressure-lab/): it plays the levels
against each other and measures what the hazards actually do to a game. Read it
after moving any number in `board.js` or `ai.js`. It is not a pass/fail gate and
it does not run in CI.

## Deploying

Pushes to `claude/word-game-surface-ai-x1nuys` that touch this surface's paths
trigger [`.github/workflows/deploy-words.yml`](../.github/workflows/deploy-words.yml).
The sandbox cannot reach Cloudflare — **push to the trigger branch, don't
`wrangler deploy` locally**; that also skips the D1 migration.

Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §4 first. `words.mino.mobi` did not
resolve before this surface existed, so the first deploy creates the worker
*and* attaches the domain (wrangler does this itself — `mino.mobi` is a zone on
this account; same as `neuro`). **Green is not proof: confirm the run's deploy
step logs `words.mino.mobi (custom domain)`.**

Changing anything precached must bump `CACHE` in [`sw.js`](sw.js), or installed
players keep the old engine while the site moves on. That is the one standing
maintenance obligation here.

## If you pick this up next

Deliberately not built, in rough order of value:

- **Sign-in via `auth.mino.mobi`**, so a player is a handle rather than a
  browser. Needs the origin allowlisted in `workers/auth/src/index.ts`, which
  belongs to another branch — coordinate, don't just edit it.
- **Move the VAPID key into worker secrets** before this gets real use — see
  the note above, and do it before subscribers exist rather than after.
- **A digest, not just a per-move nudge.** Four games all pushing separately is
  how a good notification becomes a muted one.
- **A bot that is actually stronger than `steady`.** See the measured dead ends
  above: the answer is a multi-ply equity with a real sample count, not another
  heuristic term. `sharp`'s endgame rule is the only thing that beat nothing.
- **A tournament lexicon as an option**, chosen per game and recorded on the
  game so old games keep replaying against the list they were played with.
- **More layouts.** The format is 64 characters and `assertLayouts()` will tell
  you what is wrong with yours; the cheapest possible contribution.
