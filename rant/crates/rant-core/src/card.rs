//! The link card.
//!
//! A rant's card has to survive being 400px wide in somebody's Bluesky feed, so
//! it does three things and stops: the title at the largest size that fits, a
//! thin metadata line, and — the one flourish — the post's **cadence** rendered
//! as a bar per sentence. That last part means every card is visibly a picture
//! of *that* post: a staccato rant looks nothing like a long essay, before you
//! have read a word of it.
//!
//! Output is SVG. `rant-worker` rasterises it to PNG with `resvg` because link
//! scrapers do not accept SVG, but the SVG is the source of truth and is served
//! alongside for anything that can render it.

use crate::predicates::{apply, Opts, Predicate};
use crate::slug::esc;
use crate::text::tokenize;

pub const W: u32 = 1200;
pub const H: u32 = 630;

// The cadence band. Everything vertical is derived from these three so the
// collision check cannot drift away from where the bars actually are — which is
// exactly what happened the first time: the guard and its test both used a
// hand-copied number that was 58px too low, and a two-line title with a
// two-line dek printed straight through the bars.
const BAR_BASE: u32 = H - 150;
const BAR_MAX_H: u32 = 88;
const BAR_TOP: u32 = BAR_BASE - BAR_MAX_H;
/// The lowest baseline a text node may sit on and stay clear of the bars.
const TEXT_FLOOR: u32 = BAR_TOP - 12;
/// The footer row, below the bars.
const FOOTER_Y: u32 = H - 74;

/// Colours, as the card's own palette. Kept here rather than read from the
/// publication theme so a card is legible even when a publication picks
/// something unreadable; the accent is the only themed part.
pub struct Palette {
    pub bg: &'static str,
    pub fg: &'static str,
    pub dim: &'static str,
    pub accent: String,
}

impl Default for Palette {
    fn default() -> Self {
        Palette { bg: "#0d0f13", fg: "#f2f0ec", dim: "#7d8794", accent: "#e4b363".into() }
    }
}

/// The card's content. A struct rather than six positional `&str`s, because
/// `svg(title, publication, domain, …)` is exactly the signature people
/// transpose.
pub struct Card<'a> {
    /// The headline.
    pub title: &'a str,
    /// Small, above the title: whose publication this is.
    pub kicker: &'a str,
    /// Small, bottom right: where it lives. Usually a bare domain.
    pub domain: &'a str,
    /// One or two lines under the title. The post's description.
    pub dek: &'a str,
    /// Bottom left: word count, reading time, date.
    pub meta: &'a str,
    /// The prose the cadence bars are computed from.
    pub body: &'a str,
}

/// Render the card.
pub fn svg(c: &Card<'_>, pal: &Palette) -> String {
    const PAD: u32 = 72;
    let inner = W - PAD * 2;
    let (title, publication, body, meta) = (c.title, c.kicker, c.body, c.meta);

    // Title: pick the largest of three sizes that fits in three lines. The
    // per-character width factors are measured for Roboto Mono at weight 700,
    // which is the font the worker feeds to resvg — monospace is why a factor
    // works at all here, and why the fit is exact rather than hopeful.
    let (size, lines) = fit_title(title, inner);

    let mut s = String::with_capacity(4096);
    s.push_str(&format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{}">"#,
        esc(title)
    ));
    s.push_str(&format!(
        r##"<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{}"/><stop offset="1" stop-color="#161a21"/></linearGradient></defs>"##,
        pal.bg
    ));
    s.push_str(&format!(r#"<rect width="{W}" height="{H}" fill="url(#g)"/>"#));
    // Accent rule down the left edge — the one piece of publication identity.
    s.push_str(&format!(r#"<rect x="0" y="0" width="10" height="{H}" fill="{}"/>"#, pal.accent));

    // Publication name, upper left.
    s.push_str(&text(
        PAD,
        104,
        26,
        700,
        &pal.accent.clone(),
        publication,
        "start",
    ));

    // Title block.
    let mut y = 200u32;
    for line in &lines {
        s.push_str(&text(PAD, y, size, 700, pal.fg, line, "start"));
        y += (size as f32 * 1.22) as u32;
    }

    // The dek fills the space the title did not use. Two lines at most: a card
    // is a headline with a hint, not an excerpt.
    if !c.dek.is_empty() {
        const DEK: u32 = 26;
        let per_line = (inner as f32 / (DEK as f32 * ADVANCE)).floor() as usize;
        y += 14;
        for line in wrap(c.dek, per_line.max(8)).into_iter().take(2) {
            // Never let the dek collide with the cadence bars. A long title
            // legitimately squeezes the dek down to one line, or to none.
            if y > TEXT_FLOOR {
                break;
            }
            s.push_str(&text(PAD, y, DEK, 400, pal.dim, &line, "start"));
            y += (DEK as f32 * 1.35) as u32;
        }
    }

    // Cadence bars: one per sentence, bottom-anchored, capped so a 400-sentence
    // essay compresses instead of overflowing.
    let cells = apply(Predicate::Cadence, &tokenize(body), &Opts::default());
    if !cells.is_empty() {
        let n = cells.len().min(64);
        let step = (inner as f32 / n as f32).min(26.0);
        let bw = (step * 0.55).max(2.0);
        let base = BAR_BASE as f32;
        for (i, c) in cells.iter().take(n).enumerate() {
            let h = (c.weight * BAR_MAX_H as f32).max(3.0);
            s.push_str(&format!(
                r#"<rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" rx="1.5" fill="{}" opacity="{:.2}"/>"#,
                PAD as f32 + i as f32 * step,
                base - h,
                bw,
                h,
                pal.accent,
                0.28 + 0.62 * c.weight
            ));
        }
    }

    // Metadata line, bottom left; domain bottom right.
    s.push_str(&text(PAD, FOOTER_Y, 24, 400, pal.dim, meta, "start"));
    s.push_str(&text(W - PAD, FOOTER_Y, 24, 400, pal.dim, c.domain, "end"));
    s.push_str("</svg>");
    s
}

fn text(x: u32, y: u32, size: u32, weight: u32, fill: &str, body: &str, anchor: &str) -> String {
    format!(
        r#"<text x="{x}" y="{y}" font-family="Roboto Mono, ui-monospace, monospace" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{}</text>"#,
        esc(body)
    )
}

/// Advance width of Roboto Mono, as a fraction of the em. Monospace, so it is a
/// constant rather than a table — which is the entire reason the card uses a
/// monospace face for the title.
const ADVANCE: f32 = 0.6;

/// Choose a title size and wrap it. Tries 68 / 54 / 42px and takes the first
/// that fits in three lines; below that the title is truncated, because a card
/// with six lines of 30px text is a card nobody reads.
fn fit_title(title: &str, width: u32) -> (u32, Vec<String>) {
    for size in [68u32, 54, 42] {
        let per_line = (width as f32 / (size as f32 * ADVANCE)).floor() as usize;
        let lines = wrap(title, per_line.max(8));
        if lines.len() <= 3 {
            return (size, lines);
        }
    }
    let per_line = (width as f32 / (42.0 * ADVANCE)).floor() as usize;
    let mut lines = wrap(title, per_line.max(8));
    lines.truncate(3);
    if let Some(last) = lines.last_mut() {
        let keep = per_line.saturating_sub(1);
        if last.chars().count() > keep {
            *last = last.chars().take(keep).collect();
        }
        last.push('…');
    }
    (42, lines)
}

/// Greedy word wrap. A word longer than the line is hard-split rather than
/// allowed to overflow — URLs in titles are rare but they do happen.
fn wrap(s: &str, per_line: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut line = String::new();
    for word in s.split_whitespace() {
        let mut word = word;
        while word.chars().count() > per_line {
            let head: String = word.chars().take(per_line).collect();
            if !line.is_empty() {
                out.push(std::mem::take(&mut line));
            }
            out.push(head);
            word = &word[word.char_indices().nth(per_line).map(|(i, _)| i).unwrap_or(word.len())..];
        }
        if word.is_empty() {
            continue;
        }
        let need = if line.is_empty() { word.chars().count() } else { line.chars().count() + 1 + word.chars().count() };
        if need > per_line && !line.is_empty() {
            out.push(std::mem::take(&mut line));
        }
        if !line.is_empty() {
            line.push(' ');
        }
        line.push_str(word);
    }
    if !line.is_empty() {
        out.push(line);
    }
    if out.is_empty() {
        out.push(String::new());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card<'a>(title: &'a str, dek: &'a str, body: &'a str) -> Card<'a> {
        Card { title, kicker: "Rant", domain: "rant.mino.mobi", dek, meta: "4 min · 2026-07-28", body }
    }

    #[test]
    fn card_is_well_formed_and_sized() {
        let s = svg(&card("On the tyranny of the empty box", "A rant", "A. B. C sentence here."), &Palette::default());
        assert!(s.starts_with("<svg"));
        assert!(s.ends_with("</svg>"));
        assert!(s.contains(r#"width="1200""#) && s.contains(r#"height="630""#));
        assert_eq!(s.matches("<svg").count(), 1);
        // Bars: one per sentence.
        assert_eq!(s.matches(r#"rx="1.5""#).count(), 3);
    }

    #[test]
    fn kicker_and_domain_are_distinct_slots() {
        // The regression this guards: both corners rendering the same string,
        // so the card said "Rant / Rant" and never showed where it lived.
        let c = Card { title: "T", kicker: "Alice's blog", domain: "alice.test", dek: "", meta: "m", body: "b." };
        let s = svg(&c, &Palette::default());
        assert!(s.contains("Alice&#39;s blog"), "{s}");
        assert!(s.contains("alice.test"), "{s}");
        assert_eq!(s.matches("alice.test").count(), 1, "domain belongs in one corner only");
    }

    #[test]
    fn the_dek_is_rendered_and_capped_at_two_lines() {
        let long = "word ".repeat(80);
        let s = svg(&card("Short", &long, "b."), &Palette::default());
        // Kicker + up to 3 title lines + up to 2 dek lines + 2 footer lines.
        let texts = s.matches("<text").count();
        assert!(texts <= 1 + 3 + 2 + 2, "too many text nodes: {texts}");
        assert!(s.contains("word word"), "dek missing: {s}");
    }

    /// Every `y=` on a `<text>` node in the rendered card.
    fn text_baselines(svg: &str) -> Vec<u32> {
        svg.split("<text ")
            .skip(1)
            .filter_map(|cap| cap.split("y=\"").nth(1)?.split('"').next()?.parse().ok())
            .collect()
    }

    #[test]
    fn no_text_ever_overlaps_the_cadence_bars() {
        // The invariant, stated geometrically rather than by repeating the
        // guard's constant: a baseline is either above the tallest bar or below
        // the band entirely. Asserted across the title/dek length matrix,
        // because the bug only appeared at two title lines *and* two dek lines.
        for title_words in [1usize, 4, 9, 60] {
            for dek_words in [0usize, 3, 20, 60] {
                let t = "title ".repeat(title_words);
                let d = "dek ".repeat(dek_words);
                let s = svg(&card(t.trim(), d.trim(), "One. Two. Three."), &Palette::default());
                for y in text_baselines(&s) {
                    assert!(
                        y < BAR_TOP || y > BAR_BASE,
                        "title={title_words}w dek={dek_words}w: text baseline y={y} sits in the bar band \
                         {BAR_TOP}..={BAR_BASE}"
                    );
                }
            }
        }
    }

    /// Dek lines only — 26px at weight 400. (The kicker is 26/700, the footer
    /// 24/400, so this pair is unambiguous.)
    fn dek_lines(svg: &str) -> usize {
        svg.matches(r#"font-size="26" font-weight="400""#).count()
    }

    #[test]
    fn a_long_title_squeezes_the_dek_rather_than_the_bars() {
        let dek = "dek ".repeat(30);
        let short = dek_lines(&svg(&card("Short", &dek, "A."), &Palette::default()));
        let long = dek_lines(&svg(&card(&"title ".repeat(12), &dek, "A."), &Palette::default()));
        assert_eq!(short, 2, "a one-line title leaves room for the full two-line dek");
        assert!(long < short, "a three-line title must cost the dek space, got {long} vs {short}");
    }

    #[test]
    fn the_dek_is_dropped_entirely_rather_than_printed_over_the_bars() {
        // The failure mode this replaces: the dek's second line rendering at a
        // baseline inside the bar band, so the words sat on top of the chart.
        let s = svg(&card(&"title ".repeat(12), "a dek that will not fit", "A."), &Palette::default());
        assert_eq!(dek_lines(&s), 0);
        for y in text_baselines(&s) {
            assert!(y < BAR_TOP || y > BAR_BASE, "y={y}");
        }
    }

    #[test]
    fn hostile_titles_cannot_break_out_of_the_svg() {
        let s = svg(&card("</text><script>alert(1)</script>", "<img onerror=x>", "b"), &Palette::default());
        assert!(!s.contains("<script"), "{s}");
        assert!(!s.contains("<img"), "{s}");
        assert!(s.contains("&lt;script"));
    }

    #[test]
    fn long_titles_shrink_then_truncate_but_never_exceed_three_lines() {
        let long = "word ".repeat(200);
        let (size, lines) = fit_title(&long, 1056);
        assert!(lines.len() <= 3, "{} lines", lines.len());
        assert_eq!(size, 42);
        assert!(lines.last().unwrap().ends_with('…'));
    }

    #[test]
    fn short_titles_get_the_big_size_on_one_line() {
        let (size, lines) = fit_title("Short", 1056);
        assert_eq!((size, lines.len()), (68, 1));
    }

    #[test]
    fn wrapping_hard_splits_an_unbreakable_word() {
        let lines = wrap(&"x".repeat(50), 10);
        assert_eq!(lines.len(), 5);
        assert!(lines.iter().all(|l| l.chars().count() <= 10));
    }

    #[test]
    fn an_empty_post_still_produces_a_card() {
        let c = Card { title: "", kicker: "", domain: "", dek: "", meta: "", body: "" };
        let s = svg(&c, &Palette::default());
        assert!(s.starts_with("<svg") && s.ends_with("</svg>"));
    }

    #[test]
    fn bar_count_is_capped_for_very_long_posts() {
        let body = "A. ".repeat(400);
        let s = svg(&card("t", "", &body), &Palette::default());
        assert_eq!(s.matches(r#"rx="1.5""#).count(), 64);
    }
}
