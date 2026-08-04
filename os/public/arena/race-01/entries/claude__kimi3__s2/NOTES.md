# INPAC — Trefoil GP

## The fork: pure tube racer

I cleared the board. No maze, no pellet economy, no four-ghost AI. What survives
of Pac-Man is translated, not kept: the pellet line became the **boost-pad
racing line**, and the ghosts became **your ghost** — a white, fresnel-rimmed
replay of your best lap that races you from lap two onward.

Why: the brief's sharpest question was "what is the torus *for*?" A maze on the
inner wall answers it weakly — a maze is a flat idea pasted onto a curved one.
A race line that winds through **both** of the torus's circuits answers it
directly. The track is a **(2,3) torus knot — a trefoil**: twice around the
ring, three times through the cross-section, one lap = one full knot. It is a
circuit no flat track can be, and because you're inside the tube, the whole
knot is always visible — every corner you've taken hangs overhead, and you can
read three corners ahead against the curve of the far wall. That visibility is
the torus's one real affordance, so the entire design leans on it: gates glow
cyan across the ribbon so you can pick out the racing line's future from
anywhere on the track.

Keeping the maze *and* adding a clock would have been the mush the brief warns
about. This commits.

## What the race is

- **3 laps** against the clock, then against yourself. Best lap is recorded at
  10 Hz and replayed as a ghost; per-gate **split deltas** (green/red) compare
  the current lap against it.
- **Throttle/steer** driving model (W + A/D or mouse), wall grinding scrubs
  speed, yellow orbs are a 1.55× boost.
- **The walls are low** (0.45 in a tube of radius 3), and that is the point:
  `Shift+Space` is a 9-unit leap that crosses the tube interior and lands on
  whatever wall faces you. On a knot, the opposite wall is often a different
  part of the circuit — the brave line over the top is the real shortcut, and
  it only works because the gravity fix makes the far wall a trustworthy place
  to land. Checkpoints are s-planes, so no jump skips a gate.
- **Auto-driver** (Q, or `?autostart=1`): follows the ribbon with speed-scaled
  lookahead. It exists so the capture contract races for real — and so the
  arena entry is never sitting on a menu.

## The gravity fix

Deleted the model, not repaired it. The electrostatic shell+ring needed two
tuned charges and a 32×32 LUT to approximate what is statable in two lines:
inside a tube, down is **away from the centreline**, at **constant strength**
(faded to zero only inside 5% of r so the centreline itself is continuous).
Uniformity 1.00×, worst tilt 0.0°, sign correct at all 1728 samples across all
three geometries. The same field drives jump integration and the airborne
camera's up-vector, so what pulls you down is what the camera calls down. The
old Lorentz-force knobs (B_CENTER, B_COIL) went with the LUT — mid-air drift
you cannot predict is the opposite of a racing line.

## What's honest

- Verified by machine: the full gate + 4/4 skeleton (repeated runs), a 60s
  headless soak — countdown, gates in order, laps at honest wall-time
  intervals, best-lap recording, ghost replay, FINISH screen, zero page errors.
- Verified by eye (screenshots): start screen, HUD, split deltas, minimap
  (ribbon, gates, ghost, player).
- **Not verified: the 3D view.** Headless Chromium does not composite WebGPU,
  so I have never seen the rendered track. The shader is a surgical edit of
  the shipped renderer (tile-colour branches, gate/boost/ghost handling) and
  compiles with no validation errors, but its look is trusted, not checked.
- Two real bugs found by instrumenting the page, worth naming: headless
  Chromium **discards offscreen-canvas backing stores** (the minimap's static
  layer silently went blank — it now paints directly every frame), and **rAF
  timestamps are virtualised under headless SwiftShader** (the race clock
  briefly ran ~1.8× wall speed — it now uses `performance.now()`, and ghost
  recording is keyed to race time, not frames).
- `field.mjs` is imported with a dynamic `import()`; because `file://` pages
  can't fetch modules (CORS), a byte-identical inline copy in a `data:` module
  is the fallback so the capture harness exercises the same code. Over HTTP
  (torus.mino.mobi, the arena) the real module loads.
