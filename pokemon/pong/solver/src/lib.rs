//! D2Q9 lattice Boltzmann, flow past a rotating cylinder.
//!
//! This is the thing that makes a spinning ball curve. A ball flying through
//! air does not "have" a lift coefficient; it has a boundary layer, and the
//! surface rotation drags that boundary layer further round one side than the
//! other, so the two separation points sit at different angles and the wake
//! leaves at a slant. The reaction to that slanted wake is the Magnus force.
//! Nothing in this file knows about Magnus. It solves the flow and measures
//! the momentum the fluid hands to the cylinder; the sideways part of that is
//! the lift, and it comes out on its own or it does not.
//!
//! Method: single-relaxation-time BGK is unusable here — at the Reynolds
//! number we want the relaxation time sits close to 1/2, where BGK's bounce-
//! back wall drifts away from the place you put it by an amount that depends
//! on viscosity, which is exactly the error that would corrupt a lift
//! measurement. So this is TRT (Ginzburg): the populations are split into
//! symmetric and antisymmetric parts and relaxed at two rates whose product is
//! held at the "magic" value 3/16, which pins the bounce-back wall halfway
//! between the nodes independently of viscosity.
//!
//! The wall is a moving wall (Ladd), and the force on it is measured by
//! momentum exchange: every population that crosses a boundary link carries
//! momentum, and what does not come back out went into the cylinder.
//!
//! No allocator tricks, no wasm-bindgen. Raw `extern "C"` and a shared linear
//! memory, like clock/bearings.

const Q: usize = 9;

// D2Q9 lattice. 0 is rest, 1-4 the axial links, 5-8 the diagonals.
const CX: [f32; Q] = [0.0, 1.0, 0.0, -1.0, 0.0, 1.0, -1.0, -1.0, 1.0];
const CY: [f32; Q] = [0.0, 0.0, 1.0, 0.0, -1.0, 1.0, 1.0, -1.0, -1.0];
const CXI: [i32; Q] = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const CYI: [i32; Q] = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W: [f32; Q] = [
    4.0 / 9.0,
    1.0 / 9.0,
    1.0 / 9.0,
    1.0 / 9.0,
    1.0 / 9.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
];
const OPP: [usize; Q] = [0, 3, 4, 1, 2, 7, 8, 5, 6];

/// Ginzburg's magic parameter. (tau_plus - 1/2)(tau_minus - 1/2) = LAMBDA puts
/// the bounce-back wall exactly halfway between the fluid and solid node
/// regardless of viscosity. Without this the effective cylinder radius is a
/// function of Reynolds number and every coefficient below is contaminated.
const LAMBDA: f32 = 3.0 / 16.0;

pub struct Sim {
    pub nx: usize,
    pub ny: usize,
    pub cx: f32,
    pub cy: f32,
    pub radius: f32,
    pub u0: f32,
    tau_p: f32,
    tau_m: f32,
    f: Vec<f32>,
    g: Vec<f32>,
    solid: Vec<u8>,
    /// Surface speed of the cylinder divided by the free-stream speed.
    /// Positive spins the top surface downstream, which is the sign that
    /// produces positive (+y) lift.
    alpha: f32,
    // Instantaneous and accumulated coefficients.
    cl: f32,
    cd: f32,
    sum_cl: f64,
    sum_cl2: f64,
    sum_cd: f64,
    n_samples: u32,
    field: Vec<f32>,
    steps: u64,
}

#[inline(always)]
fn feq(i: usize, rho: f32, ux: f32, uy: f32, usq: f32) -> f32 {
    let cu = CX[i] * ux + CY[i] * uy;
    W[i] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * usq)
}

impl Sim {
    /// `re` is built on the cylinder *diameter* and the free-stream speed,
    /// which is the convention every published rotating-cylinder result uses.
    pub fn new(nx: usize, ny: usize, cx: f32, cy: f32, radius: f32, u0: f32, re: f32) -> Sim {
        let n = nx * ny;
        let nu = u0 * (2.0 * radius) / re;
        let tau_p = 3.0 * nu + 0.5;
        let tau_m = 0.5 + LAMBDA / (tau_p - 0.5);

        let mut solid = vec![0u8; n];
        for y in 0..ny {
            for x in 0..nx {
                let dx = x as f32 - cx;
                let dy = y as f32 - cy;
                if dx * dx + dy * dy <= radius * radius {
                    solid[y * nx + x] = 1;
                }
            }
        }

        let mut sim = Sim {
            nx,
            ny,
            cx,
            cy,
            radius,
            u0,
            tau_p,
            tau_m,
            f: vec![0.0; n * Q],
            g: vec![0.0; n * Q],
            solid,
            alpha: 0.0,
            cl: 0.0,
            cd: 0.0,
            sum_cl: 0.0,
            sum_cl2: 0.0,
            sum_cd: 0.0,
            n_samples: 0,
            field: vec![0.0; n],
            steps: 0,
        };
        sim.reset_flow();
        sim
    }

    /// Uniform free stream everywhere, cylinder included (the solid nodes are
    /// never read, but leaving them as garbage makes the field buffer ugly),
    /// plus a small transverse ripple.
    ///
    /// The ripple is not decoration. A Karman street is an *instability* of a
    /// perfectly symmetric flow, so starting from a perfectly symmetric initial
    /// condition on a lattice that is itself symmetric leaves nothing for the
    /// instability to amplify except round-off, and the wake sits there being
    /// wrong for tens of thousands of steps. Seeding it costs three lines and
    /// saves most of the transient. It decays, and the check that it decayed is
    /// that the mean lift at zero spin comes back to zero.
    pub fn reset_flow(&mut self) {
        let n = self.nx * self.ny;
        for idx in 0..n {
            let x = (idx % self.nx) as f32 / self.nx as f32;
            let y = (idx / self.nx) as f32 / self.ny as f32;
            let uy = 0.05 * self.u0 * x * (9.42 * y).sin();
            let usq = self.u0 * self.u0 + uy * uy;
            for i in 0..Q {
                self.f[i * n + idx] = feq(i, 1.0, self.u0, uy, usq);
            }
        }
        self.g.copy_from_slice(&self.f);
        self.steps = 0;
        self.reset_stats();
    }

    pub fn reset_stats(&mut self) {
        self.sum_cl = 0.0;
        self.sum_cl2 = 0.0;
        self.sum_cd = 0.0;
        self.n_samples = 0;
    }

    pub fn set_alpha(&mut self, a: f32) {
        self.alpha = a;
    }

    pub fn step(&mut self) {
        let nx = self.nx;
        let ny = self.ny;
        let n = nx * ny;
        let omega_p = 1.0 / self.tau_p;
        let omega_m = 1.0 / self.tau_m;
        let cx0 = self.cx;
        let cy0 = self.cy;
        // Surface speed. alpha > 0 drags the top surface downstream, which is
        // the sign that produces +y lift.
        let spin = -self.alpha * self.u0 / self.radius; // clockwise for positive alpha
        let mut fx = 0.0f64;
        let mut fy = 0.0f64;

        let mut offs = [0isize; Q];
        for j in 0..Q {
            offs[j] = (CYI[j] * nx as i32 + CXI[j]) as isize;
        }

        // --- fused pull-stream + bounce-back + momentum exchange + collide ---
        // `f` holds post-collision populations. Each fluid node gathers the
        // nine populations arriving at it, collides them, and writes the result
        // to `g`. Fusing the two passes halves the memory traffic, which is all
        // this loop is: a separate collide and stream ran at 14 Mlups.
        //
        // The one-cell frame is skipped. It is rewritten wholesale by the far
        // field at the end of the step, so streaming into it is wasted work and
        // would need bounds checks the interior does not.
        {
            let Sim { f, g, solid, .. } = self;
            for y in 1..ny - 1 {
                for x in 1..nx - 1 {
                    let idx = y * nx + x;
                    // Safety throughout: 1 <= x < nx-1 and 1 <= y < ny-1, every
                    // lattice offset is at most one cell, so idx +- off is
                    // inside [0, n), and i * n + idx is inside [0, n * Q).
                    unsafe {
                        if *solid.get_unchecked(idx) != 0 {
                            continue;
                        }
                        let mut fi = [0.0f32; Q];
                        for j in 0..Q {
                            let src = (idx as isize - offs[j]) as usize;
                            if *solid.get_unchecked(src) == 0 {
                                fi[j] = *f.get_unchecked(j * n + src);
                                continue;
                            }
                            // Halfway bounce-back off a moving wall (Ladd). The
                            // wall sits at the midpoint of the link, and its
                            // velocity there is omega z-hat x r.
                            let post = *f.get_unchecked(OPP[j] * n + idx);
                            let rx = x as f32 - 0.5 * CX[j] - cx0;
                            let ry = y as f32 - 0.5 * CY[j] - cy0;
                            let cu = CX[j] * (-spin * ry) + CY[j] * (spin * rx);
                            let bounced = post + 6.0 * W[j] * cu;
                            fi[j] = bounced;
                            // Momentum handed to the cylinder along this link:
                            // c_in * (f_in + f_out), with c_in = -c_j.
                            fx -= (CX[j] * (post + bounced)) as f64;
                            fy -= (CY[j] * (post + bounced)) as f64;
                        }

                        let mut rho = 0.0;
                        let mut mx = 0.0;
                        let mut my = 0.0;
                        for j in 0..Q {
                            rho += fi[j];
                            mx += CX[j] * fi[j];
                            my += CY[j] * fi[j];
                        }
                        let ux = mx / rho;
                        let uy = my / rho;
                        let usq = ux * ux + uy * uy;

                        let mut eq = [0.0f32; Q];
                        for j in 0..Q {
                            eq[j] = feq(j, rho, ux, uy, usq);
                        }
                        // TRT: even part at omega_p, odd part at omega_m.
                        for j in 0..Q {
                            let o = OPP[j];
                            let fp = 0.5 * (fi[j] + fi[o]);
                            let fm = 0.5 * (fi[j] - fi[o]);
                            let ep = 0.5 * (eq[j] + eq[o]);
                            let em = 0.5 * (eq[j] - eq[o]);
                            *g.get_unchecked_mut(j * n + idx) =
                                fi[j] - omega_p * (fp - ep) - omega_m * (fm - em);
                        }
                    }
                }
            }
        }

        core::mem::swap(&mut self.f, &mut self.g);

        // --- far field ---
        // Guo's non-equilibrium extrapolation on all four edges. The obvious
        // thing — write the equilibrium for the free stream straight into the
        // inlet column — is what the first version did, and it detonated at
        // x=1 after about 650 steps every time: an equilibrium node carries no
        // non-equilibrium part at all, so the strain rate has a step
        // discontinuity one cell in, and TRT relaxes its odd modes far too
        // weakly at this viscosity to damp what that injects. Copying the
        // neighbour's non-equilibrium part costs a few lines and removes it.
        //
        // The inlet and outlet columns own the four corners outright. Letting
        // both the column pass and the row pass write a corner made each one's
        // answer depend on the other's, and the seam that produced was where
        // every blow-up started.
        let u0 = self.u0;
        for x in 1..nx - 1 {
            self.extrapolate(x, nx + x, Some((u0, 0.0)), None);
            self.extrapolate((ny - 1) * nx + x, (ny - 2) * nx + x, Some((u0, 0.0)), None);
        }
        for y in 0..ny {
            self.extrapolate(y * nx, y * nx + 1, Some((u0, 0.0)), None);
            self.extrapolate(y * nx + nx - 1, y * nx + nx - 2, None, Some(1.0));
        }

        // Coefficients, normalised the standard way: F / (1/2 rho u0^2 D).
        let denom = (0.5 * self.u0 * self.u0 * 2.0 * self.radius) as f64;
        self.cd = (fx / denom) as f32;
        self.cl = (fy / denom) as f32;
        self.sum_cd += self.cd as f64;
        self.sum_cl += self.cl as f64;
        self.sum_cl2 += (self.cl as f64) * (self.cl as f64);
        self.n_samples += 1;
        self.steps += 1;
    }

    pub fn run(&mut self, n: u32) {
        for _ in 0..n {
            self.step();
        }
    }

    pub fn cl(&self) -> f32 {
        self.cl
    }
    pub fn cd(&self) -> f32 {
        self.cd
    }
    pub fn cl_mean(&self) -> f32 {
        if self.n_samples == 0 {
            0.0
        } else {
            (self.sum_cl / self.n_samples as f64) as f32
        }
    }
    pub fn cd_mean(&self) -> f32 {
        if self.n_samples == 0 {
            0.0
        } else {
            (self.sum_cd / self.n_samples as f64) as f32
        }
    }
    /// Fluctuation of the lift about its own mean. This is the shedding
    /// signal: a Karman street swings the lift back and forth every cycle, and
    /// when rotation suppresses the shedding it falls to nothing.
    pub fn cl_rms(&self) -> f32 {
        if self.n_samples == 0 {
            return 0.0;
        }
        let n = self.n_samples as f64;
        let m = self.sum_cl / n;
        let v = (self.sum_cl2 / n) - m * m;
        (if v > 0.0 { v.sqrt() } else { 0.0 }) as f32
    }
    pub fn samples(&self) -> u32 {
        self.n_samples
    }
    pub fn steps(&self) -> u64 {
        self.steps
    }

    /// Fill the field buffer for drawing. mode 0 = vorticity, 1 = speed.
    pub fn paint(&mut self, mode: u32) {
        let nx = self.nx;
        let ny = self.ny;
        let n = nx * ny;
        for y in 0..ny {
            for x in 0..nx {
                let idx = y * nx + x;
                if self.solid[idx] != 0 {
                    self.field[idx] = f32::NAN;
                    continue;
                }
                if mode == 0 {
                    if x == 0 || y == 0 || x == nx - 1 || y == ny - 1 {
                        self.field[idx] = 0.0;
                        continue;
                    }
                    // dv/dx - du/dy. Solid neighbours are left at whatever the
                    // halfway wall gives, which is close enough to draw.
                    let (_, v_xp) = self.vel(idx + 1);
                    let (_, v_xm) = self.vel(idx - 1);
                    let (u_yp, _) = self.vel(idx + nx);
                    let (u_ym, _) = self.vel(idx - nx);
                    self.field[idx] = 0.5 * (v_xp - v_xm) - 0.5 * (u_yp - u_ym);
                } else {
                    let (ux, uy) = self.vel(idx);
                    self.field[idx] = (ux * ux + uy * uy).sqrt();
                }
            }
        }
        let _ = n;
    }

    /// Guo non-equilibrium extrapolation: give `dst` the equilibrium of the
    /// prescribed state plus the *non-equilibrium* part of its interior
    /// neighbour `src`. Whichever of velocity and density is not prescribed is
    /// taken from the neighbour, which is what makes this a velocity inlet in
    /// one direction and a pressure outlet in the other.
    fn extrapolate(
        &mut self,
        dst: usize,
        src: usize,
        u_set: Option<(f32, f32)>,
        rho_set: Option<f32>,
    ) {
        let n = self.nx * self.ny;
        let mut rho_s = 0.0;
        let mut mx = 0.0;
        let mut my = 0.0;
        for i in 0..Q {
            let v = self.f[i * n + src];
            rho_s += v;
            mx += CX[i] * v;
            my += CY[i] * v;
        }
        if !(rho_s > 0.0) {
            return;
        }
        let (usx, usy) = (mx / rho_s, my / rho_s);
        let (utx, uty) = u_set.unwrap_or((usx, usy));
        let rho_t = rho_set.unwrap_or(rho_s);
        let sq_s = usx * usx + usy * usy;
        let sq_t = utx * utx + uty * uty;
        for i in 0..Q {
            let neq = self.f[i * n + src] - feq(i, rho_s, usx, usy, sq_s);
            self.f[i * n + dst] = feq(i, rho_t, utx, uty, sq_t) + neq;
        }
    }

    #[inline]
    fn vel(&self, idx: usize) -> (f32, f32) {
        let n = self.nx * self.ny;
        let mut rho = 0.0;
        let mut mx = 0.0;
        let mut my = 0.0;
        for i in 0..Q {
            let v = self.f[i * n + idx];
            rho += v;
            mx += CX[i] * v;
            my += CY[i] * v;
        }
        if rho <= 0.0 {
            (0.0, 0.0)
        } else {
            (mx / rho, my / rho)
        }
    }

    pub fn field(&self) -> &[f32] {
        &self.field
    }
}

// ---------------------------------------------------------------------------
// wasm ABI. One global sim; the page runs a small grid live and the sweep runs
// a big one. Raw pointers into linear memory, no glue library.
// ---------------------------------------------------------------------------

static mut SIM: Option<Sim> = None;

#[inline]
#[allow(static_mut_refs)]
fn sim() -> &'static mut Sim {
    unsafe { SIM.as_mut().expect("init() first") }
}

#[no_mangle]
pub extern "C" fn init(nx: u32, ny: u32, radius: f32, u0: f32, re: f32) {
    // The cylinder sits a quarter of the way in, leaving three quarters of the
    // box for the wake.
    let cx = nx as f32 * 0.25;
    let cy = ny as f32 * 0.5;
    unsafe {
        SIM = Some(Sim::new(nx as usize, ny as usize, cx, cy, radius, u0, re));
    }
}

#[no_mangle]
pub extern "C" fn reset_flow() {
    sim().reset_flow();
}
#[no_mangle]
pub extern "C" fn reset_stats() {
    sim().reset_stats();
}
#[no_mangle]
pub extern "C" fn set_alpha(a: f32) {
    sim().set_alpha(a);
}
#[no_mangle]
pub extern "C" fn run(n: u32) {
    sim().run(n);
}
#[no_mangle]
pub extern "C" fn cl() -> f32 {
    sim().cl()
}
#[no_mangle]
pub extern "C" fn cd() -> f32 {
    sim().cd()
}
#[no_mangle]
pub extern "C" fn cl_mean() -> f32 {
    sim().cl_mean()
}
#[no_mangle]
pub extern "C" fn cd_mean() -> f32 {
    sim().cd_mean()
}
#[no_mangle]
pub extern "C" fn cl_rms() -> f32 {
    sim().cl_rms()
}
#[no_mangle]
pub extern "C" fn samples() -> u32 {
    sim().samples()
}
#[no_mangle]
pub extern "C" fn steps() -> u32 {
    sim().steps() as u32
}
#[no_mangle]
pub extern "C" fn paint(mode: u32) {
    sim().paint(mode);
}
#[no_mangle]
pub extern "C" fn field_ptr() -> *const f32 {
    sim().field().as_ptr()
}
#[no_mangle]
pub extern "C" fn grid_w() -> u32 {
    sim().nx as u32
}
#[no_mangle]
pub extern "C" fn grid_h() -> u32 {
    sim().ny as u32
}
#[no_mangle]
pub extern "C" fn cyl_x() -> f32 {
    sim().cx
}
#[no_mangle]
pub extern "C" fn cyl_y() -> f32 {
    sim().cy
}
#[no_mangle]
pub extern "C" fn cyl_r() -> f32 {
    sim().radius
}
