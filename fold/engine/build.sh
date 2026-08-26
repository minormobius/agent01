#!/usr/bin/env bash
# Rebuild fold.wasm from the Rust engine, after proving the physics still holds.
#
# The wasm artefact is committed (like clock/morph.wasm) because the deploy is a
# plain static-asset push and there is no wasm-pack in CI. So this script is the
# only thing standing between a bad edit and a broken live site — run it, do not
# hand-build.
#
#   ./engine/build.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "== gradients + a folding run (native)"
cargo run --release --bin check

echo
echo "== wasm"
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
cargo build --release --target wasm32-unknown-unknown --lib
cp target/wasm32-unknown-unknown/release/fold_engine.wasm ../fold.wasm
ls -l ../fold.wasm

echo
echo "== ABI + physics selftest against the copied artefact"
cd .. && node fold.selftest.mjs
