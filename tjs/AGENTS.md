# Driving a tjs deck from a local agent

This explains how an agent (e.g. a local Claude on the user's machine) assembles
and programs a **deck** for [tjs.mino.mobi](https://tjs.mino.mobi) — a motion
cell of HBots, linear axes, and labware. The contract is a **document**, not a
GUI: you read and write a deck file, and a headless oracle checks your work.

## The mental model

```
  read manifest  ──►  write a sequence  ──►  check (oracle)  ──►  fix  ──►  run
       ▲                                          │
       └──────────────── iterate ─────────────────┘
```

- The **deck file** (YAML or JSON) is the single source of truth: devices, how
  they mount onto each other, collision/sequence relations, and the sequence.
  Export one from the editor at `/deck` ("Export"), or write one by hand.
- The **manifest** is what you read to ground yourself: every module's id,
  joints + ranges, tool, the mass its carriage carries, its world reach, the
  named interaction **sites** (e.g. `plate.B3`) in world coordinates and which
  carriages can reach them, plus the verb grammar.
- The **oracle** (`check`) dry-runs your sequence with the *same physics engine*
  the website uses — flagging out-of-range joints, motor **stalls** (which motor,
  how hard), **collisions**, and missing tools, plus the total cycle time. Fix
  what it reports, then the sequence is safe to run.

## The CLI (zero infrastructure, fully offline)

From `tjs/lib/` (Node ≥ 18; `npm i js-yaml` only if you pass YAML):

```bash
node deck-cli.mjs manifest cell.yaml                 # what's on the deck + verbs
node deck-cli.mjs check    cell.yaml [sequence.json] # dry-run -> diagnostics (exit 1 on errors)
node deck-cli.mjs simulate cell.yaml bridge '{"x":260,"y":40}'   # one move's torque verdict
```

`check` exits non-zero when it finds an error, so it drops straight into a
write→check→fix loop. If no sequence file is given, it checks the deck's own
embedded sequence.

## The sequence grammar

A sequence is an ordered list of steps. Each step names one device:

```json
[
  { "device": "bridge", "move": { "x": 60, "y": 80 } },
  { "device": "z_grip", "move": { "p": 95 } },
  { "device": "z_grip", "tool": { "open": false } },
  { "device": "z_grip", "move": { "p": 0 } },
  { "device": "bridge", "move": { "x": 240, "y": 220 } },
  { "device": "z_grip", "dwell": 0.3 }
]
```

**Primitive verbs** (run directly):

| verb | shape | meaning |
|------|-------|---------|
| `move` | `{ device, <joint>: mm }` | jerk-limited coordinated move. joints are `x`,`y` (hbot) or `p` (linear). |
| `tool` | `{ device, tool: { open: bool } }` | actuate the end-effector. |
| `dwell` | `{ device?, dwell: seconds }` | pause. |

**High-level verbs** — name a site instead of computing joints; they lower to
primitives by inverse kinematics (every joint is translational, so the IK is
exact) and enforce a tool/labware state machine:

| verb | shape | meaning |
|------|-------|---------|
| `moveOver` | `{ device, moveOver: "plate.B3" }` | IK move so the tool sits over a named site. |
| `pickTip` | `{ device, pickTip: "tips.5" }` | pipettor acquires a tip (consumes that tip site). |
| `dropTip` | `{ device, dropTip: true \| "bin.drop" }` | eject the tip (default: a waste chute). |
| `aspirate` | `{ device, aspirate: "src.A1", uL: 50 }` | draw liquid — needs a tip, respects the 1000 µL capacity. |
| `dispense` | `{ device, dispense: "dst.A1", uL: 50 }` | expel liquid — needs enough held volume. |
| `grip` | `{ device, grip: "rack.A1" }` | gripper closes on a part at a site. |
| `release` | `{ device, release: "dst.A1" }` | gripper opens, placing the part. |

A site ref is `"<labwareId>.<siteId>"` (e.g. `plate.B3`, `tips.5`); the manifest
lists every site with its world coordinates and which carriages can reach it.
The oracle rejects out-of-reach sites, missing tips, over-capacity aspirates,
over-dispenses, and wrong-tool calls — so you find out before you run.

A pipetting transfer end-to-end:

```json
[
  { "device": "z", "pickTip":  "tips.1" },
  { "device": "z", "aspirate": "src.A1", "uL": 50 },
  { "device": "z", "dispense": "dst.A1", "uL": 50 },
  { "device": "z", "dropTip":  true }
]
```

Raw joint targets (in `move`) are absolute mm within each joint's `[min,max]`
(read from the manifest). The reserved `plannedVerbs` (liquid classes, parallel
moves) are not wired yet.

## Assembling a deck (placing modules)

Authoring is the same document. Add to `devices[]`:

```yaml
- id: z_grip
  type: linear            # linear | hbot | wellplate | tiprack | tuberack | waste
  params: { axis: z, drive: screw, travel: 120, motor: "NEMA 17 (0.44 N·m)", limits: {...} }
  tool: gripper           # none | gripper | pipettor (linear only)
  mount: { parent: bridge, attach: carriage, position: [-30, 0, 0], rotation: [0,0,0] }
```

`attach: carriage` makes this device **ride** its parent's moving carriage (a Z
on an HBot on a rail). `attach: frame` bolts it to the parent statically.
Labware mounts to the deck (`parent: null`). After editing, run `check` — and
remember every kilogram you bolt onto a carriage is reflected to that device's
motors (`carries_kg` in the manifest), so re-check the torque verdict.

## Putting it on the screen

The browser is the viewer/executor. Today: paste/upload the deck YAML in the
`/deck` ("Import") or `/gantry` ("Import YAML") panels, or click "Load from
editor" if you exported via the editor's autosave. A live localhost bridge
(an MCP server + WebSocket) so an agent drives the rendered screen directly —
no copy-paste — is the planned next layer; the contract above is identical
whether the transport is a file or a socket.
