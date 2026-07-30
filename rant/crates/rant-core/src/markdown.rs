//! Markdown → HTML, via `pulldown-cmark` with GFM turned on.
//!
//! Two things happen on top of the vanilla renderer:
//!
//! 1. **Heading anchors.** Every `h2`–`h6` gets a stable `id` derived from its
//!    text, so a rant is deep-linkable without the author doing anything.
//! 2. **Raw HTML is dropped and link schemes are filtered.** Documents can
//!    arrive from *anyone's* PDS — the whole point of standard.site is that we
//!    render other people's records — so passing their raw HTML through would
//!    be a stored-XSS hole with extra steps. `pulldown-cmark` hands us
//!    `Html`/`InlineHtml` events; we swallow them. Link and image targets are
//!    scheme-checked for the same reason: `[x](javascript:…)` is markdown, and
//!    markdown alone would happily render it into an executable `href`.

use pulldown_cmark::{html, CowStr, Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use crate::slug::slugify;

fn options() -> Options {
    let mut o = Options::empty();
    o.insert(Options::ENABLE_TABLES);
    o.insert(Options::ENABLE_FOOTNOTES);
    o.insert(Options::ENABLE_STRIKETHROUGH);
    o.insert(Options::ENABLE_TASKLISTS);
    o.insert(Options::ENABLE_SMART_PUNCTUATION);
    o.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    o
}

/// Render markdown to sanitised HTML.
pub fn render(md: &str) -> String {
    let mut out = String::with_capacity(md.len() * 3 / 2 + 64);
    html::push_html(&mut out, rewrite(Parser::new_ext(md, options())).into_iter());
    out
}

/// The event rewriter: anchor ids in, raw HTML out.
fn rewrite<'a, I>(events: I) -> Vec<Event<'a>>
where
    I: Iterator<Item = Event<'a>>,
{
    let mut out: Vec<Event<'a>> = Vec::new();
    // When we are inside a heading, buffer its events so we can slugify the
    // text before emitting the opening tag.
    let mut heading: Option<(HeadingLevel, Vec<Event<'a>>)> = None;

    for ev in events {
        match ev {
            Event::Html(_) | Event::InlineHtml(_) => {}

            // Scheme-filter every target before it can become an `href`/`src`.
            Event::Start(Tag::Link { link_type, dest_url, title, id }) => {
                push_or_buffer(
                    &mut out,
                    &mut heading,
                    Event::Start(Tag::Link { link_type, dest_url: safe_url(dest_url), title, id }),
                );
            }
            Event::Start(Tag::Image { link_type, dest_url, title, id }) => {
                push_or_buffer(
                    &mut out,
                    &mut heading,
                    Event::Start(Tag::Image { link_type, dest_url: safe_url(dest_url), title, id }),
                );
            }

            Event::Start(Tag::Heading { level, .. }) => {
                heading = Some((level, Vec::new()));
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some((level, buf)) = heading.take() {
                    let text: String = buf
                        .iter()
                        .filter_map(|e| match e {
                            Event::Text(t) | Event::Code(t) => Some(t.as_ref()),
                            _ => None,
                        })
                        .collect();
                    let id = slugify(&text);
                    out.push(Event::Start(Tag::Heading {
                        level,
                        id: if id.is_empty() { None } else { Some(CowStr::Boxed(id.into_boxed_str())) },
                        classes: Vec::new(),
                        attrs: Vec::new(),
                    }));
                    out.extend(buf);
                    out.push(Event::End(TagEnd::Heading(level)));
                }
            }

            other => push_or_buffer(&mut out, &mut heading, other),
        }
    }
    out
}

/// Emit an event, or park it in the heading buffer if we're mid-heading.
fn push_or_buffer<'a>(
    out: &mut Vec<Event<'a>>,
    heading: &mut Option<(HeadingLevel, Vec<Event<'a>>)>,
    ev: Event<'a>,
) {
    match heading {
        Some((_, buf)) => buf.push(ev),
        None => out.push(ev),
    }
}

/// Allow only targets that cannot execute.
///
/// Relative and fragment URLs pass through untouched; absolute URLs must carry
/// one of the four schemes below. Anything else — `javascript:`, `data:`,
/// `vbscript:`, or a scheme we've simply never heard of — is replaced with `#`
/// rather than dropped, so the link text survives and the page still reads.
fn safe_url(url: CowStr<'_>) -> CowStr<'_> {
    const ALLOWED: [&str; 5] = ["http://", "https://", "mailto:", "at://", "did:"];
    // A URL is relative unless a scheme appears before the first `/`, `?` or `#`.
    let has_scheme = url
        .find(':')
        .is_some_and(|i| !url[..i].contains(['/', '?', '#']) && !url[..i].is_empty());
    if !has_scheme {
        return url;
    }
    // Compare case-insensitively: `JaVaScRiPt:` is the oldest trick there is.
    let low = url.to_ascii_lowercase();
    if ALLOWED.iter().any(|p| low.starts_with(p)) {
        url
    } else {
        CowStr::Borrowed("#")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_gfm() {
        let h = render("# Hi\n\n- [x] done\n- [ ] todo\n\n~~gone~~");
        assert!(h.contains("<h1"), "{h}");
        assert!(h.contains("type=\"checkbox\""), "task lists on: {h}");
        assert!(h.contains("<del>gone</del>"), "strikethrough on: {h}");
    }

    #[test]
    fn headings_get_stable_anchors() {
        let h = render("## The Empty Box\n\ntext");
        assert!(h.contains(r#"id="the-empty-box""#), "{h}");
    }

    #[test]
    fn raw_html_is_dropped() {
        // Documents come from other people's repos. Their markup is not our markup.
        let h = render("hello <script>alert(1)</script> world\n\n<div onclick=x>y</div>");
        assert!(!h.contains("<script"), "{h}");
        assert!(!h.contains("onclick"), "{h}");
        assert!(h.contains("hello"), "prose survives: {h}");
    }

    #[test]
    fn executable_link_schemes_are_neutralised() {
        for bad in [
            "[click](javascript:alert(1))",
            "[click](JaVaScRiPt:alert(1))",
            "[click](data:text/html;base64,PHNjcmlwdD4=)",
            "![x](vbscript:msgbox)",
        ] {
            let h = render(bad);
            assert!(!h.to_ascii_lowercase().contains("javascript:"), "{bad} → {h}");
            assert!(!h.to_ascii_lowercase().contains("vbscript:"), "{bad} → {h}");
            assert!(!h.to_ascii_lowercase().contains("data:text/html"), "{bad} → {h}");
        }
        // …while the link text and ordinary targets survive.
        assert!(render("[click](javascript:x)").contains("click"));
        for ok in ["https://x.test/a", "mailto:a@b.test", "/relative", "#frag", "at://did:plc:z/c/r"] {
            let h = render(&format!("[t]({ok})"));
            assert!(h.contains(ok), "{ok} should pass through: {h}");
        }
    }

    #[test]
    fn smart_punctuation_is_on() {
        assert!(render(r#""quoted""#).contains('\u{201c}'));
    }
}
