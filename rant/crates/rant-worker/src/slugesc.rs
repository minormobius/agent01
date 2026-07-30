//! Escaping helpers, re-exported so page templates read cleanly.

pub use rant_core::slug::esc;

/// An anchor with both parts escaped. Every link in a template goes through
/// this or through `esc`, so a hostile title cannot become markup.
pub fn a(href: &str, text: &str) -> String {
    format!(r#"<a href="{}">{}</a>"#, esc(href), esc(text))
}
