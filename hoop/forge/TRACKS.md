# Two tracks — material + pedestrian (the blood-vessel question)

> The idea: the carved roadway is the **material track** (spiderbots carry packets); add a separate
> **pedestrian track** (technicians, rindwalkers — a white-collar layer) that *doesn't intersect* it. The
> question: does two-non-intersecting degenerate to a spiral, or can it fractal out like blood vessels?

## The short answer

**Not a spiral — and not, in fact, possible in 2D as stated.** Two *connected* networks that each must
reach a 2D-distributed set of destinations cannot be non-crossing in the plane (the planar / K₃,₃
obstruction). Blood vessels look like they break this rule, but they cheat with the **third dimension**:
arteries and veins run at *different depths* and only touch at capillaries. So the real answer for the ship
is **two decks**, joined by lifts.

## Why our foam makes it stark (the probe found this)

`tracks.js` + `test/tracks.selftest.mjs` measure it on a real 19-chunk factory. Two structural facts kill
the 2D version:

1. **No interstitial tissue.** The foam's interior is partitioned *entirely* into **road + rooms**, with the
   road running *between* rooms. `interstitialFrac ≈ 0` — there is literally no "between" for a second
   network to grow in. (Blood vessels need tissue between the two trees; our foam has none.)
2. **The concourse *is* the connectivity.** Remove the carved road and the rooms shatter into ~130 isolated
   pockets (largest < 25%). Any network that reaches every facility, when removed, islands everything else —
   because it *was* the connectivity. So a second disjoint network can't also be connected-everywhere.

The probe confirms it numerically: the **material** tree reaches all 19 facilities; a disjoint
**pedestrian** tree then reaches only ~1–3. `feasibleIn2D = false`. It doesn't degenerate to a spiral — a
spiral is the *single*-network 2D space-fill; two everywhere-reaching non-crossing nets simply don't exist
in the plane.

> Aside on the spiral: a *single* space-filling path does degenerate to a spiral / Hilbert curve. With two
> networks you'd *want* interdigitated fractal trees (the artery/vein picture) — but that needs interstitial
> space (fails fact 1) or the third dimension (the resolution below).

## The three ways to actually get two tracks

| Resolution | What it is | Cost | Non-intersecting? |
|---|---|---|---|
| **A — Two decks (recommended)** | Material on one deck, pedestrian on another, joined by **lifts at each facility** (the artery/vein-at-different-depths solution; the nave lift already hints at it). | New: a second stacked foam floor + vertical exchange. | **Yes, truly** (3D separation) |
| **B — Divided concourse** | Widen the concourse and split it into a freight lane + a foot lane (disjoint cells, a median between). | Small: 2-colour the road cells. | Yes *except at junctions*, which become grade-separated crossings (over/underpasses) |
| **C — Regenerate the foam with interstitial corridors** | Don't let rooms tile the whole interior — reserve a secondary corridor lattice so two thin trees interdigitate (true blood vessels in 2D). | Medium-large: change the partition (`partitionChunk`) to leave tissue. | Yes (interdigitated trees) |

**Recommendation: A (two decks).** It's the honest blood-vessel answer (the third dimension is how biology
does it), it's non-intersecting *truly* (not "except at junctions"), and it reuses the lift idea we already
have — the fulfillment lift is the prototype of a per-facility material↔pedestrian exchange. The pedestrian
deck would be its own thin forge floor (control rooms, catwalks, the white-collar layer) stacked over the
material floor, with a drop-shaft at each facility core where a technician meets what the spiderbots brought.

## Status

- `tracks.js#twoTracks(reg)` — the probe: grows the two-thin-tree attempt and reports the obstruction
  (`disjoint`, `interstitialFrac`, `concourseComplement`, `material/pedestrian.reached`, `feasibleIn2D`).
  Pinned by `test/tracks.selftest.mjs` (8).
- **Resolution A is built** — `deck2.js#twoDeckFactory(seed)` stacks the material floor (the forge region)
  and a pedestrian mezzanine (an office over each facility + catwalks following the trunks), joined by a
  **corkscrew ramp** at each facility (`rampPoint` — a helix climbing deck 0 → deck 1; the fulfillment ramp
  continues to the nave). Non-intersecting because they're at different heights. Live isometric view at
  `hoop.mino.mobi/forge/stack` (`stack.html` + `stack-app.js`: explode slider to pull the decks apart,
  zoom/pan; packets ride the floor, technicians the catwalks, cars climb the ramps). Pinned by
  `test/deck2.selftest.mjs` (9). The ramp is the "weird ramp like stairs" the voronoi foam wanted — the
  corkscrew through the cells is the deck-to-deck stairwell.
- **Next:** make the mezzanine a real walkable deck in `/forge/walk` (descend a ramp to the floor), and
  grow the pedestrian network its OWN way (offices ↔ offices, not just over the freight trunks); B/C remain
  the alternatives if a single-deck answer is ever wanted.
