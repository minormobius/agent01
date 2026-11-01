# FALL LINE

kata's downhill: the Cheshire cat rides its bicycle down a four-dimensional hill. The hill is a height map over a
three-dimensional ground (x, z and w), so "down" is still one direction, but the ground under you runs in three. Marked
trails go down it, and from the fourth level on there is more than one way to the bottom. The slope sets your speed;
the stick still sets your lean, as in TAILSPIN.

## Riding

- **The stick (or WASD, or the arrows) is the lean**, as in TAILSPIN: right, left, up for **ana**, down for **kata**,
  in the bike's own non-twisting frame, taken in a twentieth of a second (easy mode).
- **Speed is the slope's.** Along your heading, dv/dt = −g·grade − c_rr·g − k·v². c_rr is 0.015 on a trail and 0.09 on
  the rough hillside, so leaving a trail costs you speed. k is the cat's drag, tuned so a 10% trail runs at about 5 m/s,
  which is a game choice and not a measurement. Below 2.4 m/s the cat pedals, so a rise or the flat never stops you.
  The HUD shows your speed, the time, and par.
- **The trails are benched into the hill**: level across, falling along, with white kerbs and a centre line. The kerbs
  are coloured by where the trail goes out of your slice (teal ana, rose kata), as TAILSPIN's are. Contours every
  metre, heavier every five, show the hill's shape around them.
- **The grain** (button, or G) is the pattern painted on the ground: **kelvin** draws the cells of Kelvin's foam in 4D
  (the A₄* lattice from Foam⁴, whose cells are permutohedra), **grid** the tesseract grid's, or **none**. The grid shows
  you the axes; the foam has no favoured direction. It is a pattern, not the geometry: the hill underneath is the same
  smooth height map whichever you pick.
- **The bottom** is the end of any trail. You get 🥇 within 5% of par, 🥈 within 25%, and 🥉 otherwise. Run into the
  valley walls and you're put back at the last checkpoint.
- **The map** (top right) draws the trails in x, z and w, coloured by height.

## The engine

- **Trails (`js/trails.js`).** A level is a tree of trails. Each trail is a run of TAILSPIN segments plus a `grade`.
  The first starts at the top; each other starts on a trail already made (`{ from, at }`) and carries that trail's frame
  on, so a fork is two ways out of one place. The tree is turned by whichever of the 24 grid-keeping rotations fits the
  valley best (BOX 240 × 160 × 80 m, the valley an ellipsoid 114 × 74 × 34 m in half-axes) and checked for clearance
  from itself, forks excepted near their split.
- **The hill (`bake`).** The trails' heights are spread over a coarse 4 m grid by inverse-distance weights. Lumps are
  added away from the trails, then valley walls; then each trail is benched in within R, easing back over 2.5 m. The
  result is a 241 × 161 × 81 R16F height texture plus an RG16F trail field (distance to the nearest centreline, and which
  trail and how far along it), one sample a metre, read trilinearly by the shader and by the physics alike. `L` is the
  steepest slope inside the valley (×1.15), the bound the shader's height-field ray march steps by. Where two trails part,
  the faster-falling one cuts a bank below the other, under a metre high (the selftest bounds it).
- **The oracle (`js/descent.js`).** It rides every way down (a route is the chain of trails from the top to one trail's
  end), as a person on the page would. It uses the cat bike in easy mode, the slope's speed and pure pursuit 2 + 0.9v m
  ahead. Its stick is limited to the page's throw, with a reaction time τ. **Par** is the fastest route's time.
- **The difficulty (/10)** is the par route's: 10 × (0.3 timing + 0.25 out-of-plane + 0.15 lean + 0.3 speed). Timing is
  1 − τ⋆/1.2 s; out-of-plane works as in TAILSPIN; lean is the biggest lean against 20°; speed is the top speed against
  8 m/s. A level is scored by its quick way down, because that's the one par asks you to find.
- **Eight levels (`js/levels.js`)**, 1.72 → 7.33, with par and score stored and held to the oracle by the selftest.
  **Made hills (`js/gen.js`)**: a seed and a tier (easy, medium, hard) make a hill, the same every time. 🎲 picks one.
  A hill takes about 1.5–2 s to make, because it is baked and ridden by the oracle.

## What it doesn't model

The bike's dynamics are horizontal: the slope changes its speed but not its balance. Dips and crests don't load or
unload the wheels, and the lean is measured from the vertical, not the ground's normal. On a benched trail the ground is
level across, so the difference is small where you're meant to ride.

## Testing

```bash
node kata/fallline/test/fallline.selftest.mjs   # ~40 s
```

It checks the trails' frames, falls and forks; the bench, the trail field and the slope bound; terminal speeds; every
level fitting, solvable and scored as stored, the scores rising; the generator deterministic, valid and harder by tier;
`foam.js` byte-identical to `games/foam4/js/foam.js`; and the grain's lattice. Fall Line imports Lean's renderer and
dynamics and TAILSPIN's courses, so a change to either runs this selftest too.
