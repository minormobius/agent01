# Fetlock & Fist — handoff

## What this is

The ask: "a game with controls somewhere between qwop and toribash where ur dropped into an
arena and have to fight a bloodlusted horse to the death with your bare hands." No reference
link, no thread context beyond one riffing reply ("your mind" — read as a joke about the
request's own chaos, not an instruction).

Shipped: a working single-page fight. A real verlet-integrated ragdoll for both fighters
(points + distance-constraint sticks, 8 solver iterations/step, gravity, ground + arena-wall
collision), controlled the way the original QWOP actually works — each key applies torque in
**one fixed direction only**; there is no "swing it back" key, you let go and gravity/momentum
does whatever it does. Six keys: Q/W (thighs), O/P (calves), J/K (jab/cross). Toribash's
contribution is that all of this runs continuously and simultaneously across the whole body
rather than QWOP's two-joint-pair scope or Toribash's turn-based single-joint-per-turn — you
can be swinging a leg and throwing a punch at once, same as a real fight. The horse is the
same physics system driven by an AI: a continuous trot gait (alternating-diagonal tangential
leg forces) toward the player plus a lunge-bite when its head gets close, with no state
machine beyond "always chasing, always biting" — matches "bloodlusted" literally: there is no
calmer state to fall back to.

Hit detection: punch damage scales with the hand's own speed at the moment of contact (not
with holding the key), so a resting touch does nothing — you have to actually land something
moving. The bite is continuous chip damage while the horse's head overlaps the player's head
or chest, which is the thing that actually kills you if you stand still near it.

## Decisions

- **No autobalance**, on purpose, even though it would have made the game much easier to
  survive. One weak stabilizer stick (hip-to-head, horse back-to-head) keeps the torso
  loosely coherent so the figure doesn't instantly puddle, but nothing fights gravity to keep
  either fighter standing. That's the actual QWOP experience — falling over is the game, not
  a bug to patch away — and inventing an autobalance force nobody asked for would have been
  exactly the kind of unannounced simplification this requester's history (see the profile)
  reliably catches and pushes back on.
- **Single-segment horse legs** (hip/shoulder straight to hoof, no knee) rather than a second
  joint per leg. The hard part of this request was getting a legible, controllable ragdoll
  fight working at all in one turn; a four-segment-per-leg horse would have doubled the
  constraint-solving surface for a cosmetic gait improvement. Flagged here rather than
  silently simplified.
- **Punches auto-aim horizontally** at whichever side the horse currently occupies, rather
  than being a free direction the player points. This was the one place I traded "literal
  control" for "finishable in the turn" — a real 2D aim control (drag, or a second axis of
  keys) is the honest version and isn't built. Said explicitly in NOTE.txt too since this is
  exactly the kind of shortcut this requester has called out before when it wasn't flagged.
- **No ATProto/pds.js integration** (no sign-in, no leaderboard). The game is fully playable
  without an account and losing nothing by skipping it felt right for turn one — a survival-
  time leaderboard (`store.postScore`) is a natural follow-up, not a requirement.
- Named it "Fetlock & Fist" rather than putting "QWOP" or "Toribash" in the title — both are
  real, specific games, so the house rule (mine the mechanic, not the name) applies even
  though neither is as famous as Tetris. Both names are used freely in body copy and the
  meta/og description, which is the sanctioned place for that.

## The plan (not built yet, roughly in order)

1. **Knee/elbow bend-direction constraint.** Right now a knee or elbow can hyperextend or
   bend backward under enough load — plain distance constraints don't know which way a joint
   is "supposed" to fold. The fix is an angular constraint (e.g. a third, longer stick from
   hip to foot that only activates past a max/min angle, or an explicit angle clamp applied
   after the distance solve) — this is the real physics work, not polish.
2. **Manual punch aiming** instead of horizontal auto-aim — likely a second control axis
   (up/down lean on the existing jab/cross keys, or drag-to-aim on the touch buttons).
3. **Difficulty/pacing tuning.** HP numbers (human 100, horse 240), bite DPS (14/s) and punch
   damage (4–20 scaled by fist speed) are considered guesses, not measured — I have no way to
   playtest this build. If it reads as too easy or too punishing, that's the first thing to
   retune, and it should be retunable from the constants block at the top of the script
   without touching the physics.
4. **Visual read of hits** — currently a brief camera shake and a position nudge on the hit
   point. A flash, a number popup, or a sound (no CDN audio available, but a synthesized
   WebAudio hit sound is cheap) would make landed hits much more legible.
5. **A second attack from the horse** — right now only the head bites. Rear-leg kicks are
   already physically present (`blHoof`/`brHoof`) and just need a hit-pair entry like the
   punch pairs to become a second threat.

## Gotchas

- **Verlet "torque" here is a tangential-force hack**, not real angular dynamics: `limbPush`
  applies a force perpendicular to the origin→target segment at the far point. It's the
  standard trick simple browser ragdolls use and it's genuinely the right tool for a one-turn
  build, but it means the "reaction" on the origin joint (20% of the force, opposite sign) is
  tuned by feel, not derived — if limbs feel too floaty or too locked, that 0.2 factor in
  `limbPush` is the first knob.
- **Initial pose coordinates are not pre-solved to exact rest lengths** — `makeStick` measures
  the actual starting distance between the two points and uses that as the rest length, so
  there's no snap on load regardless of whether my placed coordinates were geometrically
  exact (they're close but not exact). Any new body point added later should follow the same
  pattern: place it approximately right, let `makeStick` derive the length, don't hand-compute
  distances.
- **The whole physics step is fixed-rate (`STEP = 1/60`) with an accumulator**, decoupled from
  `requestAnimationFrame`'s variable timing, capped at 5 substeps/frame. This matters if the
  arena ever needs to run faster/slower — change `STEP`, not the render loop.
- Untested in an actual browser by me — I have no network or display tools in this sandbox.
  The harness's post-build screenshot pass is the first real look this gets.
