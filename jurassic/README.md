# jurassic

**[jurassic.mino.mobi](https://jurassic.mino.mobi)** — a 165-million-year-old
forest you can walk around in, in the dark, by ear.

The nine ensiferans of [Gu *et al.* 2026](https://doi.org/10.1073/pnas.2615107123)
sing across 180 metres of Middle Jurassic forest floor. Five call in low pure
tones below 7 kHz; three sing above 10 kHz; and *Sigmaboilus peregrinus* sings
at 22.5 kHz — the oldest ultrasonic communication known from any animal, about
110 million years before the first bat.

Move the listener and the mix changes, because the air is doing to these calls
what air does. You will not hear the ultrasonic one until you switch on the
detector — and on a 44.1 kHz output it is not merely inaudible but genuinely
absent, which is the point.

## What it is made of

A zero-dependency Rust crate compiled to raw `wasm32-unknown-unknown` — no
wasm-bindgen, no allocator on the audio thread — driven from an AudioWorklet.

- **`engine-rs/src/synth.rs`** synthesises each call from its own instrument: a
  bandlimited tooth-strike train driving a two-pole resonator. The file is a
  *shape*, taken tooth by tooth from the paper's Fig. 4B, so *Archaboilus
  polyneurus* warbles because its tooth spacing ripples, and *Allaboilus
  gigantus* clicks then bursts because its file is bipartite. The syllable
  length is not a parameter; it is the traverse. These wings are symmetric, so
  the call is radiated on the opening stroke as well as the closing one.
- **`engine-rs/src/air.rs`** is ISO 9613-1:1993 atmospheric absorption and
  ISO 9613-2:1996 foliage scattering, checked against the standard's own
  published table at four temperature–humidity conditions across eight octaves.
- **`engine-rs/src/lib.rs`** places the result around a listener who can walk.

The map's audible-radius circles and the mixer's distance gains come out of the
same model, so they cannot disagree.

## What is published and what is not

Carrier frequencies, quality factors and wing resonances are Gu *et al.*'s, from
their Figs. 3 and 4. Tooth counts and file profiles are read off those figures.
Source levels, chirp rhythm and abundance are ours — the paper's syllable rates
live in its SI Appendix, which we did not have. The four audiograms are weaker
still: no ear fossilises. Every number on the page is tagged with which of those
it is.

The propagation is not a guess, and there is a test that says so.

## Running it

Any static server over this directory. There is no build step for the site.

```bash
cd engine-rs && cargo test --release          # the acoustics
node test/soundscape.selftest.mjs             # the committed artifact, the roster, the ecology
```

Rebuild the engine after touching `engine-rs/`:

```bash
cd engine-rs
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/jurassic_engine.wasm ../engine/jurassic.wasm
```

`?plot=<n>` is a permalink: the same number grows the same forest anywhere.
