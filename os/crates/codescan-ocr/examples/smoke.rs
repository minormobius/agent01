// Native smoke test of the same ocrs pipeline used by the wasm lib.
// Usage: cargo run --example smoke -- <det.rten> <rec.rten> <image>
use ocrs::{ImageSource, OcrEngine, OcrEngineParams};
use rten::Model;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let det = Model::load(std::fs::read(&a[1]).unwrap()).unwrap();
    let rec = Model::load(std::fs::read(&a[2]).unwrap()).unwrap();
    let engine = OcrEngine::new(OcrEngineParams {
        detection_model: Some(det),
        recognition_model: Some(rec),
        ..Default::default()
    })
    .unwrap();
    let img = image::load_from_memory(&std::fs::read(&a[3]).unwrap()).unwrap().to_rgb8();
    let (w, h) = img.dimensions();
    let src = ImageSource::from_bytes(img.as_raw(), (w, h)).unwrap();
    let input = engine.prepare_input(src).unwrap();
    let words = engine.detect_words(&input).unwrap();
    let lines = engine.find_text_lines(&input, &words);
    let texts = engine.recognize_text(&input, &lines).unwrap();
    println!("--- {} text line(s) ---", texts.iter().flatten().count());
    for t in texts.iter().flatten() {
        println!("LINE: {}", t);
    }
}
