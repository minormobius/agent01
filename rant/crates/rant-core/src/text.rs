//! Tokenisation. Everything in `predicates` reads the stream this module
//! produces, so its shape is the engine's real interface.
//!
//! The stream is a `Vec<Token>` of borrowed `&str` slices plus small flags.
//! Nothing here copies the prose, which is what keeps a 10k-word post inside
//! the microsecond budget: the cost is one pass over the bytes and one `Vec`
//! push per word.

/// One word, with the structural facts every predicate needs to know about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Token<'a> {
    /// The word with surrounding punctuation stripped: `world` from `"world!"`.
    pub word: &'a str,
    /// The word exactly as written, punctuation and all.
    pub raw: &'a str,
    /// Index of the paragraph this token belongs to.
    pub para: usize,
    /// Index of the sentence within the whole document.
    pub sentence: usize,
    /// This token ends a sentence (`. ! ? …` possibly followed by a quote).
    pub ends_sentence: bool,
    /// This token is the last one in its paragraph.
    pub ends_para: bool,
}

impl<'a> Token<'a> {
    /// Letters only, lowercased — the comparison key for stopword sets and
    /// frequency counts. Allocates; call it once per token per pass, not in a
    /// nested loop.
    pub fn key(&self) -> String {
        self.word
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '\'')
            .flat_map(|c| c.to_lowercase())
            .collect()
    }

    /// The fixation prefix length used by bionic-style rendering: roughly the
    /// first 40% of the word, floor 1, so short words bold one letter and long
    /// words never bold more than they leave.
    pub fn fixation(&self) -> usize {
        let n = self.word.chars().count();
        match n {
            0 => 0,
            1..=3 => 1,
            _ => (n * 2).div_ceil(5).min(n.saturating_sub(1)),
        }
    }
}

const SENTENCE_ENDERS: [char; 4] = ['.', '!', '?', '…'];

/// Split source text into the token stream.
///
/// Markdown is *not* stripped first — a predicate view of a post is a view of
/// what the author actually typed, and eating the syntax would make `**word**`
/// and `word` render at different lengths in RSVP. Fenced code blocks are the
/// one exception: they are skipped, because reading `};` one word at a time at
/// 500wpm is not a reading mode, it is a punishment.
pub fn tokenize(src: &str) -> Vec<Token<'_>> {
    let mut out: Vec<Token> = Vec::with_capacity(src.len() / 6 + 8);
    let mut para = 0usize;
    let mut sentence = 0usize;
    let mut in_fence = false;
    let mut blank_run = 0usize;
    // Index into `out` of the last token pushed, so we can retro-flag the end
    // of a paragraph once we discover the paragraph ended.
    let mut last = usize::MAX;

    for line in src.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if trimmed.is_empty() {
            blank_run += 1;
            if blank_run == 1 && last != usize::MAX {
                out[last].ends_para = true;
                para += 1;
                // A paragraph break also ends a sentence, even without a period.
                if !out[last].ends_sentence {
                    out[last].ends_sentence = true;
                    sentence += 1;
                }
            }
            continue;
        }
        blank_run = 0;

        for raw in trimmed.split_ascii_whitespace() {
            let word = raw.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'' && c != '-');
            if word.is_empty() && raw.chars().all(|c| !c.is_alphanumeric()) {
                // Pure punctuation (a lone `—`). Attach it to nothing; skip.
                continue;
            }
            let ends = ends_sentence(raw);
            out.push(Token {
                word: if word.is_empty() { raw } else { word },
                raw,
                para,
                sentence,
                ends_sentence: ends,
                ends_para: false,
            });
            last = out.len() - 1;
            if ends {
                sentence += 1;
            }
        }
    }

    if last != usize::MAX {
        out[last].ends_para = true;
        out[last].ends_sentence = true;
    }
    out
}

/// Does this raw token close a sentence?
///
/// Trailing quotes and brackets are skipped so `said."` counts. A single
/// trailing `.` on a known abbreviation does not, so `Dr. Who` stays one
/// sentence — the list is short and Anglocentric on purpose; getting this
/// perfect needs a model, and the cost of a false split here is one extra
/// pause in RSVP, not a wrong answer.
fn ends_sentence(raw: &str) -> bool {
    let stripped = raw.trim_end_matches(['"', '\'', ')', ']', '}', '»', '”', '’', '*', '_']);
    let Some(last) = stripped.chars().last() else {
        return false;
    };
    if !SENTENCE_ENDERS.contains(&last) {
        return false;
    }
    const ABBREV: [&str; 12] = [
        "mr.", "mrs.", "ms.", "dr.", "prof.", "st.", "e.g.", "i.e.", "etc.", "vs.", "cf.", "al.",
    ];
    let low = stripped.to_ascii_lowercase();
    !ABBREV.contains(&low.as_str())
}

/// Words in the source, counted the same way `tokenize` counts them so that a
/// reading-time estimate and an RSVP run never disagree.
pub fn word_count(src: &str) -> usize {
    tokenize(src).len()
}

/// A plain-text excerpt, markdown syntax removed, cut on a word boundary.
///
/// Used for `description` on the standard.site record, the `<meta>` tags and
/// the link card, so it must be plain text — the lexicon says `textContent`
/// and `description` carry no formatting.
pub fn excerpt(src: &str, max_chars: usize) -> String {
    let plain = strip_markdown(src);
    if plain.chars().count() <= max_chars {
        return plain;
    }
    let mut cut = 0usize;
    let mut last_space = 0usize;
    for (i, c) in plain.char_indices() {
        if cut >= max_chars {
            break;
        }
        if c.is_whitespace() {
            last_space = i;
        }
        cut = i;
    }
    let end = if last_space > max_chars / 2 { last_space } else { cut };
    let mut s = plain[..end].trim_end().to_string();
    s.push('…');
    s
}

/// Markdown → plain text, well enough for `textContent`, feeds and cards.
///
/// This is a lexer-free approximation on purpose. The full renderer is one
/// `pulldown-cmark` call away, but running it just to throw the tags away costs
/// an order of magnitude more than the string scan below, and every consumer of
/// this output is a place where "close enough" is the specification.
pub fn strip_markdown(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let mut in_fence = false;

    for line in src.lines() {
        let t = line.trim();
        if t.starts_with("```") || t.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || t.is_empty() {
            if !in_fence && !out.is_empty() && !out.ends_with(' ') {
                out.push(' ');
            }
            continue;
        }
        // Leading block syntax: headings, quotes, list bullets, rules.
        let t = t.trim_start_matches(['#', '>', ' ']);
        if t.chars().all(|c| c == '-' || c == '*' || c == '=' || c == '_') && t.len() >= 3 {
            continue;
        }
        let t = t
            .strip_prefix("- ")
            .or_else(|| t.strip_prefix("* "))
            .or_else(|| t.strip_prefix("+ "))
            .unwrap_or(t);

        strip_inline_into(&mut out, t);
        out.push(' ');
    }

    // Collapse the whitespace we just sprayed everywhere.
    let mut collapsed = String::with_capacity(out.len());
    let mut prev_space = true;
    for c in out.chars() {
        let is_space = c.is_whitespace();
        if is_space && prev_space {
            continue;
        }
        collapsed.push(if is_space { ' ' } else { c });
        prev_space = is_space;
    }
    collapsed.trim().to_string()
}

/// Strip inline emphasis, code ticks, and link/image syntax from one line.
fn strip_inline_into(out: &mut String, line: &str) {
    let b: Vec<char> = line.chars().collect();
    let mut i = 0usize;
    while i < b.len() {
        match b[i] {
            '*' | '_' | '`' | '~' => {
                i += 1;
            }
            '!' if i + 1 < b.len() && b[i + 1] == '[' => {
                // Image: drop the alt text and the target both — an image is
                // not words, and its alt text reads as an interruption.
                i += 1;
                i = skip_bracketed(&b, i);
                i = skip_paren(&b, i);
            }
            '[' => {
                // Link: keep the label, drop the target.
                let (text, next) = take_bracketed(&b, i);
                out.push_str(&text);
                i = skip_paren(&b, next);
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
}

fn take_bracketed(b: &[char], start: usize) -> (String, usize) {
    let mut depth = 0usize;
    let mut s = String::new();
    let mut i = start;
    while i < b.len() {
        match b[i] {
            '[' => {
                depth += 1;
                if depth > 1 {
                    s.push('[');
                }
            }
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return (s, i + 1);
                }
                s.push(']');
            }
            c => s.push(c),
        }
        i += 1;
    }
    (s, i)
}

fn skip_bracketed(b: &[char], start: usize) -> usize {
    take_bracketed(b, start).1
}

fn skip_paren(b: &[char], start: usize) -> usize {
    if start >= b.len() || b[start] != '(' {
        return start;
    }
    let mut depth = 0usize;
    let mut i = start;
    while i < b.len() {
        match b[i] {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return i + 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizes_with_structure() {
        let t = tokenize("One two. Three!\n\nFour five");
        assert_eq!(t.len(), 5);
        assert_eq!(t[0].word, "One");
        assert!(t[1].ends_sentence, "`two.` ends a sentence");
        assert!(t[2].ends_sentence, "`Three!` ends a sentence");
        assert!(t[2].ends_para, "…and its paragraph");
        assert_eq!((t[2].para, t[3].para), (0, 1));
        assert!(!t[3].ends_sentence, "`Four` ends nothing");
    }

    #[test]
    fn sentence_and_paragraph_indices() {
        let t = tokenize("A b. C d.\n\nE f.");
        assert_eq!(t.iter().map(|x| x.para).collect::<Vec<_>>(), vec![0, 0, 0, 0, 1, 1]);
        assert_eq!(t.iter().map(|x| x.sentence).collect::<Vec<_>>(), vec![0, 0, 1, 1, 2, 2]);
        assert!(t[3].ends_para);
        assert!(t[5].ends_para);
    }

    #[test]
    fn abbreviations_do_not_split_sentences() {
        let t = tokenize("Dr. Who arrives.");
        assert!(!t[0].ends_sentence);
        assert!(t[2].ends_sentence);
        assert_eq!(t.iter().filter(|x| x.ends_sentence).count(), 1);
    }

    #[test]
    fn code_fences_are_skipped() {
        let t = tokenize("before\n\n```\nlet x = 1;\n```\n\nafter");
        let words: Vec<_> = t.iter().map(|x| x.word).collect();
        assert_eq!(words, vec!["before", "after"]);
    }

    #[test]
    fn punctuation_is_stripped_from_word_but_kept_in_raw() {
        let t = tokenize(r#"He said, "world!""#);
        assert_eq!(t[1].word, "said");
        assert_eq!(t[1].raw, "said,");
        assert_eq!(t[2].word, "world");
    }

    #[test]
    fn fixation_never_bolds_the_whole_word() {
        for w in ["a", "at", "the", "reading", "extraordinary"] {
            let t = tokenize(w);
            let f = t[0].fixation();
            assert!(f >= 1 && f < w.chars().count().max(2), "{w} → {f}");
        }
    }

    #[test]
    fn strips_markdown_to_prose() {
        let md = "# Title\n\nSome **bold** and [a link](https://x.test) and `code`.\n\n![alt](img.png)\n\n- item\n";
        assert_eq!(strip_markdown(md), "Title Some bold and a link and code. item");
    }

    #[test]
    fn excerpt_cuts_on_a_word_boundary() {
        let e = excerpt("alpha beta gamma delta epsilon zeta eta theta", 20);
        assert!(e.ends_with('…'));
        assert!(!e.contains("epsilo…"), "must not cut mid-word: {e}");
    }
}
