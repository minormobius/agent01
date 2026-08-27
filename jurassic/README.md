# jurassic

**[jurassic.mino.mobi](https://jurassic.mino.mobi)** — a 165-million-year-old
forest you can walk around in, in the dark, by ear.

Nine ensiferans from the Daohugou beds of the Jiulongshan Formation sing across
180 metres of Middle Jurassic forest floor. Eight in pure tone around 5 kHz; one,
*Sigmaboilus peregrinus*, above 20 kHz — the oldest ultrasonic communication
known from any animal, and 113 million years before the first bat.

Move the listener and the mix changes, because the air is doing to these calls
what air does. You will not hear the ultrasonic one until you switch on the
detector, which is the point.

## What it is made of

A zero-dependency Rust crate compiled to raw `wasm32-unknown-unknown` — no
wasm-bindgen, no allocator on the audio thread — driven from an AudioWorklet.

- **`engine-rs/src/synth.rs`** synthesises stridulation from the instrument: a
  bandlimited tooth-strike train (the file) driving a two-pole resonator (the
  wing's mirror cell). The syllable length is not a parameter; it is
  `teeth / strike-rate`, because the note lasts as long as the traverse.
- **`engine-rs/src/air.rs`** is ISO 9613-1:1993 atmospheric absorption and
  ISO 9613-2:1996 foliage scattering, checked against the standard's own
  published table at four temperature–humidity conditions across eight octaves.
- **`engine-rs/src/lib.rs`** places the result around a listener who can walk.

The map's audible-radius circles and the mixer's distance gains come out of the
same model, so they cannot disagree.

## The honest part

Two carrier frequencies here are published results — *Archaboilus musicus* at
6.4 kHz (Gu, Engel & Ren 2012) and *Sigmaboilus peregrinus* above 20 kHz (Gu
et al. 2026). Everything else that makes a sound is modelled, and the page
labels it so. The four audiograms are worse than modelled: no ear fossilises,
so they are labelled `hypothesis` and are best read as positions in an argument
you can switch between and listen to.

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
