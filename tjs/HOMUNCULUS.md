# The Homunculus — tjs as the FLTD plant-simulation surface

The **homunculus** is the world model's 3D self-image: a faithful model of the
instrument's motion skeleton + deck, generated from the instrument's own system
description. It runs two ways — as a **standalone 3D surface** you can drive, and
as a **plant-simulation backend** that speaks the same motion wire contract as the
real bench, so the *same scripts that drive metal drive the twin in parallel.*

This is "John's plant sim" piece of the digital twin, built on the existing tjs
motion engine (s-curve planning, per-motor torque vs. envelope, collision,
cycle-time) and renderer.

> **Safety.** The twin is **pure sim**. It never opens or owns a CAN line. One CAN
> owner stays `CopleyBench.Server`. The twin is a parallel, client-shaped surface —
> swapping a recipe onto it touches no hardware.

---

## 1. The device profile — the artifact that makes "run in parallel" work

A **device profile** (`lib/profiles.js`) is one record per axis. The same profile
is read by three backends:

| reader | uses |
|---|---|
| **real plant** (`CopleyBench.Server`) | `node`, `board`, `channel`, `countsPerMm`, `motorProfile` — to address a CAN amp |
| **sim amp** (`CopleyBench.SimServer`) | the same `node` + motion limits |
| **twin** (this surface / bridge) | `deviceId`, `joint`, `mechanism`, `limitsMm`, torque curve — to plan + render the move |

One profile, three readers. A move means the same thing whether it runs on metal,
the SimServer, or the twin. Profiles are produced by the homunculus generator from
the instrument's `axes` + `kinematics` + `motor_profiles`.

---

## 2. The homunculus generator

`lib/homunculus.js → systemToHomunculus(systemDoc) → { deck, profiles, notes }`

It reads an FLTD **system description** (the `system-description.schema.yaml`
shape, vendored here as `systems/mps-1.system.json`) and produces a tjs deck:

- a `kinematics` **hbot/corexy** block → one tjs `hbot` device (2-DOF plane);
- every other **linear/plunger** axis → a tjs `linear` device, chained onto its
  `parent_axis`'s carriage (so a Z rides the gantry, a clamp rides the mixer Y);
- **deck slots + labware** defs → tjs labware (rack/tip-box/plate/box);
- co-mounted carriage tools → **keep-apart** relations (gripper-Z ✦ pipettor-Z);
- **rotary** axes (magnet spin, etc.) → a profile only (the twin has no rotary
  body; the bridge time-advances them). These show up in `notes`.

**Frame + units.** FLTD deck coords are mm, **Z-up**; tjs is mm, **Y-up**. The
generator maps `(x, y, z)_fltd → (x, z, y)_tjs` and centres every body on the deck
centroid, so "up" stays up and the self-image is centred on screen.

---

## 3. How to run it

### a) The standalone 3D surface (no backend, static)
Serve the `tjs/` directory and open `/twin/`:

```bash
cd tjs && npx serve .        # or any static server
# open http://localhost:3000/twin/
```

You get the instrument's self-image. Pick any axis and **Run move**, or **Run
sequence** to play the demo through the oracle — the panel shows cycle time and
flags motor stalls / collisions *before metal*. The profile table shows each
axis's amp node and the twin joint it drives.

### b) The twin plant bridge (the parallel-plant seam)
```bash
node tjs/twin/server.mjs --port 5400 [--system ../systems/mps-1.system.json]
```

This serves the **CopleyBench amp wire contract** backed by the tjs engine:

```
GET  /api/amps                       -> [{node, axis, role, board, channel}]
GET  /api/amp/:node/status           -> { position(mm), enabled, mode:"twin", ... }
POST /api/amp/:node/enable|disable|home
POST /api/amp/:node/moverel          { counts | delta_mm, vel?, accel?, ... } -> OpResult
POST /api/coordinated/move           { moves:[{axis|node, counts|delta_mm, ...}] } -> OpResult
GET  /api/telemetry/stream           Server-Sent Events @ 20 Hz
GET  /api/pose                       deviceId -> joint state
```

`OpResult` carries `{ ok, message, code, dt, stall, collision, peakUtil }` — the
oracle's verdict per move (cycle time + whether the modeled motor delivers it).

### c) Tests
```bash
node tjs/lib/profiles.test.mjs
node tjs/lib/homunculus.test.mjs
node tjs/lib/plant-bridge.test.mjs
```

---

## 4. Run topology — where the twin sits

The twin is a drop-in alternative to the real Server / SimServer on the bench's
motion port. Nothing else in the stack changes.

```
ScriptHost (:5200) ──issues copley.motion.* ──►  ONE of:
                                                  ├─ CopleyBench.Server   (:5000, real, owns CAN)
                                                  ├─ CopleyBench.SimServer (:5000, in-memory amps)
                                                  └─ tjs twin plant        (:5400, 3D self-image)   ◄── this
        │
        ├──issues world.* ──►  Ascential.World.Server (:5300)  "what is where"
        └── VisionSimServer (:5100)
```

"Run in parallel" = point one ScriptHost at the real Server and a second at the
twin, feed both the same recipe, and compare cycle time / verdicts side by side —
the device profiles guarantee the moves are the same move.

---

## 5. Interface to the scheduler / scripts

ScriptHost dispatches `copley.motion.*` commands as HTTP to `Copley.ServerUrl`.
To drive the twin, set that URL to the bridge:

```jsonc
// CopleyBench.ScriptHost appsettings.json
"Copley": { "ServerUrl": "http://127.0.0.1:5400" }   // was :5000
```

Command mapping (ScriptHost → bridge → tjs engine):

| script command | bridge route | twin action |
|---|---|---|
| `copley.motion.move_rel` | `POST /api/amp/:node/moverel` | plan + simulate the joint move; return verdict |
| `copley.motion.move_coordinated` | `POST /api/coordinated/move` | plan each axis; aggregate verdict + cycle time |
| `copley.motion.home` | `POST /api/amp/:node/home` | reset joint to home pose |
| `copley.motion.enable/disable` | `POST /api/amp/:node/{enable,disable}` | flag state |
| `copley.motion.get_status` | `GET /api/amp/:node/status` | position + mode |

HBot moves work at **both** levels the recipe layer uses: motor-level (`hbot-a` /
`hbot-b`, combined via `X=(A+B)/2, Y=(A-B)/2`) and logical (`gantry-x` /
`gantry-y`). Addressing is by amp `node` or by axis name.

> **Bench-attach detail (follow-up).** ScriptHost resolves script axis aliases
> (e.g. `hbot_a`) through `SpecsStore`; the twin currently uses the FLTD axis ids
> (`gantry-hbot-a`). Aligning the alias table is the small remaining step to point
> a live ScriptHost at the twin in CI.

---

## 6. Interface to the world model

The World server (`contracts/world.md`, `:5300`) owns "what is where." The
homunculus and the World share the **same deck geometry** — both derive from the
system description's `deck` (slots + `axisAnchors`). So:

- **Read (now / next):** the surface (or bridge) fetches `GET /api/world/deck` +
  `GET /api/world/state` and places labware instances, discrete items, and
  container fill into the matching deck slots — the 3D scene then shows live
  occupancy, not just the static layout. The labware ids already line up because
  both sides read the same `deck.json`.
- **Write (follow-up):** when the twin simulates a pick/place it can `POST
  /api/world/event` a `Moved` event (sourceRef `Twin:...`), so a twin run produces
  the same world event stream a real run would — making the two directly
  comparable in the audit/Gantt views.

This pass ships the read-side seam and geometry alignment; the live state overlay
and `Moved` emission are wired in the next pass (see below).

---

## 7. Closing the loop — the two missing hooks

The demo sequence (`prep-demo`) picks a tube, stages it, picks a tip, aspirates
from the rack, and dispenses to the cold plate — all against **reachable** deck
labware. Two things it deliberately does *not* do yet, because the architecture
isn't there. Both are flagged in the sequence (the mixer is a reachable
stand-in) and specified here.

### A. Movable labware + cross-device handoff ("move the seat into reach")

**Today:** labware mounts to the deck frame (static); `resolveSite` computes a
site's world coords at the device's *default* pose (it ignores live state); and
`grip`/`release` only toggle a `holding` flag — no tracked item relocates. So a
tube can't be handed from the gripper to a mixer seat, and the seat (which rides
`mixer-y`, 177 mm outside the gantry plane at its park) can't carry it into reach.

**What it needs — three changes, all in the pure layer:**
1. **Carriage-borne labware.** Let a labware device mount on another device's
   `carriage` (the seat on `mixer-y`). The mount tree already supports
   `attach: carriage`; the converter just parents seats onto `mixer-y` instead of
   the frame, so a `mixer-y` move physically carries the seat.
2. **Live-state sites.** `resolveSite(deck, ref, stateMap)` must compute
   `pointWorld` at the *current* stateMap so a carried site tracks the transport
   (`pointWorld` already takes a stateMap — it's a threaded-through arg, then
   `solveOver` reaches the moved site for free).
3. **Tracked items + handoff.** Add an `item` to the tjs world — a tube/tip with
   an identity and a `location = {carrier, site}`. `grip` binds the item to the
   gripper; `release` rebinds it to the destination carrier+site. A handoff is
   just a release onto a carriage-borne site; the 3D re-parents the item mesh to
   whatever holds it.

With these, the real workflow runs with no stand-in: gripper picks the tube →
`mixer-y` transports the seat into the gantry plane → gripper releases onto the
seat → pipettor tips/aspirates/dispenses into it → `mixer-y` carries it away.

### B. Bidirectional twin ↔ World-model sync (the shared truth)

**Today** the twin keeps its *own* little world (`verbs.js initWorld`: tips, held
volume, holding) — separate from the FLTD World server (:5300), which is the real
"what is where." To run the actual recipe they have to agree.

**Make the FLTD World the single truth; the twin's world becomes a projection:**
- **Read (seed):** on load, `GET /api/world/state` + `/api/world/deck`; map slot
  occupancy / discrete items / container levels onto the twin's items + labware,
  so the scene shows current inventory, not a blank deck.
- **Write (report):** as the twin simulates, `POST /api/world/event` the *same*
  events a real run emits — `Moved` (rack→seat), `QuantityChanged` (±µL on
  aspirate/dispense), `Identified` — with `sourceRef: "Twin:<run>:<step>"`. The
  World folds them exactly as it folds a metal run's events.
- **Wait (sync):** recipes gate on world state via `world.wait_until` predicates;
  the twin honors the same predicates against the shared World, so twin and real
  runs block/advance identically.

Net: **one recipe, two plants (real + twin), one World.** A twin run produces the
same event stream a metal run does — directly comparable in the audit/Gantt views,
and the scheduler can't tell which plant it drove. The `world.*` commands are the
write channel; `/api/world/state` + `wait_until` are the read channel.

## 8. Follow-ups

- **Canonical generator in AscentialPlatform.** Today `systems/mps-1.system.json`
  is a vendored, merged export. The canonical path is a `tools/render-system`
  target that emits `*.system.json` + device profiles from `systems/<id>/*.yaml`
  (alongside the existing `worldExport` / `simExport` renders), so the twin tracks
  the instrument with no hand-vendoring.
- **WS parity.** The twin offers SSE telemetry; the real SimServer uses
  `WS /ws/telemetry`. Adding a WS endpoint is a small shim for UI parity.
- **Live World overlay + `Moved` emission** (§6).
- **digitwin world model.** The digitwin config (axes + spatial) maps onto the
  same device-profile contract — a second `systemTo…` front-end bridges it to the
  same twin.
- **Aggressive placeholder limits.** mps-1 axis limits are `TODO_RESOLVE`
  placeholders; some (e.g. a 600 mm/s Z on an 8 mm screw) stall in the twin — which
  is the point: tighten the system description and the verdict clears.
```
