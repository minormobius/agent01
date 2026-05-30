#!/usr/bin/env bash
# build.sh — primer3 -> WebAssembly viability spike (the Tm engine, oligotm).
#
# Mirror of the HMMER spike, opposite risk profile: oligotm is pure double math
# with the nearest-neighbor parameter tables compiled in (no file I/O), so it
# ports to WASM trivially. We do NOT vendor primer3 here (it is GPL-2.0); this
# script fetches oligotm.{c,h} from upstream, builds native + wasm, and checks
# the melting temperatures match.
#
# Because bare `clang --target=wasm32` ships no libc headers, shim/ provides
# minimal declarations for the handful of symbols oligotm touches; the actual
# implementations (log/pow/exp/log10/sqrt/strlen) are supplied as JS imports at
# instantiation (see run.mjs). wrap.c / run.mjs / shim live beside this script.
#
# Requires: gcc, clang (wasm32 target), node, curl.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-/tmp/primer3-spike}"; mkdir -p "$WORK"; cd "$WORK"

echo "== [1/4] fetch oligotm from primer3 (GPL-2.0, not vendored) =="
base="https://raw.githubusercontent.com/primer3-org/primer3/main/src"
for f in oligotm.c oligotm.h; do [ -f "$f" ] || curl -sL -o "$f" "$base/$f"; done
cp "$HERE/wrap.c" "$HERE/run.mjs" .
cp -r "$HERE/shim" .

echo "== [2/4] native build =="
gcc -O2 oligotm.c wrap.c -lm -o tm_native

echo "== [3/4] wasm build (libc decls via shim/, impls via JS imports) =="
clang --target=wasm32 -O2 -nostdlib -isystem shim \
  -Wl,--no-entry -Wl,--allow-undefined \
  -Wl,--export=tm_w -Wl,--export=tmbuf -DWASM_BUILD oligotm.c wrap.c -o tm.wasm
echo "   wasm: $(wc -c < tm.wasm) bytes"

echo "== [4/4] compare native vs wasm Tm =="
node run.mjs > wasm_tm.txt
ok=1
for p in GTAAAACGACGGCCAGT CAGGAAACAGCTATGAC ATGCGTACGTTAGCTAGCTAG GGGGCCCCGGGGCCCC; do
  n=$(./tm_native "$p"); w=$(grep -m1 "^$p " wasm_tm.txt | awk '{print $2}')
  [ "$n" = "$w" ] && s="OK" || { s="MISMATCH"; ok=0; }
  printf "   %-24s native=%-9s wasm=%-9s %s\n" "$p" "$n" "$w" "$s"
done
[ "$ok" = 1 ] && echo "== bit-identical (native == wasm) ==" || { echo "== MISMATCH =="; exit 1; }
