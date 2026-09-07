//! Policies — including the ones written to be bad on purpose.
//!
//! A spread of bots is not here to find good play; the solver already knows
//! what good play is. It is here to answer a different question: **does this
//! game's central mechanic exist?**
//!
//! The mechanic is the web's geometry — that lanes cost different amounts to
//! cross, and that on a ring there are two ways round. So the controls are
//! bots that are blind to exactly that and nothing else:
//!
//! - [`FLAT_WEB`] measures distance in lanes crossed rather than ticks spent.
//!   It plays a game in which every web is a circle. If it keeps up with a bot
//!   that reads the real cost table, the shapes are scenery.
//! - [`NO_WRAP`] never goes the short way round the back. If it keeps up, the
//!   ring might as well be a strip.
//!
//! Each is otherwise identical to the policy it is the control for, which is
//! the only way the comparison means anything.

use crate::level::{meet_tick, Wave, COOLDOWN, DEPTH_MAX, SHOT_SPEED};
use crate::sim::{self, Action, Outcome, SimState};
use crate::solver::{self, Tour};
use crate::web::{Dir, Web};

/// How a bot measures the rim.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Metric {
    /// The truth: ticks, from the web's own cost table.
    Ticks,
    /// Lanes crossed, as though every lane were the same width.
    Hops,
}

/// Whether a bot will use a closed web's wrap.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Wrap {
    Allowed,
    /// Only ever walk toward increasing lane index.
    Forbidden,
}

/// What a bot goes for next.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Choose {
    /// Whatever will reach the rim soonest.
    Deadline,
    /// Whatever is closest.
    Nearest,
}

#[derive(Clone, Copy, Debug)]
pub struct Bot {
    pub name: &'static str,
    pub control: bool,
    pub blind_to: &'static str,
    pub metric: Metric,
    pub wrap: Wrap,
    pub choose: Choose,
}

/// The honest baseline: reads the real cost table, uses the wrap, goes for
/// whatever is about to land.
pub const DEADLINE: Bot = Bot {
    name: "deadline",
    control: false,
    blind_to: "",
    metric: Metric::Ticks,
    wrap: Wrap::Allowed,
    choose: Choose::Deadline,
};

/// Same, but goes for whatever is closest instead. Worse, and instructively
/// so — on a web with one expensive side, "closest" and "most urgent" pull in
/// opposite directions.
pub const NEAREST: Bot = Bot {
    name: "nearest",
    control: false,
    blind_to: "",
    metric: Metric::Ticks,
    wrap: Wrap::Allowed,
    choose: Choose::Nearest,
};

/// Control. Identical to [`DEADLINE`] except that it counts lanes instead of
/// ticks — so it plays as if every web were a circle.
pub const FLAT_WEB: Bot = Bot {
    name: "flat-web (control)",
    control: true,
    blind_to: "how much each lane costs to cross — plays every web as a circle",
    metric: Metric::Hops,
    wrap: Wrap::Allowed,
    choose: Choose::Deadline,
};

/// Control. Identical to [`DEADLINE`] except that it never uses the wrap.
pub const NO_WRAP: Bot = Bot {
    name: "no-wrap (control)",
    control: true,
    blind_to: "the short way round the back of a closed web",
    metric: Metric::Ticks,
    wrap: Wrap::Forbidden,
    choose: Choose::Deadline,
};

pub const ALL: [Bot; 4] = [DEADLINE, NEAREST, FLAT_WEB, NO_WRAP];

impl Bot {
    /// Cost from `a` to `b` under this bot's beliefs, and the first step to
    /// take. `None` when this bot believes `b` is unreachable.
    fn route(&self, web: &Web, a: usize, b: usize) -> Option<(i32, Dir)> {
        if a == b {
            return Some((0, Dir::Still));
        }
        let mut best: Option<(i32, Dir)> = None;
        for d in [Dir::Cw, Dir::Ccw] {
            if self.wrap == Wrap::Forbidden && d == Dir::Ccw {
                continue;
            }
            let Some(ticks) = web.travel_via(a, b, d) else {
                continue;
            };
            let cost = match self.metric {
                Metric::Ticks => ticks,
                Metric::Hops => hops(web, a, b, d).unwrap_or(i32::MAX),
            };
            if best.is_none_or(|(c, _)| cost < c) {
                best = Some((cost, d));
            }
        }
        best
    }

    /// The lane to head for in order to intercept threat `i`, and what that
    /// will cost. Leads the target: a flipper will not be where it is now.
    fn intercept(&self, web: &Web, wave: &Wave, st: &SimState, i: usize) -> Option<(usize, i32)> {
        let e = st.entry[i]?;
        let th = &wave.threats[i];
        let deadline = th.breach_tick(e);
        let ready = st.tick.max(st.busy_until).max(st.last_fire + COOLDOWN);
        let depart = st.tick.max(st.busy_until);
        let mut fire = ready;
        while fire <= deadline {
            let tau = meet_tick(th, e, fire);
            if tau > deadline {
                return None;
            }
            if (tau - 1 - fire) * SHOT_SPEED < DEPTH_MAX {
                let lane = th.lane_at(web, e, tau);
                if let Some((cost, _)) = self.route(web, st.lane, lane) {
                    if cost <= fire - depart || (self.metric == Metric::Hops && fire >= ready) {
                        return Some((lane, cost));
                    }
                }
            }
            fire += 1;
        }
        None
    }

    /// One tick of play.
    pub fn act(&self, st: &SimState, web: &Web, wave: &Wave) -> Action {
        if !st.settled() {
            return Action::Hold;
        }
        // Shoot whatever is in front of you, always. No bot is ever improved
        // by declining a free kill.
        if st.can_fire() {
            for i in 0..wave.len() {
                if !st.active(i) {
                    continue;
                }
                let e = st.entry[i].unwrap();
                if sim::shot_lands(web, &wave.threats[i], e, st.lane, st.tick).is_some() {
                    return Action::Fire;
                }
            }
        }
        // Otherwise go and find something.
        let mut best: Option<(i32, usize)> = None;
        for i in 0..wave.len() {
            if !st.active(i) {
                continue;
            }
            let Some((lane, cost)) = self.intercept(web, wave, st, i) else {
                continue;
            };
            let key = match self.choose {
                Choose::Deadline => {
                    let e = st.entry[i].unwrap();
                    wave.threats[i].breach_tick(e)
                }
                Choose::Nearest => cost,
            };
            if best.is_none_or(|(k, _)| key < k) {
                best = Some((key, lane));
            }
        }
        match best {
            Some((_, lane)) => match self.route(web, st.lane, lane) {
                Some((_, d)) if d != Dir::Still => Action::Move(d),
                _ => Action::Hold,
            },
            None => Action::Hold,
        }
    }

    /// Play one wave. Returns the final state.
    pub fn play(&self, web: &Web, wave: &Wave, start_lane: usize) -> SimState {
        sim::run(web, wave, start_lane, |st, web, wave| {
            self.act(st, web, wave)
        })
    }
}

/// Lanes crossed going `d` from `a` to `b`, or `None` at a wall.
fn hops(web: &Web, a: usize, b: usize, d: Dir) -> Option<i32> {
    let n = web.lanes;
    let mut cur = a;
    for k in 1..=n {
        cur = web.neighbour(cur, d)?;
        if cur == b {
            return Some(k as i32);
        }
        if cur == a {
            return None;
        }
    }
    None
}

/// Play a certified tour exactly. Not a bot — this is the solver's own answer
/// executed by the simulator, and it is in this module only so that the spread
/// has a ceiling to sit under.
pub fn play_tour(web: &Web, wave: &Wave, start_lane: usize, tour: &Tour) -> SimState {
    let mut i = 0usize;
    sim::run(web, wave, start_lane, |st, web, _| {
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

/// How far a bot gets through a level's waves, and where it was standing when
/// it stopped. The player's lane carries between waves, which is why a level
/// is more than the sum of its waves.
pub fn play_level(web: &Web, waves: &[Wave], start_lane: usize, bot: &Bot) -> (usize, usize) {
    let mut lane = start_lane;
    for (i, wave) in waves.iter().enumerate() {
        let st = bot.play(web, wave, lane);
        if !matches!(st.outcome, Outcome::Cleared { .. }) {
            return (i, st.lane);
        }
        lane = st.lane;
    }
    (waves.len(), lane)
}

/// The same, played perfectly. The ceiling any bot is measured against.
pub fn play_level_perfectly(web: &Web, waves: &[Wave], start_lane: usize) -> usize {
    let mut lane = start_lane;
    for (i, wave) in waves.iter().enumerate() {
        let sit = solver::Situation::fresh(wave, lane);
        let Some(tour) = solver::hold(web, wave, &sit, None, 0) else {
            return i;
        };
        let st = play_tour(web, wave, lane, &tour);
        if !matches!(st.outcome, Outcome::Cleared { .. }) {
            return i;
        }
        lane = st.lane;
    }
    waves.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::level::{Kind, Threat};
    use crate::web::Shape;

    #[test]
    fn every_bot_clears_a_wave_it_is_standing_in_front_of() {
        let web = Web::new(12, Shape::Circle);
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 0, 700, 0, 4)]);
        for bot in ALL {
            let st = bot.play(&web, &wave, 0);
            assert!(
                matches!(st.outcome, Outcome::Cleared { .. }),
                "{} failed the trivial case: {:?}",
                bot.name,
                st.outcome
            );
        }
    }

    #[test]
    fn the_no_wrap_control_really_is_blind_to_the_wrap() {
        let web = Web::new(14, Shape::Circle);
        // One lane counter-clockwise, and not much time: going the long way
        // round is thirteen lanes.
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 13, 200, 0, 3)]);
        let good = DEADLINE.play(&web, &wave, 0);
        let blind = NO_WRAP.play(&web, &wave, 0);
        assert!(matches!(good.outcome, Outcome::Cleared { .. }));
        assert!(
            matches!(blind.outcome, Outcome::Breached { .. }),
            "the control went the short way round after all: {:?}",
            blind.outcome
        );
    }

    #[test]
    fn the_flat_web_control_really_is_blind_to_the_cost_table() {
        // A star web: lane 1 is two hops away but cheap, lane 11 is two hops
        // away and expensive. A bot counting hops cannot tell them apart.
        let web = Web::new(12, Shape::Star { depth: 55 });
        let a = FLAT_WEB.route(&web, 0, 3);
        let b = DEADLINE.route(&web, 0, 3);
        assert_eq!(a.unwrap().0, 3, "the control counts lanes");
        assert_eq!(b.unwrap().0, web.travel(0, 3), "the real bot counts ticks");
        assert_ne!(a.unwrap().0, b.unwrap().0);
    }

    #[test]
    fn bots_lead_a_flipper_instead_of_shooting_where_it_was() {
        let web = Web::new(12, Shape::Circle);
        let wave = Wave::new(vec![
            Threat::root(Kind::Flipper, 6, 800, 0, 3).with_flip(21, Dir::Cw)
        ]);
        let st = DEADLINE.play(&web, &wave, 0);
        assert!(
            matches!(st.outcome, Outcome::Cleared { .. }),
            "a bot that cannot lead a flipper cannot measure anything: {:?}",
            st.outcome
        );
    }

    #[test]
    fn no_bot_beats_the_solver() {
        // A sanity floor on the whole design: if a bot ever clears a wave the
        // solver called unholdable, one of them is wrong.
        let web = Web::new(13, Shape::Lobed { lobes: 3, amp: 34 });
        for seed in 0..40i32 {
            let wave = Wave::new(vec![
                Threat::root(
                    Kind::Flipper,
                    (seed as usize) % 13,
                    700 + seed * 5,
                    0,
                    3 + seed % 4,
                )
                .with_flip(13 + seed % 9, Dir::Cw),
                Threat::root(
                    Kind::Spiker,
                    ((seed as usize) + 6) % 13,
                    600 + seed * 7,
                    10,
                    4,
                ),
            ]);
            let sit = solver::Situation::fresh(&wave, 0);
            let holdable = solver::hold(&web, &wave, &sit, None, 0).is_some();
            if holdable {
                continue;
            }
            for bot in ALL {
                let st = bot.play(&web, &wave, 0);
                assert!(
                    !matches!(st.outcome, Outcome::Cleared { .. }),
                    "seed {seed}: {} cleared a wave the solver called unholdable",
                    bot.name
                );
            }
        }
    }
}
