//! `tempest` — the command line for looking at what the generator produced.
//!
//! This is the analysis surface for the game: the equivalent of the
//! `games/<name>/test/analysis.mjs` reports the rest of the `/pressure/`
//! family carry, and it exists for the same reason — the report is written
//! before the pixels, and the numbers decide what gets shipped.
//!
//! ```text
//! tempest level  <seed> <index>      one level, its web, its certificates
//! tempest solve  <seed> <index>      the certified play, shot by shot
//! tempest sweep  [levels] [seeds]    the balance report — bots, bands, warnings
//! tempest pack   [count] [base]      emit the certified level pack as JSON
//! tempest golden                     emit the golden vectors as JSON
//! tempest audit  [count]             re-derive every promise in the pack
//! ```

use std::process::ExitCode;

use tempest::bots::{self, Bot};
use tempest::gen;
use tempest::lab::{self, Ensure, PolicyRun, Warnings};
use tempest::level::Wave;
use tempest::pack;
use tempest::solver::{self, Cert};
use tempest::web::Web;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(|s| s.as_str()).unwrap_or("help");
    let num =
        |i: usize, dflt: u64| -> u64 { args.get(i).and_then(|s| s.parse().ok()).unwrap_or(dflt) };
    match cmd {
        "level" => {
            show_level(num(1, 1), num(2, 1) as u32);
            ExitCode::SUCCESS
        }
        "solve" => {
            show_solve(num(1, 1), num(2, 1) as u32);
            ExitCode::SUCCESS
        }
        "sweep" => sweep(num(1, 10) as u32, num(2, 4) as u32),
        "pack" => {
            let (levels, _) = pack::build_pack(
                num(2, pack::PACK_BASE),
                num(1, pack::PACK_LEVELS as u64) as u32,
            );
            print!("{}", pack::pack_json(&levels));
            ExitCode::SUCCESS
        }
        "golden" => {
            print!("{}", pack::golden_json());
            ExitCode::SUCCESS
        }
        "audit" => audit(
            num(1, pack::PACK_LEVELS as u64) as u32,
            num(2, pack::PACK_BASE),
        ),
        _ => {
            eprintln!(
                "tempest — a Tempest whose levels are proved before they ship\n\n\
                 usage:\n  \
                 tempest level  <seed> <index>    one level, its web, its certificates\n  \
                 tempest solve  <seed> <index>    the certified play, shot by shot\n  \
                 tempest sweep  [levels] [seeds]  the balance report\n  \
                 tempest pack   [count] [base]    the certified level pack, as JSON\n  \
                 tempest golden                   the golden vectors, as JSON\n  \
                 tempest audit  [count] [base]    re-derive every promise in the pack"
            );
            ExitCode::FAILURE
        }
    }
}

fn cert_line(i: usize, wave: &Wave, cert: &Cert, lane: usize) -> String {
    format!(
        "  wave {i}  {:>2} threats   slack {:>4} ({:<13})  wrong way costs {:>4}  {}  openings {:<26}  worst lane {lane}{}",
        wave.len(),
        cert.slack,
        lab::classify(cert.slack, lab::BANDS_SLACK),
        cert.wrong_way_cost(),
        if cert.commits() { "← the web decides" } else { "                 " },
        cert.opening_label(),
        if cert.capped { "  [CAPPED]" } else { "" }
    )
}

fn show_level(seed: u64, index: u32) {
    let rec = gen::recipe(index);
    let (lvl, ens) = gen::level(seed, index);
    println!(
        "{}",
        lab::section(&format!("level {index}  ·  seed {seed}"))
    );
    println!(
        "web    {} · {} lanes · {} · unevenness {}‰ · diameter {} ticks",
        lvl.web.shape.label(),
        lvl.web.lanes,
        lvl.web.character().name(),
        lvl.web.unevenness(),
        lvl.web.diameter()
    );
    println!(
        "steps  {:?}",
        &lvl.web.step[..if lvl.web.closed {
            lvl.web.lanes
        } else {
            lvl.web.lanes - 1
        }]
    );
    println!(
        "recipe slack band {}..{}   {}   {} waves",
        rec.slack_band.0,
        rec.slack_band.1,
        if rec.want_commit {
            "the wrong way must cost half the margin"
        } else {
            "direction free"
        },
        rec.waves
    );
    println!();
    for (i, wave) in lvl.waves.iter().enumerate() {
        println!("{}", cert_line(i, wave, &lvl.certs[i], lvl.worst_lane[i]));
    }
    println!();
    let mut warn = Warnings::new();
    print!("{}", ens.report("generator", &mut warn));
    print!("{}", warn.render());
}

fn show_solve(seed: u64, index: u32) {
    let (lvl, _) = gen::level(seed, index);
    println!(
        "{}",
        lab::section(&format!("level {index}  ·  seed {seed}  ·  certified play"))
    );
    for (i, wave) in lvl.waves.iter().enumerate() {
        let cert = &lvl.certs[i];
        println!(
            "\nwave {i} — from lane {} (the worst place to be standing)",
            lvl.worst_lane[i]
        );
        println!("{}", cert_line(i, wave, cert, lvl.worst_lane[i]));
        for s in &cert.tour.steps {
            let t = &wave.threats[s.threat];
            println!(
                "    t={:>4}  fire into lane {:>2}  → {:<8} #{:<2} dies at t={:<4} with {:>4} ticks to spare",
                s.fire,
                s.lane,
                t.kind.name(),
                s.threat,
                s.meet,
                s.margin
            );
        }
        println!(
            "    tightest margin in the whole play: {} ticks",
            cert.tour.bottleneck
        );
    }
}

/// The balance report. Everything the generator claims, checked against a
/// population rather than an example.
fn sweep(levels: u32, seeds: u32) -> ExitCode {
    let mut warn = Warnings::new();
    let mut ens = Ensure::new(&["drop a threat"]);

    let mut slack_early: Vec<i32> = Vec::new();
    let mut slack_late: Vec<i32> = Vec::new();
    let mut threats: Vec<i32> = Vec::new();
    let mut in_band = 0usize;
    let mut waves_total = 0usize;
    let mut wrong_way: Vec<i32> = Vec::new();
    let mut committing = 0usize;
    let mut commit_wanted = 0usize;
    let mut commit_got = 0usize;
    let mut shapes: Vec<String> = Vec::new();
    let mut capped = 0usize;

    // Bot scores are "waves cleared out of the level's waves", per level.
    let mut bot_scores: Vec<Vec<i32>> = vec![Vec::new(); bots::ALL.len()];
    let mut perfect_scores: Vec<i32> = Vec::new();

    eprintln!("sweeping {levels} levels x {seeds} seeds…");
    for index in 1..=levels {
        let rec = gen::recipe(index);
        for s in 0..seeds {
            let seed = 1_000 + s as u64 * 7919 + index as u64;
            let (lvl, e) = gen::level(seed, index);
            ens.merge(&e);
            shapes.push(lvl.web.shape.label());
            for (w, cert) in lvl.certs.iter().enumerate() {
                waves_total += 1;
                threats.push(lvl.waves[w].len() as i32);
                if cert.capped {
                    capped += 1;
                }
                if index * 2 <= levels {
                    slack_early.push(cert.slack);
                } else {
                    slack_late.push(cert.slack);
                }
                let (lo, hi) = rec.slack_band;
                if cert.slack >= lo && cert.slack <= hi {
                    in_band += 1;
                }
                wrong_way.push(cert.wrong_way_cost());
                if cert.commits() {
                    committing += 1;
                }
                if rec.want_commit {
                    commit_wanted += 1;
                    if cert.commits() {
                        commit_got += 1;
                    }
                }
            }
            for (bi, bot) in bots::ALL.iter().enumerate() {
                let (cleared, _) = bots::play_level(&lvl.web, &lvl.waves, 0, bot);
                bot_scores[bi].push(cleared as i32);
            }
            perfect_scores.push(bots::play_level_perfectly(&lvl.web, &lvl.waves, 0) as i32);
        }
    }

    println!("{}", lab::section("what got generated"));
    println!("{}", lab::Summary::of(&threats).row("threats per wave"));
    let hist = lab::histogram(
        shapes
            .iter()
            .map(|s| s.split('/').next().unwrap().to_string()),
    );
    for (name, n) in &hist {
        println!(
            "  {:<10} {} {:>4}  {}",
            name,
            lab::bar(*n, shapes.len(), 20),
            n,
            lab::pct(*n, shapes.len())
        );
    }

    println!("{}", lab::section("slack — how much room perfect play has"));
    let (all, note) = lab::pool(&[("early levels", &slack_early), ("late levels", &slack_late)]);
    println!("{note}");
    println!("  {}", lab::Summary::of(&slack_early).row("early"));
    println!("  {}", lab::Summary::of(&slack_late).row("late"));
    if lab::Summary::of(&slack_late).median >= lab::Summary::of(&slack_early).median {
        warn.add(
            "late levels are not tighter than early ones — the difficulty curve is flat".into(),
        );
    }
    println!();
    // Banded separately, because pooling a gentle population with a tight one
    // is the exact mistake `pool` exists to make visible.
    print!(
        "{}",
        lab::band_report("  early levels", &slack_early, lab::BANDS_SLACK, &mut warn)
    );
    println!();
    print!(
        "{}",
        lab::band_report("  late levels", &slack_late, lab::BANDS_SLACK, &mut warn)
    );
    let _ = all;
    println!(
        "\n  in the band the recipe asked for: {} of {} ({})",
        in_band,
        waves_total,
        lab::pct(in_band, waves_total)
    );
    if in_band * 2 < waves_total {
        warn.add(format!(
            "under half the waves ({}) landed in their own recipe's slack band. \
             Either the bands are unreachable or the repair loop is not converging.",
            lab::pct(in_band, waves_total).trim()
        ));
    }

    println!(
        "{}",
        lab::section("what does going the wrong way round cost?")
    );
    println!("  {}", lab::Summary::of(&wrong_way).row("ticks lost"));
    println!(
        "  the web decides    {} of {} waves ({}) — {}",
        committing,
        waves_total,
        lab::pct(committing, waves_total),
        lab::classify(
            (committing * 100 / waves_total.max(1)) as i32,
            lab::BANDS_RATE
        )
    );
    if commit_wanted > 0 {
        let rate = commit_got * 100 / commit_wanted;
        println!(
            "  where it was asked {} of {} ({}) — {}",
            commit_got,
            commit_wanted,
            lab::pct(commit_got, commit_wanted),
            lab::classify(rate as i32, lab::BANDS_RATE)
        );
        if rate < 60 {
            warn.add(format!(
                "the generator was asked to make the wrong way round expensive on {} waves \
                 and managed it on {}%. The `shift`/`stagger` repairs are not converging.",
                commit_wanted, rate
            ));
        }
    }
    if lab::Summary::of(&wrong_way).median == 0 {
        warn.add(
            "half the waves cost nothing at all for going the wrong way round. On those, \
             the web is scenery and this is an ordinary shooter."
                .into(),
        );
    }

    println!("{}", lab::section("policies"));
    let runs: Vec<PolicyRun> = bots::ALL
        .iter()
        .enumerate()
        .map(|(i, b): (usize, &Bot)| PolicyRun {
            name: b.name.to_string(),
            control: b.control,
            scores: bot_scores[i].clone(),
            blind_to: b.blind_to.to_string(),
        })
        .collect();
    print!(
        "{}",
        lab::spread("waves cleared per level", &runs, &mut warn)
    );
    println!(
        "  {} (ceiling — the solver's own play, executed)",
        lab::Summary::of(&perfect_scores).row("perfect")
    );
    let perfect = lab::Summary::of(&perfect_scores);
    let best_bot = bots::ALL
        .iter()
        .enumerate()
        .filter(|(_, b)| !b.control)
        .map(|(i, _)| lab::Summary::of(&bot_scores[i]).mean_permille)
        .max()
        .unwrap_or(0);
    if best_bot >= perfect.mean_permille {
        warn.add(
            "a bot matched perfect play. Either the levels are too easy to \
             distinguish plays, or the solver is not finding the best line."
                .into(),
        );
    }

    println!("{}", lab::section("the generator's own account"));
    print!("{}", ens.report("repair loop", &mut warn));
    if capped > 0 {
        warn.add(format!(
            "{capped} wave(s) reached the solver's label cap. Those certificates are \
             lower bounds, not certificates."
        ));
    }

    print!("{}", warn.render());
    if warn.is_empty() {
        ExitCode::SUCCESS
    } else {
        // Warnings are findings, not failures — but a sweep that finds
        // something should be visible to whatever ran it.
        ExitCode::SUCCESS
    }
}

/// Re-derive every promise, from scratch, for a whole pack.
fn audit(count: u32, base: u64) -> ExitCode {
    let mut bad = 0;
    for i in 1..=count {
        let (lvl, _) = gen::level(base.wrapping_add(i as u64), i);
        match lvl.verify() {
            Ok(()) => {
                let worst = lvl.min_slack();
                println!(
                    "  level {:>2}  ok   {:>2} waves · {:<14} · tightest slack {:>4} ({}) · the web decides {} of {} waves",
                    i,
                    lvl.waves.len(),
                    lvl.web.shape.label(),
                    worst,
                    lab::classify(worst, lab::BANDS_SLACK),
                    lvl.committing_waves(),
                    lvl.waves.len()
                );
            }
            Err(e) => {
                bad += 1;
                println!("  level {i:>2}  FAIL {e}");
            }
        }
    }
    if bad == 0 {
        println!(
            "\nevery wave in {count} levels is holdable from every lane, and every \
                  certificate re-derives."
        );
        ExitCode::SUCCESS
    } else {
        println!("\n{bad} level(s) failed audit.");
        ExitCode::FAILURE
    }
}

/// Unused in the binary, but keeps the imports honest about what this file
/// depends on.
#[allow(dead_code)]
fn _types(_: &Web, _: &solver::Situation) {}
