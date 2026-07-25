//! The model itself — a faithful port of the homeostatic reservoir network in
//! Falandays, Nguyen & Spivey (2021), *Is prediction nothing more than
//! multi-scale pattern completion of the future?*, Brain Research 1768:147578.
//!
//! Reference implementation: https://github.com/bfalandays/HomeostasisModel
//! (Jupyter/NumPy). This is an independent Rust port written from the paper's
//! §5 description and the notebooks' update equations; no code is copied.
//!
//! The whole point of the model is what it *lacks*: there is no teaching
//! signal, no stored sequence, no prediction unit and no error-backpropagation.
//! Every node does one thing — nudge its incoming weights so that its own
//! activation drifts toward a private target. Prediction falls out for free.

// ---------------------------------------------------------------- vocabulary

/// The seven input-at-a-position tokens. `man` and `dog` each appear twice —
/// once as subject, once as object — and crucially map to the *same* input
/// vector, so any position sensitivity the network shows is emergent rather
/// than handed to it.
pub const KEYS: [&str; 7] = [
    "man_s", "dog_s", "walks_v", "bites_v", "dog_o", "man_o", "_",
];

/// Human-facing labels for the same seven tokens.
pub const LABELS: [&str; 7] = [
    "man (subj)", "dog (subj)", "walks", "bites", "dog (obj)", "man (obj)", "␣",
];

/// Five input lines: man, dog, walks, bites, space. Note rows 0/5 and 1/4
/// collide — that collision is the experiment.
const INPUT_VEC: [[f64; 5]; 7] = [
    [1.0, 0.0, 0.0, 0.0, 0.0], // man_s
    [0.0, 1.0, 0.0, 0.0, 0.0], // dog_s
    [0.0, 0.0, 1.0, 0.0, 0.0], // walks_v
    [0.0, 0.0, 0.0, 1.0, 0.0], // bites_v
    [0.0, 1.0, 0.0, 0.0, 0.0], // dog_o  == dog_s
    [1.0, 0.0, 0.0, 0.0, 0.0], // man_o  == man_s
    [0.0, 0.0, 0.0, 0.0, 1.0], // _
];

const NO_INPUT: [f64; 5] = [0.0; 5];

/// The training grammar, as transition probabilities between the seven tokens.
/// `man` takes `walks` 75% of the time, `dog` takes `bites` 75% of the time,
/// and each verb prefers the *other* animal as its object. Sentences are
/// exactly four tokens long: subject, verb, object, space.
pub const GRAMMAR: [[f64; 7]; 7] = [
    //  man_s dog_s walks bites dog_o man_o  _
    [0.00, 0.00, 0.75, 0.25, 0.00, 0.00, 0.00], // man_s →
    [0.00, 0.00, 0.25, 0.75, 0.00, 0.00, 0.00], // dog_s →
    [0.00, 0.00, 0.00, 0.00, 0.75, 0.25, 0.00], // walks →
    [0.00, 0.00, 0.00, 0.00, 0.25, 0.75, 0.00], // bites →
    [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1.00], // dog_o →
    [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1.00], // man_o →
    [0.50, 0.50, 0.00, 0.00, 0.00, 0.00, 0.00], // _     →
];

// --------------------------------------------------------------------- rng

/// xoshiro256** with a SplitMix64 seeder. Dependency-free and identical on
/// wasm and native, so a seed in the URL bar reproduces a run exactly.
#[derive(Clone)]
pub struct Rng {
    s: [u64; 4],
    /// Cached second normal deviate from the last Box–Muller pair.
    spare: Option<f64>,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut z = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut next = || {
            z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
            let mut x = z;
            x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            x ^ (x >> 31)
        };
        Rng { s: [next(), next(), next(), next()], spare: None }
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        let r = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        r
    }

    /// Uniform in [0, 1).
    #[inline]
    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Standard normal, Box–Muller with the spare deviate kept.
    pub fn normal(&mut self) -> f64 {
        if let Some(v) = self.spare.take() {
            return v;
        }
        // u1 must be non-zero for ln.
        let mut u1 = self.uniform();
        while u1 <= f64::MIN_POSITIVE {
            u1 = self.uniform();
        }
        let u2 = self.uniform();
        let r = (-2.0 * u1.ln()).sqrt();
        let theta = std::f64::consts::TAU * u2;
        self.spare = Some(r * theta.sin());
        r * theta.cos()
    }

    /// Sample an index from a row of unnormalised weights.
    pub fn choose(&mut self, weights: &[f64; 7]) -> usize {
        let total: f64 = weights.iter().sum();
        let mut x = self.uniform() * total;
        for (i, w) in weights.iter().enumerate() {
            x -= w;
            if x < 0.0 {
                return i;
            }
        }
        // Only reachable through float slop at the very top of the range.
        weights.iter().rposition(|&w| w > 0.0).unwrap_or(0)
    }
}

// ------------------------------------------------------------------ params

#[derive(Clone, Copy)]
pub struct Params {
    /// Reservoir size. 100 in the paper.
    pub nnodes: usize,
    /// Probability that any given directed pair is wired, and that any given
    /// input line touches any given node.
    pub p_link: f64,
    /// Fraction of activation carried over each timestep — the fading memory.
    pub leak: f64,
    /// Weight learning rate.
    pub lrate_wmat: f64,
    /// Target-activation learning rate. Two orders slower than the weights, so
    /// targets drift while weights chase them.
    pub lrate_targ: f64,
    /// Floor on a node's target activation.
    pub targ_min: f64,
    /// Input strength on a wired input line.
    pub input_gain: f64,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            nnodes: 100,
            p_link: 0.1,
            leak: 0.75,
            lrate_wmat: 0.1,
            lrate_targ: 0.01,
            targ_min: 1.0,
            input_gain: 5.0,
        }
    }
}

// ------------------------------------------------------------------- model

pub struct Model {
    pub p: Params,
    pub rng: Rng,
    /// 5 × n, row-major. Entry is `input_gain` or 0.
    pub input_wmat: Vec<f64>,
    /// n × n adjacency, row-major, no self-links.
    pub link: Vec<bool>,
    /// n × n weights, row-major. Non-zero only where `link` is set.
    pub wmat: Vec<f64>,
    pub acts: Vec<f64>,
    pub spikes: Vec<f64>,
    pub targets: Vec<f64>,
    pub errors: Vec<f64>,
    /// Current position in the grammar, i.e. the token just presented.
    pub key: usize,
    /// The transition matrix training is drawn from. Defaults to `GRAMMAR`;
    /// ablations swap it to test whether the network is tracking sequential
    /// structure or merely token frequency.
    pub grammar: [[f64; 7]; 7],
    /// Scratch buffers, kept alive so the hot loop never allocates.
    scratch_acts: Vec<f64>,
    prev_spikes: Vec<f64>,
    active_neighbors: Vec<f64>,
}

impl Model {
    pub fn new(p: Params, seed: u64) -> Self {
        let n = p.nnodes;
        let mut rng = Rng::new(seed);

        let mut input_wmat = vec![0.0; 5 * n];
        for v in input_wmat.iter_mut() {
            if rng.uniform() < p.p_link {
                *v = p.input_gain;
            }
        }

        let mut link = vec![false; n * n];
        let mut wmat = vec![0.0; n * n];
        for i in 0..n {
            for j in 0..n {
                if i == j {
                    continue; // no self-connections
                }
                if rng.uniform() < p.p_link {
                    link[i * n + j] = true;
                    wmat[i * n + j] = rng.normal();
                }
            }
        }

        Model {
            input_wmat,
            link,
            wmat,
            acts: vec![0.0; n],
            spikes: vec![0.0; n],
            targets: vec![p.targ_min; n],
            errors: vec![0.0; n],
            key: 6, // start on the space token, as the notebooks do
            grammar: GRAMMAR,
            scratch_acts: vec![0.0; n],
            prev_spikes: vec![0.0; n],
            active_neighbors: vec![0.0; n],
            p,
            rng,
        }
    }

    /// Draw the next token from the grammar and advance the position.
    pub fn next_key(&mut self) -> usize {
        let row = self.grammar[self.key];
        self.key = self.rng.choose(&row);
        self.key
    }

    /// One timestep.
    ///
    /// ```text
    /// a ← leak·a + input·Win + s·W      (s is the PREVIOUS spike vector)
    /// s ← a ≥ 2·target
    /// a ← max(a − 2·target·s, 0)        (spiking nodes pay their threshold)
    /// e ← a − target
    /// ```
    pub fn step(&mut self, input: &[f64; 5]) {
        let n = self.p.nnodes;

        // Recurrent + input drive, computed against the OLD spike vector.
        for j in 0..n {
            self.scratch_acts[j] = self.acts[j] * self.p.leak;
        }
        for k in 0..5 {
            let x = input[k];
            if x == 0.0 {
                continue;
            }
            let row = &self.input_wmat[k * n..(k + 1) * n];
            for j in 0..n {
                self.scratch_acts[j] += x * row[j];
            }
        }
        for i in 0..n {
            let s = self.spikes[i];
            if s == 0.0 {
                continue; // the reservoir is sparse; skip silent presynapses
            }
            let row = &self.wmat[i * n..(i + 1) * n];
            for j in 0..n {
                self.scratch_acts[j] += s * row[j];
            }
        }

        // Threshold, fire, subtract, floor, and read off the homeostatic error.
        for j in 0..n {
            let a = self.scratch_acts[j];
            let thr = self.targets[j] * 2.0;
            let mut a = if a >= thr {
                self.spikes[j] = 1.0;
                a - thr
            } else {
                self.spikes[j] = 0.0;
                a
            };
            if a < 0.0 {
                a = 0.0;
            }
            self.acts[j] = a;
            self.errors[j] = a - self.targets[j];
        }
    }

    /// The learning rule. Every node that fired on the *previous* step shares
    /// the blame for how far each of its postsynaptic partners now sits from
    /// its target — the error is split evenly across the presynaptic partners
    /// that were actually active, so a node with many active inputs moves each
    /// of them less. Targets themselves drift toward realised activation.
    ///
    /// `prev` is the spike vector from before the step that produced
    /// `self.errors`.
    pub fn learn(&mut self, prev: &[f64]) {
        let n = self.p.nnodes;

        for v in self.active_neighbors.iter_mut() {
            *v = 0.0;
        }
        for i in 0..n {
            if prev[i] <= 0.0 {
                continue;
            }
            let row = &self.link[i * n..(i + 1) * n];
            for j in 0..n {
                if row[j] {
                    self.active_neighbors[j] += 1.0;
                }
            }
        }

        for i in 0..n {
            if prev[i] <= 0.0 {
                continue;
            }
            let base = i * n;
            for j in 0..n {
                if !self.link[base + j] {
                    continue;
                }
                let share = self.active_neighbors[j];
                if share <= 0.0 {
                    continue; // 0/0 in the original; NumPy's nan_to_num makes it 0
                }
                self.wmat[base + j] -= self.errors[j] * self.p.lrate_wmat / share;
            }
        }

        for j in 0..n {
            let t = self.targets[j] + self.errors[j] * self.p.lrate_targ;
            self.targets[j] = if t < self.p.targ_min { self.p.targ_min } else { t };
        }
    }

    /// Present one token and learn from it. Returns the token presented.
    pub fn advance(&mut self) -> usize {
        let key = self.next_key();
        self.present(&INPUT_VEC[key], true);
        key
    }

    /// Present an arbitrary input vector, optionally learning from the result.
    pub fn present(&mut self, input: &[f64; 5], learn: bool) {
        self.prev_spikes.copy_from_slice(&self.spikes);
        self.step(input);
        if learn {
            let prev = std::mem::take(&mut self.prev_spikes);
            self.learn(&prev);
            self.prev_spikes = prev;
        }
    }

    /// Present the token at `key`.
    pub fn present_key(&mut self, key: usize, learn: bool) {
        self.present(&INPUT_VEC[key], learn);
    }

    /// Present silence — the manoeuvre the whole paper turns on.
    pub fn present_silence(&mut self, learn: bool) {
        self.present(&NO_INPUT, learn);
    }

    pub fn mean_error(&self) -> f64 {
        self.errors.iter().sum::<f64>() / self.errors.len() as f64
    }

    pub fn mean_abs_error(&self) -> f64 {
        self.errors.iter().map(|e| e.abs()).sum::<f64>() / self.errors.len() as f64
    }

    pub fn spike_count(&self) -> usize {
        self.spikes.iter().filter(|&&s| s > 0.0).count()
    }

    pub fn mean_activation(&self) -> f64 {
        self.acts.iter().sum::<f64>() / self.acts.len() as f64
    }
}

// ------------------------------------------------------------------- stats

/// Pearson correlation. Returns `None` for a constant vector, where the
/// coefficient is undefined — NumPy yields NaN and a warning there.
pub fn pearson(a: &[f64], b: &[f64]) -> Option<f64> {
    let n = a.len() as f64;
    let ma = a.iter().sum::<f64>() / n;
    let mb = b.iter().sum::<f64>() / n;
    let (mut num, mut da, mut db) = (0.0, 0.0, 0.0);
    for k in 0..a.len() {
        let (x, y) = (a[k] - ma, b[k] - mb);
        num += x * y;
        da += x * x;
        db += y * y;
    }
    if da <= 0.0 || db <= 0.0 {
        return None;
    }
    Some(num / (da * db).sqrt())
}

/// Round to two decimals, matching the `np.around(..., 2)` the notebooks apply
/// to every correlation before averaging.
#[inline]
pub fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

// ---------------------------------------------------------------- training

/// Spike patterns recorded over the tail of training, tagged by which token
/// was on the input lines at the time. This is the network's own record of
/// "what does `walks`-in-verb-position look like in here" — and it is built by
/// the observer, not by the network.
pub struct Recording {
    pub spikes: Vec<Vec<f64>>,
    pub acts: Vec<Vec<f64>>,
    pub stream: Vec<usize>,
    pub mean_errors: Vec<f64>,
    pub mean_acts: Vec<f64>,
    pub spike_counts: Vec<usize>,
}

impl Recording {
    pub fn empty() -> Self {
        Recording {
            spikes: Vec::new(),
            acts: Vec::new(),
            stream: Vec::new(),
            mean_errors: Vec::new(),
            mean_acts: Vec::new(),
            spike_counts: Vec::new(),
        }
    }

    pub fn push_from(&mut self, m: &Model, key: usize) {
        self.spikes.push(m.spikes.clone());
        self.acts.push(m.acts.clone());
        self.stream.push(key);
        self.mean_errors.push(m.mean_error());
        self.mean_acts.push(m.mean_activation());
        self.spike_counts.push(m.spike_count());
    }

    /// Drop everything but the most recent `keep` timesteps.
    pub fn truncate_to_last(&mut self, keep: usize) {
        let len = self.spikes.len();
        if len <= keep {
            return;
        }
        let drop = len - keep;
        self.spikes.drain(0..drop);
        self.acts.drain(0..drop);
        self.stream.drain(0..drop);
        self.mean_errors.drain(0..drop);
        self.mean_acts.drain(0..drop);
        self.spike_counts.drain(0..drop);
    }

    /// Mean of the per-instance correlations between `pattern` and every
    /// recorded instance of `key`. `None` when the token never occurred.
    pub fn mean_corr_with(&self, key: usize, pattern: &[f64]) -> Option<f64> {
        let mut sum = 0.0;
        let mut count = 0usize;
        for (idx, &k) in self.stream.iter().enumerate() {
            if k != key {
                continue;
            }
            if let Some(c) = pearson(&self.spikes[idx], pattern) {
                sum += round2(c);
                count += 1;
            }
        }
        if count == 0 {
            None
        } else {
            Some(sum / count as f64)
        }
    }

    /// Mean pairwise correlation among all recorded instances of `key` — the
    /// paper's population-code consistency measure.
    pub fn population_code_strength(&self, key: usize) -> Option<f64> {
        let rows: Vec<&Vec<f64>> = self
            .stream
            .iter()
            .enumerate()
            .filter(|(_, &k)| k == key)
            .map(|(i, _)| &self.spikes[i])
            .collect();
        if rows.len() < 2 {
            return None;
        }
        let mut sum = 0.0;
        let mut count = 0usize;
        for i in 0..rows.len() {
            for j in (i + 1)..rows.len() {
                if let Some(c) = pearson(rows[i], rows[j]) {
                    sum += c;
                    count += 1;
                }
            }
        }
        if count == 0 {
            None
        } else {
            Some(sum / count as f64)
        }
    }
}

/// Train for `loops` four-token sentences, recording the last `record_last`
/// sentences' worth of timesteps.
pub fn train(m: &mut Model, loops: usize, record_last: usize) -> Recording {
    let mut rec = Recording::empty();
    let record_from = loops.saturating_sub(record_last);
    for i in 0..loops {
        for _ in 0..4 {
            let key = m.advance();
            if i >= record_from {
                rec.push_from(m, key);
            }
        }
    }
    rec
}

// ------------------------------------------------------- the fading-memory test

/// One row of the paper's Table 2: a prompt of one or two tokens, then silence.
pub struct FadingMemoryTest {
    pub first: usize,
    pub second: Option<usize>,
}

impl FadingMemoryTest {
    pub fn label(&self) -> String {
        match self.second {
            None => format!("[{}]", LABELS[self.first]),
            Some(s) => format!("[{}, {}]", LABELS[self.first], LABELS[s]),
        }
    }
}

/// The six tests of the paper's Table 2, in the notebook's order — which
/// matters, because target drift carries across tests there.
pub fn table2_tests() -> Vec<FadingMemoryTest> {
    let mut v = Vec::new();
    for &first in &[0usize, 1] {
        for &second in &[None, Some(2usize), Some(3usize)] {
            v.push(FadingMemoryTest { first, second });
        }
    }
    v
}

/// Run one fading-memory probe against a trained model and return the spike
/// pattern the reservoir produces once input is cut off.
///
/// Restores weights and state to the end of training first, exactly as the
/// notebooks do — note that `targets` deliberately is *not* restored, since
/// the reference implementation lets it carry across probes.
pub fn probe(
    m: &mut Model,
    test: &FadingMemoryTest,
    end_state: &(Vec<f64>, Vec<f64>, Vec<f64>),
) -> Vec<f64> {
    let (end_wmat, end_acts, end_spikes) = end_state;
    m.wmat.copy_from_slice(end_wmat);
    m.acts.copy_from_slice(end_acts);
    m.spikes.copy_from_slice(end_spikes);

    m.present_key(test.first, true);
    if let Some(second) = test.second {
        m.present_key(second, true);
    }
    m.present_silence(false);
    m.spikes.clone()
}

/// Snapshot the weights and state at the end of training.
pub fn snapshot(m: &Model) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    (m.wmat.clone(), m.acts.clone(), m.spikes.clone())
}

/// A full single run: build, train, probe. Returns the six-by-seven grid of
/// mean correlations plus the per-token population-code strengths.
pub struct RunResult {
    /// `[test][token]` — mean correlation of the fading-memory pattern with
    /// recorded instances of each token. NaN where a token never occurred.
    pub corr: Vec<[f64; 7]>,
    pub popcodes: [f64; 7],
    pub final_mean_error: f64,
}

// ------------------------------------------------------------ the surprise test

/// Mean activation along a token sequence, averaged over independently trained
/// networks, against the band the networks settle into during training.
///
/// The paper's §5.5. One network's response to one token is mostly noise — the
/// violation effect is about one standard deviation for a single bad token —
/// so this has to be averaged over runs to be visible at all.
pub struct SurpriseProfile {
    pub baseline_mean: f64,
    pub baseline_sd: f64,
    /// Mean activation at each step of the sequence.
    pub acts: Vec<f64>,
    /// Mean spike count at each step.
    pub spikes: Vec<f64>,
}

pub fn surprise_profile(
    p: Params,
    seq: &[usize],
    runs: usize,
    seed_base: u64,
    loops: usize,
) -> SurpriseProfile {
    let mut acts = vec![0.0; seq.len()];
    let mut spikes = vec![0.0; seq.len()];
    let mut base_mean = 0.0;
    let mut base_sd = 0.0;

    for run in 0..runs {
        let mut m = Model::new(p, seed_base ^ run as u64);
        let rec = train(&mut m, loops, 100);
        let end = snapshot(&m);

        let n = rec.mean_acts.len() as f64;
        let mean = rec.mean_acts.iter().sum::<f64>() / n;
        let var = rec.mean_acts.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / n;
        base_mean += mean;
        base_sd += var.sqrt();

        // Rewind to the end of training, then walk the sequence.
        m.wmat.copy_from_slice(&end.0);
        m.acts.copy_from_slice(&end.1);
        m.spikes.copy_from_slice(&end.2);
        for (t, &k) in seq.iter().enumerate() {
            m.present_key(k, true);
            acts[t] += m.mean_activation();
            spikes[t] += m.spike_count() as f64;
        }
    }

    let r = runs.max(1) as f64;
    SurpriseProfile {
        baseline_mean: base_mean / r,
        baseline_sd: base_sd / r,
        acts: acts.into_iter().map(|v| v / r).collect(),
        spikes: spikes.into_iter().map(|v| v / r).collect(),
    }
}

pub fn run_once(p: Params, seed: u64, loops: usize, record_last: usize) -> RunResult {
    let mut m = Model::new(p, seed);
    let rec = train(&mut m, loops, record_last);
    let end = snapshot(&m);

    let mut corr = Vec::new();
    for test in table2_tests() {
        let pattern = probe(&mut m, &test, &end);
        let mut row = [f64::NAN; 7];
        for k in 0..7 {
            if let Some(c) = rec.mean_corr_with(k, &pattern) {
                row[k] = c;
            }
        }
        corr.push(row);
    }

    let mut popcodes = [f64::NAN; 7];
    for k in 0..7 {
        if let Some(c) = rec.population_code_strength(k) {
            popcodes[k] = c;
        }
    }

    let final_mean_error =
        rec.mean_errors.last().copied().unwrap_or(f64::NAN);

    RunResult { corr, popcodes, final_mean_error }
}
