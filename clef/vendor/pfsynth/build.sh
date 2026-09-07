#!/bin/sh
# Build pfsynth to WebAssembly. See README.md.
#
# The output is checked in: the deploy job has no C toolchain. Rebuild here and
# commit the .wasm when core/ or pf_web.c changes.
set -e
cd "$(dirname "$0")"

: "${CC:=clang}"
: "${SYSROOT:=/usr}"

$CC --target=wasm32-wasi --sysroot="$SYSROOT" -O2 -DNDEBUG \
  -Wl,--no-entry -Wl,--export-dynamic -Wl,--strip-all \
  -Wl,--initial-memory=16777216 -Wl,--max-memory=268435456 \
  -nostartfiles \
  pf_web.c core/pf_string.c core/pf_board.c core/pf_reverb.c \
  -o pfsynth.wasm -lm

echo "pfsynth.wasm: $(wc -c < pfsynth.wasm) bytes, $(gzip -c pfsynth.wasm | wc -c) gzipped"
