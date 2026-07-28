//! **Predicates — the weird ways to view the words.**
//!
//! `read.mino.mobi` proved the idea: the same text is a different artefact
//! depending on how you make it arrive. RSVP is not "reading faster", it is a
//! different relationship to the sentence. This module generalises that from a
//! reader's mode switch into a first-class, addressable, composable property of
//! a document.
//!
//! A **predicate** is a pure function `&[Token] -> Vec<Cell>`. It says one true
//! thing about the words. Because they are pure and total, they compose: the URL
//! `?view=skeleton+bionic` runs `skeleton` and then `bionic` over its output,
//! and the result is still just cells. Because they are server-side, every view
//! has a URL, renders without JavaScript, and is legible to a crawler, a screen
//! reader, and an agent alike.
//!
//! Five are ports of `/read`'s reading modes. Six are new — the ones that only
//! make sense once views are addressable rather than buttons.

use crate::slug::esc;
use crate::text::Token;

/// One unit of a rendered view: a word plus what the predicate decided about it.
#[derive(Debug, Clone, PartialEq)]
pub struct Cell {
    pub text: String,
    /// The fixation prefix length, if this view wants one bolded (bionic).
    pub fixate: usize,
    /// 0.0–1.0. Views that dim, heat, or fade use this; `1.0` is fully present.
    pub weight: f32,
    /// Dwell time in milliseconds for time-based views (RSVP, crawl).
    pub dwell_ms: u32,
    /// Break *after* this cell.
    pub br: Break,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Break {
    None,
    Sentence,
    Paragraph,
}

impl Cell {
    fn plain(text: impl Into<String>) -> Cell {
        Cell { text: text.into(), fixate: 0, weight: 1.0, dwell_ms: 0, br: Break::None }
    }
}

/// The eleven predicates. `Predicate::ALL` is the registry the `/api/predicates`
/// endpoint and the docs both read from, so there is exactly one list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Predicate {
    Plain,
    Bionic,
    Rsvp,
    Crawl,
    Memorize,
    Skeleton,
    Spine,
    Cadence,
    Hapax,
    Concordance,
    Reverse,
}

impl Predicate {
    pub const ALL: [Predicate; 11] = [
        Predicate::Plain,
        Predicate::Bionic,
        Predicate::Rsvp,
        Predicate::Crawl,
        Predicate::Memorize,
        Predicate::Skeleton,
        Predicate::Spine,
        Predicate::Cadence,
        Predicate::Hapax,
        Predicate::Concordance,
        Predicate::Reverse,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Predicate::Plain => "plain",
            Predicate::Bionic => "bionic",
            Predicate::Rsvp => "rsvp",
            Predicate::Crawl => "crawl",
            Predicate::Memorize => "memorize",
            Predicate::Skeleton => "skeleton",
            Predicate::Spine => "spine",
            Predicate::Cadence => "cadence",
            Predicate::Hapax => "hapax",
            Predicate::Concordance => "concordance",
            Predicate::Reverse => "reverse",
        }
    }

    pub fn parse(s: &str) -> Option<Predicate> {
        Predicate::ALL.into_iter().find(|p| p.id() == s.trim().to_ascii_lowercase())
    }

    /// One line, shown in the view switcher and returned by `/api/predicates`.
    pub fn blurb(self) -> &'static str {
        match self {
            Predicate::Plain => "The words, as written.",
            Predicate::Bionic => "Fixation prefixes bolded — the eye lands, the rest is inferred.",
            Predicate::Rsvp => "One chunk at a time, in place, with a dwell computed per word.",
            Predicate::Crawl => "A teleprompter. The text moves; your eyes do not.",
            Predicate::Memorize => "Six rounds of progressive erasure, function words first.",
            Predicate::Skeleton => "Function words removed. What is left is what it is about.",
            Predicate::Spine => "The first sentence of every paragraph, and nothing else.",
            Predicate::Cadence => "Not the words — the shape. One bar per sentence, by length.",
            Predicate::Hapax => "Weighted by rarity within the document. The once-only words burn.",
            Predicate::Concordance => "Every word, alphabetised, with its neighbours. A book as an index.",
            Predicate::Reverse => "Last sentence first. Arguments read strangely from the conclusion.",
        }
    }

    /// Does this view animate in the browser, or is it static HTML?
    ///
    /// The server renders every view either way — the timed ones just also
    /// carry `dwell_ms`, and the browser module plays them if it is present.
    /// Without JavaScript, `rsvp` degrades to a numbered word list, which is
    /// still a legitimate (if patient) way to read.
    pub fn is_timed(self) -> bool {
        matches!(self, Predicate::Rsvp | Predicate::Crawl)
    }
}

/// Function words. Dropped by `skeleton`, erased first by `memorize`.
///
/// Ported from `read/js/reader-memorize.js` so the two surfaces agree about
/// what a content word is; a word that vanishes in Read's round 1 vanishes in
/// Rant's `skeleton`.
const FUNCTION_WORDS: &[&str] = &[
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
    "from", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "shall", "may", "might", "can", "it", "its", "this",
    "that", "these", "those", "he", "she", "they", "we", "you", "i", "me", "him", "her", "us",
    "them", "my", "your", "his", "our", "their", "who", "which", "what", "where", "when", "how",
    "not", "no", "nor", "so", "if", "as", "than", "then", "up", "out", "into", "about", "over",
    "just", "also", "very", "all", "each", "every", "any", "some", "such", "own", "too", "more",
    "most", "much", "many", "here", "there", "now", "still", "yet", "even", "only", "well", "back",
    "like", "upon", "am",
];

/// Second erasure round in `memorize`: common but contentful words.
const COMMON_WORDS: &[&str] = &[
    "said", "say", "says", "go", "goes", "went", "gone", "come", "came", "take", "took", "taken",
    "make", "made", "get", "got", "give", "gave", "know", "knew", "think", "thought", "see", "saw",
    "seen", "look", "looked", "find", "found", "tell", "told", "want", "wanted", "seem", "seemed",
    "leave", "left", "call", "called", "keep", "kept", "let", "begin", "began", "show", "showed",
    "hear", "heard", "play", "played", "run", "ran", "move", "moved", "live", "lived", "long",
    "great", "little", "old", "new", "good", "same", "other", "last", "first", "next", "right",
    "hand", "turn", "turned", "put", "set", "around", "through", "before", "after", "while",
    "since", "between", "under", "without", "against", "again", "never", "always", "nothing",
    "something", "everything", "another", "because", "until", "though", "across", "along", "away",
    "down", "off", "once", "soon", "enough", "rather", "quite", "almost", "already", "often",
    "ever", "far", "near", "however", "perhaps", "whether", "became", "both", "few", "part", "way",
];

fn is_function_word(key: &str) -> bool {
    FUNCTION_WORDS.contains(&key)
}

/// Options a predicate may read. Everything has a defensible default so that a
/// bare `?view=rsvp` works and nobody has to learn a query language.
#[derive(Debug, Clone, Copy)]
pub struct Opts {
    /// RSVP / crawl target rate.
    pub wpm: u32,
    /// RSVP chunking: keep grouping words until this many characters.
    pub min_chars: usize,
    /// `memorize` erasure round, 0–5.
    pub round: u8,
}

impl Default for Opts {
    fn default() -> Self {
        // 350wpm is Read's default landing speed: brisk but not a stunt.
        Opts { wpm: 350, min_chars: 0, round: 1 }
    }
}

/// Run one predicate over a token stream.
pub fn apply<'a>(p: Predicate, tokens: &[Token<'a>], o: &Opts) -> Vec<Cell> {
    match p {
        Predicate::Plain => plain(tokens),
        Predicate::Bionic => bionic(tokens),
        Predicate::Rsvp => rsvp(tokens, o),
        Predicate::Crawl => crawl(tokens, o),
        Predicate::Memorize => memorize(tokens, o.round),
        Predicate::Skeleton => skeleton(tokens),
        Predicate::Spine => spine(tokens),
        Predicate::Cadence => cadence(tokens),
        Predicate::Hapax => hapax(tokens),
        Predicate::Concordance => concordance(tokens),
        Predicate::Reverse => reverse(tokens),
    }
}

/// Run a composed chain: `skeleton+bionic` is `bionic(skeleton(tokens))`.
///
/// Composition is a re-tokenisation between stages rather than a `Cell -> Cell`
/// map, because the second predicate needs real sentence structure to work with
/// and the first may have deleted half of it. The round trip through text is a
/// few microseconds and buys correctness.
pub fn apply_chain(chain: &[Predicate], tokens: &[Token<'_>], o: &Opts) -> Vec<Cell> {
    match chain {
        [] => plain(tokens),
        [one] => apply(*one, tokens, o),
        [first, rest @ ..] => {
            let cells = apply(*first, tokens, o);
            let intermediate = cells_to_text(&cells);
            let retokenized = crate::text::tokenize(&intermediate);
            apply_chain(rest, &retokenized, o)
        }
    }
}

/// Parse `?view=skeleton+bionic` into a chain. Unknown names are skipped rather
/// than erroring: a link from a future version of this page should still render.
pub fn parse_chain(s: &str) -> Vec<Predicate> {
    s.split(['+', ',', ' '])
        .filter(|t| !t.is_empty())
        .filter_map(Predicate::parse)
        .take(4)
        .collect()
}

/// Flatten cells back to text, preserving the breaks so re-tokenising recovers
/// the sentence and paragraph structure.
fn cells_to_text(cells: &[Cell]) -> String {
    let mut s = String::with_capacity(cells.iter().map(|c| c.text.len() + 1).sum());
    for c in cells {
        s.push_str(&c.text);
        match c.br {
            Break::Paragraph => s.push_str("\n\n"),
            Break::Sentence | Break::None => s.push(' '),
        }
    }
    s
}

fn brk(t: &Token) -> Break {
    if t.ends_para {
        Break::Paragraph
    } else if t.ends_sentence {
        Break::Sentence
    } else {
        Break::None
    }
}

// ────────────────────────────────────────────────────────── the predicates ──

fn plain(tokens: &[Token<'_>]) -> Vec<Cell> {
    tokens
        .iter()
        .map(|t| Cell { br: brk(t), ..Cell::plain(t.raw) })
        .collect()
}

fn bionic(tokens: &[Token<'_>]) -> Vec<Cell> {
    tokens
        .iter()
        .map(|t| Cell { fixate: t.fixation(), br: brk(t), ..Cell::plain(t.raw) })
        .collect()
}

/// Chunk into RSVP frames and compute each frame's dwell.
///
/// The dwell model is Read's, restated: a base interval from the target rate,
/// scaled by chunk length, then *lengthened* at punctuation. The pauses are the
/// whole trick — RSVP without them is a blur, RSVP with them reads as speech.
fn rsvp(tokens: &[Token<'_>], o: &Opts) -> Vec<Cell> {
    let base_ms = (60_000.0 / o.wpm.max(60) as f32).max(30.0);
    let mut out = Vec::new();
    let mut buf: Vec<&Token> = Vec::new();
    let mut buf_chars = 0usize;

    for (i, t) in tokens.iter().enumerate() {
        buf.push(t);
        buf_chars += t.raw.chars().count();
        let boundary = t.ends_sentence || t.ends_para;
        let met_min = buf_chars >= o.min_chars;
        if met_min || boundary || i == tokens.len() - 1 {
            let text = buf.iter().map(|x| x.raw).collect::<Vec<_>>().join(" ");
            let words = buf.len() as f32;
            // Long chunks get more than their share: reading 4 words at once is
            // slower per word than reading 1, not faster.
            let mut ms = base_ms * words * (1.0 + 0.06 * (buf_chars as f32 / 5.0 - words));
            if t.ends_sentence {
                ms *= 1.9;
            }
            if t.ends_para {
                ms *= 2.6;
            }
            out.push(Cell {
                text,
                fixate: buf[0].fixation(),
                weight: 1.0,
                dwell_ms: ms.clamp(40.0, 4000.0) as u32,
                br: brk(t),
            });
            buf.clear();
            buf_chars = 0;
        }
    }
    out
}

/// Crawl is RSVP's dwell model without the chunking: every word gets its own
/// cell and its own time, and the browser scrolls rather than replaces.
fn crawl(tokens: &[Token<'_>], o: &Opts) -> Vec<Cell> {
    let base_ms = (60_000.0 / o.wpm.max(60) as f32).max(30.0);
    tokens
        .iter()
        .map(|t| {
            let mut ms = base_ms * (0.6 + 0.4 * (t.word.chars().count() as f32 / 5.0));
            if t.ends_sentence {
                ms *= 1.6;
            }
            Cell {
                dwell_ms: ms.clamp(30.0, 2500.0) as u32,
                br: brk(t),
                ..Cell::plain(t.raw)
            }
        })
        .collect()
}

/// Progressive erasure, six rounds.
///
/// 0 full · 1 function words gone · 2 common words gone · 3 only distinctive
/// words · 4 first letters only · 5 blank. Erased words become a `_` run of the
/// right width rather than disappearing, so the shape of the sentence — which
/// is most of what recall hangs on — survives every round but the last.
fn memorize(tokens: &[Token<'_>], round: u8) -> Vec<Cell> {
    tokens
        .iter()
        .map(|t| {
            let key = t.key();
            let n = t.word.chars().count();
            let hide = match round {
                0 => false,
                1 => is_function_word(&key),
                2 => is_function_word(&key) || COMMON_WORDS.contains(&key.as_str()),
                3 => is_function_word(&key) || COMMON_WORDS.contains(&key.as_str()) || n <= 4,
                _ => true,
            };
            let text = if !hide {
                t.raw.to_string()
            } else if round == 4 {
                t.word.chars().next().map(|c| c.to_string()).unwrap_or_default()
            } else if round >= 5 {
                "_".repeat(n.max(1))
            } else {
                "·".repeat(n.max(1))
            };
            Cell {
                weight: if hide { 0.28 } else { 1.0 },
                br: brk(t),
                ..Cell::plain(text)
            }
        })
        .collect()
}

/// Drop the function words. What survives is the argument.
fn skeleton(tokens: &[Token<'_>]) -> Vec<Cell> {
    let mut out: Vec<Cell> = Vec::new();
    for t in tokens {
        if is_function_word(&t.key()) {
            // The dropped word's break has to survive it, or the paragraph
            // structure quietly collapses whenever a paragraph ends on "it".
            if let Some(prev) = out.last_mut() {
                if brk(t) != Break::None && prev.br == Break::None {
                    prev.br = brk(t);
                }
            }
            continue;
        }
        out.push(Cell { br: brk(t), ..Cell::plain(t.word) });
    }
    out
}

/// The first sentence of every paragraph. The oldest skim there is, made into a
/// permalink.
fn spine(tokens: &[Token<'_>]) -> Vec<Cell> {
    let mut out = Vec::new();
    let mut current_para = usize::MAX;
    let mut taking = false;
    for t in tokens {
        if t.para != current_para {
            current_para = t.para;
            taking = true;
        }
        if taking {
            out.push(Cell { br: if t.ends_sentence { Break::Paragraph } else { Break::None }, ..Cell::plain(t.raw) });
            if t.ends_sentence {
                taking = false;
            }
        }
    }
    out
}

/// Not the words — the shape. One cell per sentence, its text a bar whose
/// length is the sentence's word count and whose weight is that count
/// normalised. A long essay's rhythm becomes visible in one screen.
fn cadence(tokens: &[Token<'_>]) -> Vec<Cell> {
    let mut lengths: Vec<(usize, usize)> = Vec::new(); // (sentence, words)
    for t in tokens {
        match lengths.last_mut() {
            Some((s, n)) if *s == t.sentence => *n += 1,
            _ => lengths.push((t.sentence, 1)),
        }
    }
    let max = lengths.iter().map(|(_, n)| *n).max().unwrap_or(1).max(1);
    lengths
        .iter()
        .map(|(_, n)| {
            let w = *n as f32 / max as f32;
            Cell {
                text: format!("{} {n}", "▇".repeat((w * 28.0).round().max(1.0) as usize)),
                fixate: 0,
                weight: w,
                dwell_ms: 0,
                br: Break::Paragraph,
            }
        })
        .collect()
}

/// Weight every word by how rare it is *inside this document*. Words used once
/// (hapax legomena) burn at full weight; the fifteenth "however" is nearly
/// invisible. A vocabulary X-ray of your own prose.
fn hapax(tokens: &[Token<'_>]) -> Vec<Cell> {
    let keys: Vec<String> = tokens.iter().map(|t| t.key()).collect();
    let mut sorted: Vec<&str> = keys.iter().map(|s| s.as_str()).collect();
    sorted.sort_unstable();

    // Frequency by binary search over the sorted key list: O(n log n) total and
    // no HashMap, which keeps the wasm bundle free of the SipHash machinery.
    let freq = |k: &str| -> usize {
        let lo = sorted.partition_point(|x| *x < k);
        let hi = sorted.partition_point(|x| *x <= k);
        hi - lo
    };

    tokens
        .iter()
        .zip(&keys)
        .map(|(t, k)| {
            let f = freq(k).max(1) as f32;
            Cell {
                weight: (1.0 / f).clamp(0.12, 1.0),
                br: brk(t),
                ..Cell::plain(t.raw)
            }
        })
        .collect()
}

/// A keyword-in-context index of the document's own vocabulary: every
/// content word, alphabetised, with the words either side of its first use.
/// The book as its own index — which is a genuinely different thing to read.
fn concordance(tokens: &[Token<'_>]) -> Vec<Cell> {
    let mut rows: Vec<(String, String)> = Vec::new();
    for (i, t) in tokens.iter().enumerate() {
        let k = t.key();
        if k.len() < 4 || is_function_word(&k) {
            continue;
        }
        if rows.iter().any(|(key, _)| *key == k) {
            continue;
        }
        let lo = i.saturating_sub(4);
        let hi = (i + 5).min(tokens.len());
        let left: Vec<&str> = tokens[lo..i].iter().map(|x| x.raw).collect();
        let right: Vec<&str> = tokens[i + 1..hi].iter().map(|x| x.raw).collect();
        rows.push((k, format!("…{} ⟨{}⟩ {}…", left.join(" "), t.raw, right.join(" "))));
    }
    rows.sort_by(|a, b| a.0.cmp(&b.0));
    rows.into_iter()
        .map(|(_, line)| Cell { br: Break::Paragraph, ..Cell::plain(line) })
        .collect()
}

/// Last sentence first, words in order within each sentence. Reading an
/// argument backwards from its conclusion is a real editing technique — it
/// strips the momentum that hides a bad step.
fn reverse(tokens: &[Token<'_>]) -> Vec<Cell> {
    let mut sentences: Vec<Vec<&Token>> = Vec::new();
    for t in tokens {
        match sentences.last_mut() {
            Some(last) if last.last().is_some_and(|p| p.sentence == t.sentence) => last.push(t),
            _ => sentences.push(vec![t]),
        }
    }
    sentences.reverse();
    let mut out = Vec::new();
    for s in sentences {
        let n = s.len();
        for (i, t) in s.into_iter().enumerate() {
            out.push(Cell {
                br: if i + 1 == n { Break::Paragraph } else { Break::None },
                ..Cell::plain(t.raw)
            });
        }
    }
    out
}

// ─────────────────────────────────────────────────────────────── rendering ──

/// Cells → HTML.
///
/// Server-rendered for every view, including the timed ones: the markup is the
/// no-JavaScript fallback *and* the data the browser module animates, so there
/// is one representation rather than two that can drift.
pub fn cells_to_html(p: Predicate, cells: &[Cell]) -> String {
    let mut out = String::with_capacity(cells.len() * 24 + 64);
    out.push_str(&format!(r#"<div class="view view-{}" data-view="{}">"#, p.id(), p.id()));
    out.push_str("<p>");

    for c in cells {
        out.push_str("<span class=\"w\"");
        if c.weight < 0.999 {
            out.push_str(&format!(" style=\"--w:{:.2}\"", c.weight));
        }
        if c.dwell_ms > 0 {
            out.push_str(&format!(" data-ms=\"{}\"", c.dwell_ms));
        }
        out.push('>');

        if c.fixate > 0 && c.fixate < c.text.chars().count() {
            let split = c.text.char_indices().nth(c.fixate).map(|(i, _)| i).unwrap_or(0);
            out.push_str("<b>");
            out.push_str(&esc(&c.text[..split]));
            out.push_str("</b>");
            out.push_str(&esc(&c.text[split..]));
        } else {
            out.push_str(&esc(&c.text));
        }

        out.push_str("</span>");
        match c.br {
            Break::None => out.push(' '),
            Break::Sentence => out.push_str("<wbr> "),
            Break::Paragraph => out.push_str("</p><p>"),
        }
    }

    out.push_str("</p></div>");
    out
}

/// Cells → plain text. What `/api/post/<slug>?view=…&format=text` and the agent
/// endpoints return, and what a composed chain feeds to its next stage.
pub fn cells_to_plain(cells: &[Cell]) -> String {
    cells_to_text(cells).trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::tokenize;

    const SAMPLE: &str = "The box is empty and it is a problem. I hate the box.\n\nBoxes proliferate. They multiply in the dark.";

    fn cells(p: Predicate) -> Vec<Cell> {
        apply(p, &tokenize(SAMPLE), &Opts::default())
    }

    #[test]
    fn every_predicate_is_total_and_nonempty() {
        for p in Predicate::ALL {
            let c = cells(p);
            assert!(!c.is_empty(), "{} produced nothing", p.id());
            let html = cells_to_html(p, &c);
            assert!(html.contains(p.id()), "{} html missing its marker", p.id());
        }
    }

    #[test]
    fn every_predicate_survives_the_empty_document() {
        for p in Predicate::ALL {
            let c = apply(p, &tokenize(""), &Opts::default());
            assert!(c.is_empty(), "{} invented cells from nothing", p.id());
            // …and rendering nothing must not panic.
            let _ = cells_to_html(p, &c);
        }
    }

    #[test]
    fn plain_is_lossless() {
        let c = cells(Predicate::Plain);
        let round = cells_to_plain(&c);
        for w in ["empty", "problem", "proliferate", "dark"] {
            assert!(round.contains(w), "{w} lost in round trip");
        }
    }

    #[test]
    fn bionic_bolds_a_prefix_and_never_the_whole_word() {
        let html = cells_to_html(Predicate::Bionic, &cells(Predicate::Bionic));
        assert!(html.contains("<b>"), "{html}");
        assert!(!html.contains("<b>empty</b>"), "whole word bolded: {html}");
    }

    #[test]
    fn skeleton_drops_function_words_and_keeps_content() {
        let out = cells_to_plain(&cells(Predicate::Skeleton));
        assert!(!out.split_whitespace().any(|w| w == "the"), "{out}");
        assert!(out.contains("box") && out.contains("proliferate"), "{out}");
    }

    #[test]
    fn skeleton_preserves_paragraph_breaks_across_dropped_words() {
        // "…in the dark." — the paragraph's last token is a content word, but
        // the regression this guards is a paragraph ending on a function word.
        let out = cells_to_plain(&apply(
            Predicate::Skeleton,
            &tokenize("Content words here and it.\n\nSecond paragraph."),
            &Opts::default(),
        ));
        assert!(out.contains("\n\n"), "paragraph break lost: {out:?}");
    }

    #[test]
    fn spine_takes_first_sentence_of_each_paragraph_only() {
        let out = cells_to_plain(&cells(Predicate::Spine));
        assert!(out.contains("empty"), "{out}");
        assert!(!out.contains("hate"), "second sentence leaked: {out}");
        assert!(out.contains("proliferate"), "{out}");
        assert!(!out.contains("multiply"), "second sentence leaked: {out}");
    }

    #[test]
    fn rsvp_dwell_is_longer_at_sentence_ends() {
        let c = cells(Predicate::Rsvp);
        let ends: Vec<u32> = c.iter().filter(|x| x.br != Break::None).map(|x| x.dwell_ms).collect();
        let mids: Vec<u32> = c.iter().filter(|x| x.br == Break::None).map(|x| x.dwell_ms).collect();
        assert!(!ends.is_empty() && !mids.is_empty());
        let avg = |v: &[u32]| v.iter().sum::<u32>() as f32 / v.len() as f32;
        assert!(avg(&ends) > avg(&mids), "pauses are the whole trick");
    }

    #[test]
    fn rsvp_rate_responds_to_wpm() {
        let slow = apply(Predicate::Rsvp, &tokenize(SAMPLE), &Opts { wpm: 200, ..Opts::default() });
        let fast = apply(Predicate::Rsvp, &tokenize(SAMPLE), &Opts { wpm: 700, ..Opts::default() });
        let total = |v: &[Cell]| v.iter().map(|c| c.dwell_ms).sum::<u32>();
        assert!(total(&slow) > total(&fast));
    }

    #[test]
    fn memorize_erases_progressively() {
        let visible = |r: u8| {
            apply(Predicate::Memorize, &tokenize(SAMPLE), &Opts { round: r, ..Opts::default() })
                .iter()
                .filter(|c| c.weight > 0.9)
                .count()
        };
        let counts: Vec<usize> = (0..=5).map(visible).collect();
        assert!(counts.windows(2).all(|w| w[0] >= w[1]), "not monotonic: {counts:?}");
        assert_eq!(counts[5], 0, "round 5 is blank");
        assert!(counts[0] > 0);
    }

    #[test]
    fn hapax_burns_the_rare_and_dims_the_repeated() {
        let c = cells(Predicate::Hapax);
        let toks = tokenize(SAMPLE);
        let weight_of = |w: &str| {
            toks.iter().zip(&c).find(|(t, _)| t.key() == w).map(|(_, c)| c.weight).unwrap()
        };
        // "the" appears three times; "proliferate" once.
        assert!(weight_of("proliferate") > weight_of("the"));
    }

    #[test]
    fn cadence_emits_one_bar_per_sentence() {
        let c = cells(Predicate::Cadence);
        assert_eq!(c.len(), 4, "four sentences in the sample");
        assert!(c.iter().all(|x| x.text.contains('▇')));
    }

    #[test]
    fn concordance_is_alphabetical_and_deduplicated() {
        let c = cells(Predicate::Concordance);
        let keys: Vec<&str> = c.iter().map(|x| x.text.as_str()).collect();
        assert!(!keys.is_empty());
        // Each row shows its headword in ⟨⟩; the rows are sorted by headword.
        let heads: Vec<String> = c
            .iter()
            .map(|x| x.text.split('⟨').nth(1).unwrap_or("").split('⟩').next().unwrap_or("").to_lowercase())
            .collect();
        let mut sorted = heads.clone();
        sorted.sort();
        assert_eq!(heads.len(), sorted.len());
        assert!(heads.iter().collect::<std::collections::BTreeSet<_>>().len() == heads.len(), "duplicate headwords");
    }

    #[test]
    fn reverse_puts_the_last_sentence_first() {
        let out = cells_to_plain(&cells(Predicate::Reverse));
        let dark = out.find("dark").unwrap();
        let empty = out.find("empty").unwrap();
        assert!(dark < empty, "conclusion should lead: {out}");
        // Words within a sentence keep their order.
        assert!(out.contains("They multiply"), "{out}");
    }

    #[test]
    fn chains_compose_and_are_order_sensitive() {
        let toks = tokenize(SAMPLE);
        let chain = parse_chain("skeleton+bionic");
        assert_eq!(chain, vec![Predicate::Skeleton, Predicate::Bionic]);
        let out = apply_chain(&chain, &toks, &Opts::default());
        assert!(out.iter().all(|c| c.fixate > 0 || c.text.is_empty()), "bionic ran second");
        assert!(!cells_to_plain(&out).split_whitespace().any(|w| w == "the"), "skeleton ran first");
    }

    #[test]
    fn chain_parsing_ignores_unknown_names_and_caps_length() {
        assert_eq!(parse_chain("bionic+nonsense"), vec![Predicate::Bionic]);
        assert_eq!(parse_chain(""), vec![]);
        assert_eq!(parse_chain("plain+plain+plain+plain+plain+plain").len(), 4);
    }

    #[test]
    fn html_escapes_hostile_text() {
        let toks = tokenize("<script>alert(1)</script>");
        let html = cells_to_html(Predicate::Plain, &apply(Predicate::Plain, &toks, &Opts::default()));
        assert!(!html.contains("<script"), "{html}");
        assert!(html.contains("&lt;script"), "{html}");
    }

    #[test]
    fn ids_round_trip_and_the_registry_is_unique() {
        let mut seen = std::collections::BTreeSet::new();
        for p in Predicate::ALL {
            assert!(seen.insert(p.id()), "duplicate id {}", p.id());
            assert_eq!(Predicate::parse(p.id()), Some(p));
            assert!(!p.blurb().is_empty());
        }
        assert_eq!(Predicate::parse("nope"), None);
    }
}
