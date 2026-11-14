# CHIMERA, borrowed

`chimera.wasm` is [CHIMERA](https://github.com/jamesondh/chimera-vocal-synth) by Jameson Hodge
(MIT, `LICENSE` here): a voice made by simulating an airway (lungs, vocal folds, a branched vocal
tract, lips, nose), not from samples or a neural model. It is upstream's own `chimera-wasm` crate,
built unchanged from the commit in `UPSTREAM`; nothing in it is ours. `cmudict.txt.gz` is the
pronouncing dictionary upstream ships (BSD-2-Clause, `CMUDICT-LICENSE.txt`), in the format its G2P reads.

The host is `../../lib/chimera-core.js`. It renders a sentence bit-for-bit as upstream's
`chimera render text` does (checked against the CLI: max difference 0).

To update: clone upstream at a new commit, run the `build` line in `UPSTREAM`, copy the `.wasm`
here, and record the new commit and sha256 in `UPSTREAM`. The selftest fails if the file and the
recorded hash disagree. Check `chimera_layout_version()` still matches `LAYOUT_VERSION` in the host.
