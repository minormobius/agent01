//! # rant-core
//!
//! The engine behind `rant.mino.mobi`. Text files in; standard.site records,
//! HTML, feeds, link cards and predicate views out.
//!
//! Nothing in this crate does I/O, allocates a runtime, or reads a clock. It is
//! a pile of pure functions over `&str`, which is what lets the same code run in
//! three places without a shim: inside the Cloudflare Worker (`rant-worker`),
//! inside the browser (`rant-view`), and inside `cargo test`.
//!
//! ## The pipeline
//!
//! ```text
//!   text file ──doc::Doc::parse──> Doc ──┬──markdown::render──────> HTML
//!                                        ├──text::tokenize────────> [Token] ──predicates::apply──> [Cell]
//!                                        ├──standard::Document─────> the PDS record
//!                                        ├──feeds::{rss,json_feed}─> syndication
//!                                        └──card::svg─────────────> the link card
//! ```
//!
//! ## Why microseconds is a stated goal
//!
//! Because it changes what you can build. A render measured in microseconds can
//! happen per-request at the edge with no cache, which means no invalidation,
//! which means a post is live the instant the record lands — and it can happen
//! per-keystroke in the composer, which means the preview *is* the renderer
//! rather than an approximation of it. `tests/budget.rs` asserts the numbers.

pub mod agent;
pub mod card;
pub mod doc;
pub mod edit;
pub mod feeds;
pub mod house;
pub mod markdown;
pub mod predicates;
pub mod slug;
pub mod standard;
pub mod templates;
pub mod text;

pub use doc::{Doc, Origin};
pub use edit::{Action, Edit};
pub use predicates::{Break, Cell, Opts, Predicate};
pub use standard::{Document, Publication, Recommend, Subscription};

/// Everything needed to render one post page, computed in a single pass.
///
/// The worker builds one of these and hands it to the template; nothing
/// downstream re-parses the source.
pub struct Rendered {
    pub html: String,
    pub plain: String,
    pub words: usize,
    pub minutes: usize,
}

/// Render a document body through an optional predicate chain.
///
/// An empty chain (or `plain`) takes the markdown path and produces real
/// document structure — headings, lists, code. Any other chain takes the token
/// path, because a predicate operates on words and there is no meaningful
/// `skeleton` of a table.
pub fn render_body(body: &str, chain: &[Predicate], o: &Opts) -> Rendered {
    let words = text::word_count(body);
    let minutes = if words == 0 { 0 } else { words.div_ceil(238).max(1) };

    if chain.is_empty() || chain == [Predicate::Plain] {
        return Rendered { html: markdown::render(body), plain: text::strip_markdown(body), words, minutes };
    }

    let tokens = text::tokenize(body);
    let cells = predicates::apply_chain(chain, &tokens, o);
    let view = *chain.last().unwrap();
    Rendered {
        html: predicates::cells_to_html(view, &cells),
        plain: predicates::cells_to_plain(&cells),
        words,
        minutes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_chain_takes_the_markdown_path() {
        let r = render_body("# Head\n\n- a\n- b", &[], &Opts::default());
        assert!(r.html.contains("<h1"), "{}", r.html);
        assert!(r.html.contains("<li>"), "{}", r.html);
    }

    #[test]
    fn a_predicate_chain_takes_the_token_path() {
        let r = render_body("# Head\n\nThe body of it.", &[Predicate::Skeleton], &Opts::default());
        assert!(r.html.contains("view-skeleton"), "{}", r.html);
        assert!(!r.plain.split_whitespace().any(|w| w == "the"), "{}", r.plain);
    }

    #[test]
    fn word_count_and_reading_time_agree_with_doc() {
        let body = "word ".repeat(500);
        let r = render_body(&body, &[], &Opts::default());
        assert_eq!(r.words, 500);
        assert_eq!(r.minutes, Doc::parse(&body, "s").reading_minutes());
    }
}
