//! The physics. A Clementi–Onuchic structure-based ("Gō") C-alpha model,
//! integrated with Langevin dynamics.
//!
//! Every reference geometry — bond lengths, bond angles, dihedrals, and the
//! native contact set with its per-contact equilibrium distance — is read off
//! the deposited structure. That is what makes the native state the global
//! energy minimum, and it is also the model's central honesty problem: it
//! cannot predict a fold, only reproduce one it was handed. See ../CLAUDE.md.
//!
//! Units are reduced: epsilon = 1, mass = 1, lengths in angstrom.
//!
//!   V = sum_bonds   Kr (r - r0)^2
//!     + sum_angles  Kt (theta - theta0)^2
//!     + sum_dihed   K1 [1 - cos(phi - phi0)] + K3 [1 - cos 3(phi - phi0)]
//!     + sum_native  eps [ 5 (s/r)^12 - 6 (s/r)^10 ]     (well depth eps at r = s)
//!     + sum_other   eps (sigma_nc / r)^12               (excluded volume)
//!
//! Every force in here is checked against a numerical gradient by
//! `check.rs` / the `grad` selftest. If you touch `forces()`, re-run it.

pub const KR: f32 = 100.0;
pub const KT: f32 = 20.0;
pub const K1: f32 = 1.0;
pub const K3: f32 = 0.5;
pub const SIGMA_NC: f32 = 4.0;
/// Pairs closer than this in sequence never get a pair term.
pub const MIN_SEP: usize = 3;
/// A native contact counts as "made" inside this multiple of its native
/// distance. 1.2 is the conventional choice.
pub const FORMED_FACTOR: f32 = 1.2;

// ---------------------------------------------------------------- rng
pub struct Rng(pub u64);
impl Rng {
    #[inline]
    pub fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    #[inline]
    pub fn unit(&mut self) -> f32 {
        (self.next() >> 40) as f32 * (1.0 / 16_777_216.0)
    }
    /// Irwin–Hall(4) rescaled to unit variance. Bounded tails, invisible in a
    /// thermostat, much cheaper than Box–Muller.
    #[inline]
    pub fn gauss(&mut self) -> f32 {
        (self.unit() + self.unit() + self.unit() + self.unit() - 2.0) * 1.732_050_8
    }
}

// -------------------------------------------------------------- vec3 helpers
#[inline]
fn sub(x: &[f32], i: usize, j: usize) -> [f32; 3] {
    [x[3 * j] - x[3 * i], x[3 * j + 1] - x[3 * i + 1], x[3 * j + 2] - x[3 * i + 2]]
}
#[inline]
fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
#[inline]
fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
#[inline]
fn norm(a: [f32; 3]) -> f32 {
    dot(a, a).sqrt()
}
#[inline]
fn addf(f: &mut [f32], i: usize, v: [f32; 3]) {
    f[3 * i] += v[0];
    f[3 * i + 1] += v[1];
    f[3 * i + 2] += v[2];
}

/// Parameter slots settable from JS.
pub mod param {
    pub const TEMP: u32 = 0;
    pub const GAMMA: u32 = 1;
    pub const DT: u32 = 2;
    pub const EPS: u32 = 3;
    /// Scales the whole dihedral term. Turning it down makes the chain floppier
    /// and the search less funnelled — a nice thing to be able to feel.
    pub const TORSION: u32 = 4;
}

/// Readout slots.
pub mod stat {
    pub const Q: u32 = 0;
    pub const ENERGY: u32 = 1;
    pub const E_CONTACT: u32 = 2;
    pub const RG: u32 = 3;
    pub const STEPS: u32 = 4;
    pub const KINETIC_T: u32 = 5;
    pub const FORMED: u32 = 6;
    pub const N_CONTACT: u32 = 7;
    pub const RMSD: u32 = 8;
    pub const COUNT: u32 = 9;
}

pub struct Sim {
    pub n: usize,
    pub x: Vec<f32>,
    pub v: Vec<f32>,
    pub f: Vec<f32>,
    /// Native coordinates, centred. The model's whole memory of the answer.
    pub nat: Vec<f32>,
    b0: Vec<f32>,
    t0: Vec<f32>,
    p0: Vec<f32>,
    /// (i, j, r0) for every native contact.
    pub con: Vec<(u32, u32, f32)>,
    /// n*n lookup: native r0, or 0.0 for a non-native pair.
    r0: Vec<f32>,
    /// Per contact: 1 while the contact is made.
    pub formed: Vec<u8>,
    /// Per residue: fraction of its own native contacts currently made.
    pub resq: Vec<f32>,
    ncon_res: Vec<f32>,

    pub temp: f32,
    pub gamma: f32,
    pub dt: f32,
    pub eps: f32,
    pub torsion: f32,

    pub steps: f64,
    pub e_total: f32,
    pub e_contact: f32,
    pub q: f32,
    pub rg: f32,
    pub t_inst: f32,
    pub n_formed: f32,
    /// Term mask for the gradient checker: 1 bond, 2 angle, 4 dihedral, 8 pair.
    pub mask: u32,
    pub rng: Rng,
}

impl Sim {
    pub fn new(n: usize) -> Sim {
        Sim {
            n,
            x: vec![0.0; 3 * n],
            v: vec![0.0; 3 * n],
            f: vec![0.0; 3 * n],
            nat: vec![0.0; 3 * n],
            b0: vec![0.0; n.saturating_sub(1)],
            t0: vec![0.0; n.saturating_sub(2)],
            p0: vec![0.0; n.saturating_sub(3)],
            con: Vec::new(),
            r0: vec![0.0; n * n],
            formed: Vec::new(),
            resq: vec![0.0; n],
            ncon_res: vec![0.0; n],
            temp: 0.9,
            gamma: 0.25,
            dt: 0.005,
            eps: 1.0,
            torsion: 1.0,
            steps: 0.0,
            e_total: 0.0,
            e_contact: 0.0,
            q: 0.0,
            rg: 0.0,
            t_inst: 0.0,
            n_formed: 0.0,
            mask: 15,
            rng: Rng(0x2545F491_4F6CDD1D),
        }
    }

    /// Read reference geometry and the native contact map off `self.nat`.
    /// Call once JS has written native coordinates into `nat`.
    pub fn build(&mut self, cutoff: f32) -> usize {
        let n = self.n;
        let mut c = [0.0f32; 3];
        for i in 0..n {
            for k in 0..3 {
                c[k] += self.nat[3 * i + k];
            }
        }
        for k in 0..3 {
            c[k] /= n as f32;
        }
        for i in 0..n {
            for k in 0..3 {
                self.nat[3 * i + k] -= c[k];
            }
        }

        for i in 0..n - 1 {
            self.b0[i] = norm(sub(&self.nat, i, i + 1));
        }
        for i in 0..n.saturating_sub(2) {
            self.t0[i] = angle_of(&self.nat, i, i + 1, i + 2);
        }
        for i in 0..n.saturating_sub(3) {
            self.p0[i] = dihedral_of(&self.nat, i, i + 1, i + 2, i + 3);
        }

        self.con.clear();
        self.r0.iter_mut().for_each(|e| *e = 0.0);
        self.ncon_res.iter_mut().for_each(|e| *e = 0.0);
        for i in 0..n {
            for j in (i + MIN_SEP)..n {
                let d = norm(sub(&self.nat, i, j));
                if d <= cutoff {
                    self.con.push((i as u32, j as u32, d));
                    self.r0[i * n + j] = d;
                    self.r0[j * n + i] = d;
                    self.ncon_res[i] += 1.0;
                    self.ncon_res[j] += 1.0;
                }
            }
        }
        self.formed = vec![0; self.con.len()];
        self.con.len()
    }

    /// mode 0 = self-avoiding random coil, 1 = native, 2 = extended zig-zag.
    pub fn reset(&mut self, seed: u32, mode: u32) {
        self.rng = Rng(0x9E3779B9_7F4A7C15 ^ ((seed as u64) << 1 | 1));
        self.steps = 0.0;
        self.v.iter_mut().for_each(|e| *e = 0.0);
        let n = self.n;
        match mode {
            1 => self.x.copy_from_slice(&self.nat),
            2 => {
                // Not a straight line — a perfectly straight chain has
                // degenerate angles and undefined dihedrals.
                for i in 0..n {
                    self.x[3 * i] = i as f32 * 3.5;
                    self.x[3 * i + 1] = if i % 2 == 0 { 1.4 } else { -1.4 };
                    self.x[3 * i + 2] = 0.0;
                }
            }
            _ => self.grow_coil(),
        }
        self.remove_com_motion();
        self.forces();
        self.measure();
    }

    /// Growth walk: each bead goes down at its native bond length in a random
    /// direction, best-of-24 by clearance from the beads already placed. Takes
    /// the roomiest candidate rather than looping forever on a crowded seed —
    /// the excluded-volume term pushes out any residual overlap in a few steps.
    fn grow_coil(&mut self) {
        let n = self.n;
        self.x[0] = 0.0;
        self.x[1] = 0.0;
        self.x[2] = 0.0;
        for i in 1..n {
            let b = if i - 1 < self.b0.len() && self.b0[i - 1] > 0.1 { self.b0[i - 1] } else { 3.8 };
            let mut best = [0.0f32; 3];
            let mut best_clear = -1.0f32;
            for _ in 0..24 {
                let d = self.rand_dir();
                let p = [
                    self.x[3 * (i - 1)] + d[0] * b,
                    self.x[3 * (i - 1) + 1] + d[1] * b,
                    self.x[3 * (i - 1) + 2] + d[2] * b,
                ];
                let mut clear = f32::INFINITY;
                for k in 0..i.saturating_sub(1) {
                    let dx = p[0] - self.x[3 * k];
                    let dy = p[1] - self.x[3 * k + 1];
                    let dz = p[2] - self.x[3 * k + 2];
                    clear = clear.min(dx * dx + dy * dy + dz * dz);
                }
                if clear > best_clear {
                    best_clear = clear;
                    best = p;
                }
                if clear > SIGMA_NC * SIGMA_NC * 1.4 {
                    break;
                }
            }
            self.x[3 * i] = best[0];
            self.x[3 * i + 1] = best[1];
            self.x[3 * i + 2] = best[2];
        }
    }

    fn rand_dir(&mut self) -> [f32; 3] {
        loop {
            let a = self.rng.unit() * 2.0 - 1.0;
            let b = self.rng.unit() * 2.0 - 1.0;
            let c = self.rng.unit() * 2.0 - 1.0;
            let r2 = a * a + b * b + c * c;
            if r2 > 0.02 && r2 <= 1.0 {
                let s = 1.0 / r2.sqrt();
                return [a * s, b * s, c * s];
            }
        }
    }

    /// Potential energy and forces. Writes `self.f`, returns V.
    pub fn forces(&mut self) -> f32 {
        let n = self.n;
        self.f.iter_mut().for_each(|e| *e = 0.0);
        let mut v_total = 0.0f32;

        // ---- bonds:  V = Kr (r - b0)^2
        if self.mask & 1 != 0 {
        for i in 0..n - 1 {
            let d = sub(&self.x, i, i + 1);
            let r = norm(d).max(1e-6);
            let dr = r - self.b0[i];
            v_total += KR * dr * dr;
            let c = 2.0 * KR * dr / r;
            let fv = [c * d[0], c * d[1], c * d[2]];
            addf(&mut self.f, i, fv);
            addf(&mut self.f, i + 1, [-fv[0], -fv[1], -fv[2]]);
        }
        }

        // ---- angles:  V = Kt (theta - t0)^2, vertex at j = i+1
        if self.mask & 2 != 0 {
        for i in 0..n.saturating_sub(2) {
            let (j, k) = (i + 1, i + 2);
            let rij = sub(&self.x, j, i);
            let rkj = sub(&self.x, j, k);
            let li = norm(rij).max(1e-6);
            let lk = norm(rkj).max(1e-6);
            let ct = (dot(rij, rkj) / (li * lk)).clamp(-1.0, 1.0);
            let th = ct.acos();
            let dth = th - self.t0[i];
            v_total += KT * dth * dth;
            let st = (1.0 - ct * ct).sqrt();
            if st < 1e-4 {
                continue; // linear: gradient degenerate, and KR keeps us out of here
            }
            // F_i = +(dV/dtheta / sin theta) * d(cos theta)/dx_i
            let a = 2.0 * KT * dth / st;
            let fi = [
                a * (rkj[0] / (li * lk) - ct * rij[0] / (li * li)),
                a * (rkj[1] / (li * lk) - ct * rij[1] / (li * li)),
                a * (rkj[2] / (li * lk) - ct * rij[2] / (li * li)),
            ];
            let fk = [
                a * (rij[0] / (li * lk) - ct * rkj[0] / (lk * lk)),
                a * (rij[1] / (li * lk) - ct * rkj[1] / (lk * lk)),
                a * (rij[2] / (li * lk) - ct * rkj[2] / (lk * lk)),
            ];
            addf(&mut self.f, i, fi);
            addf(&mut self.f, k, fk);
            addf(&mut self.f, j, [-fi[0] - fk[0], -fi[1] - fk[1], -fi[2] - fk[2]]);
        }
        }

        // ---- dihedrals, Blondel–Karplus force distribution
        if self.mask & 4 != 0 {
        for i in 0..n.saturating_sub(3) {
            let (j, k, l) = (i + 1, i + 2, i + 3);
            let b1 = sub(&self.x, i, j);
            let b2 = sub(&self.x, j, k);
            let b3 = sub(&self.x, k, l);
            let n1 = cross(b1, b2);
            let n2 = cross(b2, b3);
            let l1 = dot(n1, n1);
            let l2 = dot(n2, n2);
            if l1 < 1e-8 || l2 < 1e-8 {
                continue;
            }
            let lb2 = norm(b2).max(1e-6);
            let phi = (dot(cross(n1, n2), b2) / lb2).atan2(dot(n1, n2));
            let dp = phi - self.p0[i];
            let k1 = K1 * self.torsion;
            let k3 = K3 * self.torsion;
            v_total += k1 * (1.0 - dp.cos()) + k3 * (1.0 - (3.0 * dp).cos());
            let dvdphi = k1 * dp.sin() + 3.0 * k3 * (3.0 * dp).sin();
            // d(phi)/dr_i = -|b2|/|n1|^2 n1 and d(phi)/dr_l = +|b2|/|n2|^2 n2,
            // so F = -dV/dphi * d(phi)/dr picks up the opposite signs. The two
            // interior beads absorb the remainder with coefficients
            //   F_j = -(1+s) F_i + t F_l,   F_k = s F_i - (1+t) F_l
            // for s = (b1.b2)/|b2|^2, t = (b3.b2)/|b2|^2. Every sign here was
            // pinned against a numerical d(phi)/dr — do not "tidy" it.
            let ci = dvdphi * lb2 / l1;
            let cl = -dvdphi * lb2 / l2;
            let fi = [ci * n1[0], ci * n1[1], ci * n1[2]];
            let fl = [cl * n2[0], cl * n2[1], cl * n2[2]];
            let s = dot(b1, b2) / (lb2 * lb2);
            let t = dot(b3, b2) / (lb2 * lb2);
            let fj = [
                -(1.0 + s) * fi[0] + t * fl[0],
                -(1.0 + s) * fi[1] + t * fl[1],
                -(1.0 + s) * fi[2] + t * fl[2],
            ];
            let fk = [
                s * fi[0] - (1.0 + t) * fl[0],
                s * fi[1] - (1.0 + t) * fl[1],
                s * fi[2] - (1.0 + t) * fl[2],
            ];
            addf(&mut self.f, i, fi);
            addf(&mut self.f, j, fj);
            addf(&mut self.f, k, fk);
            addf(&mut self.f, l, fl);
        }
        }

        // ---- pairs
        let eps = self.eps;
        let mut v_con = 0.0f32;
        if self.mask & 8 != 0 {
        for i in 0..n {
            for j in (i + MIN_SEP)..n {
                let d = sub(&self.x, i, j);
                let r2 = dot(d, d).max(1e-6);
                let s = self.r0[i * n + j];
                let c;
                if s > 0.0 {
                    let u2 = s * s / r2;
                    let u10 = u2 * u2 * u2 * u2 * u2;
                    let u12 = u10 * u2;
                    let vv = eps * (5.0 * u12 - 6.0 * u10);
                    v_total += vv;
                    v_con += vv;
                    c = eps * 60.0 * (u12 - u10) / r2;
                } else {
                    if r2 > 400.0 {
                        continue; // (sigma/r)^12 at 20 A is ~1e-8 eps
                    }
                    let u2 = SIGMA_NC * SIGMA_NC / r2;
                    let u12 = u2 * u2 * u2 * u2 * u2 * u2;
                    v_total += eps * u12;
                    c = eps * 12.0 * u12 / r2;
                }
                let fv = [-c * d[0], -c * d[1], -c * d[2]];
                addf(&mut self.f, i, fv);
                addf(&mut self.f, j, [-fv[0], -fv[1], -fv[2]]);
            }
        }
        }
        self.e_total = v_total;
        self.e_contact = v_con;
        v_total
    }

    pub fn step(&mut self, k: u32) {
        let a = (2.0 * self.gamma * self.temp * self.dt).sqrt();
        for _ in 0..k {
            self.forces();
            for idx in 0..3 * self.n {
                let noise = a * self.rng.gauss();
                self.v[idx] += (self.f[idx] - self.gamma * self.v[idx]) * self.dt + noise;
                self.x[idx] += self.v[idx] * self.dt;
            }
            self.steps += 1.0;
        }
        self.remove_com_motion();
        self.measure();
    }

    /// Strip centre-of-mass motion *and* the displacement already accumulated.
    ///
    /// Langevin noise is applied per coordinate, so the molecule random-walks
    /// across the scene: it leaves frame, and it separates from the native ghost
    /// it is meant to be compared against. Zeroing the net velocity stops the
    /// drift from growing but does nothing about the offset already banked, so
    /// this recentres the positions as well. Both are rigid translations of the
    /// whole chain — no internal coordinate, energy, contact or RMSD changes.
    fn remove_com_motion(&mut self) {
        let n = self.n;
        let inv = 1.0 / n as f32;
        let mut mv = [0.0f32; 3];
        let mut mx = [0.0f32; 3];
        for i in 0..n {
            for k in 0..3 {
                mv[k] += self.v[3 * i + k];
                mx[k] += self.x[3 * i + k];
            }
        }
        for k in 0..3 {
            mv[k] *= inv;
            mx[k] *= inv;
        }
        for i in 0..n {
            for k in 0..3 {
                self.v[3 * i + k] -= mv[k];
                self.x[3 * i + k] -= mx[k];
            }
        }
    }

    /// Q, Rg, per-residue foldedness, formed flags, instantaneous temperature.
    pub fn measure(&mut self) {
        let n = self.n;
        self.resq.iter_mut().for_each(|e| *e = 0.0);
        let mut formed = 0usize;
        for (ci, &(i, j, r0)) in self.con.iter().enumerate() {
            let (iu, ju) = (i as usize, j as usize);
            let d = sub(&self.x, iu, ju);
            let lim = FORMED_FACTOR * r0;
            let on = dot(d, d) <= lim * lim;
            self.formed[ci] = on as u8;
            if on {
                formed += 1;
                self.resq[iu] += 1.0;
                self.resq[ju] += 1.0;
            }
        }
        for i in 0..n {
            if self.ncon_res[i] > 0.0 {
                self.resq[i] /= self.ncon_res[i];
            }
        }
        self.q = if self.con.is_empty() { 0.0 } else { formed as f32 / self.con.len() as f32 };
        self.n_formed = formed as f32;

        let mut c = [0.0f32; 3];
        for i in 0..n {
            for k in 0..3 {
                c[k] += self.x[3 * i + k];
            }
        }
        for k in 0..3 {
            c[k] /= n as f32;
        }
        let mut rg2 = 0.0f32;
        for i in 0..n {
            for k in 0..3 {
                let d = self.x[3 * i + k] - c[k];
                rg2 += d * d;
            }
        }
        self.rg = (rg2 / n as f32).sqrt();

        // <v^2> = 3 kT per unit-mass bead in 3D
        let ke: f32 = self.v.iter().map(|e| e * e).sum();
        self.t_inst = ke / (3.0 * n as f32);
    }

    pub fn stat(&self, i: u32) -> f32 {
        match i {
            stat::Q => self.q,
            stat::ENERGY => self.e_total,
            stat::E_CONTACT => self.e_contact,
            stat::RG => self.rg,
            stat::STEPS => self.steps as f32,
            stat::KINETIC_T => self.t_inst,
            stat::FORMED => self.n_formed,
            stat::N_CONTACT => self.con.len() as f32,
            stat::RMSD => self.rmsd(),
            _ => 0.0,
        }
    }

    /// C-alpha RMSD to native after optimal superposition (Kabsch).
    ///
    /// Uses the Horn/Kearsley quaternion form: RMSD^2 = (E0 - 2 lambda_max)/N,
    /// where lambda_max is the largest eigenvalue of the symmetric 4x4 key
    /// matrix K. Found by power iteration on K + cI (c chosen from the
    /// infinity norm so every eigenvalue is positive and the largest one wins),
    /// which avoids carrying an eigen-decomposition for a 4x4.
    pub fn rmsd(&self) -> f32 {
        self.kabsch().0
    }

    /// (rmsd, quaternion [w,x,y,z], live centroid). See `rmsd` for the method.
    fn kabsch(&self) -> (f32, [f64; 4], [f64; 3]) {
        let n = self.n;
        if n < 3 {
            return (0.0, [1.0, 0.0, 0.0, 0.0], [0.0; 3]);
        }
        let mut c = [0.0f64; 3];
        for i in 0..n {
            for k in 0..3 {
                c[k] += self.x[3 * i + k] as f64;
            }
        }
        for k in 0..3 {
            c[k] /= n as f64;
        }
        // correlation matrix S = sum a_i b_i^T, and E0 = sum |a|^2 + |b|^2
        let mut s = [[0.0f64; 3]; 3];
        let mut e0 = 0.0f64;
        for i in 0..n {
            let a = [
                self.x[3 * i] as f64 - c[0],
                self.x[3 * i + 1] as f64 - c[1],
                self.x[3 * i + 2] as f64 - c[2],
            ];
            let b = [self.nat[3 * i] as f64, self.nat[3 * i + 1] as f64, self.nat[3 * i + 2] as f64];
            e0 += a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + b[0] * b[0] + b[1] * b[1] + b[2] * b[2];
            for p in 0..3 {
                for q in 0..3 {
                    s[p][q] += a[p] * b[q];
                }
            }
        }
        let k = [
            [s[0][0] + s[1][1] + s[2][2], s[1][2] - s[2][1], s[2][0] - s[0][2], s[0][1] - s[1][0]],
            [s[1][2] - s[2][1], s[0][0] - s[1][1] - s[2][2], s[0][1] + s[1][0], s[2][0] + s[0][2]],
            [s[2][0] - s[0][2], s[0][1] + s[1][0], -s[0][0] + s[1][1] - s[2][2], s[1][2] + s[2][1]],
            [s[0][1] - s[1][0], s[2][0] + s[0][2], s[1][2] + s[2][1], -s[0][0] - s[1][1] + s[2][2]],
        ];
        // shift so K + cI is positive definite; c = max row abs-sum >= spectral radius
        let mut shift = 0.0f64;
        for r in k.iter() {
            shift = shift.max(r.iter().map(|e| e.abs()).sum::<f64>());
        }
        shift += 1.0;
        let mut v = [1.0f64, 0.3, -0.2, 0.1];
        let mut lam = 0.0f64;
        for _ in 0..200 {
            let mut w = [0.0f64; 4];
            for p in 0..4 {
                let mut acc = shift * v[p];
                for q in 0..4 {
                    acc += k[p][q] * v[q];
                }
                w[p] = acc;
            }
            let nrm = (w[0] * w[0] + w[1] * w[1] + w[2] * w[2] + w[3] * w[3]).sqrt();
            if nrm < 1e-300 {
                break;
            }
            for p in 0..4 {
                v[p] = w[p] / nrm;
            }
            let next = nrm - shift;
            if (next - lam).abs() < 1e-12 * next.abs().max(1.0) {
                lam = next;
                break;
            }
            lam = next;
        }
        let ms = (e0 - 2.0 * lam) / n as f64;
        let r = if ms <= 0.0 { 0.0 } else { ms.sqrt() as f32 };
        (r, v, c)
    }

    /// Column-major 4x4 mapping native coordinates onto the live chain's current
    /// position and orientation, so the ghost can be drawn optimally superposed
    /// and the live chain is seen converging *into* it rather than beside it.
    ///
    /// The rotation comes from the same eigenvector the RMSD already needs. The
    /// handedness convention of that quaternion is easy to get backwards, so
    /// rather than reason about it we build both R and its transpose, score each
    /// against the live coordinates, and keep the better — one extra pass over n
    /// beads, once a frame.
    pub fn superpose(&self, out: &mut [f32; 16]) {
        let n = self.n;
        let (_, q, c) = self.kabsch();
        let (w, x, y, z) = (q[0], q[1], q[2], q[3]);
        let r = [
            [w * w + x * x - y * y - z * z, 2.0 * (x * y - w * z), 2.0 * (x * z + w * y)],
            [2.0 * (x * y + w * z), w * w - x * x + y * y - z * z, 2.0 * (y * z - w * x)],
            [2.0 * (x * z - w * y), 2.0 * (y * z + w * x), w * w - x * x - y * y + z * z],
        ];
        let score = |m: &[[f64; 3]; 3]| -> f64 {
            let mut e = 0.0;
            for i in 0..n {
                let b = [self.nat[3 * i] as f64, self.nat[3 * i + 1] as f64, self.nat[3 * i + 2] as f64];
                for k in 0..3 {
                    let p = m[k][0] * b[0] + m[k][1] * b[1] + m[k][2] * b[2] + c[k];
                    let d = p - self.x[3 * i + k] as f64;
                    e += d * d;
                }
            }
            e
        };
        let rt = [
            [r[0][0], r[1][0], r[2][0]],
            [r[0][1], r[1][1], r[2][1]],
            [r[0][2], r[1][2], r[2][2]],
        ];
        let m = if score(&r) <= score(&rt) { r } else { rt };
        // column-major for GL
        for col in 0..3 {
            for row in 0..3 {
                out[col * 4 + row] = m[row][col] as f32;
            }
            out[col * 4 + 3] = 0.0;
        }
        out[12] = c[0] as f32;
        out[13] = c[1] as f32;
        out[14] = c[2] as f32;
        out[15] = 1.0;
    }
}

fn angle_of(x: &[f32], i: usize, j: usize, k: usize) -> f32 {
    let a = sub(x, j, i);
    let b = sub(x, j, k);
    (dot(a, b) / (norm(a) * norm(b)).max(1e-6)).clamp(-1.0, 1.0).acos()
}

fn dihedral_of(x: &[f32], i: usize, j: usize, k: usize, l: usize) -> f32 {
    let b1 = sub(x, i, j);
    let b2 = sub(x, j, k);
    let b3 = sub(x, k, l);
    let n1 = cross(b1, b2);
    let n2 = cross(b2, b3);
    (dot(cross(n1, n2), b2) / norm(b2).max(1e-6)).atan2(dot(n1, n2))
}

/// Largest relative disagreement between the analytic force and a central
/// finite difference of the potential, over every coordinate. The whole model
/// stands on this number being small.
pub fn max_grad_error(sim: &mut Sim, h: f32) -> f32 {
    sim.forces();
    let analytic = sim.f.clone();
    let mut worst = 0.0f32;
    let mut scale = 1e-3f32;
    for e in analytic.iter() {
        scale = scale.max(e.abs());
    }
    for idx in 0..3 * sim.n {
        let save = sim.x[idx];
        sim.x[idx] = save + h;
        let vp = sim.forces();
        sim.x[idx] = save - h;
        let vm = sim.forces();
        sim.x[idx] = save;
        let numeric = -(vp - vm) / (2.0 * h);
        worst = worst.max((numeric - analytic[idx]).abs() / scale);
    }
    sim.forces();
    worst
}

/// Per-term gradient report: for each energy term in isolation, the largest
/// relative disagreement between the analytic force and a central difference,
/// at two step sizes. A term whose error falls with h is truncation noise; one
/// whose error is flat (or grows) is a bug.
pub fn grad_report(sim: &mut Sim) -> [(f32, f32); 4] {
    let mut out = [(0.0f32, 0.0f32); 4];
    let saved = sim.mask;
    for (slot, bit) in [(0usize, 1u32), (1, 2), (2, 4), (3, 8)] {
        sim.mask = bit;
        out[slot] = (max_grad_error(sim, 3e-2), max_grad_error(sim, 3e-3));
    }
    sim.mask = saved;
    sim.forces();
    out
}
