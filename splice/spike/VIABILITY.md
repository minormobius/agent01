# HMMER → WebAssembly: viability spike

**Question:** is it viable to run HMMER (the hardest dependency in the
SpliceCraft port) in the browser via WebAssembly? This is the single
project-killing risk, because HMMER's hot loops are hand-written **SSE/VMX/NEON
intrinsics** that do not exist in WASM.

**Verdict: viable, with high confidence.** The real MSV SIMD kernel runs in
WebAssembly **bit-identically** to native x86 SSE2, at **~94% of native speed**,
and HMMER's own SIMD-correctness test suite **passes in this environment**.
Reproduce with `./build.sh`.

---

## What was measured

Environment: clang 18.1.3, gcc, node v22.22.2, x86-64 (SSE4.2/AVX2). No
emscripten or wasi-sdk required — the kernel is built freestanding and called
directly through node's `WebAssembly` API.

### 1. HMMER builds and its validation suite runs *here*

`autoconf && ./configure --enable-sse && make` produces `hmmsearch`,
`hmmscan`, `hmmbuild` cleanly. End-to-end sanity check (`hmmbuild` a globins
profile, `hmmsearch` it) returns correct hits with sane E-values.

HMMER ships unit tests that check each **SIMD filter against its generic
reference DP** implementation. All pass in this sandbox:

| Filter (SSE) | Test | Result |
|---|---|---|
| MSV (`impl_sse/msvfilter.c`) | `p7MSVFILTER_TESTDRIVE` | **PASS** |
| Viterbi (`impl_sse/vitfilter.c`) | `p7VITFILTER_TESTDRIVE` | **PASS** |
| Forward/Backward (`impl_sse/fwdback.c`) | `p7FWDBACK_TESTDRIVE` | **PASS** |
| Decoding (`impl_sse/decoding.c`) | `p7DECODING_TESTDRIVE` | **PASS** |
| Optimal accuracy (`impl_sse/optacc.c`) | `p7OPTACC_TESTDRIVE` | **PASS** |

So: **yes, we can run HMMER's validation suites here, and they pass.** This
gives us a correctness oracle to grade any port against.

### 2. The real SIMD kernel survives the trip to WASM — bit-exactly

`msv_kernel.c` is a faithful extract of `p7_MSVFilter`'s inner loop — the
hottest, most SIMD-dense code in HMMER. It preserves the *exact* intrinsic
sequence, including the awkward ones: saturating `u8` arithmetic
(`_mm_adds/subs_epu8`), striped byte-shifts (`_mm_slli/srli_si128`), lane
shuffles (`_mm_shuffle_epi32`, `_mm_shufflelo_epi16`), and `_mm_movemask_epi8`.

It compiles **two ways from one source**:

- **native:** real `<emmintrin.h>` SSE2 on x86-64.
- **wasm:** [SIMDe](https://github.com/simd-everywhere/simde) maps the same
  `_mm_*` intrinsics onto genuine WASM SIMD128 (`-msimd128`;
  `SIMDE_WASM_SIMD128_NATIVE` is active; the 1.9 KB module contains real
  `v128` opcodes — not a scalar fallback).

Both run an identical deterministic workload (256 pseudo-random
profiles/sequences spanning all vector counts) and emit a checksum over the MSV
scores:

```
native SSE2 checksum:  -425602619
wasm  SIMD checksum:  -425602619     ✅ bit-identical
```

Because MSV is integer (`uint8`) arithmetic, bit-identical is the *correct*
expectation, and we get it. SIMDe + WASM SIMD128 reproduces x86 saturating-byte
semantics exactly.

### 3. Performance is essentially native

2000 iterations of the workload:

| Build | ms/iter |
|---|---|
| native SSE2 (gcc -O3) | 2.730 |
| WASM SIMD128 (node/V8) | 2.889 |

**~6% slower than native** — because V8 lowers WASM SIMD straight to hardware
SSE. The browser uses the same engine. This is the number that matters for the
architecture decision below.

---

## What this does and doesn't prove

**Proven:**
- HMMER compiles and its SIMD correctness tests pass in a stock Linux toolchain.
- The representative, hardest SIMD kernel is **bit-exact** under WASM SIMD128.
- WASM-SIMD performance is within ~6% of native.
- SIMDe is a viable, drop-in bridge for HMMER's `_mm_*` intrinsics → no manual
  rewrite of the vector code is required.

**Not yet proven (Phase-2 follow-ups, low risk):**
- The Viterbi filter uses `int16` SIMD (also integer → expect bit-exact; SIMDe
  maps `epi16` ops; verify the same way as MSV).
- The Forward/Backward *filter* uses single-precision **float** SIMD. Float
  results can differ in the last ULP across rounding/FMA, but HMMER already
  treats this as a thresholded filter and its own `P7_FWDFILTER` test tolerates
  it; worth a wasm-vs-native diff to confirm the tolerance holds.
- The full browser build still needs the libc/file-I/O/allocator plumbing
  (emscripten or wasi-libc). That is **routine porting**, not a research risk —
  it's exactly what emscripten exists to do, and it's the part the rest of the
  ecosystem has done a thousand times.

---

## Architecture implication for the plan

The HMMER decision in the splice roadmap (was "Phase 6 — Emscripten-to-browser
vs host-server-side") now has data:

- **In-browser is viable.** Bit-exact + ~6% overhead means there is no
  *correctness or speed* reason to force HMMER server-side. A user could run
  `hmmscan` against a small/medium profile DB entirely client-side.
- **The remaining browser cost is download size + memory** (a profile database
  like Pfam is large), not compute. That's a UX/data-distribution question, not
  a feasibility one — and it's the same trade-off whether the search runs in
  WASM or on a server.

Net: the faithful, in-browser pro-tool tier is real. SIMDe + clang `-msimd128`
is the porting path; HMMER's own test suite is the acceptance gate.

## Reproduce

```bash
./build.sh        # clones hmmer+easel+simde, builds, runs unit tests + diff + bench
```
