//! Pure-Rust OCR for `photo.mino.mobi/codescan`.
//!
//! Wraps the [`ocrs`] engine (text detection + recognition, built on the
//! `rten` tensor runtime — both pure Rust) and exposes a tiny WASM surface:
//!
//!   - [`init_engine`] — load the detection + recognition `.rten` models once.
//!   - [`extract_text`] — decode an image (PNG/JPEG/WebP/GIF/BMP) and return
//!     the recognised text as JSON `{ "text": "...", "lines": ["...", ...] }`.
//!
//! The heavy lifting (image decode, neural detect/recognise) all runs here in
//! Rust/WASM; the React page only fetches the models and renders the result.

use std::cell::RefCell;

use ocrs::{ImageSource, OcrEngine, OcrEngineParams};
use rten::Model;
use serde::Serialize;
use wasm_bindgen::prelude::*;

thread_local! {
    static ENGINE: RefCell<Option<OcrEngine>> = const { RefCell::new(None) };
}

/// Install a panic hook that forwards Rust panics to the browser console.
/// Call once, early, from JS — makes WASM panics legible instead of
/// surfacing as an opaque `unreachable`.
#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Load the OCR models. `detection_model` and `recognition_model` are the raw
/// bytes of ocrs's `.rten` model files (fetched + cached by the page).
///
/// Idempotent: calling again replaces the engine. Returns an error string to
/// JS if either model fails to parse.
#[wasm_bindgen]
pub fn init_engine(detection_model: Vec<u8>, recognition_model: Vec<u8>) -> Result<(), JsValue> {
    let detection = Model::load(detection_model)
        .map_err(|e| JsValue::from_str(&format!("failed to load detection model: {e}")))?;
    let recognition = Model::load(recognition_model)
        .map_err(|e| JsValue::from_str(&format!("failed to load recognition model: {e}")))?;

    let engine = OcrEngine::new(OcrEngineParams {
        detection_model: Some(detection),
        recognition_model: Some(recognition),
        ..Default::default()
    })
    .map_err(|e| JsValue::from_str(&format!("failed to build OCR engine: {e}")))?;

    ENGINE.with(|cell| *cell.borrow_mut() = Some(engine));
    Ok(())
}

/// True once [`init_engine`] has succeeded.
#[wasm_bindgen]
pub fn is_ready() -> bool {
    ENGINE.with(|cell| cell.borrow().is_some())
}

#[derive(Serialize)]
struct OcrResult {
    text: String,
    lines: Vec<String>,
}

/// Run OCR over an encoded image.
///
/// `image_bytes` is the raw contents of a PNG/JPEG/WebP/GIF/BMP file.
/// `allowed_chars`, if non-empty, restricts recognition to that character set
/// (e.g. `"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"` for a "code mode" that
/// sharpens activation-code reads). Pass an empty string for the full alphabet.
///
/// Returns JSON: `{ "text": "<all lines, newline-joined>", "lines": [ ... ] }`.
#[wasm_bindgen]
pub fn extract_text(image_bytes: &[u8], allowed_chars: &str) -> Result<String, JsValue> {
    let img = image::load_from_memory(image_bytes)
        .map_err(|e| JsValue::from_str(&format!("failed to decode image: {e}")))?
        .to_rgb8();
    let (width, height) = img.dimensions();

    let source = ImageSource::from_bytes(img.as_raw(), (width, height))
        .map_err(|e| JsValue::from_str(&format!("invalid image data: {e:?}")))?;

    ENGINE.with(|cell| {
        let borrow = cell.borrow();
        let engine = borrow
            .as_ref()
            .ok_or_else(|| JsValue::from_str("OCR engine not initialised — call init_engine first"))?;

        let input = engine
            .prepare_input(source)
            .map_err(|e| JsValue::from_str(&format!("prepare_input failed: {e}")))?;

        let word_rects = engine
            .detect_words(&input)
            .map_err(|e| JsValue::from_str(&format!("detect_words failed: {e}")))?;
        let line_rects = engine.find_text_lines(&input, &word_rects);
        let text_lines = engine
            .recognize_text(&input, &line_rects)
            .map_err(|e| JsValue::from_str(&format!("recognize_text failed: {e}")))?;

        let allow: Option<std::collections::HashSet<char>> = if allowed_chars.is_empty() {
            None
        } else {
            Some(allowed_chars.chars().collect())
        };

        let lines: Vec<String> = text_lines
            .iter()
            .flatten()
            .map(|line| {
                let s = line.to_string();
                match &allow {
                    Some(set) => s.chars().filter(|c| set.contains(c) || c.is_whitespace()).collect(),
                    None => s,
                }
            })
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let result = OcrResult {
            text: lines.join("\n"),
            lines,
        };
        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("failed to serialise result: {e}")))
    })
}
