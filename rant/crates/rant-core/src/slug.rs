//! Slugs and HTML escaping. Both are hot — every heading anchor and every
//! escaped character in a rendered page goes through here — so both are single
//! passes with a pre-sized buffer and no regex, no allocation per character.

/// ASCII-lowercase, hyphen-joined, no leading/trailing/repeated hyphens.
///
/// Non-ASCII is kept as-is rather than transliterated: a post titled `Ürök` gets
/// `ürök`, not `rk`. Percent-encoding in the URL is the browser's problem, and a
/// mangled slug is worse than a long one.
pub fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut pending_hyphen = false;
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            if pending_hyphen && !out.is_empty() {
                out.push('-');
            }
            pending_hyphen = false;
            out.push(c.to_ascii_lowercase());
        } else if c.is_alphanumeric() {
            // Non-ASCII letter/digit — keep it, lowercased.
            if pending_hyphen && !out.is_empty() {
                out.push('-');
            }
            pending_hyphen = false;
            out.extend(c.to_lowercase());
        } else {
            pending_hyphen = true;
        }
    }
    out
}

/// Escape for HTML text nodes and double-quoted attribute values.
///
/// Covers `&<>"'` — the attribute-safe set, so one function serves both
/// positions and there is no chance of picking the wrong one at a call site.
pub fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    esc_into(&mut out, s);
    out
}

pub fn esc_into(out: &mut String, s: &str) {
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
}

/// Escape for XML character data in the feeds. Same set minus the apostrophe
/// numeric entity, which is legal but noisy in an RSS reader that echoes raw.
pub fn xml_esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            // Control characters are not representable in XML 1.0 at all;
            // dropping them beats emitting a feed no parser will accept.
            c if (c as u32) < 0x20 && c != '\n' && c != '\t' && c != '\r' => {}
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs() {
        assert_eq!(slugify("On the Tyranny of the Empty Box"), "on-the-tyranny-of-the-empty-box");
        assert_eq!(slugify("  --hello--  world!!  "), "hello-world");
        assert_eq!(slugify("C++ & Rust"), "c-rust");
        assert_eq!(slugify(""), "");
        assert_eq!(slugify("!!!"), "");
        assert_eq!(slugify("Ürök"), "ürök", "non-ASCII survives rather than vanishing");
    }

    #[test]
    fn escaping_is_attribute_safe() {
        assert_eq!(esc(r#"<a href="x">&'"#), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    }

    #[test]
    fn xml_drops_illegal_control_chars() {
        assert_eq!(xml_esc("a\u{7}b"), "ab");
        assert_eq!(xml_esc("a\nb"), "a\nb");
    }
}
