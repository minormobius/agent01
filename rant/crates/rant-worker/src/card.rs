//! SVG → PNG at the edge, with `resvg`.
//!
//! Link scrapers do not render SVG, so `og:image` has to be a raster. `resvg`
//! is pure Rust and compiles to wasm, which is why the whole card path stays
//! inside the Worker instead of needing a second service.
//!
//! Two things are load-bearing:
//!
//! - **The font is embedded.** There is no filesystem in a Worker, so
//!   `system-fonts` is off and the face is fed to `fontdb` from bytes. Without
//!   it every `<text>` node silently renders as nothing — a card that is
//!   technically a valid PNG and visually a blank rectangle.
//! - **The SVG is still served.** `/og/<slug>/card.svg` returns the source. If
//!   rasterisation ever fails we serve that rather than a 500: a card that some
//!   clients cannot render beats a link with no card at all.

use resvg::tiny_skia;
use resvg::usvg;

/// Roboto Mono, already vendored in this repo for `poll`'s cards. Apache-2.0,
/// monospace — which is what makes the card's title fitting exact rather than
/// approximate (see `rant_core::card::ADVANCE`).
const FONT_REGULAR: &[u8] = include_bytes!("../../../../poll/apps/api/src/fonts/roboto-mono-400.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../../../../poll/apps/api/src/fonts/roboto-mono-700.ttf");

/// Rasterise a card SVG to PNG bytes.
pub fn png(svg: &str) -> Result<Vec<u8>, String> {
    let mut fontdb = usvg::fontdb::Database::new();
    fontdb.load_font_data(FONT_REGULAR.to_vec());
    fontdb.load_font_data(FONT_BOLD.to_vec());
    fontdb.set_monospace_family("Roboto Mono");
    // Every family name resolves to the one face we have. A card must never
    // fall through to "no font found" and render blank.
    fontdb.set_sans_serif_family("Roboto Mono");
    fontdb.set_serif_family("Roboto Mono");

    let mut opt = usvg::Options { fontdb: std::sync::Arc::new(fontdb), ..Default::default() };
    opt.font_family = "Roboto Mono".to_string();

    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| format!("parse: {e}"))?;
    let size = tree.size().to_int_size();
    let mut pixmap = tiny_skia::Pixmap::new(size.width(), size.height())
        .ok_or_else(|| format!("pixmap {}x{}", size.width(), size.height()))?;

    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    pixmap.encode_png().map_err(|e| format!("encode: {e}"))
}
