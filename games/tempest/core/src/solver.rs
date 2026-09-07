//! The exact answer.
//!
//! # The question
//!
//! > Given where everything is right now, is there *any* way round the web
//! > that holds the rim?
//!
//! Not "did a good bot manage it", not "did it feel fair" — is the set of
//! plays that lose everything empty or not. Every other number this crate
//! produces is a corollary of being able to answer that exactly.
//!
//! # Why it is tractable
//!
//! A play is fully described by the sequence of shots: each shot is a tick and
//! a lane, and the lane is forced by which threat you mean to hit and when the
//! shot will reach it. So a play is an *ordering of kills*, and the state that
//! matters between kills is small:
//!
//! - which threats are dead (a bitmask),
//! - which lane you are standing in,
//! - the tick you last fired (cooldown, and travel is measured from there),
//! - and — the awkward one — *when* each tanker died.
//!
//! That last item is why this is not a textbook Held–Karp, and it is subtler
//! than it first looks. A tanker's children enter at the depth their parent
//! died at, so the obvious rule is "kill tankers early, the children start
//! further out". The arithmetic says otherwise. With a tanker 900 deep
//! climbing at 3 and children climbing at 6:
//!
//! | tanker dies | children enter at | they breach at | window to clear them |
//! |---|---|---|---|
//! | tick 20  | depth 840 | tick 160 | 140 ticks |
//! | tick 200 | depth 300 | tick 250 |  50 ticks |
//!
//! Killing it late pushes the family's deadline *out* by 90 ticks while
//! shrinking the window to clear them to a third. Whether that is good depends
//! entirely on what else is on the board — and the sign of the effect flips
//! with the speed ratio, so it is not even a fixed rule per game, it is a rule
//! per tanker.
//!
//! There is therefore **no scalar ordering on tanker kill ticks**, and any
//! attempt to compare two of them throws away plays that win. So the solver
//! does not compare them: a state keeps one label per distinct vector of
//! tanker kill ticks, and within a vector keeps only the earliest firing time
//! (from which the player can always simply wait). That is exact.
//!
//! With no tankers there is one vector, every set collapses to a single label,
//! and this is ordinary earliest-arrival Held–Karp.
//!
//! Label sets are capped ([`LABEL_CAP`]) so a pathological wave cannot run
//! away. A cap that binds makes the certificate *unsound* rather than merely
//! slow, so it is recorded in [`Cert::capped`] and the generator throws such a
//! level away instead of shipping it.
//!
//! # Two shots in the air
//!
//! Shots travel at a fixed speed, so a later shot in the same lane can never
//! overtake an earlier one, and shots in different lanes never interact.
//! Kills therefore resolve in *firing* order, which is exactly the order the
//! bitmask evolves in. That is what lets the solver reason about kills one at
//! a time without ever restricting the player to one shot in flight.

use std::collections::HashMap;

use crate::level::{
    meet_tick, Entry, Wave, COOLDOWN, DEPTH_MAX, MAX_TANKERS, MAX_THREATS, SHOT_SPEED,
};
use crate::web::{Dir, Web};

const NEVER: i32 = i32::MAX;

/// Labels kept per `(killed set, lane)`. One per distinct vector of tanker
/// kill ticks, so this only binds on waves with tankers, and generously.
pub const LABEL_CAP: usize = 96;

/// One shot in a witness play.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Step {
    pub threat: usize,
    /// Tick the shot leaves the gun.
    pub fire: i32,
    /// Lane it is fired into — which is where the player must be standing.
    pub lane: usize,
    /// Tick it connects.
    pub meet: i32,
    /// Ticks to spare before this threat would have reached the rim.
    pub margin: i32,
}

/// A witness that the rim can be held, or the fact that it cannot.
#[derive(Clone, Debug, Default)]
pub struct Tour {
    pub steps: Vec<Step>,
    /// The tick the last threat dies.
    pub end: i32,
    /// The tightest margin anywhere in the play.
    pub bottleneck: i32,
}

/// Which way the player commits for their opening shot. This is the decision
/// the whole game exists to measure, so it gets its own type and its own
/// column in every report.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(usize)]
pub enum Opening {
    /// Go clockwise for the first shot.
    Cw = 0,
    /// Go counter-clockwise for the first shot.
    Ccw = 1,
    /// Take the first shot without leaving the lane you start in.
    Stand = 2,
}

impl Opening {
    pub const ALL: [Opening; 3] = [Opening::Cw, Opening::Ccw, Opening::Stand];
    pub const COUNT: usize = 3;
    pub fn name(self) -> &'static str {
        match self {
            Opening::Cw => "cw",
            Opening::Ccw => "ccw",
            Opening::Stand => "stand",
        }
    }
}

/// Everything the solver needs about "right now". Fresh at the start of a
/// wave; part-played when the autopsy asks whether a run is still alive.
#[derive(Clone, Debug)]
pub struct Situation {
    pub lane: usize,
    /// Earliest tick the player may act.
    pub tick: i32,
    /// Tick of the player's last shot, for the cooldown.
    pub last_fire: i32,
    /// Bit `i` set = threat `i` is already dead.
    pub killed: u32,
    /// Resolved entries. `None` for a tanker child whose parent still lives.
    pub entries: Vec<Option<Entry>>,
    /// Meet tick of each already-dead tanker, in `wave.tankers()` order.
    pub tk: [i32; MAX_TANKERS],
}

impl Situation {
    pub fn fresh(wave: &Wave, lane: usize) -> Situation {
        Situation {
            lane,
            tick: 0,
            last_fire: -COOLDOWN,
            killed: 0,
            entries: wave.threats.iter().map(|t| t.entry).collect(),
            tk: [NEVER; MAX_TANKERS],
        }
    }
}

/// What the generator stamps on a level, and what the report prints.
#[derive(Clone, Debug)]
pub struct Cert {
    pub threats: usize,
    pub holdable: bool,
    /// The largest `s` such that the wave is still holdable when every threat
    /// must die at least `s` ticks before it would reach the rim. The honest
    /// measure of how much room perfect play has: 0 means the only surviving
    /// play is frame-perfect.
    ///
    /// Equal to the best of [`Cert::open_slack`], because every play opens one
    /// of the three ways and there is no fourth.
    pub slack: i32,
    /// Slack available under each opening, in [`Opening::ALL`] order, or `-1`
    /// where that opening loses outright.
    ///
    /// This is the number the whole game is built to produce. A first draft
    /// asked only the yes/no question "does exactly one way round survive",
    /// and it was a bad question: on a web 66 ticks across, a wave with 80
    /// ticks of slack survives *both* ways round, so the answer was almost
    /// always "no" and the generator ground through 167 repairs to place four
    /// waves. The useful question is quantitative — **what does going the
    /// wrong way cost you** — and it has an exact answer in ticks.
    pub open_slack: [i32; 3],
    pub tour: Tour,
    /// Labels expanded. Reported so a slow level is visible rather than
    /// mysterious.
    pub work: u64,
    /// A label set hit [`LABEL_CAP`] and a candidate play was discarded
    /// unexamined. The verdict above is then a *lower* bound on what perfect
    /// play can do, not the answer — so nothing certified this way is fit to
    /// ship, and [`crate::gen`] throws it away.
    pub capped: bool,
}

impl Cert {
    pub fn holds(&self, o: Opening) -> bool {
        self.open_slack[o as usize] >= 0
    }

    /// Openings that hold, excluding standing still.
    pub fn live_directions(&self) -> usize {
        (self.holds(Opening::Cw) as usize) + (self.holds(Opening::Ccw) as usize)
    }

    /// **What the wrong way round costs, in ticks.**
    ///
    /// The difference in slack between the better and the worse of the two
    /// directions, counting a direction that loses outright as `-1` so that
    /// "fatal" is simply the top of the same scale. Zero means the web was
    /// irrelevant to this wave; large means the opening move decided it.
    pub fn wrong_way_cost(&self) -> i32 {
        let cw = self.open_slack[Opening::Cw as usize];
        let ccw = self.open_slack[Opening::Ccw as usize];
        cw.max(ccw) - cw.min(ccw)
    }

    /// Does going the wrong way actually hurt? True when the worse direction
    /// costs at least half the margin perfect play had to begin with — or when
    /// it loses outright.
    ///
    /// The half is a judgement, and it is the only one in the file. It is set
    /// where it is because below it the wrong opening is recoverable by
    /// ordinary play and the wave does not teach the web; above it, the player
    /// who guesses wrong can feel the rest of the wave going bad.
    pub fn commits(&self) -> bool {
        self.holdable && self.wrong_way_cost() * 2 >= self.slack.max(1)
    }

    /// The strict form: exactly one way round survives at all.
    pub fn discriminates(&self) -> bool {
        self.holdable && self.live_directions() == 1
    }

    pub fn opening_label(&self) -> String {
        if !self.holdable {
            return "—".into();
        }
        let mut s = String::new();
        for o in Opening::ALL {
            let v = self.open_slack[o as usize];
            if v >= 0 {
                if !s.is_empty() {
                    s.push('/');
                }
                let _ = std::fmt::Write::write_fmt(&mut s, format_args!("{}:{v}", o.name()));
            }
        }
        s
    }
}

// ---------------------------------------------------------------- internals --

/// A stretch of firing ticks over which the lane you must fire into, to hit a
/// given threat, does not change. A spiker has one of these; a fast flipper
/// has one per flip.
#[derive(Clone, Copy, Debug)]
struct Opp {
    lo: i32,
    hi: i32,
    lane: usize,
}

#[derive(Clone, Copy)]
struct Label {
    fire: i32,
    tk: [i32; MAX_TANKERS],
    trace: u32,
}

/// Keep the best label for each distinct vector of tanker kill ticks. Returns
/// `true` if the cap turned a label away — which invalidates the search, so
/// the caller has to say so out loud.
fn insert_label(set: &mut Vec<Label>, cand: Label, cap: usize) -> bool {
    for l in set.iter_mut() {
        if l.tk == cand.tk {
            // Same tanker history: the future depends only on when you next
            // fire, and firing earlier is never worse — you can always wait.
            if cand.fire < l.fire {
                *l = cand;
            }
            return false;
        }
    }
    if set.len() >= cap {
        return true;
    }
    set.push(cand);
    false
}

#[derive(Clone, Copy)]
struct Trace {
    prev: u32,
    step: Step,
}

/// Firing windows, computed once and reused.
///
/// A root threat's windows never change, so they are computed up front into a
/// flat table. A tanker child's depend on when its parent died, so those are
/// memoised on demand — there are only ever a handful of distinct kill ticks
/// in play. Getting this right is not a micro-optimisation: the first version
/// rebuilt and *cloned* a window list on every single transition, which was
/// most of the solver's running time.
struct Opps {
    roots: Vec<Vec<Opp>>,
    children: HashMap<(usize, i32), Vec<Opp>>,
}

struct Solve<'a> {
    web: &'a Web,
    wave: &'a Wave,
    /// Every threat must die this many ticks before it would reach the rim.
    shift: i32,
    /// Index into `tk` for each threat that is a tanker.
    tanker_slot: Vec<Option<usize>>,
    work: u64,
    capped: bool,
}

impl<'a> Solve<'a> {
    fn new(web: &'a Web, wave: &'a Wave, shift: i32) -> Solve<'a> {
        let tankers = wave.tankers();
        let mut tanker_slot = vec![None; wave.len()];
        for (slot, idx) in tankers.iter().enumerate() {
            assert!(slot < MAX_TANKERS, "wave has more than MAX_TANKERS tankers");
            tanker_slot[*idx] = Some(slot);
        }
        Solve {
            web,
            wave,
            shift,
            tanker_slot,
            work: 0,
            capped: false,
        }
    }

    /// Where and when threat `i` entered play, given a label. `None` if it is
    /// a child whose parent is still alive.
    fn entry_of(&self, sit: &Situation, label: &Label, i: usize) -> Option<Entry> {
        if let Some(e) = sit.entries[i] {
            return Some(e);
        }
        let parent = self.wave.threats[i].parent?;
        let slot = self.tanker_slot[parent]?;
        let died = label.tk[slot];
        if died == NEVER {
            return None;
        }
        let pe = sit.entries[parent].expect("a tanker always enters on its own");
        let pt = &self.wave.threats[parent];
        let lane = pt.lane_at(self.web, pe, died);
        let side = self.wave.threats[i].side;
        Some(Entry {
            lane: self.web.neighbour(lane, side).unwrap_or(lane),
            depth: pt.depth_at(pe, died).max(1),
            tick: died,
        })
    }

    fn deadline(&self, i: usize, e: Entry) -> i32 {
        self.wave.threats[i].breach_tick(e) - self.shift
    }

    /// Does a shot fired into `lane` at tick `fire` reach threat `i`, and when?
    /// Mirrors [`crate::sim::shot_lands`], including the tick a spent shot
    /// leaves play.
    fn lands(&self, i: usize, e: Entry, lane: usize, fire: i32) -> Option<i32> {
        let th = &self.wave.threats[i];
        let tau = meet_tick(th, e, fire);
        if tau > self.deadline(i, e) {
            return None;
        }
        if (tau - 1 - fire) * SHOT_SPEED >= DEPTH_MAX {
            return None; // the shot left the tube before the threat arrived
        }
        if th.lane_at(self.web, e, tau) != lane {
            return None;
        }
        Some(tau)
    }

    /// The firing windows for threat `i` under entry `e`, in time order.
    fn build_opps(&self, i: usize, e: Entry) -> Vec<Opp> {
        let th = self.wave.threats[i];
        let deadline = self.deadline(i, e);
        let mut runs: Vec<Opp> = Vec::new();
        let mut fire = 0i32;
        while fire <= deadline {
            let tau = meet_tick(&th, e, fire);
            if tau > deadline {
                break; // tau only grows with fire
            }
            if (tau - 1 - fire) * SHOT_SPEED < DEPTH_MAX {
                let lane = th.lane_at(self.web, e, tau);
                match runs.last_mut() {
                    Some(r) if r.lane == lane && r.hi == fire - 1 => r.hi = fire,
                    _ => runs.push(Opp {
                        lo: fire,
                        hi: fire,
                        lane,
                    }),
                }
            }
            fire += 1;
        }
        runs
    }

    /// Which threat a shot into `lane` at `fire` actually kills. The gun does
    /// not choose its target: it hits whatever is nearest the rim.
    fn victim(
        &self,
        sit: &Situation,
        label: &Label,
        killed: u32,
        fire: i32,
        lane: usize,
    ) -> Option<(usize, i32)> {
        let mut best: Option<(usize, i32, i32)> = None; // (idx, meet, depth)
        for k in 0..self.wave.len() {
            if killed & (1 << k) != 0 {
                continue;
            }
            let Some(e) = self.entry_of(sit, label, k) else {
                continue;
            };
            let Some(tau) = self.lands(k, e, lane, fire) else {
                continue;
            };
            let d = self.wave.threats[k].depth_at(e, tau);
            let better = match best {
                None => true,
                Some((_, bt, bd)) => tau < bt || (tau == bt && d < bd),
            };
            if better {
                best = Some((k, tau, d));
            }
        }
        best.map(|(k, tau, _)| (k, tau))
    }

    fn run(&mut self, sit: &Situation, opening: Option<Opening>) -> Option<Tour> {
        let n = self.wave.len();
        assert!(n <= MAX_THREATS, "wave of {n} exceeds MAX_THREATS");
        if n == 0 {
            return Some(Tour::default());
        }
        let lanes = self.web.lanes;
        let full: u32 = (1u32 << n) - 1;

        // states[mask * lanes + lane] -> Pareto set
        let mut states: Vec<Vec<Label>> = vec![Vec::new(); (1usize << n) * lanes];
        let root = Label {
            fire: sit.last_fire,
            tk: sit.tk,
            trace: u32::MAX,
        };
        states[sit.killed as usize * lanes + sit.lane].push(root);

        let mut opps = Opps {
            roots: (0..n)
                .map(|i| match sit.entries[i] {
                    Some(e) if self.wave.threats[i].parent.is_none() => self.build_opps(i, e),
                    _ => Vec::new(),
                })
                .collect(),
            children: HashMap::new(),
        };
        let mut trace: Vec<Trace> = vec![Trace {
            prev: u32::MAX,
            step: Step {
                threat: 0,
                fire: 0,
                lane: 0,
                meet: 0,
                margin: 0,
            },
        }];

        let mut best_end: Option<(i32, u32)> = None;

        for mask in (sit.killed as usize)..=(full as usize) {
            if mask & sit.killed as usize != sit.killed as usize {
                continue;
            }
            for lane in 0..lanes {
                let here = std::mem::take(&mut states[mask * lanes + lane]);
                if here.is_empty() {
                    continue;
                }
                if mask as u32 == full {
                    for l in &here {
                        // `fire` is the last shot; the tour's end is its meet
                        // tick, which the trace remembers.
                        let end = trace[l.trace as usize].step.meet;
                        if best_end.is_none_or(|(e, _)| end < e) {
                            best_end = Some((end, l.trace));
                        }
                    }
                    continue;
                }
                let first = mask as u32 == sit.killed && lane == sit.lane;
                for label in &here {
                    self.expand(
                        sit,
                        label,
                        mask as u32,
                        lane,
                        first,
                        opening,
                        &mut opps,
                        &mut trace,
                        &mut states,
                    );
                }
            }
        }

        let (_, last) = best_end?;
        let mut steps = Vec::new();
        let mut cur = last;
        while cur != u32::MAX {
            let t = trace[cur as usize];
            steps.push(t.step);
            cur = t.prev;
        }
        steps.reverse();
        let end = steps.last().map(|s| s.meet).unwrap_or(0);
        let bottleneck = steps.iter().map(|s| s.margin).min().unwrap_or(0);
        Some(Tour {
            steps,
            end,
            bottleneck,
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn expand(
        &mut self,
        sit: &Situation,
        label: &Label,
        mask: u32,
        lane: usize,
        first: bool,
        opening: Option<Opening>,
        opps: &mut Opps,
        trace: &mut Vec<Trace>,
        states: &mut [Vec<Label>],
    ) {
        let lanes = self.web.lanes;
        let n = self.wave.len();
        let earliest = (label.fire + COOLDOWN).max(sit.tick);
        // One action per tick: the tick you fire is spent firing, so the walk
        // to the next lane starts the tick after. At the root nothing has been
        // fired yet and the player may leave immediately.
        let depart = if label.trace == u32::MAX {
            sit.tick
        } else {
            (label.fire + 1).max(sit.tick)
        };

        for target in 0..n {
            if mask & (1 << target) != 0 {
                continue;
            }
            let Some(e) = self.entry_of(sit, label, target) else {
                continue; // not hatched yet
            };
            // Only the earliest opportunity per lane can ever be worth taking:
            // a later shot into the same lane leaves the player in the same
            // place strictly later, with no compensating gain.
            let mut taken: u32 = 0;
            let windows: &[Opp] = if self.wave.threats[target].parent.is_none() {
                &opps.roots[target]
            } else {
                let key = (target, e.tick);
                opps.children
                    .entry(key)
                    .or_insert_with(|| self.build_opps(target, e));
                &opps.children[&key]
            };
            for opp in windows.iter().copied() {
                if taken & (1 << opp.lane) != 0 {
                    continue;
                }
                if first && !opening_allows(self.web, opening, sit.lane, opp.lane) {
                    continue;
                }
                let reach = depart + self.web.travel(lane, opp.lane);
                let fire = opp.lo.max(earliest).max(reach);
                if fire > opp.hi {
                    continue;
                }
                let Some((victim, meet)) = self.victim(sit, label, mask, fire, opp.lane) else {
                    continue;
                };
                taken |= 1 << opp.lane;
                self.work += 1;

                let ve = self
                    .entry_of(sit, label, victim)
                    .expect("the victim was live, so it had entered");
                let margin = self.wave.threats[victim].breach_tick(ve) - meet;
                let mut tk = label.tk;
                if let Some(slot) = self.tanker_slot[victim] {
                    tk[slot] = meet;
                }
                trace.push(Trace {
                    prev: label.trace,
                    step: Step {
                        threat: victim,
                        fire,
                        lane: opp.lane,
                        meet,
                        margin,
                    },
                });
                let next = Label {
                    fire,
                    tk,
                    trace: (trace.len() - 1) as u32,
                };
                let slot = (mask | (1 << victim)) as usize * lanes + opp.lane;
                self.capped |= insert_label(&mut states[slot], next, LABEL_CAP);
            }
        }
    }
}

fn opening_allows(web: &Web, opening: Option<Opening>, start: usize, target: usize) -> bool {
    match opening {
        None => true,
        Some(Opening::Stand) => target == start,
        Some(Opening::Cw) => target != start && web.dir(start, target) == Dir::Cw,
        Some(Opening::Ccw) => target != start && web.dir(start, target) == Dir::Ccw,
    }
}

// -------------------------------------------------------------------- api --

/// Is the rim holdable from `sit`, and how? `shift` tightens every deadline by
/// that many ticks; pass 0 for the real game.
pub fn hold(
    web: &Web,
    wave: &Wave,
    sit: &Situation,
    opening: Option<Opening>,
    shift: i32,
) -> Option<Tour> {
    hold_checked(web, wave, sit, opening, shift).0
}

/// As [`hold`], and also whether the search was complete.
pub fn hold_checked(
    web: &Web,
    wave: &Wave,
    sit: &Situation,
    opening: Option<Opening>,
    shift: i32,
) -> (Option<Tour>, bool) {
    let mut s = Solve::new(web, wave, shift);
    let tour = s.run(sit, opening);
    (tour, s.capped)
}

/// The largest deadline tightening the wave still survives — how much room
/// perfect play actually has, under `opening` if one is given.
///
/// Binary search over [`hold`], which is legitimate because holding is
/// monotone in `shift`: tightening a deadline can only remove plays, never add
/// one. `hi_bound` must be a shift that is already known to fail.
pub fn slack_of(
    web: &Web,
    wave: &Wave,
    sit: &Situation,
    opening: Option<Opening>,
    hi_bound: i32,
) -> i32 {
    if hold(web, wave, sit, opening, 0).is_none() {
        return -1;
    }
    let (mut lo, mut hi) = (0, 1.max(hi_bound));
    // Grow until something fails, so the search has a bracket.
    while hi < hi_bound && hold(web, wave, sit, opening, hi).is_some() {
        lo = hi;
        hi *= 2;
    }
    let mut hi = hi.min(hi_bound);
    if hold(web, wave, sit, opening, hi).is_some() {
        return hi;
    }
    while lo + 1 < hi {
        let mid = lo + (hi - lo) / 2;
        if hold(web, wave, sit, opening, mid).is_some() {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    lo
}

/// Unconstrained slack.
pub fn slack(web: &Web, wave: &Wave, sit: &Situation) -> i32 {
    slack_of(web, wave, sit, None, wave.horizon() + 1)
}

/// The full verdict on a wave: holdable, by how much, and what each way round
/// the web is worth.
pub fn certify(web: &Web, wave: &Wave, start_lane: usize) -> Cert {
    let sit = Situation::fresh(wave, start_lane);
    let mut s = Solve::new(web, wave, 0);
    let tour = s.run(&sit, None);
    let work = s.work;
    let mut capped = s.capped;
    let Some(tour) = tour else {
        return Cert {
            threats: wave.len(),
            holdable: false,
            slack: -1,
            open_slack: [-1; 3],
            tour: Tour::default(),
            work,
            capped,
        };
    };

    let total = slack(web, wave, &sit);
    let mut open_slack = [-1i32; Opening::COUNT];
    for o in Opening::ALL {
        // Nothing can beat the unconstrained answer, so `total + 1` is a
        // known-failing bound and each search is short.
        open_slack[o as usize] = slack_of(web, wave, &sit, Some(o), total + 1);
        capped |= hold_checked(web, wave, &sit, Some(o), 0).1;
    }
    debug_assert_eq!(
        open_slack.iter().copied().max().unwrap_or(-1),
        total,
        "every play opens one of the three ways, so the best opening must \
         match the unconstrained answer"
    );

    Cert {
        threats: wave.len(),
        holdable: true,
        slack: total,
        open_slack,
        tour,
        work,
        capped,
    }
}

/// Ticks the wave gives you in total, for scaling reports.
pub fn wave_span(wave: &Wave) -> i32 {
    wave.roots()
        .map(|(_, t)| t.breach_tick(t.entry.unwrap()))
        .max()
        .unwrap_or(0)
}

/// The number of shots a wave needs, which is its floor on time: you cannot
/// clear `k` threats faster than `(k − 1) · COOLDOWN` ticks.
pub fn shot_floor(wave: &Wave) -> i32 {
    (wave.len() as i32 - 1).max(0) * COOLDOWN
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::level::{Kind, Threat};
    use crate::sim::{self, Action};
    use crate::web::Shape;

    fn ring(n: usize) -> Web {
        Web::new(n, Shape::Circle)
    }

    #[test]
    fn one_threat_in_your_lane_is_trivially_holdable() {
        let web = ring(12);
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 0, 800, 0, 4)]);
        let cert = certify(&web, &wave, 0);
        assert!(cert.holdable);
        assert_eq!(cert.tour.steps.len(), 1);
        assert_eq!(cert.tour.steps[0].threat, 0);
        assert!(cert.slack > 0);
        assert!(cert.holds(Opening::Stand), "standing still must work here");
    }

    #[test]
    fn a_threat_you_cannot_reach_in_time_is_not_holdable() {
        // Far side of a big web, arriving almost immediately.
        let web = ring(16);
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 8, 60, 0, 30)]);
        let cert = certify(&web, &wave, 0);
        assert!(!cert.holdable);
        assert_eq!(cert.slack, -1);
        assert_eq!(cert.opening_label(), "—");
    }

    #[test]
    fn slack_is_the_real_edge() {
        let web = ring(12);
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 0, 800, 0, 4)]);
        let sit = Situation::fresh(&wave, 0);
        let s = slack(&web, &wave, &sit);
        assert!(
            hold(&web, &wave, &sit, None, s).is_some(),
            "slack {s} must hold"
        );
        assert!(
            hold(&web, &wave, &sit, None, s + 1).is_none(),
            "slack {s} must be the last one that holds"
        );
    }

    #[test]
    fn the_web_can_force_a_direction() {
        // Two threats, both counter-clockwise of the player, the nearer one
        // urgent. Going clockwise means crossing the whole ring first.
        let web = ring(14);
        let wave = Wave::new(vec![
            Threat::root(Kind::Spiker, 13, 200, 0, 3),
            Threat::root(Kind::Spiker, 12, 320, 0, 3),
        ]);
        let cert = certify(&web, &wave, 0);
        assert!(cert.holdable);
        assert!(cert.holds(Opening::Ccw), "counter-clockwise must work");
        assert!(!cert.holds(Opening::Cw), "clockwise is the long way round");
        assert!(cert.discriminates());
        assert!(
            cert.commits(),
            "and going the wrong way should be expensive"
        );
    }

    #[test]
    fn a_symmetric_wave_does_not_discriminate() {
        let web = ring(12);
        let wave = Wave::new(vec![
            Threat::root(Kind::Spiker, 1, 900, 0, 3),
            Threat::root(Kind::Spiker, 11, 900, 0, 3),
        ]);
        let cert = certify(&web, &wave, 0);
        assert!(cert.holdable);
        assert_eq!(cert.live_directions(), 2, "both ways round should work");
        assert!(!cert.discriminates());
    }

    #[test]
    fn an_open_web_removes_the_second_option() {
        // On a strip there is no long way round at all: a threat behind you is
        // reached one way or not at all.
        let web = Web::new(12, Shape::Ramp { growth: 14 });
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 0, 400, 0, 3)]);
        let cert = certify(&web, &wave, 6);
        assert!(cert.holdable);
        assert!(
            !cert.holds(Opening::Cw),
            "clockwise cannot reach lane 0 from lane 6"
        );
        assert!(cert.holds(Opening::Ccw));
    }

    #[test]
    fn the_gun_hits_what_is_nearest_the_rim_not_what_you_aimed_at() {
        let web = ring(10);
        let wave = Wave::new(vec![
            Threat::root(Kind::Spiker, 0, 900, 0, 3),
            Threat::root(Kind::Spiker, 0, 200, 0, 3),
        ]);
        let cert = certify(&web, &wave, 0);
        assert!(cert.holdable);
        // Whatever order the solver wants, the shallow one has to die first —
        // the gun gives it no choice.
        assert_eq!(cert.tour.steps[0].threat, 1);
    }

    #[test]
    fn tanker_children_are_solved_for_too() {
        let web = ring(12);
        let wave = Wave::new(vec![
            Threat::root(Kind::Tanker, 0, 900, 0, 3),
            Threat::child(0, Dir::Cw, 6, 25, Dir::Cw),
            Threat::child(0, Dir::Ccw, 6, 25, Dir::Ccw),
        ]);
        let cert = certify(&web, &wave, 0);
        assert!(cert.holdable, "the whole family has to die");
        assert_eq!(cert.tour.steps.len(), 3);
        assert_eq!(cert.tour.steps[0].threat, 0, "the parent dies first");
        let killed: Vec<usize> = cert.tour.steps.iter().map(|s| s.threat).collect();
        assert!(killed.contains(&1) && killed.contains(&2));
    }

    #[test]
    fn when_a_tanker_died_changes_the_verdict_on_its_own() {
        // The justification for carrying tanker kill ticks in the state at
        // all. Same web, same wave, same everything — only the tick the tanker
        // died at differs, and the rim goes from holdable to lost.
        let web = ring(12);
        let wave = Wave::new(vec![
            Threat::root(Kind::Tanker, 0, 900, 0, 3),
            Threat::child(0, Dir::Cw, 6, 0, Dir::Still),
            Threat::child(0, Dir::Ccw, 6, 0, Dir::Still),
            Threat::root(Kind::Spiker, 6, 900, 0, 6),
        ]);
        // Hand the solver a board on which the tanker is already dead, killed
        // at a chosen tick, and ask what is left.
        let after = |kill: i32| {
            let pe = wave.threats[0].entry.unwrap();
            let depth = wave.threats[0].depth_at(pe, kill).max(1);
            let mut sit = Situation::fresh(&wave, 0);
            sit.tick = kill;
            sit.last_fire = kill;
            sit.killed = 1;
            sit.tk[0] = kill;
            for (c, side) in [(1usize, Dir::Cw), (2, Dir::Ccw)] {
                sit.entries[c] = Some(Entry {
                    lane: web.neighbour(0, side).unwrap(),
                    depth,
                    tick: kill,
                });
            }
            hold(&web, &wave, &sit, None, 0).is_some()
        };
        let early = after(20);
        let late = after(180);
        assert_ne!(
            early, late,
            "the kill tick has to matter — early {early}, late {late}"
        );
    }

    #[test]
    fn label_sets_keep_one_entry_per_tanker_history() {
        let mut set: Vec<Label> = Vec::new();
        let l = |fire: i32, tk0: i32| Label {
            fire,
            tk: [tk0, NEVER],
            trace: 0,
        };
        assert!(!insert_label(&mut set, l(100, 20), LABEL_CAP));
        assert!(!insert_label(&mut set, l(90, 20), LABEL_CAP)); // better, same history
        assert_eq!(set.len(), 1);
        assert_eq!(set[0].fire, 90);
        assert!(!insert_label(&mut set, l(120, 20), LABEL_CAP)); // worse, same history
        assert_eq!(set.len(), 1);
        // A different tanker history is *not* comparable, however much later
        // it fires — that is the whole point.
        assert!(!insert_label(&mut set, l(300, 180), LABEL_CAP));
        assert_eq!(set.len(), 2);
        // …and the cap is a refusal, reported, not a silent drop.
        let mut small: Vec<Label> = Vec::new();
        assert!(!insert_label(&mut small, l(10, 1), 1));
        assert!(insert_label(&mut small, l(10, 2), 1));
        assert_eq!(small.len(), 1);
    }

    #[test]
    fn certified_tours_actually_replay() {
        // The solver's answer is only worth anything if the simulator agrees.
        // This drives the sim from the tour and checks the wave clears.
        for (lanes, shape) in [
            (12, Shape::Circle),
            (13, Shape::Star { depth: 45 }),
            (11, Shape::Ramp { growth: 18 }),
        ] {
            let web = Web::new(lanes, shape);
            let wave = Wave::new(vec![
                Threat::root(Kind::Flipper, 2, 850, 0, 3).with_flip(19, Dir::Cw),
                Threat::root(Kind::Tanker, 7, 900, 0, 3),
                Threat::child(1, Dir::Cw, 6, 26, Dir::Cw),
                Threat::child(1, Dir::Ccw, 6, 26, Dir::Ccw),
                Threat::root(Kind::Spiker, 5, 700, 30, 4),
            ]);
            let cert = certify(&web, &wave, 0);
            assert!(cert.holdable, "{} unexpectedly unholdable", shape.label());
            let st = drive(&web, &wave, 0, &cert.tour);
            assert!(
                matches!(st.outcome, sim::Outcome::Cleared { .. }),
                "{}: solver said holdable, sim said {:?}",
                shape.label(),
                st.outcome
            );
        }
    }

    /// Turn a solver tour into keystrokes and hand them to the simulator.
    /// This is the bridge that keeps the two models honest about each other.
    fn drive(web: &Web, wave: &Wave, start: usize, tour: &Tour) -> sim::SimState {
        let mut i = 0usize;
        sim::run(web, wave, start, |st, web, _| {
            let Some(step) = tour.steps.get(i) else {
                return Action::Hold;
            };
            if st.lane != step.lane {
                return Action::Move(web.dir(st.lane, step.lane));
            }
            if st.tick >= step.fire && st.can_fire() {
                i += 1;
                return Action::Fire;
            }
            Action::Hold
        })
    }

    #[test]
    fn solver_and_sim_agree_on_the_collision_rule() {
        let web = Web::new(12, Shape::Lobed { lobes: 3, amp: 32 });
        let wave = Wave::new(vec![
            Threat::root(Kind::Flipper, 4, 900, 0, 3).with_flip(11, Dir::Ccw)
        ]);
        let e = wave.threats[0].entry.unwrap();
        let s = Solve::new(&web, &wave, 0);
        for fire in 0..200 {
            for lane in 0..web.lanes {
                let a = s.lands(0, e, lane, fire);
                let b = sim::shot_lands(&web, &wave.threats[0], e, lane, fire);
                // sim::shot_lands does not model the spent shot, so compare
                // only where the solver accepts.
                if let Some(t) = a {
                    assert_eq!(Some(t), b, "fire {fire} lane {lane}");
                }
            }
        }
    }

    #[test]
    fn unreachable_states_do_not_explode_the_search() {
        // A worst-case-ish wave: full lane count, many flippers.
        let web = ring(16);
        let mut threats = Vec::new();
        for i in 0..10 {
            threats.push(
                Threat::root(Kind::Flipper, i, 900 - (i as i32) * 20, (i as i32) * 6, 3)
                    .with_flip(17 + i as i32, if i % 2 == 0 { Dir::Cw } else { Dir::Ccw }),
            );
        }
        let wave = Wave::new(threats);
        let cert = certify(&web, &wave, 0);
        assert!(
            cert.work < 40_000_000,
            "solver did {} label expansions",
            cert.work
        );
    }
}
