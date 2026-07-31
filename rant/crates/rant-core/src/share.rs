//! Share links.
//!
//! A share button is a URL, so it belongs here rather than in the worker: pure
//! string work over `(title, url)`, testable without a browser or a network.
//!
//! The only interesting parts are the two ways this silently goes wrong — a
//! query value that is not properly percent-encoded (an `&` or a `#` in a title
//! truncates the shared text at that character) and a post that exceeds
//! Bluesky's limit (the composer opens with the text already too long and the
//! post button disabled). Both are tested.

/// Bluesky's post limit. Counted in graphemes there; we clamp on `char`s, which
/// is never an underestimate — a grapheme is one or more `char`s — so staying
/// under this bound in `char`s guarantees staying under it in graphemes.
pub const MAX_POST: usize = 300;

/// A Bluesky composer, pre-filled with the post's title and link.
///
/// The URL goes last and on its own line: Bluesky builds the link card from the
/// final URL in the text, and a card is the whole reason to have shared it from
/// a page that renders one.
pub fn bsky_compose(title: &str, url: &str) -> String {
    format!("https://bsky.app/intent/compose?text={}", encode(&compose_text(title, url)))
}

/// The text the composer opens with, clamped to fit.
///
/// The URL is never truncated — a shortened link is a broken link, so it is the
/// title that gives way.
pub fn compose_text(title: &str, url: &str) -> String {
    let title = title.trim();
    if title.is_empty() {
        return url.to_string();
    }
    // 2 for the blank line between them.
    let room = MAX_POST.saturating_sub(url.chars().count() + 2);
    if room == 0 {
        return url.to_string();
    }
    format!("{}\n\n{}", clamp_chars(title, room), url)
}

/// Truncate to `max` chars, on a char boundary, with an ellipsis that is itself
/// counted. Slicing by bytes here is the classic way to panic on the first
/// accented character in somebody's title.
fn clamp_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    if max == 0 {
        return String::new();
    }
    let mut out: String = s.chars().take(max - 1).collect();
    // Do not leave a dangling space in front of the ellipsis.
    while out.ends_with(char::is_whitespace) {
        out.pop();
    }
    out.push('…');
    out
}

/// Percent-encode a query-string value.
///
/// Everything outside the unreserved set goes, including `+` — which some
/// encoders leave alone and which then decodes to a space.
pub fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Decode enough to assert round trips. Test-only, deliberately strict.
    fn decode(s: &str) -> String {
        let b = s.as_bytes();
        let mut out: Vec<u8> = Vec::new();
        let mut i = 0;
        while i < b.len() {
            if b[i] == b'%' && i + 2 < b.len() {
                out.push(u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap(), 16).unwrap());
                i += 3;
            } else {
                out.push(b[i]);
                i += 1;
            }
        }
        String::from_utf8(out).unwrap()
    }

    #[test]
    fn the_composer_url_carries_title_and_link() {
        let u = bsky_compose("Requiem for an Internet", "https://rant.mino.mobi/requiem/");
        assert!(u.starts_with("https://bsky.app/intent/compose?text="));
        let text = decode(u.strip_prefix("https://bsky.app/intent/compose?text=").unwrap());
        assert_eq!(text, "Requiem for an Internet\n\nhttps://rant.mino.mobi/requiem/");
    }

    /// The bug this whole module exists to prevent: an unencoded `&` or `#`
    /// silently truncates the shared text at that character.
    #[test]
    fn query_breaking_characters_are_encoded() {
        let u = bsky_compose("Q&A: #1, 100% done", "https://rant.mino.mobi/qa/");
        for bad in ['&', '#', '%', '?', '='] {
            assert!(
                !u[u.find("text=").unwrap() + 5..].contains(bad) || bad == '%',
                "{bad} survived into the query"
            );
        }
        assert!(decode(u.split_once("text=").unwrap().1).starts_with("Q&A: #1, 100% done"));
    }

    #[test]
    fn spaces_and_plus_do_not_become_each_other() {
        assert_eq!(encode("a b+c"), "a%20b%2Bc");
        assert_eq!(decode(&encode("a b+c")), "a b+c");
    }

    #[test]
    fn utf8_survives() {
        for s in ["🗯️ ranting", "café", "日本語", "e\u{0301}"] {
            assert_eq!(decode(&encode(s)), s, "{s} did not round trip");
        }
    }

    #[test]
    fn a_long_title_gives_way_and_the_url_never_does() {
        let url = "https://rant.mino.mobi/a-very-long-slug-that-goes-on/";
        let text = compose_text(&"word ".repeat(200), url);
        assert!(text.chars().count() <= MAX_POST, "{} chars", text.chars().count());
        assert!(text.ends_with(url), "the url was truncated: {text}");
        assert!(text.contains('…'));
    }

    /// A URL alone longer than the limit is not something we can fix by
    /// truncating the title, and truncating the URL would be worse.
    #[test]
    fn an_absurd_url_is_left_alone() {
        let url = format!("https://rant.mino.mobi/{}/", "x".repeat(400));
        assert_eq!(compose_text("title", &url), url);
    }

    #[test]
    fn an_empty_title_is_just_the_link() {
        assert_eq!(compose_text("   ", "https://rant.mino.mobi/x/"), "https://rant.mino.mobi/x/");
    }

    /// Clamping is where a byte-slice would panic. Every truncation point of a
    /// multi-byte title, so a boundary bug cannot hide in one arithmetic case.
    #[test]
    fn clamping_never_splits_a_char() {
        for title in ["🗯️🗯️🗯️ a café in 日本", "ééééééééé", "a🗯️b🗯️c"] {
            for max in 0..=title.chars().count() + 2 {
                let out = clamp_chars(title, max);
                assert!(out.chars().count() <= max.max(1), "{title:?} at {max}: {out:?}");
            }
        }
    }

    #[test]
    fn clamping_leaves_no_space_before_the_ellipsis() {
        assert!(!clamp_chars("one two three", 8).contains(" …"));
    }
}
