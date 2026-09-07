//! The headless simulator: one wave, one tick at a time.
//!
//! State is plain data and every function takes the web and the wave as
//! arguments, so there are no lifetimes to thread through the FFI layer and
//! the whole thing serialises trivially.
//!
//! The tick order is the contract that the solver has to match, so it is
//! written out once, here, and nowhere else:
//!
//! 1. apply the player's action (start a move, or fire)
//! 2. resolve shots — a shot hits the live threat nearest the rim in its lane
//! 3. hatch anything a kill in step 2 released
//! 4. check for a breach: any live threat at depth 0 ends the wave
//!
//! Kills resolve before breaches, so a shot that lands on the exact tick a
//! threat would reach the rim still counts. That is a deliberate mercy and the
//! solver grants exactly the same one.

use crate::level::{meet_tick, Entry, Kind, Threat, Wave, COOLDOWN, SHOT_SPEED};
use crate::web::{Dir, Web};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action {
    Hold,
    Move(Dir),
    Fire,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    Running,
    /// Everything died. `tick` is when the last one did.
    Cleared {
        tick: i32,
    },
    /// A threat reached the rim.
    Breached {
        tick: i32,
        threat: usize,
    },
    /// The wave outlived its horizon — a bug, not a game state.
    Stalled {
        tick: i32,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Shot {
    pub lane: usize,
    pub fired: i32,
}

impl Shot {
    pub fn depth_at(&self, tick: i32) -> i32 {
        (tick - self.fired) * SHOT_SPEED
    }
}

/// A kill, as it happened. The autopsy and the UI both read these.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Kill {
    pub threat: usize,
    pub tick: i32,
    pub lane: usize,
    pub depth: i32,
}

#[derive(Clone, Debug)]
pub struct SimState {
    pub tick: i32,
    pub lane: usize,
    /// Lane the player is walking away from while in transit; equals `lane`
    /// when settled. The renderer interpolates between the two seats.
    pub from_lane: usize,
    pub busy_until: i32,
    pub last_fire: i32,
    pub shots: Vec<Shot>,
    pub alive: Vec<bool>,
    pub entry: Vec<Option<Entry>>,
    pub kills: Vec<Kill>,
    pub outcome: Outcome,
    horizon: i32,
}

impl SimState {
    pub fn new(web: &Web, wave: &Wave, start_lane: usize) -> SimState {
        let n = wave.len();
        let mut entry = vec![None; n];
        for (i, t) in wave.threats.iter().enumerate() {
            entry[i] = t.entry;
        }
        let _ = web;
        SimState {
            tick: 0,
            lane: start_lane,
            from_lane: start_lane,
            busy_until: 0,
            last_fire: -COOLDOWN,
            shots: Vec::new(),
            alive: vec![true; n],
            entry,
            kills: Vec::new(),
            outcome: Outcome::Running,
            horizon: wave.horizon(),
        }
    }

    pub fn settled(&self) -> bool {
        self.tick >= self.busy_until
    }

    pub fn can_fire(&self) -> bool {
        self.settled() && self.tick - self.last_fire >= COOLDOWN
    }

    /// Has this threat entered play and not yet died?
    pub fn active(&self, i: usize) -> bool {
        self.alive[i] && matches!(self.entry[i], Some(e) if e.tick <= self.tick)
    }

    pub fn done(&self) -> bool {
        !matches!(self.outcome, Outcome::Running)
    }

    /// Advance one tick.
    pub fn step(&mut self, web: &Web, wave: &Wave, action: Action) {
        if self.done() {
            return;
        }
        let t = self.tick;

        // --- 1. the player ---
        match action {
            Action::Hold => {}
            // A move issued mid-transit is refused, not queued. The tick you
            // arrive you are settled again, so a driver that holds a direction
            // departs on that same tick and k lanes cost exactly the sum of
            // the k step costs — not a tick more. The solver's travel table
            // assumes precisely that, and
            // `continuous_movement_costs_exactly_the_travel_table` holds it.
            Action::Move(d) => {
                if self.settled() {
                    self.begin_move(web, d);
                }
            }
            Action::Fire => {
                if self.can_fire() {
                    self.last_fire = t;
                    self.shots.push(Shot {
                        lane: self.lane,
                        fired: t,
                    });
                }
            }
        }
        if self.settled() && self.from_lane != self.lane {
            self.from_lane = self.lane;
        }

        // --- 2. shots ---
        //
        // A shot connects with a threat only on the tick it *crosses* it —
        // the tick its depth first catches the threat's. Before that it is
        // shallower and has not reached it; after that it is deeper and has
        // gone past, and a flipper that wanders into the lane later wanders in
        // behind it.
        //
        // The first version of this loop used the standing condition "shot is
        // at least as deep as the threat, in the same lane", which quietly
        // gave every shot an unlimited second chance at anything that flipped
        // in afterwards. The solver did not model that, because it is not
        // true, and the sweep caught the two disagreeing: perfect play was
        // scoring 3.0 out of 4 on levels the solver had certified. Both sides
        // now compute the crossing tick from the same closed form in
        // `level::meet_tick`.
        let mut hatched: Vec<(usize, i32, usize, i32)> = Vec::new();
        let mut i = 0;
        while i < self.shots.len() {
            let shot = self.shots[i];
            let reach = shot.depth_at(t);
            let mut victim: Option<(usize, i32)> = None;
            for k in 0..wave.len() {
                if !self.active(k) {
                    continue;
                }
                let e = self.entry[k].unwrap();
                let th = &wave.threats[k];
                if meet_tick(th, e, shot.fired) != t {
                    continue;
                }
                if th.lane_at(web, e, t) != shot.lane {
                    continue;
                }
                let d = th.depth_at(e, t);
                // Nearest the rim wins; index breaks ties so the rule is total.
                if victim.is_none_or(|(_, bd)| d < bd) {
                    victim = Some((k, d));
                }
            }
            match victim {
                Some((k, d)) => {
                    self.alive[k] = false;
                    self.kills.push(Kill {
                        threat: k,
                        tick: t,
                        lane: shot.lane,
                        depth: d,
                    });
                    if wave.threats[k].kind == Kind::Tanker {
                        hatched.push((k, t, shot.lane, d));
                    }
                    self.shots.remove(i);
                }
                None => {
                    if reach >= crate::level::DEPTH_MAX {
                        self.shots.remove(i); // spent
                    } else {
                        i += 1;
                    }
                }
            }
        }

        // --- 3. hatching ---
        for (parent, tick, lane, depth) in hatched {
            for c in wave.children_of(parent) {
                let side = wave.threats[c].side;
                let l = web.neighbour(lane, side).unwrap_or(lane);
                self.entry[c] = Some(Entry {
                    lane: l,
                    depth: depth.max(1),
                    tick,
                });
            }
        }

        // --- 4. the rim ---
        for k in 0..wave.len() {
            if !self.active(k) {
                continue;
            }
            let e = self.entry[k].unwrap();
            if wave.threats[k].depth_at(e, t) <= 0 {
                self.outcome = Outcome::Breached { tick: t, threat: k };
                return;
            }
        }

        if self.alive.iter().all(|a| !*a) {
            self.outcome = Outcome::Cleared {
                tick: self.kills.last().map(|k| k.tick).unwrap_or(t),
            };
            return;
        }

        self.tick += 1;
        if self.tick > self.horizon + 64 {
            self.outcome = Outcome::Stalled { tick: self.tick };
        }
    }

    fn begin_move(&mut self, web: &Web, d: Dir) {
        if d == Dir::Still {
            return;
        }
        let (Some(next), Some(cost)) = (web.neighbour(self.lane, d), web.step_cost(self.lane, d))
        else {
            return; // a wall; the input is simply refused
        };
        self.from_lane = self.lane;
        self.lane = next;
        self.busy_until = self.tick + cost;
    }

    /// Where the player is, as a fraction of the way between `from_lane` and
    /// `lane`, in per-mille. For the renderer only.
    pub fn transit_permille(&self, web: &Web) -> i32 {
        if self.settled() || self.from_lane == self.lane {
            return 1000;
        }
        let total = web
            .step_cost(self.from_lane, web.dir(self.from_lane, self.lane))
            .unwrap_or(1)
            .max(1);
        let done = total - (self.busy_until - self.tick);
        (done * 1000 / total).clamp(0, 1000)
    }
}

/// Run a wave to completion, asking `policy` for an action each tick.
pub fn run<F>(web: &Web, wave: &Wave, start_lane: usize, mut policy: F) -> SimState
where
    F: FnMut(&SimState, &Web, &Wave) -> Action,
{
    let mut st = SimState::new(web, wave, start_lane);
    while !st.done() {
        let a = policy(&st, web, wave);
        st.step(web, wave, a);
    }
    st
}

/// Replay a fixed action list — the form the browser records and the autopsy
/// consumes. Actions beyond the end of the list are `Hold`.
pub fn replay(web: &Web, wave: &Wave, start_lane: usize, actions: &[Action]) -> SimState {
    let mut i = 0usize;
    run(web, wave, start_lane, |_, _, _| {
        let a = actions.get(i).copied().unwrap_or(Action::Hold);
        i += 1;
        a
    })
}

/// Would a shot fired into `lane` at `fire` kill `threat`? Returns the tick it
/// lands. This is the solver's view of the same collision rule the loop above
/// implements, and `tests::solver_and_sim_agree` holds them together.
pub fn shot_lands(web: &Web, threat: &Threat, entry: Entry, lane: usize, fire: i32) -> Option<i32> {
    let tau = meet_tick(threat, entry, fire);
    if tau > threat.breach_tick(entry) {
        return None;
    }
    if threat.lane_at(web, entry, tau) != lane {
        return None;
    }
    Some(tau)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::level::{Kind, Threat};
    use crate::web::Shape;

    fn ring() -> Web {
        Web::new(12, Shape::Circle)
    }

    #[test]
    fn a_wave_left_alone_breaches() {
        let web = ring();
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 4, 600, 0, 5)]);
        let st = run(&web, &wave, 0, |_, _, _| Action::Hold);
        assert!(matches!(st.outcome, Outcome::Breached { threat: 0, .. }));
    }

    #[test]
    fn standing_in_the_lane_and_firing_clears_it() {
        let web = ring();
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 0, 600, 0, 5)]);
        let st = run(&web, &wave, 0, |s, _, _| {
            if s.can_fire() {
                Action::Fire
            } else {
                Action::Hold
            }
        });
        assert!(
            matches!(st.outcome, Outcome::Cleared { .. }),
            "{:?}",
            st.outcome
        );
        assert_eq!(st.kills.len(), 1);
    }

    #[test]
    fn firing_into_the_wrong_lane_does_nothing() {
        let web = ring();
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 6, 600, 0, 5)]);
        let st = run(&web, &wave, 0, |s, _, _| {
            if s.can_fire() {
                Action::Fire
            } else {
                Action::Hold
            }
        });
        assert!(matches!(st.outcome, Outcome::Breached { .. }));
        assert!(st.kills.is_empty());
    }

    #[test]
    fn continuous_movement_costs_exactly_the_travel_table() {
        // If this drifts, every deadline the solver computes is optimistic and
        // the certificates are worthless.
        for shape in [Shape::Star { depth: 40 }, Shape::Ramp { growth: 20 }] {
            let web = Web::new(12, shape);
            let wave = Wave::new(vec![Threat::root(Kind::Spiker, 0, 1000, 0, 1)]);
            let mut st = SimState::new(&web, &wave, 0);
            let target = 5usize;
            while st.lane != target || !st.settled() {
                st.step(&web, &wave, Action::Move(Dir::Cw));
            }
            assert_eq!(
                st.tick,
                web.travel(0, target),
                "{} walked 0->{target} in {} ticks, table says {}",
                shape.label(),
                st.tick,
                web.travel(0, target)
            );
        }
    }

    #[test]
    fn a_shot_hits_the_threat_nearest_the_rim() {
        let web = ring();
        let wave = Wave::new(vec![
            Threat::root(Kind::Spiker, 0, 900, 0, 3),
            Threat::root(Kind::Spiker, 0, 300, 0, 3), // shallower
        ]);
        let mut st = SimState::new(&web, &wave, 0);
        st.step(&web, &wave, Action::Fire);
        while st.kills.is_empty() && !st.done() {
            st.step(&web, &wave, Action::Hold);
        }
        assert_eq!(st.kills[0].threat, 1);
    }

    #[test]
    fn a_shot_that_has_gone_past_cannot_be_caught_up_with() {
        // The bug the balance sweep found, pinned. A flipper that walks into a
        // lane after a shot has already crossed its depth must not be hit by
        // it: the shot is behind it now.
        let web = ring();
        let wave = Wave::new(vec![
            // Enters lane 6, walks clockwise, reaching lane 0 at tick 96.
            Threat::root(Kind::Flipper, 6, 609, 12, 3).with_flip(24, Dir::Cw),
        ]);
        let e = wave.threats[0].entry.unwrap();
        // Fired from lane 0 at tick 74, the shot crosses this threat's depth
        // at tick 82, when it is still two lanes away.
        assert_eq!(crate::level::meet_tick(&wave.threats[0], e, 74), 82);
        assert_eq!(wave.threats[0].lane_at(&web, e, 82), 8);
        assert_eq!(shot_lands(&web, &wave.threats[0], e, 0, 74), None);

        let mut st = SimState::new(&web, &wave, 0);
        while st.tick < 74 {
            st.step(&web, &wave, Action::Hold);
        }
        st.step(&web, &wave, Action::Fire);
        while st.tick < 130 && !st.done() {
            st.step(&web, &wave, Action::Hold);
        }
        assert!(
            st.kills.is_empty(),
            "the shot caught up with something it had already passed: {:?}",
            st.kills
        );
    }

    #[test]
    fn a_flipper_can_dodge_a_shot_already_in_flight() {
        let web = ring();
        // Deep, fast-flipping: fire from lane 0 and it has left by the time the
        // shot arrives.
        let wave = Wave::new(vec![
            Threat::root(Kind::Flipper, 0, 1000, 0, 2).with_flip(3, Dir::Cw)
        ]);
        let e = wave.threats[0].entry.unwrap();
        assert_eq!(shot_lands(&web, &wave.threats[0], e, 0, 0), None);
        // Point blank, it cannot.
        let late = wave.threats[0].breach_tick(e) - 1;
        let lane = wave.threats[0].lane_at(&web, e, late);
        assert!(shot_lands(&web, &wave.threats[0], e, lane, late).is_some());
    }

    #[test]
    fn killing_a_tanker_hatches_two_flippers_where_it_died() {
        let web = ring();
        let wave = Wave::new(vec![
            Threat::root(Kind::Tanker, 3, 900, 0, 3),
            Threat::child(0, Dir::Cw, 5, 20, Dir::Cw),
            Threat::child(0, Dir::Ccw, 5, 20, Dir::Ccw),
        ]);
        let mut st = SimState::new(&web, &wave, 3);
        st.step(&web, &wave, Action::Fire);
        while st.kills.is_empty() {
            st.step(&web, &wave, Action::Hold);
        }
        assert_eq!(st.kills[0].threat, 0);
        let e1 = st.entry[1].expect("child 1 hatched");
        let e2 = st.entry[2].expect("child 2 hatched");
        assert_eq!(e1.lane, 4);
        assert_eq!(e2.lane, 2);
        assert_eq!(e1.tick, st.kills[0].tick);
        assert_eq!(e1.depth, st.kills[0].depth);
    }

    #[test]
    fn when_to_kill_a_tanker_is_a_trade_and_not_a_rule() {
        // The whole reason tankers are in the game — and the reason the solver
        // cannot collapse "when did the tanker die" to a single best value.
        //
        // Kill it deep: a long window to clear the children, but that window
        // opens *now* and competes with everything else on the board.
        // Kill it shallow: the family's deadline slides later, but the window
        // shrinks to almost nothing.
        //
        // Neither is better in the abstract, so neither can be discarded.
        let web = ring();
        let child_climb = 6;
        let wave = Wave::new(vec![
            Threat::root(Kind::Tanker, 0, 900, 0, 3),
            Threat::child(0, Dir::Cw, child_climb, 20, Dir::Cw),
            Threat::child(0, Dir::Ccw, child_climb, 20, Dir::Ccw),
        ]);
        let e = wave.threats[0].entry.unwrap();
        let family = |fire: i32| {
            let kill = shot_lands(&web, &wave.threats[0], e, 0, fire).unwrap();
            let depth = wave.threats[0].depth_at(e, kill);
            let deadline = kill + crate::level::div_ceil(depth, child_climb);
            (deadline, deadline - kill)
        };
        let (early_deadline, early_window) = family(0);
        let (late_deadline, late_window) = family(200);
        assert!(
            late_deadline > early_deadline,
            "a late kill should push the family's deadline out ({early_deadline} -> {late_deadline})"
        );
        assert!(
            early_window > late_window,
            "an early kill should buy a wider window ({late_window} -> {early_window})"
        );
    }

    #[test]
    fn the_direction_of_the_tanker_trade_flips_with_child_speed() {
        // …and because it flips, there is no ordering to exploit even within
        // one game. Slow children invert it: then killing early is simply
        // better on both counts, and the tanker is a much duller object.
        let web = ring();
        for (parent_climb, child_climb, late_is_later) in [(3, 6, true), (6, 3, false)] {
            let wave = Wave::new(vec![
                Threat::root(Kind::Tanker, 0, 900, 0, parent_climb),
                Threat::child(0, Dir::Cw, child_climb, 20, Dir::Cw),
            ]);
            let e = wave.threats[0].entry.unwrap();
            let deadline = |fire: i32| {
                let kill = shot_lands(&web, &wave.threats[0], e, 0, fire).unwrap();
                let depth = wave.threats[0].depth_at(e, kill);
                kill + crate::level::div_ceil(depth, child_climb)
            };
            assert_eq!(
                deadline(120) > deadline(0),
                late_is_later,
                "parent {parent_climb} / child {child_climb}"
            );
        }
    }

    #[test]
    fn replay_is_deterministic() {
        let web = Web::new(13, Shape::Lobed { lobes: 3, amp: 30 });
        let wave = Wave::new(vec![
            Threat::root(Kind::Flipper, 2, 800, 0, 3).with_flip(15, Dir::Cw),
            Threat::root(Kind::Spiker, 9, 700, 10, 4),
        ]);
        let actions: Vec<Action> = (0..400)
            .map(|i| match i % 5 {
                0 => Action::Fire,
                1 | 2 => Action::Move(Dir::Ccw),
                _ => Action::Hold,
            })
            .collect();
        let a = replay(&web, &wave, 0, &actions);
        let b = replay(&web, &wave, 0, &actions);
        assert_eq!(format!("{:?}", a.outcome), format!("{:?}", b.outcome));
        assert_eq!(a.kills, b.kills);
        assert_eq!(a.tick, b.tick);
    }
}
