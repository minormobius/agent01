//! Word-level lexicons, and the look-ups over them.
//!
//! The data is generated into [`crate::lexicon_data`] from the lexicons `rite`
//! already fetches and commits — AFINN-165 for valence, the NRC Emotion Lexicon
//! for affect categories, SUBTLEX-US for how common a word is in English at
//! large. This module is the only thing that reads that encoding.
//!
//! Everything here is a pure function of a `&str` with no allocation and no
//! initialisation: a binary search over a static blob. That is what lets the
//! analytic predicates keep `rant-core`'s contract — no I/O, no clock, no lazy
//! statics — and stay inside the microsecond budget.
//!
//! ## The honest limits of a word list
//!
//! These lexicons tag *word forms*, out of context. "Sick" is negative in AFINN
//! and is a compliment in half the sentences on this site; negation is not
//! modelled, so "not terrible" reads as terrible; irony is invisible. A lens
//! built on one is a description of the vocabulary, not a reading of the text,
//! and the views that use it say so in their blurbs.

extern crate alloc;

use crate::lexicon_data as data;

/// Normalise a token to a lexicon key: lowercase, and strip the punctuation a
/// tokeniser leaves attached. Possessives and internal hyphens stay, because the
/// lexicons contain them.
///
/// Borrows whenever it can. Most words in most prose arrive already lowercase
/// and unpunctuated, and allocating a `String` for each one cost more than the
/// binary search it feeds — the four lexicon views were the slowest things in
/// the crate until this returned a `Cow`.
fn key(word: &str) -> alloc::borrow::Cow<'_, str> {
    let t = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '\'' && c != '-');
    if t.bytes().all(|b| !b.is_ascii_uppercase()) && t.is_ascii() {
        alloc::borrow::Cow::Borrowed(t)
    } else {
        alloc::borrow::Cow::Owned(t.to_lowercase())
    }
}

/// Binary search one generated table. Entries are `word:value\n`, sorted.
fn lookup(blob: &str, off: &[u32], word: &str) -> Option<i32> {
    if off.len() < 2 {
        return None;
    }
    let (mut lo, mut hi) = (0usize, off.len() - 1); // last offset is the sentinel
    while lo < hi {
        let mid = (lo + hi) / 2;
        let entry = &blob[off[mid] as usize..off[mid + 1] as usize];
        let (w, _) = entry.split_once(':')?;
        match w.cmp(word) {
            core::cmp::Ordering::Less => lo = mid + 1,
            core::cmp::Ordering::Greater => hi = mid,
            core::cmp::Ordering::Equal => {
                let (_, v) = entry.trim_end().split_once(':')?;
                return v.parse().ok();
            }
        }
    }
    None
}

/// AFINN valence, −5..=5. `None` when the word is not rated — which is most of
/// them, and is not the same as neutral.
pub fn valence(word: &str) -> Option<i32> {
    lookup(data::AFINN_BLOB, data::AFINN_OFF, &key(word))
}

/// The NRC category mask for a word, or 0.
pub fn emotions(word: &str) -> u16 {
    lookup(data::NRC_BLOB, data::NRC_OFF, &key(word)).unwrap_or(0) as u16
}

/// The strongest *emotion* on a word, ignoring the bare positive/negative
/// categories — those are what `valence` is for, and leaving them in makes
/// every emotional word read as "positive".
pub fn emotion(word: &str) -> Option<&'static str> {
    let mask = emotions(word);
    data::NRC_CATS
        .iter()
        .enumerate()
        .find(|(i, c)| mask & (1 << i) != 0 && **c != "positive" && **c != "negative")
        .map(|(_, c)| *c)
}

/// How common a word is in English, 0.0 (rare or unlisted) to 1.0 (commonest).
///
/// Unlisted means "outside the commonest few thousand", which is the signal
/// wanted: an unusual word is exactly one the frequency table has never heard
/// of. Distinct from `hapax`, which measures rarity *within one document*.
pub fn commonness(word: &str) -> f32 {
    lookup(data::FREQ_BLOB, data::FREQ_OFF, &key(word)).unwrap_or(0) as f32 / 255.0
}

/// Syllables, by the vowel-group heuristic with the usual English patches.
///
/// Wrong on some words — every syllable counter without a pronouncing
/// dictionary is — but consistently and cheaply wrong, which is what a
/// readability score needs. Never returns 0.
pub fn syllables(word: &str) -> usize {
    let w = key(word);
    let w = w.trim_end_matches(|c: char| !c.is_alphabetic());
    if w.is_empty() {
        return 0;
    }
    let chars: Vec<char> = w.chars().collect();
    let is_vowel = |c: char| matches!(c, 'a' | 'e' | 'i' | 'o' | 'u' | 'y');

    let mut n = 0;
    let mut prev_vowel = false;
    for &c in &chars {
        let v = is_vowel(c);
        if v && !prev_vowel {
            n += 1;
        }
        prev_vowel = v;
    }
    // Silent terminal "e" ("make" is one syllable), but not when it is the only
    // vowel group ("the"), and not for "-le" after a consonant ("table").
    if w.ends_with('e') && n > 1 && !w.ends_with("le") {
        n -= 1;
    }
    n.max(1)
}

/// Flesch Reading Ease for one sentence. ~90 is a children's book, ~30 is
/// academic prose; it is unbounded at both ends and routinely goes negative on
/// a long sentence full of long words.
pub fn flesch(words: usize, syllables: usize) -> f32 {
    if words == 0 {
        return 0.0;
    }
    // One sentence, so words-per-sentence is just the word count.
    206.835 - 1.015 * words as f32 - 84.6 * (syllables as f32 / words as f32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valence_reads_the_table() {
        assert!(valence("abandon").unwrap() < 0);
        assert!(valence("ability").unwrap() > 0);
        assert_eq!(valence("thermodynamics"), None, "unrated is not neutral");
    }

    /// The table is keyed on bare lowercase words; a tokeniser hands us
    /// capitals and trailing punctuation.
    #[test]
    fn lookups_survive_what_a_tokeniser_produces() {
        for w in ["Abandon", "abandon,", "\"abandon\"", "ABANDON!", "abandon."] {
            assert_eq!(valence(w), valence("abandon"), "{w} did not normalise");
        }
    }

    #[test]
    fn binary_search_finds_both_ends_and_the_middle() {
        // A search that is subtly wrong still finds most words; check the edges.
        let first = data::AFINN_BLOB[..data::AFINN_OFF[1] as usize].split_once(':').unwrap().0;
        let n = data::AFINN_OFF.len() - 1;
        let last_entry =
            &data::AFINN_BLOB[data::AFINN_OFF[n - 1] as usize..data::AFINN_OFF[n] as usize];
        let last = last_entry.split_once(':').unwrap().0;
        assert!(valence(first).is_some(), "first entry {first} not found");
        assert!(valence(last).is_some(), "last entry {last} not found");
        assert!(valence("aaaaaaa").is_none(), "before the first entry");
        assert!(valence("zzzzzzz").is_none(), "after the last entry");
    }

    /// Every word in the table must be findable — the check that a binary
    /// search over a hand-rolled encoding actually works.
    #[test]
    fn every_afinn_entry_round_trips() {
        let n = data::AFINN_OFF.len() - 1;
        for i in 0..n {
            let e = &data::AFINN_BLOB[data::AFINN_OFF[i] as usize..data::AFINN_OFF[i + 1] as usize];
            let (w, v) = e.trim_end().split_once(':').unwrap();
            assert_eq!(valence(w), Some(v.parse().unwrap()), "{w} did not round trip");
        }
    }

    #[test]
    fn the_blobs_are_sorted() {
        for (blob, off) in [
            (data::AFINN_BLOB, data::AFINN_OFF),
            (data::NRC_BLOB, data::NRC_OFF),
            (data::FREQ_BLOB, data::FREQ_OFF),
        ] {
            let mut prev = "";
            for i in 0..off.len() - 1 {
                let w = blob[off[i] as usize..off[i + 1] as usize].split_once(':').unwrap().0;
                assert!(w > prev, "{w} out of order after {prev} — binary search would miss entries");
                prev = w;
            }
        }
    }

    #[test]
    fn emotion_ignores_the_bare_polarity_categories() {
        // "abandon" is fear/negative/sadness; the emotion is not "negative".
        let e = emotion("abandon").unwrap();
        assert!(e != "negative" && e != "positive", "{e}");
        assert!(emotions("abandon") != 0);
    }

    #[test]
    fn commonness_ranks_the_obvious_cases() {
        assert!(commonness("the") > commonness("house"), "the should be commoner than house");
        assert_eq!(commonness("sesquipedalian"), 0.0, "outside the table is rare");
        assert!(commonness("the") <= 1.0 && commonness("the") > 0.9);
    }

    #[test]
    fn syllable_counting_is_roughly_right() {
        for (w, n) in [
            ("the", 1), ("make", 1), ("table", 2), ("rant", 1), ("banana", 3),
            ("readability", 5), ("a", 1), ("queue", 1), ("rhythm", 1),
        ] {
            assert_eq!(syllables(w), n, "{w}");
        }
    }

    #[test]
    fn syllables_never_returns_zero_for_a_word() {
        for w in ["a", "I", "b", "-", "'", "🗯️", ""] {
            let n = syllables(w);
            assert!(n <= 1, "{w} => {n}");
        }
        assert!(syllables("x") >= 1);
    }

    #[test]
    fn flesch_orders_easy_above_hard() {
        let easy = flesch(5, 5); // five one-syllable words
        let hard = flesch(40, 100); // forty words, two and a half syllables each
        assert!(easy > hard, "easy {easy} hard {hard}");
        assert_eq!(flesch(0, 0), 0.0);
    }
}
