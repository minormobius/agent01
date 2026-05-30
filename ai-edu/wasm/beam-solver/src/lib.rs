// Euler-Bernoulli beam, shared solver for two problems:
//
//   1. Static deflection — given mounting (BC) and loading, solve
//      K u = f for the deflection field; report max |w|.
//   2. Free-vibration eigenproblem — solve K phi = omega^2 M phi for
//      natural frequencies and mode shapes of the cantilever.
//
// Hermite cubic elements throughout (2 DOFs per node: w, theta).
// Consistent mass matrix for vibration. Non-dimensionalized
// EI = rho*A = L = 1, so closed-form comparisons drop unit prefactors.

use nalgebra::{DMatrix, DVector, SymmetricEigen};
use wasm_bindgen::prelude::*;

fn element_k(le: f64, ei: f64) -> [[f64; 4]; 4] {
    let c = ei / (le * le * le);
    let le2 = le * le;
    [
        [ 12.0 * c,         6.0 * le * c,  -12.0 * c,         6.0 * le * c],
        [  6.0 * le * c,    4.0 * le2 * c,  -6.0 * le * c,    2.0 * le2 * c],
        [-12.0 * c,        -6.0 * le * c,   12.0 * c,        -6.0 * le * c],
        [  6.0 * le * c,    2.0 * le2 * c,  -6.0 * le * c,    4.0 * le2 * c],
    ]
}

fn element_m(le: f64, rho_a: f64) -> [[f64; 4]; 4] {
    let c = rho_a * le / 420.0;
    let le2 = le * le;
    [
        [156.0 * c,    22.0 * le * c,   54.0 * c,   -13.0 * le * c],
        [ 22.0 * le * c,  4.0 * le2 * c, 13.0 * le * c, -3.0 * le2 * c],
        [ 54.0 * c,    13.0 * le * c,  156.0 * c,  -22.0 * le * c],
        [-13.0 * le * c, -3.0 * le2 * c, -22.0 * le * c, 4.0 * le2 * c],
    ]
}

fn hermite_eval(u: &DVector<f64>, n_elements: usize, x: f64) -> f64 {
    let le = 1.0 / (n_elements as f64);
    let e = ((x / le).floor() as usize).min(n_elements - 1);
    let xi = (x - e as f64 * le) / le;
    let xi2 = xi * xi;
    let xi3 = xi2 * xi;
    let h1 = 1.0 - 3.0 * xi2 + 2.0 * xi3;
    let h2 = le * (xi - 2.0 * xi2 + xi3);
    let h3 = 3.0 * xi2 - 2.0 * xi3;
    let h4 = le * (-xi2 + xi3);
    h1 * u[2 * e] + h2 * u[2 * e + 1]
        + h3 * u[2 * (e + 1)] + h4 * u[2 * (e + 1) + 1]
}

// =============================================================
// Static deflection (Problem 1: beam-deflection)
// =============================================================

/// Returns the fixed-DOF index list for a given BC and node count.
fn fixed_dofs(bc: &str, n_elements: usize) -> Vec<usize> {
    let last_w = 2 * n_elements;
    let last_t = 2 * n_elements + 1;
    match bc {
        "cantilever"        => vec![0, 1],
        "simply_supported"  => vec![0, last_w],
        "clamped_clamped"   => vec![0, 1, last_w, last_t],
        _ => panic!("unknown BC"),
    }
}

/// Solve K u = f for a unit beam (EI = L = 1) under one of six
/// canonical mounting + loading combinations. Magnitude of load is
/// unity (P = 1 or w_load = 1 in dimensionless units).
///
/// Returns a flat Vec<f64> with layout:
///   [max_w, x_at_max, w_0, theta_0, w_1, theta_1, ..., w_N, theta_N]
///
/// `bc`   in {"cantilever", "simply_supported", "clamped_clamped"}
/// `load` in {"point", "udl"}
///   - point load applied at the tip (cantilever) or midspan (SS/CC)
///   - UDL is uniformly distributed across the full length
#[wasm_bindgen]
pub fn deflect_static(n_elements: usize, bc: &str, load: &str) -> Vec<f64> {
    let ei = 1.0_f64;
    let le = 1.0 / (n_elements as f64);
    let n_dof = 2 * (n_elements + 1);

    // Assemble global K
    let mut k = DMatrix::<f64>::zeros(n_dof, n_dof);
    let ke = element_k(le, ei);
    for e in 0..n_elements {
        let i0 = 2 * e;
        for a in 0..4 {
            for b in 0..4 {
                k[(i0 + a, i0 + b)] += ke[a][b];
            }
        }
    }

    // Assemble global force vector
    let mut f = DVector::<f64>::zeros(n_dof);
    match load {
        "point" => {
            let target_node = match bc {
                "cantilever" => n_elements,
                _ => n_elements / 2, // assumes even N for clean midspan
            };
            f[2 * target_node] = 1.0;
        }
        "udl" => {
            let w_load = 1.0_f64;
            for e in 0..n_elements {
                let i0 = 2 * e;
                f[i0]     += w_load * le / 2.0;
                f[i0 + 1] += w_load * le * le / 12.0;
                f[i0 + 2] += w_load * le / 2.0;
                f[i0 + 3] += -w_load * le * le / 12.0;
            }
        }
        _ => panic!("unknown load"),
    }

    // Partition DOFs into free and fixed
    let fixed = fixed_dofs(bc, n_elements);
    let is_fixed: Vec<bool> = (0..n_dof).map(|i| fixed.contains(&i)).collect();
    let free_idx: Vec<usize> = (0..n_dof).filter(|i| !is_fixed[*i]).collect();
    let n_free = free_idx.len();

    let mut k_free = DMatrix::<f64>::zeros(n_free, n_free);
    let mut f_free = DVector::<f64>::zeros(n_free);
    for (i, &gi) in free_idx.iter().enumerate() {
        for (j, &gj) in free_idx.iter().enumerate() {
            k_free[(i, j)] = k[(gi, gj)];
        }
        f_free[i] = f[gi];
    }

    // Solve. K is SPD after BC application, so Cholesky.
    let chol = k_free.cholesky().expect("stiffness matrix not SPD");
    let u_free = chol.solve(&f_free);

    // Reconstruct full DOF vector
    let mut u = DVector::<f64>::zeros(n_dof);
    for (i, &gi) in free_idx.iter().enumerate() {
        u[gi] = u_free[i];
    }

    // Find max |w| across the Hermite-interpolated deflection field.
    let n_samples = 400;
    let mut max_w_abs = 0.0_f64;
    let mut max_w = 0.0_f64;
    let mut x_max = 0.0_f64;
    for s in 0..=n_samples {
        let x = s as f64 / n_samples as f64;
        let w = hermite_eval(&u, n_elements, x);
        if w.abs() > max_w_abs {
            max_w_abs = w.abs();
            max_w = w;
            x_max = x;
        }
    }

    let mut out = Vec::with_capacity(2 + n_dof);
    out.push(max_w);
    out.push(x_max);
    for v in u.iter() {
        out.push(*v);
    }
    out
}

/// Closed-form magnitude of max deflection for the six canonical
/// cases, all evaluated at EI = L = P = w_load = 1.
///
/// Returns [delta_max, x_at_max].
#[wasm_bindgen]
pub fn closed_form_deflection(bc: &str, load: &str) -> Vec<f64> {
    let (delta, x) = match (bc, load) {
        ("cantilever",       "point") => (1.0 / 3.0,        1.0),
        ("cantilever",       "udl")   => (1.0 / 8.0,        1.0),
        ("simply_supported", "point") => (1.0 / 48.0,       0.5),
        ("simply_supported", "udl")   => (5.0 / 384.0,      0.5),
        ("clamped_clamped",  "point") => (1.0 / 192.0,      0.5),
        ("clamped_clamped",  "udl")   => (1.0 / 384.0,      0.5),
        _ => panic!("unknown bc+load combination"),
    };
    vec![delta, x]
}

// =============================================================
// 2D pin-jointed truss (Problem 2: truss)
// =============================================================

/// Solve a 2D pin-jointed truss by the direct stiffness method.
/// All members have unit axial stiffness EA = 1, so each member's
/// stiffness is 1/L. Inputs are flat arrays (built by the JS bridge
/// generators); DOF k of node n is global index 2n (x) / 2n+1 (y).
///
///   node_x, node_y    : nodal coordinates (length = n_nodes)
///   member_i, member_j: end-node indices of each member
///   fixed_dofs        : global DOF indices held at zero (supports)
///   load_dofs/load_vals: applied nodal forces
///
/// Returns a flat Vec<f64>:
///   [ member_force_0 .. member_force_{M-1},   (tension +, compression -)
///     u_0 .. u_{2N-1} ]                        (nodal displacements)
///
/// If the assembled system is singular (the truss is a mechanism),
/// returns a single-element vec [NaN].
#[wasm_bindgen]
pub fn solve_truss(
    node_x: Vec<f64>,
    node_y: Vec<f64>,
    member_i: Vec<u32>,
    member_j: Vec<u32>,
    fixed_dofs: Vec<u32>,
    load_dofs: Vec<u32>,
    load_vals: Vec<f64>,
) -> Vec<f64> {
    let n_nodes = node_x.len();
    let n_dof = 2 * n_nodes;
    let n_members = member_i.len();

    let mut k = DMatrix::<f64>::zeros(n_dof, n_dof);
    // Cache (i, j, c, s, ea_over_l) per member for force recovery.
    let mut geom: Vec<(usize, usize, f64, f64, f64)> = Vec::with_capacity(n_members);

    for m in 0..n_members {
        let i = member_i[m] as usize;
        let j = member_j[m] as usize;
        let dx = node_x[j] - node_x[i];
        let dy = node_y[j] - node_y[i];
        let len = (dx * dx + dy * dy).sqrt();
        let c = dx / len;
        let s = dy / len;
        let ea_over_l = 1.0 / len; // EA = 1

        let kl = [
            [ c * c,  c * s, -c * c, -c * s],
            [ c * s,  s * s, -c * s, -s * s],
            [-c * c, -c * s,  c * c,  c * s],
            [-c * s, -s * s,  c * s,  s * s],
        ];
        let dofs = [2 * i, 2 * i + 1, 2 * j, 2 * j + 1];
        for a in 0..4 {
            for b in 0..4 {
                k[(dofs[a], dofs[b])] += ea_over_l * kl[a][b];
            }
        }
        geom.push((i, j, c, s, ea_over_l));
    }

    let mut f = DVector::<f64>::zeros(n_dof);
    for (idx, &d) in load_dofs.iter().enumerate() {
        f[d as usize] += load_vals[idx];
    }

    let is_fixed: Vec<bool> =
        (0..n_dof).map(|i| fixed_dofs.contains(&(i as u32))).collect();
    let free_idx: Vec<usize> = (0..n_dof).filter(|i| !is_fixed[*i]).collect();
    let n_free = free_idx.len();

    let mut k_free = DMatrix::<f64>::zeros(n_free, n_free);
    let mut f_free = DVector::<f64>::zeros(n_free);
    for (a, &ga) in free_idx.iter().enumerate() {
        for (b, &gb) in free_idx.iter().enumerate() {
            k_free[(a, b)] = k[(ga, gb)];
        }
        f_free[a] = f[ga];
    }

    // A well-formed determinate (or redundant) truss gives an SPD
    // reduced stiffness matrix. Cholesky fails on a mechanism.
    let u_free = match k_free.cholesky() {
        Some(chol) => chol.solve(&f_free),
        None => return vec![f64::NAN],
    };

    let mut u = DVector::<f64>::zeros(n_dof);
    for (a, &ga) in free_idx.iter().enumerate() {
        u[ga] = u_free[a];
    }

    let mut out = Vec::with_capacity(n_members + n_dof);
    for &(i, j, c, s, ea_over_l) in &geom {
        // Axial force, tension positive:
        // F = (EA/L) * [ (u_j - u_i) . (c, s) ]
        let elong = c * (u[2 * j] - u[2 * i]) + s * (u[2 * j + 1] - u[2 * i + 1]);
        out.push(ea_over_l * elong);
    }
    for v in u.iter() {
        out.push(*v);
    }
    out
}

// =============================================================
// Free vibration (Problem 3: beam-vibration)
// =============================================================

/// Solve for the first `n_modes` natural frequencies AND mode shapes
/// of a unit uniform cantilever. Returns a flat Vec<f64> with layout:
///
///   [omega_1, omega_2, ..., omega_M,
///    w_0_m1, t_0_m1, w_1_m1, t_1_m1, ..., w_N_m1, t_N_m1,
///    w_0_m2, t_0_m2, ..., w_N_mM, t_N_mM]
///
/// Total length: M + M * 2 * (N + 1). Mode shapes are padded with
/// zeros at the fixed DOFs (w_0 = t_0 = 0) and normalized so that
/// max |w_i| = 1 with the sign convention that the tip deflection is
/// non-negative.
#[wasm_bindgen]
pub fn solve_cantilever_with_modes(n_elements: usize, n_modes: usize) -> Vec<f64> {
    let l = 1.0_f64;
    let ei = 1.0_f64;
    let rho_a = 1.0_f64;
    let le = l / (n_elements as f64);
    let n_dof = 2 * (n_elements + 1);

    let mut k = DMatrix::<f64>::zeros(n_dof, n_dof);
    let mut m = DMatrix::<f64>::zeros(n_dof, n_dof);

    let ke = element_k(le, ei);
    let me = element_m(le, rho_a);

    for e in 0..n_elements {
        let i0 = 2 * e;
        for a in 0..4 {
            for b in 0..4 {
                k[(i0 + a, i0 + b)] += ke[a][b];
                m[(i0 + a, i0 + b)] += me[a][b];
            }
        }
    }

    let n_free = n_dof - 2;
    let mut k_free = DMatrix::<f64>::zeros(n_free, n_free);
    let mut m_free = DMatrix::<f64>::zeros(n_free, n_free);
    for i in 0..n_free {
        for j in 0..n_free {
            k_free[(i, j)] = k[(i + 2, j + 2)];
            m_free[(i, j)] = m[(i + 2, j + 2)];
        }
    }

    let chol = m_free.cholesky().expect("mass matrix not SPD");
    let l_mat = chol.l();
    let l_inv = l_mat.try_inverse().expect("L not invertible");
    let l_inv_t = l_inv.transpose();
    let a = &l_inv * &k_free * &l_inv_t;
    let a_sym = (&a + a.transpose()) * 0.5;

    let eig = SymmetricEigen::new(a_sym);

    // Sort eigenvalue indices ascending. (SymmetricEigen does not
    // guarantee order.)
    let mut order: Vec<usize> = (0..eig.eigenvalues.len()).collect();
    order.sort_by(|&i, &j| {
        eig.eigenvalues[i]
            .partial_cmp(&eig.eigenvalues[j])
            .unwrap()
    });

    let n_modes = n_modes.min(order.len());
    let mut out = Vec::with_capacity(n_modes + n_modes * n_dof);

    // Frequencies
    for &i in order.iter().take(n_modes) {
        let lambda = eig.eigenvalues[i].max(0.0);
        out.push(lambda.sqrt());
    }

    // Mode shapes: back-transform psi -> phi = L^{-T} psi, pad fixed
    // DOFs with zeros, normalize.
    for &i in order.iter().take(n_modes) {
        let psi = eig.eigenvectors.column(i);
        let phi_free = &l_inv_t * psi;

        // Tip deflection sign convention: w at last node should be >= 0.
        // Last w in phi_free is at index n_free - 2.
        let tip_w = phi_free[n_free - 2];
        let sign = if tip_w >= 0.0 { 1.0 } else { -1.0 };

        // Normalize by max |w| across all w-DOFs in the free vector.
        let mut max_w = 0.0_f64;
        for (j, v) in phi_free.iter().enumerate() {
            if j % 2 == 0 {
                max_w = max_w.max(v.abs());
            }
        }
        let scale = if max_w > 1e-12 { sign / max_w } else { 1.0 };

        // Fixed DOFs at the base.
        out.push(0.0);
        out.push(0.0);
        for v in phi_free.iter() {
            out.push(v * scale);
        }
    }

    out
}

#[wasm_bindgen]
pub fn closed_form_cantilever(n_modes: usize) -> Vec<f64> {
    // Tabulated beta_n * L roots for the cantilever transcendental
    // characteristic equation cos(beta L) cosh(beta L) + 1 = 0.
    let beta_l = [
        1.8751040687119611_f64,
        4.694091132974175,
        7.854757438237613,
        10.995540734875467,
        14.137168391046470,
    ];
    beta_l
        .iter()
        .take(n_modes)
        .map(|bl| bl * bl)
        .collect()
}
