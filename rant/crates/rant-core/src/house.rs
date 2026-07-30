//! The house publication: `rant/posts/*.md`, compiled in by `build.rs`.
//!
//! These are the posts that ship with the site rather than living in somebody's
//! PDS — the ones you can write with `git commit`. They go through exactly the
//! same `Doc` pipeline as a record fetched from a repo, which is the point:
//! there is one renderer, and "where did this text come from" is a detail the
//! rest of the engine never learns.

include!(concat!(env!("OUT_DIR"), "/house_posts.rs"));

use crate::doc::Doc;

/// Every house post, newest first.
///
/// Sorting is by the RFC-3339 `published` string, which sorts correctly as
/// bytes precisely because it is RFC-3339 — one of the format's better jokes.
/// Undated posts sort last rather than first, so a half-finished file dropped
/// in the directory does not take over the front page.
pub fn all() -> Vec<Doc<'static>> {
    let mut docs: Vec<Doc<'static>> = POSTS.iter().map(|(slug, src)| Doc::parse(src, slug)).collect();
    docs.sort_by(|a, b| match (a.published.is_empty(), b.published.is_empty()) {
        (true, false) => std::cmp::Ordering::Greater,
        (false, true) => std::cmp::Ordering::Less,
        _ => b.published.cmp(&a.published).then_with(|| a.slug.cmp(&b.slug)),
    });
    docs
}

/// One house post by slug.
pub fn get(slug: &str) -> Option<Doc<'static>> {
    POSTS.iter().find(|(s, _)| *s == slug).map(|(s, src)| Doc::parse(src, s))
}

pub fn count() -> usize {
    POSTS.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_house_post_parses_and_has_the_fields_a_record_needs() {
        for d in all() {
            assert!(!d.title.is_empty(), "{} has no title", d.slug);
            assert!(!d.slug.is_empty());
            assert!(
                !d.published.is_empty(),
                "{} has no date — it would be stamped with the deploy time",
                d.slug
            );
            assert!(d.published.len() >= 20 && d.published.ends_with('Z'), "{}: {}", d.slug, d.published);
            assert!(!d.body.trim().is_empty(), "{} is empty", d.slug);
        }
    }

    #[test]
    fn slugs_are_unique() {
        let mut seen = std::collections::BTreeSet::new();
        for d in all() {
            assert!(seen.insert(d.slug.clone()), "duplicate slug {}", d.slug);
        }
    }

    #[test]
    fn newest_first() {
        let dates: Vec<String> = all().into_iter().map(|d| d.published).collect();
        let mut sorted = dates.clone();
        sorted.sort_by(|a, b| b.cmp(a));
        assert_eq!(dates, sorted);
    }

    #[test]
    fn get_round_trips_against_all() {
        for d in all() {
            assert_eq!(get(&d.slug).map(|x| x.title), Some(d.title.clone()));
        }
        assert!(get("no-such-post").is_none());
    }
}
