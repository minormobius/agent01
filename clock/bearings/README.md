# bearings — the self-assembling wire

`g.mino.mobi/bearings/` · part of the [`g`](../../g/CLAUDE.md) gallery.

A dish of polydisperse steel bearings, loose in mineral oil, with a live pin at
the centre and a grounded cup around the rim. Nothing connects the two. Turn the
supply up and the bearings roll themselves into a wire: chains grow out from the
pin along the field lines, branch, reach the cup, and the circuit closes.

## What is actually simulated

The solver ([`solver/src/sim.rs`](solver/src/sim.rs)) carries the physics; the
module docs there are the long version. In short, every frame:

1. **The pile is a resistor network.** Bearings are conductors, so contacts (and
   near-contacts, through a thinning oil film) are conductances. The pin is a
   node behind a source conductance, the cup wall is ground, and Kirchhoff's
   equations are solved with Jacobi-preconditioned CG, warm-started from the
   previous frame ([`network.rs`](solver/src/network.rs)).
2. **Charges relax** toward what each bearing's node potential implies, at the
   RC rate its own conductance sets — instant when welded into a chain, seconds
   when floating free in oil, which is why a bearing can carry charge across the
   cell.
3. **Forces**: contact (spring–dashpot + Coulomb friction + squeeze film),
   `q·E`, dipole–dipole chaining, charge–dipole attraction to a charged chain
   tip, dielectrophoresis toward the pin, and image attraction at both
   electrodes. Stokes drag is integrated exactly, because in oil it is by far
   the stiffest term.
4. **Rolling** is no-slip on the dish floor, integrated as a quaternion, so the
   figure on a bearing's surface turns by exactly as far as it travelled.

Two mechanisms compete, and both are on the panel:

* **chaining** (induced polarisation) builds the wire;
* **contact charging** throws bearings off the pin before the next one can
  attach. Turn it up and the cell stops building and starts dancing.

Once the wire closes, the supply sags against its own source resistance, the
field drops, and the assembly goes quiet — the same thing a current-limited
bench supply does.

## Files

| | |
|---|---|
| `index.html` | the page: panel, HUD, current trace, input, frame loop |
| `render.js` | raw-WebGPU renderer, all WGSL inline — cell, wires, bearings, glow |
| `solver.js` | wasm glue: typed-array views over linear memory, display units |
| `bearings.wasm` | **build product, committed** — see below |
| `bearings.selftest.mjs` | headless check of the committed wasm (preflight runs it) |
| `solver/` | the Rust crate: `sim.rs`, `network.rs`, `grid.rs`, `rng.rs` |

## Working on it

```bash
# the physics, natively — 17 tests, no network, no wasm
cd clock/bearings/solver && cargo test --release

# watch a run headless; this is how the constants were calibrated
cargo run --release --example probe -- 560 45 1.0 0.06 1.0 12
cargo run --release --example snapshot -- 560 30 0.75 0.06 1.0 > cell.csv

# rebuild the committed wasm (CI does this too, see below)
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/bearings_solver.wasm ../bearings.wasm

# then the artefact check
node clock/bearings/bearings.selftest.mjs
```

`bearings.wasm` is a committed build product, which means it can go stale
against `solver/src/**`. Two things guard that: `.github/workflows/build-bearings-solver.yml`
rebuilds and commits it on every push that touches the Rust, and
`bearings.selftest.mjs` exercises the *committed* binary rather than the source,
so a stale or broken artefact fails preflight.

## Numbers, and where they came from

The solver works in reduced units — cup radius 1, oil density 1,
`1/(4πε₀) = 1` — and the constants were calibrated against a real cell: a 50 mm
cup, 1–2 mm bearings, mineral oil at ~30 cSt, a supply of tens of kV. Two of
them matter more than the rest:

* the oil's dielectric relaxation time (`TAU_OIL`, ~2 s) — get it wrong and
  every bearing the pin ever touched stays charged forever, and the cell slowly
  empties itself against the cup wall;
* the near-contact corrections (`NEAR_GAIN`, `NEAR_SCREEN`) — point charges and
  point dipoles are simply the wrong model for two spheres about to touch, and
  without the corrections a chain of same-potential bearings shoves itself
  apart.

`DISPLAY` in `solver.js` holds the reduced → kV/µA conversions used by the HUD;
they are presentation only and touch nothing in the solver.

## Known limits

* **WebGPU only.** No WebGL fallback; the page says so and stops.
* Rendering is verified by a headless Chromium run (no validation errors across
  every control, 60 fps at 520 bearings), but **not** pixel-by-pixel — WebGPU
  canvases cannot be screenshotted or read back under this sandbox's SwiftShader.
* The cell is a top view of a shallow dish: the dynamics are 2-D, the applied
  field is the 2-D coaxial solution, while bearing-to-bearing interaction uses
  the 3-D point charge/dipole forms because the bearings really are spheres.
  That mix is deliberate and documented in `sim.rs`.
