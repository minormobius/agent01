# hyperball — hyperball.mino.mobi

**HYPERBALL**: bike-ball in four dimensions. You ride a 4D bicycle round the inside of a small hollow 3-sphere, jump
and boost, and knock a ball into the spherinder goal at the far pole. Vaporwave arena. The default match is **2v2**: you (pink) and a
bot on cyan against two orange bots, three minutes. Solo practice, 1v1 and 3v3 in the menu; bots easy, normal, hard.
**Rooms with friends** by link (`hyperball.mino.mobi/#room=CODE`): humans take seats, bots fill the rest.

## Facts

| | |
|---|---|
| Surface | `hyperball` |
| Dir | `hyperball/` |
| Endpoint | `hyperball.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/epic-mayer-y28tpl` |
| Deploy | `.github/workflows/deploy-hyperball.yml` |
| Uses | auth.mino.mobi |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "hyperball"`.

## How it works

A static site and a worker (`worker.js`: avatars, an xrpc gateway, rooms), and one Durable Object class (`HyperballRoom`, `room.js`), no build (worker `hyperball`, plain route `hyperball.mino.mobi/*`).

- `js/habitat.js` is a **byte-identical copy** of `ana/habitat/js/habitat.js` (the Hopf habitat's maths: J, exact
  flights, walking by parallel transport, `orthonormalTo`, the map `mapOf`). Edit ana's, then copy it over; the
  selftest fails on drift.
- `js/arena.js` (no DOM) is the game's physics. `ARENA`: R 40 m, 0.6 g, the ball (r 1.6, e 0.62), the bike, the goals
  (spherinders r 7, h 5 at `OWN` and `ENEMY`, opposite poles; kickoff on the equator, `SPOT`).
  - `gravity`: **arcade** (the default, g outward everywhere) or **spin** (ω²x − 2ωJv: Coriolis). Only airborne things
    feel the spin; the bike on the ground drives along the floor.
  - `stepBall` (gravity, drag, bounce with restitution, rolling friction), `stepBike` (throttle, brake, boost; steering
    turns the heading toward the stick's direction across it, [right, ana], at most the lean limit allows, v·ω = g
    tan φ; jump; in the air, gravity and boost, with jump held boost tilts 45° up; landing), `collide` (push and hit).
  - `inGoal`: within r of the pole along the floor and under h.
  - **Aiming**: `lockSlice` (ball lock: turns the across-space about the heading so the ball lies in span{F, up, Rt},
    so the chase camera, whose slice is that, always sees it; exact, the selftest holds the offset to 1e-9). Two rules
    keep it from wrenching the view, both learned the hard way: it turns to the NEARER of ±Rt (the slice holds the
    ball on your left too; turning Rt toward a ball on the left spun the across-plane 180°, a mirror-flip, every time
    you passed the ball), and the game runs it LAZY (`tol` 0.4 m: no turn while the ball is that close to the slice)
    at 1.5 rad/s. The old lock whipped the frame at its full rate on 560 of 960 steps of a drive past the ball; this
    one never does, and the ball stays in the slice (worst 0.93 m off, radius 1.6). `intercept` (a
    copy of the ball run forward to the first moment you could be under it), `approach` (a point behind the ball on
    the line to their goal), `steerToward`.
  - **The camera**, `chaseCamera` (here, not in main.js, so the selftest can drive it): behind the bike on the line
    from the ball, its direction turned as an angle in the (F, Rt) plane (never a vector average through zero); the
    look aims at the ball but stays within 0.5 rad of the bike (always in frame) and under 0.62 of straight up, and
    turns at most 1.6 rad/s; its right is up × look in the slice's (F, Rt, up) coordinates, so it can't degenerate
    when looking along Rt or at the sky (Gram–Schmidt of [look, up, Rt, N] did, and flipped). Tested: driving at the
    ball and past it, the frame never turns faster than 110°/s and the bike is never more than ~30° off centre.
  - `kickoff(A, rnd)`: with `rnd`, solo kickoffs come from a random side (0.5–2.4 rad off the line to their goal,
    any direction across it) with the ball already rolling; without, the fixed case for the tests.
  - **Teams and bots**: `TEAMS` (cyan defends OWN and attacks ENEMY; orange the reverse), `teamKickoff` (orange's
    bikes are cyan's reflected through x₁ → −x₁, which swaps the goals and fixes the spot: a fair kickoff), `bump`
    (bikes push apart). `roles`: per team, whoever would reach the ball first attacks, the rest defend. `botInput`:
    - attack: aim at a random spot across their goal's mouth (two mirrored bots otherwise deadlock); shoot (go for the
      ball) only when lined up to within about the goal's radius over its distance, since on a 3D floor a shot must
      be right in two directions at once; otherwise come round behind it (7 m back on the shot line), swinging wide
      if the ball is in the way. A rival on the far side of the ball (a 50/50): swing out sideways in a random
      direction across the line between you, ana and kata included. Reaching its spot, a bot COMMITS: 1.3 s charging
      the ball, steering for the goal in the last 5 m. Without the commit two bots circled a stopped ball forever.
    - defend: between the ball and its own goal, up to 16 m out, facing the ball; clear it if it comes within 10 m
      while goal-side of it.
    - all: brake for the turn (the circle reaching the target from the heading needs radius dist/2 sin θ, and the lean
      limit rides v²/(g tan φ)); boost when far and facing it; jump at a high ball close by. `SKILL` sets rethink
      time, throttle, boost, jumps and aim wobble.
    `stepMatch` steps everyone, the ball, the touches and bumps, and reports a goal; `newMatch` sets one up.
  - What made bots score at all (each found by simulating whole matches): the ball rolled to a stop ~50 m from a
    hit (rolling friction 0.55/s, now 0.16); ground hits pointed up along the body-to-ball line and lobbed the ball
    across the arena's sky (now flattened, `lift` 0.35, and capped at 30 m/s for squeezes); and **hits go mostly
    where the bike points** (`aim` 0.6 of the heading, 0.4 of the contact line), which is what makes aiming possible
    in 4D for bots and you alike. Goals are r 10, h 6. In 5 simulated minutes of 2v2 bots: 2–6 goals, both sides.
- `js/main.js`: a fragment shader ray-traces the slice: the floor from inside (a neon grid of the planes x_k = 5n m,
  the halfway sphere, goal circles, shadows), the striped sun at the centre, the ball, up to six bikes (two wheel balls, a
  capsule body, a flame when boosting; you pink, cyan and orange by team), the goals (translucent cone wall at the goal's radius, roof at its height), the
  path ribbon (an arc to the intercept, chevrons, kerbs teal ana / pink kata of your slice) and the gold shot line. A
  2D overlay: the ball's marker (ana/kata offset when lock is off; an edge arrow when off screen), the goal arrow
  (`goalArrow`: from the ball along the floor toward their goal, labelled with the distance to its mouth; dashed and
  marked ana/kata when the shot direction runs mostly out of your slice), MATE/OPP tags
  over the other bikes (▲ ▼ off your slice), goal markers, a minimap (with every bike) (the arena as a ball on your axes), score, clock, boost. Physics at a fixed 120 Hz, the loop stopping the
  moment a step ends play (it once counted one goal seven times, the ball still in the net); ball cam looks at the
  ball. The floor's grid lines fade out where they're too fine to draw (blurred, they washed the floor pink). Touch: a stick (lean right/left, ana/kata) and BOOST, JUMP, BRAKE, GO;
  the throttle is always on by default on touch screens, and the controls hide off the game (`body[data-state]`).
- **Sign-in and faces** (step 1 of multiplayer): `worker.js` serves the site (ASSETS) plus `/avatar/<did>` (getProfile
  on the public AppView, the thumbnail re-served from this origin, cached a day; cdn.bsky.app sends no CORS header,
  so WebGL can't texture it from there) and `/xrpc/app.bsky.actor.{searchActorsTypeahead,getProfile}` (the sign-in
  field's typeahead). `js/auth.js` and `js/typeahead.js` are byte copies of `packages/oauth-client/` (registered in
  `scripts/sync-dataviz.mjs`; preflight checks them): sign-in goes through auth.mino.mobi, which allows every
  `*.mino.mobi` origin, with scope `atproto` only (identity: nothing is written). Each bike has a helmet sphere
  textured from a 6-slot face atlas (a 2D canvas → `faces`), billboarded to the camera and ringed in its team
  colour: your avatar, or a drawn face (a letter on a vaporwave disc) for bots and signed-out you. Bots have names.
  On a phone on its side the suggestions opened below the screen's bottom edge: focusing the field scrolls it to the
  top of the title screen at once (a smooth scroll was cancelled by typing), and again as you type if needed.
  Tested: `test/worker.selftest.mjs` (the routes, network stubbed); locally the real worker serves a real avatar.
  The first deploy with the worker (run 5, 2026-11-13) uploaded the assets and then got Cloudflare API error 10013
  ("an unknown error") on the script version: a server-side failure, not the config. The site kept its previous
  version. The integration can't re-run workflows (403), so a fresh push to hyperball/** is the retry.
- **Rooms** (multiplayer, step 2). `POST /api/rooms` gives a code (4 of A–Z 2–9, no I O 0 1); the page puts it in the
  hash (`#room=CODE`) and opens `wss://…/api/rooms/CODE/ws`, which `worker.js` hands to the Durable Object named by the
  code (`idFromName`). Pieces:
  - `js/room-core.js` (no DOM, no Workers APIs: node tests it) is the whole room: seats (cyan's slots then orange's,
    which is `newMatch`'s bike order, so seat i is bike i), the host (first in; passes on if they leave), the lobby
    (the host picks 1v1–3v3, bots' skill, gravity; anyone picks a team), then the match: `arena.js` `stepMatch` at 120 Hz
    with humans' inputs where people sit and bots elsewhere, a 3 s kickoff count, goals (2.6 s pause), full time at 3
    minutes, back to the lobby. Snapshots at 20 Hz: the ball, every bike's state rounded to mm, score, clock, phase, and
    per human seat the **ack** (the last input the room used). Leaving mid-match gives the seat back to a bot.
  - `room.js` (`HyperballRoom`) only carries sockets: `server.accept()` (not the hibernation API: the room ticks on a
    60 Hz interval while anyone is connected, and forgets everything when the last one leaves). The first message must
    be `{t:'hi', token, team}`: the token (AuthClient's bearer) is checked with `GET auth.mino.mobi/api/me`; none or
    bad is a guest. It's in the message, not the URL, to stay out of logs. 12 sockets a room at most; the 7th person
    on in 3v3 watches.
  - **Inputs are per step and queued.** The client steps its own bike at 120 Hz and sends each step's input
    (`packInput`: `[seq, throttle, steer as a world 4D vector, flags]`), a frame's worth per message. The room consumes
    one per step and acks its seq; a dry queue repeats the last input (minus jumps) and lets go after 0.25 s (a hidden
    tab); more than 10 waiting are trimmed (the client reconciles). Inputs during the kickoff count are dropped.
    **Steering crosses the wire as a world vector** (`s0·Rt + s1·N`), unpacked against the room's bike (`steerIn`):
    the client's ball lock turns its across-frame, and the room's copy needn't know. Tested: same 4D direction on a frame
    turned 90°.
  - `js/net.js` (the client's half): `Net` (socket, snapshot buffer, pending inputs, RTT by ping), `reconcile` (your
    bike = the room's record, your slice's turn kept, inputs after the ack replayed; tested in node: lands within 5 cm
    of the prediction), `lerpBike`/`around` (others drawn 100 ms behind, between the snapshots around then),
    `ballAhead` (the ball run on from the latest snapshot to now + RTT/2). Corrections glide out (an offset decaying at
    12/s; over 4 m it jumps).
  - `main.js` online: `onlineFrame` replaces the offline step loop (`controls()` is shared: input, aids, twist). The
    aids are team-relative (`myTeam`, `theirGoal`, `ourGoal`): online you may be orange. Other players' helmets carry
    their avatars (`faceOf(did)`). The lobby screen (`#lobby`) shows seats with avatars, the link, host controls; the
    in-game menu gets LEAVE THE ROOM and doesn't pause. `window.hyperball.ON` is the online state, for tests.
  - Checked locally with `wrangler dev` (the real DO) and two Playwright browsers: lobby, team switch, host start, each
    sees the other ride, reconcile error ~8 cm, a leaver's seat becomes a bot, offline play still works after leaving.
    Not checkable locally: sign-in (auth.mino.mobi refuses localhost's origin), so the avatar-on-others path was
    verified only with guests until the live run.
- The floor grid: planes x_k = 2.5 + 5n m, each family fading where its lines get too fine AND where your slice runs
  nearly inside its planes (then the "line" is the whole floor: a symmetric kickoff stands at x₂ = x₄ = 0, and the
  floor glowed orange at every 2v2 kickoff).
- **Settings** (the menu): reachable from the title screen (SETTINGS) and in play (☰, P, Esc); everything applies at
  once except the match size, which starts a new match on the way back to the game (the menu says so). All saved in
  localStorage (`hyperball.settings`, try/catch: private windows fall back to defaults). A toast confirms. Once,
  settings didn't stick: the title overlay hid ☰, a new match size waited for the next goal, and nothing persisted.
- `window.hyperball.S` is the game's state, for checking it from outside (the menu test drives it: Playwright, tap
  each setting, close, read S, reload, read S).

## Checks

```bash
node hyperball/test/worker.selftest.mjs      # the worker's routes (avatar proxy, xrpc gateway, rooms, assets) and the Durable Object with fake sockets
node hyperball/test/room.selftest.mjs        # the room: seats, host, teams, config, start, kickoff count, inputs queued and acked, reconcile, goals, full time, leaving
node hyperball/test/hyperball.selftest.mjs   # ~1 s: the copy, gravity, flights vs ana's, bounces, driving, jumps, hits, goals, ball lock (no flips), the camera (no jumps, bike in view), aiming, kickoffs, teams, a lone bot scoring, a 10-minute 2v2 of bots
```

## Next

Quick match (a matchmaker), match records on your PDS (`com.minomobi.hyperball.match`, needs write scope), boost pads, the ball's spin, passing between teammates, a real 4D bicycle under you (kata's).
