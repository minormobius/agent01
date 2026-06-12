# Roll — an open, unique font generator

**Live at:** `rite.mino.mobi/font`
**Stack:** Rust → WebAssembly (engine), served as a sub-surface of the rite
Worker's ASSETS binding (no server, no secrets). Deployed by `deploy-rite.yml`,
which builds the wasm into `font/pkg/` before `wrangler deploy`.

Roll a brand-new typeface from a seed. Every roll is unique and deterministic;
the font you keep is **CC0 / public domain** — free to use, embed, modify and
sell, with no attribution. In most jurisdictions a typeface *design* isn't
copyrightable, and both this engine and its output are released into the public
domain, so the promise "roll until you like one, then it's yours" is real.

## How it works

```
seed string ──xmur3──► u32 ──mulberry32──► Params (the genome)
                                              │
                                              ▼
                              parametric glyph outlines (quadratic Béziers)
                                              │
                                              ▼
                       hand-rolled SFNT serializer ──► real .ttf bytes
                                              │
                                              ▼
                          browser FontFace ──► live specimen + download
```

- **Deterministic.** The same seed yields the same font forever (the PRNG is the
  same `xmur3 + mulberry32` pair borges uses). That's what makes `?s=<seed>` a
  permalink and what will let the evolutionary breeder reproduce any lineage from
  its seeds alone.
- **Real fonts.** `src/sfnt.rs` writes a genuine TrueType file (OS/2, cmap, glyf,
  head, hhea, hmtx, loca, maxp, name, post). `tests/valid.rs` round-trips every
  rolled font through `ttf-parser` to prove it parses, maps its cmap, and
  outlines — the deploy gate, since wasm/Cloudflare can't run in the sandbox.

## Files

| File | Role |
|------|------|
| `src/prng.rs` | `xmur3` + `mulberry32` — deterministic seed → numbers |
| `src/params.rs` | The design space: seed → parameter vector (the "genome") |
| `src/geom.rs` | Outline primitives (rects, ellipses, stroked arcs, winding) |
| `src/glyphs.rs` | Parametric letterforms (primitive builder: rects/quads/rings/straps) |
| `src/pen.rs` | Skeleton-stroke "pen model" — centerline swept by a broad nib (prototype: `O C o c e n`) |
| `src/sfnt.rs` | Dependency-free TrueType serializer → `.ttf` bytes |
| `src/lib.rs` | `roll(seed) → Uint8Array`, `describe(seed) → JSON` (wasm-bindgen) |
| `tests/valid.rs` | Validity gate (parses output with `ttf-parser`) |
| `index.html` + `app.js` | The roll-a-font page (served at `/font`) |
| `pkg/` | wasm-pack output (CI-built into here, gitignored) |

Hosting: this is a sub-surface of the rite Worker. `rite/worker.js` passes any
non-`/api/*` path to its ASSETS binding, so `/font/` serves `font/index.html`.
`rite/.assetsignore` keeps the Rust source and `target/` out of the upload.

## Build / test locally

```bash
cd rite/font
cargo test                                   # validity gate (native)
wasm-pack build . --release --target web --out-dir pkg
# serve the rite root so /font/pkg/... resolves like in production:
python3 -m http.server -d .. 8080            # then open localhost:8080/font/
```

## Status & roadmap

v1 ships the pipeline end-to-end: seed → valid, installable, downloadable `.ttf`,
covering the uppercase Latin alphabet, space, and `. , -`. The glyph shapes are
deliberately geometric/modular — the milestone is the *engine*, not final
letterform polish.

Next layers (the seed/permalink foundation is built for them):

1. **Lowercase, digits, accents, kerning** — more entries in `glyphs.rs`/`charset`.
2. **Evolutionary breeder** — show N candidates, keep favourites, crossover +
   mutate their parameter vectors into the next generation.
3. **Phylogeny view** — render the lineage tree of a breeding session (reusing
   `read/pendragon`'s SVG phylogeny + `phylo/`), plus the historical Vox-ATypI
   placement of where a given roll sits in type history.
4. **Pen-model letterforms** — *prototype landed* in `src/pen.rs`. Instead of
   bolting filled primitives together, a glyph is a centerline skeleton swept by
   a broad nib whose thickness modulates with stroke direction (`pen_angle` +
   `stem`/`thin` from the genome). Curves get real contrast and arches join
   their stems for free. Currently wired to `O C o c e n` so the difference
   shows next to the primitive letters; next is converting the rest of the
   alphabet, edged-pen corners/terminals, and serifs on curved stems.
