# jurassic — jurassic.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs, then written properly. HAND-OWNED —
     the script will not overwrite it. Repo-wide rules live in ../CLAUDE.md;
     the index of all surfaces is ../docs/SURFACES.md. -->

A Middle Jurassic forest floor you can walk around in, in the dark, by ear. The
nine ensiferans of Gu et al. 2026 sing; you move a listener among them and the
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

- `engine-rs/` knows about resonators, files, impulse trains and air. It has
  never heard of an insect. Every voice is pushed in at runtime by `add_voice`
  plus `set_voice_file` and `set_voice_stroke`.
- `js/fauna.js` is the palaeontology: the nine taxa, their carrier frequencies,
  quality factors, tooth counts and file shapes, plus four audiograms. Every
  value carries a `from` tag and the page renders it beside the number.

Keep them apart. If you find yourself wanting a species constant in Rust, or an
absorption coefficient in JavaScript, something has gone wrong.

### The provenance tags, and why the selftest guards them

| tag | means |
|---|---|
| `published` | printed as a number in Gu et al. 2026 — carrier frequencies and Q from their Fig. 4D, wing resonances from their Fig. 3 |
| `digitised` | read off one of their figures rather than a printed number — tooth counts and inter-tooth spacing profiles, their Fig. 4B |
| `measured` | a measurement of a living animal (the human audiogram) |
| `modelled` | ours: source levels, chirp rhythm, abundance. Not results |
| `hypothesis` | a claim about something that does not fossilise — the three Jurassic ears |

The paper predicts syllable *rates* with a Gaussian-process model but reports
them in its SI Appendix, which we do not have. So the pitch, sharpness and file
of every call is theirs and the **rhythm is ours**, and the site says so.
`test/soundscape.selftest.mjs` asserts the tags stay honest — that every
carrier claims `published`, that exactly one species is ultrasonic and it is
*Sigmaboilus peregrinus*, that five call below 7 kHz and three above 10 kHz.
Those are the paper's own summary sentences, turned into assertions. Do not
loosen them to make a change pass; change the roster or the claim.

## How it works

Three layers, in the order sound travels:

1. **`engine-rs/src/synth.rs` — the instrument.** Elytral stridulation is a row
   of teeth (the file) dragged past a scraper, and the impacts drive a resonant
   membrane in the wing. So the synthesiser is literally those two objects: a
   **bandlimited impulse train** at the tooth-strike rate feeding a **two-pole
   resonator** at the mirror-cell frequency. The syllable length is not a
   parameter — it falls out as `teeth × mean spacing / strike rate`, because the
   note lasts exactly as long as the traverse.

   **The file is a shape, not a number.** Gu et al. publish the distance between
   every adjacent pair of teeth for all nine fossils (their Fig. 4B), and that
   is the result — their whole argument that these animals had already evolved
   elaborate files for an elaborate repertoire lives in those curves. So
   `FileShape` consumes them: `sweep`/`flare` for a rise toward the basal end,
   `ripple`/`rippleCycles` for a regular rise-and-fall, `pegs`/`pegRatio` for a
   bipartite file. The scraper crosses at constant velocity, so the strike rate
   goes as 1 / spacing and all three shapes reach the ear on their own:

   - *Bacharaboilus curvus* and *Gurenia caii* glide downward as the spacing
     widens at the basal end;
   - *Archaboilus polyneurus* warbles, because its spacing rises and falls three
     times along the file — which the authors read as deliberate frequency
     modulation, seen in all three specimens;
   - *Allaboilus gigantus* clicks then bursts, because its file is bipartite:
     ~8 pegs at 400–600 µm before ~35 teeth at ~100 µm.

   **Both strokes.** These wings are symmetric, and the paper reads that as the
   ancestral condition — sound radiated on the opening phase as well as the
   closing one. A syllable here is a hemisyllable pair, the file run down and
   back up. Set `opening` to 0 for a modern closing-only katydid.

   The impulse train is the Dirichlet kernel, not a spike. A literal spike train
   at a 22.5 kHz strike rate folds its whole spectrum back into the audible band
   at 48 kHz, and the "ultrasonic" singer would betray itself as a buzz. The
   selftest measures this: with the detector off, the audible band holds
   0.001 % of the carrier's energy.

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
  kinder than a merely damp one. At 22.5 kHz and 24 °C the ridge sits near 27 %;
  at 5 kHz it is near 9 %. The first version of the selftest asserted "dry air
  is worse" and was wrong; the test now pins the ridge instead.
- **The detector divides pitch, never physics.** With it on, a >14 kHz voice is
  *synthesised* an order of magnitude down, exactly like a division bat
  detector. Propagation still uses the true frequency, so the circles do not
  move. There is a test for that.
- **The default view shows no circles, on purpose.** Selected species is
  *S. peregrinus*, selected ear is human, and that radius is about a metre —
  smaller than a pixel. The caption under the map says so in words rather than
  drawing a circle at a size it does not have.
- **A carrier above the output's ceiling renders as SILENCE, not as a squashed
  tone.** `REPRODUCIBLE_FRACTION` is 0.49, so *S. peregrinus* at 22.5 kHz fits a
  48 kHz context and does not fit a 44.1 kHz one — where it goes completely
  quiet until the detector is engaged, exactly as a real recording of it would.
  An earlier version clamped the resonator to just under Nyquist instead, which
  put an audible 19.8 kHz buzz where a 22.5 kHz call belongs: a lie in precisely
  the direction this page exists to correct. There is a test.
- **The FEA wing resonance and the call are not the same number.** Both are in
  the roster (`feaHz` and `carrierHz`). Where they differ the file is driving
  the wing off its own resonance — most dramatically in *Allaboilus gigantus*,
  8.8 kHz wing, 4.93 kHz call. The dossier says so when the gap exceeds 12 %.
- **Q is the other half of the argument.** The paper puts mammalian directional
  resolution at Q 9–13 (`MAMMAL_LOCALISATION_Q`); a much sharper call is hard to
  place. Four of the nine are more than twice as sharp; two sit at or below the
  band. That is the "How hard each call is to locate" panel, and it does not
  depend on pitch at all.

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

Gu, J.-J., Montealegre-Z, F., Jonsson, T., Woodrow, C., Celiker, E., Islam,
M. N., Linde, J. B., Sarria-S, F. A., Shi, F., Song, H., Robert, D. & Ren, D.
(2026) *Reconstruction of an extinct soundscape reveals ultrasonic
communication in the Jurassic*, **PNAS 123(36):e2615107123**. Open access,
CC BY 4.0. Their carrier frequencies, quality factors, wing resonances, tooth
counts and file profiles are used here with attribution on the page itself.

Also: Gu, Engel & Ren (2012) *PNAS* **109**:3868, on *Archaboilus musicus* —
the precedent this assemblage extends.

This site is not a reproduction of the paper's figures and does not claim to be
one; it is an instrument built to think with, and it labels every number by
where it came from.
