//! The sand itself: a height field that topples until nothing stands steeper
//! than the angle of repose.
//!
//! **The relaxation rule is not new here.** It is the classic mass-conserving
//! talus rule, and this repo already has a good implementation of it in
//! `clock/lib/soil.js` (`Field.relaxStep`) behind `g.mino.mobi/soil/`. This is
//! that same rule, ported: the same 8-neighbour sweep, the same overshoot
//! `(h_i - h_j) - k*dist`, the same paired transfer of `c * overshoot` so that
//! every grain leaving one cell arrives in another. `the_rust_and_the_repo_js_relax_identically`
//! in `tests.rs` pins the two implementations against each other, so this
//! cannot quietly drift into being a different model.
//!
//! What is added is the part Henderson's construction needs and `soil.js` has
//! no notion of: **sources and sinks**. Sand arrives at a source and leaves at
//! a sink, and it is the meeting of the surfaces those two make that draws the
//! conic. Without them there is nothing to intersect.
//!
//! The important discipline in this file: it simulates. It pours grains and
//! lets them topple. It never evaluates the cone formula and calls the result
//! sand — that would be assuming the very thing the page claims to show.

/// The eight nearest neighbours, weighted by their true distance.
///
/// This is the classic stencil and it has a defect worth understanding before
/// using it: a toppling rule that only ever compares a cell with these eight
/// does not measure Euclidean distance at all. It measures the **chamfer**
/// distance built from steps of 1 and sqrt(2), whose unit ball is an octagon
/// with corners on the axes and the diagonals. A pile settled under it is a
/// perfect cone *in that metric*, which in this one is about 8% out of round —
/// widest at 0 and 45 degrees, narrowest at 22.5.
///
/// The weights cannot fix it. `sqrt(2)/1` is already the ratio that minimises
/// the spread, and scaling both weights changes the pile's size without
/// touching its shape. Only a bigger stencil helps.
pub const NB8: [(i32, i32, f64); 8] = [
    (1, 0, 1.0),
    (-1, 0, 1.0),
    (0, 1, 1.0),
    (0, -1, 1.0),
    (1, 1, core::f64::consts::SQRT_2),
    (1, -1, core::f64::consts::SQRT_2),
    (-1, 1, core::f64::consts::SQRT_2),
    (-1, -1, core::f64::consts::SQRT_2),
];

/// Scaling that centres the 16-neighbour stencil's error on zero.
///
/// With exact distances the chamfer metric always over-estimates, by between 0
/// and 2.75%, so the sand comes out uniformly a little steeper than the repose
/// angle it was given. Multiplying every weight by this puts the error in
/// +/-1.4% instead of 0 to +2.75%, which costs nothing and makes the angle
/// honest on average.
const W16: f64 = 0.986_43;

/// The same eight, plus the eight knight's moves at sqrt(5).
///
/// **This is a better discretisation of the same physics, not different
/// physics.** The model is `|grad z| <= k` — sand stands no steeper than
/// repose in *any* direction. Checking only eight directions lets the
/// in-between ones stand up to 8% too steep, and the pile inherits that as an
/// octagonal cross-section. Checking sixteen brings the worst case down to
/// 2.75%, and the octagon is gone to the eye.
///
/// A knight's move looks like an odd way for a grain to travel, and it is not
/// meant as one: the rule is a constraint on the surface, and this is simply a
/// finer set of directions in which to enforce it. Every transfer is still
/// paired, so mass is still conserved exactly.
///
/// The next rung, a 7x7 stencil reaching sqrt(10) and sqrt(13), would get
/// under 1.5% for another half again in cost. Not worth it here; the curve the
/// page measures is already far better resolved than that.
pub const NB16: [(i32, i32, f64); 16] = [
    (1, 0, W16),
    (-1, 0, W16),
    (0, 1, W16),
    (0, -1, W16),
    (1, 1, W16 * core::f64::consts::SQRT_2),
    (1, -1, W16 * core::f64::consts::SQRT_2),
    (-1, 1, W16 * core::f64::consts::SQRT_2),
    (-1, -1, W16 * core::f64::consts::SQRT_2),
    (1, 2, W16 * SQRT_5),
    (2, 1, W16 * SQRT_5),
    (-1, 2, W16 * SQRT_5),
    (-2, 1, W16 * SQRT_5),
    (1, -2, W16 * SQRT_5),
    (2, -1, W16 * SQRT_5),
    (-1, -2, W16 * SQRT_5),
    (-2, -1, W16 * SQRT_5),
];

const SQRT_5: f64 = 2.236_067_977_499_79;
const SQRT_10: f64 = 3.162_277_660_168_379_4;
const SQRT_13: f64 = 3.605_551_275_463_989;
const SQRT_26: f64 = 5.099_019_513_592_785;

/// The shared-excess iteration's transfer coefficient.
pub const SHARED_C: f64 = 0.8;

/// Centring scale for the 24-direction stencil, as `W16` is for sixteen.
const W24: f64 = 0.993_5;

/// Sixteen directions plus the eight `(3, 1)` moves at sqrt(10).
///
/// Worst case 1.3% out of round, against 2.75% at sixteen and 8.24% at eight.
///
/// Why these eight and not a full 7x7: what limits the error is the widest
/// angular gap between directions the stencil can express, and with the
/// knight's moves in place that gap is the 18.4 degrees between straight-on
/// and `(3, 1)`. Splitting it is the only thing that helps. Adding `(3, 2)` as
/// well — the other primitive direction a 7x7 offers — costs another eight
/// comparisons and improves nothing, because it subdivides a gap that was
/// already the smaller one.
pub const NB24: [(i32, i32, f64); 24] = [
    (1, 0, W24),
    (-1, 0, W24),
    (0, 1, W24),
    (0, -1, W24),
    (1, 1, W24 * core::f64::consts::SQRT_2),
    (1, -1, W24 * core::f64::consts::SQRT_2),
    (-1, 1, W24 * core::f64::consts::SQRT_2),
    (-1, -1, W24 * core::f64::consts::SQRT_2),
    (1, 2, W24 * SQRT_5),
    (2, 1, W24 * SQRT_5),
    (-1, 2, W24 * SQRT_5),
    (-2, 1, W24 * SQRT_5),
    (1, -2, W24 * SQRT_5),
    (2, -1, W24 * SQRT_5),
    (-1, -2, W24 * SQRT_5),
    (-2, -1, W24 * SQRT_5),
    (1, 3, W24 * SQRT_10),
    (3, 1, W24 * SQRT_10),
    (-1, 3, W24 * SQRT_10),
    (-3, 1, W24 * SQRT_10),
    (1, -3, W24 * SQRT_10),
    (3, -1, W24 * SQRT_10),
    (-1, -3, W24 * SQRT_10),
    (-3, -1, W24 * SQRT_10),
];

/// Centring scale for the 40-direction stencil, as `W24` is for twenty-four.
const W40: f64 = 0.997_56;

/// Twenty-four directions plus `(3, 2)` at sqrt(13) and `(5, 1)` at sqrt(26).
///
/// Worst case 0.49% out of round. This is the stencil that answers "how much
/// rounder can this get" rather than the one the page needs, and it is here
/// because it is the check on the whole account: if the octagonal cross-section
/// really is the widest angular gap between the stencil's directions and
/// nothing else, then closing that gap has to pay off by the amount the
/// formula says, and it does.
///
/// Which directions, and why not simply a 7x7 or 11x11 block: what is being
/// narrowed is the *widest* gap, so the directions have to be chosen to even
/// the gaps out, not to fill a box. With twenty-four in place the octant reads
/// 0, 18.4, 26.6, 45 degrees and the binding gap is the first one. `(5, 1)` at
/// 11.3 splits it and `(3, 2)` at 33.7 splits the last, leaving 11.3, 7.1,
/// 8.1, 7.1, 11.3 — and `sec(11.3/2) - 1 = 0.49%`. Adding `(4, 3)` at 36.9
/// would cost eight more comparisons and improve nothing, exactly as `(3, 2)`
/// would have at the previous rung.
pub const NB40: [(i32, i32, f64); 40] = [
    (1, 0, W40),
    (-1, 0, W40),
    (0, 1, W40),
    (0, -1, W40),
    (1, 1, W40 * core::f64::consts::SQRT_2),
    (1, -1, W40 * core::f64::consts::SQRT_2),
    (-1, 1, W40 * core::f64::consts::SQRT_2),
    (-1, -1, W40 * core::f64::consts::SQRT_2),
    (1, 2, W40 * SQRT_5),
    (2, 1, W40 * SQRT_5),
    (-1, 2, W40 * SQRT_5),
    (-2, 1, W40 * SQRT_5),
    (1, -2, W40 * SQRT_5),
    (2, -1, W40 * SQRT_5),
    (-1, -2, W40 * SQRT_5),
    (-2, -1, W40 * SQRT_5),
    (1, 3, W40 * SQRT_10),
    (3, 1, W40 * SQRT_10),
    (-1, 3, W40 * SQRT_10),
    (-3, 1, W40 * SQRT_10),
    (1, -3, W40 * SQRT_10),
    (3, -1, W40 * SQRT_10),
    (-1, -3, W40 * SQRT_10),
    (-3, -1, W40 * SQRT_10),
    (2, 3, W40 * SQRT_13),
    (3, 2, W40 * SQRT_13),
    (-2, 3, W40 * SQRT_13),
    (-3, 2, W40 * SQRT_13),
    (2, -3, W40 * SQRT_13),
    (3, -2, W40 * SQRT_13),
    (-2, -3, W40 * SQRT_13),
    (-3, -2, W40 * SQRT_13),
    (1, 5, W40 * SQRT_26),
    (5, 1, W40 * SQRT_26),
    (-1, 5, W40 * SQRT_26),
    (-5, 1, W40 * SQRT_26),
    (1, -5, W40 * SQRT_26),
    (5, -1, W40 * SQRT_26),
    (-1, -5, W40 * SQRT_26),
    (-5, -1, W40 * SQRT_26),
];

/// The widest stencil there is, so scratch buffers can be sized once.
/// `Stencil::offsets` is checked against it.
pub const MAX_STENCIL: usize = 40;

/// Which set of directions the toppling rule enforces the repose angle in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stencil {
    /// The eight nearest neighbours: what `clock/lib/soil.js` uses, kept so
    /// the port can be pinned against it. About 8% out of round.
    Near8,
    /// Sixteen directions, including the knight's moves. About 2.75%.
    Knight16,
    /// Twenty-four directions. Metric anisotropy 1.3%.
    Wide24,
    /// Forty directions. Metric anisotropy 0.49%, and what the page ships:
    /// it is the rung where what you *see* stops being the stencil. See
    /// `NB40`, and `tests::the_pour_rate_is_the_other_half` for what is left.
    Fine40,
}

impl Stencil {
    #[inline]
    pub fn offsets(self) -> &'static [(i32, i32, f64)] {
        match self {
            Stencil::Near8 => &NB8,
            Stencil::Knight16 => &NB16,
            Stencil::Wide24 => &NB24,
            Stencil::Fine40 => &NB40,
        }
    }

    /// Safe transfer coefficient for `relax_step` — the soil.js rule, where a
    /// cell sheds to every neighbour it is over, so the total grows with the
    /// stencil and this has to shrink to compensate.
    #[inline]
    pub fn strict_c(self) -> f64 {
        match self {
            Stencil::Near8 => 0.12,
            Stencil::Knight16 => 0.06,
            Stencil::Wide24 => 0.04,
            Stencil::Fine40 => 0.024,
        }
    }

    /// How sharp a fold has to be, as a multiple of `k`, before the seam
    /// tracer will believe it is a crease rather than one of the facet edges
    /// the stencil leaves on an untroubled cone.
    ///
    /// This is a property of the stencil and not a tuning knob: the facets get
    /// fainter as the stencil widens, so a wider stencil can use a lower floor
    /// and keeps more of the real curve. The numbers are the measured worst
    /// facet fold on a clean pile, with a margin — see
    /// `tests::the_fold_floor_clears_the_facets`, which fails if a rung's
    /// facets ever reach its floor.
    #[inline]
    pub fn fold_floor(self) -> f64 {
        match self {
            Stencil::Near8 => 0.30,
            Stencil::Knight16 => 0.25,
            Stencil::Wide24 => 0.25,
            Stencil::Fine40 => 0.09,
        }
    }

    /// Safe coefficient for `relax_step_shared`, which is what everything
    /// actually runs. Independent of the stencil, because the excess is
    /// divided rather than duplicated. 0.9 still converges; 1.2 diverges.
    #[inline]
    pub fn relax_c(self) -> f64 {
        SHARED_C
    }
}

/// Where sand comes from and where it goes.
///
/// A feature is either a point or a straight line, and either a source or a
/// sink. That is the whole vocabulary, and between them they turn out to
/// generate every conic section — see `conic.rs` for why the line ones are not
/// a luxury.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    /// Sand is poured in here. A pile grows until it can shed what arrives.
    Source,
    /// A hole. Sand that reaches it leaves the table, and the level is pinned.
    Sink,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Shape {
    /// A pour point, or a drill hole.
    Point { x: f64, y: f64 },
    /// An infinite straight line: a ridge poured along a rule, or a slot cut
    /// across the plate. Stored as a point on the line and a unit normal.
    Line { x: f64, y: f64, nx: f64, ny: f64 },
}

impl Shape {
    /// Distance from a table position to the feature. This is the only
    /// geometry the analytic prediction needs, and the simulation never calls
    /// it — it is here for `predict.rs` and for the tests.
    pub fn distance(&self, px: f64, py: f64) -> f64 {
        match *self {
            Shape::Point { x, y } => ((px - x).powi(2) + (py - y).powi(2)).sqrt(),
            Shape::Line { x, y, nx, ny } => ((px - x) * nx + (py - y) * ny).abs(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Feature {
    pub shape: Shape,
    pub kind: Kind,
    /// For a source, the rate sand arrives, in height units per step.
    pub rate: f64,
    /// For a sink, the height it pins the sand to. Zero is a hole in the
    /// plate; a positive value is a standpipe — a drain whose lip stands
    /// proud of the plate, so it only takes sand once the pile is deeper than
    /// the lip. Two drains at *different* lip heights is what turns the seam
    /// between them from a straight line into a hyperbola.
    pub level: f64,
    pub enabled: bool,
}

impl Feature {
    pub fn point_source(x: f64, y: f64, rate: f64) -> Self {
        Feature { shape: Shape::Point { x, y }, kind: Kind::Source, rate, level: 0.0, enabled: true }
    }
    pub fn point_sink(x: f64, y: f64) -> Self {
        Self::point_sink_at(x, y, 0.0)
    }
    /// A drain with its lip `level` above the plate.
    pub fn point_sink_at(x: f64, y: f64, level: f64) -> Self {
        Feature { shape: Shape::Point { x, y }, kind: Kind::Sink, rate: 0.0, level, enabled: true }
    }
    pub fn line_source(x: f64, y: f64, nx: f64, ny: f64, rate: f64) -> Self {
        let l = (nx * nx + ny * ny).sqrt().max(1e-12);
        Feature {
            shape: Shape::Line { x, y, nx: nx / l, ny: ny / l },
            kind: Kind::Source,
            rate,
            level: 0.0,
            enabled: true,
        }
    }
    pub fn line_sink(x: f64, y: f64, nx: f64, ny: f64) -> Self {
        Self::line_sink_at(x, y, nx, ny, 0.0)
    }
    /// A slot with its lip `level` above the plate.
    pub fn line_sink_at(x: f64, y: f64, nx: f64, ny: f64, level: f64) -> Self {
        let l = (nx * nx + ny * ny).sqrt().max(1e-12);
        Feature {
            shape: Shape::Line { x, y, nx: nx / l, ny: ny / l },
            kind: Kind::Sink,
            rate: 0.0,
            level,
            enabled: true,
        }
    }
}

/// A square plate of sand.
pub struct Field {
    pub n: usize,
    pub h: Vec<f64>,
    /// Scratch for the paired transfers, so a pass is simultaneous rather than
    /// order-dependent. Allocated once.
    d: Vec<f64>,
    /// Cells that a sink holds at its pinned level.
    sink_mask: Vec<bool>,
    sink_level: Vec<f64>,
    /// tan(angle of repose). The only material property in the model.
    pub k: f64,
    /// How sharp a fold the seam tracer insists on, as a multiple of `k`.
    /// Seeded from the stencil, which is where the right value comes from, but
    /// left public because it is the one number that trades the traced curve's
    /// *length* against its cleanliness and the page lets you see that.
    pub fold_floor: f64,
    /// The directions the repose angle is enforced in.
    pub stencil: Stencil,
    /// Total height poured in and drained away, for the mass audit.
    pub poured: f64,
    pub drained: f64,
    pub steps: u64,
}

impl Field {
    /// A plate using the 16-direction stencil — what the page ships.
    pub fn new(n: usize, repose_deg: f64) -> Self {
        Self::with_stencil(n, repose_deg, Stencil::Fine40)
    }

    pub fn with_stencil(n: usize, repose_deg: f64, stencil: Stencil) -> Self {
        Field {
            stencil,
            fold_floor: stencil.fold_floor(),
            n,
            h: vec![0.0; n * n],
            d: vec![0.0; n * n],
            sink_mask: vec![false; n * n],
            sink_level: vec![0.0; n * n],
            k: repose_deg.to_radians().tan(),
            poured: 0.0,
            drained: 0.0,
            steps: 0,
        }
    }

    #[inline]
    pub fn idx(&self, x: usize, y: usize) -> usize {
        y * self.n + x
    }

    pub fn set_repose(&mut self, deg: f64) {
        self.k = deg.to_radians().tan();
    }

    pub fn clear(&mut self) {
        self.h.iter_mut().for_each(|v| *v = 0.0);
        self.poured = 0.0;
        self.drained = 0.0;
        self.steps = 0;
    }

    /// Mark which cells the sinks hold down. Recomputed whenever the features
    /// move; a point sink is given a small radius so that it can actually
    /// swallow sand on a discrete grid rather than being a measure-zero point
    /// the sand steps over.
    pub fn rebuild_sinks(&mut self, feats: &[Feature], hole_r: f64) {
        let n = self.n;
        self.sink_mask.iter_mut().for_each(|v| *v = false);
        self.sink_level.iter_mut().for_each(|v| *v = 0.0);
        for f in feats.iter().filter(|f| f.enabled && f.kind == Kind::Sink) {
            for y in 0..n {
                for x in 0..n {
                    let d = f.shape.distance(x as f64, y as f64);
                    let r = match f.shape {
                        Shape::Point { .. } => hole_r,
                        // a slot is one cell wide; widening it would round off
                        // the parabola's vertex
                        Shape::Line { .. } => 0.75,
                    };
                    if d <= r {
                        let i = self.idx(x, y);
                        // where two drains overlap, the lower lip wins
                        if self.sink_mask[i] {
                            self.sink_level[i] = self.sink_level[i].min(f.level);
                        } else {
                            self.sink_mask[i] = true;
                            self.sink_level[i] = f.level;
                        }
                    }
                }
            }
        }
    }

    /// Pour one step's worth of sand in at every source, then drain every sink.
    ///
    /// Sand is added as a small disc rather than a single cell: a point source
    /// on a grid that only ever feeds one cell builds a spike that the
    /// relaxation then has to chew down, which is slow and adds grid noise to
    /// the very apex the conic's focus sits on.
    pub fn feed(&mut self, feats: &[Feature], brush_r: f64) {
        let n = self.n;
        for f in feats.iter().filter(|f| f.enabled && f.kind == Kind::Source) {
            match f.shape {
                Shape::Point { x, y } => {
                    let mut w = 0.0;
                    let r = brush_r.max(1.0);
                    let (x0, x1) = (((x - r).floor()) as i32, ((x + r).ceil()) as i32);
                    let (y0, y1) = (((y - r).floor()) as i32, ((y + r).ceil()) as i32);
                    for yy in y0..=y1 {
                        for xx in x0..=x1 {
                            if xx < 0 || yy < 0 || xx >= n as i32 || yy >= n as i32 {
                                continue;
                            }
                            let d = ((xx as f64 - x).powi(2) + (yy as f64 - y).powi(2)).sqrt();
                            if d <= r {
                                w += 1.0 - d / r;
                            }
                        }
                    }
                    if w <= 0.0 {
                        continue;
                    }
                    for yy in y0..=y1 {
                        for xx in x0..=x1 {
                            if xx < 0 || yy < 0 || xx >= n as i32 || yy >= n as i32 {
                                continue;
                            }
                            let d = ((xx as f64 - x).powi(2) + (yy as f64 - y).powi(2)).sqrt();
                            if d <= r {
                                let i = self.idx(xx as usize, yy as usize);
                                let add = f.rate * (1.0 - d / r) / w;
                                self.h[i] += add;
                                self.poured += add;
                            }
                        }
                    }
                }
                Shape::Line { .. } => {
                    let mut cells: Vec<usize> = Vec::new();
                    for y in 0..n {
                        for x in 0..n {
                            if f.shape.distance(x as f64, y as f64) <= 1.0 {
                                cells.push(self.idx(x, y));
                            }
                        }
                    }
                    if cells.is_empty() {
                        continue;
                    }
                    // A ridge is fed per unit length rather than in total, so
                    // its crest rises at the same rate as a point source's
                    // apex. Divide the rate by the length instead and a long
                    // ridge grows too slowly ever to meet the other feature.
                    let add = f.rate;
                    for i in cells {
                        self.h[i] += add;
                        self.poured += add;
                    }
                }
            }
        }
    }

    /// Hold every sink cell at the plate. Whatever was standing there has left
    /// the table, and is counted so the mass audit balances.
    pub fn drain(&mut self) {
        for i in 0..self.h.len() {
            if self.sink_mask[i] && self.h[i] > self.sink_level[i] {
                self.drained += self.h[i] - self.sink_level[i];
                self.h[i] = self.sink_level[i];
            }
        }
    }

    /// Cover the whole plate to a uniform depth.
    ///
    /// This is the other way to run the experiment, and for most of the family
    /// it is the better one: instead of growing a cone from a pour point, bury
    /// the plate and open the drains. The surface is then shaped by the drains
    /// alone, so the curve between two of them is big, well resolved, and
    /// arrives in a fraction of the passes a pour needs.
    pub fn flood(&mut self, depth: f64) {
        for v in self.h.iter_mut() {
            *v = depth;
        }
        self.poured += depth * (self.n * self.n) as f64;
    }

    /// The largest slope overshoot anywhere — how far the field is from
    /// settled, in height units per cell.
    pub fn max_violation(&self) -> f64 {
        let n = self.n as i32;
        let mut mx: f64 = 0.0;
        for y in 0..n {
            for x in 0..n {
                let i = self.idx(x as usize, y as usize);
                let hi = self.h[i];
                for &(dx, dy, dist) in self.stencil.offsets() {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx < 0 || ny < 0 || nx >= n || ny >= n {
                        continue;
                    }
                    let over = (hi - self.h[self.idx(nx as usize, ny as usize)]) - self.k * dist;
                    if over > mx {
                        mx = over;
                    }
                }
            }
        }
        mx
    }

    /// One granular-relaxation pass. Any over-steep pair topples a little
    /// downhill; every transfer is paired, so mass is conserved exactly.
    ///
    /// This is `soil.js`'s `relaxStep`, rule for rule.
    pub fn relax_step(&mut self, c: f64) -> f64 {
        let n = self.n as i32;
        self.d.iter_mut().for_each(|v| *v = 0.0);
        let mut mx: f64 = 0.0;
        for y in 0..n {
            for x in 0..n {
                let i = self.idx(x as usize, y as usize);
                let hi = self.h[i];
                for &(dx, dy, dist) in self.stencil.offsets() {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx < 0 || ny < 0 || nx >= n || ny >= n {
                        continue;
                    }
                    let j = self.idx(nx as usize, ny as usize);
                    let over = (hi - self.h[j]) - self.k * dist;
                    if over > 0.0 {
                        let move_ = c * over;
                        self.d[i] -= move_;
                        self.d[j] += move_;
                        if over > mx {
                            mx = over;
                        }
                    }
                }
            }
        }
        for k in 0..self.h.len() {
            self.h[k] += self.d[k];
        }
        mx
    }

    /// The same rule, with the excess *shared out* among the neighbours a cell
    /// is standing over rather than handed to each of them in full.
    ///
    /// **The fixed point is identical.** Settled means no pair stands steeper
    /// than repose, and that condition does not mention `c` or the stencil
    /// size at all — so this changes only the route, never the destination,
    /// which `both_relaxations_reach_the_same_pile` checks. What it buys is
    /// that the total a cell can shed in a pass no longer grows with the
    /// number of directions, so `c` can stay large however wide the stencil
    /// gets, and a sixteen- or twenty-four-direction pass costs what an
    /// eight-direction one used to.
    ///
    /// That is the difference between an honest discretisation of
    /// `|grad z| <= k` being affordable and not.
    pub fn relax_step_shared(&mut self, c: f64) -> f64 {
        let n = self.n as i32;
        self.d.iter_mut().for_each(|v| *v = 0.0);
        let mut mx: f64 = 0.0;
        let offsets = self.stencil.offsets();
        // Sized by the widest stencil, not by the one in use. This was 32 when
        // the widest was 24 and adding a rung indexed past the end.
        let mut over_buf = [0.0f64; MAX_STENCIL];
        debug_assert!(offsets.len() <= MAX_STENCIL);
        for y in 0..n {
            for x in 0..n {
                let i = self.idx(x as usize, y as usize);
                let hi = self.h[i];
                let mut total = 0.0;
                let mut cnt = 0usize;
                for (oi, &(dx, dy, dist)) in offsets.iter().enumerate() {
                    let (nx, ny) = (x + dx, y + dy);
                    over_buf[oi] = 0.0;
                    if nx < 0 || ny < 0 || nx >= n || ny >= n {
                        continue;
                    }
                    let j = self.idx(nx as usize, ny as usize);
                    let over = (hi - self.h[j]) - self.k * dist;
                    if over > 0.0 {
                        over_buf[oi] = over;
                        total += over;
                        cnt += 1;
                        if over > mx {
                            mx = over;
                        }
                    }
                }
                if cnt == 0 {
                    continue;
                }
                // Divide `c` worth of the overshoot among the faces the cell
                // is standing over, weighted by how far over each one is. The
                // total shed is `c * (sum of squares) / (sum)`, which is at
                // most `c * (the worst single overshoot)` — so however many
                // directions the stencil checks, a cell can never shed more in
                // one pass than its steepest face alone justifies. That is the
                // whole trick: the stability limit stops depending on the
                // number of neighbours.
                let scale = c / total;
                for (oi, &(dx, dy, _)) in offsets.iter().enumerate() {
                    let over = over_buf[oi];
                    if over <= 0.0 {
                        continue;
                    }
                    let j = self.idx((x + dx) as usize, (y + dy) as usize);
                    let move_ = scale * over * over;
                    self.d[i] -= move_;
                    self.d[j] += move_;
                }
            }
        }
        for k in 0..self.h.len() {
            self.h[k] += self.d[k];
        }
        mx
    }

    /// Sand that topples off the edge of the plate is gone, exactly as it is
    /// in the video — the plate has a rim of nothing. Without this the pile
    /// would pond against an invisible wall and the outer cone would not be a
    /// cone.
    pub fn spill(&mut self) {
        let n = self.n;
        for x in 0..n {
            for &y in &[0usize, n - 1] {
                let i = self.idx(x, y);
                self.drained += self.h[i];
                self.h[i] = 0.0;
            }
        }
        for y in 0..n {
            for &x in &[0usize, n - 1] {
                let i = self.idx(x, y);
                self.drained += self.h[i];
                self.h[i] = 0.0;
            }
        }
    }

    /// One tick of the table: pour, topple, drain, spill.
    ///
    /// Uses the shared-excess iteration, like everything else that runs. The
    /// strict one is reachable only through `relax_step` directly, and its
    /// coefficient is not interchangeable with this one — handing the shared
    /// coefficient to the strict rule on a wide stencil diverges to NaN inside
    /// a few passes, which is exactly what it did the first time these two
    /// were wired together.
    pub fn step(&mut self, feats: &[Feature], relax_passes: usize, c: f64, brush_r: f64) -> f64 {
        self.feed(feats, brush_r);
        self.drain();
        let mut mx = 0.0;
        for _ in 0..relax_passes {
            mx = self.relax_step_shared(c);
            self.drain();
        }
        self.spill();
        self.steps += 1;
        mx
    }

    /// Topple until nothing stands steeper than it can, draining as it goes.
    /// Returns `(passes, final_violation)`.
    ///
    /// Deliberately does NOT spill over the plate edge — that belongs to
    /// pouring, and doing it here is actively wrong for a flooded tray: the
    /// spill zeroes the border ring and leaves the sand beside it standing
    /// eighteen units proud of nothing, a cliff whose gradients then poison
    /// every label near the edge and scatter the traced seam across the whole
    /// plate.
    ///
    /// This is where the shape actually comes from, and it is slow on purpose:
    /// relaxation is diffusive, so news of the hole reaches the far side of
    /// the pile one cell at a time. The alternative — solving the steady state
    /// directly with a fast-sweeping eikonal solver — would be far quicker and
    /// would also *build in* the cone that the page claims to discover, so it
    /// is not on the table.
    pub fn settle(&mut self, c: f64, eps: f64, cap: usize) -> (usize, f64) {
        self.settle_with(c, eps, cap, true)
    }

    /// `shared = false` uses the soil.js rule verbatim; `true` uses the
    /// shared-excess iteration, which finds the same settled surface far
    /// sooner on a wide stencil.
    pub fn settle_with(&mut self, c: f64, eps: f64, cap: usize, shared: bool) -> (usize, f64) {
        // Open the drains BEFORE measuring anything. A freshly flooded plate
        // is perfectly flat, so the first `relax_step` would report no
        // violation at all and the loop would exit having done nothing — the
        // cliff that the drain cuts is the whole reason there is work to do.
        self.drain();
        let mut v = f64::INFINITY;
        for i in 0..cap {
            v = if shared { self.relax_step_shared(c) } else { self.relax_step(c) };
            self.drain();
            if v < eps {
                return (i + 1, v);
            }
        }
        (cap, v)
    }

    /// Pour a charge in `batches` helpings, settling after each.
    ///
    /// Pouring the whole lot at once builds a spike whose relaxation takes
    /// thousands of passes; pouring it in helpings keeps the field close to
    /// settled throughout and gets to the same steady state sooner. The final
    /// state is an attractor of the toppling rule, so how it was reached does
    /// not change it — `a_faster_pour_reaches_the_same_shape` checks exactly
    /// that.
    pub fn pour_and_settle(
        &mut self,
        feats: &[Feature],
        batches: usize,
        per_batch: f64,
        c: f64,
        eps: f64,
        cap: usize,
        brush_r: f64,
    ) -> f64 {
        let scaled: Vec<Feature> = feats
            .iter()
            .map(|f| {
                let mut g = *f;
                if g.kind == Kind::Source {
                    g.rate = per_batch;
                }
                g
            })
            .collect();
        let mut v = 0.0;
        for _ in 0..batches {
            self.feed(&scaled, brush_r);
            let (_, vv) = self.settle(c, eps, cap);
            v = vv;
            self.steps += 1;
        }
        v
    }

    pub fn total_mass(&self) -> f64 {
        self.h.iter().sum()
    }

    /// Height at a fractional position, bilinear. The seam tracer wants this.
    pub fn sample(&self, x: f64, y: f64) -> f64 {
        let n = self.n;
        let xi = x.floor().clamp(0.0, (n - 2) as f64) as usize;
        let yi = y.floor().clamp(0.0, (n - 2) as f64) as usize;
        let fx = (x - xi as f64).clamp(0.0, 1.0);
        let fy = (y - yi as f64).clamp(0.0, 1.0);
        let h00 = self.h[self.idx(xi, yi)];
        let h10 = self.h[self.idx(xi + 1, yi)];
        let h01 = self.h[self.idx(xi, yi + 1)];
        let h11 = self.h[self.idx(xi + 1, yi + 1)];
        let a = h00 + (h10 - h00) * fx;
        let b = h01 + (h11 - h01) * fx;
        a + (b - a) * fy
    }

    /// Central-difference gradient in height units per cell.
    pub fn gradient(&self, x: usize, y: usize) -> (f64, f64) {
        let n = self.n;
        let xm = x.saturating_sub(1);
        let xp = (x + 1).min(n - 1);
        let ym = y.saturating_sub(1);
        let yp = (y + 1).min(n - 1);
        let gx = (self.h[self.idx(xp, y)] - self.h[self.idx(xm, y)]) / ((xp - xm) as f64);
        let gy = (self.h[self.idx(x, yp)] - self.h[self.idx(x, ym)]) / ((yp - ym) as f64);
        (gx, gy)
    }
}
