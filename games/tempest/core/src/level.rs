//! Threats, waves, and the arithmetic that decides whether a shot connects.
//!
//! Every quantity here is an integer and every rule is a closed form. That is
//! deliberate: the simulator in [`crate::sim`] steps tick by tick, and the
//! solver in [`crate::solver`] jumps straight to answers, and the two have to
//! agree *exactly* or a level's certificate is a lie about a different game.
//! Keeping the collision rule in one place, expressed once, is what makes that
//! agreement checkable — see `sim::tests::solver_and_sim_agree`.

use crate::web::{Dir, Web};

/// Depth units from the far end of a lane to the rim. The rim is depth 0.
pub const DEPTH_MAX: i32 = 1000;

/// Depth units a shot covers per tick. Fast, but not instant — leading a
/// flipper across a lane boundary is a real skill and a real solver
/// constraint.
pub const SHOT_SPEED: i32 = 55;

/// Ticks between shots.
pub const COOLDOWN: i32 = 7;

/// Hard ceiling on threats per wave, children included. The exact solver is
/// `O(2^n · lanes)` in states, so this is the number that keeps a full balance
/// sweep to seconds rather than hours. The generator targets well below it.
pub const MAX_THREATS: usize = 14;

/// Tankers per wave. Each one adds a dimension to the solver's Pareto
/// comparison — the tick it died at is part of the state, because its children
/// inherit it — so this stays small on purpose.
pub const MAX_TANKERS: usize = 2;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    /// Climbs and walks sideways. The one you have to lead.
    Flipper,
    /// Climbs straight, and splits into two flippers when killed. Killing it
    /// early is *better* — the children inherit the depth it died at, so a
    /// late kill drops two fresh threats in your lap near the rim.
    Tanker,
    /// Climbs slowly, never turns. A pure deadline with a lane written on it.
    Spiker,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Kind::Flipper => "flipper",
            Kind::Tanker => "tanker",
            Kind::Spiker => "spiker",
        }
    }
}

/// Where and when a threat enters play.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Entry {
    pub lane: usize,
    pub depth: i32,
    pub tick: i32,
}

/// One threat. Tanker children are declared up front with `parent: Some(_)`
/// and no entry of their own: theirs is computed from the tick and depth at
/// which the parent died, which is why the solver has to remember *when* it
/// killed a tanker and not merely *that* it did.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Threat {
    pub kind: Kind,
    pub climb: i32,
    pub flip_period: i32,
    pub flip_dir: Dir,
    /// `None` for a threat that enters on its own schedule.
    pub entry: Option<Entry>,
    /// The tanker this hatches from, and which side of it.
    pub parent: Option<usize>,
    pub side: Dir,
}

impl Threat {
    pub fn root(kind: Kind, lane: usize, depth: i32, tick: i32, climb: i32) -> Threat {
        Threat {
            kind,
            climb,
            flip_period: 0,
            flip_dir: Dir::Still,
            entry: Some(Entry { lane, depth, tick }),
            parent: None,
            side: Dir::Still,
        }
    }

    pub fn with_flip(mut self, period: i32, dir: Dir) -> Threat {
        self.flip_period = period;
        self.flip_dir = dir;
        self
    }

    pub fn child(parent: usize, side: Dir, climb: i32, flip_period: i32, flip_dir: Dir) -> Threat {
        Threat {
            kind: Kind::Flipper,
            climb,
            flip_period,
            flip_dir,
            entry: None,
            parent: Some(parent),
            side,
        }
    }

    pub fn is_child(&self) -> bool {
        self.parent.is_some()
    }

    /// Depth at `tick`, given the entry this instance actually got.
    pub fn depth_at(&self, entry: Entry, tick: i32) -> i32 {
        if tick <= entry.tick {
            return entry.depth;
        }
        (entry.depth - self.climb * (tick - entry.tick)).max(0)
    }

    /// The tick this threat reaches the rim. Reaching the rim is a breach: the
    /// wave is lost, whatever lane the player is standing in. There is no
    /// "it got past you but you are fine" — the rim is the thing you are
    /// defending and it is defended as a whole.
    pub fn breach_tick(&self, entry: Entry) -> i32 {
        entry.tick + div_ceil(entry.depth, self.climb)
    }

    /// Which lane this threat occupies at `tick`.
    ///
    /// Flips happen on a fixed cadence from entry. On an open web the walk
    /// reverses at the wall rather than stopping, so a flipper pinned at the
    /// end of a strip comes back at you.
    pub fn lane_at(&self, web: &Web, entry: Entry, tick: i32) -> usize {
        if self.flip_period <= 0 || self.flip_dir == Dir::Still || tick <= entry.tick {
            return entry.lane;
        }
        let flips = ((tick - entry.tick) / self.flip_period) as i64;
        let n = web.lanes as i64;
        let d = match self.flip_dir {
            Dir::Cw => 1,
            Dir::Ccw => -1,
            Dir::Still => 0,
        };
        let x = entry.lane as i64 + d * flips;
        if web.closed {
            return x.rem_euclid(n) as usize;
        }
        // On a strip the walk reflects off both walls. Folding the reflection
        // arithmetically rather than stepping it keeps this O(1) — which
        // matters because the solver calls it tens of millions of times, and
        // the loop it replaces was the single hottest line in the search.
        let period = 2 * (n - 1);
        let m = x.rem_euclid(period);
        (if m < n { m } else { period - m }) as usize
    }
}

/// The tick at which a shot fired into a lane at `fire` first reaches a threat
/// that entered at `entry` — ignoring, for the moment, whether the threat is
/// still in that lane when it gets there.
///
/// Closed form of the tick-stepped rule "shot depth has caught threat depth":
///
/// ```text
/// (τ − fire)·SHOT_SPEED  ≥  entry.depth − climb·(τ − entry.tick)
/// τ·(SHOT_SPEED + climb) ≥  entry.depth + fire·SHOT_SPEED + climb·entry.tick
/// ```
///
/// The final `.max(entry.tick)` is not cosmetic: a shot fired into a lane
/// before a tanker child hatches there sits past it and connects on the hatch
/// tick, which is exactly what the tick-stepped loop does.
pub fn meet_tick(threat: &Threat, entry: Entry, fire: i32) -> i32 {
    let num = entry.depth as i64
        + fire as i64 * SHOT_SPEED as i64
        + threat.climb as i64 * entry.tick as i64;
    let den = SHOT_SPEED as i64 + threat.climb as i64;
    let tau = div_ceil_i64(num, den) as i32;
    tau.max(fire).max(entry.tick)
}

pub fn div_ceil(a: i32, b: i32) -> i32 {
    debug_assert!(b > 0);
    (a + b - 1) / b
}

fn div_ceil_i64(a: i64, b: i64) -> i64 {
    debug_assert!(b > 0);
    if a >= 0 {
        (a + b - 1) / b
    } else {
        a / b
    }
}

/// One wave: everything that has to die before the rim is quiet again.
#[derive(Clone, Debug)]
pub struct Wave {
    pub threats: Vec<Threat>,
}

impl Wave {
    pub fn new(threats: Vec<Threat>) -> Wave {
        Wave { threats }
    }

    pub fn len(&self) -> usize {
        self.threats.len()
    }

    pub fn is_empty(&self) -> bool {
        self.threats.is_empty()
    }

    /// Threats that enter on their own, i.e. not tanker children.
    pub fn roots(&self) -> impl Iterator<Item = (usize, &Threat)> {
        self.threats
            .iter()
            .enumerate()
            .filter(|(_, t)| !t.is_child())
    }

    pub fn tankers(&self) -> Vec<usize> {
        self.threats
            .iter()
            .enumerate()
            .filter(|(_, t)| t.kind == Kind::Tanker)
            .map(|(i, _)| i)
            .collect()
    }

    /// Children of `parent`, in declaration order.
    pub fn children_of(&self, parent: usize) -> Vec<usize> {
        self.threats
            .iter()
            .enumerate()
            .filter(|(_, t)| t.parent == Some(parent))
            .map(|(i, _)| i)
            .collect()
    }

    /// The latest tick anything in this wave could still be alive, used to
    /// bound every forward scan in the solver and the sim.
    pub fn horizon(&self) -> i32 {
        let mut h = 0;
        for (_, t) in self.roots() {
            let e = t.entry.expect("root without entry");
            // A tanker killed at its deepest hands its children the whole tube
            // to climb, so allow for one full descent after the parent's.
            let own = t.breach_tick(e);
            h = h.max(if t.kind == Kind::Tanker {
                own + div_ceil(DEPTH_MAX, 2.max(t.climb - 1))
            } else {
                own
            });
        }
        h + 8
    }

    pub fn assert_sane(&self, web: &Web) {
        assert!(
            self.threats.len() <= MAX_THREATS,
            "wave of {} exceeds MAX_THREATS",
            self.threats.len()
        );
        for (i, t) in self.threats.iter().enumerate() {
            assert!(t.climb > 0, "threat {i} does not move");
            match t.parent {
                None => {
                    let e = t.entry.expect("root without entry");
                    assert!(e.lane < web.lanes, "threat {i} in lane {}", e.lane);
                    assert!(
                        e.depth > 0 && e.depth <= DEPTH_MAX,
                        "threat {i} depth {}",
                        e.depth
                    );
                    assert!(e.tick >= 0, "threat {i} enters at {}", e.tick);
                }
                Some(p) => {
                    assert!(p < i, "child {i} declared before its parent {p}");
                    assert_eq!(
                        self.threats[p].kind,
                        Kind::Tanker,
                        "child {i} hangs off a non-tanker"
                    );
                    assert!(t.entry.is_none(), "child {i} must not carry its own entry");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::web::Shape;

    fn ring() -> Web {
        Web::new(12, Shape::Circle)
    }

    #[test]
    fn depth_and_breach_agree() {
        let t = Threat::root(Kind::Spiker, 0, 900, 0, 3);
        let e = t.entry.unwrap();
        assert_eq!(t.depth_at(e, 0), 900);
        assert_eq!(t.depth_at(e, 100), 600);
        let b = t.breach_tick(e);
        assert_eq!(b, 300);
        assert_eq!(t.depth_at(e, b), 0);
        assert!(t.depth_at(e, b - 1) > 0);
    }

    #[test]
    fn meet_tick_is_the_tick_stepped_answer() {
        // The `enters at 82` rows are the ones that matter: a sign slip on the
        // `climb · entry.tick` term is invisible for anything that enters at
        // tick 0, and every tanker child enters later than that.
        for (depth, enter, climb) in [
            (800, 0, 4),
            (654, 82, 6),
            (300, 210, 9),
            (1000, 5, 2),
            (450, 140, 3),
        ] {
            let t = Threat::root(Kind::Flipper, 3, depth, enter, climb);
            let e = t.entry.unwrap();
            for fire in [0, 5, 40, 85, 120, 205, 300] {
                let tau = meet_tick(&t, e, fire);
                let mut brute = fire.max(e.tick);
                while (brute - fire) * SHOT_SPEED < t.depth_at(e, brute) {
                    brute += 1;
                }
                assert_eq!(tau, brute, "depth {depth} enter {enter} fire {fire}");
            }
        }
    }

    #[test]
    fn flippers_walk_and_wrap() {
        let web = ring();
        let t = Threat::root(Kind::Flipper, 0, 900, 0, 3).with_flip(10, Dir::Ccw);
        let e = t.entry.unwrap();
        assert_eq!(t.lane_at(&web, e, 0), 0);
        assert_eq!(t.lane_at(&web, e, 9), 0);
        assert_eq!(t.lane_at(&web, e, 10), 11);
        assert_eq!(t.lane_at(&web, e, 30), 9);
    }

    #[test]
    fn flippers_bounce_off_the_wall_of_an_open_web() {
        let web = Web::new(10, Shape::Ramp { growth: 12 });
        let t = Threat::root(Kind::Flipper, 8, 900, 0, 3).with_flip(5, Dir::Cw);
        let e = t.entry.unwrap();
        assert_eq!(t.lane_at(&web, e, 5), 9);
        // At the wall it turns round rather than sticking.
        assert_eq!(t.lane_at(&web, e, 10), 8);
        assert_eq!(t.lane_at(&web, e, 15), 7);
    }

    #[test]
    fn a_wave_knows_its_own_shape() {
        let web = ring();
        let wave = Wave::new(vec![
            Threat::root(Kind::Tanker, 2, 900, 0, 3),
            Threat::child(0, Dir::Cw, 5, 12, Dir::Cw),
            Threat::child(0, Dir::Ccw, 5, 12, Dir::Ccw),
            Threat::root(Kind::Flipper, 7, 700, 20, 4).with_flip(14, Dir::Cw),
        ]);
        wave.assert_sane(&web);
        assert_eq!(wave.tankers(), vec![0]);
        assert_eq!(wave.children_of(0), vec![1, 2]);
        assert_eq!(wave.roots().count(), 2);
        assert!(wave.horizon() > 300);
    }
}
