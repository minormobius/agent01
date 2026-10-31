# /chair44/ — the first strongly aperiodic monotile in 3D

Part of the **math** surface (`math.mino.mobi`). See [`../geometry/CLAUDE.md`](../geometry/CLAUDE.md)
for the pack it belongs to and [`../CLAUDE.md`](../CLAUDE.md) for repo-wide rules.

Chair44 (Tsiokos, arXiv:2609.19214, Sept 2026) starts as a 2×2×2 block of unit
cubes with one corner removed: the **chair**, a rep-tile. Each of its 24 exposed
unit squares ("panels") carries eight tiny square pyramids, 192 in all, with
signed heights of a/10000 for a ∈ ±{1..12}. A bump fits only a dent of the same
magnitude. Those pyramids force every tiling of space by copies of the tile
into the chair's 2× substitution hierarchy, so no tiling has a period and none
has a symmetry of infinite order. The tile was found by prompting an AI model
(GPT-6 Astra), and the proof is Lean-checked. Flicker (arXiv:2609.23783)
reproduced the enumerations and found simpler matching rules. Goodman-Strauss
(arXiv:2609.24779) redrew the tile and gave a Berger-style proof.

The page is a WebGL viewer in the szilassi layout: object in the top two
thirds, controls in the bottom third, side by side on wide screens.

## Run this first

```bash
node chair44/tile.selftest.mjs    # ~2 s, 320 checks
```

`preflight.mjs` picks it up automatically for changed dirs.

## The one idea

`tile.js` is the only copy of the maths. The page imports it with
`<script type="module">` and the selftest imports it unchanged. **Every
coordinate is an integer in eighths of a cube edge**, so feature offsets
(±1/8, ±1/4) are ±1, ±2 and two features coincide by `===` on a string key,
never by tolerance. Poses follow the paper exactly: a frame (p, s) acts by
G(x)ᵢ = sᵢ·x_{pᵢ}, then a translation in cube units.

What the selftest recomputes from the 192 recipe numbers, each count as printed
in the preprint:

| claim | count |
|---|---|
| grid cells adjacent across the 24 panels | 22 |
| face-neighbour poses (48 frames, overlaps rejected) | 2388 |
| legal ones, **pose for pose equal to the paper's Figure 7** | 44, all proper (homochiral) |
| distinct rotations in the atlas, and the group they generate | 19 → all 24 |
| cuts of 2P into 8 bare chairs / decorated cuts that fit | 1 / 3 = Table 1 and its two turns about the body diagonal |
| parent contacts: candidates → disjoint → legal | 697 → 116 → 44, and ½·(parent atlas) = atlas |
| symmetries: bare chair / Chair44 | 6 / 1 |
| internal contacts in the 8/64/512 patches, all legal and all atlas poses | 16 / 183 / 1663 |
| mesh closed, oriented, volume 7 (true and exaggerated) | ✓ |

## Things that bite

- **Recipe transcription.** `RECIPE` was read off Figure 3 of the preprint by
  the *positions* of the numbers in its SVG, not their text order, which is
  not spatial. It is pinned by the paper's worked example (panel 13) and,
  far more strongly, by 2388 → 44 matching Figure 7 exactly. Swap any two
  numbers and the atlas changes. Don't hand-edit it.
- **697 excludes same-parent pairs.** Enumerating 8 × 44 × 8 gives 32 cases
  where both fine chairs sit in the *same* parent. Those fix the identity,
  which is not a parent contact. `parentAtlas()` counts them separately as
  `sameParent`. Include them and you get 698.
- **The bare chair has a 3-fold turn**, so three proper poses cover the same
  seven cells. The dissection search enumerates covers by cell set *and then*
  all 3⁸ pose choices. Deduping placements by cell set alone finds a cover
  with zero legal decorations, which is a wrong result that looks plausible.
- **Mirrors.** Face-neighbour poses include all 48 frames, reflections too
  (the paper's 2388 does). Legality rejects every improper one, and that is
  the homochirality claim, so don't restrict the search to rotations.
- **Scope.** This checks the *finite* census. It does not check the
  continuous-geometry argument (that these pyramid angles force grid
  registration), and the about tab says so.

## The page

- Modes: `tile`, `super` (8), `p64`, `p512`, `atlas` (the 44, plus "try an
  illegal one", which draws a random one of the 2344 in red). `#m=<mode>&c=<n>`
  permalinks the mode and contact.
- Pyramids are drawn exaggerated. The default is the paper's own figure scale,
  heights ×80 and bases ×5. `bumps ×` at 0 is true scale. Pyramids are off for
  the 64/512 patches: 512 × 4272 triangles is too many for a phone.
- Explode is hierarchical. Each chair moves from its parent's centre, each
  parent from its grandparent's, and coarser levels get wider gaps.
- The check tab reruns the census in the browser (~2 s) the first time it opens.
