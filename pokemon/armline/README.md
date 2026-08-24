# armline — six axes, four keys

Live at [`poke.mino.mobi/armline/`](https://poke.mino.mobi/armline/). An
industrial arm on a moving line: blue spheres are product, red triangles are
rejects, and you are the program that pulls them.

Rendered in 3D with [three.js](https://threejs.org) r169 (MIT), vendored at
`../vendor/three.module.min.js`. No build step, no CDN, nothing fetched at
runtime.

## Files

- `arm.js` — the AR4 MK3 kinematic chain. Pure maths, no three.js, no game.
- `game.js` — poses, the line, the gripper, the tote, the ledger. No rendering.
- `scene.js` — all rendering. No simulation.
- `index.html` — shell, input, main loop, long-form notes.
- `armline.selftest.mjs` — `node pokemon/armline/armline.selftest.mjs`.

## The arm is a real arm

**Annin Robotics AR4 MK3** — open-source hardware, with CAD, firmware and robot
description all published. The kinematics are transcribed from its MIT-licensed
ROS 2 description package, <https://github.com/ycheng517/ar4_ros_driver>:

| from | what |
|---|---|
| `annin_ar4_description/urdf/ar_macro.xacro` | joint origins and axes |
| `annin_ar4_description/config/mk3.yaml` | travel limits, `l6_length` |
| `annin_ar4_description/urdf/ar_gripper_macro.xacro` | the two-jaw gripper |

| joint | travel | offset from the previous joint |
|---|---|---|
| 1 | ±170° | at the base, about the column |
| 2 | −42…+90° | 64 mm out, 170 mm up — the shoulder |
| 3 | −89…+52° | 305 mm — the upper arm |
| 4 | ±180° | coincident with 3 — forearm roll |
| 5 | ±105° | 223 mm — the forearm |
| 6 | ±180° | 41 mm — the wrist |

All six are limited to **1.0472 rad/s** (60 °/s), exactly as the URDF has it.
The gripper is a parallel two-jaw, 14 mm of travel per jaw.

A URDF joint is two things in sequence — a fixed `<origin xyz rpy>` placing the
joint frame in its parent, then a rotation of *q* about `<axis>`. `arm.js` does
exactly that, in that order, so this is the chain in the file rather than a DH
approximation of it.

**What is not transcribed: the shells.** The AR4's real STL meshes are megabytes
and this surface ships as static assets with no build step, so `scene.js` draws
each link as a machined housing spanning the true joint origins. The drawing
*reads* the kinematics rather than repeating them — change the transcription and
the arm on screen changes shape.

## Three poses and a grip

Six joints, four keys, so driving joints directly is off the table. But that is
not how anyone operates an industrial arm anyway: you teach it poses and play
them back. A teach pendant records a handful of joint configurations and the
program walks between them. **You are the program.**

| key | pose |
|---|---|
| `Q` | tote — over the collection bin, clear of everything |
| `W` | approach — poised above the line, tool pointing down |
| `O` | pick — the same point, down at belt height |
| `P` | grip — close the jaws and keep them closed |

Hold a key and the arm servos toward that pose at 60 °/s. Let go and it stops
where it is. Press another and it re-aims from wherever it got to, so a
half-finished move blends into the next — which is where the QWOP comes from.

The three poses were **solved on the real chain**, not hand-set: each is the
joint vector putting the tool centre point at the named place with the gripper
pointing straight down, found by search inside the AR4's real joint limits, and
stored as joint angles because that is what the arm stores.

## Why the middle key exists

A joint-space move does not travel in a straight line, and the joints are not
time-synchronised — each runs at up to 60 °/s and arrives when it arrives.
Measured on the real chain:

| route | time | sideways travel at part height |
|---|---|---|
| `Q → O` | 0.82 s | **200 mm** |
| `Q → W → O` | 1.38 s | 1 mm |

The shortcut saves **40%** of the time, and it saves it by coming in *sideways
across the belt at pick height* — straight through the line of parts. The
approach pose turns the final leg into a vertical descent. Flown against a full
line, going straight in scatters **1.75 parts a trip** against **0.63**.

That is not a rule bolted on to make a game. It is why approach waypoints exist
in real robot programs, it falls out of the AR4's own joint geometry, and the
selftest measures it rather than asserting it. If the direct move were no more
dangerous than the two-leg one, the middle key would be ceremony and there would
be no game in the sequence — so the test is allowed to say so.

## What the selftest found

**You have to lead the target.** The jaws take 0.22 s to close and the line runs
at 105 mm/s, so a part travels 23 mm during the close — further than the grasp
radius. You cannot close when the part is under the tool; you have to close
before it gets there. That was not designed in. It fell out of the numbers, and
the test found it: a rig that gripped only while the part was dead centre never
picked anything up, because the jaws reopened as it drifted.

Two bugs it also caught:

- **The line spawned parts off the wrong end.** The feed tracked an x position
  and decremented it, which created new parts at the *end* of the belt and
  quietly emptied the cell within a minute. It now tracks belt distance
  travelled, which also makes the spacing exact and frame-rate independent.
- **The reach bound was wrong in the test, not the arm.** Summing the joint
  offsets' z components gives 0.788 m; the real bound is the sum of their
  *norms*, 0.800 m, because joint 2 is offset in y as well and joint 3 in z. A
  correct arm was failing a sloppy assertion.

## What is invented

The arm, its limits and its speeds are the AR4's. The cell around it is ours:
belt speed, part spacing, how often a reject comes past, what counts as scrap.

There is **no dynamics** here — no torque, no payload, no compliance, no
acceleration limits. The joints simply move at their rate limit, which is what a
position-controlled arm looks like from outside and is not what one feels like
from inside. Nothing in this page is a claim about how an AR4 behaves under
load.

`index.html` exposes `window.__armline()` for headless driving. Verified in real
Chrome: WebGL context created, all four keys independent and simultaneous, pad
mirroring, `blur` releasing, no console errors. Headless throttles
`requestAnimationFrame` to about 0.5 Hz, so the browser check cannot exercise
gameplay that advances on the frame clock — that is what the selftest is for —
and the screenshots used to judge the look pose the arm directly instead.
