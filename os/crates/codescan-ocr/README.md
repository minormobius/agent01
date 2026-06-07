# codescan-ocr

Pure-Rust OCR for **`photo.mino.mobi/codescan`** — extract text (e.g. activation
codes) from an image, compiled to WASM and run entirely in the browser.

Wraps [`ocrs`](https://github.com/robertknight/ocrs) (neural text detection +
recognition on the `rten` runtime — both pure Rust). Exposes a tiny wasm-bindgen
surface consumed by `photo/src/lib/codescan.js`:

- `init_engine(detection_model, recognition_model)` — load the two `.rten` models.
- `extract_text(image_bytes, allowed_chars)` → JSON `{ text, lines[] }`.
- `init_panic_hook()`, `is_ready()`.

## Rebuilding the WASM (artifacts are committed)

CI for `photo/` only runs `npm run build` — it does **not** compile Rust — so the
built `.wasm` + JS glue are committed into `photo/src/wasm/`. Regenerate them
after changing this crate:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.122   # must match the wasm-bindgen dep

cd os/crates/codescan-ocr
cargo build --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/codescan_ocr.wasm \
  --out-dir ../../../photo/src/wasm --target web --omit-default-module-path
```

Then commit the updated `photo/src/wasm/codescan_ocr*` files.

## Models

ocrs ships two models, fetched at runtime (not committed) through the photo
worker's same-origin `/api/model` proxy (S3 sends no CORS headers):

- `text-detection.rten` (~2.5 MB)
- `text-recognition.rten` (~9.7 MB)

## Validating the pipeline natively

The wasm threading path can't run in this sandbox, but the OCR logic can be
smoke-tested natively against the real models:

```bash
cargo run --release --example smoke -- <det.rten> <rec.rten> <image.png>
```
