#!/usr/bin/env bash
# Rebuild cad.wasm from the Rust engine, after proving the geometry still holds.
#
# The wasm artefact is committed (the fold/ precedent) because the deploy is a
# plain static-asset push and there is no wasm toolchain in CI. So this script
# is the only thing standing between a bad edit and a broken engine — run it,
# do not hand-build.
#
#   ./engine/build.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "== unit tests (expressions, sketches, invariants)"
cargo test --release --quiet

echo
echo "== native CLI (with the STEP reader)"
cargo build --release --features stepin --quiet

echo
echo "== wasm (raw C ABI, no wasm-bindgen, no STEP reader)"
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
cargo build --release --target wasm32-unknown-unknown --lib --quiet
cp target/wasm32-unknown-unknown/release/cad_engine.wasm ../cad.wasm
ls -l ../cad.wasm

echo
echo "== ABI + geometry selftest against the copied artefact"
cd .. && node cad.selftest.mjs
