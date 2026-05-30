#!/usr/bin/env bash
# build.sh — reproduce the HMMER → WASM viability spike from scratch.
#
# Answers one question: can HMMER's hand-written SSE-intrinsic SIMD core run
# correctly (and fast enough) in WebAssembly? It does this three ways:
#   1. builds HMMER natively and runs HMMER's OWN SIMD-vs-reference unit tests
#   2. compiles the real MSV kernel to WASM (SSE intrinsics -> SIMDe -> simd128)
#      and checks the result is BIT-IDENTICAL to the native SSE2 build
#   3. benchmarks WASM-SIMD vs native SSE2
#
# Requirements: gcc, clang (>=16, with wasm32 target), make, autoconf, git, node.
# No emscripten / wasi-sdk needed — the kernel is built freestanding and called
# directly through node's WebAssembly API.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-/tmp/splice-spike}"
mkdir -p "$WORK"; cd "$WORK"

echo "== [1/5] fetch sources =="
[ -d hmmer ] || git clone --depth 1 https://github.com/EddyRivasLab/hmmer
[ -d hmmer/easel/.git ] || { rm -rf hmmer/easel; git clone --depth 1 https://github.com/EddyRivasLab/easel hmmer/easel; }
[ -d simde ] || git clone --depth 1 https://github.com/simd-everywhere/simde

echo "== [2/5] build HMMER natively =="
( cd hmmer && [ -f configure ] || autoconf; [ -f easel/configure ] || ( cd easel && autoconf )
  ./configure --enable-sse >/dev/null && make -j"$(nproc)" >/dev/null )
echo "   built: $(ls hmmer/src/hmmsearch hmmer/src/hmmscan hmmer/src/hmmbuild)"

echo "== [3/5] run HMMER's own SIMD-vs-reference unit tests =="
cd hmmer
for spec in \
  "p7MSVFILTER_TESTDRIVE src/impl_sse/msvfilter.c MSV" \
  "p7VITFILTER_TESTDRIVE src/impl_sse/vitfilter.c Viterbi" \
  "p7FWDBACK_TESTDRIVE   src/impl_sse/fwdback.c   Fwd/Back" \
  "p7DECODING_TESTDRIVE  src/impl_sse/decoding.c  Decoding" \
  "p7OPTACC_TESTDRIVE    src/impl_sse/optacc.c    OptAcc"; do
  set -- $spec
  gcc -O2 -msse2 -std=gnu99 -D"$1" -I. -Isrc -Ieasel "$2" \
      src/libhmmer.a easel/libeasel.a -lm -o "$WORK/ut" 2>/dev/null
  if "$WORK/ut" >/dev/null 2>&1; then echo "   PASS  $3 (SIMD == reference DP)"; else echo "   FAIL  $3"; exit 1; fi
done
cd "$WORK"

echo "== [4/5] build the MSV kernel two ways and compare =="
gcc -O3 -msse2 "$HERE/msv_kernel.c" -o msv_native
clang --target=wasm32 -msimd128 -O3 -nostdlib -Wl,--no-entry \
  -Wl,--export=compute -Wl,--allow-undefined \
  -DWASM_BUILD -DSIMDE_FLOAT16_API=1 -I "$WORK/simde" \
  "$HERE/msv_kernel.c" -o msv.wasm
NAT="$(./msv_native)"
WAS="$(node "$HERE/run.mjs" "$WORK/msv.wasm")"
echo "   native SSE2 checksum: $NAT"
echo "   wasm  SIMD checksum: $WAS"
[ "$NAT" = "$WAS" ] && echo "   ✅ BIT-IDENTICAL" || { echo "   ❌ MISMATCH"; exit 1; }

echo "== [5/5] benchmark =="
./msv_native 2000
node "$HERE/bench.mjs" "$WORK/msv.wasm" 2000

echo "== done =="
