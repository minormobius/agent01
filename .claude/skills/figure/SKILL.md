---
name: figure
description: Build, pose, walk, check and render a character body headlessly with the figure rig (packages/figure) — proportions in head units from a few numbers (chibi to fashion), poses written as intent (planted feet, hands placed on the body), a walk whose feet cannot slide, and an anime cel-and-ink renderer; numeric checks for slip, ground contact, reach, interpenetration and balance, and a model sheet as PNG. Use when drawing, animating or checking a human figure or character.
---

# Figures, headlessly

A figure is a **spec** (a few numbers) → a **rig** (bones in head units) → a
**pose** (intent, solved) → a **body** (a signed distance field of round
cones and ellipsoids) → **checks** (numbers) and **pictures** (a model sheet).
Never tune a picture by eye first: write the intent, run the checks, then look.

Everything below runs from `packages/figure/`. Checks need node alone;
pictures need Playwright's Chromium (software WebGL is enough).

## The loop

```
spec.json → check → (fix the intent, not the numbers) → render → look → …
```

| step | command | reads back |
|---|---|---|
| check | `node agent/check.mjs specs/adult.json [--json]` | ~49 checks: crown at `heads`, soles on the ground, left mirrors right; the walk's planted feet never slide, never sink, swing feet clear the ground, knees bend forward, the pelvis moves smoothly; per pose: every limb reaches, no limb through another, wrists within range, planted feet on the ground, weight over the feet. Exit 1 on any failure |
| model sheet | `node agent/render.mjs specs/adult.json --out a.png [--skeleton] [--h 560]` | turnaround (front, ¾, side, ¾ back, back), a walk cycle with every planted pivot dotted, the pose row; head-unit lines behind |
| lineup | `node agent/render.mjs --lineup specs/chibi.json specs/adult.json … --out l.png` | the figures side by side, one head the same size in all |
| faces | `node agent/render.mjs specs/teen.json --faces --out f.png` | close-ups: the head turning 0–135° and looking up and down, every expression, and a cast of identities from predicates |
| tests | `node figure.selftest.mjs` · `node browser.selftest.mjs` | the maths and every check on every spec · the GPU draws the same body node measures (silhouette IoU > 0.985) |

A spec inline works anywhere a path does: `node agent/check.mjs '{"heads":3}'`.

## The spec

`{ heads, build, legs, mass, headWidth, neck }` — see `README.md`. One unit is
one head height; y is up, the figure faces +z, its left is +x.

## The face

A face is IDENTITY (in the spec) × EXPRESSION (in the pose), both from a small
anime vocabulary (`lib/face.js`):

```json
"face": { "eyes": "tsurime", "brows": "thin", "mouth": "cat", "nose": "dot",
          "lashes": "heavy", "irisColor": "red", "extras": ["blush", "mole"] }
```

eyes: `round` `tsurime` `tareme` `narrow` `jitome` · brows: `thin` `thick` `arched` `straight` ·
mouth: `small` `wide` `cat` `fang` · nose: `none` `tick` `dot` · lashes: `light` `heavy` ·
irisColor: `violet` `blue` `green` `amber` `red` `brown` · extras: `blush` `mole` `mole-left`.
Any numeric field of `BASE` overrides directly (`"eyeH": 0.2`). A pose sets
`expression` (`neutral` `smile` `laugh` `angry` `sad` `surprised` `wink` `sleepy` `shout`,
or an object of overrides) and `gaze: [x, y]`. No `face` in the spec draws the
mannequin's construction lines instead.

The face checks (`checkFace`, in `check.mjs` whenever a spec has a face) hold
every expression: the eyes on the front of the face, apart, brows clear of the
lashes, the mouth between nose and chin. Brows are constrained above the lid
(`browFloor`), so an angry brow knits down onto the eye, never into it.

## Writing a pose

A pose says what the figure is DOING (`lib/poses.js` has worked examples):

- `root: { pos, yaw, pitch, roll }`, `spine: { bend, side, twist }`, `head: { yaw, pitch, roll }` or `lookAt: [x,y,z]`
- a leg: **planted** `{ at: [x,0,z], pivot: 'flat'|'heel'|'ball', pitch, yaw }` (the contact point, not the ankle), or an ankle target, or angles `{ flex, out, knee }`
- an arm: angles `{ raise, out, elbow }`, a reach `{ reach, pole }`, or a **placed hand** `{ hand: { at, palm, dir } }`

Then make it true for this body with `lib/settle.js`: `settle` (lower the pelvis
until planted feet are in reach), `balance` (weight over the support, or over
one foot), `clearArms` (angle-posed arms move to the nearest pose that clears
the body), `handOn` + `seatHand` (a palm on the body's actual surface, pushed
out until nothing sinks in). A pose written this way fits a chibi and an
8-head figure alike; one written in raw numbers fits one body.

## When a check fails

Fix the cause the check names, never the tolerance. The history in `CLAUDE.md`
is a list of real faults the checks found (a rigid foot driving its toes into
the floor; a non-associative blend making the left shoulder differ from the
right; a hand-on-hip sinking into the hip) and what fixed each.
