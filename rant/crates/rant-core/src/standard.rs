//! The [standard.site](https://standard.site) lexicons, as Rust types.
//!
//! Four records plus a content union. Nothing here talks to a network: these
//! are pure `Doc <-> record` conversions, so the worker, the browser composer
//! and the tests all agree byte-for-byte about what we publish.
//!
//! | NSID | what it is |
//! |---|---|
//! | `site.standard.publication` | the blog itself — url, name, icon, theme |
//! | `site.standard.document` | one post |
//! | `site.standard.graph.subscription` | reader → publication (the subscribe button) |
//! | `site.standard.graph.recommend` | reader → document (the recommend button) |
//! | `at.markpub.markdown` | the content-union member carrying the raw markdown |
//!
//! Field constraints are the spec's, transcribed into `clamp_*` helpers below.
//! We enforce them on the way *out* (so we never write a record a strict
//! validator would reject) and are liberal on the way *in* (so a record from a
//! platform that disagrees with us still renders).

use serde::{Deserialize, Serialize};

use crate::doc::Doc;

pub const NSID_PUBLICATION: &str = "site.standard.publication";
pub const NSID_DOCUMENT: &str = "site.standard.document";
pub const NSID_SUBSCRIPTION: &str = "site.standard.graph.subscription";
pub const NSID_RECOMMEND: &str = "site.standard.graph.recommend";
pub const NSID_MARKDOWN: &str = "at.markpub.markdown";

/// Every collection Rant writes. The auth worker's `WRITE_COLLECTIONS` must be
/// a superset of this, or the OAuth ceiling will refuse the scope we request —
/// `scope_string()` below is the exact string the site asks for.
pub const WRITE_COLLECTIONS: [&str; 4] =
    [NSID_PUBLICATION, NSID_DOCUMENT, NSID_SUBSCRIPTION, NSID_RECOMMEND];

/// The narrow OAuth scope this site requests, per the repo's per-site scope
/// model: `atproto` plus a `repo:` write on exactly the four collections above.
/// Four lines on the consent screen instead of fifty.
pub fn scope_string() -> String {
    let mut s = String::from("atproto");
    for c in WRITE_COLLECTIONS {
        s.push_str(" repo:");
        s.push_str(c);
    }
    s
}

// ─────────────────────────────────────────────────────────── field clamps ──

/// Truncate on a grapheme-ish boundary to satisfy the lexicon's twin limits.
///
/// The spec constrains both `maxLength` (UTF-8 bytes) and `maxGraphemes`. We
/// approximate graphemes with `char`s: that under-counts a family emoji as four
/// where the spec counts one, which errs toward a shorter string — always safe.
fn clamp(s: &str, max_bytes: usize, max_chars: usize) -> String {
    let mut out = String::with_capacity(s.len().min(max_bytes));
    for (i, c) in s.chars().enumerate() {
        if i >= max_chars || out.len() + c.len_utf8() > max_bytes {
            break;
        }
        out.push(c);
    }
    out
}

fn clamp_title(s: &str) -> String {
    clamp(s, 5000, 500)
}
fn clamp_description(s: &str) -> String {
    clamp(s, 30_000, 3000)
}
fn clamp_tag(s: &str) -> String {
    clamp(s.trim_start_matches('#'), 1280, 128)
}

// ────────────────────────────────────────────────────────────── the records ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Rgb {
    #[serde(rename = "$type")]
    pub ty: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Rgb {
    pub fn new(r: u8, g: u8, b: u8) -> Rgb {
        Rgb { ty: "site.standard.theme.color#rgb".into(), r, g, b }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BasicTheme {
    #[serde(rename = "$type")]
    pub ty: String,
    pub background: Rgb,
    pub foreground: Rgb,
    pub accent: Rgb,
    #[serde(rename = "accentForeground")]
    pub accent_foreground: Rgb,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Preferences {
    #[serde(rename = "showInDiscover", skip_serializing_if = "Option::is_none")]
    pub show_in_discover: Option<bool>,
}

/// A `blob` ref as it appears inside a record (not the upload response).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Blob {
    #[serde(rename = "$type")]
    pub ty: String,
    #[serde(rename = "ref")]
    pub r#ref: BlobRef,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BlobRef {
    #[serde(rename = "$link")]
    pub link: String,
}

/// `site.standard.publication` — the feed-level record.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Publication {
    #[serde(rename = "$type")]
    pub ty: String,
    /// Base URL. No trailing slash — the spec says so, and the `path` on every
    /// document assumes it, so a stray slash yields `//post/` for every link.
    pub url: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<Blob>,
    #[serde(rename = "basicTheme", skip_serializing_if = "Option::is_none")]
    pub basic_theme: Option<BasicTheme>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferences: Option<Preferences>,
}

impl Publication {
    pub fn new(url: &str, name: &str, description: Option<&str>) -> Publication {
        Publication {
            ty: NSID_PUBLICATION.into(),
            url: url.trim_end_matches('/').to_string(),
            name: clamp_title(name),
            description: description.map(clamp_description),
            icon: None,
            basic_theme: None,
            preferences: Some(Preferences { show_in_discover: Some(true) }),
        }
    }

    pub fn with_theme(mut self, t: BasicTheme) -> Publication {
        self.basic_theme = Some(t);
        self
    }
}

/// `"e4b363"` or `"#e4b363"` → an `Rgb`.
///
/// A colour we cannot parse becomes black rather than failing: a wrong theme
/// colour is cosmetic, an unwritten publication record is not.
pub fn parse_hex(h: &str) -> Rgb {
    let h = h.trim().trim_start_matches('#');
    let n = |a: usize, b: usize| u8::from_str_radix(h.get(a..b).unwrap_or("00"), 16).unwrap_or(0);
    Rgb::new(n(0, 2), n(2, 4), n(4, 6))
}

/// The publication record for a deployment.
///
/// **One function, two callers, on purpose.** The worker renders this on
/// `/setup/` so you can see exactly what the button will write, and the browser
/// writes this when you press it. Two separate constructions — even using the
/// same `Publication` type — would be two things to keep in step, and the
/// preview would eventually lie about the record. This is the thing that makes
/// "the preview cannot drift from the write" true rather than aspirational.
pub fn publication_for(url: &str, name: &str, description: &str, accent_hex: &str) -> Publication {
    Publication::new(url, name, if description.is_empty() { None } else { Some(description) })
        .with_theme(BasicTheme {
            ty: "site.standard.theme.basic".into(),
            // The card/stylesheet dark palette; the accent is the themed part.
            background: parse_hex("0d0f13"),
            foreground: parse_hex("f2f0ec"),
            accent: parse_hex(accent_hex),
            accent_foreground: parse_hex("10121a"),
        })
}

/// The `content` open union. Each member carries its own `$type`; consumers that
/// don't know a member skip it, which is the whole point of an open union.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Content {
    Markdown(MarkdownContent),
    /// Anything we don't model — preserved verbatim so a round-trip through
    /// Rant never drops another platform's richer content block.
    Other(serde_json::Value),
}

/// `at.markpub.markdown` — the community markdown member of the content union.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MarkdownContent {
    #[serde(rename = "$type")]
    pub ty: String,
    pub text: MarkdownText,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flavor: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MarkdownText {
    #[serde(rename = "$type")]
    pub ty: String,
    pub text: String,
}

impl MarkdownContent {
    pub fn new(markdown: &str) -> MarkdownContent {
        MarkdownContent {
            ty: NSID_MARKDOWN.into(),
            text: MarkdownText { ty: "at.markpub.text".into(), text: markdown.to_string() },
            flavor: Some("gfm".into()),
            extensions: vec!["tables".into(), "strikethrough".into(), "tasklist".into(), "footnotes".into()],
        }
    }

    /// The raw markdown, if this member is one we can read.
    pub fn source(&self) -> &str {
        &self.text.text
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Contributor {
    pub did: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(rename = "displayName", skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

/// `site.standard.document` — one post.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Document {
    #[serde(rename = "$type")]
    pub ty: String,
    /// `at://` publication record, or an `https://` publication URL for a loose
    /// document that belongs to no registered publication.
    pub site: String,
    pub title: String,
    #[serde(rename = "publishedAt")]
    pub published_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "coverImage", skip_serializing_if = "Option::is_none")]
    pub cover_image: Option<Blob>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub content: Vec<Content>,
    /// Plaintext. The spec is explicit that this carries no markdown, and it is
    /// what every indexer will read, so it is generated, never author-supplied.
    #[serde(rename = "textContent", skip_serializing_if = "Option::is_none")]
    pub text_content: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub contributors: Vec<Contributor>,
    #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl Document {
    /// Build a spec-conformant document record from a parsed post.
    ///
    /// `site` is the publication AT-URI (or URL). `now` supplies `publishedAt`
    /// when the file didn't — this crate has no clock, so the caller owns the
    /// only nondeterminism in the pipeline and the tests stay reproducible.
    pub fn from_doc(doc: &Doc<'_>, site: &str, now: &str) -> Document {
        Document {
            ty: NSID_DOCUMENT.into(),
            site: site.trim_end_matches('/').to_string(),
            title: clamp_title(&doc.title),
            published_at: if doc.published.is_empty() { now.to_string() } else { doc.published.clone() },
            path: Some(doc.path()),
            description: doc.description.as_deref().map(clamp_description),
            cover_image: None,
            content: vec![Content::Markdown(MarkdownContent::new(doc.body))],
            // 100k of plaintext is generous for a rant and keeps the record
            // comfortably under the PDS record ceiling even with the markdown
            // copy sitting alongside it in `content`.
            text_content: Some(clamp(&crate::text::strip_markdown(doc.body), 100_000, 100_000)),
            tags: doc.tags.iter().map(|t| clamp_tag(t)).filter(|t| !t.is_empty()).take(10).collect(),
            contributors: Vec::new(),
            updated_at: doc.updated.clone(),
        }
    }

    /// The raw markdown, if the record carries a markdown content member.
    /// Falls back to `textContent`, which is what a document from a platform
    /// that stores HTML or blocks will have.
    pub fn source(&self) -> &str {
        for c in &self.content {
            if let Content::Markdown(m) = c {
                return m.source();
            }
        }
        // An `Other` member might still be markdown-shaped from a lexicon we
        // don't model; check for the community NSID before giving up.
        for c in &self.content {
            if let Content::Other(v) = c {
                if v.get("$type").and_then(|t| t.as_str()) == Some(NSID_MARKDOWN) {
                    if let Some(t) = v.pointer("/text/text").and_then(|t| t.as_str()) {
                        return t;
                    }
                }
            }
        }
        self.text_content.as_deref().unwrap_or("")
    }

    /// Parse back into a `Doc` for rendering. Borrows from `self`, so the
    /// document outlives the view.
    pub fn as_doc(&self) -> Doc<'_> {
        Doc {
            title: self.title.clone(),
            slug: self
                .path
                .as_deref()
                .map(|p| crate::slug::slugify(p))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| crate::slug::slugify(&self.title)),
            published: self.published_at.clone(),
            updated: self.updated_at.clone(),
            description: self.description.clone(),
            tags: self.tags.clone(),
            extra: Vec::new(),
            body: self.source(),
        }
    }
}

/// `site.standard.graph.subscription` — the subscribe button, as a record in
/// the *reader's* repo. Nothing is stored on our side; unsubscribing is
/// deleting your own record, which is the correct amount of power to hold.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Subscription {
    #[serde(rename = "$type")]
    pub ty: String,
    pub publication: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

impl Subscription {
    pub fn new(publication_uri: &str, now: &str) -> Subscription {
        Subscription {
            ty: NSID_SUBSCRIPTION.into(),
            publication: publication_uri.to_string(),
            created_at: now.to_string(),
        }
    }
}

/// `site.standard.graph.recommend` — a reader endorsing one document.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Recommend {
    #[serde(rename = "$type")]
    pub ty: String,
    pub document: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

impl Recommend {
    pub fn new(document_uri: &str, now: &str) -> Recommend {
        Recommend { ty: NSID_RECOMMEND.into(), document: document_uri.to_string(), created_at: now.to_string() }
    }
}

// ───────────────────────────────────────────────────────────────── at-uris ──

/// A parsed `at://did/collection/rkey`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtUri {
    pub authority: String,
    pub collection: String,
    pub rkey: String,
}

impl AtUri {
    pub fn parse(s: &str) -> Option<AtUri> {
        let rest = s.strip_prefix("at://")?;
        let mut parts = rest.splitn(3, '/');
        let authority = parts.next().filter(|a| !a.is_empty())?.to_string();
        let collection = parts.next().filter(|c| !c.is_empty())?.to_string();
        let rkey = parts.next().filter(|r| !r.is_empty())?.to_string();
        // A trailing segment would mean this isn't a record URI at all.
        if rkey.contains('/') {
            return None;
        }
        Some(AtUri { authority, collection, rkey })
    }

    pub fn to_string(&self) -> String {
        format!("at://{}/{}/{}", self.authority, self.collection, self.rkey)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc::Doc;

    const SITE: &str = "at://did:plc:abc123/site.standard.publication/3lwafzkjqm25s";
    const NOW: &str = "2026-07-28T09:00:00.000Z";

    fn sample() -> Document {
        let src = "---\ntitle: On boxes\ndate: 2026-07-28\ntags: writing, #atproto\n---\n\nBody with **bold**.\n";
        Document::from_doc(&Doc::parse(src, "on-boxes"), SITE, NOW)
    }

    #[test]
    fn document_matches_the_spec_example_shape() {
        let v = serde_json::to_value(sample()).unwrap();
        assert_eq!(v["$type"], NSID_DOCUMENT);
        assert_eq!(v["site"], SITE);
        assert_eq!(v["title"], "On boxes");
        assert_eq!(v["path"], "/on-boxes/");
        assert_eq!(v["publishedAt"], "2026-07-28T00:00:00.000Z");
        assert_eq!(v["tags"], serde_json::json!(["writing", "atproto"]), "hashes stripped");
        // Required fields per the lexicon: site, title, publishedAt.
        for k in ["site", "title", "publishedAt"] {
            assert!(v.get(k).is_some(), "missing required {k}");
        }
    }

    #[test]
    fn text_content_is_plaintext_not_markdown() {
        let d = sample();
        let tc = d.text_content.as_deref().unwrap();
        assert!(!tc.contains("**"), "spec forbids formatting in textContent: {tc}");
        assert!(tc.contains("Body with bold"));
    }

    #[test]
    fn markdown_is_preserved_in_the_content_union() {
        let d = sample();
        assert!(d.source().contains("**bold**"), "raw markdown must survive");
        let v = serde_json::to_value(&d).unwrap();
        assert_eq!(v["content"][0]["$type"], NSID_MARKDOWN);
        assert_eq!(v["content"][0]["text"]["$type"], "at.markpub.text");
    }

    #[test]
    fn round_trips_through_json_and_back_into_a_doc() {
        let json = serde_json::to_string(&sample()).unwrap();
        let back: Document = serde_json::from_str(&json).unwrap();
        assert_eq!(back, sample());
        let doc = back.as_doc();
        assert_eq!(doc.title, "On boxes");
        assert!(doc.body.contains("**bold**"));
    }

    #[test]
    fn unknown_content_members_survive_a_round_trip() {
        // Somebody else's richer block. We must not eat it.
        let raw = serde_json::json!({
            "$type": NSID_DOCUMENT,
            "site": SITE,
            "title": "Theirs",
            "publishedAt": NOW,
            "content": [{ "$type": "com.example.blocks", "blocks": [{"kind": "quote", "t": "hi"}] }]
        });
        let d: Document = serde_json::from_value(raw.clone()).unwrap();
        let back = serde_json::to_value(&d).unwrap();
        assert_eq!(back["content"][0]["$type"], "com.example.blocks");
        assert_eq!(back["content"][0]["blocks"][0]["t"], "hi");
    }

    #[test]
    fn a_foreign_markdown_member_is_still_readable() {
        let raw = serde_json::json!({
            "$type": NSID_DOCUMENT, "site": SITE, "title": "T", "publishedAt": NOW,
            "content": [{ "$type": NSID_MARKDOWN, "text": { "$type": "at.markpub.text", "text": "# hi" } }]
        });
        let d: Document = serde_json::from_value(raw).unwrap();
        assert_eq!(d.source(), "# hi");
    }

    #[test]
    fn falls_back_to_text_content_when_there_is_no_markdown() {
        let raw = serde_json::json!({
            "$type": NSID_DOCUMENT, "site": SITE, "title": "T",
            "publishedAt": NOW, "textContent": "plain words"
        });
        let d: Document = serde_json::from_value(raw).unwrap();
        assert_eq!(d.source(), "plain words");
    }

    #[test]
    fn hex_colours_parse_and_junk_does_not_panic() {
        let c = parse_hex("#e4b363");
        assert_eq!((c.r, c.g, c.b), (0xe4, 0xb3, 0x63));
        assert_eq!(parse_hex("0d0f13"), parse_hex("#0D0F13"), "case and hash insensitive");
        for junk in ["", "#", "zzz", "#12", "not-a-colour", "#ffffffff"] {
            let _ = parse_hex(junk);
        }
        assert_eq!(parse_hex("bogus"), Rgb::new(0, 0, 0), "unparseable → black, not a panic");
    }

    #[test]
    fn publication_for_is_the_single_source_for_the_setup_record() {
        // The worker's /setup/ preview and the browser's write both call this.
        // If it ever grows a second implementation, this is where to notice.
        let p = publication_for("https://rant.mino.mobi/", "Rant", "A box.", "#e4b363");
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["$type"], NSID_PUBLICATION);
        assert_eq!(v["url"], "https://rant.mino.mobi", "trailing slash stripped");
        assert_eq!(v["name"], "Rant");
        assert_eq!(v["description"], "A box.");
        assert_eq!(v["basicTheme"]["$type"], "site.standard.theme.basic");
        assert_eq!(v["basicTheme"]["accent"], serde_json::json!({
            "$type": "site.standard.theme.color#rgb", "r": 228, "g": 179, "b": 99
        }));
        assert_eq!(v["preferences"]["showInDiscover"], true);
        // An empty description must be omitted, not written as "".
        let bare = serde_json::to_value(publication_for("https://x.test", "X", "", "#000000")).unwrap();
        assert!(bare.get("description").is_none(), "{bare}");
    }

    #[test]
    fn publication_has_no_trailing_slash() {
        let p = Publication::new("https://rant.mino.mobi/", "Rant", Some("d"));
        assert_eq!(p.url, "https://rant.mino.mobi");
        assert_eq!(serde_json::to_value(&p).unwrap()["preferences"]["showInDiscover"], true);
    }

    #[test]
    fn graph_records_match_the_spec() {
        let s = serde_json::to_value(Subscription::new(SITE, NOW)).unwrap();
        assert_eq!(s, serde_json::json!({
            "$type": NSID_SUBSCRIPTION, "publication": SITE, "createdAt": NOW
        }));
        let doc_uri = "at://did:plc:abc123/site.standard.document/3mbfqhezge25u";
        let r = serde_json::to_value(Recommend::new(doc_uri, NOW)).unwrap();
        assert_eq!(r, serde_json::json!({
            "$type": NSID_RECOMMEND, "document": doc_uri, "createdAt": NOW
        }));
    }

    #[test]
    fn field_limits_are_enforced_on_the_way_out() {
        let long = "é".repeat(4000); // 8000 bytes, 4000 graphemes
        let src = format!("---\ntitle: {long}\n---\nbody");
        let d = Document::from_doc(&Doc::parse(&src, "s"), SITE, NOW);
        assert!(d.title.chars().count() <= 500, "maxGraphemes 500");
        assert!(d.title.len() <= 5000, "maxLength 5000");
    }

    #[test]
    fn tags_are_capped_at_ten() {
        let tags: Vec<String> = (0..30).map(|i| format!("t{i}")).collect();
        let src = format!("---\ntitle: T\ntags: {}\n---\nb", tags.join(", "));
        assert_eq!(Document::from_doc(&Doc::parse(&src, "s"), SITE, NOW).tags.len(), 10);
    }

    #[test]
    fn at_uris_parse_and_reject_junk() {
        let u = AtUri::parse(SITE).unwrap();
        assert_eq!(u.authority, "did:plc:abc123");
        assert_eq!(u.collection, NSID_PUBLICATION);
        assert_eq!(u.rkey, "3lwafzkjqm25s");
        assert_eq!(u.to_string(), SITE);
        for bad in ["", "https://x", "at://", "at://did", "at://did/coll", "at://did/coll/rk/extra"] {
            assert_eq!(AtUri::parse(bad), None, "{bad} should not parse");
        }
    }

    #[test]
    fn the_requested_scope_is_narrow_and_covers_what_we_write() {
        let s = scope_string();
        assert!(s.starts_with("atproto "));
        assert!(!s.contains("transition:generic"), "narrow scope, not the blanket one");
        for c in WRITE_COLLECTIONS {
            assert!(s.contains(&format!("repo:{c}")), "{c} missing from scope");
        }
        assert_eq!(s.split(' ').count(), 5, "one line per collection, plus atproto");
    }
}
