//! Extract specific labeled cells from an atlas into individual PNGs.
//!
//! Usage:
//!   cargo run --bin extract_cells -- <atlas-path> <cell_w> <cell_h> \
//!                                     <dest-dir> <label> [<label> ...]
//!
//! Labels use the letter-column + number-row convention (`I8`, `J11`)
//! that the rest of the tooling already speaks. Each label is saved
//! to `<dest-dir>/<label>.png`.

use image::{GenericImageView, ImageFormat, RgbaImage};
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 6 {
        eprintln!(
            "usage: extract_cells <atlas-path> <cell_w> <cell_h> <dest-dir> <label> [<label>...]",
        );
        std::process::exit(1);
    }
    let src_path = PathBuf::from(&args[1]);
    let cell_w: u32 = args[2].parse().expect("cell_w must be an integer");
    let cell_h: u32 = args[3].parse().expect("cell_h must be an integer");
    let dest = PathBuf::from(&args[4]);
    std::fs::create_dir_all(&dest).expect("failed to create dest dir");

    let img = image::open(&src_path)
        .unwrap_or_else(|e| panic!("failed to open {}: {e}", src_path.display()));
    let (iw, ih) = img.dimensions();
    let rgba = img.to_rgba8();

    for label in &args[5..] {
        let (col, row) = parse_label(label).unwrap_or_else(|| {
            eprintln!("bad label: {}", label);
            std::process::exit(1);
        });
        let x = col * cell_w;
        let y = (row - 1) * cell_h;
        if x + cell_w > iw || y + cell_h > ih {
            eprintln!("label {} out of bounds (atlas is {}×{})", label, iw, ih);
            continue;
        }
        let tile = crop(&rgba, x, y, cell_w, cell_h);
        let out = dest.join(format!("{}.png", label));
        tile.save_with_format(&out, ImageFormat::Png)
            .unwrap_or_else(|e| panic!("failed to write {}: {e}", out.display()));
        println!("wrote {}", out.display());
    }
}

fn crop(src: &RgbaImage, x: u32, y: u32, w: u32, h: u32) -> RgbaImage {
    let mut out = RgbaImage::new(w, h);
    for dy in 0..h {
        for dx in 0..w {
            out.put_pixel(dx, dy, *src.get_pixel(x + dx, y + dy));
        }
    }
    out
}

/// Parse a cell label like "I8" or "AB12" into a `(col, row)` pair.
/// Column is spreadsheet-style (A=0, Z=25, AA=26). Row is 1-indexed.
fn parse_label(label: &str) -> Option<(u32, u32)> {
    let s = label.trim();
    let first_digit = s.find(|c: char| c.is_ascii_digit())?;
    if first_digit == 0 { return None; }
    let col_part = &s[..first_digit];
    let row_part = &s[first_digit..];
    let mut col: u32 = 0;
    for c in col_part.chars() {
        let u = c.to_ascii_uppercase();
        if !u.is_ascii_uppercase() { return None; }
        col = col * 26 + (u as u32 - b'A' as u32 + 1);
    }
    let row: u32 = row_part.parse().ok()?;
    Some((col - 1, row))
}
