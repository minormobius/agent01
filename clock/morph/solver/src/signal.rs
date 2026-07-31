//! Signals running through the finished structure.
//!
//! Growth says what the circuit *is*. This says what it *does*: pulses are
//! injected at the gates that read primary inputs and propagate along the
//! wires, and every gate that fires is both a flash on the canvas and a note.
//!
//! The model is leaky integrate-and-fire, one cell per neuron:
//!
//! * a firing gate delivers a fixed charge to everything it drives;
//! * charge leaks away between ticks, so inputs only add up if they arrive
//!   close together;
//! * past a threshold the cell fires, then sits out a refractory period.
//!
//! That is deliberately *not* boolean evaluation — the engine grows topology
//! and never computes a truth value. What it gives instead is a wavefront whose
//! shape is the graph's shape, which is the point: a 32-bit ripple adder has a
//! carry chain 32 gates deep and sweeps as a long arpeggio, while a Brent–Kung
//! adder computing the very same sum is 11 deep and lands almost as a chord.
//! The difference between linear and logarithmic depth stops being a claim in
//! an article and becomes something you can hear.
//!
//! Leak matters more than it looks. With no leak every cell eventually fires
//! and the whole graph saturates into white noise; with too much, nothing past
//! depth two ever reaches threshold. The window between is where a structure
//! sounds like itself.

/// Charge delivered along one wire by one firing.
const CHARGE: f32 = 0.62;
/// Ticks a cell sits out after firing. Long enough that a wave passes through
/// a region once, rather than ringing.
const REFRACTORY: f32 = 3.0;
/// How fast the visual flash fades. Purely cosmetic.
const ACT_DECAY: f32 = 0.12;
/// Firings to observe before starvation may act, so the interval estimate is
/// measured rather than guessed.
///
/// Deliberately small. A structure where most gates cannot conduct — which is
/// exactly the case starvation exists for — produces firings very slowly, and a
/// long warm-up means the control silently never arms on the one structure you
/// most wanted it on. A decaying maximum needs far fewer samples than an
/// average would.
const WARMUP_FIRINGS: u32 = 40;
/// How fast the slowest-rhythm estimate bleeds back down.
const GAP_DECAY: f32 = 0.002;

pub struct Params {
    /// Wavefronts in flight at once, once divided by [`Signals::depth_scale`].
    ///
    /// Expressed this way because a raw per-tick rate cannot be set sensibly
    /// for every structure: a wave crosses one level per tick, so the same
    /// number that gives a mux tree three levels deep a comfortable pulse
    /// floods a 78-deep triangle into a solid sheet of light. Scaling by depth
    /// makes the knob mean the same thing everywhere — around 1 gives a single
    /// wave sweeping through with darkness behind it, higher values overlap
    /// and interfere.
    pub rate: f32,
    /// Charge needed to fire, against a per-wire delivery of `CHARGE`.
    ///
    /// **Below `CHARGE` one input is enough**, and the wavefront advances
    /// exactly one level per tick — the clean sweep, and the default. Above it
    /// a gate needs two inputs arriving inside the leak window, which thins the
    /// wave sharply and, in a structure with long single-driver chains like a
    /// ripple adder's carry, stops it dead at the first link. That is worth
    /// having as a knob — it is how you get sparse, selective firing out of a
    /// dense mesh — but it is not a sensible default.
    pub threshold: f32,
    /// Fraction of charge lost per tick.
    pub leak: f32,
    /// How many of its own firing intervals a cell may miss before it starves.
    /// 0 disables it.
    ///
    /// Measured in intervals rather than ticks because a tick count cannot be
    /// set once for every structure: a cell fires about once per wave, and that
    /// wave takes 59 ticks to cross a triangle and 1 to cross a relay. A fixed
    /// limit is therefore instant death on one and a no-op on the other — the
    /// first version had a 0–300 slider whose top two thirds did nothing at all
    /// on any preset. Against the *measured* interval, 2 means the same thing
    /// everywhere: a cell that has missed two turns is not conducting any more.
    ///
    /// This is the only place the signal reaches back and changes the
    /// structure: everywhere else the graph decides what conducts, and here
    /// what conducts decides what is still part of the graph.
    pub patience: f32,
}

impl Default for Params {
    fn default() -> Params {
        Params {
            rate: 1.4,
            threshold: 0.5,
            leak: 0.30,
            patience: 0.0,
        }
    }
}

/// One gate firing, for the sonification.
#[derive(Clone, Copy)]
pub struct Firing {
    pub cell: u32,
    /// How many cells this one drives — how much of the structure it is about
    /// to wake up.
    pub fanout: u16,
}

pub struct Signals {
    pub charge: Vec<f32>,
    /// Visual activation, 1 on firing and decaying after.
    pub act: Vec<f32>,
    /// Ticks since this cell last fired. Starvation reads it.
    quiet: Vec<u32>,
    refract: Vec<f32>,
    /// Cells that fired on the previous tick, whose charge is delivered now.
    front: Vec<u32>,
    next: Vec<u32>,

    // Outgoing adjacency in CSR form, rebuilt whenever the graph changes.
    out_start: Vec<u32>,
    out_list: Vec<u32>,
    /// Active cells with nothing driving them: where pulses are injected.
    sources: Vec<u32>,

    pub params: Params,
    /// How many ticks a wave takes to cross the structure — its depth. The
    /// caller keeps this current; it turns `params.rate` from a per-tick number
    /// into "waves in flight". Left at 1 the rate is per-tick, which is what
    /// the tests want.
    pub depth_scale: f32,
    phase: f32,
    /// Firings on the last tick.
    pub firings: Vec<Firing>,
    /// The slowest rhythm in the structure: a decaying maximum of how long a
    /// cell had been quiet when it fired. Starvation is scaled by this.
    ///
    /// A maximum rather than an average, because a structure does not have one
    /// rhythm. Sources driven every tick sit alongside loop cells that come
    /// round every seventeen, and a mean is dragged down by the fast ones until
    /// the slow ones are judged against a tempo that was never theirs — which
    /// killed 336 of a relay's 378 cells at *every* setting of the control.
    /// The decay is what lets it come back down once the slow parts are gone.
    pub fire_gap: f32,
    /// Firings folded into `fire_gap` so far. Starvation waits for this,
    /// because an estimate starting at zero means a limit starting at zero,
    /// and the whole structure starves on the first tick before the measure
    /// has seen anything at all.
    gap_samples: u32,
    /// Fraction of the structure currently lit, for the drone.
    pub activity: f32,
}

impl Signals {
    pub fn new() -> Signals {
        Signals {
            charge: Vec::new(),
            act: Vec::new(),
            quiet: Vec::new(),
            refract: Vec::new(),
            front: Vec::new(),
            next: Vec::new(),
            out_start: Vec::new(),
            out_list: Vec::new(),
            sources: Vec::new(),
            params: Params::default(),
            depth_scale: 1.0,
            phase: 0.0,
            firings: Vec::new(),
            fire_gap: 0.0,
            gap_samples: 0,
            activity: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.charge.clear();
        self.act.clear();
        self.quiet.clear();
        self.refract.clear();
        self.front.clear();
        self.next.clear();
        self.sources.clear();
        self.phase = 0.0;
        self.firings.clear();
        self.fire_gap = 0.0;
        self.gap_samples = 0;
        self.activity = 0.0;
    }

    /// Rebuild adjacency after the graph changes. Cheap enough to redo whole:
    /// expansion rewires nets that existing edges already point at, so there is
    /// no incremental version worth having.
    pub fn rebuild(&mut self, n: usize, active: &[bool], edges: &[(u32, u32)]) {
        self.charge.resize(n, 0.0);
        self.act.resize(n, 0.0);
        self.quiet.resize(n, 0);
        self.refract.resize(n, 0.0);

        let mut out_deg = vec![0u32; n + 1];
        let mut in_deg = vec![0u32; n];
        for &(a, b) in edges {
            out_deg[a as usize + 1] += 1;
            in_deg[b as usize] += 1;
        }
        for i in 0..n {
            out_deg[i + 1] += out_deg[i];
        }
        self.out_start = out_deg;
        self.out_list = vec![0u32; edges.len()];
        let mut cursor = self.out_start.clone();
        for &(a, b) in edges {
            self.out_list[cursor[a as usize] as usize] = b;
            cursor[a as usize] += 1;
        }

        // A gate reading only primary inputs has nothing driving it inside the
        // graph. Those are the mouths the signal is poured into.
        self.sources.clear();
        for i in 0..n {
            if active[i] && in_deg[i] == 0 {
                self.sources.push(i as u32);
            }
        }
        self.seed_closed_loops(n, active, edges, &in_deg);
        // Cells that were expanded away must not keep glowing.
        for i in 0..n {
            if !active[i] {
                self.act[i] = 0.0;
                self.charge[i] = 0.0;
            }
        }
        self.front.retain(|&c| (c as usize) < n && active[c as usize]);
    }

    /// Give every part of the graph that has no in-degree-zero member a way in.
    ///
    /// Feedback makes closed loops possible, and a loop closed on itself has no
    /// entry at all: every member is driven by another member. Under the plain
    /// rule such a component sits dark forever however hard the driver runs. So
    /// each connected component with no source of its own gets exactly one —
    /// its lowest-numbered cell, for determinism.
    ///
    /// Deliberately *only* the source-less ones. Widening the rule (say, to any
    /// cell reading a primary input) would make every full adder in a ripple
    /// adder a source, they would all fire at once, and the carry chain that
    /// makes the thing worth listening to would stop existing.
    fn seed_closed_loops(&mut self, n: usize, active: &[bool], edges: &[(u32, u32)], in_deg: &[u32]) {
        // Weakly connected components: follow wires in both directions, because
        // what matters is reachability of *excitation*, not signal direction.
        let mut parent: Vec<u32> = (0..n as u32).collect();
        fn find(p: &mut Vec<u32>, mut x: u32) -> u32 {
            while p[x as usize] != x {
                p[x as usize] = p[p[x as usize] as usize];
                x = p[x as usize];
            }
            x
        }
        for &(a, b) in edges {
            let (ra, rb) = (find(&mut parent, a), find(&mut parent, b));
            if ra != rb {
                parent[ra as usize] = rb;
            }
        }

        let mut has_source = vec![false; n];
        for &s in &self.sources {
            let r = find(&mut parent, s) as usize;
            has_source[r] = true;
        }
        let mut seeded = vec![false; n];
        for i in 0..n {
            if !active[i] || in_deg[i] == 0 {
                continue;
            }
            let r = find(&mut parent, i as u32) as usize;
            if has_source[r] || seeded[r] {
                continue;
            }
            seeded[r] = true;
            self.sources.push(i as u32);
        }
    }

    /// Cells that have gone too long without conducting.
    ///
    /// Reported rather than acted on: what a cell *is* belongs to the graph,
    /// and the signal layer only observes.
    pub fn starved(&self, active: &[bool], out: &mut Vec<u32>) {
        out.clear();
        if self.params.patience <= 0.0 || self.gap_samples < WARMUP_FIRINGS {
            return;
        }
        // Floor of two intervals: below that a cell is being asked to die for
        // missing the turn it is currently taking.
        let period = self.fire_gap.max(2.0);
        let limit = (self.params.patience * period).max(3.0) as u32;
        for i in 0..self.quiet.len() {
            if active[i] && self.quiet[i] > limit {
                out.push(i as u32);
            }
        }
    }

    /// Give a recycled slot a clean slate. Without this a new cell inherits the
    /// silence of whatever died there and starves immediately.
    pub fn wake(&mut self, cell: usize) {
        if cell < self.quiet.len() {
            self.quiet[cell] = 0;
            self.charge[cell] = 0.0;
            self.act[cell] = 0.0;
            self.refract[cell] = 0.0;
        }
    }

    pub fn out_degree(&self, cell: usize) -> u32 {
        if cell + 1 >= self.out_start.len() {
            return 0;
        }
        self.out_start[cell + 1] - self.out_start[cell]
    }

    /// One tick of propagation. `dt` is in ticks, so the caller can run the
    /// signal slower or faster than the layout without changing its character.
    pub fn tick(&mut self, active: &[bool]) {
        let n = self.act.len();
        if n == 0 {
            return;
        }
        self.firings.clear();

        let p = &self.params;
        let (leak, threshold) = (p.leak.clamp(0.0, 1.0), p.threshold.max(0.01));

        // Bleed the slowest-rhythm estimate down, so it follows the structure
        // rather than remembering one slow moment forever.
        self.fire_gap *= 1.0 - GAP_DECAY;
        for i in 0..n {
            self.act[i] *= 1.0 - ACT_DECAY;
            if active[i] {
                self.quiet[i] = self.quiet[i].saturating_add(1);
            }
            if self.refract[i] > 0.0 {
                self.refract[i] -= 1.0;
            }
            self.charge[i] *= 1.0 - leak;
        }

        // Deliver what fired last tick.
        for &src in &self.front {
            let (s, e) = (
                self.out_start[src as usize] as usize,
                self.out_start[src as usize + 1] as usize,
            );
            for k in s..e {
                let dst = self.out_list[k] as usize;
                if active[dst] {
                    self.charge[dst] += CHARGE;
                }
            }
        }

        // Inject at the sources. `phase` carries the fractional part so a rate
        // below one pulse per tick still lands on an even cadence.
        self.phase += p.rate.clamp(0.0, 64.0) / self.depth_scale.max(1.0);
        while self.phase >= 1.0 {
            self.phase -= 1.0;
            for &s in &self.sources {
                self.charge[s as usize] += threshold;
            }
        }

        self.next.clear();
        for i in 0..n {
            if !active[i] || self.refract[i] > 0.0 || self.charge[i] < threshold {
                continue;
            }
            self.charge[i] = 0.0;
            self.refract[i] = REFRACTORY;
            self.act[i] = 1.0;
            // Learn the structure's rhythm from the structure. Slow, so that
            // cells dying cannot drag the estimate around fast enough to take
            // the rest with them.
            if self.quiet[i] > 0 {
                self.fire_gap = self.fire_gap.max(self.quiet[i] as f32);
                self.gap_samples = self.gap_samples.saturating_add(1);
            }
            self.quiet[i] = 0;
            self.next.push(i as u32);
            self.firings.push(Firing {
                cell: i as u32,
                fanout: self.out_degree(i).min(u16::MAX as u32) as u16,
            });
        }
        core::mem::swap(&mut self.front, &mut self.next);

        let live = self.act.iter().filter(|&&a| a > 0.05).count();
        let total = active.iter().filter(|&&a| a).count().max(1);
        self.activity = live as f32 / total as f32;
    }
}

impl Default for Signals {
    fn default() -> Signals {
        Signals::new()
    }
}
