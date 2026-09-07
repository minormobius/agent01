# pfsynth, vendored

`core/` is **not our code**. It is [pfsynth](https://github.com/olaugh/pfsynth) by
John O'Laughlin — a physical-modelling piano — copied here **unmodified** and used
under the MIT licence in [`LICENSE`](LICENSE). The upstream commit this was taken
from is recorded in [`UPSTREAM-COMMIT`](UPSTREAM-COMMIT).

Ours in this directory: `pf_web.c` (the WebAssembly host) and `build.sh`.

## Why it is here

`clef/src/audio.js` synthesises from partials and an envelope. That is right for
proofreading — instant, cheap, pleasant enough not to fight you — and it is not a
piano. This is: a digital waveguide per string, two or three coupled and detuned
strings per note, a nonlinear felt hammer solved implicitly every sample, with
stiffness dispersion and decay both pitch-dependent and fitted to a real
instrument. It is used for **export only**; the reasoning is in `src/pfsynth.js`.

## What was taken, and what was left

Only three of the seven core translation units are here:

| Taken | Why |
|---|---|
| `pf_string` | the waveguide voice — the piano itself |
| `pf_board` | the stereo modal soundboard over the mix |
| `pf_reverb` | the room |

Left behind: `pf_partial`, `pf_attack`, `pf_bodyfit`, and everything under
upstream's `src/host/` and `experiments/`. Every core `.c` includes only its own
header, so these three are self-contained — nothing is stubbed out.

That is worth being explicit about, because of provenance. The defaults that
ship in `pf_string.c` are marked in their own comments as **fitted to a
Salamander Grand (Yamaha C5)** — Alexander Holm's sample set, CC BY 3.0.
Upstream's `pf_partial` is a *separate alternative voice* whose constants were
fitted to Pianoteq renders as a black-box measurement target; it is not a
dependency of the waveguide and it is not vendored here. So nothing in this
directory derives from a Pianoteq measurement.

## Rebuilding

```sh
./build.sh          # needs clang with the wasm32 backend, wasi-libc, wasm32 builtins
```

On Debian/Ubuntu: `apt install clang wasi-libc libclang-rt-18-dev-wasm32`.

The build is checked in (`pfsynth.wasm`, ~39 KB, ~22 KB gzipped) because the
deploy job has no C toolchain and no network to fetch one. `clef/test/` verifies
that the committed binary still loads and still renders — a stale or corrupt
`.wasm` fails there rather than in someone's browser.

## How it was verified

Both checks are reproducible from this directory; neither is a listening test,
because there is no audio in the sandbox this was built in.

1. **wasm vs native, bit-exact.** The same `pf_web.c` compiled natively and to
   wasm, same five-note input: **163840 / 163840 samples identical**, max
   difference exactly 0.
2. **Our host vs upstream's, to float32 rounding.** `pf_web.c` reproduces
   `src/host/engine.c`'s `render_chunk()` signal chain — voices summed mono,
   stereo soundboard, room reverb, master gain 110, `tanh` — and was A/B'd
   against upstream's real `pf_engine` driving the same notes: identical RMS,
   **max sample difference 2.4e-7**, error **138.7 dB below signal**. Not
   bit-identical because summation order differs; 139 dB down is below the
   16-bit noise floor by 43 dB.

3. **End to end in a real browser**, served over HTTP with the real MIME types:
   the module loads, renders, and produces finite audio with no page errors.

## Measured cost, and the two numbers that set it

The 487-note rondo (51 s of music) renders in **17.7 s** on desktop Chromium —
**3.1x** real time. A three-note chord manages 31x. Cost tracks how many strings
are ringing, not how many notes there are.

**wasm is not the cost.** Driving the identical `pf_web.c` natively gives 2.16x
where the browser gave 2.16x — the same number. Whatever is slow here is slow in
C too, so there is no point looking for it in the JavaScript.

**The cost is ringing tails.** The rondo's median note is 0.14 s, but a struck
string goes on sounding long after its damper falls, so the piece holds ~38
voices at once and each is a per-sample Newton solve. `RETIRE_LEVEL` decides
when a decayed voice stops being computed, and it is the single biggest lever:

| RETIRE_LEVEL | real time | tail discarded, peak |
|---|---|---|
| 1e-7 (upstream's) | 1.31x | — |
| 1e-5 | 2.16x | -144 dB |
| **1e-4 (ours)** | **3.23x** | **-115 dB** |
| 1e-3 | 6.90x | -81 dB |

Inside the overlap every setting matches the 1e-7 reference to within float32
rounding (-140 dB, zero peak error). The only thing the threshold changes is how
much of the final decay gets rendered at all. We stop at 1e-4 because we write
16-bit WAV: -96 dB is the floor of what our own output can represent, so a tail
peaking at -115 dB *cannot be encoded*, let alone heard. 1e-3 is faster again and
discards a tail at -81 dB, which is representable — likely inaudible, but that is
a weaker claim and this one does not need hedging.

Master gain is left at upstream's **110**. At that setting the rondo puts 0.55%
of samples past 0.9 and 0.01% past 0.99 — the soft `tanh` knee doing the job its
own comment describes, not damage. Dropping to 45 clears the knee entirely
(peak 0.977) at half the level. His number is kept rather than a new one
invented, because sounding like his synth is the entire reason for using it;
`render()` takes a `gain` option for anyone who disagrees.

The deliberate divergence from upstream's host: it applies note events at block
boundaries (it is real-time, driven by a sequencer), while `pf_web.c` splits the
block at each onset so strikes land on the exact sample. Offline there is no
reason to accept up to 93 ms of onset jitter.
