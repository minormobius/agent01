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
    /// A named category for views that classify rather than scale — the emotion
    /// a word carries, the sign of its valence. Rendered as `data-t`, so the
    /// stylesheet keeps one rule per category instead of one per view, and a
    /// screen reader or a scraper can read the classification out of the markup.
    pub tag: Option<&'static str>,
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
        Cell { text: text.into(), fixate: 0, weight: 1.0, dwell_ms: 0, tag: None, br: Break::None }
    }
}

/// The twelve predicates. `Predicate::ALL` is the registry the `/api/predicates`
/// endpoint and the docs both read from, so there is exactly one list.
///
/// Three of Read's reading *drills* used to live here — `memorize`, `skeleton`,
/// `spine` — and were removed: this is a place to publish and to look at what
/// you published, not to practise reading it. What replaced them are analytic
/// lenses in the shape of `cadence` and `hapax`, which is the direction the
/// interesting ones were always in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Predicate {
    Plain,
    Bionic,
    Rsvp,
    Crawl,
    Cadence,
    Grade,
    Hapax,
    Rare,
    Sentiment,
    Emotion,
    Concordance,
    Reverse,
}

impl Predicate {
    pub const ALL: [Predicate; 12] = [
        Predicate::Plain,
        Predicate::Bionic,
        Predicate::Rsvp,
        Predicate::Crawl,
        Predicate::Cadence,
        Predicate::Grade,
        Predicate::Hapax,
        Predicate::Rare,
        Predicate::Sentiment,
        Predicate::Emotion,
        Predicate::Concordance,
        Predicate::Reverse,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Predicate::Plain => "plain",
            Predicate::Bionic => "bionic",
            Predicate::Rsvp => "rsvp",
            Predicate::Crawl => "crawl",
            Predicate::Cadence => "cadence",
            Predicate::Grade => "grade",
            Predicate::Hapax => "hapax",
            Predicate::Rare => "rare",
            Predicate::Sentiment => "sentiment",
            Predicate::Emotion => "emotion",
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
            Predicate::Cadence => "Not the words — the shape. One bar per sentence, by length.",
            Predicate::Grade => "Reading ease per sentence. The hard ones are the long bars.",
            Predicate::Hapax => "Weighted by rarity within the document. The once-only words burn.",
            Predicate::Rare => "Weighted by rarity in English at large, not in this document.",
            Predicate::Sentiment => "Words the AFINN lexicon rates. Vocabulary, not tone — no negation, no irony.",
            Predicate::Emotion => "Words the NRC lexicon files under an emotion. One colour each.",
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

/// Function words, still used by `concordance` to decide what is worth an index
/// entry. Ported from `read/js/reader-memorize.js`.
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
    /// Which NRC emotion `emotion` highlights, as an index into
    /// `lexicon_data::NRC_CATS`. `None` picks the document's most frequent.
    pub focus: Option<usize>,
}

impl Default for Opts {
    fn default() -> Self {
        // 350wpm is Read's default landing speed: brisk but not a stunt.
        Opts { wpm: 350, min_chars: 0, focus: None }
    }
}

/// Run one predicate over a token stream.
pub fn apply<'a>(p: Predicate, tokens: &[Token<'a>], o: &Opts) -> Vec<Cell> {
    match p {
        Predicate::Plain => plain(tokens),
        Predicate::Bionic => bionic(tokens),
        Predicate::Rsvp => rsvp(tokens, o),
        Predicate::Crawl => crawl(tokens, o),
        Predicate::Grade => grade(tokens),
        Predicate::Rare => rare(tokens),
        Predicate::Sentiment => sentiment(tokens),
        Predicate::Emotion => emotion(tokens, o),
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
                tag: None,
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
/// Reading ease per sentence, as bars — `cadence`'s sibling.
///
/// `cadence` says how *long* each sentence is; this says how *hard*. They
/// disagree more often than you would expect, which is the point of having
/// both: a short sentence of Latinate abstractions scores worse than a long
/// plain one, and only one of the two views will tell you.
///
/// Flesch is unbounded and goes negative on bad prose, so the bar is the
/// *difficulty* — 100 down to 0 — clamped, and the number printed is the raw
/// score so a negative one is visible rather than flattened to zero.
fn grade(tokens: &[Token<'_>]) -> Vec<Cell> {
    let mut per: Vec<(usize, usize, usize)> = Vec::new(); // (sentence, words, syllables)
    for t in tokens {
        let syl = crate::lexicon::syllables(t.word);
        match per.last_mut() {
            Some((s, w, y)) if *s == t.sentence => {
                *w += 1;
                *y += syl;
            }
            _ => per.push((t.sentence, 1, syl)),
        }
    }
    per.iter()
        .map(|(_, words, syl)| {
            let score = crate::lexicon::flesch(*words, *syl);
            // 0 = effortless, 1 = impenetrable.
            let difficulty = ((100.0 - score) / 100.0).clamp(0.0, 1.0);
            Cell {
                text: format!(
                    "{} {:.0}",
                    "▇".repeat((difficulty * 28.0).round().max(1.0) as usize),
                    score
                ),
                fixate: 0,
                weight: difficulty,
                dwell_ms: 0,
                tag: None,
                br: Break::Paragraph,
            }
        })
        .collect()
}

/// Weight by rarity **in English**, from the SUBTLEX-US frequency baseline.
///
/// The counterpart to `hapax`, and routinely disagreeing with it: a word used
/// once here burns in `hapax` even if it is "house", and a word repeated twenty
/// times still burns here if it is "sublimate". `hapax` finds what this document
/// does not repeat; `rare` finds where it reaches outside ordinary English.
///
/// Words the table has never heard of are the rarest thing there is, so they
/// weight 1.0 — which also means a typo lights up, and that is useful.
fn rare(tokens: &[Token<'_>]) -> Vec<Cell> {
    tokens
        .iter()
        .map(|t| Cell {
            text: t.raw.to_string(),
            fixate: 0,
            weight: 1.0 - crate::lexicon::commonness(t.word),
            dwell_ms: 0,
            tag: None,
            br: brk(t),
        })
        .collect()
}

/// Valence, from AFINN-165: rated words carry their sign and strength, the rest
/// recede.
///
/// **This is a description of vocabulary, not a reading of tone.** AFINN rates
/// word forms out of context: negation is not modelled, so "not terrible" reads
/// as terrible; irony is invisible; "sick" is negative. The blurb says so, and
/// the view is worth having anyway — seeing which words in a rant are doing the
/// emotional work is exactly the sort of thing you cannot see while writing it.
fn sentiment(tokens: &[Token<'_>]) -> Vec<Cell> {
    tokens
        .iter()
        .map(|t| {
            let v = crate::lexicon::valence(t.word);
            let (tag, weight) = match v {
                // Strength scales 1..=5 onto a visible range; unrated words dim
                // to a floor rather than vanishing, because an unrated word is
                // not a neutral one and should still be readable.
                Some(v) if v > 0 => (Some("pos"), 0.45 + 0.11 * v as f32),
                Some(v) if v < 0 => (Some("neg"), 0.45 + 0.11 * -v as f32),
                _ => (None, 0.35),
            };
            Cell {
                text: t.raw.to_string(),
                fixate: 0,
                weight: weight.min(1.0),
                dwell_ms: 0,
                tag,
                br: brk(t),
            }
        })
        .collect()
}

/// One NRC emotion at a time: the words carrying it light up, everything else
/// recedes. `?emotion=fear` picks; the default is whichever the document uses
/// most.
///
/// **One at a time is not a simplification, it is the only readable design.**
/// Painting all eight emotions in one pass was the first attempt, and the
/// palette validator refused it: with words scattered through a paragraph any
/// two categories can end up adjacent, and on that pairlist the best available
/// eight-hue set puts two of them at ΔE 1.6 for a deuteranope — identical.
/// Showing one category against a recessive background is a single series, so
/// the question never arises, and "where is the fear in this post" is a better
/// question than "what colour is this word" anyway.
///
/// Same caveat as `sentiment`: these are word forms filed under a category by
/// annotators, not an inference about the sentence. The bare `positive` and
/// `negative` categories are ignored — they cover almost every emotional word,
/// and polarity is what `sentiment` is for.
fn emotion(tokens: &[Token<'_>], o: &Opts) -> Vec<Cell> {
    let cats = crate::lexicon_data::NRC_CATS;
    let focus = o
        .focus
        .filter(|i| *i < cats.len())
        .or_else(|| dominant_emotion(tokens))
        .unwrap_or(0);
    let want = cats[focus];

    tokens
        .iter()
        .map(|t| {
            let hit = crate::lexicon::emotions(t.word) & (1 << focus) != 0;
            Cell {
                text: t.raw.to_string(),
                fixate: 0,
                weight: if hit { 1.0 } else { 0.28 },
                dwell_ms: 0,
                tag: if hit { Some(want) } else { None },
                br: brk(t),
            }
        })
        .collect()
}

/// The emotion this document uses most, skipping the bare polarity categories.
fn dominant_emotion(tokens: &[Token<'_>]) -> Option<usize> {
    let cats = crate::lexicon_data::NRC_CATS;
    let mut counts = [0usize; 10];
    for t in tokens {
        let m = crate::lexicon::emotions(t.word);
        for (i, c) in cats.iter().enumerate() {
            if m & (1 << i) != 0 && *c != "positive" && *c != "negative" {
                counts[i] += 1;
            }
        }
    }
    let (best, n) = counts.iter().enumerate().max_by_key(|(_, n)| **n)?;
    (*n > 0).then_some(best)
}

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
                tag: None,
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
        if let Some(t) = c.tag {
            // A category, not a colour. The stylesheet decides what "fear"
            // looks like; the markup only says that the word is filed there,
            // which keeps the classification readable to anything that is not
            // a browser.
            out.push_str(&format!(" data-t=\"{t}\""));
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

    // ── the analytic lenses ──

    #[test]
    fn grade_emits_one_bar_per_sentence_and_scores_them() {
        let c = cells(Predicate::Grade);
        assert_eq!(c.len(), 4, "four sentences in the sample");
        assert!(c.iter().all(|x| x.text.contains('▇')));
        // The printed number is the raw Flesch score, which may be negative;
        // the bar is clamped difficulty.
        assert!(c.iter().all(|x| x.weight >= 0.0 && x.weight <= 1.0));
    }

    /// `grade` and `cadence` must be able to disagree, or one of them is
    /// redundant. A short sentence of long words is harder than a long one of
    /// short words, and only `grade` knows it.
    #[test]
    fn grade_is_not_just_cadence_again() {
        let text = "Institutional epistemology deteriorates.\n\nI went to the shop and I got a bag of                     crisps and then I sat on the wall by the road for a bit.";
        let g = apply(Predicate::Grade, &tokenize(text), &Opts::default());
        let c = apply(Predicate::Cadence, &tokenize(text), &Opts::default());
        assert_eq!(g.len(), 2);
        assert!(g[0].weight > g[1].weight, "the short abstract sentence is the harder one");
        assert!(c[0].weight < c[1].weight, "…and the shorter one, which is cadence's whole point");
    }

    #[test]
    fn rare_weights_by_english_not_by_this_document() {
        let text = "the the the sublimate";
        let c = apply(Predicate::Rare, &tokenize(text), &Opts::default());
        assert_eq!(c.len(), 4);
        assert!(c[3].weight > c[0].weight, "sublimate is rarer English than 'the'");

        // And that is the opposite of what hapax says about the same text:
        // "the" is repeated so hapax dims it, but hapax would also dim a rare
        // word that happened to repeat.
        let h = apply(Predicate::Hapax, &tokenize("sublimate sublimate house"), &Opts::default());
        let r = apply(Predicate::Rare, &tokenize("sublimate sublimate house"), &Opts::default());
        assert!(r[0].weight > r[2].weight, "rare: sublimate beats house");
        assert!(h[0].weight < h[2].weight, "hapax: the repeated word loses, whatever it is");
    }

    #[test]
    fn sentiment_signs_the_words_it_knows_and_leaves_the_rest_readable() {
        let c = apply(Predicate::Sentiment, &tokenize("abandon ability thermodynamics"), &Opts::default());
        assert_eq!(c[0].tag, Some("neg"));
        assert_eq!(c[1].tag, Some("pos"));
        assert_eq!(c[2].tag, None, "unrated is not neutral, it is unrated");
        assert!(c[2].weight > 0.0, "an unrated word must still be legible");
        assert!(c.iter().all(|x| x.weight <= 1.0));
    }

    #[test]
    fn sentiment_strength_tracks_the_rating() {
        // "abhor" is -3, "abandon" is -2: the stronger word must read stronger.
        let c = apply(Predicate::Sentiment, &tokenize("abandon abhor"), &Opts::default());
        assert!(c[1].weight > c[0].weight, "{:?}", c);
    }

    #[test]
    fn emotion_shows_exactly_one_category_at_a_time() {
        let c = apply(Predicate::Emotion, &tokenize(SAMPLE), &Opts::default());
        let tags: std::collections::BTreeSet<&str> = c.iter().filter_map(|x| x.tag).collect();
        assert!(tags.len() <= 1, "more than one series on screen: {tags:?}");
        for t in &tags {
            assert!(crate::lexicon_data::NRC_CATS.contains(t), "unknown tag {t}");
            assert!(*t != "positive" && *t != "negative", "polarity is sentiment's job");
        }
    }

    #[test]
    fn emotion_focus_selects_the_category() {
        let fear = crate::lexicon_data::NRC_CATS.iter().position(|c| *c == "fear").unwrap();
        let joy = crate::lexicon_data::NRC_CATS.iter().position(|c| *c == "joy").unwrap();
        let toks = tokenize("abandon delight");
        let f = apply(Predicate::Emotion, &toks, &Opts { focus: Some(fear), ..Opts::default() });
        let j = apply(Predicate::Emotion, &toks, &Opts { focus: Some(joy), ..Opts::default() });
        assert_eq!(f[0].tag, Some("fear"), "abandon is filed under fear");
        assert_eq!(f[1].tag, None, "delight is not");
        assert_eq!(j[1].tag, Some("joy"));
        assert_eq!(j[0].tag, None);
        // An out-of-range focus must not panic or index past the array.
        let bad = apply(Predicate::Emotion, &toks, &Opts { focus: Some(99), ..Opts::default() });
        assert_eq!(bad.len(), toks.len());
    }

    #[test]
    fn emotion_defaults_to_the_documents_own_dominant_feeling() {
        // Three fear words and one joy word: the default view is about fear.
        let toks = tokenize("abandon terror dread delight");
        let c = apply(Predicate::Emotion, &toks, &Opts::default());
        let tag = c.iter().find_map(|x| x.tag).expect("something should light up");
        assert_eq!(tag, "fear", "{c:?}");
    }

    /// A document with no emotional vocabulary at all must still render.
    #[test]
    fn emotion_survives_prose_the_lexicon_has_no_opinion_about() {
        let toks = tokenize("the quantity of the quantity of the quantity");
        let c = apply(Predicate::Emotion, &toks, &Opts::default());
        assert_eq!(c.len(), toks.len());
        assert!(c.iter().all(|x| x.tag.is_none()));
    }

    /// Tags reach the markup, or the colour lenses are monochrome.
    #[test]
    fn tags_are_rendered_as_data_attributes() {
        let html = cells_to_html(Predicate::Emotion, &cells(Predicate::Emotion));
        assert!(html.contains("data-t=\""), "{html}");
        let plain = cells_to_html(Predicate::Cadence, &cells(Predicate::Cadence));
        assert!(!plain.contains("data-t="), "views that do not classify emit no tag");
    }

    #[test]
    fn chains_compose_and_are_order_sensitive() {
        let toks = tokenize(SAMPLE);
        let chain = parse_chain("rare+bionic");
        assert_eq!(chain, vec![Predicate::Rare, Predicate::Bionic]);
        let out = apply_chain(&chain, &toks, &Opts::default());
        assert!(out.iter().all(|c| c.fixate > 0 || c.text.is_empty()), "bionic ran second");
        // Composition re-tokenises between stages, so bionic sees real words
        // rather than the weights `rare` attached — the weights are gone and
        // that is correct, not a bug.
        assert_eq!(out.len(), toks.len(), "rare is total, so nothing was dropped");
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
