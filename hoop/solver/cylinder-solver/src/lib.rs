//! cylinder-solver — structural feasibility for spin-gravity O'Neill cylinders.
//!
//! Two layers, both consumed by the browser tool (`hoop/cylinder.html`):
//!
//!   1. [`analytic`] — closed-form hoop stress, the irreducible ρv² specific-strength
//!      floor, and the regolith-flux → spun-mass → pressure coupling. This mirrors the
//!      JS tool exactly, so the WASM build is a cross-check, not a black box.
//!
//!   2. [`net`] — a general pin-jointed 3D cable/strut solver (direct stiffness method,
//!      tension-only active set). The structural web — radial spokes, secant chords,
//!      and *later* helical/diagonal 3D members across the cylinder surface — is solved
//!      here for member tensions and feasibility. Every node is a `[f64; 3]`, so a 2D
//!      cross-section is just `z = 0` and the full 3D net drops in with no solver change.
//!      A singular stiffness matrix is reported as a `mechanism` — i.e. the solver tells
//!      you when a weave is kinematically incapable of carrying load, which is itself a
//!      design answer.
//!
//! Zero-dependency on purpose: the dense linear solve ([`la`]) is hand-rolled so the
//! whole core `cargo test`s offline.

pub const G0: f64 = 9.80665; // standard gravity, m/s²

// ───────────────────────────── dense linear algebra ─────────────────────────────
pub mod la {
    /// Solve `A x = b` for a dense `n×n` system (row-major `a`), via Gaussian
    /// elimination with partial pivoting. Returns `None` if `A` is singular —
    /// for the stiffness method that means a kinematic mechanism.
    pub fn solve(mut a: Vec<f64>, mut b: Vec<f64>, n: usize) -> Option<Vec<f64>> {
        for col in 0..n {
            // partial pivot: largest magnitude in this column
            let mut piv = col;
            let mut best = a[col * n + col].abs();
            for r in (col + 1)..n {
                let v = a[r * n + col].abs();
                if v > best {
                    best = v;
                    piv = r;
                }
            }
            if best < 1e-9 {
                return None;
            }
            if piv != col {
                for k in 0..n {
                    a.swap(col * n + k, piv * n + k);
                }
                b.swap(col, piv);
            }
            let d = a[col * n + col];
            for r in (col + 1)..n {
                let f = a[r * n + col] / d;
                if f != 0.0 {
                    for k in col..n {
                        a[r * n + k] -= f * a[col * n + k];
                    }
                    b[r] -= f * b[col];
                }
            }
        }
        let mut x = vec![0.0; n];
        for i in (0..n).rev() {
            let mut s = b[i];
            for k in (i + 1)..n {
                s -= a[i * n + k] * x[k];
            }
            x[i] = s / a[i * n + i];
        }
        Some(x)
    }
}

// ───────────────────────────── closed-form feasibility ──────────────────────────
pub mod analytic {
    use super::G0;

    /// A structural material: representative tensile strength (Pa) and density (kg/m³).
    #[derive(Clone, Copy, Debug)]
    pub struct Material {
        pub strength: f64,
        pub density: f64,
    }

    /// Everything the hoop-stress model needs. All SI.
    #[derive(Clone, Debug)]
    pub struct HoopSpec {
        pub radius: f64,        // m, axis → hull
        pub g_rim: f64,         // target gravity at the rim, in earth-g
        pub wall_t: f64,        // m, tension-hull thickness
        pub sf: f64,            // safety factor (allowable = strength / sf)
        pub atm: f64,           // Pa, internal atmosphere pressure
        pub reg_depth: f64,     // m, regolith shield depth
        pub reg_density: f64,   // kg/m³, regolith density (~1500)
        pub interior_load: f64, // kg/m², floor/structure/live areal load
        pub hull: Material,
        pub web_share: f64,     // fraction φ of the pressure hoop carried by the web
    }

    #[derive(Clone, Debug)]
    pub struct HoopReport {
        pub omega: f64,
        pub rim_v: f64,
        pub p_eff: f64,            // Pa, effective outward pressure at the rim
        pub sigma_self: f64,       // ρv² — the floor tethers cannot remove
        pub sigma_press_bare: f64, // pressure hoop term, bare hull
        pub sigma_with_web: f64,   // hull stress after the web offloads φ
        pub allow: f64,            // strength / sf
        pub margin: f64,           // allow / sigma_with_web (≥1 holds)
        pub v_max: f64,            // specific-strength rim-speed ceiling
        pub r_max: f64,            // max radius at g_rim before the wall can't hold its own spin
        pub areal_density: f64,    // kg/m² of shielding
        pub material_limited: bool,
        pub feasible: bool,
    }

    /// The whole closed-form picture. Identical to the JS in `hoop/cylinder.html`.
    pub fn hoop(s: &HoopSpec) -> HoopReport {
        let w = (s.g_rim * G0 / s.radius).sqrt();
        let v = w * s.radius;
        let m_reg = s.reg_density * s.reg_depth;
        let p_eff = s.atm + (m_reg + s.interior_load) * w * w * s.radius;
        let sigma_self = s.hull.density * v * v;
        let sigma_press_bare = p_eff * s.radius / s.wall_t;
        let allow = s.hull.strength / s.sf;
        let sigma_with_web = sigma_self + (1.0 - s.web_share) * sigma_press_bare;
        let specific = s.hull.strength / s.hull.density;
        let v_max = (specific / s.sf).sqrt();
        let r_max = v_max * v_max / (s.g_rim * G0);
        let material_limited = sigma_self > allow;
        let margin = allow / sigma_with_web;
        HoopReport {
            omega: w,
            rim_v: v,
            p_eff,
            sigma_self,
            sigma_press_bare,
            sigma_with_web,
            allow,
            margin,
            v_max,
            r_max,
            areal_density: m_reg,
            material_limited,
            feasible: !material_limited && margin >= 1.0,
        }
    }
}

// ───────────────────────────── cable/strut net (3D) ─────────────────────────────
pub mod net {
    use super::la;

    /// A node in 3D. `fix[k]` pins displacement DOF k (x,y,z); `load[k]` is the applied
    /// force (N) along that axis. A 2D cross-section problem simply fixes every node's z.
    #[derive(Clone, Debug)]
    pub struct Node {
        pub pos: [f64; 3],
        pub fix: [bool; 3],
        pub load: [f64; 3],
    }

    /// A pin-jointed member between two nodes. `tension_only` cables drop out of the
    /// system when they would go into compression (active-set iteration); set it false
    /// for struts / the hull ring (which can carry compression).
    #[derive(Clone, Debug)]
    pub struct Member {
        pub i: usize,
        pub j: usize,
        pub area: f64, // m²
        pub e: f64,    // Pa, Young's modulus
        pub tension_only: bool,
    }

    #[derive(Clone, Debug)]
    pub struct MemberRes {
        pub force: f64,  // N, +tension / -compression
        pub stress: f64, // Pa
        pub length: f64, // m
        pub active: bool,
    }

    #[derive(Clone, Debug)]
    pub struct Solution {
        pub disp: Vec<[f64; 3]>,
        pub members: Vec<MemberRes>,
        pub iters: usize,
        pub mechanism: bool,
    }

    #[derive(Clone, Debug)]
    pub struct Model {
        pub nodes: Vec<Node>,
        pub members: Vec<Member>,
    }

    impl Model {
        /// Direct stiffness solve with tension-only active-set iteration.
        pub fn solve(&self) -> Solution {
            let n = self.nodes.len();
            let ndof = 3 * n;
            let mut active: Vec<bool> = self.members.iter().map(|_| true).collect();
            let mut disp = vec![[0.0; 3]; n];
            let mut forces = vec![0.0; self.members.len()];
            let mut lengths = vec![0.0; self.members.len()];
            let mut mechanism = false;
            let mut iters = 0;

            loop {
                iters += 1;
                // member geometry (direction cosines + length)
                let mut cos = vec![[0.0; 3]; self.members.len()];
                for (m, mem) in self.members.iter().enumerate() {
                    let a = self.nodes[mem.i].pos;
                    let b = self.nodes[mem.j].pos;
                    let d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                    let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
                    lengths[m] = l;
                    if l > 1e-12 {
                        cos[m] = [d[0] / l, d[1] / l, d[2] / l];
                    }
                }
                // assemble global stiffness over active members
                // element 6×6 = (EA/L) · [[T, -T], [-T, T]], with T = c·cᵀ
                let mut k = vec![0.0; ndof * ndof];
                for (m, mem) in self.members.iter().enumerate() {
                    if !active[m] || lengths[m] < 1e-12 {
                        continue;
                    }
                    let c = cos[m];
                    let kk = mem.e * mem.area / lengths[m];
                    let dofs = [
                        3 * mem.i, 3 * mem.i + 1, 3 * mem.i + 2,
                        3 * mem.j, 3 * mem.j + 1, 3 * mem.j + 2,
                    ];
                    for p in 0..6 {
                        for q in 0..6 {
                            let sign = if (p < 3) == (q < 3) { 1.0 } else { -1.0 };
                            k[dofs[p] * ndof + dofs[q]] += kk * sign * c[p % 3] * c[q % 3];
                        }
                    }
                }
                // boundary conditions + loads → reduce to free DOFs
                let mut isfix = vec![false; ndof];
                let mut f = vec![0.0; ndof];
                for (ni, nd) in self.nodes.iter().enumerate() {
                    for a in 0..3 {
                        f[3 * ni + a] = nd.load[a];
                        if nd.fix[a] {
                            isfix[3 * ni + a] = true;
                        }
                    }
                }
                let free: Vec<usize> = (0..ndof).filter(|d| !isfix[*d]).collect();
                let nf = free.len();
                let mut kr = vec![0.0; nf * nf];
                let mut fr = vec![0.0; nf];
                for (a, &da) in free.iter().enumerate() {
                    fr[a] = f[da];
                    for (b, &db) in free.iter().enumerate() {
                        kr[a * nf + b] = k[da * ndof + db];
                    }
                }
                match la::solve(kr, fr, nf) {
                    None => {
                        mechanism = true;
                        break;
                    }
                    Some(u) => {
                        let mut full = vec![0.0; ndof];
                        for (a, &da) in free.iter().enumerate() {
                            full[da] = u[a];
                        }
                        for ni in 0..n {
                            disp[ni] = [full[3 * ni], full[3 * ni + 1], full[3 * ni + 2]];
                        }
                    }
                }
                // recover member axial forces; deactivate slack cables
                let mut changed = false;
                for (m, mem) in self.members.iter().enumerate() {
                    if lengths[m] < 1e-12 {
                        forces[m] = 0.0;
                        continue;
                    }
                    let c = cos[m];
                    let du = [
                        disp[mem.j][0] - disp[mem.i][0],
                        disp[mem.j][1] - disp[mem.i][1],
                        disp[mem.j][2] - disp[mem.i][2],
                    ];
                    let elong = c[0] * du[0] + c[1] * du[1] + c[2] * du[2];
                    forces[m] = if active[m] {
                        mem.e * mem.area / lengths[m] * elong
                    } else {
                        0.0
                    };
                    if mem.tension_only && active[m] && forces[m] < -1e-6 {
                        active[m] = false;
                        changed = true;
                    }
                }
                if !changed || iters >= 64 {
                    break;
                }
            }

            let members = self
                .members
                .iter()
                .enumerate()
                .map(|(m, mem)| MemberRes {
                    force: forces[m],
                    stress: forces[m] / mem.area.max(1e-30),
                    length: lengths[m],
                    active: active[m],
                })
                .collect();
            Solution {
                disp,
                members,
                iters,
                mechanism,
            }
        }
    }
}

// ───────────────────────────── cylinder model builders ──────────────────────────
pub mod cylinder {
    use super::net::{Member, Model, Node};
    use std::f64::consts::TAU;

    /// A spoked wheel: `n` rim nodes on a circle of radius `r` (in the z=0 plane), a
    /// closed hull ring of struts between them, `n` tension-only radial spokes to a
    /// fixed central hub, and an outward radial load of `p_eff` (Pa) shared over the
    /// rim. This is the radial-web cross-section; everything is `[f64;3]`, so swapping
    /// the hub for an axial spine and adding helical members extends it to 3D.
    #[allow(clippy::too_many_arguments)]
    pub fn spoked_wheel(
        r: f64,
        n: usize,
        p_eff: f64,
        wall_t: f64,
        e_hull: f64,
        cable_area: f64,
        e_cable: f64,
    ) -> Model {
        let arc = TAU * r / n as f64; // tributary rim length per node
        let mut nodes = Vec::with_capacity(n + 1);
        for i in 0..n {
            let th = TAU * i as f64 / n as f64;
            let (s, c) = th.sin_cos();
            nodes.push(Node {
                pos: [r * c, r * s, 0.0],
                fix: [false, false, true], // planar problem: pin z
                load: [p_eff * arc * c, p_eff * arc * s, 0.0], // outward radial
            });
        }
        let hub = n;
        nodes.push(Node {
            pos: [0.0, 0.0, 0.0],
            fix: [true, true, true],
            load: [0.0, 0.0, 0.0],
        });
        let mut members = Vec::with_capacity(2 * n);
        for i in 0..n {
            // hull ring (carries compression too)
            members.push(Member {
                i,
                j: (i + 1) % n,
                area: wall_t,
                e: e_hull,
                tension_only: false,
            });
            // radial spoke (tension-only cable)
            members.push(Member {
                i,
                j: hub,
                area: cable_area,
                e: e_cable,
                tension_only: true,
            });
        }
        Model { nodes, members }
    }

    /// A secant chord web {n/k}: `n` rim nodes, the closed hull ring, plus a chord from
    /// each node to the node `k` steps away (tension-only). No hub. Whether this carries
    /// the radial load — or is a mechanism — depends on `k` and triangulation; the solver
    /// reports `mechanism` when the weave is kinematically incapable.
    #[allow(clippy::too_many_arguments)]
    pub fn secant_web(
        r: f64,
        n: usize,
        k: usize,
        p_eff: f64,
        wall_t: f64,
        e_hull: f64,
        cable_area: f64,
        e_cable: f64,
    ) -> Model {
        let arc = TAU * r / n as f64;
        let mut nodes = Vec::with_capacity(n);
        for i in 0..n {
            let th = TAU * i as f64 / n as f64;
            let (s, c) = th.sin_cos();
            nodes.push(Node {
                pos: [r * c, r * s, 0.0],
                fix: [false, false, true],
                load: [p_eff * arc * c, p_eff * arc * s, 0.0],
            });
        }
        let mut members = Vec::with_capacity(2 * n);
        for i in 0..n {
            members.push(Member {
                i,
                j: (i + 1) % n,
                area: wall_t,
                e: e_hull,
                tension_only: false,
            });
            members.push(Member {
                i,
                j: (i + k) % n,
                area: cable_area,
                e: e_cable,
                tension_only: true,
            });
        }
        // No hub here, so nothing grounds the in-plane rigid-body modes — pin them
        // explicitly (node 0 fully, its antipode in y), or every secant web reads as a
        // false mechanism. The radial load is self-equilibrated, so the reactions are ~0.
        nodes[0].fix = [true, true, true];
        let anti = n / 2;
        nodes[anti].fix[1] = true;
        Model { nodes, members }
    }
}

// ─────────────────────────────────── tests ──────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() <= tol * (1.0 + b.abs())
    }

    #[test]
    fn la_solves_small_system() {
        // [2 1; 1 3] x = [3; 5]  →  x = [0.8; 1.4]
        let x = la::solve(vec![2.0, 1.0, 1.0, 3.0], vec![3.0, 5.0], 2).unwrap();
        assert!(approx(x[0], 0.8, 1e-9) && approx(x[1], 1.4, 1e-9));
    }

    #[test]
    fn single_bar_carries_its_load() {
        // bar from fixed (0,0,0) to free (0,-L,0); pull the free node down by P.
        // Axial force must equal P (tension), elongation PL/EA.
        let (l, ea, p) = (2.0, 1.0e6, 1000.0);
        let m = net::Model {
            nodes: vec![
                net::Node { pos: [0.0, 0.0, 0.0], fix: [true, true, true], load: [0.0, 0.0, 0.0] },
                // pin x & z: a lone axial bar gives no lateral stiffness (that would be a
                // mechanism — see `mechanism_is_detected`), so leave only the axial y free.
                net::Node { pos: [0.0, -l, 0.0], fix: [true, false, true], load: [0.0, -p, 0.0] },
            ],
            members: vec![net::Member { i: 0, j: 1, area: 1.0, e: ea, tension_only: false }],
        };
        let s = m.solve();
        assert!(!s.mechanism);
        assert!(approx(s.members[0].force, p, 1e-6), "force {}", s.members[0].force);
        assert!(approx(s.disp[1][1], -p * l / ea, 1e-6), "disp {}", s.disp[1][1]);
    }

    #[test]
    fn symmetric_two_bar_truss() {
        // supports (-1,0,0),(1,0,0); free node (0,-1,0) loaded (0,-P,0).
        // Each bar at 45°, vertical component sin45 → 2·F·(1/√2)=P → F=P/√2 (tension).
        let p = 1000.0;
        let m = net::Model {
            nodes: vec![
                net::Node { pos: [-1.0, 0.0, 0.0], fix: [true, true, true], load: [0.0, 0.0, 0.0] },
                net::Node { pos: [1.0, 0.0, 0.0], fix: [true, true, true], load: [0.0, 0.0, 0.0] },
                net::Node { pos: [0.0, -1.0, 0.0], fix: [false, false, true], load: [0.0, -p, 0.0] },
            ],
            members: vec![
                net::Member { i: 0, j: 2, area: 1.0, e: 1.0e7, tension_only: false },
                net::Member { i: 1, j: 2, area: 1.0, e: 1.0e7, tension_only: false },
            ],
        };
        let s = m.solve();
        assert!(!s.mechanism);
        let expect = p / 2.0_f64.sqrt();
        assert!(approx(s.members[0].force, expect, 1e-4), "f0 {}", s.members[0].force);
        assert!(approx(s.members[1].force, expect, 1e-4), "f1 {}", s.members[1].force);
    }

    #[test]
    fn mechanism_is_detected() {
        // one bar along x, free node loaded along y (perpendicular) → no stiffness → singular.
        let m = net::Model {
            nodes: vec![
                net::Node { pos: [0.0, 0.0, 0.0], fix: [true, true, true], load: [0.0, 0.0, 0.0] },
                net::Node { pos: [1.0, 0.0, 0.0], fix: [false, false, true], load: [0.0, -1.0, 0.0] },
            ],
            members: vec![net::Member { i: 0, j: 1, area: 1.0, e: 1.0e7, tension_only: false }],
        };
        assert!(m.solve().mechanism);
    }

    #[test]
    fn steel_is_material_limited_at_10km_1g() {
        // The classic result: steel can't spin a 1g habitat much past a few km.
        let s = analytic::hoop(&analytic::HoopSpec {
            radius: 10_000.0, g_rim: 1.0, wall_t: 1.0, sf: 1.5,
            atm: 70_000.0, reg_depth: 2.0, reg_density: 1500.0, interior_load: 800.0,
            hull: analytic::Material { strength: 350e6, density: 7850.0 },
            web_share: 0.8,
        });
        assert!(s.material_limited && !s.feasible);
        assert!(s.r_max < 4_000.0 && s.r_max > 2_000.0, "steel r_max {}", s.r_max);
    }

    #[test]
    fn carbon_holds_a_10km_1g_cylinder() {
        let s = analytic::hoop(&analytic::HoopSpec {
            radius: 10_000.0, g_rim: 1.0, wall_t: 1.0, sf: 1.5,
            atm: 70_000.0, reg_depth: 2.0, reg_density: 1500.0, interior_load: 800.0,
            hull: analytic::Material { strength: 6400e6, density: 1800.0 },
            web_share: 0.8,
        });
        assert!(!s.material_limited && s.feasible);
        // carbon's 1g radius ceiling is hundreds of km
        assert!(s.r_max > 200_000.0, "carbon r_max {}", s.r_max);
    }

    #[test]
    fn spoked_wheel_holds_and_spokes_take_tension() {
        // outward-loaded rim, fixed hub: spokes must come out in tension, no mechanism.
        let m = cylinder::spoked_wheel(
            1000.0, 24, 1.0e5, /*wall_t*/ 0.5, /*e_hull*/ 2.0e11,
            /*cable_area*/ 0.02, /*e_cable*/ 1.3e11,
        );
        let s = m.solve();
        assert!(!s.mechanism, "spoked wheel should be stable");
        // members alternate hull, spoke, hull, spoke, …
        let mut spokes = 0;
        for (idx, mr) in s.members.iter().enumerate() {
            if idx % 2 == 1 {
                spokes += 1;
                assert!(mr.force > 0.0, "spoke {} should be tension, got {}", idx, mr.force);
                assert!(mr.force.is_finite());
            }
        }
        assert_eq!(spokes, 24);
    }

    #[test]
    fn secant_web_is_stable_and_carries_load() {
        // A coprime secant web {16/5}, rigid-body pinned, should solve (not a mechanism)
        // with at least some chord pulling in tension.
        let m = cylinder::secant_web(
            1000.0, 16, 5, 1.0e5, /*wall_t*/ 0.5, /*e_hull*/ 2.0e11,
            /*cable_area*/ 0.05, /*e_cable*/ 2.95e11,
        );
        let s = m.solve();
        assert!(!s.mechanism, "a coprime secant web should be stable");
        let chord_tension = s
            .members
            .iter()
            .enumerate()
            .filter(|(idx, _)| idx % 2 == 1) // chords are the odd members
            .any(|(_, mr)| mr.force > 1.0);
        assert!(chord_tension, "at least one chord should carry tension");
    }
}
