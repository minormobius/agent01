//! Procedural generation, and the loop that stops it lying.
//!
//! # The promise
//!
//! **Every wave this module ships can be held from every lane you might be
//! standing in when it starts.** Not "was playtested", not "a good bot managed
//! it" — the solver in [`crate::solver`] has produced a play that holds the
//! rim, from each of the eight to sixteen lanes the previous wave could have
//! left you in, and the wave is not shipped until it has.
//!
//! That is a much stronger thing to promise than an arcade game normally can,
//! and it is only affordable because the solver is exact and the waves are
//! small.
//!
//! # And the second promise
//!
//! Holdable is necessary and nowhere near sufficient — a wave you can hold
//! while asleep is not a level. Two more properties are hunted for:
//!
//! - **slack inside a band.** [`Cert::slack`] is the number of ticks of margin
//!   perfect play has. Too much and the level plays itself; zero and only a
//!   frame-perfect line survives. The band tightens as levels go on, which is
//!   what "getting harder" means here — a measured quantity, not a knob.
//! - **the wrong way round costs something.** On a wave where both ways round
//!   are equally fine, the shape of the web did not matter and the game was,
//!   for that wave, an ordinary shooter. [`Cert::wrong_way_cost`] says in
//!   ticks what the worse opening costs, and from a certain level on the
//!   generator insists it be at least half the margin the wave had to give.
//!
//!   The first draft asked for the *strict* version — exactly one way round
//!   survives — and the sweep report killed it within a minute of being
//!   written: on a web 66 ticks across, a wave with 80 ticks of slack survives
//!   both ways whatever you do to it, so the generator burned 167 repairs to
//!   place four waves and mostly failed. That is the report doing its job.
//!
//! # The loop
//!
//! Propose, check, repair, in that order, with the generous repairs first —
//! the discipline `packages/pressure-lab` arrived at after The Ratchet shipped
//! 2.3-tool kits where it had designed 4, because a content-deleting repair
//! ran ahead of the gentle ones and nothing was counting. Here every repair is
//! counted by name, dropping a threat is marked as destructive, and
//! [`crate::lab::Ensure`] complains in the report if it ever becomes routine.

use crate::lab::Ensure;
use crate::level::{Kind, Threat, Wave, DEPTH_MAX, MAX_TANKERS, MAX_THREATS};
use crate::rng::Rng;
use crate::solver::{self, Cert, Situation};
use crate::web::{Dir, Web, MAX_LANES, MIN_LANES};

/// How hard level `index` should be. The whole difficulty curve, in one place.
#[derive(Clone, Copy, Debug)]
pub struct Recipe {
    pub lanes: usize,
    pub closed: bool,
    /// Insist the web actually constrains the route (see
    /// [`crate::web::Web::character`]).
    pub want_shape: bool,
    pub waves: usize,
    pub threats: (usize, usize),
    pub tankers: usize,
    /// Acceptable [`Cert::slack`], in ticks.
    pub slack_band: (i32, i32),
    /// Insist the wrong way round costs real ticks (see [`Cert::commits`]).
    pub want_commit: bool,
    /// Base climb rate for this level's threats.
    pub climb: i32,
}

/// Linear ramp from `a` at level 1 to `b` at level `cap`, then flat.
fn ramp(index: u32, cap: u32, a: i32, b: i32) -> i32 {
    let i = index.clamp(1, cap) as i32 - 1;
    let c = cap as i32 - 1;
    a + (b - a) * i / c.max(1)
}

/// The difficulty curve.
///
/// Early levels are flat rings with slow, sparse threats and a lot of slack:
/// there is time to learn that the gun only fires down your own lane. Open
/// webs arrive at level 4, once losing the wrap is a loss the player can feel,
/// and from the same level the generator insists that the wrong way round
/// costs real ticks — which is the point at which this stops being a shooter
/// and starts being the game it is.
pub fn recipe(index: u32) -> Recipe {
    let lanes = ramp(index, 14, MIN_LANES as i32, MAX_LANES as i32) as usize;
    // Rings and strips alternate once strips are unlocked, so the player never
    // settles into assuming the wrap is there.
    let closed = index < 4 || !index.is_multiple_of(3);
    Recipe {
        lanes: lanes.clamp(MIN_LANES, MAX_LANES),
        closed,
        want_shape: index >= 3,
        waves: ramp(index, 10, 3, 5) as usize,
        threats: (
            ramp(index, 12, 3, 6) as usize,
            ramp(index, 12, 4, 9) as usize,
        ),
        tankers: if index >= 5 { 1 } else { 0 },
        slack_band: (ramp(index, 14, 55, 8), ramp(index, 14, 170, 45)),
        want_commit: index >= 4,
        climb: ramp(index, 14, 3, 6),
    }
}

/// A generated, certified level.
#[derive(Clone, Debug)]
pub struct Level {
    pub seed: u64,
    pub index: u32,
    pub web: Web,
    pub waves: Vec<Wave>,
    /// One per wave, taken at the *worst* lane the player could start it in.
    pub certs: Vec<Cert>,
    /// The lane each wave's certificate was computed from — the hardest place
    /// to be standing when it lands.
    pub worst_lane: Vec<usize>,
}

impl Level {
    /// Re-derive every claim on the tin. Slow and worth it: this is what
    /// stands behind "certified".
    pub fn verify(&self) -> Result<(), String> {
        if self.waves.len() != self.certs.len() {
            return Err("wave and certificate counts disagree".into());
        }
        for (i, wave) in self.waves.iter().enumerate() {
            wave.assert_sane(&self.web);
            if self.certs[i].capped {
                return Err(format!("wave {i} shipped with an incomplete search"));
            }
            for lane in 0..self.web.lanes {
                let sit = Situation::fresh(wave, lane);
                if solver::hold(&self.web, wave, &sit, None, 0).is_none() {
                    return Err(format!("wave {i} cannot be held from lane {lane}"));
                }
            }
            let recheck = solver::certify(&self.web, wave, self.worst_lane[i]);
            if recheck.slack != self.certs[i].slack {
                return Err(format!(
                    "wave {i} slack is {} but the certificate says {}",
                    recheck.slack, self.certs[i].slack
                ));
            }
        }
        Ok(())
    }

    pub fn min_slack(&self) -> i32 {
        self.certs.iter().map(|c| c.slack).min().unwrap_or(0)
    }

    /// Waves where going the wrong way round costs real ticks.
    pub fn committing_waves(&self) -> usize {
        self.certs.iter().filter(|c| c.commits()).count()
    }
}

/// Mix a seed and a level index into one stream key.
///
/// XOR alone is not enough, and the first pack proved it: packs number their
/// levels `base + index`, so `seed ^ index` cancels the increment and levels 1
/// and 2 came out byte-identical — same web, same waves, same certificates.
/// A multiply-and-avalanche step removes the structure the XOR preserved.
fn key(seed: u64, index: u32) -> u64 {
    let mut h = seed ^ (index as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    h ^= h >> 33;
    h = h.wrapping_mul(0xff51_afd7_ed55_8ccd);
    h ^= h >> 29;
    h
}

/// Generate and certify one level. Returns the level and the loop's own
/// account of what it had to do to get there.
pub fn level(seed: u64, index: u32) -> (Level, Ensure) {
    let rec = recipe(index);
    let stream = key(seed, index);
    let mut web_rng = Rng::stream(stream, "web");
    let (web, _) = crate::web::draw(&mut web_rng, rec.lanes, rec.closed, rec.want_shape);

    let mut ens = Ensure::new(&["drop a threat"]);
    let mut waves = Vec::new();
    let mut certs = Vec::new();
    let mut worst = Vec::new();
    for w in 0..rec.waves {
        let mut rng = Rng::stream(stream, &format!("wave{w}"));
        let (wave, cert, lane) = build_wave(&mut rng, &web, &rec, &mut ens);
        waves.push(wave);
        certs.push(cert);
        worst.push(lane);
    }
    (
        Level {
            seed,
            index,
            web,
            waves,
            certs,
            worst_lane: worst,
        },
        ens,
    )
}

/// How far a candidate is from being shippable. Lower is better; 0 means
/// accept. Used to pick the best fallback when the loop runs out of attempts,
/// so a hard set of parameters degrades to the closest near-miss instead of to
/// whatever happened to be last.
fn distance_from_band(cert: &Cert, rec: &Recipe) -> i32 {
    if !cert.holdable || cert.capped {
        return i32::MAX;
    }
    let (lo, hi) = rec.slack_band;
    let mut d = if cert.slack < lo {
        lo - cert.slack
    } else if cert.slack > hi {
        cert.slack - hi
    } else {
        0
    };
    if rec.want_commit && !cert.commits() {
        // How far off it is, not merely that it is off — so the fallback picks
        // the near-miss that commits most rather than an arbitrary one.
        d += 20 + (cert.slack.max(1) / 2 - cert.wrong_way_cost()).max(0);
    }
    d
}

fn build_wave(rng: &mut Rng, web: &Web, rec: &Recipe, ens: &mut Ensure) -> (Wave, Cert, usize) {
    const REPAIRS_PER_PROPOSAL: u32 = 10;
    const PROPOSALS: u32 = 6;

    let mut best: Option<(i32, Wave, Cert, usize)> = None;
    for _ in 0..PROPOSALS {
        // One attempt is one *proposal*. The repairs inside it are the loop
        // working as designed, not failures — counting them as attempts made
        // the acceptance rate read 2% when the loop was placing a wave per
        // proposal and a half.
        ens.attempt();
        let mut wave = propose(rng, web, rec);
        for _ in 0..REPAIRS_PER_PROPOSAL {
            match evaluate(web, &wave) {
                // Some lane cannot hold it at all. The most generous repair
                // there is: give the most urgent threat more room.
                Verdict::Unholdable => {
                    ens.repaired("ease the most urgent");
                    ease(rng, &mut wave);
                    continue;
                }
                Verdict::Held { lane } => {
                    let cert = solver::certify(web, &wave, lane);
                    if cert.capped {
                        // The search gave up, so the certificate is a lower
                        // bound and not a certificate. Never ship it.
                        ens.repaired("reject: search capped");
                        ens.reject();
                        break;
                    }
                    let d = distance_from_band(&cert, rec);
                    if best.as_ref().is_none_or(|(bd, _, _, _)| d < *bd) {
                        best = Some((d, wave.clone(), cert.clone(), lane));
                    }
                    if d == 0 {
                        ens.accept();
                        return (wave, cert, lane);
                    }
                    let (lo, hi) = rec.slack_band;
                    if cert.slack > hi {
                        ens.repaired("press the slackest");
                        press(rng, &mut wave);
                    } else if cert.slack < lo {
                        ens.repaired("ease the most urgent");
                        ease(rng, &mut wave);
                    } else {
                        // In band, but the web is not deciding anything.
                        // Splitting the wave further apart round the rim makes
                        // the two directions cost different amounts; pulling a
                        // threat toward the far side makes the difference
                        // bite. Alternate, because either alone gets stuck.
                        if rng.chance(1, 2) {
                            ens.repaired("shift a threat across");
                            shift(rng, web, &mut wave);
                        } else {
                            ens.repaired("stagger the clusters");
                            stagger(rng, &mut wave);
                        }
                    }
                }
            }
        }
        ens.reject();
    }

    // Out of attempts. Take the closest near-miss if there is one…
    if let Some((_, wave, cert, lane)) = best {
        ens.accept();
        return (wave, cert, lane);
    }

    // …and if nothing was ever holdable, start deleting content. This is the
    // repair that matters: it always succeeds, it always makes the level
    // smaller than designed, and it is invisible unless something counts it.
    let mut wave = propose(rng, web, rec);
    loop {
        ens.attempt();
        if let Verdict::Held { lane, .. } = evaluate(web, &wave) {
            let cert = solver::certify(web, &wave, lane);
            if !cert.capped {
                ens.accept();
                return (wave, cert, lane);
            }
        }
        if wave.roots().count() <= 1 {
            // The floor: one slow spiker, holdable from anywhere by
            // construction. Reaching this means the recipe is impossible.
            ens.repaired("drop a threat");
            let wave = Wave::new(vec![Threat::root(Kind::Spiker, 0, DEPTH_MAX, 0, 2)]);
            let cert = solver::certify(web, &wave, 0);
            ens.accept();
            return (wave, cert, 0);
        }
        ens.repaired("drop a threat");
        drop_root(rng, &mut wave);
    }
}

enum Verdict {
    /// Holdable from every lane. `lane` is the worst place to be standing when
    /// it arrives.
    Held { lane: usize },
    /// Some lane cannot hold it at all, so the wave is not shippable whatever
    /// its slack looks like from anywhere else.
    Unholdable,
}

/// Check the wave from every lane the previous wave could have left the player
/// in, and report the hardest one.
///
/// The worst lane is chosen by the *bottleneck* of the earliest-finishing
/// play, which is free — it comes back with the tour — rather than by exact
/// slack, which would need a binary search per lane and turn a 40 ms check
/// into a 600 ms one. The exact slack is then computed once, at the lane this
/// picked.
fn evaluate(web: &Web, wave: &Wave) -> Verdict {
    let mut worst: Option<(i32, usize)> = None;
    for lane in 0..web.lanes {
        let sit = Situation::fresh(wave, lane);
        match solver::hold(web, wave, &sit, None, 0) {
            None => return Verdict::Unholdable,
            Some(tour) => {
                if worst.is_none_or(|(b, _)| tour.bottleneck < b) {
                    worst = Some((tour.bottleneck, lane));
                }
            }
        }
    }
    let (_, lane) = worst.expect("a web always has at least one lane");
    Verdict::Held { lane }
}

// ------------------------------------------------------------- proposals --

/// Draw a wave.
///
/// Threats arrive in **clusters** rather than scattered evenly, because an
/// even scatter has no geometry in it: whichever way you turn, the situation
/// looks the same, and the level cannot possibly force a direction. Two
/// clusters at different distances round the rim, arriving at different times,
/// is the shape that makes "which way do I go" a question with an answer.
fn propose(rng: &mut Rng, web: &Web, rec: &Recipe) -> Wave {
    let n = web.lanes;
    let count = rng.range(rec.threats.0 as i32, rec.threats.1 as i32).max(1) as usize;
    let tankers = rec.tankers.min(MAX_TANKERS);
    // Each tanker costs three of the budget: itself and two children.
    let budget = MAX_THREATS.saturating_sub(tankers * 3);
    let count = count.min(budget).max(1);

    let clusters = if count >= 5 { rng.range(2, 3) } else { 2 } as usize;
    let mut centres = Vec::with_capacity(clusters);
    let first = rng.below(n as u64) as usize;
    for c in 0..clusters {
        centres.push((first + c * n / clusters + rng.range(0, 1) as usize) % n);
    }

    let mut threats = Vec::new();
    for i in 0..count {
        let c = i % clusters;
        let centre = centres[c];
        let spread = rng.range(-2, 2);
        let lane = (centre as i32 + spread).rem_euclid(n as i32) as usize;
        // Clusters arrive staggered, so one of them is always the urgent one.
        let delay = c as i32 * rng.range(20, 70) + rng.range(0, 25);
        let depth = rng.range(600, DEPTH_MAX);
        let climb = (rec.climb + rng.range(-1, 1)).clamp(2, 8);
        let kind = if rng.chance(3, 5) {
            Kind::Flipper
        } else {
            Kind::Spiker
        };
        let mut t = Threat::root(kind, lane, depth, delay, climb);
        if kind == Kind::Flipper {
            t = t.with_flip(
                rng.range(11, 30),
                if rng.chance(1, 2) { Dir::Cw } else { Dir::Ccw },
            );
        }
        threats.push(t);
    }

    for _ in 0..tankers {
        let centre = *rng.pick(&centres);
        let lane = (centre as i32 + rng.range(-1, 1)).rem_euclid(n as i32) as usize;
        let climb = (rec.climb - 1).clamp(2, 6);
        let parent = threats.len();
        threats.push(Threat::root(
            Kind::Tanker,
            lane,
            rng.range(780, DEPTH_MAX),
            rng.range(0, 40),
            climb,
        ));
        // Children outrun their parent. That is what makes *when* to kill it a
        // question rather than a rule — see the table in `solver`.
        let cc = (climb + rng.range(2, 4)).clamp(3, 9);
        let period = rng.range(18, 34);
        threats.push(Threat::child(parent, Dir::Cw, cc, period, Dir::Cw));
        threats.push(Threat::child(parent, Dir::Ccw, cc, period, Dir::Ccw));
    }

    Wave::new(threats)
}

// --------------------------------------------------------------- repairs --

/// The generous repair: give the most urgent threat more room. Never removes
/// anything.
fn ease(rng: &mut Rng, wave: &mut Wave) {
    let Some(i) = most_urgent_root(wave) else {
        return;
    };
    let t = &mut wave.threats[i];
    match rng.below(3) {
        0 => {
            let e = t.entry.as_mut().unwrap();
            e.depth = (e.depth + 110).min(DEPTH_MAX);
        }
        1 => t.climb = (t.climb - 1).max(2),
        _ => {
            let e = t.entry.as_mut().unwrap();
            e.tick += 25;
        }
    }
}

/// The other direction: take room away from whatever has the most.
fn press(rng: &mut Rng, wave: &mut Wave) {
    let Some(i) = least_urgent_root(wave) else {
        return;
    };
    let t = &mut wave.threats[i];
    match rng.below(3) {
        0 => {
            let e = t.entry.as_mut().unwrap();
            e.depth = (e.depth - 90).max(220);
        }
        1 => t.climb = (t.climb + 1).min(9),
        _ => {
            let e = t.entry.as_mut().unwrap();
            e.tick = (e.tick - 20).max(0);
        }
    }
}

/// Move a threat to the far side of the web. This is the repair aimed
/// squarely at [`Cert::commits`]: a wave where both ways round work equally is
/// usually a wave that is symmetric about the player, and breaking the
/// symmetry is what gives the opening move an answer.
fn shift(rng: &mut Rng, web: &Web, wave: &mut Wave) {
    let roots: Vec<usize> = wave.roots().map(|(i, _)| i).collect();
    if roots.is_empty() {
        return;
    }
    let i = *rng.pick(&roots);
    let n = web.lanes as i32;
    let e = wave.threats[i].entry.as_mut().unwrap();
    let across = (e.lane as i32 + n / 2 + rng.range(-2, 2)).rem_euclid(n) as usize;
    e.lane = across;
}

/// The destructive one. Removes the least urgent root and any children hanging
/// off it, fixing up the parent indices that the removal shifts.
fn drop_root(rng: &mut Rng, wave: &mut Wave) {
    let victim = least_urgent_root(wave).unwrap_or(0);
    let _ = rng;
    let doomed: Vec<usize> = std::iter::once(victim)
        .chain(wave.children_of(victim))
        .collect();
    let mut remap = vec![usize::MAX; wave.threats.len()];
    let mut kept = Vec::new();
    for (i, slot) in remap.iter_mut().enumerate() {
        if doomed.contains(&i) {
            continue;
        }
        *slot = kept.len();
        kept.push(wave.threats[i]);
    }
    for t in kept.iter_mut() {
        if let Some(p) = t.parent {
            t.parent = Some(remap[p]);
        }
    }
    wave.threats = kept;
}

/// Pull the wave's two ends further apart in time. A wave whose threats all
/// land at once is symmetric in the only way that matters — you cannot be late
/// for one and early for another — so nothing about the route can be wrong.
/// Staggering them is what turns the rim into a schedule.
fn stagger(rng: &mut Rng, wave: &mut Wave) {
    let roots: Vec<usize> = wave.roots().map(|(i, _)| i).collect();
    if roots.len() < 2 {
        return;
    }
    let i = *rng.pick(&roots);
    let e = wave.threats[i].entry.as_mut().unwrap();
    if rng.chance(1, 2) {
        e.tick += rng.range(15, 45);
    } else {
        e.tick = (e.tick - rng.range(15, 45)).max(0);
    }
}

fn most_urgent_root(wave: &Wave) -> Option<usize> {
    wave.roots()
        .min_by_key(|(_, t)| t.breach_tick(t.entry.unwrap()))
        .map(|(i, _)| i)
}

fn least_urgent_root(wave: &Wave) -> Option<usize> {
    wave.roots()
        .max_by_key(|(_, t)| t.breach_tick(t.entry.unwrap()))
        .map(|(i, _)| i)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::web::{Character, Shape};

    #[test]
    fn the_curve_goes_the_right_way() {
        let early = recipe(1);
        let late = recipe(14);
        assert!(late.lanes > early.lanes);
        assert!(late.waves >= early.waves);
        assert!(late.threats.1 > early.threats.1);
        assert!(late.climb > early.climb);
        assert!(
            late.slack_band.1 < early.slack_band.0,
            "the late band must be strictly tighter than the early one"
        );
        assert!(!early.want_commit && late.want_commit);
        // …and it stops rather than running away.
        assert_eq!(recipe(14).lanes, recipe(99).lanes);
        assert!(recipe(99).slack_band.0 >= 0);
    }

    #[test]
    fn generated_levels_keep_every_promise_they_make() {
        // The whole thesis, checked end to end: re-derive every claim on the
        // tin, from scratch, including holdability from every single lane.
        for (seed, index) in [(1u64, 2u32), (3, 6)] {
            let (lvl, _) = level(seed, index);
            lvl.web.assert_sane();
            lvl.verify()
                .unwrap_or_else(|e| panic!("seed {seed} level {index}: {e}"));
        }
    }

    /// The same check across the whole difficulty curve. Minutes, not seconds,
    /// so it runs from `cargo test -- --ignored` and from `tempest audit`
    /// rather than on every build.
    #[test]
    #[ignore = "slow: the full curve, every lane, every wave"]
    fn the_whole_curve_keeps_its_promises() {
        for index in 1..=14u32 {
            for seed in 0..3u64 {
                let (lvl, _) = level(seed, index);
                lvl.verify()
                    .unwrap_or_else(|e| panic!("seed {seed} level {index}: {e}"));
            }
        }
    }

    #[test]
    fn the_same_seed_is_the_same_level() {
        let (a, _) = level(4242, 6);
        let (b, _) = level(4242, 6);
        assert_eq!(a.web.shape.label(), b.web.shape.label());
        assert_eq!(a.web.step, b.web.step);
        assert_eq!(a.waves.len(), b.waves.len());
        for (wa, wb) in a.waves.iter().zip(&b.waves) {
            assert_eq!(wa.threats, wb.threats);
        }
        assert_eq!(a.min_slack(), b.min_slack());
    }

    #[test]
    fn consecutive_levels_in_a_pack_are_different_levels() {
        // The bug this pins shipped once: a pack whose levels 1 and 2 were the
        // same level, because the seed and the index cancelled.
        let base = crate::pack::PACK_BASE;
        let mut seen: Vec<(String, Vec<i32>)> = Vec::new();
        for index in 1..=6u32 {
            let stream = key(base.wrapping_add(index as u64), index);
            let rec = recipe(index);
            let mut rng = Rng::stream(stream, "web");
            let (web, _) = crate::web::draw(&mut rng, rec.lanes, rec.closed, rec.want_shape);
            let sig = (web.shape.label(), web.step.clone());
            assert!(
                !seen.contains(&sig),
                "level {index} repeats an earlier web: {sig:?}"
            );
            seen.push(sig);
        }
    }

    #[test]
    fn different_seeds_are_different_levels() {
        let (a, _) = level(1, 6);
        let (b, _) = level(2, 6);
        assert!(
            a.web.step != b.web.step || a.waves[0].threats != b.waves[0].threats,
            "two seeds produced the same level"
        );
    }

    #[test]
    fn the_curve_asks_for_shaped_webs_once_it_should() {
        // The webs alone, without paying for the waves — this is a claim about
        // `recipe`, not about the solver.
        for seed in 0..200u64 {
            for index in [1u32, 2, 8, 12] {
                let rec = recipe(index);
                let mut rng = Rng::stream(seed ^ index as u64, "web");
                let (web, _) = crate::web::draw(&mut rng, rec.lanes, rec.closed, rec.want_shape);
                assert_eq!(web.lanes, rec.lanes);
                assert_eq!(web.closed, rec.closed);
                if index >= 3 {
                    assert!(
                        web.character().constrains(),
                        "level {index} got a flat web: {}",
                        web.shape.label()
                    );
                }
            }
        }
    }

    #[test]
    fn dropping_a_root_takes_its_children_and_fixes_the_indices() {
        let mut wave = Wave::new(vec![
            Threat::root(Kind::Spiker, 0, 900, 0, 3),
            Threat::root(Kind::Tanker, 4, 900, 0, 3),
            Threat::child(1, Dir::Cw, 6, 20, Dir::Cw),
            Threat::child(1, Dir::Ccw, 6, 20, Dir::Ccw),
            Threat::root(Kind::Spiker, 8, 300, 0, 9),
        ]);
        let web = Web::new(12, Shape::Circle);
        // The tanker breaches last, so it is the least urgent and goes first.
        drop_root(&mut Rng::new(1), &mut wave);
        wave.assert_sane(&web);
        // Three go, not one: the tanker takes its whole family with it.
        assert_eq!(wave.threats.len(), 2);
        assert!(wave.threats.iter().all(|t| t.kind != Kind::Tanker));
        assert!(wave.threats.iter().all(|t| t.parent.is_none()));
    }

    #[test]
    fn repairs_move_the_number_they_claim_to_move() {
        let mut rng = Rng::new(9);
        let mut wave = Wave::new(vec![
            Threat::root(Kind::Spiker, 0, 500, 0, 6),
            Threat::root(Kind::Spiker, 5, 900, 0, 3),
        ]);
        let before = wave.threats[0].breach_tick(wave.threats[0].entry.unwrap());
        // `ease` targets the most urgent, which is threat 0.
        for _ in 0..6 {
            ease(&mut rng, &mut wave);
        }
        let after = wave.threats[0].breach_tick(wave.threats[0].entry.unwrap());
        assert!(
            after > before,
            "ease made nothing easier: {before} -> {after}"
        );

        let idle = wave.threats[1].breach_tick(wave.threats[1].entry.unwrap());
        for _ in 0..6 {
            press(&mut rng, &mut wave);
        }
        let pressed = wave.threats[1].breach_tick(wave.threats[1].entry.unwrap());
        assert!(
            pressed < idle,
            "press made nothing harder: {idle} -> {pressed}"
        );
    }

    #[test]
    fn a_level_never_ships_an_incomplete_certificate() {
        // A capped search is a lower bound wearing a certificate's clothes.
        // Level 7 is the first with tankers *and* a discrimination
        // requirement, so it is where the search is most likely to run long.
        for seed in 0..2u64 {
            let (lvl, _) = level(seed, 7);
            for (i, c) in lvl.certs.iter().enumerate() {
                assert!(!c.capped, "seed {seed} wave {i} shipped a capped search");
                assert!(c.holdable, "seed {seed} wave {i} is not holdable");
                assert!(c.slack >= 0);
            }
        }
    }

    #[test]
    fn a_flat_web_only_ever_appears_early() {
        let mut rng = Rng::new(11);
        for index in 3..=14u32 {
            let rec = recipe(index);
            for _ in 0..50 {
                let (web, _) = crate::web::draw(&mut rng, rec.lanes, rec.closed, rec.want_shape);
                assert_ne!(
                    web.character(),
                    Character::Flat,
                    "level {index} drew a flat web"
                );
            }
        }
    }
}
