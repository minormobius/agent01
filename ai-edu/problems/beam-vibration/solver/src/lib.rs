// Euler-Bernoulli beam, uniform cantilever, first N natural frequencies.
//
// FEM with Hermite cubic elements (2 DOFs per node: w, theta). Consistent
// mass matrix. Generalized eigenproblem K phi = lambda M phi reduced to
// standard symmetric via Cholesky factorization of M.
//
// Non-dimensionalized: EI = rho*A = L = 1, so omega_n = (beta_n L)^2 with
// no further scaling needed for the rung-1 comparison.

use nalgebra::{DMatrix, SymmetricEigen};
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

#[wasm_bindgen]
pub fn solve_uniform_cantilever(n_elements: usize, n_modes: usize) -> Vec<f64> {
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

    // Cantilever BCs: w_0 = theta_0 = 0. Drop first two rows/cols.
    let n_free = n_dof - 2;
    let mut k_free = DMatrix::<f64>::zeros(n_free, n_free);
    let mut m_free = DMatrix::<f64>::zeros(n_free, n_free);
    for i in 0..n_free {
        for j in 0..n_free {
            k_free[(i, j)] = k[(i + 2, j + 2)];
            m_free[(i, j)] = m[(i + 2, j + 2)];
        }
    }

    // Cholesky reduction: M = L L^T, A = L^{-1} K L^{-T}, symmetric.
    // SymmetricEigen on A gives the same eigenvalues as the generalized
    // problem.
    let chol = m_free.cholesky().expect("mass matrix not SPD");
    let l_mat = chol.l();
    let l_inv = l_mat.try_inverse().expect("L not invertible");
    let a = &l_inv * &k_free * l_inv.transpose();
    let a_sym = (&a + a.transpose()) * 0.5;

    let eig = SymmetricEigen::new(a_sym);
    let mut eigenvalues: Vec<f64> = eig.eigenvalues.iter().cloned().collect();
    eigenvalues.sort_by(|x, y| x.partial_cmp(y).unwrap());

    eigenvalues
        .into_iter()
        .take(n_modes)
        .map(|lambda| lambda.max(0.0).sqrt())
        .collect()
}

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
