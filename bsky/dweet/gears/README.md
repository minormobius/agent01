# gears — dweets about gear systems

Drafts, not records. Each file is a dweet body; open it with
`node agent/link.mjs gears/<file>` (from `bsky/dweet/`) to get a permalink that
carries the whole thing, then **remix → post** from the page to publish it.

| file | chars | what it is |
|---|---|---|
| `train.js` | 248 | seven spur gears in a line, tooth counts 6…14, each driving the next |
| `planetary.js` | 256 | sun + three planets + internal ring (18/9/36); the carrier turns, the ring is fixed |
| `lattice.glsl` | 255 | an infinite square lattice where every gear meshes with all four neighbours |
| `spirograph.js` | 255 | a Spirograph *is* a gear system: 18-tooth planet rolling in a 48-tooth ring, pen tracing the hypotrochoid |
| `reduction.js` | 224 | a googol-machine: 10→40 compound stages, ×4 slower each; the ninth turns 65 536× slower than the first |

## The one idea all five use

A gear is a polar curve: `r(θ) = pitch + h·f(N·(θ − a))`, with `pitch = k·N`
so every gear shares the same tooth pitch `k`. With `f` odd (a sine, or
`S(1.5*S(u))` for flatter tops), two gears touching along the line of centres
mesh when one's tooth sits in the other's gap, which reduces to

```
a₂ = π − (N₁/N₂)·a₁          (external mesh, gear 2 to the right)
```

The ratio term is the gear ratio; the π is half a tooth, and vanishes when `N₂`
is even (so `lattice` and `reduction` drop it). An internal (ring) gear is the
same curve with `h` negated. In `spirograph` rolling makes the ring and planet
share the tooth phase outright: both are `S(m*q+48*t)`, which is why one loop
draws both.
