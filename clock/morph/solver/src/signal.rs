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
}

impl Default for Params {
    fn default() -> Params {
        Params {
            rate: 1.4,
            threshold: 0.5,
            leak: 0.30,
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
    /// Fraction of the structure currently lit, for the drone.
    pub activity: f32,
}

impl Signals {
    pub fn new() -> Signals {
        Signals {
            charge: Vec::new(),
            act: Vec::new(),
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
            activity: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.charge.clear();
        self.act.clear();
        self.refract.clear();
        self.front.clear();
        self.next.clear();
        self.sources.clear();
        self.phase = 0.0;
        self.firings.clear();
        self.activity = 0.0;
    }

    /// Rebuild adjacency after the graph changes. Cheap enough to redo whole:
    /// expansion rewires nets that existing edges already point at, so there is
    /// no incremental version worth having.
    pub fn rebuild(&mut self, n: usize, active: &[bool], edges: &[(u32, u32)]) {
        self.charge.resize(n, 0.0);
        self.act.resize(n, 0.0);
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
        // Cells that were expanded away must not keep glowing.
        for i in 0..n {
            if !active[i] {
                self.act[i] = 0.0;
                self.charge[i] = 0.0;
            }
        }
        self.front.retain(|&c| (c as usize) < n && active[c as usize]);
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

        for i in 0..n {
            self.act[i] *= 1.0 - ACT_DECAY;
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
