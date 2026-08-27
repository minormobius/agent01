# jurassic — jurassic.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs, then written properly. HAND-OWNED —
     the script will not overwrite it. Repo-wide rules live in ../CLAUDE.md;
     the index of all surfaces is ../docs/SURFACES.md. -->

A Middle Jurassic forest floor you can walk around in, in the dark, by ear. Nine
ensiferans from the Daohugou beds sing; you move a listener among them and the
sound changes because the physics says it should.

## Facts

| | |
|---|---|
| Surface | `jurassic` |
| Dir | `jurassic/` |
| Endpoint | `jurassic.mino.mobi` |
| Type | frontend (pure static; all computation client-side) |
| Owning branch | `claude/jurassic-forest-sounds-iym7ya` |
| Deploy | [`.github/workflows/deploy-jurassic.yml`](../.github/workflows/deploy-jurassic.yml) |
| Engine build | [`.github/workflows/build-jurassic-wasm.yml`](../.github/workflows/build-jurassic-wasm.yml) |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) →
`surfaces[]` where `surface == "jurassic"`.

## The one thing to understand before changing anything

**The Rust kernel contains no palaeontology, and `js/fauna.js` contains no
physics.** That line is the design.

- `engine-rs/` knows about resonators, impulse trains and air. It has never
  heard of an insect. Every voice is pushed in at runtime by `add_voice`.
- `js/fauna.js` is the arguable half: nine taxa, their file morphology, four
  audiograms. Every value carries a `from` tag — `measured`, `modelled` or
  `hypothesis` — and the page renders that tag beside the number.

Keep them apart. If you find yourself wanting a species constant in Rust, or an
absorption coefficient in JavaScript, something has gone wrong.

**Only two carrier frequencies on this site are published results.**
*Archaboilus musicus* at 6.4 kHz (Gu, Engel & Ren 2012, PNAS 109:3868) and
*Sigmaboilus peregrinus* above 20 kHz (Gu et al. 2026, PNAS
123(36):e2615107123). The 2026 paper was paywalled when this was built, so its
per-species table has **not** been transcribed and the roster here is the
described singing ensiferans of the Daohugou beds rather than a copy of its
particular nine. Everything else that makes a sound is ours and is tagged
`modelled`. Do not quietly promote a modelled value to `measured` — the
selftest asserts that exactly two claim to be, and that each cites a paper.

## How it works

Three layers, in the order sound travels:

1. **`engine-rs/src/synth.rs` — the instrument.** Elytral stridulation is a row
   of teeth (the file) dragged past a scraper, and the impacts drive a resonant
   membrane in the wing. So the synthesiser is literally those two objects: a
   **bandlimited impulse train** at the tooth-strike rate feeding a **two-pole
   resonator** at the mirror-cell frequency. Coincide them with an even file and
   you get the pure tone that makes these fossils identifiable as musical;
   detune or scatter and the same code rasps. The syllable length is not a
   parameter — it falls out as `teeth / toothRate`, because the note lasts
   exactly as long as the traverse.

   The impulse train is the Dirichlet kernel, not a spike. A literal spike train
   at a 22 kHz strike rate folds its whole spectrum back into the audible band
   at 48 kHz, and the "ultrasonic" singer would betray itself as a buzz. The
   selftest measures this: with the detector off, the audible band holds
   0.000 % of the carrier's energy.

2. **`engine-rs/src/air.rs` — the journey.** ISO 9613-1:1993 atmospheric
   absorption (classical plus O₂/N₂ vibrational relaxation), ISO 9613-2:1996
   dense-foliage scattering, and spherical spreading. `audible_radius_m`
   inverts that by bisection, which is what the map's circles are.

3. **`engine-rs/src/lib.rs` — the room.** A fixed array of voices, equal-power
   panning plus an interaural delay, gains ramped across each block so walking
   does not zip, and a `tanh` knee on the bus.

`js/engine.js` runs **two instances of the same module**: one in the
AudioWorklet that renders, one on the main thread that answers the map's
questions. Every mutation goes to both from one place. Do not let the map do its
own propagation arithmetic — a second implementation is a second thing that can
be wrong.

## Things that will surprise you

- **Absorption is not monotone in humidity.** Water vapour catalyses the
  relaxation of the air's own oxygen and nitrogen, so each frequency has a
  *worst* humidity in the middle of the range and a saturated night is often
  kinder than a merely damp one. At 21 kHz and 24 °C the ridge sits near 26 %;
  at 6.4 kHz it is near 11 %. The first version of the selftest asserted "dry
  air is worse" and was wrong; the test now pins the ridge instead.
- **The detector divides pitch, never physics.** With it on, a >14 kHz voice is
  *synthesised* an order of magnitude down, exactly like a division bat
  detector. Propagation still uses the true frequency, so the circles do not
  move. There is a test for that.
- **The default view shows no circles, on purpose.** Selected species is
  *S. peregrinus*, selected ear is human, and that radius is about a metre —
  smaller than a pixel. The caption under the map says so in words rather than
  drawing a circle at a size it does not have.
- **Nyquist is a real ceiling.** At a 44.1 kHz AudioContext the roster just
  fits; the status line says what the output can carry and what it is losing.

## Working on it

```bash
cd jurassic/engine-rs && cargo test --release     # the acoustics: ISO table, A. musicus, aliasing
node jurassic/test/soundscape.selftest.mjs        # the COMMITTED artifact + the roster + the ecology
node scripts/preflight.mjs                        # runs the selftest as part of the sweep
```

After **any** change under `engine-rs/`, rebuild and commit the artifact:

```bash
cd jurassic/engine-rs
cargo test --release
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/jurassic_engine.wasm ../engine/jurassic.wasm
node ../test/soundscape.selftest.mjs
```

CI does this too (`build-jurassic-wasm.yml`), but the site has **no JS
fallback** — the module *is* the audio — so a stale `engine/jurassic.wasm` is a
broken site, not a degraded one. The selftest gates the artifact rather than the
source precisely to catch that.

To change the acoustics of a species, edit `js/fauna.js` and nothing else. To
change how stridulation works, edit `engine-rs/src/synth.rs` and rebuild.

## Deploying

Pushes to `claude/jurassic-forest-sounds-iym7ya` that touch `jurassic/**`
trigger [`deploy-jurassic.yml`](../.github/workflows/deploy-jurassic.yml).
**`main` does not deploy this or anything else** — see ../CLAUDE.md. The sandbox
cannot reach Cloudflare, so push to the branch rather than running `wrangler
deploy` locally.

`jurassic.mino.mobi` did not exist before this surface. The first deploy
provisions the custom domain and its DNS record from the `routes[]` entry in
`wrangler.jsonc`; expect what `plant/` recorded for its own first run — no DNS
for ~10 s, then Cloudflare error 1104 for ~60 s while the certificate issues.
That is not a failure. **A run that does not bind `jurassic.mino.mobi (custom
domain)` in its log has not shipped, whatever colour it went**
([`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §4).

## Attribution

Built after Gu et al. 2026, *Reconstruction of an extinct soundscape reveals
ultrasonic communication in the Jurassic*, PNAS 123(36):e2615107123. This site
is not that paper's data or a reproduction of its figures — it is an instrument
built to think with, and it says so on its own front page.
