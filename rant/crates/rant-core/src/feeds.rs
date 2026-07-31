//! Syndication, for humans and for agents.
//!
//! Four formats from one list of documents:
//!
//! - **RSS 2.0** — because it is what still works everywhere.
//! - **JSON Feed 1.1** — because it is what is pleasant to parse.
//! - **`llms.txt`** — the index an agent reads first: what this site is, what
//!   is on it, and where the full text lives.
//! - **`llms-full.txt`** — every post's plain text, concatenated, so a model can
//!   ingest the whole publication in one fetch instead of crawling it.
//!
//! All four are pure functions of the same `Vec<Entry>`, so they cannot drift.

use crate::slug::xml_esc;
use crate::text::strip_markdown;

/// One item, flattened from whatever produced it (house file or PDS record).
pub struct Entry {
    pub title: String,
    pub url: String,
    pub path: String,
    pub published: String,
    pub description: String,
    /// Raw markdown. Rendered or stripped per format.
    pub body: String,
    pub tags: Vec<String>,
    /// `at://…` for a document that lives in a repo; empty for a house post
    /// that has not been published to a PDS.
    pub at_uri: String,
}

pub struct FeedMeta<'a> {
    pub title: &'a str,
    pub description: &'a str,
    pub site_url: &'a str,
    /// RFC-3339. The caller owns the clock.
    pub now: &'a str,
}

/// RSS 2.0 with the atom self-link, which is what most validators insist on.
pub fn rss(m: &FeedMeta<'_>, entries: &[Entry]) -> String {
    let mut s = String::with_capacity(entries.len() * 512 + 512);
    s.push_str(r#"<?xml version="1.0" encoding="UTF-8"?>"#);
    s.push_str(r#"<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">"#);
    s.push_str("<channel>");
    s.push_str(&format!("<title>{}</title>", xml_esc(m.title)));
    s.push_str(&format!("<link>{}</link>", xml_esc(m.site_url)));
    s.push_str(&format!("<description>{}</description>", xml_esc(m.description)));
    s.push_str(&format!(
        r#"<atom:link href="{}/feed.xml" rel="self" type="application/rss+xml"/>"#,
        xml_esc(m.site_url)
    ));
    s.push_str(&format!("<lastBuildDate>{}</lastBuildDate>", xml_esc(&rfc822(m.now))));

    for e in entries {
        s.push_str("<item>");
        s.push_str(&format!("<title>{}</title>", xml_esc(&e.title)));
        s.push_str(&format!("<link>{}</link>", xml_esc(&e.url)));
        // The AT-URI is globally unique and survives the site moving domains,
        // which is exactly what a guid is for. Fall back to the URL.
        let guid = if e.at_uri.is_empty() { &e.url } else { &e.at_uri };
        s.push_str(&format!(r#"<guid isPermaLink="false">{}</guid>"#, xml_esc(guid)));
        s.push_str(&format!("<pubDate>{}</pubDate>", xml_esc(&rfc822(&e.published))));
        s.push_str(&format!("<description>{}</description>", xml_esc(&e.description)));
        s.push_str(&format!(
            "<content:encoded xmlns:content=\"http://purl.org/rss/1.0/modules/content/\">{}</content:encoded>",
            cdata(&crate::markdown::render(&e.body))
        ));
        for t in &e.tags {
            s.push_str(&format!("<category>{}</category>", xml_esc(t)));
        }
        s.push_str("</item>");
    }
    s.push_str("</channel></rss>");
    s
}

/// JSON Feed 1.1.
pub fn json_feed(m: &FeedMeta<'_>, entries: &[Entry]) -> String {
    let items: Vec<serde_json::Value> = entries
        .iter()
        .map(|e| {
            let mut v = serde_json::json!({
                "id": if e.at_uri.is_empty() { e.url.clone() } else { e.at_uri.clone() },
                "url": e.url,
                "title": e.title,
                "summary": e.description,
                "content_html": crate::markdown::render(&e.body),
                "content_text": strip_markdown(&e.body),
                "date_published": e.published,
            });
            if !e.tags.is_empty() {
                v["tags"] = serde_json::json!(e.tags);
            }
            if !e.at_uri.is_empty() {
                // Non-standard but namespaced, per the JSON Feed extension rule.
                v["_atproto"] = serde_json::json!({ "uri": e.at_uri });
            }
            v
        })
        .collect();

    serde_json::to_string_pretty(&serde_json::json!({
        "version": "https://jsonfeed.org/version/1.1",
        "title": m.title,
        "description": m.description,
        "home_page_url": m.site_url,
        "feed_url": format!("{}/feed.json", m.site_url),
        "items": items,
    }))
    .unwrap_or_else(|_| "{}".into())
}

/// `llms.txt` — the agent's index page.
pub fn llms_txt(m: &FeedMeta<'_>, entries: &[Entry], extra: &[(&str, &str)]) -> String {
    let mut s = String::new();
    s.push_str(&format!("# {}\n\n> {}\n\n", m.title, m.description));
    s.push_str(
        "Every post is also an ATProto `site.standard.document` record in its author's repo.\n\
         Append `?view=<predicate>` to any post URL for an alternate rendering, or\n\
         `?format=text` for plain text. `/api/predicates` lists them.\n\n## Posts\n\n",
    );
    for e in entries {
        s.push_str(&format!("- [{}]({}): {}\n", e.title, e.url, one_line(&e.description)));
    }
    if !extra.is_empty() {
        s.push_str("\n## Machine endpoints\n\n");
        for (url, what) in extra {
            s.push_str(&format!("- [{url}]({url}): {what}\n"));
        }
    }
    s
}

/// `llms-full.txt` — the whole publication as one document.
pub fn llms_full_txt(m: &FeedMeta<'_>, entries: &[Entry]) -> String {
    let mut s = String::new();
    s.push_str(&format!("# {}\n\n{}\n\n", m.title, m.description));
    for e in entries {
        s.push_str(&format!("\n\n---\n\n## {}\n\n", e.title));
        s.push_str(&format!("URL: {}\nPublished: {}\n", e.url, e.published));
        if !e.at_uri.is_empty() {
            s.push_str(&format!("Record: {}\n", e.at_uri));
        }
        if !e.tags.is_empty() {
            s.push_str(&format!("Tags: {}\n", e.tags.join(", ")));
        }
        s.push('\n');
        s.push_str(&e.body);
        s.push('\n');
    }
    s
}

/// Wrap a payload in a CDATA section that it cannot escape.
///
/// A literal `]]>` in the payload would terminate the section early and turn
/// the rest of the post into markup. The fix is the standard one: split the
/// sequence across two sections.
///
/// Today the markdown renderer escapes `>` in text, so this never fires through
/// the normal path. It is here because "the renderer happens to escape that"
/// is a property of a dependency, and the feed's well-formedness should not
/// depend on it.
fn cdata(payload: &str) -> String {
    format!("<![CDATA[{}]]>", payload.replace("]]>", "]]]]><![CDATA[>"))
}

fn one_line(s: &str) -> String {
    s.replace(['\n', '\r'], " ").trim().to_string()
}

/// RFC-3339 → RFC-822, which is what RSS `pubDate` wants.
///
/// Hand-rolled rather than pulling in `chrono`: this is the only date maths in
/// the crate, it is a fixed-width reformat plus a day-of-week calculation, and
/// a date library would cost more wasm than the rest of the engine combined.
/// A string we cannot parse is passed through — a slightly wrong `pubDate` beats
/// a feed that fails to build.
pub fn rfc822(rfc3339: &str) -> String {
    let b = rfc3339.as_bytes();
    if b.len() < 10 {
        return rfc3339.to_string();
    }
    let num = |a: usize, z: usize| -> Option<u32> { rfc3339.get(a..z)?.parse().ok() };
    let (Some(y), Some(mo), Some(d)) = (num(0, 4), num(5, 7), num(8, 10)) else {
        return rfc3339.to_string();
    };
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) {
        return rfc3339.to_string();
    }
    let (h, mi, sec) = if b.len() >= 19 {
        (num(11, 13).unwrap_or(0), num(14, 16).unwrap_or(0), num(17, 19).unwrap_or(0))
    } else {
        (0, 0, 0)
    };
    const MONTHS: [&str; 12] =
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    format!(
        "{}, {:02} {} {} {:02}:{:02}:{:02} GMT",
        DAYS[day_of_week(y, mo, d) as usize],
        d,
        MONTHS[(mo - 1) as usize],
        y,
        h,
        mi,
        sec
    )
}

/// Sakamoto's algorithm. 0 = Sunday.
fn day_of_week(y: u32, m: u32, d: u32) -> u32 {
    const T: [u32; 12] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = if m < 3 { y - 1 } else { y };
    (y + y / 4 - y / 100 + y / 400 + T[(m - 1) as usize] + d) % 7
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta() -> FeedMeta<'static> {
        FeedMeta {
            title: "Rant",
            description: "Yelling, indexed",
            site_url: "https://rant.mino.mobi",
            now: "2026-07-28T09:00:00.000Z",
        }
    }

    fn entries() -> Vec<Entry> {
        vec![Entry {
            title: "On boxes & things".into(),
            url: "https://rant.mino.mobi/on-boxes/".into(),
            path: "/on-boxes/".into(),
            published: "2026-07-28T09:00:00.000Z".into(),
            description: "A rant".into(),
            body: "Hello **world**.".into(),
            tags: vec!["writing".into()],
            at_uri: "at://did:plc:abc/site.standard.document/3k".into(),
        }]
    }

    #[test]
    fn rss_escapes_and_carries_the_at_uri_as_guid() {
        let x = rss(&meta(), &entries());
        assert!(x.contains("<title>On boxes &amp; things</title>"), "{x}");
        assert!(x.contains(r#"<guid isPermaLink="false">at://did:plc:abc/site.standard.document/3k</guid>"#));
        assert!(x.contains("<pubDate>Tue, 28 Jul 2026 09:00:00 GMT</pubDate>"), "{x}");
        assert!(x.contains("atom:link"));
    }

    #[test]
    fn cdata_cannot_be_terminated_early() {
        assert_eq!(cdata("plain"), "<![CDATA[plain]]>");
        let out = cdata("before ]]> after");
        assert!(out.starts_with("<![CDATA[") && out.ends_with("]]>"));
        // The only `]]>` that closes a section is the last one: strip the
        // trailing terminator and no bare terminator may remain outside a
        // re-opened section.
        let inner = &out["<![CDATA[".len()..out.len() - 3];
        assert_eq!(inner, "before ]]]]><![CDATA[> after");
        assert_eq!(out.matches("<![CDATA[").count(), out.matches("]]>").count());
    }

    #[test]
    fn feed_bodies_stay_inside_their_cdata() {
        let mut e = entries();
        e[0].body = "before ]]> after <script>x</script>".into();
        let x = rss(&meta(), &e);
        assert_eq!(x.matches("<![CDATA[").count(), x.matches("]]>").count());
        assert!(!x.contains("<script>"), "raw html must not reach the feed: {x}");
    }

    #[test]
    fn json_feed_is_valid_json_and_versioned() {
        let v: serde_json::Value = serde_json::from_str(&json_feed(&meta(), &entries())).unwrap();
        assert_eq!(v["version"], "https://jsonfeed.org/version/1.1");
        assert_eq!(v["items"][0]["id"], "at://did:plc:abc/site.standard.document/3k");
        assert!(v["items"][0]["content_html"].as_str().unwrap().contains("<strong>world</strong>"));
        assert_eq!(v["items"][0]["content_text"], "Hello world.");
    }

    #[test]
    fn llms_txt_lists_posts_and_endpoints() {
        let s = llms_txt(&meta(), &entries(), &[("https://rant.mino.mobi/api/posts", "JSON index")]);
        assert!(s.starts_with("# Rant"));
        assert!(s.contains("[On boxes & things](https://rant.mino.mobi/on-boxes/)"));
        assert!(s.contains("## Machine endpoints"));
        assert!(s.contains("?view="), "agents should be told the views exist");
    }

    #[test]
    fn llms_full_carries_the_body() {
        let s = llms_full_txt(&meta(), &entries());
        assert!(s.contains("Hello **world**."));
        assert!(s.contains("Record: at://did:plc:abc/site.standard.document/3k"));
    }

    #[test]
    fn rfc822_conversion() {
        assert_eq!(rfc822("2026-07-28T09:00:00.000Z"), "Tue, 28 Jul 2026 09:00:00 GMT");
        assert_eq!(rfc822("2000-01-01T00:00:00Z"), "Sat, 01 Jan 2000 00:00:00 GMT");
        assert_eq!(rfc822("2024-02-29T12:34:56Z"), "Thu, 29 Feb 2024 12:34:56 GMT", "leap day");
        assert_eq!(rfc822("1999-12-31"), "Fri, 31 Dec 1999 00:00:00 GMT", "date only");
    }

    #[test]
    fn unparseable_dates_pass_through_rather_than_lying() {
        for junk in ["", "soon", "not-a-date", "2026-13-45T00:00:00Z"] {
            assert_eq!(rfc822(junk), junk, "invented a date for {junk:?}");
        }
    }

    #[test]
    fn empty_feeds_are_still_valid() {
        let x = rss(&meta(), &[]);
        assert!(x.ends_with("</channel></rss>"));
        let v: serde_json::Value = serde_json::from_str(&json_feed(&meta(), &[])).unwrap();
        assert_eq!(v["items"].as_array().unwrap().len(), 0);
    }
}
