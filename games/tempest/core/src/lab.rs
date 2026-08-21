//! Measurement scaffolding — the Rust counterpart of
//! [`packages/pressure-lab`](../../../../packages/pressure-lab/), and a
//! deliberate port of its *lessons* rather than its code.
//!
//! That library was written after three games in the `/pressure/` family
//! independently grew the same scaffolding and hid four real design bugs in
//! the differences between their versions. Its README names them, and every
//! one of them is a live risk here:
//!
//! - **a naive policy scoring the same as a good one.** Hold the Line's heat
//!   mechanic was decorative for an entire draft, and the tell was not a bad
//!   number — it was that the bot ignoring heat matched the bot reading it. So
//!   [`spread`] *requires* a control policy and complains when nothing beats
//!   it. Here the control is the bot that ignores which way round the web is
//!   shorter, and if that bot keeps up, this game is Tempest-shaped scenery.
//! - **a repair loop quietly deleting half of every kit.** So [`Ensure`]
//!   counts every repair by name and flags a content-deleting one that fires
//!   constantly.
//! - **measuring the wrong moment.** So the reports say which population they
//!   are over, every time.
//! - **pooling a population that fails by construction.** So [`pool`] has to be
//!   told what it is merging and prints it.
//!
//! Nothing here touches a seed: this module is report-only, which is why it is
//! the one place floats would be harmless — and it still does not use any,
//! because a report that disagrees with itself between machines is a report
//! nobody trusts.

use std::collections::BTreeMap;
use std::fmt::Write as _;

// ------------------------------------------------------------------ stats --

/// Quantile of an already-sorted slice, `q` in per-mille. Nearest-rank; never
/// mutates the caller's data.
pub fn quantile(sorted: &[i32], q_permille: i32) -> i32 {
    if sorted.is_empty() {
        return 0;
    }
    let idx = ((sorted.len() as i64 - 1) * q_permille as i64 + 500) / 1000;
    sorted[idx.clamp(0, sorted.len() as i64 - 1) as usize]
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Summary {
    pub n: usize,
    pub min: i32,
    pub p25: i32,
    pub median: i32,
    pub p75: i32,
    pub max: i32,
    /// Mean in per-mille, so it stays integral.
    pub mean_permille: i64,
}

impl Summary {
    pub fn of(xs: &[i32]) -> Summary {
        if xs.is_empty() {
            return Summary::default();
        }
        let mut s = xs.to_vec();
        s.sort_unstable();
        Summary {
            n: s.len(),
            min: s[0],
            p25: quantile(&s, 250),
            median: quantile(&s, 500),
            p75: quantile(&s, 750),
            max: s[s.len() - 1],
            mean_permille: s.iter().map(|v| *v as i64).sum::<i64>() * 1000 / s.len() as i64,
        }
    }

    pub fn mean_str(&self) -> String {
        let m = self.mean_permille;
        format!("{}.{:01}", m / 1000, (m.abs() % 1000) / 100)
    }

    pub fn row(&self, label: &str) -> String {
        format!(
            "{label:<22} n={:<5} min {:<5} p25 {:<5} med {:<5} p75 {:<5} max {:<5} mean {}",
            self.n,
            self.min,
            self.p25,
            self.median,
            self.p75,
            self.max,
            self.mean_str()
        )
    }
}

/// `n / d` as a percentage string, column-aligned. (`pct` not aligning its
/// columns was one of the two bugs pressure-lab's own selftest found in
/// itself — worth copying the fix, not the bug.)
pub fn pct(n: usize, d: usize) -> String {
    if d == 0 {
        return "   —  ".into();
    }
    format!("{:>5.1}%", n as f64 * 100.0 / d as f64)
}

/// `n / d` as a whole-number percentage, for banding.
///
/// Written with `d.max(1)` rather than a zero check so there is no
/// check-then-divide for a reader — or a future clippy — to worry about. An
/// empty population reports 0%, which is the honest answer.
pub fn rate(n: usize, d: usize) -> i32 {
    (n * 100 / d.max(1)) as i32
}

pub fn bar(n: usize, of: usize, width: usize) -> String {
    if of == 0 {
        return " ".repeat(width);
    }
    let filled = (n * width + of / 2) / of;
    let filled = filled.min(width);
    format!("{}{}", "█".repeat(filled), "·".repeat(width - filled))
}

/// Counts by key, in key order.
pub fn histogram<T: Ord + Clone>(xs: impl IntoIterator<Item = T>) -> BTreeMap<T, usize> {
    let mut m = BTreeMap::new();
    for x in xs {
        *m.entry(x).or_insert(0) += 1;
    }
    m
}

// ------------------------------------------------------------------ bands --

pub struct Band {
    pub upto: i32,
    pub name: &'static str,
}

/// Verdicts on **slack in ticks** — how much room perfect play has before a
/// wave stops being holdable at all.
///
/// The tick is the natural unit because it is what the player spends: at 60
/// ticks a second, 30 ticks of slack is half a second of thinking time.
pub const BANDS_SLACK: &[Band] = &[
    Band {
        upto: 2,
        name: "frame-perfect",
    },
    Band {
        upto: 10,
        name: "brutal",
    },
    Band {
        upto: 30,
        name: "tight",
    },
    Band {
        upto: 70,
        name: "fair",
    },
    Band {
        upto: 140,
        name: "loose",
    },
    Band {
        upto: i32::MAX,
        name: "free",
    },
];

/// Verdicts on a percentage — used for "how often does the web force a
/// direction". A different scale needs different bands; pressure-lab shipped
/// one band set, applied it to a game with five options, and declared 65% of
/// its content trivial. Pick by the shape of the number, not by the game.
pub const BANDS_RATE: &[Band] = &[
    Band {
        upto: 5,
        name: "never",
    },
    Band {
        upto: 25,
        name: "rarely",
    },
    Band {
        upto: 55,
        name: "often",
    },
    Band {
        upto: 85,
        name: "usually",
    },
    Band {
        upto: i32::MAX,
        name: "always",
    },
];

pub fn classify(v: i32, bands: &[Band]) -> &'static str {
    for b in bands {
        if v <= b.upto {
            return b.name;
        }
    }
    bands.last().map(|b| b.name).unwrap_or("?")
}

/// A histogram over named bands, with the loosest-band warning that caught a
/// real pooling mistake in The Ratchet.
pub fn band_report(label: &str, values: &[i32], bands: &[Band], warn: &mut Warnings) -> String {
    let mut out = format!("{label}  (n = {})\n", values.len());
    if values.is_empty() {
        return out;
    }
    let mut counts: Vec<usize> = vec![0; bands.len()];
    for v in values {
        for (i, b) in bands.iter().enumerate() {
            if *v <= b.upto {
                counts[i] += 1;
                break;
            }
        }
    }
    for (i, b) in bands.iter().enumerate() {
        let _ = writeln!(
            out,
            "  {:<15} {} {:>6}  {}",
            b.name,
            bar(counts[i], values.len(), 24),
            counts[i],
            pct(counts[i], values.len())
        );
    }
    let last = counts[counts.len() - 1];
    if last * 2 > values.len() {
        warn.add(format!(
            "{label}: {} of {} landed in the loosest band ({}). Either the \
             content is too easy or this is the wrong population to band.",
            last,
            values.len(),
            bands[bands.len() - 1].name
        ));
    }
    out
}

// ----------------------------------------------------------------- spread --

/// One policy's results over a population.
pub struct PolicyRun {
    pub name: String,
    /// A control exists to be beaten. If nothing beats it, the mechanic it
    /// ignores does not exist.
    pub control: bool,
    pub scores: Vec<i32>,
    /// What this policy deliberately does not look at — printed alongside, so
    /// a reader can tell what a small gap means.
    pub blind_to: String,
}

/// Compare policies. **Requires at least one control**, and says so loudly
/// when the control keeps up.
pub fn spread(label: &str, runs: &[PolicyRun], warn: &mut Warnings) -> String {
    assert!(
        runs.iter().any(|r| r.control),
        "spread({label}) needs a control policy — a spread without one cannot \
         tell a working mechanic from a decorative one"
    );
    let mut out = format!("{label}\n");
    let mut best_control = i64::MIN;
    let mut best_control_name = String::new();
    let mut best_real = i64::MIN;
    let mut best_real_name = String::new();
    for r in runs {
        let s = Summary::of(&r.scores);
        let _ = writeln!(
            out,
            "  {}{}",
            if r.control { "· " } else { "  " },
            s.row(&r.name)
        );
        if !r.blind_to.is_empty() {
            let _ = writeln!(out, "      blind to: {}", r.blind_to);
        }
        if r.control {
            if s.mean_permille > best_control {
                best_control = s.mean_permille;
                best_control_name = r.name.clone();
            }
        } else if s.mean_permille > best_real {
            best_real = s.mean_permille;
            best_real_name = r.name.clone();
        }
    }
    if best_real <= best_control {
        warn.add(format!(
            "{label}: nothing beat the control. '{best_control_name}' scores as well as \
             '{best_real_name}', so whatever the control ignores is not part of this game."
        ));
    } else {
        // A margin of a few per-mille is noise, not a mechanic.
        let margin = best_real - best_control;
        if margin * 100 < best_control.abs().max(1000) * 5 {
            warn.add(format!(
                "{label}: '{best_real_name}' beats the control '{best_control_name}' by \
                 under 5%. That is thin enough to be noise."
            ));
        }
        let _ = writeln!(
            out,
            "  best non-control '{best_real_name}' beats control '{best_control_name}' by {}",
            fmt_permille(best_real - best_control)
        );
    }
    out
}

fn fmt_permille(v: i64) -> String {
    format!("{}.{:01}", v / 1000, (v.abs() % 1000) / 100)
}

// ------------------------------------------------------------------- pool --

/// Merge populations, explicitly. The caller has to name every part, and the
/// names get printed — because pooling in a population that fails by
/// construction (144 meaningless zeroes, in pressure-lab's case) is invisible
/// once the merge has happened.
pub fn pool(parts: &[(&str, &[i32])]) -> (Vec<i32>, String) {
    let mut all = Vec::new();
    let mut note = String::from("pooled: ");
    for (i, (name, xs)) in parts.iter().enumerate() {
        if i > 0 {
            note.push_str(" + ");
        }
        let _ = write!(note, "{name} ({})", xs.len());
        all.extend_from_slice(xs);
    }
    (all, note)
}

// ----------------------------------------------------------------- ensure --

/// The generate-check-repair loop, and its diagnostics.
///
/// Repairs are tried in the order given, so **put the generous ones first**:
/// The Ratchet planned four-tool kits and shipped 2.3 because a
/// content-deleting repair ran before the generous ones and nothing was
/// counting.
#[derive(Clone, Debug, Default)]
pub struct Ensure {
    pub attempts: u32,
    pub accepted: u32,
    pub rejected: u32,
    pub repairs: BTreeMap<String, u32>,
    /// Repairs that remove content. Named here so the report can single them
    /// out even when they are rare.
    pub destructive: Vec<String>,
}

impl Ensure {
    pub fn new(destructive: &[&str]) -> Ensure {
        Ensure {
            destructive: destructive.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    pub fn attempt(&mut self) {
        self.attempts += 1;
    }

    pub fn accept(&mut self) {
        self.accepted += 1;
    }

    pub fn reject(&mut self) {
        self.rejected += 1;
    }

    pub fn repaired(&mut self, name: &str) {
        *self.repairs.entry(name.to_string()).or_insert(0) += 1;
    }

    pub fn merge(&mut self, other: &Ensure) {
        self.attempts += other.attempts;
        self.accepted += other.accepted;
        self.rejected += other.rejected;
        for (k, v) in &other.repairs {
            *self.repairs.entry(k.clone()).or_insert(0) += v;
        }
        for d in &other.destructive {
            if !self.destructive.contains(d) {
                self.destructive.push(d.clone());
            }
        }
    }

    pub fn report(&self, label: &str, warn: &mut Warnings) -> String {
        let mut out = format!(
            "{label}\n  attempts {}  accepted {}  rejected {}  ({} accepted)\n",
            self.attempts,
            self.accepted,
            self.rejected,
            pct(self.accepted as usize, self.attempts.max(1) as usize)
        );
        if self.repairs.is_empty() {
            out.push_str("  no repairs fired\n");
        }
        for (name, count) in &self.repairs {
            let destructive = self.destructive.contains(name);
            // A rate, not a percentage: several repairs per attempt is the
            // loop working, and "328%" reads like a bug.
            let per = *count as i64 * 100 / self.attempts.max(1) as i64;
            let _ = writeln!(
                out,
                "  {}{:<26} {:>6}   ×{}.{:02} per attempt",
                if destructive { "! " } else { "  " },
                name,
                count,
                per / 100,
                per % 100
            );
            if destructive && *count as usize * 4 > self.attempts.max(1) as usize {
                warn.add(format!(
                    "{label}: the content-deleting repair '{name}' fired on {} of {} \
                     attempts. The generator is planning levels it cannot build, and \
                     the repair is quietly shipping smaller ones.",
                    count, self.attempts
                ));
            }
        }
        if self.attempts > 0 && self.accepted * 4 < self.attempts {
            warn.add(format!(
                "{label}: under a quarter of attempts were accepted. The target band \
                 is probably unreachable for these parameters."
            ));
        }
        out
    }
}

// --------------------------------------------------------------- warnings --

/// Findings, collected and printed together at the end where they cannot be
/// scrolled past. They are the point of the report, not a footnote to it.
#[derive(Clone, Debug, Default)]
pub struct Warnings {
    items: Vec<String>,
}

impl Warnings {
    pub fn new() -> Warnings {
        Warnings::default()
    }

    pub fn add(&mut self, msg: String) {
        if !self.items.contains(&msg) {
            self.items.push(msg);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn render(&self) -> String {
        if self.items.is_empty() {
            return "\nno warnings.\n".into();
        }
        let mut out = format!("\n{} warning(s):\n", self.items.len());
        for w in &self.items {
            let _ = writeln!(out, "  ⚠ {w}");
        }
        out
    }
}

pub fn section(title: &str) -> String {
    format!("\n{}\n{}\n", title, "─".repeat(title.len().max(8)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantiles_do_not_mutate_and_land_where_expected() {
        let xs = vec![5, 1, 4, 2, 3];
        let before = xs.clone();
        let s = Summary::of(&xs);
        assert_eq!(xs, before, "Summary::of must not reorder the caller's data");
        assert_eq!((s.min, s.median, s.max), (1, 3, 5));
        assert_eq!(s.mean_permille, 3000);
        assert_eq!(s.n, 5);
    }

    #[test]
    fn empty_input_does_not_panic() {
        let s = Summary::of(&[]);
        assert_eq!(s.n, 0);
        assert_eq!(quantile(&[], 500), 0);
        assert_eq!(pct(1, 0).trim(), "—");
        assert_eq!(bar(1, 0, 4).len(), 4);
    }

    #[test]
    fn rate_handles_an_empty_population() {
        assert_eq!(rate(1, 2), 50);
        assert_eq!(rate(0, 0), 0);
        assert_eq!(rate(3, 3), 100);
    }

    #[test]
    fn bars_are_the_width_they_say_they_are() {
        for n in 0..=10 {
            assert_eq!(bar(n, 10, 20).chars().count(), 20, "n = {n}");
        }
        assert_eq!(bar(10, 10, 5), "█████");
        assert_eq!(bar(0, 10, 5), "·····");
    }

    #[test]
    fn classify_picks_the_first_band_that_fits() {
        assert_eq!(classify(0, BANDS_SLACK), "frame-perfect");
        assert_eq!(classify(11, BANDS_SLACK), "tight");
        assert_eq!(classify(10_000, BANDS_SLACK), "free");
        assert_eq!(classify(100, BANDS_RATE), "always");
    }

    #[test]
    #[should_panic(expected = "needs a control")]
    fn a_spread_without_a_control_is_refused() {
        let mut w = Warnings::new();
        spread(
            "x",
            &[PolicyRun {
                name: "a".into(),
                control: false,
                scores: vec![1, 2],
                blind_to: String::new(),
            }],
            &mut w,
        );
    }

    #[test]
    fn a_control_that_keeps_up_is_a_warning() {
        let mut w = Warnings::new();
        spread(
            "x",
            &[
                PolicyRun {
                    name: "control".into(),
                    control: true,
                    scores: vec![10, 10, 10],
                    blind_to: "everything".into(),
                },
                PolicyRun {
                    name: "clever".into(),
                    control: false,
                    scores: vec![10, 10, 10],
                    blind_to: String::new(),
                },
            ],
            &mut w,
        );
        assert_eq!(w.len(), 1, "{}", w.render());
        assert!(w.render().contains("nothing beat the control"));
    }

    #[test]
    fn a_thin_win_over_the_control_is_also_a_warning() {
        let mut w = Warnings::new();
        spread(
            "x",
            &[
                PolicyRun {
                    name: "control".into(),
                    control: true,
                    scores: vec![100],
                    blind_to: String::new(),
                },
                PolicyRun {
                    name: "clever".into(),
                    control: false,
                    scores: vec![102],
                    blind_to: String::new(),
                },
            ],
            &mut w,
        );
        assert!(w.render().contains("under 5%"), "{}", w.render());
    }

    #[test]
    fn a_clear_win_over_the_control_is_silent() {
        let mut w = Warnings::new();
        spread(
            "x",
            &[
                PolicyRun {
                    name: "control".into(),
                    control: true,
                    scores: vec![10],
                    blind_to: String::new(),
                },
                PolicyRun {
                    name: "clever".into(),
                    control: false,
                    scores: vec![40],
                    blind_to: String::new(),
                },
            ],
            &mut w,
        );
        assert!(w.is_empty(), "{}", w.render());
    }

    #[test]
    fn everything_in_the_loosest_band_is_a_warning() {
        let mut w = Warnings::new();
        band_report("t", &[500, 600, 700, 800], BANDS_SLACK, &mut w);
        assert!(w.render().contains("loosest band"), "{}", w.render());
    }

    #[test]
    fn a_content_deleting_repair_that_fires_constantly_is_a_warning() {
        let mut e = Ensure::new(&["drop a threat"]);
        for _ in 0..10 {
            e.attempt();
            e.accept();
            e.repaired("drop a threat");
        }
        let mut w = Warnings::new();
        let out = e.report("gen", &mut w);
        assert!(out.contains("! drop a threat"), "{out}");
        assert!(w.render().contains("content-deleting"), "{}", w.render());
    }

    #[test]
    fn a_rare_destructive_repair_is_flagged_but_not_warned() {
        let mut e = Ensure::new(&["drop a threat"]);
        for i in 0..40 {
            e.attempt();
            e.accept();
            if i == 0 {
                e.repaired("drop a threat");
            }
        }
        let mut w = Warnings::new();
        let out = e.report("gen", &mut w);
        assert!(out.contains("! drop a threat"));
        assert!(w.is_empty(), "{}", w.render());
    }

    #[test]
    fn pool_says_what_it_merged() {
        let (all, note) = pool(&[("routes 1-3", &[1, 2]), ("routes 4+", &[3, 4, 5])]);
        assert_eq!(all, vec![1, 2, 3, 4, 5]);
        assert!(
            note.contains("routes 1-3 (2)") && note.contains("routes 4+ (3)"),
            "{note}"
        );
    }

    #[test]
    fn warnings_deduplicate() {
        let mut w = Warnings::new();
        w.add("same".into());
        w.add("same".into());
        assert_eq!(w.len(), 1);
    }

    #[test]
    fn histogram_counts_in_key_order() {
        let h = histogram(vec!["b", "a", "b"]);
        assert_eq!(h.get("a"), Some(&1));
        assert_eq!(h.get("b"), Some(&2));
        assert_eq!(h.keys().next(), Some(&"a"));
    }
}
