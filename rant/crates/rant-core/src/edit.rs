//! Markdown editing operations: what the composer's formatting buttons do.
//!
//! Pure string maths over `(text, selection)`, so the whole toolbar is testable
//! in `cargo test` with no DOM. The browser layer is then reduced to reading a
//! textarea's selection, calling one function, and writing the result back.
//!
//! ## Offsets are UTF-16, and that is not a detail
//!
//! `HTMLTextAreaElement.selectionStart` counts **UTF-16 code units**. Rust
//! strings are indexed in **UTF-8 bytes**. For ASCII they agree, which is
//! exactly why this class of bug ships: everything works until somebody puts an
//! emoji or an accent before the cursor, and then bolding a word silently
//! corrupts the text (or panics on a non-char-boundary slice).
//!
//! So this module speaks UTF-16 at its edges and converts internally. Every
//! public function takes and returns UTF-16 offsets, and the tests include
//! multi-byte and astral characters on purpose.

/// The result of an edit: the new text and where the selection should land.
/// Offsets are UTF-16 code units, ready to hand back to a textarea.
#[derive(Debug, Clone, PartialEq)]
pub struct Edit {
    pub text: String,
    pub start: usize,
    pub end: usize,
}

/// What a toolbar button does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Bold,
    Italic,
    Strike,
    Code,
    Link,
    Heading,
    Quote,
    Bullet,
    Number,
    Rule,
}

impl Action {
    /// The registry. `/api/templates`' sibling — the worker renders the toolbar
    /// from this array, so a new action needs no HTML edit.
    pub const ALL: [Action; 10] = [
        Action::Bold,
        Action::Italic,
        Action::Strike,
        Action::Code,
        Action::Link,
        Action::Heading,
        Action::Quote,
        Action::Bullet,
        Action::Number,
        Action::Rule,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Action::Bold => "bold",
            Action::Italic => "italic",
            Action::Strike => "strike",
            Action::Code => "code",
            Action::Link => "link",
            Action::Heading => "heading",
            Action::Quote => "quote",
            Action::Bullet => "bullet",
            Action::Number => "number",
            Action::Rule => "rule",
        }
    }

    pub fn parse(s: &str) -> Option<Action> {
        Action::ALL.into_iter().find(|a| a.id() == s)
    }

    /// The button face. Short enough for a dense toolbar on a phone.
    pub fn label(self) -> &'static str {
        match self {
            Action::Bold => "B",
            Action::Italic => "I",
            Action::Strike => "S",
            Action::Code => "<>",
            Action::Link => "link",
            Action::Heading => "H",
            Action::Quote => "\u{201c}",
            Action::Bullet => "\u{2022}",
            Action::Number => "1.",
            Action::Rule => "\u{2014}",
        }
    }

    /// Tooltip, including the shortcut where there is one.
    pub fn title(self) -> &'static str {
        match self {
            Action::Bold => "Bold (Ctrl/⌘+B)",
            Action::Italic => "Italic (Ctrl/⌘+I)",
            Action::Strike => "Strikethrough",
            Action::Code => "Code (Ctrl/⌘+E)",
            Action::Link => "Link (Ctrl/⌘+K)",
            Action::Heading => "Heading",
            Action::Quote => "Quote",
            Action::Bullet => "Bulleted list",
            Action::Number => "Numbered list",
            Action::Rule => "Horizontal rule",
        }
    }

    /// The single-letter shortcut, if any. Matched against a Ctrl/Meta keydown.
    pub fn shortcut(self) -> Option<char> {
        match self {
            Action::Bold => Some('b'),
            Action::Italic => Some('i'),
            Action::Code => Some('e'),
            Action::Link => Some('k'),
            _ => None,
        }
    }

    /// Inline actions wrap a selection; block actions prefix whole lines.
    fn markers(self) -> Option<&'static str> {
        match self {
            Action::Bold => Some("**"),
            Action::Italic => Some("*"),
            Action::Strike => Some("~~"),
            Action::Code => Some("`"),
            _ => None,
        }
    }

    fn line_prefix(self) -> Option<&'static str> {
        match self {
            Action::Heading => Some("## "),
            Action::Quote => Some("> "),
            Action::Bullet => Some("- "),
            Action::Number => Some("1. "),
            _ => None,
        }
    }
}

// ─────────────────────────────────────────────────────── utf-16 ↔ utf-8 ──

/// UTF-16 offset → byte offset, clamped to the end of the string.
fn u16_to_byte(s: &str, target: usize) -> usize {
    if target == 0 {
        return 0;
    }
    let mut u16s = 0usize;
    for (byte, c) in s.char_indices() {
        if u16s >= target {
            return byte;
        }
        u16s += c.len_utf16();
    }
    s.len()
}

/// Byte offset → UTF-16 offset.
fn byte_to_u16(s: &str, target: usize) -> usize {
    let mut u16s = 0usize;
    for (byte, c) in s.char_indices() {
        if byte >= target {
            return u16s;
        }
        u16s += c.len_utf16();
    }
    u16s
}

// ────────────────────────────────────────────────────────────── the edit ──

/// Apply a formatting action to `text` with the selection `[start, end)`,
/// both in UTF-16 code units.
pub fn apply(action: Action, text: &str, start: usize, end: usize) -> Edit {
    let (start, end) = if start <= end { (start, end) } else { (end, start) };
    let a = u16_to_byte(text, start);
    let b = u16_to_byte(text, end);

    if let Some(m) = action.markers() {
        return inline(text, a, b, m);
    }
    if let Some(p) = action.line_prefix() {
        return block(text, a, b, p, action == Action::Number);
    }
    match action {
        Action::Link => link(text, a, b),
        Action::Rule => rule(text, a),
        _ => unreachable!("every action is inline, block, link or rule"),
    }
}

/// Wrap (or unwrap) the selection in `m`.
fn inline(text: &str, a: usize, b: usize, m: &str) -> Edit {
    let sel = &text[a..b];

    // Already wrapped INSIDE the selection: `**word**` selected → unwrap.
    if sel.len() >= m.len() * 2 && sel.starts_with(m) && sel.ends_with(m) {
        let inner = &sel[m.len()..sel.len() - m.len()];
        let out = format!("{}{}{}", &text[..a], inner, &text[b..]);
        let s = byte_to_u16(&out, a);
        let e = byte_to_u16(&out, a + inner.len());
        return Edit { text: out, start: s, end: e };
    }

    // Already wrapped OUTSIDE the selection: `**|word|**` → unwrap. This is the
    // case you hit when you double-click a bold word, which selects the word and
    // not its markers.
    //
    // Tested with `ends_with`/`starts_with` rather than by slicing back
    // `m.len()` bytes: `a` is a char boundary but `a - m.len()` need not be, and
    // slicing to it panics the moment a multi-byte character sits before the
    // selection. The exhaustive test found this on "🗯️" — in the module written
    // specifically to avoid that class of bug.
    if text[..a].ends_with(m) && text[b..].starts_with(m) {
        let out = format!("{}{}{}", &text[..a - m.len()], sel, &text[b + m.len()..]);
        let s = byte_to_u16(&out, a - m.len());
        let e = byte_to_u16(&out, a - m.len() + sel.len());
        return Edit { text: out, start: s, end: e };
    }

    // Wrap. With nothing selected, put the cursor between the markers.
    let out = format!("{}{m}{sel}{m}{}", &text[..a], &text[b..]);
    let inner_start = a + m.len();
    let s = byte_to_u16(&out, inner_start);
    let e = byte_to_u16(&out, inner_start + sel.len());
    Edit { text: out, start: s, end: e }
}

/// Prefix every line the selection touches, or strip the prefix if they all
/// already have it.
fn block(text: &str, a: usize, b: usize, prefix: &str, numbered: bool) -> Edit {
    let line_start = text[..a].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let line_end = text[b..].find('\n').map(|i| b + i).unwrap_or(text.len());
    let region = &text[line_start..line_end];

    // A numbered list is only "already applied" if every line starts with
    // `<digits>. `, not literally `1. `.
    let has = |l: &str| {
        if numbered {
            let digits: String = l.chars().take_while(|c| c.is_ascii_digit()).collect();
            !digits.is_empty() && l[digits.len()..].starts_with(". ")
        } else {
            l.starts_with(prefix)
        }
    };
    let all_have = region.lines().filter(|l| !l.trim().is_empty()).all(has);

    let mut out_lines: Vec<String> = Vec::new();
    let mut n = 1usize;
    for line in region.split('\n') {
        if line.trim().is_empty() {
            out_lines.push(line.to_string());
            continue;
        }
        if all_have {
            // Strip.
            let stripped = if numbered {
                let d: String = line.chars().take_while(|c| c.is_ascii_digit()).collect();
                line[d.len() + 2..].to_string()
            } else {
                line[prefix.len()..].to_string()
            };
            out_lines.push(stripped);
        } else if numbered {
            out_lines.push(format!("{n}. {line}"));
            n += 1;
        } else {
            out_lines.push(format!("{prefix}{line}"));
        }
    }

    let replaced = out_lines.join("\n");
    let out = format!("{}{}{}", &text[..line_start], replaced, &text[line_end..]);
    // Select the whole reformatted block: you can see what happened, and press
    // the button again to undo it.
    let s = byte_to_u16(&out, line_start);
    let e = byte_to_u16(&out, line_start + replaced.len());
    Edit { text: out, start: s, end: e }
}

/// `[label](url)`, with whichever part still needs typing left selected.
fn link(text: &str, a: usize, b: usize) -> Edit {
    let sel = &text[a..b];
    // A selected URL becomes the target; selected prose becomes the label.
    let looks_like_url = sel.starts_with("http://") || sel.starts_with("https://") || sel.starts_with("at://");

    let (label, url) = if sel.is_empty() {
        ("text", "url")
    } else if looks_like_url {
        ("text", sel)
    } else {
        (sel, "url")
    };
    let out = format!("{}[{label}]({url}){}", &text[..a], &text[b..]);

    // Select the placeholder that still needs replacing, so typing overwrites it.
    let (sel_a, sel_b) = if sel.is_empty() || looks_like_url {
        let s = a + 1;
        (s, s + label.len())
    } else {
        let s = a + 1 + label.len() + 2;
        (s, s + url.len())
    };
    let (start, end) = (byte_to_u16(&out, sel_a), byte_to_u16(&out, sel_b));
    Edit { text: out, start, end }
}

/// A horizontal rule on its own line, with exactly one blank line either side.
fn rule(text: &str, a: usize) -> Edit {
    let before = text[..a].trim_end_matches('\n');
    let after = text[a..].trim_start_matches('\n');
    let lead = if before.is_empty() { "" } else { "\n\n" };
    let out = format!("{before}{lead}---\n\n{after}");
    let cursor = before.len() + lead.len() + 5; // past "---\n\n"
    let u = byte_to_u16(&out, cursor);
    Edit { text: out, start: u, end: u }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ed(a: Action, t: &str, s: usize, e: usize) -> Edit {
        apply(a, t, s, e)
    }

    #[test]
    fn bold_wraps_a_selection_and_keeps_it_selected() {
        let r = ed(Action::Bold, "the cat sat", 4, 7);
        assert_eq!(r.text, "the **cat** sat");
        assert_eq!(&r.text[u16_to_byte(&r.text, r.start)..u16_to_byte(&r.text, r.end)], "cat");
    }

    #[test]
    fn bold_with_no_selection_leaves_the_cursor_inside() {
        let r = ed(Action::Bold, "ab", 1, 1);
        assert_eq!(r.text, "a****b");
        assert_eq!((r.start, r.end), (3, 3), "cursor between the markers");
    }

    #[test]
    fn bold_toggles_off_when_the_markers_are_inside_the_selection() {
        let r = ed(Action::Bold, "the **cat** sat", 4, 11);
        assert_eq!(r.text, "the cat sat");
        assert_eq!(&r.text[u16_to_byte(&r.text, r.start)..u16_to_byte(&r.text, r.end)], "cat");
    }

    #[test]
    fn bold_toggles_off_when_the_markers_are_outside_the_selection() {
        // Double-clicking a bold word selects the word, not its asterisks.
        let r = ed(Action::Bold, "the **cat** sat", 6, 9);
        assert_eq!(r.text, "the cat sat");
        assert_eq!(&r.text[u16_to_byte(&r.text, r.start)..u16_to_byte(&r.text, r.end)], "cat");
    }

    #[test]
    fn italic_and_bold_do_not_confuse_each_other() {
        let r = ed(Action::Italic, "a **b** c", 3, 7);
        // The selection is `**b**`; italic's marker is `*`, so it unwraps ONE pair.
        assert_eq!(r.text, "a *b* c");
        let back = ed(Action::Italic, &r.text, 2, 5);
        assert_eq!(back.text, "a b c");
    }

    #[test]
    fn code_and_strike_wrap_with_their_own_markers() {
        assert_eq!(ed(Action::Code, "let x", 0, 5).text, "`let x`");
        assert_eq!(ed(Action::Strike, "gone", 0, 4).text, "~~gone~~");
    }

    #[test]
    fn heading_prefixes_the_line_and_toggles() {
        let on = ed(Action::Heading, "title\nbody", 2, 2);
        assert_eq!(on.text, "## title\nbody");
        let off = ed(Action::Heading, &on.text, 3, 3);
        assert_eq!(off.text, "title\nbody");
    }

    #[test]
    fn block_actions_cover_every_line_the_selection_touches() {
        let r = ed(Action::Bullet, "one\ntwo\nthree", 1, 9);
        assert_eq!(r.text, "- one\n- two\n- three");
        let off = apply(Action::Bullet, &r.text, 1, 12);
        assert_eq!(off.text, "one\ntwo\nthree");
    }

    #[test]
    fn numbered_lists_renumber_and_strip_any_number() {
        let r = ed(Action::Number, "a\nb\nc", 0, 5);
        assert_eq!(r.text, "1. a\n2. b\n3. c");
        // Stripping must handle `2.` and `10.`, not just the literal `1. `.
        let off = apply(Action::Number, "1. a\n2. b\n10. c", 0, 15);
        assert_eq!(off.text, "a\nb\nc");
    }

    #[test]
    fn blank_lines_inside_a_block_selection_are_left_alone() {
        let r = ed(Action::Quote, "one\n\ntwo", 0, 8);
        assert_eq!(r.text, "> one\n\n> two");
    }

    #[test]
    fn link_puts_the_cursor_where_the_typing_goes() {
        // Prose selected → it becomes the label, the url is selected.
        let r = ed(Action::Link, "see the docs", 8, 12);
        assert_eq!(r.text, "see the [docs](url)");
        assert_eq!(&r.text[u16_to_byte(&r.text, r.start)..u16_to_byte(&r.text, r.end)], "url");

        // A URL selected → it becomes the target, the label is selected.
        let r = ed(Action::Link, "https://x.test", 0, 14);
        assert_eq!(r.text, "[text](https://x.test)");
        assert_eq!(&r.text[u16_to_byte(&r.text, r.start)..u16_to_byte(&r.text, r.end)], "text");

        // Nothing selected → a full skeleton with the label selected.
        let r = ed(Action::Link, "", 0, 0);
        assert_eq!(r.text, "[text](url)");
        assert_eq!(&r.text[u16_to_byte(&r.text, r.start)..u16_to_byte(&r.text, r.end)], "text");
    }

    #[test]
    fn rule_normalises_the_blank_lines_around_it() {
        assert_eq!(ed(Action::Rule, "a", 1, 1).text, "a\n\n---\n\n");
        assert_eq!(ed(Action::Rule, "", 0, 0).text, "---\n\n");
        // Existing newlines are collapsed, not doubled.
        assert_eq!(ed(Action::Rule, "a\n\n\nb", 3, 3).text, "a\n\n---\n\nb");
    }

    // ── the UTF-16 trap ──

    #[test]
    fn offsets_survive_multibyte_characters() {
        // "é" is 2 UTF-8 bytes but 1 UTF-16 unit. A byte-indexed implementation
        // selects the wrong word here — or panics on a non-char boundary.
        let t = "café crème";
        let r = ed(Action::Bold, t, 5, 10); // "crème" in UTF-16 units
        assert_eq!(r.text, "café **crème**");
    }

    #[test]
    fn offsets_survive_astral_characters() {
        // An emoji is 4 UTF-8 bytes and 2 UTF-16 units — the case that breaks
        // implementations that assume chars and code units are the same thing.
        let t = "🗯️ hello world";
        let hello = t.chars().take_while(|c| *c != 'h').map(|c| c.len_utf16()).sum::<usize>();
        let r = ed(Action::Bold, t, hello, hello + 5);
        assert_eq!(r.text, "🗯️ **hello** world");
    }

    #[test]
    fn round_trip_offset_conversion() {
        for s in ["", "ascii", "café", "🗯️x", "a🌍b🌍c", "日本語"] {
            let mut u = 0usize;
            for (byte, c) in s.char_indices() {
                assert_eq!(u16_to_byte(s, u), byte, "{s:?} at u16 {u}");
                assert_eq!(byte_to_u16(s, byte), u, "{s:?} at byte {byte}");
                u += c.len_utf16();
            }
            assert_eq!(u16_to_byte(s, u), s.len());
            assert_eq!(u16_to_byte(s, u + 99), s.len(), "past the end clamps");
        }
    }

    #[test]
    fn a_reversed_selection_is_normalised() {
        // Dragging right-to-left gives start > end.
        assert_eq!(ed(Action::Bold, "abc", 3, 0).text, "**abc**");
    }

    #[test]
    fn every_action_is_total_and_never_panics() {
        let samples = ["", "x", "one\ntwo", "**b**", "# h", "1. a", "🗯️", "café\n\ncrème"];
        for a in Action::ALL {
            for t in samples {
                let n = t.chars().map(|c| c.len_utf16()).sum::<usize>();
                for s in 0..=n {
                    for e in s..=n {
                        let r = apply(a, t, s, e);
                        // Offsets must be valid for the text we just produced.
                        let len = r.text.chars().map(|c| c.len_utf16()).sum::<usize>();
                        assert!(r.start <= len && r.end <= len, "{} {t:?} {s}..{e} → {r:?}", a.id());
                    }
                }
            }
        }
    }

    #[test]
    fn the_registry_is_unique_and_round_trips() {
        let mut seen = std::collections::BTreeSet::new();
        let mut keys = std::collections::BTreeSet::new();
        for a in Action::ALL {
            assert!(seen.insert(a.id()), "duplicate id {}", a.id());
            assert_eq!(Action::parse(a.id()), Some(a));
            assert!(!a.label().is_empty() && !a.title().is_empty());
            if let Some(k) = a.shortcut() {
                assert!(keys.insert(k), "duplicate shortcut {k}");
            }
        }
        assert_eq!(Action::parse("nope"), None);
    }
}
