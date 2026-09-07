//! The web: the ring (or strip) of lanes the player defends, and the geometry
//! that makes one web harder than another.
//!
//! # The one idea
//!
//! In the arcade original the webs were hand-drawn set dressing. Every lane was
//! about as wide as every other lane, so *where* you stood mattered but the
//! shape you stood on did not — a circle and a squashed circle played the same.
//!
//! Here the shape is the difficulty. The player travels the rim at a constant
//! speed, so a long rim edge costs more ticks to cross than a short one. A star
//! web has cheap lanes alternating with expensive ones. A lobed web has a fast
//! side and a slow side, and defending the slow side means committing early.
//! An open web has no wrap at all, so a mistake at one end cannot be undone by
//! going the other way round.
//!
//! That means the drawing and the balance parameter are the same object: the
//! polygon you see on screen *is* the travel-cost table the solver reasons
//! about. Nothing is fudged between them.

use crate::fixed::{cos_turns, dist, isqrt, sin_turns, ONE, TURN};
use crate::rng::Rng;

/// Rim vertices live on a per-mille grid centred on the origin: the web is
/// drawn inside a box of roughly ±1000, and the renderer scales from there.
pub const RIM_UNIT: i32 = 1000;

/// Rim units the player covers per tick. Sets the whole time scale of the
/// game against the depth scale in [`crate::level`].
pub const PLAYER_SPEED: i32 = 34;

/// A lane change can never be free (you cannot teleport across a degenerate
/// sliver) and can never be so slow that a web becomes a corridor.
pub const MIN_STEP: i32 = 2;
pub const MAX_STEP: i32 = 22;

pub const MIN_LANES: usize = 8;
pub const MAX_LANES: usize = 16;

/// Per-mille of the mean lane cost, above which a web's lanes really do differ
/// enough for the player to feel it. One tick of difference on a mean of
/// fourteen is not a shape.
pub const UNEVEN_THRESHOLD: i32 = 90;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Pt {
    pub x: i32,
    pub y: i32,
}

/// See [`Web::character`].
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Character {
    /// Closed and even. The shape is scenery.
    Flat,
    /// Closed, but the lanes cost different amounts.
    Uneven,
    /// Even lanes, but no way round the back.
    Open,
    /// Both.
    Both,
}

impl Character {
    pub fn name(self) -> &'static str {
        match self {
            Character::Flat => "flat",
            Character::Uneven => "uneven",
            Character::Open => "open",
            Character::Both => "uneven+open",
        }
    }

    /// Does the web constrain the player's route at all?
    pub fn constrains(self) -> bool {
        self != Character::Flat
    }
}

/// Which way round the rim. On an open web only one of these is ever legal
/// between two lanes; on a closed web both are, and choosing between them is
/// the decision the whole game is built to measure.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Dir {
    /// Toward increasing lane index.
    Cw,
    /// Toward decreasing lane index.
    Ccw,
    /// Same lane — no move, no direction.
    Still,
}

impl Dir {
    pub fn name(self) -> &'static str {
        match self {
            Dir::Cw => "cw",
            Dir::Ccw => "ccw",
            Dir::Still => "still",
        }
    }
}

/// The named families the generator draws from. The parameters are what make
/// two `Star` webs different levels rather than the same level twice.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Shape {
    /// Regular polygon. Every lane costs the same — the control web, and the
    /// one on which direction never matters for its own sake.
    Circle,
    /// Squashed circle: two cheap sides, two expensive ones.
    Ellipse { squash: i32 },
    /// Alternating radius. Adjacent lanes differ sharply in cost.
    Star { depth: i32 },
    /// Smooth radial modulation — `lobes` slow arcs around the ring.
    Lobed { lobes: i32, amp: i32 },
    /// Open: two straight legs meeting at a point. Classic Tempest's V.
    Wedge { spread: i32 },
    /// Open: a straight strip whose segments grow geometrically. One end is
    /// densely defensible, the other is a long walk.
    Ramp { growth: i32 },
    /// Open: an arc of a circle. Uniform cost, but no wrap.
    Arc { sweep: i32 },
    /// Open: a zigzag strip. Cheap and expensive lanes alternate, and you can
    /// be cornered at either end.
    Comb { tooth: i32 },
}

impl Shape {
    pub fn closed(self) -> bool {
        matches!(
            self,
            Shape::Circle | Shape::Ellipse { .. } | Shape::Star { .. } | Shape::Lobed { .. }
        )
    }

    pub fn name(self) -> &'static str {
        match self {
            Shape::Circle => "circle",
            Shape::Ellipse { .. } => "ellipse",
            Shape::Star { .. } => "star",
            Shape::Lobed { .. } => "lobed",
            Shape::Wedge { .. } => "wedge",
            Shape::Ramp { .. } => "ramp",
            Shape::Arc { .. } => "arc",
            Shape::Comb { .. } => "comb",
        }
    }

    /// A short human label including the parameters, for reports and for the
    /// level card in the UI.
    pub fn label(self) -> String {
        match self {
            Shape::Circle => "circle".into(),
            Shape::Ellipse { squash } => format!("ellipse/{squash}"),
            Shape::Star { depth } => format!("star/{depth}"),
            Shape::Lobed { lobes, amp } => format!("lobed/{lobes}x{amp}"),
            Shape::Wedge { spread } => format!("wedge/{spread}"),
            Shape::Ramp { growth } => format!("ramp/{growth}"),
            Shape::Arc { sweep } => format!("arc/{sweep}"),
            Shape::Comb { tooth } => format!("comb/{tooth}"),
        }
    }

    /// Draw a shape. `closed_wanted` picks ring or strip; `allow_flat` admits
    /// the circle, which is the one family that can never constrain a route.
    ///
    /// Excluding the circle up front matters more than it looks. When `draw`
    /// simply rerolled flat webs, the circle's rejected quarter of the closed
    /// distribution landed disproportionately on the ellipse — which almost
    /// always passes — and a balance sweep came back with 47% of all webs
    /// being ellipses. Rejection sampling reshapes what it samples.
    pub fn roll(rng: &mut Rng, closed_wanted: bool, allow_flat: bool) -> Shape {
        if closed_wanted && !allow_flat {
            return match rng.below(3) {
                0 => Shape::Ellipse {
                    squash: rng.range(30, 62),
                },
                1 => Shape::Star {
                    depth: rng.range(25, 55),
                },
                _ => Shape::Lobed {
                    lobes: rng.range(2, 5),
                    amp: rng.range(26, 48),
                },
            };
        }
        // The parameter ranges are not decoration. Several of them were cut
        // back after `character_is_never_a_lie` caught shapes that drew
        // convincingly and costed exactly like a circle — a squash of 80, a
        // lobe amplitude of 18, a comb tooth of 15. What is left is the range
        // over which each family actually is what it claims to be.
        if closed_wanted {
            match rng.below(4) {
                0 => Shape::Circle,
                1 => Shape::Ellipse {
                    squash: rng.range(30, 62),
                },
                2 => Shape::Star {
                    depth: rng.range(25, 55),
                },
                _ => Shape::Lobed {
                    lobes: rng.range(2, 5),
                    amp: rng.range(26, 48),
                },
            }
        } else {
            match rng.below(4) {
                0 => Shape::Wedge {
                    spread: rng.range(30, 85),
                },
                1 => Shape::Ramp {
                    growth: rng.range(10, 28),
                },
                2 => Shape::Arc {
                    sweep: rng.range(45, 85),
                },
                _ => Shape::Comb {
                    tooth: rng.range(34, 60),
                },
            }
        }
    }
}

/// Draw a web that really has the character asked for.
///
/// A shape family is a *proposal*, not a guarantee. Travel costs are whole
/// ticks, so a lobed web whose lobes happen to land near the lane boundaries
/// can round flat, and no amount of tightening the parameter ranges removes
/// that — it is aliasing, not a bad range. So this asks, checks, and asks
/// again, exactly like the generate-check-repair loops in
/// `packages/pressure-lab`. The star is the fallback because alternating radii
/// cannot round flat at any lane count.
///
/// Returns the web and how many draws it took, so a caller that cares can
/// notice the loop working hard rather than have it hidden.
pub fn draw(rng: &mut Rng, lanes: usize, closed: bool, want_constrained: bool) -> (Web, u32) {
    for attempt in 1..=24 {
        let web = Web::new(lanes, Shape::roll(rng, closed, !want_constrained));
        if !want_constrained || web.character().constrains() {
            return (web, attempt);
        }
    }
    let fallback = if closed {
        Shape::Star {
            depth: rng.range(35, 55),
        }
    } else {
        Shape::Ramp {
            growth: rng.range(16, 28),
        }
    };
    (Web::new(lanes, fallback), 25)
}

/// A generated web, with everything the sim, the solver and the renderer need.
///
/// `verts` are the rim corners. A lane is the *segment between* two corners —
/// so a closed web with L lanes has L corners and an open web with L lanes has
/// L + 1. The player stands at a segment's midpoint.
#[derive(Clone, Debug)]
pub struct Web {
    pub lanes: usize,
    pub closed: bool,
    pub shape: Shape,
    pub verts: Vec<Pt>,
    /// Midpoint of each lane's rim segment — where the player actually sits.
    pub seats: Vec<Pt>,
    /// `step[i]` = ticks to move from lane `i` to lane `i + 1` (wrapping on a
    /// closed web). On an open web `step[lanes - 1]` is unreachable and holds
    /// [`MAX_STEP`] as a tripwire rather than a plausible value.
    pub step: Vec<i32>,
    /// `travel[a][b]` = ticks for the cheapest legal path a -> b.
    travel: Vec<Vec<i32>>,
    /// The direction that cheapest path takes.
    dir: Vec<Vec<Dir>>,
}

impl Web {
    pub fn new(lanes: usize, shape: Shape) -> Web {
        assert!(
            (MIN_LANES..=MAX_LANES).contains(&lanes),
            "lane count {lanes} out of range"
        );
        let closed = shape.closed();
        let verts = shape_verts(lanes, shape);
        assert_eq!(verts.len(), if closed { lanes } else { lanes + 1 });

        let mut seats = Vec::with_capacity(lanes);
        let mut edge_len = Vec::with_capacity(lanes);
        for i in 0..lanes {
            let a = verts[i];
            let b = verts[(i + 1) % verts.len()];
            seats.push(Pt {
                x: (a.x + b.x) / 2,
                y: (a.y + b.y) / 2,
            });
            edge_len.push(dist(a.x, a.y, b.x, b.y));
        }

        // Travel cost between neighbouring lanes is the distance between their
        // seats — i.e. half of each of the two segments. Long lanes are
        // expensive to leave *and* expensive to enter, which is what gives a
        // star web its bite.
        let mut step = vec![MAX_STEP; lanes];
        let last = if closed { lanes } else { lanes - 1 };
        for i in 0..last {
            let j = (i + 1) % lanes;
            let d = dist(seats[i].x, seats[i].y, seats[j].x, seats[j].y);
            step[i] = (d / PLAYER_SPEED).clamp(MIN_STEP, MAX_STEP);
        }
        let _ = edge_len;

        let mut web = Web {
            lanes,
            closed,
            shape,
            verts,
            seats,
            step,
            travel: Vec::new(),
            dir: Vec::new(),
        };
        web.build_travel();
        web
    }

    fn build_travel(&mut self) {
        let n = self.lanes;
        let mut travel = vec![vec![i32::MAX; n]; n];
        let mut dir = vec![vec![Dir::Still; n]; n];
        for a in 0..n {
            travel[a][a] = 0;
            // Walk clockwise (index-increasing) from a as far as the web allows.
            let mut acc = 0;
            let mut cur = a;
            loop {
                if !self.closed && cur + 1 >= n {
                    break;
                }
                acc += self.step[cur];
                cur = (cur + 1) % n;
                if cur == a {
                    break;
                }
                if acc < travel[a][cur] {
                    travel[a][cur] = acc;
                    dir[a][cur] = Dir::Cw;
                }
            }
            // And counter-clockwise.
            let mut acc = 0;
            let mut cur = a;
            loop {
                if !self.closed && cur == 0 {
                    break;
                }
                let prev = (cur + n - 1) % n;
                acc += self.step[prev];
                cur = prev;
                if cur == a {
                    break;
                }
                if acc < travel[a][cur] {
                    travel[a][cur] = acc;
                    dir[a][cur] = Dir::Ccw;
                }
            }
        }
        self.travel = travel;
        self.dir = dir;
    }

    /// Replace the lane costs and rebuild the travel table.
    ///
    /// Used when a web arrives over the wire rather than from a shape: the
    /// browser sends the cost table it was given in the level pack, and the
    /// outline it draws comes from the same pack, so the two cannot drift even
    /// though wasm never sees the vertices.
    pub fn set_step(&mut self, step: Vec<i32>) {
        assert_eq!(step.len(), self.lanes, "step table is the wrong length");
        self.step = step;
        self.build_travel();
    }

    /// Ticks to get from lane `a` to lane `b` by the cheapest legal route.
    /// Every pair is reachable on both web kinds, so this never returns
    /// `i32::MAX` for a well-formed web — [`Web::assert_sane`] checks that.
    pub fn travel(&self, a: usize, b: usize) -> i32 {
        self.travel[a][b]
    }

    /// The direction the cheapest route takes. On a closed web this is the
    /// answer to the only question the game really asks.
    pub fn dir(&self, a: usize, b: usize) -> Dir {
        self.dir[a][b]
    }

    /// Ticks to get from `a` to `b` while committed to `d`. Returns `None` if
    /// that direction cannot reach `b` — which on an open web is the usual
    /// case, and is exactly the trap the open webs exist to set.
    pub fn travel_via(&self, a: usize, b: usize, d: Dir) -> Option<i32> {
        if a == b {
            return Some(0);
        }
        let n = self.lanes;
        let mut acc = 0;
        let mut cur = a;
        for _ in 0..n {
            match d {
                Dir::Cw => {
                    if !self.closed && cur + 1 >= n {
                        return None;
                    }
                    acc += self.step[cur];
                    cur = (cur + 1) % n;
                }
                Dir::Ccw => {
                    if !self.closed && cur == 0 {
                        return None;
                    }
                    let prev = (cur + n - 1) % n;
                    acc += self.step[prev];
                    cur = prev;
                }
                Dir::Still => return None,
            }
            if cur == b {
                return Some(acc);
            }
            if cur == a {
                return None;
            }
        }
        None
    }

    /// One step along the rim, or `None` at a wall.
    pub fn neighbour(&self, lane: usize, d: Dir) -> Option<usize> {
        let n = self.lanes;
        match d {
            Dir::Cw => {
                if self.closed {
                    Some((lane + 1) % n)
                } else if lane + 1 < n {
                    Some(lane + 1)
                } else {
                    None
                }
            }
            Dir::Ccw => {
                if self.closed {
                    Some((lane + n - 1) % n)
                } else if lane > 0 {
                    Some(lane - 1)
                } else {
                    None
                }
            }
            Dir::Still => Some(lane),
        }
    }

    /// Ticks to leave `lane` heading `d`, or `None` at a wall.
    pub fn step_cost(&self, lane: usize, d: Dir) -> Option<i32> {
        match d {
            Dir::Cw => self.neighbour(lane, d).map(|_| self.step[lane]),
            Dir::Ccw => self.neighbour(lane, d).map(|prev| self.step[prev]),
            Dir::Still => Some(0),
        }
    }

    /// The longest cheapest-route in the web: how bad a full commitment to the
    /// wrong side can get. This is the single number that best predicts how
    /// punishing a web is.
    pub fn diameter(&self) -> i32 {
        let mut worst = 0;
        for a in 0..self.lanes {
            for b in 0..self.lanes {
                worst = worst.max(self.travel(a, b));
            }
        }
        worst
    }

    /// How uneven the lanes are, in per-mille of the mean step cost. 0 on a
    /// circle. The generator uses it to tell a web with a shape from a web
    /// that merely has a name.
    pub fn unevenness(&self) -> i32 {
        let n = if self.closed {
            self.lanes
        } else {
            self.lanes - 1
        };
        let steps = &self.step[..n];
        let mean = steps.iter().map(|s| *s as i64).sum::<i64>() / n as i64;
        if mean == 0 {
            return 0;
        }
        let var = steps
            .iter()
            .map(|s| {
                let d = *s as i64 - mean;
                d * d
            })
            .sum::<i64>()
            / n as i64;
        (isqrt(var * 1_000_000) / mean) as i32
    }

    /// What this web actually brings to a level, as opposed to what it looks
    /// like it brings.
    ///
    /// A web is only interesting if the player's choice of route is
    /// constrained — either because the lanes cost different amounts to cross
    /// ([`Character::Uneven`]) or because there is no way round the back
    /// ([`Character::Open`]). A closed web with even lanes is a *flat* web:
    /// perfectly playable, and the right thing early on, but on a flat web the
    /// shape is scenery and the level has to get its difficulty elsewhere. The
    /// generator is required to know which it is holding.
    pub fn character(&self) -> Character {
        let uneven = self.unevenness() >= UNEVEN_THRESHOLD;
        match (self.closed, uneven) {
            (true, false) => Character::Flat,
            (true, true) => Character::Uneven,
            (false, false) => Character::Open,
            (false, true) => Character::Both,
        }
    }

    pub fn assert_sane(&self) {
        assert!((MIN_LANES..=MAX_LANES).contains(&self.lanes));
        assert_eq!(
            self.verts.len(),
            if self.closed {
                self.lanes
            } else {
                self.lanes + 1
            }
        );
        assert_eq!(self.seats.len(), self.lanes);
        let last = if self.closed {
            self.lanes
        } else {
            self.lanes - 1
        };
        for i in 0..last {
            assert!(
                (MIN_STEP..=MAX_STEP).contains(&self.step[i]),
                "lane {i} step {} out of range",
                self.step[i]
            );
        }
        for a in 0..self.lanes {
            for b in 0..self.lanes {
                assert!(
                    self.travel(a, b) < i32::MAX,
                    "lane {b} unreachable from {a} on a {} web",
                    self.shape.name()
                );
                assert_eq!(self.travel(a, b), self.travel(b, a), "travel not symmetric");
            }
        }
    }
}

/// Percent each lane grows over the previous one along a wedge's legs.
const WEDGE_GROWTH: i64 = 32;

/// `k + 1` cumulative fractions in per-mille, spanning 0 to 1000, where each
/// gap is `growth` percent wider than the one before it.
fn geo_frac(k: usize, growth: i64) -> Vec<i64> {
    if k == 0 {
        return vec![0];
    }
    let mut widths = Vec::with_capacity(k);
    let mut w = 1000i64;
    for _ in 0..k {
        widths.push(w);
        w = w * (100 + growth) / 100;
    }
    let total: i64 = widths.iter().sum();
    let mut out = Vec::with_capacity(k + 1);
    out.push(0);
    let mut acc = 0i64;
    for w in widths {
        acc += w;
        out.push(acc * 1000 / total);
    }
    out
}

/// Rim corners for a shape, on the per-mille grid.
fn shape_verts(lanes: usize, shape: Shape) -> Vec<Pt> {
    let n = lanes as i64;
    let r = RIM_UNIT as i64;
    let polar = |ang: i64, rad: i64| Pt {
        x: (cos_turns(ang) * rad / ONE) as i32,
        y: (sin_turns(ang) * rad / ONE) as i32,
    };

    match shape {
        Shape::Circle => (0..n).map(|i| polar(i * TURN / n, r)).collect(),

        Shape::Ellipse { squash } => (0..n)
            .map(|i| {
                let a = i * TURN / n;
                Pt {
                    x: (cos_turns(a) * r / ONE) as i32,
                    y: (sin_turns(a) * r * squash as i64 / 100 / ONE) as i32,
                }
            })
            .collect(),

        Shape::Star { depth } => (0..n)
            .map(|i| {
                let rad = if i % 2 == 0 {
                    r
                } else {
                    r * (100 - depth as i64) / 100
                };
                polar(i * TURN / n, rad)
            })
            .collect(),

        Shape::Lobed { lobes, amp } => (0..n)
            .map(|i| {
                let a = i * TURN / n;
                // r · (1 + amp/100 · cos(lobes · θ))
                let m = ONE + cos_turns(a * lobes as i64) * amp as i64 / 100;
                polar(a, r * m / ONE)
            })
            .collect(),

        // ---- open webs: `lanes + 1` corners ----
        Shape::Wedge { spread } => {
            // Two legs from a common apex. Lanes bunch up at the apex and
            // stretch out toward the tips, so one end of the web is a knife
            // fight and the other is a long walk — and there is no wrap to
            // take you between them the short way.
            let m = lanes + 1;
            let half = m / 2;
            let dx = RIM_UNIT as i64 * spread as i64 / 100;
            let left = geo_frac(half, WEDGE_GROWTH);
            let right = geo_frac(m - 1 - half, WEDGE_GROWTH);
            (0..m)
                .map(|i| {
                    let (side, t) = if i <= half {
                        (-1i64, left[half - i])
                    } else {
                        (1i64, right[i - half])
                    };
                    Pt {
                        x: (side * dx * t / 1000) as i32,
                        y: (r - 2 * r * t / 1000) as i32,
                    }
                })
                .collect()
        }

        Shape::Ramp { growth } => {
            // A straight strip whose segment lengths grow by `growth` percent
            // each step. One end is densely defensible, the other is open
            // country.
            let m = lanes + 1;
            let xs = geo_frac(m - 1, growth as i64);
            xs.iter()
                .map(|t| Pt {
                    x: (2 * r * t / 1000 - r) as i32,
                    y: 0,
                })
                .collect()
        }

        Shape::Arc { sweep } => {
            let m = lanes as i64 + 1;
            let span = TURN * sweep as i64 / 100;
            (0..m)
                .map(|i| polar(TURN / 4 + span / 2 - i * span / (m - 1), r))
                .collect()
        }

        Shape::Comb { tooth } => {
            // A square wave. The first two attempts at this shape were a plain
            // zigzag and then a symmetric battlement, and *both* came out with
            // a perfectly uniform cost table: the player stands at edge
            // midpoints, and the midpoints of a symmetric zigzag are evenly
            // spaced on a straight line however jagged the outline looks. A
            // web that only looks uneven is exactly the reskin this design is
            // trying not to be, so the teeth alternate in height and the
            // symmetry is broken on purpose.
            let m = lanes + 1;
            let amp = RIM_UNIT as i64 * tooth as i64 / 100;
            let run = 90i64;
            let mut raw: Vec<(i64, i64)> = Vec::with_capacity(m);
            let (mut x, mut y) = (0i64, 0i64);
            for i in 0..m {
                raw.push((x, y));
                let h = if (i / 4) % 2 == 0 { amp } else { amp / 3 };
                match i % 4 {
                    0 => y = -h,
                    1 => x += run,
                    2 => y = 0,
                    _ => x += run,
                }
            }
            let span = raw.last().map(|p| p.0).unwrap_or(1).max(1);
            raw.into_iter()
                .map(|(px, py)| Pt {
                    x: (2 * r * px / span - r) as i32,
                    y: (py + amp / 2) as i32,
                })
                .collect()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn every_shape() -> Vec<Shape> {
        vec![
            Shape::Circle,
            Shape::Ellipse { squash: 45 },
            Shape::Star { depth: 40 },
            Shape::Lobed { lobes: 3, amp: 30 },
            Shape::Wedge { spread: 60 },
            Shape::Ramp { growth: 18 },
            Shape::Arc { sweep: 70 },
            Shape::Comb { tooth: 30 },
        ]
    }

    #[test]
    fn every_shape_builds_a_sane_web() {
        for shape in every_shape() {
            for lanes in MIN_LANES..=MAX_LANES {
                Web::new(lanes, shape).assert_sane();
            }
        }
    }

    #[test]
    fn closed_webs_wrap_and_open_webs_do_not() {
        let ring = Web::new(12, Shape::Circle);
        assert_eq!(ring.neighbour(11, Dir::Cw), Some(0));
        assert_eq!(ring.neighbour(0, Dir::Ccw), Some(11));
        // Going one step the short way beats eleven steps the long way.
        assert!(ring.travel(0, 11) < ring.travel(0, 5));
        assert_eq!(ring.dir(0, 11), Dir::Ccw);

        let strip = Web::new(12, Shape::Ramp { growth: 15 });
        assert_eq!(strip.neighbour(11, Dir::Cw), None);
        assert_eq!(strip.neighbour(0, Dir::Ccw), None);
        assert_eq!(strip.travel_via(0, 11, Dir::Ccw), None);
        assert!(strip.travel_via(0, 11, Dir::Cw).is_some());
    }

    #[test]
    fn draw_never_hands_back_a_circle_in_costume() {
        // The trap `packages/pressure-lab` exists to catch, in this game's
        // idiom: a mechanic that draws convincingly and does nothing. Whatever
        // the aliasing does to any individual roll, what comes *out* of `draw`
        // must be what was asked for.
        let mut rng = Rng::new(20260820);
        let mut worst_attempts = 0;
        for _ in 0..400 {
            for closed in [true, false] {
                for lanes in MIN_LANES..=MAX_LANES {
                    let (web, attempts) = draw(&mut rng, lanes, closed, true);
                    web.assert_sane();
                    assert_eq!(web.closed, closed);
                    assert!(
                        web.character().constrains(),
                        "{} at {lanes} lanes came back flat ({} per-mille)",
                        web.shape.label(),
                        web.unevenness()
                    );
                    worst_attempts = worst_attempts.max(attempts);
                }
            }
        }
        // If the loop is regularly grinding, the parameter ranges are wrong
        // and the fallback is doing the generator's job for it.
        assert!(
            worst_attempts < 25,
            "the fallback fired — ranges are too loose"
        );
    }

    #[test]
    fn no_one_shape_family_dominates_the_output() {
        // A balance sweep once came back with 47% of every web being an
        // ellipse, because rejection sampling had quietly reshaped the
        // distribution. Webs that all look alike are a worse failure than webs
        // that are individually dull.
        let mut rng = Rng::new(31337);
        let mut counts: std::collections::BTreeMap<&str, usize> = Default::default();
        let n = 1200;
        for i in 0..n {
            let (web, _) = draw(&mut rng, 8 + i % 9, i % 2 == 0, true);
            *counts.entry(web.shape.name()).or_default() += 1;
        }
        for (name, c) in &counts {
            assert!(
                *c * 5 < n * 2,
                "{name} is {c} of {n} webs — the mix has collapsed: {counts:?}"
            );
        }
        assert!(
            counts.len() >= 6,
            "only {} families appear: {counts:?}",
            counts.len()
        );
    }

    #[test]
    fn a_flat_web_is_available_when_it_is_wanted() {
        let mut rng = Rng::new(7);
        let mut saw_flat = false;
        for _ in 0..200 {
            let (web, _) = draw(&mut rng, 12, true, false);
            saw_flat |= web.character() == Character::Flat;
        }
        assert!(saw_flat, "there must still be a way to ask for an easy web");
    }

    #[test]
    fn character_names_what_the_web_actually_does() {
        assert_eq!(Web::new(12, Shape::Circle).character(), Character::Flat);
        assert_eq!(
            Web::new(12, Shape::Star { depth: 45 }).character(),
            Character::Uneven
        );
        // The arc is the pure form of the other axis: even lanes, no wrap.
        assert_eq!(
            Web::new(12, Shape::Arc { sweep: 70 }).character(),
            Character::Open
        );
        assert_eq!(
            Web::new(12, Shape::Ramp { growth: 20 }).character(),
            Character::Both
        );
    }

    #[test]
    fn travel_via_agrees_with_the_cheapest_route() {
        for shape in every_shape() {
            let w = Web::new(11, shape);
            for a in 0..w.lanes {
                for b in 0..w.lanes {
                    let best = w.travel(a, b);
                    let cw = w.travel_via(a, b, Dir::Cw);
                    let ccw = w.travel_via(a, b, Dir::Ccw);
                    let seen = cw.into_iter().chain(ccw).min().unwrap_or(0);
                    assert_eq!(best, seen, "{} {a}->{b}", shape.label());
                }
            }
        }
    }

    #[test]
    fn open_webs_are_wider_than_closed_ones() {
        // No wrap means the diameter is the whole strip, which is the point:
        // an open web punishes a wrong commitment roughly twice as hard.
        let ring = Web::new(14, Shape::Circle);
        let strip = Web::new(14, Shape::Arc { sweep: 70 });
        assert!(strip.diameter() > ring.diameter());
    }
}
