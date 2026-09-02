# arnold — a square filling a cube

A member of the **math** surface (`math.mino.mobi`). Canonical URLs:
`math.mino.mobi/arnold/` and, once root next deploys, `mino.mobi/arnold/`.
Surface-wide facts live in [`../geometry/CLAUDE.md`](../geometry/CLAUDE.md);
repo-wide rules in [`../CLAUDE.md`](../CLAUDE.md).

## What it is

Arnold's problem 1988–5 asks whether a continuous map from the square onto the
cube can have Hölder exponent 2/3, the best the dimensions allow. Badger and
Palmer answered yes in August 2026 ([arXiv:2608.21246](https://arxiv.org/abs/2608.21246)).
This page renders their surface as a colour image: pixel `(x,y)` gets the
colour `f(x,y)` in the RGB cube. The result is a square in which **every colour
appears equally often** and **no two neighbouring pixels differ by more than
two levels**, with no seams, at every zoom.

It exists because a friend of the owner posted such an image ("every RGB value
between 1 and 10 times, max channel diff 4/255, a discrete approximation of a
2/3-Hölder measure-preserving surjection") and the question was whether it
generalises to a family. It does, and the docs tab says exactly how and how not.

| Tab | Does |
|---|---|
| **surface** | the GPU render; pan, zoom, seed, strength, palette, cat map |
| **census** | CPU render at 256²–2048², counts every colour and every neighbour jump |
| **print** | full-tile PNG at 512²–4096², quantised so the file is the census |
| **build** | paints a 256² tile pixel by pixel with the machinery shown per pixel (the two X-curves, the cube), or level by level at depth 1, 2, 3, 5 |
| **docs** | the argument, the numbers, what is rigid and what is free |

## Files

| File | Is |
|---|---|
| `surface.js` | the engine: staircase curve, X-fractal curve, Stong's map, fold, warps, palettes, raster, census, permalink codec |
| `surface.selftest.mjs` | ~1670 known-answer checks, ~1 s |
| `index.html` | the page; loads `surface.js` as a module and carries the GLSL port of it |

```bash
node arnold/surface.selftest.mjs
```

`scripts/preflight.mjs` picks the selftest up automatically for changed dirs.

## The four things not to break

1. **The staircase is the exponent.** Eight parameter steps per spatial factor
   of four is `8^(2/3) = 4`. The vertex list `STAIR` and the turn list `TURN`
   in `surface.js` are the paper's `p₀…p₈` (Section 2, `M = 4`); the selftest
   checks the Lemma 2.3 symmetries and the (2.3) self-similarity against them.
   The GLSL in `index.html` carries the same two tables by hand. Change one,
   change both, and the *GPU = CPU?* button on the census tab is the check.

2. **The fold, not the clip.** The paper clips `L(E∞²)` to a small central
   cube; that puts 98% of the square on the cube's faces. The engine folds the
   first coordinate `P = a₁ + 2a₂` with a triangle wave of period 2 instead.
   `P` has a trapezoidal density (ramp, plateau, ramp) and the fold lays the
   ramps on the plateau, so the histogram is flat — and at lattice-aligned
   sizes it is flat **to the pixel**: 256²→16³ (16 each), 512²→32³ (8 each),
   2048²→64³ (16 each), 4096²→128³ (8 each). The fold's phase is not a free
   parameter; any other crease opens holes in the histogram (a phase of ½ hit
   only 74% of colours). The selftest asserts the exact counts.

3. **Depth finishes at the apex.** `sPoint`/`gPoint` return the *centre* of the
   last level-square (all four quarter-triangles of a square share their apex
   there), never the hypotenuse midpoint, which lies on a square edge and rounds
   into the wrong cell. That is what makes the CPU and GPU quantise identically
   and what makes the exact counts exact. Print depth is `⌈log₈(N/4)⌉ + 3`,
   which keeps the float path clear of cell boundaries; the zoom view uses all
   ten digits.

4. **The family must be measure-preserving.** Seeds vary the image only through
   area-preserving maps of the torus applied before the surface (shears with
   Jacobian 1, optionally Arnold's cat map) and the 48 symmetries of the cube.
   Anything else — a non-volume-preserving colour tweak, a domain warp with
   det ≠ 1 — silently breaks the one property the page is about. The selftest
   checks the Jacobian of every warp numerically. Exact-histogram
   post-processing (slice sorting to force every count to `N²/C³`) was tried
   and rejected: it lifts the neighbour jump from 2 to 12.

## Measured

Bare surface (`strength 0`, `fold`), pixel centres, torus edges included:

| N | C | per colour | counts | max jump | Hölder constant (bound 4) |
|---|---|---|---|---|---|
| 256 | 16 | 16 | exactly 16 | 2 | 5.0 (quantisation-dominated) |
| 512 | 32 | 8 | exactly 8 | 2 | 4.0 |
| 1024 | 64 | 4 | 0–8, 99.9% hit | 2 | 3.2 |
| 2048 | 64 | 16 | exactly 16 | 2 | 5.0 (quantisation-dominated) |
| 4096 | 128 | 8 | exactly 8 | 2 | 4.0 |
| 8192 | 256 | 4 | 0–8, 99.95% hit | 2 | 3.2 |

Warps cost Lipschitz: at strength 1 with the cat map, 512²→32³ shows counts
spread to about 1–16 around 8, every colour still hit, and neighbour jumps up
to about 7 of 32 — the measured Hölder constant climbs to ~14 against the bare
surface's 4.

## Quirks

- The image is a torus tile: `g(0) = g(1)`, so the print repeats seamlessly and
  the view wraps. Zoom out to ×¼ to see four tiles.
- Zooming into any cell shows the whole surface again, rotated and linearly
  recoloured (the similarities are rotations, and `L` is linear). *Stretch
  contrast* makes this visible; without it a deep zoom is nearly one colour,
  which is the Hölder condition doing its job.
- `wrap` mode shows Stong's bijection literally: exactly flat, but the red
  channel wraps 255→0 along fractal seams. It is there to make the point that
  the fold is what removes them.
- The GPU walks ten octal digits from a 32-bit fixed-point torus coordinate,
  so the view is precise to about 2⁻¹⁴ of the tile; deeper zoom is clamped.
- 4096² prints need a GPU that allows a 4096² canvas and a browser willing to
  PNG-encode 64 MB of pixels. Failures are reported, not swallowed.
