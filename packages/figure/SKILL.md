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
| hands | `node agent/render.mjs specs/adult.json --hands --h 220 --out h.png` | every gesture from the back, the palm and the thumb's side; the same drawn small (blocks); placed hands resting on the hip and knees |
| any pose | `node agent/render.mjs --lineup a.json b.json --pose crouch --yaws 0,1.57,3.14 --out p.png` | a lineup in one pose from any angles |
| tests | `node figure.selftest.mjs` · `node browser.selftest.mjs` | the maths and every check on every spec · the GPU draws the same body node measures (silhouette IoU > 0.985) |

A spec inline works anywhere a path does: `node agent/check.mjs '{"heads":3}'`.

## The spec

`{ heads, build, legs, mass, headWidth, neck }` — see `README.md`. One unit is
one head height; y is up, the figure faces +z, its left is +x.

## Masculine and feminine forms

`femme` (0..1) carries the anatomical shifts of a feminine frame: a narrower
ribcage and shoulders, a waist drawn in, a wider pelvis whose widest point drops
to the hip joints, fuller glutes and thighs, a finer neck, arms, hands and feet,
and a bust. `waist` and `hips` (0..1, defaulting from `femme`) vary the form
within that. The bust has three independent knobs, because in people it is
independent of the frame (ANSUR II: r ≈ −0.03 between a woman's chest projection
and her ribcage's breadth): `cup` is its volume, `lift` how high it sits and how
full its upper pole is (low lift is a teardrop), `set` how wide apart it sits and
how far it turns out. `bust` is still read as `cup`. `specs/` has petite, curvy, athletic, model and plus, `specs/` has petite, curvy, athletic, model and plus, beside
the masculine chibi, teen, adult, heroic and fashion. `build` is shoulders and
muscle only; it no longer touches the hips.

The silhouette checks (from 5 heads up) hold the form to people. `lib/ansur2.js` is
reference data derived from ANSUR II (6,068 US Army personnel; the script and its
one assumption, head height = 1.92 × menton–sellion, are in `reference/`). Each
check's band is the 5th–95th percentile widened by an anime allowance:
waist to hips (front), shoulders to hips, buttocks to waist in depth, chest to
waist in depth, and the shoulder line's drop below the chin. A figure outside a
band is drawn outside people, which may be what you want; the check says so.

The glutes sit out of the torso–leg blend at the hip: the side of the hip runs
smoothly into the thigh (not a shorts hem), and under each cheek the thigh meets
it in a fold. From behind, the two cheeks meet in a hard crease (the cleft).

## Hair

`"hair": { "length": "shoulder", "bangs": "blunt", "tails": "twintails", "color": "pink", "extras": ["ahoge"] }`

length: `short` `bob` `shoulder` `long` `waist` · bangs: `blunt` `swept` `parted` `spiky` `none` ·
tails: `none` `twintails` `ponytail` `bun` `buns` · extras: `ahoge` `sidelocks` ·
color: `black` `brown` `chestnut` `blonde` `pink` `silver` `blue` `red` `green` `purple` `orange` `white`.

A cap cut at the hairline, then locks: chains stiff at the root and giving way to
gravity (and to the head's acceleration while walking) toward the tip, each point
pushed off the skin by its radius. Long hair adds a sheet behind the locks. The
hair checks: off the head and body, the eyes visible through the bangs (rays at
each eye), symmetric styles exactly mirror-symmetric, and the locks hang.

## Clothes

`"outfit": { "scheme": "school" }`, or piece by piece:
`{ "top": "sailor", "bottom": "pleated", "legwear": "knee-socks", "shoes": "loafers", "accent": "ribbon", "colors": { "top": "white", "bottom": "navy", "collar": "navy" } }`

top: `tee` `shirt` `tank` `sailor` `jacket` `crop` · bottom: `pants` `shorts` `skirt` `mini` `long-skirt` `pleated` ·
legwear: `socks` `knee-socks` `thigh-highs` `tights` · shoes: `sneakers` `loafers` `boots` · accent: `ribbon` `tie` `collar` ·
schemes: `school` `casual` `office` `street` `summer` · colours: see `CLOTH_COLORS` in `lib/clothes.js`.

A garment is the body parts it covers, inflated by the cloth's thickness and cut
by planes (hems, necklines, cuffs), built on the solved pose. A skirt is a
flared (pleated) cone whose axis and flare are solved per pose, drawn as a shell
open at the hem. A thigh that leaves it (a raised knee, a crouch, a lap) gets a
drape, and knees spread past what the hem can span (a squat) pull the hem up to the
knees with a panel across the thighs. `checkClothes`: no skin shows through, sampled
over every pose and a walk. It checks every covered part, and every other torso part
in a garment's region that the outfit doesn't declare bare (`bareParts`), so a new body
part a garment doesn't know about fails the check instead of showing through.

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
- a hand's **gesture** on any arm: `gesture: 'relaxed'|'open'|'flat'|'fist'|'point'|'peace'|'thumbsUp'|'grip'|'ok'` (or an object in the same shape, `lib/hand.js`)

Then make it true for this body with `lib/settle.js`: `settle` (lower the pelvis
until planted feet are in reach), `balance` (weight over the support, or over
one foot), `clearArms` (angle-posed arms move to the nearest pose that clears
the body), `handOn` + `seatHand` (a palm on the body's actual surface, pushed
out until nothing sinks in). A pose written this way fits a chibi and an
8-head figure alike; one written in raw numbers fits one body.

## Hands

`lib/hand.js`. A palm, a thenar pad, four fingers of three bones (0.46 : 0.30 : 0.24,
knuckles on an arc, the middle longest, index and ring nearly equal, the pinky's tip at
the ring's last joint) and a thumb, in hand lengths in the hand's own frame, built from
the direction toward the thumb, so the two hands mirror exactly. A gesture is intent, and
solvers make it true for this hand:

- **close**: a closed finger curls until its tip meets the palm, not through it
- **onto**: the thumb's pad is solved onto its mark, a fingertip (OK) or the middle bone of a
  closed finger (a fist, a point, a peace sign), passing through nothing
- **rest**: a placed hand's fingers curl over, or lift off, what they rest on (the body
  and the clothes, a skirt as a solid, never the arm's own sleeve); `seatHand` tips the
  hand up when its fingers dig in and lifts it when its palm does

Drawn small, fingers a few pixels wide are ink lines and a smudge, so `buildBody(P,
{ hands: 'block' })` melts neighbouring fingers that bend and fan alike into one mass,
and only a finger doing something else stands apart. `handDetail(P, cam, px)` (shader.js)
picks it, below ~64 pixels a hand. Checks always build the full hand.

`checkHands`: the proportions; every joint within its range; no finger through another
or through the palm; each gesture means what it says (fists closed, thumbs on their
marks, pointing fingers straight); left mirrors right; placed fingers rest on the
surface (a finger curled right round with nothing under it is "off an edge").

## When a check fails

Fix the cause the check names, never the tolerance. The history in `CLAUDE.md`
is a list of real faults the checks found (a rigid foot driving its toes into
the floor; a non-associative blend making the left shoulder differ from the
right; a hand-on-hip sinking into the hip) and what fixed each.
