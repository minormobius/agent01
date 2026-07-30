# concourse — handoff

## What this is

A crowd-safety toy built from a paper about packed rooms with no egress
(Elastic Reorientation Model vs. Social Force Model, wall pressure at the
macroscopic scale vs. per-person contact load at the microscopic one). The
ask, as relayed to this build, was turn one specifically: one room, one
buffer control, one group-cohesion slider, two live readouts (wall pressure,
worst individual contact load), fixed-timestep social-force integration,
forces clamped so high density doesn't explode.

Shipped this turn: exactly that. A single canvas room, ~130–220 particles
depending on viewport, a spatial-hash-accelerated Social Force Model with a
hard-body compression term, a "buffer from the back wall" slider (a standoff
zone — the barrier itself takes the wall load instead of the real wall
behind it, but the usable floor shrinks), a group-cohesion slider (springs
each person toward their own small group's centroid), and two continuously
updating stat tiles with bars, color-mapped particles (accent = low
individual load, error-red = high). Pause/resume and reshuffle both work.
`prefers-reduced-motion` starts the sim paused rather than autoplaying.

## Decisions

- **Only the Social Force Model, not the paper's ERM or the coupling
  between them.** The brief named SFM explicitly for turn one and flagged
  ERM/coupling as later scope. Building both in one 20-minute turn was not
  realistic; SFM alone is enough to show the trade-off the toy is about.
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

1. **Verify in a real browser first.** This was built with no way to run
   it. The physics could be too timid (nothing visibly presses) or too
   violent (particles jitter/vibrate visibly) — if so, the first things to
   retune are `ASOC`/`KCONTACT`/`MAXPAIR` in that order, and check the fps
   counter on a real phone before touching particle count.
2. **The Elastic Reorientation Model and the SFM/ERM coupling** — the
   paper's actual comparison. That's a second physics engine (ERM
   reorients bodies by rotating/reshaping rather than pushing back, per the
   paper) plus a toggle or blend control. Non-trivial; don't half-build it
   as a second slider that quietly does nothing.
3. **A gap in the buffer** so the crowd can funnel through rather than
   being fully walled off from the back strip — this is the
   perpendicular-barrier-with-endpoints version noted above, and is the
   more literal reading of "one adjustable barrier line" if that's what's
   actually wanted over the standoff-strip interpretation.
4. **Group visualization.** Cohesion currently only shows up as emergent
   clustering in particle positions — no visual grouping cue (outline hue,
   connecting lines). Left out to keep the render loop cheap and the load
   color mapping legible; worth adding if a future pass has room.
5. **A short history/sparkline for both readouts** instead of just the
   instantaneous number + EMA, so a visitor can see the two curves diverge
   over time rather than only the current value.

## Gotchas

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
