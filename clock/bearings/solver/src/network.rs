//! The resistor network.
//!
//! Every bearing is a conductor, so the pile is a node graph: the live centre
//! pin (fixed at V), the grounded cup wall (fixed at 0) and one node per ball.
//! Edges are ball–ball, ball–pin and ball–wall conductances that fall off with
//! the gap. Kirchhoff on the interior nodes gives a symmetric positive-definite
//! system
//!
//! ```text
//!   (Σ_j G_ij + G_pin,i + G_wall,i + G_leak,i) V_i  −  Σ_j G_ij V_j
//!        = G_pin,i · V0  +  G_leak,i · φ_ext(x_i)
//! ```
//!
//! `G_leak` is the oil's own (tiny) conductivity, modelled as a weak tie to the
//! *applied* potential at the ball's position. It is what an isolated bearing
//! floats at, and it makes the matrix strictly diagonally dominant, so an
//! island of balls touching nothing never leaves a singular block.
//!
//! Solved with Jacobi-preconditioned conjugate gradient, warm-started from the
//! previous frame — between frames the pile barely moves, so this typically
//! converges in a handful of iterations.

pub struct Network {
    pub diag: Vec<f32>,
    pub b: Vec<f32>,
    pub edges: Vec<(u32, u32, f32)>,
    r: Vec<f32>,
    z: Vec<f32>,
    p: Vec<f32>,
    ap: Vec<f32>,
    pub iters: usize,
    pub resid: f32,
}

impl Network {
    pub fn new() -> Self {
        Network {
            diag: Vec::new(),
            b: Vec::new(),
            edges: Vec::new(),
            r: Vec::new(),
            z: Vec::new(),
            p: Vec::new(),
            ap: Vec::new(),
            iters: 0,
            resid: 0.0,
        }
    }

    pub fn begin(&mut self, n: usize) {
        self.diag.clear();
        self.diag.resize(n, 0.0);
        self.b.clear();
        self.b.resize(n, 0.0);
        self.edges.clear();
    }

    #[inline]
    pub fn add_edge(&mut self, i: usize, j: usize, g: f32) {
        self.edges.push((i as u32, j as u32, g));
        self.diag[i] += g;
        self.diag[j] += g;
    }

    /// A tie from node `i` to a terminal fixed at `v` (pin, wall, or the oil).
    #[inline]
    pub fn add_terminal(&mut self, i: usize, g: f32, v: f32) {
        self.diag[i] += g;
        self.b[i] += g * v;
    }

    /// y = A·x. Free-standing over the matrix halves so the caller can hand it
    /// two of its own fields at once.
    fn mul(diag: &[f32], edges: &[(u32, u32, f32)], x: &[f32], y: &mut [f32]) {
        for i in 0..x.len() {
            y[i] = diag[i] * x[i];
        }
        for &(i, j, g) in edges {
            let (i, j) = (i as usize, j as usize);
            y[i] -= g * x[j];
            y[j] -= g * x[i];
        }
    }

    /// Jacobi-preconditioned CG. `x` is both the warm start and the answer.
    pub fn solve(&mut self, x: &mut [f32], max_iters: usize, tol: f32) {
        let n = x.len();
        self.r.resize(n, 0.0);
        self.z.resize(n, 0.0);
        self.p.resize(n, 0.0);
        self.ap.resize(n, 0.0);

        Self::mul(&self.diag, &self.edges, x, &mut self.ap);
        let mut bnorm = 0.0f32;
        for i in 0..n {
            self.r[i] = self.b[i] - self.ap[i];
            bnorm += self.b[i] * self.b[i];
        }
        let bnorm = bnorm.sqrt().max(1e-20);

        let mut rz = 0.0f32;
        for i in 0..n {
            self.z[i] = self.r[i] / self.diag[i].max(1e-20);
            self.p[i] = self.z[i];
            rz += self.r[i] * self.z[i];
        }

        self.iters = 0;
        for _ in 0..max_iters {
            let mut rn = 0.0f32;
            for i in 0..n {
                rn += self.r[i] * self.r[i];
            }
            self.resid = rn.sqrt() / bnorm;
            if self.resid < tol {
                break;
            }
            let p = std::mem::take(&mut self.p);
            Self::mul(&self.diag, &self.edges, &p, &mut self.ap);
            let mut pap = 0.0f32;
            for i in 0..n {
                pap += p[i] * self.ap[i];
            }
            if pap.abs() < 1e-30 {
                self.p = p;
                break;
            }
            let alpha = rz / pap;
            for i in 0..n {
                x[i] += alpha * p[i];
                self.r[i] -= alpha * self.ap[i];
            }
            let mut rz_new = 0.0f32;
            for i in 0..n {
                self.z[i] = self.r[i] / self.diag[i].max(1e-20);
                rz_new += self.r[i] * self.z[i];
            }
            let beta = rz_new / rz.max(1e-30);
            self.p = p;
            for i in 0..n {
                self.p[i] = self.z[i] + beta * self.p[i];
            }
            rz = rz_new;
            self.iters += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Network;

    /// Two balls in series between a 1 V pin and ground, all conductances
    /// equal: the classic divider, 2/3 V and 1/3 V.
    #[test]
    fn series_divider() {
        let mut net = Network::new();
        net.begin(2);
        net.add_terminal(0, 1.0, 1.0); // pin -- ball0
        net.add_edge(0, 1, 1.0); // ball0 -- ball1
        net.add_terminal(1, 1.0, 0.0); // ball1 -- wall
        let mut v = vec![0.0; 2];
        net.solve(&mut v, 200, 1e-10);
        assert!((v[0] - 2.0 / 3.0).abs() < 1e-4, "{:?}", v);
        assert!((v[1] - 1.0 / 3.0).abs() < 1e-4, "{:?}", v);
    }

    /// Two equal ladders in parallel must carry half the current each, and the
    /// total must equal the series-parallel prediction.
    #[test]
    fn parallel_branches_split_current() {
        let mut net = Network::new();
        net.begin(4);
        for b in 0..2 {
            let (a, c) = (b * 2, b * 2 + 1);
            net.add_terminal(a, 2.0, 1.0);
            net.add_edge(a, c, 2.0);
            net.add_terminal(c, 2.0, 0.0);
        }
        let mut v = vec![0.0; 4];
        net.solve(&mut v, 200, 1e-10);
        // each branch: three 0.5 Ω resistors in series -> 1.5 Ω, I = 1/1.5
        let i_branch = 2.0 * (1.0 - v[0]);
        assert!((i_branch - 1.0 / 1.5).abs() < 1e-4, "{i_branch}");
        assert!((v[0] - v[2]).abs() < 1e-5);
        assert!((v[1] - 1.0 / 3.0).abs() < 1e-4, "{:?}", v);
    }

    /// A ball touching nothing floats at the local applied potential — that is
    /// what the leakage tie is for, and it keeps the matrix non-singular.
    #[test]
    fn isolated_node_floats_at_applied_potential() {
        let mut net = Network::new();
        net.begin(1);
        net.add_terminal(0, 1e-6, 0.42);
        let mut v = vec![0.0; 1];
        net.solve(&mut v, 100, 1e-10);
        assert!((v[0] - 0.42).abs() < 1e-5, "{:?}", v);
    }

    /// Warm-starting from the answer must cost zero iterations, which is the
    /// property the per-frame reuse leans on.
    #[test]
    fn warm_start_converges_immediately() {
        let mut net = Network::new();
        net.begin(2);
        net.add_terminal(0, 1.0, 1.0);
        net.add_edge(0, 1, 1.0);
        net.add_terminal(1, 1.0, 0.0);
        let mut v = vec![0.0; 2];
        net.solve(&mut v, 200, 1e-10);
        let first = net.iters;
        net.solve(&mut v, 200, 1e-10);
        assert!(first > 0);
        assert_eq!(net.iters, 0, "warm start should already satisfy the tolerance");
    }
}
