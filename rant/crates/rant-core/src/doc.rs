//! A post is a text file. This module is the whole storage format.
//!
//! ```text
//! ---
//! title: On the tyranny of the empty box
//! published: 2026-07-28T09:14:00Z
//! tags: writing, atproto
//! ---
//!
//! Body. Markdown. Whatever.
//! ```
//!
//! Frontmatter is optional and deliberately dumb: `key: value` lines between
//! two `---` fences, no YAML engine, no nesting, no anchors. A rant that starts
//! with prose is still a valid post — it just gets its title from the first
//! heading (or the first line) and its date from whoever hands us the file.
//!
//! Parsing is a single forward pass over the bytes with no allocation beyond
//! the field strings themselves; see `parse_is_microseconds` in `tests/`.

use crate::slug::slugify;

/// One post, parsed but not yet rendered.
///
/// `body` is borrowed from the source text so that parsing a file costs a scan
/// and a handful of small `String`s — never a copy of the prose itself.
#[derive(Debug, Clone, PartialEq)]
pub struct Doc<'a> {
    pub title: String,
    pub slug: String,
    /// RFC-3339. Empty when the file didn't say and the caller didn't either.
    pub published: String,
    pub updated: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    /// Extra frontmatter keys we don't model. Preserved so a round-trip through
    /// Rant never silently eats a field somebody else's tooling put there.
    pub extra: Vec<(String, String)>,
    /// The markdown body, borrowed from the source.
    pub body: &'a str,
}

/// Where a document came from. The renderer treats all three identically; only
/// the canonical-URL and edit-affordance logic cares.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    /// `rant/posts/*.md`, compiled into the worker.
    House,
    /// A `site.standard.document` in somebody's PDS.
    Pds,
    /// Typed into the composer, not yet published.
    Draft,
}

impl<'a> Doc<'a> {
    /// Parse a post text file.
    ///
    /// `fallback_slug` is used when frontmatter carries no explicit `slug`;
    /// pass the filename stem for house posts and the record key for PDS ones.
    pub fn parse(src: &'a str, fallback_slug: &str) -> Doc<'a> {
        let (fields, body) = split_frontmatter(src);

        let mut d = Doc {
            title: String::new(),
            slug: String::new(),
            published: String::new(),
            updated: None,
            description: None,
            tags: Vec::new(),
            extra: Vec::new(),
            body,
        };

        for (k, v) in fields {
            match k.to_ascii_lowercase().as_str() {
                "title" => d.title = v.to_string(),
                "slug" => d.slug = slugify(v),
                // `date` is the spelling every static-site generator on earth
                // uses; accept it so pasting an existing post just works.
                "published" | "publishedat" | "date" => d.published = normalize_date(v),
                "updated" | "updatedat" => d.updated = Some(normalize_date(v)),
                "description" | "summary" | "excerpt" => d.description = Some(v.to_string()),
                "tags" | "keywords" => d.tags = parse_tags(v),
                _ => d.extra.push((k.to_string(), v.to_string())),
            }
        }

        if d.title.is_empty() {
            d.title = derive_title(body);
        }
        if d.slug.is_empty() {
            d.slug = if fallback_slug.is_empty() {
                slugify(&d.title)
            } else {
                slugify(fallback_slug)
            };
        }
        if d.description.is_none() {
            let ex = crate::text::excerpt(body, 220);
            if !ex.is_empty() {
                d.description = Some(ex);
            }
        }
        d
    }

    /// The path component of the canonical URL, with both slashes: `/on-boxes/`.
    ///
    /// standard.site wants `path` prefixed with a leading slash and combined
    /// with the publication `url`; the trailing slash is ours, so that the
    /// worker's router and the record agree byte for byte.
    pub fn path(&self) -> String {
        format!("/{}/", self.slug)
    }

    pub fn word_count(&self) -> usize {
        crate::text::word_count(self.body)
    }

    /// Minutes, rounded up, at 238 wpm — the Brysbaert (2019) meta-analytic
    /// mean for silent reading of English prose. Not 200, which is folklore.
    pub fn reading_minutes(&self) -> usize {
        let w = self.word_count();
        if w == 0 {
            0
        } else {
            w.div_ceil(238).max(1)
        }
    }
}

/// Split `---` frontmatter off the front of a file.
///
/// Returns the parsed key/value pairs and the remaining body. A file with no
/// frontmatter returns no fields and the whole file as body — including a file
/// whose very first line is a `---` horizontal rule with no closing fence,
/// which is why the closing fence is required rather than assumed.
fn split_frontmatter(src: &str) -> (Vec<(&str, &str)>, &str) {
    let s = src.strip_prefix('\u{feff}').unwrap_or(src);
    let rest = match s.strip_prefix("---\n").or_else(|| s.strip_prefix("---\r\n")) {
        Some(r) => r,
        None => return (Vec::new(), s),
    };

    // Find the closing fence: a line that is exactly `---`.
    let mut fields = Vec::new();
    let mut offset = 0usize;
    let mut closed = false;
    for line in rest.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\n', '\r']);
        offset += line.len();
        if trimmed == "---" {
            closed = true;
            break;
        }
        if trimmed.trim().is_empty() || trimmed.trim_start().starts_with('#') {
            continue;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            let k = k.trim();
            let v = unquote(v.trim());
            if !k.is_empty() {
                fields.push((k, v));
            }
        }
    }

    if !closed {
        // Unterminated fence — the `---` was prose or a rule. Give the file back whole.
        return (Vec::new(), s);
    }
    (fields, rest[offset..].trim_start_matches(['\n', '\r']))
}

fn unquote(v: &str) -> &str {
    let b = v.as_bytes();
    if b.len() >= 2 && (b[0] == b'"' || b[0] == b'\'') && b[b.len() - 1] == b[0] {
        &v[1..v.len() - 1]
    } else {
        v
    }
}

fn parse_tags(v: &str) -> Vec<String> {
    // Accepts `a, b, c` and `[a, b, c]`. standard.site caps documents at
    // sensible tag counts and forbids the leading hash, so strip both.
    v.trim_matches(['[', ']'])
        .split(',')
        .map(|t| t.trim().trim_start_matches('#').trim_matches(['"', '\'']))
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .take(10)
        .collect()
}

/// Best-effort RFC-3339. A bare `2026-07-28` becomes midnight UTC; anything we
/// can't recognise is passed through so we never invent a date that isn't real.
fn normalize_date(v: &str) -> String {
    let v = v.trim();
    if v.len() == 10 && v.as_bytes()[4] == b'-' && v.as_bytes()[7] == b'-' {
        return format!("{v}T00:00:00.000Z");
    }
    v.to_string()
}

/// Title from the body: the first ATX heading, else the first non-empty line,
/// else "Untitled". Capped so a title-less wall of text can't produce a 4KB title.
fn derive_title(body: &str) -> String {
    for line in body.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let t = t.trim_start_matches('#').trim();
        if t.is_empty() {
            continue;
        }
        let mut out: String = t.chars().take(120).collect();
        if t.chars().count() > 120 {
            out.push('…');
        }
        return out;
    }
    "Untitled".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frontmatter_and_body() {
        let src = "---\ntitle: On boxes\ndate: 2026-07-28\ntags: writing, atproto\n---\n\nHello **world**.\n";
        let d = Doc::parse(src, "whatever");
        assert_eq!(d.title, "On boxes");
        assert_eq!(d.slug, "whatever");
        assert_eq!(d.published, "2026-07-28T00:00:00.000Z");
        assert_eq!(d.tags, vec!["writing", "atproto"]);
        assert_eq!(d.body, "Hello **world**.\n");
        assert_eq!(d.path(), "/whatever/");
    }

    #[test]
    fn bare_rant_still_parses() {
        let d = Doc::parse("just yelling into the void\n\nmore yelling", "");
        assert_eq!(d.title, "just yelling into the void");
        assert_eq!(d.slug, "just-yelling-into-the-void");
        assert!(d.published.is_empty());
        assert!(d.body.starts_with("just yelling"));
    }

    #[test]
    fn leading_horizontal_rule_is_not_frontmatter() {
        // No closing fence — the file is prose that happens to open with a rule.
        let src = "---\n\nA rant that opens with a rule.\n";
        let d = Doc::parse(src, "x");
        assert_eq!(d.body, src, "body must survive intact");
    }

    #[test]
    fn heading_becomes_title_and_unknown_keys_survive() {
        let d = Doc::parse("---\nmood: furious\n---\n# Real title\n\nbody", "s");
        assert_eq!(d.title, "Real title");
        assert_eq!(d.extra, vec![("mood".to_string(), "furious".to_string())]);
    }

    #[test]
    fn reading_time_rounds_up_and_never_reports_zero_for_prose() {
        let d = Doc::parse("one two three", "s");
        assert_eq!(d.reading_minutes(), 1);
        assert_eq!(Doc::parse("", "s").reading_minutes(), 0);
    }
}
