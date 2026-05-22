# games.mino.mobi

A party-game platform on top of Bluesky OAuth and a single Cloudflare Durable
Object. Post a join link in a Bluesky thread; people sign in with their
Bluesky handle and play from their phone. The TV view is the shared screen.

This directory **is** the platform. Anyone can drop a markdown file into
`games/games/` and have a playable game.

## What's in here

```
games/
  worker.js                       worker entrypoint (routing + asset fallback)
  room.js                         RoomCoordinator Durable Object (one per code)
  wrangler.jsonc                  worker config + DO binding
  index.html                      lobby (pick a game, create a room, or join one)
  play.html                       room page (TV view + phone controller)
  lib/                            vendored: auth.js copied at deploy time
  engine/
    parse-md.js                   tiny markdown parser (frontmatter + sections)
    runtime.js                    template registry
    templates/
      prompt-submit-vote.js       the Quiplash shape (only template, for now)
  games/
    index.json                    catalog of available games
    hot-takes.md                  first real game
```

## Architecture in one paragraph

A worker serves the lobby + the room page. When a user creates a room, the
worker generates a 4-char code, compiles the game's `.md` via a template,
and ships the compiled spec into a Durable Object keyed by the code. Phone
players OAuth through `auth.mino.mobi` (identity-only scope, no posting
permission requested), connect via websocket with a bearer token in the
query string, and the DO validates the token. The TV connects without auth
in read-only mode. All state changes flow through the DO; broadcasts go to
every connected socket.

## The game-author contract

A game is a markdown file with **frontmatter + sections**. Pick a template
in the frontmatter; the template defines what sections it consumes.

Example (`games/games/hot-takes.md`):

```markdown
---
name: Hot Takes
template: prompt-submit-vote
players: 3-8
rounds: 3
---

## prompts
- Worst thing to find in a hotel minibar
- A reasonable use for a flamethrower

## copy
- prompt.tv: Type your hottest take
- vote.tv: Pick the spiciest

## scoring
- vote: 100
- bonus: 250
```

Then add it to `games/games/index.json` so the lobby lists it.

That's the whole authoring surface for the 80% case. No JS, no build, no
deploy other than `git push`.

## The template ABI (for the 20% case)

Templates live in `engine/templates/`. A template is a JS module exporting
a single object:

```js
export const template = {
  id: 'prompt-submit-vote',

  // Compile-time: turn a .md file into an immutable game spec.
  // Called once when a room is created.
  compile(mdText) { return { template, meta, prompts, copy, scoring, rounds, ... } },

  // Runtime: server-side hooks called by RoomCoordinator.
  // ctx: { game, players, state, phaseState }
  // ctx also has: transition(phase) — to advance the phase machine.

  enterPhase(phase, ctx) { /* set ctx.phaseState for the new phase */ },

  onMessage(phase, msg, player, ctx) { /* handle a phone message */ },

  publicState(phase, ctx) { /* what the TV (and everyone) sees */ },
  playerState(phase, player, ctx) { /* what one specific phone sees */ },

  nextPhase(currentPhase, ctx) { /* called when host taps "Next" */ },
};
```

Templates own:
- Phase ordering (`lobby → prompt → vote → reveal → final`, or whatever)
- What state lives in `phaseState` vs `runState`
- What players see (server filters per-role and per-player)
- How scoring works

Templates do **not** own:
- WebSocket lifecycle
- Auth / identity (the DO injects `player = { did, handle }`)
- Persistence (the DO calls `persist()` after every change)
- Broadcast fanout (the DO calls `broadcastState()` after each transition
  and after each message)

A template + the corresponding browser-side renderer (in `play.html`'s
`TEMPLATES_TV` / `TEMPLATES_PHONE` maps) is what's needed to add a new
game shape. We'll factor browser renderers into their own modules once
we have more than one.

## Built-in templates

| Template | Shape | Phases | Status |
|---|---|---|---|
| `prompt-submit-vote` | Each player gets a prompt → submit answer → vote on others' → score | lobby, prompt, vote, reveal, final | live |
| `trivia` | Shared question → everyone answers → reveal correct | — | planned |
| `drawing` | Prompt → draw on phone → vote on drawings | — | planned |
| `bidding` | Auction-style; players spend a budget to win rounds | — | planned |
| `werewolf` | Hidden roles, night/day phases, voting | — | planned |
| `prompt-chain` | Telephone — each player extends/transforms the prior contribution | — | planned |

## Identity, rooms, whitelists

- **Identity**: Bluesky OAuth via `auth.mino.mobi`. Scope requested is
  `atproto` (identity only — the game has no permission to post on the
  player's behalf, look at their feed, or read their DMs).
- **Host**: first phone player to join a room becomes the host. They get
  a host-controls panel on their phone (start, next phase, reset).
- **Whitelist** (in DO storage, host-controlled):
  - `open` (default): anyone with a Bluesky handle can join
  - `list`: only the listed DIDs/handles + the host
  - planned: `followers` (host's followers), `mutuals`
- **TV**: no auth. The TV view is read-only; it never sends commands.

## Persistence

Per-room state lives in the DO's SQLite storage (config'd via the
`new_sqlite_classes` migration in `wrangler.jsonc`). Nothing leaks into D1
yet — rooms are ephemeral. A future "games as ATProto records" milestone
will let authors publish games to their own PDS so discovery becomes a
feed generator over `com.minomobi.games.game` records.

## Roadmap (in priority order)

1. **Timers per phase**. Currently we advance only when everyone submits
   or the host taps "next." Add an optional `timer:` per phase in
   templates.
2. **More templates**. `trivia` and `drawing` are the next two; `drawing`
   needs blob upload, which is what tests the auth scope ceiling.
3. **Hot-reload games**. Right now adding a new `.md` requires a redeploy.
   Move the catalog to D1 and let authors POST a game spec.
4. **Games as ATProto records**. Author owns their game on their PDS;
   discovery is a feed generator; remixing is `getRecord → edit → createRecord`.
5. **Browser-side renderer split**. Pull `TEMPLATES_TV`/`TEMPLATES_PHONE`
   out of `play.html` into per-template modules.
6. **TV-less mode**. One phone gets the "big screen" view; no shared
   display required. (Important for accessibility — most groups don't
   have a TV handy.)
7. **Whitelist UX**: per-DID accept/reject queue, "auto-allow my mutuals"
   toggle.

## Deploy

`.github/workflows/deploy-games.yml`. Triggers on push to `main` or
`claude/oauth-partykit-games-*` that touches `games/**` or
`packages/oauth-client/**`. The workflow:

1. Copies `packages/oauth-client/auth.js` into `games/lib/auth.js`
   (vendoring; the play page imports it relatively).
2. `wrangler deploy`.
3. Smokes the `/api/health` endpoint and confirms `/lib/auth.js` is
   reachable from the edge.

No D1 migrations yet. No secrets needed — the DO talks to
`auth.mino.mobi` over the public internet to validate session tokens.

## Local dev

Without a `wrangler dev` setup (the sandbox can't authenticate to
Cloudflare), the dev loop is: edit, push to the
`claude/oauth-partykit-games-*` branch, watch the Action, hit
`games.mino.mobi`. If you do have Cloudflare creds locally:

```bash
cd games
cp ../packages/oauth-client/auth.js lib/auth.js
npx wrangler dev
```
