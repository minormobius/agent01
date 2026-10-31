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

# The classical guitar (core/pf_pluck + host/pf_guitar, vendored unmodified) behind our own
# host, pf_guitar_web.c. A separate module so the piano's stays byte-for-byte what it was.
$CC --target=wasm32-wasi --sysroot="$SYSROOT" -O2 -DNDEBUG \
  -Wl,--no-entry -Wl,--export-dynamic -Wl,--strip-all \
  -Wl,--initial-memory=16777216 -Wl,--max-memory=268435456 \
  -nostartfiles \
  pf_guitar_web.c host/pf_guitar.c core/pf_pluck.c \
  -o pfguitar.wasm -lm

echo "pfguitar.wasm: $(wc -c < pfguitar.wasm) bytes, $(gzip -c pfguitar.wasm | wc -c) gzipped"

# The endless stream (studio/cycle's generative music): the piano's chain and the guitar's strings
# behind one host, pf_stream.c, which takes notes while it renders. Ours; core/ and host/ unmodified.
$CC --target=wasm32-wasi --sysroot="$SYSROOT" -O2 -DNDEBUG \
  -Wl,--no-entry -Wl,--export-dynamic -Wl,--strip-all \
  -Wl,--initial-memory=16777216 -Wl,--max-memory=268435456 \
  -nostartfiles \
  pf_stream.c core/pf_string.c core/pf_board.c core/pf_reverb.c host/pf_guitar.c core/pf_pluck.c \
  -o ../../../studio/vendor/pfsynth/pfstream.wasm -lm

echo "pfstream.wasm: $(wc -c < ../../../studio/vendor/pfsynth/pfstream.wasm) bytes"
