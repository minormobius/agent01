//! The cell: polydisperse steel bearings loose in mineral oil, a live pin at
//! the centre, a grounded cup at the rim.
//!
//! # The model
//!
//! Top view of a shallow dish, so the dynamics are two-dimensional (gravity is
//! out of plane and the floor carries it). Each bearing is a rigid sphere with
//! mass `4/3·π·r³` — polydisperse, log-uniform between `R_MIN` and `R_MAX`.
//!
//! Four things act on a bearing:
//!
//! 1. **Contact.** Linear spring–dashpot normal force with Coulomb friction,
//!    plus a squeeze-film (lubrication) term that resists approach through the
//!    oil — the reason bearings settle together softly instead of clacking.
//! 2. **Its own charge.** A bearing wired to the pin charges up; one wired to
//!    the cup discharges to ground. `q·E` then throws it across the cell. This
//!    is the shuttling ("dancing bearing") half of the demo.
//! 3. **Its induced dipole.** A conducting sphere in a field polarises,
//!    `p = ε·r³·E`. Head-to-tail dipoles attract, side-by-side they repel —
//!    that is the chaining half, and it is what actually assembles the wire.
//! 4. **Dielectrophoresis** in the applied field's gradient, which drags every
//!    bearing toward the pin where the field is strongest.
//!
//! Two field conventions live side by side, deliberately: the *applied* field
//! is the 2-D coaxial solution (a pin inside a cylinder, which is what a
//! shallow dish is), while *bearing-to-bearing* interaction uses the 3-D point
//! charge / point dipole forms, because the bearings really are spheres and
//! their field lines leave the plane.
//!
//! # Units
//!
//! Cup radius = 1 (≈50 mm in the real cell), oil density = 1, and
//! `1/(4πε₀) = 1`, which makes a sphere's capacitance simply `ε·r`. Time is in
//! seconds. The voltage knob is dimensionless; the HUD scales it to kV for
//! display only.

use crate::grid::Grid;
use crate::network::Network;
use crate::rng::Rng;

// ---------------------------------------------------------------- geometry --
pub const R_CUP: f32 = 1.0;
pub const R_PIN: f32 = 0.12;
/// ln(R_cup / R_pin) — the coaxial denominator.
const K_LOG: f32 = 2.120_264; // ln(1.0 / 0.12)

const R_MIN: f32 = 0.018;
const R_MAX: f32 = 0.036;

// ------------------------------------------------------------- electricity --
/// Relative permittivity of mineral oil.
const EPS_OIL: f32 = 2.2;
/// Applied pin potential at knob = 1. Everything else is calibrated to this.
const V_REF: f32 = 0.9;
/// Conductance of a closed metal-to-metal contact.
const G_CONTACT: f32 = 1.0;
/// Gap over which the conducting film decays (in units of the smaller radius).
const G_DECAY: f32 = 0.05;
/// Widest gap that gets a conductance edge at all (units of smaller radius).
const G_RANGE: f32 = 0.30;
/// The oil's own conductivity, as a tie to the local applied potential. Tiny —
/// its job in the *network* is only to keep the Kirchhoff matrix non-singular
/// when a bearing touches nothing, and to leak a little current down a live
/// chain. Metal-to-metal contact beats it by orders of magnitude, as it should.
const G_LEAK: f32 = 2.0e-4;
/// How long a bearing keeps a charge that has nowhere to go. This is the oil's
/// dielectric relaxation time εε₀/σ — seconds for mineral oil, and a genuinely
/// separate physical constant from `G_LEAK` above. Set it too long and every
/// bearing the pin ever touched stays charged forever, and the cell slowly
/// empties itself against the cup wall.
const TAU_OIL: f32 = 2.0;
/// Conductance of the supply lead: a real high-voltage supply is current
/// limited, so the pin sags the moment the bearings finish a wire. Modelling
/// the pin as an *unknown* node behind this conductance is what makes the cell
/// go quiet after it connects, instead of assembling forever.
const G_SOURCE: f32 = 0.15;
/// Field at which the oil breaks down and the gap arcs over.
const E_BREAKDOWN: f32 = 26.0;
/// Conductance multiplier for a gap that is arcing.
const SPARK_GAIN: f32 = 40.0;
// --- the near-contact correction -------------------------------------------
// Point charges and point dipoles are the wrong model for two conducting
// spheres about to touch: the real answer is a multipole series that the first
// two terms get badly wrong in *both* directions. Two corrections, both
// decaying over a fraction of the contact distance:
//
//   * the dipolar attraction is enhanced (field lines crowd into the gap),
//   * the like-charge repulsion is screened (surface charge runs away from the
//     gap, and at contact the pair is simply one conductor).
//
// Without them a chain of same-potential bearings shoves itself apart, which is
// the opposite of what the cell does.
const NEAR_GAIN: f32 = 6.0;
const NEAR_SCREEN: f32 = 0.92;
const NEAR_DECAY: f32 = 0.25;
/// Image forces use the distance to the electrode surface, floored at this
/// fraction of the bearing radius — the point-image formulae diverge at
/// contact, where they stop being true anyway.
const IMG_FLOOR: f32 = 0.5;
/// Force ceiling per bearing, in units of its own weight-equivalent. A backstop
/// only — if the physics is right nothing comes close to it.
const F_CAP: f32 = 400.0;

// ---------------------------------------------------------------- mechanics --
/// Contact spring, sized so the strongest electrostatic grab still overlaps
/// two bearings by only a per cent or so, while a contact still lasts several
/// substeps at the default substep count.
const K_CONTACT: f32 = 30.0;
/// Normal dashpot, roughly half of critical for a mid-size pair.
const C_CONTACT: f32 = 0.020;
/// Squeeze-film coefficient (lubrication resistance to approach).
const C_LUBE: f32 = 0.9;
/// …clamped to this fraction of `m_eff / H_MAX`. The squeeze film diverges as
/// the gap closes, and an explicit damper stiffer than the timestep does not
/// damp — it oscillates, and a pair of bearings buzzes forever in a dish that
/// should be dead still.
const LUBE_STABLE: f32 = 0.5;
/// Floor rolling resistance, per unit mass.
const ROLL_DRAG: f32 = 0.35;
/// Interaction cutoff. Dipole force falls as 1/d⁴, so this is generous.
const R_CUT: f32 = 0.17;
/// Verlet skin: the neighbour list is built to `R_CUT + SKIN` and reused until
/// something has moved half a skin, which takes the grid sweep off the substep
/// loop entirely.
const SKIN: f32 = 0.035;
/// Longest mechanical substep the contact spring stays stable at, given the
/// lightest bearing. `step` adds substeps if the caller asks for too few, so
/// stability is a property of the solver and not of whoever calls it.
const H_MAX: f32 = 1.0 / 900.0;
/// Electrostatic denominators never go below the contact distance times this —
/// the multipole expansions are only valid outside contact anyway, so clamping
/// there is more honest than a softening length pulled out of the air.
const D_FLOOR: f32 = 1.0;

/// Knob ids shared with the JS glue (`solver.js` mirrors this list).
pub mod param {
    pub const VOLTAGE: u32 = 0;
    pub const VISCOSITY: u32 = 1;
    pub const CHARGE: u32 = 2;
    pub const CHAIN: u32 = 3;
    pub const NOISE: u32 = 4;
    pub const FRICTION: u32 = 5;
    pub const TILT_X: u32 = 6;
    pub const TILT_Y: u32 = 7;
    pub const POLARITY: u32 = 8;
}

#[derive(Clone, Copy)]
pub struct Params {
    /// 0..1 knob; the pin sits at `polarity · voltage · V_REF`.
    pub voltage: f32,
    /// Dynamic viscosity of the oil.
    pub viscosity: f32,
    /// Scales contact charging (the shuttling regime).
    pub charge: f32,
    /// Scales induced-dipole chaining (the wire-building regime).
    pub chain: f32,
    /// Brownian/convection jitter.
    pub noise: f32,
    pub friction: f32,
    /// Dish tilt, as an in-plane acceleration.
    pub tilt: (f32, f32),
    pub polarity: f32,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            voltage: 0.75,
            viscosity: 0.015,
            // Contact charging fights chain building: a bearing that charges
            // hard enough is thrown off the tip before the next one arrives.
            // The default sits in the wire-building regime; turn it up and the
            // cell switches over to the dancing one.
            charge: 0.06,
            chain: 1.0,
            noise: 0.05,
            friction: 0.35,
            tilt: (0.0, 0.0),
            polarity: 1.0,
        }
    }
}

#[derive(Default, Clone, Copy)]
pub struct Stats {
    pub current: f32,
    pub closed: f32,
    pub chains: f32,
    pub max_speed: f32,
    pub mean_overlap: f32,
    pub cg_iters: f32,
    pub cg_resid: f32,
    pub live_frac: f32,
    pub time: f32,
    pub edges: f32,
    pub sparks: f32,
    pub longest_chain: f32,
    pub power: f32,
    pub n: f32,
    pub reach: f32,
    pub packing: f32,
    /// What the pin actually sits at once the load pulls it down…
    pub pin: f32,
    /// …versus what the supply is set to.
    pub supply: f32,
}

const BALL_STRIDE: usize = 12;
const EDGE_STRIDE: usize = 6;
const STAT_COUNT: usize = 18;

pub struct World {
    pub n: usize,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub r: Vec<f32>,
    pub m: Vec<f32>,
    pub q: Vec<f32>,
    /// Node potential from the Kirchhoff solve.
    pub v: Vec<f32>,
    /// Induced dipole (lagged one substep — see `forces`).
    pub px: Vec<f32>,
    pub py: Vec<f32>,
    /// Local field, rebuilt every substep (applied + charges + dipoles).
    pub ex: Vec<f32>,
    pub ey: Vec<f32>,
    /// Polarising field: applied + charges only. See `forces`.
    pub epx: Vec<f32>,
    pub epy: Vec<f32>,
    pub fx: Vec<f32>,
    pub fy: Vec<f32>,
    /// Orientation quaternion, integrated from rolling on the dish floor.
    pub quat: Vec<[f32; 4]>,
    /// Total conductance attached to a bearing — sets its RC charging time.
    pub gsum: Vec<f32>,
    pub gpin: Vec<f32>,
    pub gwall: Vec<f32>,
    /// Ohmic heating, so a bearing carrying current visibly glows.
    pub heat: Vec<f32>,
    /// Union-find over conducting contacts.
    uf: Vec<u32>,
    /// 1 = wired to the pin, 2 = wired to the cup, 3 = both (part of the path).
    pub wired: Vec<u8>,

    grid: Grid,
    net: Network,
    rng: Rng,
    pub params: Params,
    pub stats: Stats,
    pub time: f32,

    ball_buf: Vec<f32>,
    edge_buf: Vec<f32>,
    stat_buf: Vec<f32>,
    /// (i, j, gap) pairs within conduction range, rebuilt each frame.
    links: Vec<(u32, u32, f32)>,
    /// Verlet neighbour list and the positions it was built at.
    pairs: Vec<(u32, u32)>,
    ref_x: Vec<f32>,
    ref_y: Vec<f32>,
}

#[inline]
fn hypot(x: f32, y: f32) -> f32 {
    (x * x + y * y).sqrt()
}

impl World {
    pub fn new(n: usize, seed: u32) -> World {
        let mut w = World {
            n: 0,
            x: vec![],
            y: vec![],
            vx: vec![],
            vy: vec![],
            r: vec![],
            m: vec![],
            q: vec![],
            v: vec![],
            px: vec![],
            py: vec![],
            ex: vec![],
            ey: vec![],
            epx: vec![],
            epy: vec![],
            fx: vec![],
            fy: vec![],
            quat: vec![],
            gsum: vec![],
            gpin: vec![],
            gwall: vec![],
            heat: vec![],
            uf: vec![],
            wired: vec![],
            grid: Grid::new(),
            net: Network::new(),
            rng: Rng::new(seed),
            params: Params::default(),
            stats: Stats::default(),
            time: 0.0,
            ball_buf: vec![],
            edge_buf: vec![],
            stat_buf: vec![0.0; STAT_COUNT],
            links: vec![],
            pairs: vec![],
            ref_x: vec![],
            ref_y: vec![],
        };
        w.reset(n, seed);
        w
    }

    /// Scatter `n` bearings loosely, without overlaps, avoiding the pin.
    pub fn reset(&mut self, n: usize, seed: u32) {
        self.rng = Rng::new(seed);
        self.n = n;
        self.time = 0.0;
        let z = vec![0.0f32; n];
        self.x = z.clone();
        self.y = z.clone();
        self.vx = z.clone();
        self.vy = z.clone();
        self.r = z.clone();
        self.m = z.clone();
        self.q = z.clone();
        // one extra slot: the pin is a node of the network, not a boundary
        self.v = vec![0.0f32; n + 1];
        self.px = z.clone();
        self.py = z.clone();
        self.ex = z.clone();
        self.ey = z.clone();
        self.epx = z.clone();
        self.epy = z.clone();
        self.fx = z.clone();
        self.fy = z.clone();
        self.gsum = z.clone();
        self.gpin = z.clone();
        self.gwall = z.clone();
        self.heat = z.clone();
        self.quat = vec![[0.0, 0.0, 0.0, 1.0]; n];
        self.uf = (0..=n as u32).collect();
        self.wired = vec![0; n];
        self.ball_buf = vec![0.0; n * BALL_STRIDE];
        self.pairs.clear();
        self.ref_x = vec![f32::INFINITY; n];
        self.ref_y = vec![f32::INFINITY; n];

        // Log-uniform radii: a real scoop of bearings is not monodisperse, and
        // the size spread is what makes the packing loose and the chains kinked.
        let ratio = R_MAX / R_MIN;
        for i in 0..n {
            let u = self.rng.unit();
            let r = R_MIN * ratio.powf(u);
            self.r[i] = r;
            self.m[i] = 4.0 / 3.0 * std::f32::consts::PI * r * r * r;
        }

        // Poisson-ish scatter: sample, reject on overlap, relax the radius
        // budget if the dish is crowded.
        for i in 0..n {
            let ri = self.r[i];
            let mut placed = false;
            for attempt in 0..200 {
                let slack = 1.0 - 0.004 * attempt as f32;
                let rad = self
                    .rng
                    .range(R_PIN + ri + 0.02, R_CUP - ri - 0.01)
                    .max(R_PIN + ri + 0.005);
                let th = self.rng.range(0.0, std::f32::consts::TAU);
                let (cx, cy) = (rad * th.cos(), rad * th.sin());
                let mut ok = true;
                for j in 0..i {
                    let need = (ri + self.r[j]) * slack.max(0.55);
                    if (cx - self.x[j]).powi(2) + (cy - self.y[j]).powi(2) < need * need {
                        ok = false;
                        break;
                    }
                }
                if ok {
                    self.x[i] = cx;
                    self.y[i] = cy;
                    placed = true;
                    break;
                }
            }
            if !placed {
                // Dish is full; drop it on the rim and let the solver push out.
                let th = self.rng.range(0.0, std::f32::consts::TAU);
                let rad = R_CUP - ri - 0.005;
                self.x[i] = rad * th.cos();
                self.y[i] = rad * th.sin();
            }
        }
        self.stats = Stats::default();
        self.stats.n = n as f32;
        let area: f32 = self.r.iter().map(|r| r * r).sum();
        self.stats.packing = area / (R_CUP * R_CUP - R_PIN * R_PIN);
    }

    pub fn set_param(&mut self, id: u32, value: f32) {
        match id {
            param::VOLTAGE => self.params.voltage = value.clamp(0.0, 2.0),
            param::VISCOSITY => self.params.viscosity = value.clamp(0.0015, 0.5),
            param::CHARGE => self.params.charge = value.clamp(0.0, 4.0),
            param::CHAIN => self.params.chain = value.clamp(0.0, 4.0),
            param::NOISE => self.params.noise = value.clamp(0.0, 2.0),
            param::FRICTION => self.params.friction = value.clamp(0.0, 2.0),
            param::TILT_X => self.params.tilt.0 = value.clamp(-2.0, 2.0),
            param::TILT_Y => self.params.tilt.1 = value.clamp(-2.0, 2.0),
            param::POLARITY => self.params.polarity = if value < 0.0 { -1.0 } else { 1.0 },
            _ => {}
        }
    }

    /// What the supply is set to, signed. The pin itself sits at `v_pin()`,
    /// which sags below this under load.
    #[inline]
    pub fn v_supply(&self) -> f32 {
        self.params.voltage * V_REF * self.params.polarity
    }

    /// The pin's actual potential — solved, not imposed. Index `n` of the
    /// potential vector is the pin node.
    #[inline]
    pub fn v_pin(&self) -> f32 {
        self.v[self.n]
    }

    /// Applied potential of the empty cell (coaxial, 2-D).
    #[inline]
    pub fn phi_ext(&self, x: f32, y: f32) -> f32 {
        let r = hypot(x, y).clamp(R_PIN, R_CUP);
        self.v_pin() * (R_CUP / r).ln() / K_LOG
    }

    /// Applied field of the empty cell — radial, 1/r.
    #[inline]
    fn e_ext(&self, x: f32, y: f32) -> (f32, f32) {
        let r = hypot(x, y).max(R_PIN);
        let e = self.v_pin() / (K_LOG * r);
        (e * x / r, e * y / r)
    }

    // ------------------------------------------------------------ the step --

    /// Advance by `dt`, split into `substeps` mechanical substeps. The
    /// Kirchhoff solve runs once per call (the network barely changes inside a
    /// frame); charges, forces and motion run every substep.
    pub fn step(&mut self, dt: f32, substeps: usize) {
        let substeps = substeps.max(1).max((dt / H_MAX).ceil() as usize);
        let h = dt / substeps as f32;
        self.refresh_neighbours(true);
        self.build_network();
        self.solve_network();
        for _ in 0..substeps {
            self.refresh_neighbours(false);
            self.relax_charges(h);
            self.forces();
            self.integrate(h);
        }
        self.time += dt;
        self.collect_stats();
        self.pack();
    }

    /// Rebuild the grid and the Verlet pair list, either because the frame
    /// just started or because something has drifted more than half a skin
    /// since the list was built.
    fn refresh_neighbours(&mut self, force: bool) {
        if !force {
            let half = 0.5 * SKIN;
            let mut moved = false;
            for i in 0..self.n {
                if (self.x[i] - self.ref_x[i]).abs() > half
                    || (self.y[i] - self.ref_y[i]).abs() > half
                {
                    moved = true;
                    break;
                }
            }
            if !moved {
                return;
            }
        }
        let reach = R_CUT + SKIN;
        self.grid
            .rebuild(&self.x, &self.y, self.n, R_CUP + 0.05, reach);
        let mut pairs = std::mem::take(&mut self.pairs);
        pairs.clear();
        {
            let (x, y) = (&self.x, &self.y);
            self.grid.for_each_pair(x, y, |i, j| {
                let dx = x[j] - x[i];
                let dy = y[j] - y[i];
                if dx * dx + dy * dy < reach * reach {
                    pairs.push((i as u32, j as u32));
                }
            });
        }
        self.pairs = pairs;
        self.ref_x.copy_from_slice(&self.x);
        self.ref_y.copy_from_slice(&self.y);
    }

    /// Conductance of a gap: metal-to-metal below zero, an exponentially
    /// thinning oil film above it, and an arc if the field across it exceeds
    /// the oil's breakdown strength.
    #[inline]
    fn conductance(&self, gap: f32, scale: f32, dv: f32) -> (f32, bool) {
        if gap <= 0.0 {
            return (G_CONTACT, false);
        }
        let g = G_CONTACT * (-gap / (G_DECAY * scale)).exp();
        let field = dv.abs() / gap.max(1e-5);
        if field > E_BREAKDOWN {
            (g * SPARK_GAIN + G_CONTACT * 0.05, true)
        } else {
            (g, false)
        }
    }

    /// Assemble Kirchhoff's equations for this frame, and the union-find that
    /// answers "is there a path from pin to cup".
    fn build_network(&mut self) {
        let n = self.n;
        // node `n` is the pin, tied to the supply through its lead
        self.net.begin(n + 1);
        self.net.add_terminal(n, G_SOURCE, self.v_supply());
        self.links.clear();
        for i in 0..n {
            self.gsum[i] = 0.0;
            self.gpin[i] = 0.0;
            self.gwall[i] = 0.0;
            self.uf[i] = i as u32;
        }
        self.uf[n] = n as u32;

        // ball -- ball
        self.links.clear();
        for k in 0..self.pairs.len() {
            let (i, j) = (self.pairs[k].0 as usize, self.pairs[k].1 as usize);
            let dx = self.x[j] - self.x[i];
            let dy = self.y[j] - self.y[i];
            let d2 = dx * dx + dy * dy;
            let scale = self.r[i].min(self.r[j]);
            let reach = self.r[i] + self.r[j] + G_RANGE * scale;
            if d2 < reach * reach {
                let gap = d2.sqrt() - self.r[i] - self.r[j];
                self.links.push((i as u32, j as u32, gap));
            }
        }

        let mut edges = std::mem::take(&mut self.links);
        for &(i, j, gap) in edges.iter() {
            let (i, j) = (i as usize, j as usize);
            let scale = self.r[i].min(self.r[j]);
            let dv = self.v[i] - self.v[j];
            let (g, _spark) = self.conductance(gap, scale, dv);
            self.net.add_edge(i, j, g);
            self.gsum[i] += g;
            self.gsum[j] += g;
            if g > 0.05 * G_CONTACT {
                self.union(i, j);
            }
        }
        self.links = std::mem::take(&mut edges);

        // ball -- pin, ball -- cup wall, ball -- oil
        let v_pin = self.v_pin();
        for i in 0..n {
            let rad = hypot(self.x[i], self.y[i]);
            let gap_pin = rad - self.r[i] - R_PIN;
            if gap_pin < G_RANGE * self.r[i] {
                let (g, _) = self.conductance(gap_pin, self.r[i], v_pin - self.v[i]);
                self.gpin[i] = g;
                self.gsum[i] += g;
                self.net.add_edge(i, n, g);
                if g > 0.05 * G_CONTACT {
                    self.union(i, n);
                }
            }
            let gap_wall = R_CUP - (rad + self.r[i]);
            if gap_wall < G_RANGE * self.r[i] {
                let (g, _) = self.conductance(gap_wall, self.r[i], self.v[i]);
                self.gwall[i] = g;
                self.gsum[i] += g;
                self.net.add_terminal(i, g, 0.0);
            }
            // the oil itself
            self.net
                .add_terminal(i, G_LEAK, self.phi_ext(self.x[i], self.y[i]));
            self.gsum[i] += G_LEAK;
        }
    }

    fn solve_network(&mut self) {
        let mut v = std::mem::take(&mut self.v);
        // A chain of high-conductance contacts hanging off a weak leak is an
        // ill-conditioned Laplacian, so CG crawls toward the last digits. It
        // does not need them: a 0.1% potential error is invisible in the HUD
        // and in the forces, and the iteration cap keeps the frame budget.
        self.net.solve(&mut v, 150, 1e-3);
        self.v = v;
        self.stats.cg_iters = self.net.iters as f32;
        self.stats.cg_resid = self.net.resid;
    }

    // union-find over conducting contacts
    fn find(&mut self, mut a: usize) -> usize {
        while self.uf[a] as usize != a {
            let p = self.uf[a] as usize;
            self.uf[a] = self.uf[p];
            a = self.uf[a] as usize;
        }
        a
    }

    fn union(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra != rb {
            self.uf[ra] = rb as u32;
        }
    }

    /// Charge relaxes toward the value the node's potential implies, with the
    /// RC time its own conductance sets: a bearing welded to the pin charges
    /// almost instantly, one floating in oil takes a very long time — which is
    /// precisely why a bearing can carry charge across the cell.
    fn relax_charges(&mut self, h: f32) {
        let gain = self.params.charge;
        for i in 0..self.n {
            let cap = EPS_OIL * self.r[i];
            let target = gain * cap * (self.v[i] - self.phi_ext(self.x[i], self.y[i]));
            // Rate is set by whatever it is attached to, with the oil's own
            // relaxation as the floor — so a bearing welded into a chain
            // charges in milliseconds and a bearing flung loose keeps its
            // charge for a second or two of flight.
            let rate = self.gsum[i] / cap + 1.0 / TAU_OIL;
            let a = 1.0 - (-h * rate).exp();
            self.q[i] += (target - self.q[i]) * a;
        }
    }

    /// Pair loop: field accumulation, electrostatics, contact, lubrication.
    ///
    /// Two fields are accumulated per bearing. `ep` (applied + neighbours'
    /// *charges*) is what polarises it; `e` adds the neighbours' dipole fields
    /// and is what its own charge feels. Keeping dipole fields out of the
    /// polarising field is deliberate: point dipoles that polarise each other
    /// are a positive feedback loop with no fixed point at contact range, and
    /// the near-contact enhancement below is the physical stand-in for the
    /// mutual polarisation this drops.
    fn forces(&mut self) {
        let n = self.n;
        for i in 0..n {
            let (ex, ey) = self.e_ext(self.x[i], self.y[i]);
            self.ex[i] = ex;
            self.ey[i] = ey;
            self.epx[i] = ex;
            self.epy[i] = ey;
            self.fx[i] = 0.0;
            self.fy[i] = 0.0;
        }

        let inv_eps = 1.0 / EPS_OIL;
        let fric = self.params.friction;

        for k in 0..self.pairs.len() {
            let (i, j) = (self.pairs[k].0 as usize, self.pairs[k].1 as usize);
            let dx = self.x[j] - self.x[i];
            let dy = self.y[j] - self.y[i];
            let d2 = dx * dx + dy * dy;
            if d2 > R_CUT * R_CUT {
                continue;
            }
            let d = d2.sqrt().max(1e-6);
            let (ux, uy) = (dx / d, dy / d);
            let sum_r = self.r[i] + self.r[j];
            let gap = d - sum_r;
            // The multipole forms below only mean anything outside contact.
            let ds = d.max(D_FLOOR * sum_r);
            let ds2 = ds * ds;
            let ds3 = ds2 * ds;
            let ds4 = ds2 * ds2;
            // how deep into contact this pair is, 0 far apart → 1 touching
            let nearness = (-(gap.max(0.0)) / (NEAR_DECAY * sum_r)).exp();

            // --- fields each bearing sees from the other -------------------
            // Monopole. `u` runs from i to j, so j's charge pushes the field at
            // i along −u and i's charge pushes the field at j along +u.
            let em_i = inv_eps * self.q[j] / ds2;
            let em_j = inv_eps * self.q[i] / ds2;
            self.ex[i] -= em_i * ux;
            self.ey[i] -= em_i * uy;
            self.ex[j] += em_j * ux;
            self.ey[j] += em_j * uy;
            self.epx[i] -= em_i * ux;
            self.epy[i] -= em_i * uy;
            self.epx[j] += em_j * ux;
            self.epy[j] += em_j * uy;
            // dipole
            let pdu_j = self.px[j] * ux + self.py[j] * uy;
            let pdu_i = self.px[i] * ux + self.py[i] * uy;
            self.ex[i] += inv_eps * (3.0 * pdu_j * ux - self.px[j]) / ds3;
            self.ey[i] += inv_eps * (3.0 * pdu_j * uy - self.py[j]) / ds3;
            self.ex[j] += inv_eps * (3.0 * pdu_i * ux - self.px[i]) / ds3;
            self.ey[j] += inv_eps * (3.0 * pdu_i * uy - self.py[i]) / ds3;

            // --- forces ----------------------------------------------------
            let mut fx = 0.0f32;
            let mut fy = 0.0f32;

            // monopole–monopole (like signs repel), screened at contact
            let fm = inv_eps * self.q[i] * self.q[j] / ds2 * (1.0 - NEAR_SCREEN * nearness);
            fx -= fm * ux;
            fy -= fm * uy;

            // charge–dipole, both directions, written so the pair is
            // momentum-conserving by construction
            let cd = inv_eps / ds3;
            let (mut cx, mut cy) = (0.0f32, 0.0f32);
            // force on i's charge in j's dipole field
            cx += self.q[i] * cd * (3.0 * pdu_j * ux - self.px[j]);
            cy += self.q[i] * cd * (3.0 * pdu_j * uy - self.py[j]);
            // force on i's dipole in j's monopole field: (p·∇)E
            let kq = inv_eps * self.q[j] / ds3;
            cx -= kq * (3.0 * pdu_i * ux - self.px[i]);
            cy -= kq * (3.0 * pdu_i * uy - self.py[i]);
            fx += cx;
            fy += cy;

            // dipole–dipole, with the near-contact correction that makes real
            // chains hold together
            let pipj = self.px[i] * self.px[j] + self.py[i] * self.py[j];
            let kdd = 3.0 * inv_eps * (1.0 + NEAR_GAIN * nearness) / ds4;
            let ddx =
                pdu_i * self.px[j] + pdu_j * self.px[i] + pipj * ux - 5.0 * pdu_i * pdu_j * ux;
            let ddy =
                pdu_i * self.py[j] + pdu_j * self.py[i] + pipj * uy - 5.0 * pdu_i * pdu_j * uy;
            // The textbook form is written with the separation unit vector
            // running from the *other* dipole to this one; `u` runs the other
            // way, hence the minus. Get this backwards and the bearings chain
            // shoulder-to-shoulder into concentric rings instead of head-to-tail
            // into radial wires — which is a very pretty wrong answer.
            fx -= kdd * ddx;
            fy -= kdd * ddy;

            // --- contact + lubrication -------------------------------------
            let rvx = self.vx[j] - self.vx[i];
            let rvy = self.vy[j] - self.vy[i];
            let vn = rvx * ux + rvy * uy; // >0 separating
            if gap < 0.0 {
                let overlap = -gap;
                let m_eff = self.m[i] * self.m[j] / (self.m[i] + self.m[j]);
                // same stability ceiling as the squeeze film: an explicit
                // dashpot stiffer than the timestep rings instead of damping
                let c_n = C_CONTACT.min(LUBE_STABLE * m_eff / H_MAX);
                let fn_ = K_CONTACT * overlap - c_n * vn;
                let fn_ = fn_.max(0.0);
                fx -= fn_ * ux;
                fy -= fn_ * uy;
                // Coulomb-capped tangential friction
                let vtx = rvx - vn * ux;
                let vty = rvy - vn * uy;
                let vt = hypot(vtx, vty);
                if vt > 1e-7 {
                    let ft = (fric * fn_).min(c_n * 8.0 * vt);
                    fx += ft * vtx / vt;
                    fy += ft * vty / vt;
                }
            } else if gap < 0.35 * sum_r {
                // squeeze film: the oil has to get out of the way
                let r_eff = self.r[i] * self.r[j] / sum_r;
                let m_eff = self.m[i] * self.m[j] / (self.m[i] + self.m[j]);
                let c_lub = (C_LUBE * r_eff * r_eff / (gap + 0.02 * sum_r))
                    .min(LUBE_STABLE * m_eff / H_MAX);
                let flub = c_lub * vn;
                fx += flub * ux;
                fy += flub * uy;
            }

            self.fx[i] += fx;
            self.fy[i] += fy;
            self.fx[j] -= fx;
            self.fy[j] -= fy;
        }

        // --- single-bearing terms ------------------------------------------
        let v_pin = self.v_pin();
        let dep_k = (v_pin / K_LOG).powi(2);
        for i in 0..n {
            // `chain` is a knob on the polarisability itself, so it scales
            // every dipole effect coherently: chaining as chain², the
            // charge–dipole grab and dielectrophoresis as chain.
            let alpha = EPS_OIL * self.r[i].powi(3) * self.params.chain;
            // dipole for the NEXT substep, from the polarising field
            self.px[i] = alpha * self.epx[i];
            self.py[i] = alpha * self.epy[i];

            // its own charge in the total local field
            self.fx[i] += self.q[i] * self.ex[i];
            self.fy[i] += self.q[i] * self.ey[i];

            // dielectrophoresis in the applied gradient: (α/2)∇|E|², inward
            let rad = hypot(self.x[i], self.y[i]).max(R_PIN);
            let fdep = -alpha * dep_k / (rad * rad * rad);
            self.fx[i] += fdep * self.x[i] / rad;
            self.fy[i] += fdep * self.y[i] / rad;

            // image forces at the two electrodes. A conductor near a conductor
            // sees its own reflection: the induced dipole is pulled in as
            // p²/(2h)⁴ and a charged bearing as q²/(2h)². This is what makes a
            // bearing *stick* to the pin instead of merely being pushed around
            // by the applied field — and, once it has charged up, the q·E term
            // above is what eventually throws it off again.
            let px = self.px[i];
            let py = self.py[i];
            let p2 = px * px + py * py;
            let q2 = self.q[i] * self.q[i];
            let floor = IMG_FLOOR * self.r[i];
            {
                // pin: surface is inward
                let h = (rad - self.r[i] - R_PIN).max(floor);
                let two_h = 2.0 * h;
                let f = inv_eps * (q2 / (two_h * two_h) + 3.0 * p2 / two_h.powi(4));
                self.fx[i] -= f * self.x[i] / rad;
                self.fy[i] -= f * self.y[i] / rad;
            }
            {
                // cup wall: surface is outward
                let h = (R_CUP - rad - self.r[i]).max(floor);
                let two_h = 2.0 * h;
                let f = inv_eps * (q2 / (two_h * two_h) + 3.0 * p2 / two_h.powi(4));
                self.fx[i] += f * self.x[i] / rad;
                self.fy[i] += f * self.y[i] / rad;
            }

            // dish tilt
            self.fx[i] += self.m[i] * self.params.tilt.0;
            self.fy[i] += self.m[i] * self.params.tilt.1;

            // --- boundaries ---
            let (nx, ny) = (self.x[i] / rad, self.y[i] / rad);
            let out = rad + self.r[i] - R_CUP;
            if out > 0.0 {
                let vn = self.vx[i] * nx + self.vy[i] * ny;
                let fn_ = (K_CONTACT * out + C_CONTACT * vn.max(0.0)).max(0.0);
                self.fx[i] -= fn_ * nx;
                self.fy[i] -= fn_ * ny;
            }
            let inn = R_PIN + self.r[i] - rad;
            if inn > 0.0 {
                let vn = -(self.vx[i] * nx + self.vy[i] * ny);
                let fn_ = (K_CONTACT * inn + C_CONTACT * vn.max(0.0)).max(0.0);
                self.fx[i] += fn_ * nx;
                self.fy[i] += fn_ * ny;
            }
        }
    }

    /// Semi-implicit integration with the Stokes drag handled exactly — in oil
    /// the drag time constant is far shorter than the frame, so an explicit
    /// drag term would be the stiffest thing in the solver.
    fn integrate(&mut self, h: f32) {
        let mu = self.params.viscosity;
        let noise = self.params.noise;
        let mut max_speed = 0.0f32;
        for i in 0..self.n {
            let drag = 6.0 * std::f32::consts::PI * mu * self.r[i];
            let gamma = (drag / self.m[i] + ROLL_DRAG).max(1e-6);
            // backstop: a force this large means the model has been pushed
            // somewhere it does not hold, and a capped bearing is far better
            // than a NaN one
            let cap = F_CAP * self.m[i];
            let fmag = hypot(self.fx[i], self.fy[i]);
            if fmag > cap {
                let s = cap / fmag;
                self.fx[i] *= s;
                self.fy[i] *= s;
            }
            let ax = self.fx[i] / self.m[i];
            let ay = self.fy[i] / self.m[i];
            let decay = (-gamma * h).exp();
            let coeff = (1.0 - decay) / gamma;
            self.vx[i] = self.vx[i] * decay + ax * coeff;
            self.vy[i] = self.vy[i] * decay + ay * coeff;

            if noise > 0.0 {
                // thermal + convection kick, scaled so small bearings jitter more
                let k = noise * 0.06 / self.r[i].sqrt();
                self.vx[i] += k * self.rng.normal() * h.sqrt();
                self.vy[i] += k * self.rng.normal() * h.sqrt();
            }

            // never let a bearing move more than a fraction of its radius in a
            // substep — that is what would let one tunnel through a contact
            let sp = hypot(self.vx[i], self.vy[i]);
            let cap = 0.22 * self.r[i] / h;
            if sp > cap {
                let s = cap / sp;
                self.vx[i] *= s;
                self.vy[i] *= s;
            }

            self.x[i] += self.vx[i] * h;
            self.y[i] += self.vy[i] * h;
            self.roll(i, self.vx[i] * h, self.vy[i] * h);
            max_speed = max_speed.max(hypot(self.vx[i], self.vy[i]));

            // ohmic heating, so a bearing in the live path glows and cools
            let i_pin = self.gpin[i] * (self.v_pin() - self.v[i]);
            // (the pin's own potential is solved, so this sags under load too)
            let i_wall = self.gwall[i] * self.v[i];
            let carried = i_pin.abs().max(i_wall.abs());
            self.heat[i] += (carried * self.v[i].abs() * 6.0 - self.heat[i] * 1.6) * h;
            self.heat[i] = self.heat[i].clamp(0.0, 4.0);
        }
        self.stats.max_speed = max_speed;
        // hard containment, in case something extreme got past the wall spring
        for i in 0..self.n {
            let rad = hypot(self.x[i], self.y[i]);
            let lim = R_CUP - self.r[i];
            if rad > lim {
                let s = lim / rad;
                self.x[i] *= s;
                self.y[i] *= s;
                let vn = self.vx[i] * self.x[i] / rad + self.vy[i] * self.y[i] / rad;
                if vn > 0.0 {
                    self.vx[i] -= vn * self.x[i] / rad;
                    self.vy[i] -= vn * self.y[i] / rad;
                }
            }
            let lo = R_PIN + self.r[i];
            if rad < lo {
                let (nx, ny) = if rad > 1e-6 {
                    (self.x[i] / rad, self.y[i] / rad)
                } else {
                    (1.0, 0.0)
                };
                self.x[i] = nx * lo;
                self.y[i] = ny * lo;
            }
        }
    }

    /// Rolling on the dish floor: no-slip kinematics, so the visible spin of a
    /// bearing always matches how far it travelled.
    fn roll(&mut self, i: usize, dx: f32, dy: f32) {
        let dist = hypot(dx, dy);
        if dist < 1e-9 {
            return;
        }
        let angle = dist / self.r[i];
        // rotation axis is ẑ × displacement
        let (ax, ay) = (-dy / dist, dx / dist);
        let (s, c) = ((angle * 0.5).sin(), (angle * 0.5).cos());
        let dq = [ax * s, ay * s, 0.0, c];
        let q = self.quat[i];
        // q' = dq ⊗ q
        let nq = [
            dq[3] * q[0] + dq[0] * q[3] + dq[1] * q[2] - dq[2] * q[1],
            dq[3] * q[1] - dq[0] * q[2] + dq[1] * q[3] + dq[2] * q[0],
            dq[3] * q[2] + dq[0] * q[1] - dq[1] * q[0] + dq[2] * q[3],
            dq[3] * q[3] - dq[0] * q[0] - dq[1] * q[1] - dq[2] * q[2],
        ];
        let inv = 1.0 / (nq[0] * nq[0] + nq[1] * nq[1] + nq[2] * nq[2] + nq[3] * nq[3]).sqrt();
        self.quat[i] = [nq[0] * inv, nq[1] * inv, nq[2] * inv, nq[3] * inv];
    }

    /// Stir: drag the pointer through the oil.
    pub fn stir(&mut self, x: f32, y: f32, vx: f32, vy: f32, radius: f32) {
        let r2 = radius * radius;
        for i in 0..self.n {
            let dx = self.x[i] - x;
            let dy = self.y[i] - y;
            let d2 = dx * dx + dy * dy;
            if d2 < r2 {
                let w = 1.0 - (d2 / r2).sqrt();
                self.vx[i] += vx * w;
                self.vy[i] += vy * w;
            }
        }
    }

    /// Knock the cup: everything gets a random kick.
    pub fn shake(&mut self, strength: f32) {
        for i in 0..self.n {
            self.vx[i] += strength * self.rng.normal();
            self.vy[i] += strength * self.rng.normal();
            self.q[i] *= 0.5;
        }
    }

    fn collect_stats(&mut self) {
        let n = self.n;
        // What the supply actually delivers, measured across its own lead.
        let current = G_SOURCE * (self.v_supply() - self.v_pin());
        let mut overlap = 0.0;
        let mut live = 0;
        for i in 0..n {
            if self.heat[i] > 0.02 {
                live += 1;
            }
        }
        // who is wired to what: the pin is node `n`, so "wired to the pin" is
        // simply "in the pin's component"
        for i in 0..n {
            self.wired[i] = 0;
        }
        let pin_root = self.find(n);
        let mut wall_roots: Vec<usize> = Vec::new();
        for i in 0..n {
            if self.gwall[i] > 0.05 * G_CONTACT {
                let root = self.find(i);
                wall_roots.push(root);
            }
        }
        wall_roots.sort_unstable();
        wall_roots.dedup();
        let mut closed = false;
        let mut reach = 0.0f32;
        for i in 0..n {
            let root = self.find(i);
            let p = root == pin_root;
            let w = wall_roots.binary_search(&root).is_ok();
            if p {
                self.wired[i] |= 1;
                reach = reach.max(hypot(self.x[i], self.y[i]) + self.r[i]);
            }
            if w {
                self.wired[i] |= 2;
            }
            if p && w {
                closed = true;
            }
        }

        // chain census: clusters of two or more in conducting contact
        let mut sizes = std::collections::BTreeMap::new();
        for i in 0..n {
            let root = self.find(i);
            *sizes.entry(root).or_insert(0u32) += 1;
        }
        let chains = sizes.values().filter(|&&c| c > 1).count();
        let longest = sizes.values().copied().max().unwrap_or(0);

        for &(i, j, gap) in &self.links {
            if gap < 0.0 {
                overlap += -gap;
            }
            let _ = (i, j);
        }

        let mut sparks = 0.0;
        for &(i, j, gap) in &self.links {
            let (i, j) = (i as usize, j as usize);
            let dv = (self.v[i] - self.v[j]).abs();
            if gap > 0.0 && dv / gap.max(1e-5) > E_BREAKDOWN {
                sparks += 1.0;
            }
        }

        self.stats.current = current;
        self.stats.closed = if closed { 1.0 } else { 0.0 };
        self.stats.chains = chains as f32;
        self.stats.mean_overlap = overlap / self.n.max(1) as f32;
        self.stats.live_frac = live as f32 / self.n.max(1) as f32;
        self.stats.time = self.time;
        self.stats.edges = self.links.len() as f32;
        self.stats.sparks = sparks;
        self.stats.longest_chain = longest as f32;
        self.stats.power = current * self.v_pin();
        self.stats.n = self.n as f32;
        self.stats.reach = reach;
        self.stats.pin = self.v_pin();
        self.stats.supply = self.v_supply();
    }

    /// Pack what the renderer needs into one flat buffer JS can view directly.
    fn pack(&mut self) {
        let v_pin = self.v_pin().abs().max(1e-4);
        let qref = EPS_OIL * R_MAX * v_pin;
        for i in 0..self.n {
            let o = i * BALL_STRIDE;
            let b = &mut self.ball_buf[o..o + BALL_STRIDE];
            b[0] = self.x[i];
            b[1] = self.y[i];
            b[2] = self.r[i];
            b[3] = (self.q[i] / qref).clamp(-1.0, 1.0);
            b[4] = (self.v[i] / v_pin).clamp(-1.0, 1.0);
            b[5] = self.heat[i];
            b[6] = self.quat[i][0];
            b[7] = self.quat[i][1];
            b[8] = self.quat[i][2];
            b[9] = self.quat[i][3];
            b[10] = hypot(self.vx[i], self.vy[i]);
            b[11] = self.wired[i] as f32;
        }

        self.edge_buf.clear();
        let v_pin_signed = self.v_pin();
        for &(i, j, gap) in &self.links {
            let (i, j) = (i as usize, j as usize);
            let scale = self.r[i].min(self.r[j]);
            let dv = self.v[i] - self.v[j];
            let (g, spark) = self.conductance(gap, scale, dv);
            let cur = g * dv;
            if cur.abs() < 2e-4 && !spark {
                continue;
            }
            self.edge_buf.extend_from_slice(&[
                self.x[i],
                self.y[i],
                self.x[j],
                self.y[j],
                (cur / (G_CONTACT * v_pin)).clamp(-1.0, 1.0),
                if spark { 1.0 } else { 0.0 },
            ]);
        }
        // pin and wall leads, drawn the same way
        for i in 0..self.n {
            let rad = hypot(self.x[i], self.y[i]).max(1e-5);
            if self.gpin[i] > 1e-3 {
                let cur = self.gpin[i] * (v_pin_signed - self.v[i]);
                if cur.abs() > 2e-4 {
                    self.edge_buf.extend_from_slice(&[
                        self.x[i] / rad * R_PIN,
                        self.y[i] / rad * R_PIN,
                        self.x[i],
                        self.y[i],
                        (cur / (G_CONTACT * v_pin)).clamp(-1.0, 1.0),
                        0.0,
                    ]);
                }
            }
            if self.gwall[i] > 1e-3 {
                let cur = self.gwall[i] * self.v[i];
                if cur.abs() > 2e-4 {
                    self.edge_buf.extend_from_slice(&[
                        self.x[i],
                        self.y[i],
                        self.x[i] / rad * R_CUP,
                        self.y[i] / rad * R_CUP,
                        (cur / (G_CONTACT * v_pin)).clamp(-1.0, 1.0),
                        0.0,
                    ]);
                }
            }
        }

        let s = self.stats;
        self.stat_buf.copy_from_slice(&[
            s.current,
            s.closed,
            s.chains,
            s.max_speed,
            s.mean_overlap,
            s.cg_iters,
            s.cg_resid,
            s.live_frac,
            s.time,
            s.edges,
            s.sparks,
            s.longest_chain,
            s.power,
            s.n,
            s.reach,
            s.packing,
            s.pin,
            s.supply,
        ]);
    }

    pub fn ball_buf(&self) -> &[f32] {
        &self.ball_buf
    }
    pub fn edge_buf(&self) -> &[f32] {
        &self.edge_buf
    }
    pub fn stat_buf(&self) -> &[f32] {
        &self.stat_buf
    }
    pub fn edge_count(&self) -> usize {
        self.edge_buf.len() / EDGE_STRIDE
    }
    pub fn total_charge(&self) -> f32 {
        self.q.iter().sum()
    }
    pub fn kinetic_energy(&self) -> f32 {
        (0..self.n)
            .map(|i| 0.5 * self.m[i] * (self.vx[i] * self.vx[i] + self.vy[i] * self.vy[i]))
            .sum()
    }
    pub fn max_overlap(&self) -> f32 {
        let mut worst = 0.0f32;
        for i in 0..self.n {
            for j in (i + 1)..self.n {
                let d = hypot(self.x[i] - self.x[j], self.y[i] - self.y[j]);
                worst = worst.max((self.r[i] + self.r[j] - d).max(0.0) / (self.r[i] + self.r[j]));
            }
        }
        worst
    }
}

pub const STRIDES: (usize, usize, usize) = (BALL_STRIDE, EDGE_STRIDE, STAT_COUNT);
