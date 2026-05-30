# primer3 → WebAssembly: viability spike + unlock map

**Question (the original thesis):** reuse SpliceCraft's hard C libraries instead
of reinventing the science. We proved it on the hardest one (HMMER). This looks
at the *other* named library — **primer3**, the oligo-thermodynamics engine — to
answer: does it port, and what new functionality does it unlock?

**Verdict:** technically **trivial to port** (the opposite of HMMER) and
**bit-identical** native↔wasm on real primers. The one real catch is
**licensing**, not engineering. Reproduce with `./build.sh`.

---

## What the spike showed

`oligotm.c` (the melting-temperature engine):

- **No file I/O** (`0` fopen/fread). The nearest-neighbor parameter tables are
  compiled into the source as static arrays — Tm is fully self-contained.
- Pure `double` math; **no SIMD, no threads**. It touches exactly six libc
  symbols: `log, log10, exp, pow, sqrt` (`<math.h>`) and `strlen` (`<string.h>`).
- Compiles to `wasm32` as a **4.4 KB** module. Bare `clang --target=wasm32` has
  no libc headers, so `shim/` supplies minimal *declarations*; the six
  *implementations* are passed in as JS imports at instantiation (`run.mjs`).
  No emscripten/wasi-sdk needed.
- **Bit-identical** to the native build on real primers (SantaLucia
  nearest-neighbor, standard PCR salts):

  | primer | native Tm | wasm Tm |
  |---|---|---|
  | `GTAAAACGACGGCCAGT` (M13-F) | 54.6955 | 54.6955 ✅ |
  | `CAGGAAACAGCTATGAC` (M13-R) | 49.0953 | 49.0953 ✅ |
  | `ATGCGTACGTTAGCTAGCTAG` | 57.4606 | 57.4606 ✅ |
  | `GGGGCCCCGGGGCCCC` (all-GC) | 71.8770 | 71.8770 ✅ |

The hairpin/dimer sibling (`thal.c`) historically needed the `primer3_config/`
parameter files at runtime, but upstream now ships `thal_default_params.h`
(those params **compiled in**) — so the old file-I/O wrinkle is already gone.
`thal.c` is large (~100 KB) but plain C; expect a heavier but mechanically
identical port.

## The real catch: license

| Library | Port difficulty | License |
|---|---|---|
| HMMER (Easel) | hard (hand-written SIMD) | **BSD-3** (permissive) |
| **primer3 (oligotm/thal)** | **trivial** (pure double math) | **GPL-2.0** (copyleft) |

primer3 is GPL-2.0. Compiling it into splice would put that portion — and, under
GPL, arguably the distributed whole — under GPL-2, which collides with the
MIT-spirited framing of the rest. **This is the decision, not the code.** Three
honest options:

1. **Reimplement the formulas clean-room** — SantaLucia 1998 / 2004
   nearest-neighbor + salt corrections are published equations. ~150 lines of
   Rust in `splice/engine`, MIT, no copyleft. Loses primer3's exact edge-case
   fidelity but gains a clean license and zero new dependency. *Recommended for
   Tm.*
2. **Ship primer3 as a separate GPL WASM module**, loaded only by the parts that
   need `thal` (hairpin/dimer ΔG), and label that surface GPL. Keeps upstream
   fidelity for the hard thermodynamics; quarantines the copyleft.
3. **Skip it** — Tm-lite (Wallace rule / GC formula) is enough for a casual game.

## What it unlocks

Thermodynamics is the missing axis. With Tm + ΔG the toolset gains:

- **Realistic in-silico PCR** — today the engine matches primers by exact
  sequence only. Tm lets us flag mismatched primer pairs, predict annealing
  temperature, and reject primers that won't amplify.
- **A primer-design surface** (lab) — "design primers to amplify this region at
  Tm ≈ 60 °C," with GC%, length, and Tm readouts. primer3's day job.
- **A new puzzle family** (game) — primer-design levels: trim primers so both
  ends amplify, Tms match within ~2 °C, no hairpin/self-dimer (needs `thal`).
  A genuinely different mechanic from restriction cloning.
- **Directed-evolution fitness** (the Fluoddity bridge) — Tm and ΔG are ideal
  objective fitness functions: "evolve toward Tm 65 °C while staying in-frame,"
  or "minimize self-dimer ΔG." Real numbers to climb.
- **Enzyme-table enrichment** — show the duplex Tm of each restriction site.

## Recommendation

For **Tm**, take option 1: clean-room the SantaLucia equations in Rust
(`splice/engine`), MIT-licensed — this spike confirms the math is small and the
target values are well-defined (we now have native+wasm reference numbers to
test a Rust port against). Reserve a real primer3 (GPL, option 2) only if/when
we want `thal`-grade hairpin/dimer prediction. Either way, the "reuse C from
Rust→WASM" thesis is now validated on **both** ends of the difficulty spectrum:
the SIMD-hard (HMMER) and the math-trivial (primer3).

## Reproduce

```bash
./build.sh   # fetches oligotm from upstream, builds native+wasm, diffs Tm
```
