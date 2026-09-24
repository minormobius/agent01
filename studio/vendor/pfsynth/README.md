# pfsynth, borrowed from clef

`pfsynth.wasm` is **byte-identical** to [`clef/vendor/pfsynth/pfsynth.wasm`](../../../clef/vendor/pfsynth/)
— John O'Laughlin's [pfsynth](https://github.com/olaugh/pfsynth) (MIT, `LICENSE`
here), a physical-modelling piano, with clef's WebAssembly host. The source, the
build and the provenance notes live in clef; read its README before touching it.

A static site cannot import across directories, so the studio keeps a copy.
`test/studio.selftest.mjs` fails if the two drift apart. To update: rebuild in
clef, then copy the `.wasm` here.
