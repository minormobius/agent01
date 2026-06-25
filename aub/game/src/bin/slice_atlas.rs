//! Atlas slicer.
//!
//! Loads a PNG and cuts it into uniform tiles, saving each tile as its
//! own PNG in the same directory as the source, named with the
//! letter-column / number-row convention (`A1.png`, `B3.png`, ...).
//!
//! Usage:
//!   cargo run --bin slice_atlas -- <path-to-png> <cell_w> <cell_h> \
//!                                   [RRGGBB] [tolerance] [trim]
//!
//! Optional args in order:
//!   4. RRGGBB      hex color to key out — every pixel whose RGB
//!                  matches (within `tolerance`) becomes transparent.
//!   5. tolerance   integer per-channel tolerance for the color key.
//!                  `0` = exact match (default). Raise slightly for
//!                  sheets with anti-aliased edges.
//!   6. trim        positive integer: drop this many pixels from the
//!                  right and bottom of each sliced tile before
//!                  saving. Handy when a cell boundary picks up a
//!                  1-px slice of the next sprite's edge.
//!
//! Tiles whose cell rectangle extends past the right or bottom edge
//! of the source are skipped.

use image::{GenericImageView, ImageFormat, Rgba, RgbaImage};
use std::path::{Path, PathBuf};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("usage: slice_atlas <path-to-png> <cell_w> <cell_h> [RRGGBB] [tolerance]");
        std::process::exit(1);
    }
    let src_path = PathBuf::from(&args[1]);
    let cell_w: u32 = args[2].parse().expect("cell_w must be an integer");
    let cell_h: u32 = args[3].parse().expect("cell_h must be an integer");
    if cell_w == 0 || cell_h == 0 {
        eprintln!("cell_w and cell_h must be positive");
        std::process::exit(1);
    }
    let color_key: Option<[u8; 3]> = args.get(4).map(|s| parse_hex(s).unwrap_or_else(|| {
        eprintln!("color key must be 6 hex digits (RRGGBB), got {:?}", s);
        std::process::exit(1);
    }));
    let tolerance: u32 = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(0);
    let trim: u32 = args.get(6).and_then(|s| s.parse().ok()).unwrap_or(0);

    let img = image::open(&src_path)
        .unwrap_or_else(|e| panic!("failed to open {}: {e}", src_path.display()));
    let (iw, ih) = img.dimensions();
    let cols = iw / cell_w;
    let rows = ih / cell_h;
    println!(
        "source: {} ({}×{}) — slicing into {}×{} cells of {}×{}",
        src_path.display(), iw, ih, cols, rows, cell_w, cell_h,
    );
    if let Some(k) = color_key {
        println!("  color key: #{:02X}{:02X}{:02X}  (tolerance={})",
                 k[0], k[1], k[2], tolerance);
    }
    if trim > 0 {
        println!("  trimming {} px off right and bottom of each tile", trim);
    }
    if iw % cell_w != 0 || ih % cell_h != 0 {
        println!(
            "  note: trailing {}×{} strip on the right/bottom is skipped",
            iw - cols * cell_w, ih - rows * cell_h,
        );
    }

    let parent = src_path.parent().unwrap_or_else(|| Path::new("."));
    let rgba = img.to_rgba8();
    let mut written = 0;
    let mut keyed = 0;

    for row in 0..rows {
        for col in 0..cols {
            let x = col * cell_w;
            let y = row * cell_h;
            // Shrink the crop window by `trim` on the right/bottom so
            // the written tile excludes any 1-px strip of neighbour-
            // cell content. Guard against trim >= cell dimensions.
            let tw = cell_w.saturating_sub(trim).max(1);
            let th = cell_h.saturating_sub(trim).max(1);
            let mut tile = crop(&rgba, x, y, tw, th);
            if let Some(key) = color_key {
                keyed += apply_color_key(&mut tile, key, tolerance);
            }
            let name = format!("{}{}.png", col_label(col as usize), row + 1);
            let out = parent.join(&name);
            tile.save_with_format(&out, ImageFormat::Png)
                .unwrap_or_else(|e| panic!("failed to write {}: {e}", out.display()));
            written += 1;
        }
    }
    println!("wrote {} tiles to {}", written, parent.display());
    if color_key.is_some() {
        println!("  keyed {} pixel(s) to alpha=0", keyed);
    }
}

/// Copy a cell-sized window out of `src` as a new RgbaImage.
fn crop(src: &RgbaImage, x: u32, y: u32, w: u32, h: u32) -> RgbaImage {
    let mut out = RgbaImage::new(w, h);
    for dy in 0..h {
        for dx in 0..w {
            out.put_pixel(dx, dy, *src.get_pixel(x + dx, y + dy));
        }
    }
    out
}

/// Zero the alpha on every pixel whose RGB matches `key` within
/// `tolerance` (Chebyshev / per-channel). Returns the number of
/// pixels modified.
fn apply_color_key(img: &mut RgbaImage, key: [u8; 3], tolerance: u32) -> u64 {
    let mut modified = 0u64;
    for p in img.pixels_mut() {
        let Rgba([r, g, b, a]) = *p;
        if a == 0 { continue; }
        let dr = r.abs_diff(key[0]) as u32;
        let dg = g.abs_diff(key[1]) as u32;
        let db = b.abs_diff(key[2]) as u32;
        if dr <= tolerance && dg <= tolerance && db <= tolerance {
            *p = Rgba([r, g, b, 0]);
            modified += 1;
        }
    }
    modified
}

/// Parse "FF00FF" or "ff00ff" into `[0xFF, 0x00, 0xFF]`.
fn parse_hex(s: &str) -> Option<[u8; 3]> {
    let s = s.trim_start_matches('#');
    if s.len() != 6 { return None; }
    let r = u8::from_str_radix(&s[0..2], 16).ok()?;
    let g = u8::from_str_radix(&s[2..4], 16).ok()?;
    let b = u8::from_str_radix(&s[4..6], 16).ok()?;
    Some([r, g, b])
}

/// Spreadsheet-style column label: 0→A, 25→Z, 26→AA, 27→AB, etc.
fn col_label(mut c: usize) -> String {
    let mut out = Vec::<u8>::new();
    c += 1;
    while c > 0 {
        let r = (c - 1) % 26;
        out.push(b'A' + r as u8);
        c = (c - 1) / 26;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}
