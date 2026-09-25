# Roll — a type foundry that never repeats

**Live at:** `rite.mino.mobi/font`
**Stack:** Rust → WebAssembly, run in a pool of module Web Workers; served as a
sub-surface of the rite Worker's ASSETS binding (no server, no secrets).
Deployed by `deploy-rite.yml`, which runs `cargo test` and builds the wasm into
`font/pkg/` before `wrangler deploy`.

Roll a brand-new typeface from a seed — real letterforms drawn by a pen,
spaced and kerned, in Latin (with Latin-1 and Extended-A), Greek and Cyrillic,
plus figures, punctuation, currency and a mathematical set: about 400
characters. Breed it, tune it, download it. Every font is **CC0 / public
domain**: use, embed, modify and sell it with no attribution.

## The pipeline

```
seed ─xmur3/mulberry32─► Style (the genome: archetype · blend · jitter · weight/width)
                              │   + spec overrides ("k=v;k=v" — sliders, permalinks)
                              ▼
                          Metrics (x-height, stems, pen, counters, tension)
                              │
      lower / upper / figures / punct / marks / scripts   ← each letter's skeleton
                              │   knots + travel directions → Hobby curves
                              ▼
          ink: superellipse-nib sweep → terminal cuts → union (i_overlay)
                              │
          refit: corners, straights, extrema → quadratic splines
                              │
          space: Tracy sidebearings from the stroke body; measured kerning,
                 clustered into classes → GPOS PairPos 2 (+ legacy kern)
                              ▼
          sfnt: glyf/loca (packed), cmap (shared glyphs for Α/А/A…), OS/2 with
                PANOSE from the genome, hhea/hmtx, name (CC0), post, GPOS, kern
```

- **Drawn, not traced.** A letter is a Metafont-style skeleton: knots with the
  direction the pen travels through them, joined by Hobby's curves. The pen is a
  superellipse nib — tilted, it's a broad-edged pen (humanist stress); level and
  flat, a pointed pen (Didone); round, a monoline. Stroke weight falls out of
  the geometry. In high-contrast styles `/` diagonals and N's verticals take
  the thin weight, as expansion-pen faces are drawn.
- **Terminals are consistent.** Every hook (`a c e f g j r s t y`, `C G J S`,
  `2 3 5 6 9 ?`) is an arc of the same superellipse family ending at the
  style's aperture angle, cut level / plumb / square, left as the nib's edge,
  rounded, balled, or finished with a beak serif.
- **Clean outlines.** Strokes are unioned into overlap-free contours, then
  refitted: breaks at corners and at the ends of straight runs, on-curve points
  at extrema, quadratic Béziers within 0.7 units. An `o` is ~24 points.
- **Spaced and kerned.** Sidebearings follow Tracy (straight / round /
  diagonal / open sides), measured from the stroke body so serifs overhang it,
  as they do in real serif faces. Kerning is measured: the white between each
  pair's edge profiles, over the core zone, against the mean of `nn/oo/no/on`,
  with a collision floor. Profiles are clustered into classes and written as
  GPOS class kerning, so accented letters get their own safe values.

## Files

| File | Role |
|------|------|
| `src/prng.rs` | `xmur3` + `mulberry32` — deterministic seed → numbers |
| `src/style.rs` | The genome: 23 continuous genes + discrete choices, 8 archetypes, `roll`, `apply_spec`, `to_spec` (round-trips exactly) |
| `src/curve.rs` | `V`, cubic Béziers, the Hobby path builder (`path(…).to(p, dir).line(p)`) |
| `src/ink.rs` | The pen (`Pen`), strokes and caps, union, and `refit` → TrueType contours |
| `src/build.rs` | `Metrics` and the drafting builder `B` (stems, bowls, arches, arcs, serifs, beaks, dots, balls) |
| `src/lower.rs`, `upper.rs`, `figures.rs`, `punct.rs` | The letters, figures, punctuation and symbols |
| `src/marks.rs` | Accented Latin (Latin-1, Extended-A, Romanian/Baltic comma forms) and composed letters (Æ Œ ß Ð Þ Ø Ł …) |
| `src/scripts.rs` | Greek, Cyrillic (lowercase as true small caps), maths; `ALIASES` share Latin glyphs through `cmap` |
| `src/space.rs` | Spacing, kerning measurement and class clustering |
| `src/font.rs` | Assembly: draw → union → space → kern → shear → refit → `sfnt` |
| `src/sfnt.rs` | Dependency-free TrueType serializer incl. GPOS and kern |
| `src/lib.rs` | The wasm API: `roll`, `roll_params`, `roll_subset`, `describe`, `archetype_spec`, `archetypes`, `genes`, `charset` |
| `tests/valid.rs` | The gate: every promised glyph outlines, aliases share glyphs, kerning is sane, specs round-trip, archetypes and gene extremes stay valid, monospace is monospaced |
| `examples/roll.rs`, `charset.rs` | Proofing: write fonts to disk (`seed@spec`, `N:seed` for archetype N) |
| `index.html`, `app.js`, `worker.js` | The page (served at `/font`) and its engine worker |
| `GENOME.md` | The sourced map of the design space |
| `pkg/` | wasm output (CI-built, gitignored) |

## The page

- **Roll** (or press `R`) — optionally inside an archetype chip; *wander* sets
  how far a roll may stray from it.
- **Offspring** — eight mutations of the current font; pick one and it becomes
  the parent. Children are named `seed.<litter><letter>`, so a lineage reads
  in its seeds.
- **Tune** — every gene, live. Drags rebuild only the glyphs on screen
  (`roll_subset`); the full face is rebuilt when the drag settles.
- **Specimen** — text, waterfall, every glyph, kerning on/off, scripts.
- **Links** — `?s=<seed>` alone is the seed's own roll; `&g=<spec>` carries a
  full genome (tuning, archetype rolls, offspring). A link is the font.

## Build / test locally

```bash
cd rite/font
cargo test --release                        # the gate (native)
cargo run --release --example roll -- /tmp/fonts sunrise 5:quartz "moth@stem=160;serif=slab"
cargo build --release --target wasm32-unknown-unknown --lib
wasm-bindgen target/wasm32-unknown-unknown/release/minofont.wasm --target web --out-dir pkg
python3 -m http.server -d .. 8080           # then open localhost:8080/font/
```

(CI uses `wasm-pack build font --target web --release --out-dir pkg`, which
produces the same `pkg/` plus a `wasm-opt` pass.)

## Where it goes next

- Composite glyphs for accented letters (the outlines are duplicated today).
- True italics (a cursive skeleton set, not just the oblique shear).
- A variable-font export across the weight axis.
- Ligatures (`fi fl ff`) via GSUB.
- The phylogeny view of a breeding session.

The old v1 engine (primitive glyphs, then a stamped broad nib, no union, no
curves, no kerning) was replaced wholesale in 2026-09; seeds from before then
roll different fonts now.
