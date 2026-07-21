//! # kite-solver
//!
//! A **vortex-lattice method** (VLM) — the classic potential-flow panel method for
//! thin lifting surfaces — applied to a bowed *Revolution*-style quad-line kite sail.
//!
//! The sail is a wide, shallow-arc membrane. We discretise it into `nspan × nchord`
//! quadrilateral panels, put a horseshoe vortex on each (bound line at the panel
//! quarter-chord, two trailing legs streaming downwind to ~infinity), enforce
//! flow-tangency at each panel's three-quarter-chord collocation point, and solve the
//! dense linear system `A Γ = b` for the circulation strengths. Per-panel forces come
//! from the near-field Kutta–Joukowski law `F = ρ (V_total × Γ l)`, which yields lift
//! *and* induced drag directly.
//!
//! **Cutting a cell** is just dropping that panel from the system: the circulation
//! redistributes over the survivors, total load falls, and the centre of pressure
//! shifts — asymmetric cuts break the left/right balance, exactly as they would on a
//! real kite. That is the whole point of the tool.
//!
//! Zero dependencies (own tiny 3-vector + Gaussian-elimination). The browser wrapper
//! lives in `kite-solver-wasm`.

// ───────────────────────────────── 3-vectors ────────────────────────────────────

/// A minimal 3-vector. Copy, so it threads through the Biot–Savart inner loops with
/// no allocation.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl V3 {
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        V3 { x, y, z }
    }
    pub fn add(self, o: V3) -> V3 {
        V3::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
    pub fn sub(self, o: V3) -> V3 {
        V3::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }
    pub fn scale(self, s: f64) -> V3 {
        V3::new(self.x * s, self.y * s, self.z * s)
    }
    pub fn dot(self, o: V3) -> f64 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    pub fn cross(self, o: V3) -> V3 {
        V3::new(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }
    pub fn norm(self) -> f64 {
        self.dot(self).sqrt()
    }
    pub fn unit(self) -> V3 {
        let n = self.norm();
        if n < 1e-12 {
            V3::default()
        } else {
            self.scale(1.0 / n)
        }
    }
}

// ───────────────────────────────── inputs ───────────────────────────────────────

/// Flight + geometry configuration for one solve.
#[derive(Clone, Debug)]
pub struct KiteConfig {
    /// Sail span (tip-to-tip along the arc), metres. Rev kites are ~2.3 m.
    pub span: f64,
    /// Sail chord (leading→trailing edge), metres. Rev kites are short-chorded, ~0.6 m.
    pub chord: f64,
    /// Bow: fraction of a half-circle the span arcs through (0 = flat, 1 = strong bow).
    /// Real Rev kites fly with a gentle bow; `0.35` is a good default.
    pub bow: f64,
    /// Angle of attack of the chord to the wind, radians. The flying angle.
    pub aoa: f64,
    /// Wind speed, m/s.
    pub wind: f64,
    /// Air density, kg/m³ (sea level ≈ 1.225).
    pub rho: f64,
    /// Spanwise panel count.
    pub nspan: usize,
    /// Chordwise panel count.
    pub nchord: usize,
    /// Per-panel cut mask, row-major `[chord][span]`, length `nspan*nchord`. `true`
    /// = panel removed. Empty ⇒ nothing cut.
    pub cut: Vec<bool>,
}

impl KiteConfig {
    /// A sensible Revolution-kite default.
    pub fn rev_default() -> Self {
        KiteConfig {
            span: 2.34,
            chord: 0.61,
            bow: 0.35,
            aoa: 0.18, // ~10°
            wind: 8.0,
            rho: 1.225,
            nspan: 28,
            nchord: 6,
            cut: Vec::new(),
        }
    }

    fn is_cut(&self, i_chord: usize, j_span: usize) -> bool {
        if self.cut.is_empty() {
            return false;
        }
        let idx = i_chord * self.nspan + j_span;
        self.cut.get(idx).copied().unwrap_or(false)
    }
}

// ───────────────────────────────── geometry ─────────────────────────────────────

/// One quadrilateral lattice panel and its VLM control geometry.
#[derive(Clone, Debug)]
pub struct Panel {
    /// Grid coordinates (chordwise, spanwise).
    pub i: usize,
    pub j: usize,
    /// Four corners, order: LE-left, LE-right, TE-right, TE-left (CCW seen from front).
    pub corners: [V3; 4],
    /// Bound-vortex endpoints (quarter-chord line, left → right).
    pub bound_a: V3,
    pub bound_b: V3,
    /// Collocation point (three-quarter chord, mid-span).
    pub collocation: V3,
    /// Outward unit normal (points into the wind for a lifting orientation).
    pub normal: V3,
    /// Panel area, m².
    pub area: f64,
    /// Geometric centre.
    pub center: V3,
    /// Whether this panel is cut out (excluded from the solve).
    pub cut: bool,
}

/// Build the panelled kite from a config. Span runs along the arc; the local chord is
/// tilted back by the angle of attack so the sail catches the wind.
pub fn build_panels(cfg: &KiteConfig) -> Vec<Panel> {
    let ns = cfg.nspan.max(1);
    let nc = cfg.nchord.max(1);

    // Wind blows along +X. The sail is a lifting surface: its chord lies roughly
    // *streamwise* (+X) with a small pitch (the angle of attack), and the span arcs
    // through the Y–Z frontal plane as dihedral (a shallow bow, tips lifting in +Z).
    //
    // Spanwise arc. theta sweeps [-Θ/2, +Θ/2]; radius chosen so arc length == span.
    // bow == 0 degenerates to a flat span (handled explicitly to avoid /0).
    let bigtheta = (cfg.bow.clamp(0.0, 1.0)) * std::f64::consts::PI * 0.9;
    let flat = bigtheta < 1e-6;
    let radius = if flat { 0.0 } else { cfg.span / bigtheta };

    // A spanwise station: base leading-edge point on the arc + the local spanwise
    // tangent. Arc lies in the Y–Z plane; tips curve up (+Z) — the bow/dihedral.
    let station = |s: f64| -> (V3, V3) {
        if flat {
            let base = V3::new(0.0, (s - 0.5) * cfg.span, 0.0);
            (base, V3::new(0.0, 1.0, 0.0))
        } else {
            let th = (s - 0.5) * bigtheta;
            let base = V3::new(0.0, radius * th.sin(), radius * (1.0 - th.cos()));
            // d(base)/dθ ∝ (0, cosθ, sinθ)
            let tang = V3::new(0.0, th.cos(), th.sin()).unit();
            (base, tang)
        }
    };

    // Local chord direction at a station: nominally streamwise (+X, leading→trailing
    // edge going downwind), pitched up at the leading edge by the angle of attack —
    // a rotation of +X about the local spanwise tangent. Rodrigues rotation of +X
    // about `tang` by `-aoa` tips the trailing edge down (+z at LE), i.e. positive AoA.
    let chord_dir = |tang: V3| -> V3 {
        let v = V3::new(1.0, 0.0, 0.0);
        let k = tang.unit();
        let beta = cfg.aoa;
        let ca = beta.cos();
        let sa = beta.sin();
        v.scale(ca)
            .add(k.cross(v).scale(sa))
            .add(k.scale(k.dot(v) * (1.0 - ca)))
            .unit()
    };

    // Grid of corner points: (nc+1) chordwise × (ns+1) spanwise.
    let mut grid = vec![V3::default(); (nc + 1) * (ns + 1)];
    let gidx = |ic: usize, js: usize| ic * (ns + 1) + js;
    for js in 0..=ns {
        let s = js as f64 / ns as f64;
        let (base, tang) = station(s);
        let cdir = chord_dir(tang);
        for ic in 0..=nc {
            let t = ic as f64 / nc as f64;
            grid[gidx(ic, js)] = base.add(cdir.scale(t * cfg.chord));
        }
    }

    let mut panels = Vec::with_capacity(nc * ns);
    for ic in 0..nc {
        for js in 0..ns {
            let p_ll = grid[gidx(ic, js)]; // LE-left
            let p_lr = grid[gidx(ic, js + 1)]; // LE-right
            let p_tr = grid[gidx(ic + 1, js + 1)]; // TE-right
            let p_tl = grid[gidx(ic + 1, js)]; // TE-left

            // Bound vortex at quarter chord (1/4 from LE to TE), left→right.
            let bound_a = lerp(p_ll, p_tl, 0.25);
            let bound_b = lerp(p_lr, p_tr, 0.25);
            // Collocation at three-quarter chord, mid-span.
            let mid_le = lerp(p_ll, p_lr, 0.5);
            let mid_te = lerp(p_tl, p_tr, 0.5);
            let collocation = lerp(mid_le, mid_te, 0.75);

            // Normal from the panel diagonals; orient to the lifting side (points up,
            // +Z, so the whole lattice uses a consistent surface side).
            let d1 = p_tr.sub(p_ll);
            let d2 = p_tl.sub(p_lr);
            let mut normal = d1.cross(d2).unit();
            if normal.z < 0.0 {
                normal = normal.scale(-1.0);
            }
            let area = 0.5 * d1.cross(d2).norm();
            let center = lerp(lerp(p_ll, p_lr, 0.5), lerp(p_tl, p_tr, 0.5), 0.5);

            panels.push(Panel {
                i: ic,
                j: js,
                corners: [p_ll, p_lr, p_tr, p_tl],
                bound_a,
                bound_b,
                collocation,
                normal,
                area,
                center,
                cut: cfg.is_cut(ic, js),
            });
        }
    }
    panels
}

fn lerp(a: V3, b: V3, t: f64) -> V3 {
    a.add(b.sub(a).scale(t))
}

// ─────────────────────────────── Biot–Savart ────────────────────────────────────

/// Induced velocity at `p` from a straight vortex filament `a→b` of unit circulation.
/// Returns zero when `p` lies on (or nearly on) the line, which conveniently makes a
/// bound segment induce nothing at its own midpoint.
fn seg_induced(a: V3, b: V3, p: V3) -> V3 {
    let r1 = p.sub(a);
    let r2 = p.sub(b);
    let r0 = b.sub(a);
    let cross = r1.cross(r2);
    let cross_sq = cross.dot(cross);
    let n1 = r1.norm();
    let n2 = r2.norm();
    // Regularise: skip when the point is on the filament or an endpoint is singular.
    if cross_sq < 1e-12 || n1 < 1e-9 || n2 < 1e-9 {
        return V3::default();
    }
    let k = (r0.dot(r1) / n1 - r0.dot(r2) / n2) / (4.0 * std::f64::consts::PI * cross_sq);
    cross.scale(k)
}

/// Induced velocity at `p` from a horseshoe vortex of unit circulation: an incoming
/// trailing leg from downstream infinity to `a`, the bound segment `a→b`, and an
/// outgoing trailing leg from `b` to downstream infinity. `dir` is the (unit)
/// freestream direction the wake trails along; `far` is the ~infinity length.
fn horseshoe_induced(a: V3, b: V3, dir: V3, far: f64, p: V3) -> V3 {
    let a_inf = a.add(dir.scale(far));
    let b_inf = b.add(dir.scale(far));
    seg_induced(a_inf, a, p)
        .add(seg_induced(a, b, p))
        .add(seg_induced(b, b_inf, p))
}

// ─────────────────────────────── linear solve ───────────────────────────────────

/// Solve `A x = b` in place by Gaussian elimination with partial pivoting. `a` is
/// row-major `n×n`. Returns `None` if the system is singular.
fn gauss_solve(mut a: Vec<f64>, mut b: Vec<f64>, n: usize) -> Option<Vec<f64>> {
    for col in 0..n {
        // pivot
        let mut piv = col;
        let mut best = a[col * n + col].abs();
        for r in (col + 1)..n {
            let v = a[r * n + col].abs();
            if v > best {
                best = v;
                piv = r;
            }
        }
        if best < 1e-14 {
            return None;
        }
        if piv != col {
            for c in 0..n {
                a.swap(col * n + c, piv * n + c);
            }
            b.swap(col, piv);
        }
        let d = a[col * n + col];
        for r in (col + 1)..n {
            let f = a[r * n + col] / d;
            if f != 0.0 {
                for c in col..n {
                    a[r * n + c] -= f * a[col * n + c];
                }
                b[r] -= f * b[col];
            }
        }
    }
    // back-substitution
    let mut x = vec![0.0; n];
    for r in (0..n).rev() {
        let mut s = b[r];
        for c in (r + 1)..n {
            s -= a[r * n + c] * x[c];
        }
        x[r] = s / a[r * n + r];
    }
    Some(x)
}

// ──────────────────────────────── the solve ─────────────────────────────────────

/// Per-panel result. Force is the aerodynamic load on that cell, in world axes
/// (wind is +X). `pressure` is a signed load coefficient handy for colour maps.
#[derive(Clone, Debug)]
pub struct PanelForce {
    pub i: usize,
    pub j: usize,
    pub center: V3,
    pub normal: V3,
    pub area: f64,
    pub force: V3,
    pub gamma: f64,
    /// Normal-force coefficient: (F·n)/(q·area). Positive ⇒ pushing downwind.
    pub pressure: f64,
    pub cut: bool,
}

/// Whole-kite result in wind axes.
#[derive(Clone, Debug)]
pub struct Solution {
    pub panels: Vec<PanelForce>,
    /// Total aerodynamic force vector (N), world axes.
    pub force: V3,
    /// Drag: component along the wind (+X) — this is essentially the line pull. (N)
    pub drag: f64,
    /// Lift: component across the wind in the vertical plane (+Z). (N)
    pub lift: f64,
    /// Side force: (+Y). Nonzero when cuts are left/right asymmetric. (N)
    pub side: f64,
    /// Magnitude of the total force (N).
    pub magnitude: f64,
    /// Lift-to-drag ratio (glide number).
    pub l_over_d: f64,
    /// Dimensionless lift coefficient over the *intact* reference area.
    pub cl: f64,
    /// Dimensionless drag coefficient over the intact reference area.
    pub cd: f64,
    /// Centre of pressure (force-weighted panel centroid), world coords.
    pub center_of_pressure: V3,
    /// Live (uncut) sail area, m².
    pub live_area: f64,
    /// Full sail area with nothing cut, m² (the reference for CL/CD).
    pub ref_area: f64,
    pub n_panels: usize,
    pub n_cut: usize,
}

/// Run the vortex-lattice solve for a kite config. Cut panels contribute no vortex and
/// no equation; the remaining circulation adjusts around the hole.
pub fn solve(cfg: &KiteConfig) -> Solution {
    let panels = build_panels(cfg);
    let dir = V3::new(1.0, 0.0, 0.0); // wind / wake direction
    let vinf = dir.scale(cfg.wind);
    let far = (cfg.span + cfg.chord) * 200.0 + 1.0;

    let ref_area: f64 = panels.iter().map(|p| p.area).sum();
    let live_area: f64 = panels.iter().filter(|p| !p.cut).map(|p| p.area).sum();

    // Active (uncut) panels get an unknown; build an index map.
    let active: Vec<usize> = panels
        .iter()
        .enumerate()
        .filter(|(_, p)| !p.cut)
        .map(|(k, _)| k)
        .collect();
    let n = active.len();

    let mut gamma = vec![0.0f64; panels.len()];

    if n > 0 {
        // Influence matrix A[i][j] = (horseshoe j induced at collocation i) · n_i.
        let mut a = vec![0.0f64; n * n];
        let mut rhs = vec![0.0f64; n];
        for (ri, &pi) in active.iter().enumerate() {
            let coll = panels[pi].collocation;
            let nrm = panels[pi].normal;
            for (cj, &pj) in active.iter().enumerate() {
                let v = horseshoe_induced(panels[pj].bound_a, panels[pj].bound_b, dir, far, coll);
                a[ri * n + cj] = v.dot(nrm);
            }
            rhs[ri] = -vinf.dot(nrm);
        }
        if let Some(sol) = gauss_solve(a, rhs, n) {
            for (ri, &pi) in active.iter().enumerate() {
                gamma[pi] = sol[ri];
            }
        }
    }

    // Near-field Kutta–Joukowski force per active panel:
    //   F_i = ρ Γ_i (V_total(mid_i) × l_i),  l_i = bound_b - bound_a.
    // V_total = freestream + Σ_j Γ_j · horseshoe_j(mid_i). The self bound segment
    // induces zero at its own midpoint, so the sum is well-behaved.
    let q = 0.5 * cfg.rho * cfg.wind * cfg.wind;
    let mut pforces = Vec::with_capacity(panels.len());
    let mut total = V3::default();
    let mut cop_num = V3::default();
    let mut cop_den = 0.0;

    for (k, p) in panels.iter().enumerate() {
        if p.cut {
            pforces.push(PanelForce {
                i: p.i,
                j: p.j,
                center: p.center,
                normal: p.normal,
                area: p.area,
                force: V3::default(),
                gamma: 0.0,
                pressure: 0.0,
                cut: true,
            });
            continue;
        }
        let mid = lerp(p.bound_a, p.bound_b, 0.5);
        let mut vtot = vinf;
        for &pj in &active {
            let g = gamma[pj];
            if g != 0.0 {
                let v = horseshoe_induced(panels[pj].bound_a, panels[pj].bound_b, dir, far, mid);
                vtot = vtot.add(v.scale(g));
            }
        }
        let lvec = p.bound_b.sub(p.bound_a);
        let force = vtot.cross(lvec).scale(cfg.rho * gamma[k]);
        total = total.add(force);
        let mag = force.norm();
        cop_num = cop_num.add(p.center.scale(mag));
        cop_den += mag;
        let pressure = if q > 1e-9 && p.area > 1e-12 {
            force.dot(p.normal) / (q * p.area)
        } else {
            0.0
        };
        pforces.push(PanelForce {
            i: p.i,
            j: p.j,
            center: p.center,
            normal: p.normal,
            area: p.area,
            force,
            gamma: gamma[k],
            pressure,
            cut: false,
        });
    }

    let drag = total.x;
    let lift = total.z;
    let side = total.y;
    let magnitude = total.norm();
    let l_over_d = if drag.abs() > 1e-9 { lift / drag } else { 0.0 };
    let denom = q * ref_area;
    let (cl, cd) = if denom > 1e-9 {
        (lift / denom, drag / denom)
    } else {
        (0.0, 0.0)
    };
    let cop = if cop_den > 1e-9 {
        cop_num.scale(1.0 / cop_den)
    } else {
        V3::default()
    };
    let n_cut = panels.iter().filter(|p| p.cut).count();

    Solution {
        n_panels: panels.len(),
        n_cut,
        panels: pforces,
        force: total,
        drag,
        lift,
        side,
        magnitude,
        l_over_d,
        cl,
        cd,
        center_of_pressure: cop,
        live_area,
        ref_area,
    }
}

// ──────────────────────────────────── tests ─────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() <= tol
    }

    #[test]
    fn flat_geometry_is_planar_and_symmetric() {
        let mut cfg = KiteConfig::rev_default();
        cfg.bow = 0.0;
        cfg.aoa = 0.0;
        let panels = build_panels(&cfg);
        // With no bow and no AoA the sail lies flat in the X–Y plane (z ≈ 0), chord
        // streamwise, normal straight up.
        for p in &panels {
            for c in &p.corners {
                assert!(c.z.abs() < 1e-9, "flat sail should have z≈0, got {}", c.z);
            }
            assert!(p.normal.z > 0.999, "flat normal should be +Z, got {:?}", p.normal);
        }
        // Total area ≈ span*chord.
        let area: f64 = panels.iter().map(|p| p.area).sum();
        assert!(approx(area, cfg.span * cfg.chord, 1e-6), "area {}", area);
    }

    #[test]
    fn positive_aoa_makes_lift_and_drag() {
        let mut cfg = KiteConfig::rev_default();
        cfg.bow = 0.0;
        cfg.aoa = 0.12;
        let s = solve(&cfg);
        assert!(s.lift > 0.0, "expected positive lift, got {}", s.lift);
        assert!(s.drag > 0.0, "expected positive (induced) drag, got {}", s.drag);
        // A symmetric kite has no side force.
        assert!(s.side.abs() < 1e-6 * s.magnitude.max(1.0), "side {}", s.side);
    }

    #[test]
    fn lift_curve_slope_is_physical() {
        // Flat rectangular wing, moderate AR: CL should be ~linear in α and the slope
        // should sit below the 2π thin-airfoil value (finite-span downwash), and near
        // the lifting-line estimate 2π·AR/(AR+2) within panel-method tolerance.
        let mut cfg = KiteConfig::rev_default();
        cfg.bow = 0.0;
        cfg.nspan = 32;
        cfg.nchord = 6;
        let ar = cfg.span / cfg.chord;

        let cl_at = |deg: f64| {
            let mut c = cfg.clone();
            c.aoa = deg * std::f64::consts::PI / 180.0;
            solve(&c).cl
        };
        let cl4 = cl_at(4.0);
        let cl8 = cl_at(8.0);
        // Linearity: doubling α roughly doubles CL.
        assert!(approx(cl8 / cl4, 2.0, 0.15), "CL not linear: {} vs {}", cl4, cl8);
        // Per-radian slope.
        let slope = (cl8 - cl4) / ((8.0 - 4.0) * std::f64::consts::PI / 180.0);
        let two_pi = 2.0 * std::f64::consts::PI;
        let lifting_line = two_pi * ar / (ar + 2.0);
        assert!(slope < two_pi, "slope {} should be below 2π", slope);
        assert!(
            approx(slope, lifting_line, 1.2),
            "slope {} vs lifting-line {}",
            slope,
            lifting_line
        );
    }

    #[test]
    fn wind_speed_scales_force_quadratically() {
        let mut cfg = KiteConfig::rev_default();
        let f1 = {
            cfg.wind = 6.0;
            solve(&cfg).magnitude
        };
        let f2 = {
            cfg.wind = 12.0;
            solve(&cfg).magnitude
        };
        // Force ∝ ρ V² ⇒ doubling wind quadruples force.
        assert!(approx(f2 / f1, 4.0, 0.05), "ratio {}", f2 / f1);
    }

    #[test]
    fn cutting_reduces_lift_and_area() {
        let cfg0 = KiteConfig::rev_default();
        let s0 = solve(&cfg0);

        // Cut the entire top chord row.
        let mut cfg1 = cfg0.clone();
        let mut cut = vec![false; cfg1.nspan * cfg1.nchord];
        for j in 0..cfg1.nspan {
            cut[0 * cfg1.nspan + j] = true; // i_chord = 0
        }
        cfg1.cut = cut;
        let s1 = solve(&cfg1);

        assert!(s1.live_area < s0.live_area, "cut should shrink live area");
        assert!(s1.lift < s0.lift, "cutting a row should reduce lift");
        assert!(s1.n_cut == cfg1.nspan, "n_cut {}", s1.n_cut);
    }

    #[test]
    fn asymmetric_cut_makes_side_force() {
        let cfg0 = KiteConfig::rev_default();
        // Cut the left half of the sail only → left/right imbalance → side force + CoP
        // shifts toward the intact (right) side.
        let mut cfg = cfg0.clone();
        let mut cut = vec![false; cfg.nspan * cfg.nchord];
        for i in 0..cfg.nchord {
            for j in 0..(cfg.nspan / 2) {
                cut[i * cfg.nspan + j] = true;
            }
        }
        cfg.cut = cut;
        let s = solve(&cfg);
        assert!(s.side.abs() > 1e-3, "asymmetric cut should make side force, got {}", s.side);
        // Right side is +Y (spanwise increases with j); CoP should move to +Y.
        assert!(s.center_of_pressure.y > 0.0, "CoP y {}", s.center_of_pressure.y);
    }

    #[test]
    fn everything_cut_is_zero_force_no_panic() {
        let mut cfg = KiteConfig::rev_default();
        cfg.cut = vec![true; cfg.nspan * cfg.nchord];
        let s = solve(&cfg);
        assert_eq!(s.n_cut, cfg.nspan * cfg.nchord);
        assert!(s.magnitude < 1e-9, "no sail ⇒ no force, got {}", s.magnitude);
        assert!(s.live_area < 1e-9);
    }
}
