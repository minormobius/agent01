# concourse — handoff

## What this is

A crowd-safety toy built from a paper about packed rooms with no egress
(Elastic Reorientation Model vs. Social Force Model, wall pressure at the
macroscopic scale vs. per-person contact load at the microscopic one).

Turn one shipped the SFM alone: one room, a buffer slider, a group-cohesion
slider, two live readouts, fixed-timestep integration with clamps so a
packed room doesn't explode.

Turn two (this one) was asked, in reply to turn one, for the ERM and the
SFM/ERM coupling specifically, plus two clarifying questions: "are they
pinned to a position?" and "what are some expected ranges here?" Both are
answered directly in the page copy now (the new coupling control's help
text and a new paragraph under "Reading it") rather than only here, since
the requester asked them in public and deserves the answer in the same
place. Short version for you: no, nobody is pinned to a position — ERM
here reorients facing and body shape at a person's current spot, not their
location; expected elongation readout is 0% at low density/coupling,
30–50% at full density and full coupling, capped near that by construction
(see GOTCHAS).

Shipped this turn: a third slider, "Elastic coupling" (0–100%, default 0%).
At 0% the sim is byte-for-byte turn one's SFM — verified by construction,
not by eye: the effective-radius function collapses to exactly `R0` when
`elong` is 0, which it is at init and whenever `coupling` is 0. Above 0%,
each body gets a facing angle and an elongation state that relax (spring,
not snap — that's the "elastic" in the name) toward a target computed from
that body's own contact load and net force direction: high load → more
elongated; net force direction → body turns side-on to it. The effective
collision radius becomes elliptical (long axis = current facing), so a
reoriented body needs less room along its short axis and more along its
long one — trading a smaller push in the compression direction for needing
more room across it. Bodies are drawn as ellipses now (circles when
elong=0) so the reorientation is visible, not just implied by the numbers.
A third stat tile, "Body reorientation," shows the crowd-mean elongation as
a percentage.

Also still true from turn one: ~130–220 particles depending on viewport, a
spatial-hash-accelerated Social Force Model with a hard-body compression
term, the buffer standoff strip, group cohesion, color-mapped particles
(accent = low individual load, error-red = high), pause/resume, reshuffle,
`prefers-reduced-motion` starts paused.

## Decisions

- **ERM is an interpretation, not a transcription — I have no access to the
  paper's actual equations.** No network tool this turn, same as last. I
  built what "elastic reorientation" denotes physically (a body that
  reorients and reshapes under compression instead of only pushing back,
  with a spring-like time constant rather than an instant response) and
  said so in the page copy ("not fitted against the paper's own elastic
  constants — read them as 'this much give,' not as a measurement"). If a
  future turn gets the actual paper, treat every constant here
  (`COUPLE_MAX_ELONG`, `LOAD_SCALE`, `TAU_REORIENT`, `TAU_ELONG`) as
  provisional and worth replacing.
- **Reorientation reshapes the collision geometry, not a second force
  field.** I considered building ERM as a genuinely separate force law
  (its own `contactForce`-equivalent) blended with SFM by `coupling`. Went
  with reshaping the existing SFM's effective radius instead: every pair/
  wall interaction still goes through the same `contactForce()`, just with
  an elliptical `rsum` instead of `2*R0`. This is why `coupling=0` reduces
  to turn one's model exactly (rb=ra=R0 when elong=0) rather than
  approximately — there's no second code path to drift out of sync, and it
  was buildable in the time available. The trade: this is ERM-as-anisotropic-
  compliance, not ERM-as-a-distinct-force-model. If the actual paper's ERM
  is a genuinely different force law (not just reshaped SFM), this is the
  wrong shape and needs a real second `contactForce` analogue, not a patch.
- **No position pinning/anchor point.** I considered giving each person a
  rest position they're elastically tethered to (spring pulling back to an
  anchor), which is one reading of "elastic." Didn't build it — the
  request's own phrasing ("are they pinned to a position?") reads more
  like a question than an ask, and per-person position anchors would fight
  the existing SFM's free movement and group cohesion in ways that needed
  more than this turn to detangle safely. Answered directly in the copy:
  no, they are not pinned to a position; what's elastic is orientation and
  shape at wherever they currently are.
- **"Buffer" is a standoff strip along one wall, not a barrier perpendicular
  to a wall.** The brief's own language — "a buffer at the boundary changes
  what the wall takes" — maps more directly onto a strip parallel to a
  wall (barrier absorbs that wall's load entirely, real wall behind it goes
  quiet) than onto a bollard-line splitting the room. It also let the
  buffer reuse the exact same `contactForce()` used for every other wall,
  rather than needing separate segment-nearest-point geometry under time
  pressure. If a future pass wants a barrier that only PARTIALLY blocks a
  wall (a gap crowds funnel through), that's the perpendicular-segment
  version and it needs real point-to-segment distance code, not this.
- **No `kit.js` include.** This page makes no network call and has no
  handle input, copy button, or fetch — nothing in kit.js applies. Only
  `tokens.css` is linked, for the palette and control shapes.
- **No leaderboard / no `pds.js`.** There is no obvious "score" for a
  physics toy about an unsolvable trade-off, and inventing one (e.g.
  "lowest combined pressure+load") would misrepresent the point — the
  whole toy is that no configuration wins. Left out deliberately rather
  than bolted on.
- **Units are unlabelled "model units," not newtons/pascals.** The forces
  are tuned for stability and readability, not fitted to the paper's actual
  constants (no way to verify a fit without running it). Saying "N/m" would
  overclaim precision the toy doesn't have.

## The plan — not built yet, in the order I'd tackle it

1. **Verify in a real browser first, ERM specifically.** SFM alone was
   already unverified last turn; now there's a second untested axis. Turn
   coupling to 100%, push density up (small buffer, high cohesion) and
   watch: ellipses should visibly swing to face the local squeeze and
   thin/thicken, not jitter or spin continuously. If they spin, the
   `atan2(fy,fx)+PI/2` target is probably flipping sign near a force
   near-zero-crossing faster than `TAU_REORIENT` can settle — the fix is
   likely a small deadzone on `fmagSq` before accepting a new target, not a
   smaller `TAU_REORIENT`.
2. **If the actual paper is available, reread this build against it** and
   correct `COUPLE_MAX_ELONG`/`LOAD_SCALE`/`TAU_REORIENT`/`TAU_ELONG` — see
   DECISIONS above on why these are placeholders, not fitted values. Also
   worth checking: whether the paper's ERM is genuinely a separate force
   law rather than reshaped-SFM, which would mean rebuilding this properly
   rather than retuning it.
3. **A gap in the buffer** so the crowd can funnel through rather than
   being fully walled off from the back strip — this is the
   perpendicular-barrier-with-endpoints version noted above, and is the
   more literal reading of "one adjustable barrier line" if that's what's
   actually wanted over the standoff-strip interpretation.
4. **Group visualization.** Cohesion currently only shows up as emergent
   clustering in particle positions — no visual grouping cue (outline hue,
   connecting lines). Left out to keep the render loop cheap and the load
   color mapping legible; worth adding if a future pass has room.
5. **A short history/sparkline for all three readouts** (now including
   reorientation) instead of just the instantaneous number + EMA, so a
   visitor can see the curves diverge over time rather than only the
   current value.

## Gotchas

- **`bodyRadiusAt(idx, angle)` takes an axis, not a direction** — it uses
  `cos^2`, which has period π, deliberately: a body's cross-section along
  its facing has no front/back, so the angle *to* a neighbor and the angle
  *from* it should (and do) give the same effective radius. If you extend
  this function, do not swap in `cos()` alone or you'll get a body that's
  wide facing a push from one side and narrow from the opposite side of
  the same axis, which is physically backwards.
- **The `coupling=0` exact-equivalence to turn one is load-bearing for the
  DECISIONS claim above** — it works because `ra`/`rb` are recomputed from
  `elong[i]` at the top of every `step()` call, not cached from init. If a
  future change makes `elong` update lazily or skips the top-of-step
  recompute, `coupling=0` will stop being provably identical to turn one's
  model, which is the whole reason it was safe to ship this mid-toy.
- **Reorientation reads `fx[i]`/`fy[i]` from the pairwise+wall loops only**,
  before cohesion is added — intentional (see DECISIONS), but if you
  reorder the step() body, keep the reorientation block between the wall
  loop and the cohesion block, not after it.
- The stability guard is load-bearing, not decoration: `MAXPAIR` (clamp per
  pairwise/wall force), `MAXTOTAL` (clamp per-particle summed force before
  dividing by mass), `VMAX` (velocity clamp), and a hard position clamp
  after integration, in that order. Removing any one of the first three
  without also loosening the others is likely to reintroduce the explosion
  the brief specifically warned about — this is a **packed room** with
  overlapping start positions by design, so a naive `A*exp(...)` term alone
  will produce huge forces on the very first frame.
- The grid used for neighbor lookup is rebuilt once per animation frame,
  not once per substep, as a perf tradeoff. It's an approximation across
  the 3 substeps within a frame — fine at this timestep, but don't assume
  it's exact if debugging a specific pair interaction.
- `bufferY` changing while the sim runs can leave particles below the new
  buffer line for one frame; the position clamp after integration handles
  it (particles get shoved up), so no explicit "eject anyone in the newly
  forbidden strip" code was needed — don't add it, the clamp already
  covers it.
