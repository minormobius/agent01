// biome_stability — the native/WASM sister of cycles/sim/stability.mjs.
//
// The JS layer owns the ecology: it builds the community matrix J by finite-differencing
// the real nonlinear model at equilibrium. This crate owns the LINEAR ALGEBRA on that
// matrix — the part the repo's other solvers (beam-solver, flight-solver) also push to
// Rust/nalgebra for speed and numerical robustness as the problem grows:
//
//   • spectrum(J)            — eigenvalues of the real, non-symmetric community matrix
//   • spectral_abscissa(J)   — max Re(λ): the asymptotic-stability verdict (May 1972)
//   • reactivity(J)          — λmax of (J+Jᵀ)/2: transient amplification (Neubert 1997)
//   • press(J) = −J⁻¹        — equilibrium sensitivity to a sustained nudge (Bender 1984)
//
// The core functions are plain Rust and unit-tested natively (`cargo test`); the
// wasm-bindgen entry point is compiled only for wasm32. For our 6–16 dim matrices the JS
// kernel is already instant — this crate is the precision/scale path and the demonstration
// that the solver follows the repo's established Rust→WASM pattern.

use nalgebra::DMatrix;
use serde::Serialize;

/// Build an n×n matrix from a row-major flat slice.
fn mat(flat: &[f64], n: usize) -> DMatrix<f64> {
    assert_eq!(flat.len(), n * n, "flat length must be n*n");
    DMatrix::from_row_slice(n, n, flat)
}

/// Eigenvalues of a real (generally non-symmetric) matrix, as (re, im) pairs.
pub fn spectrum(j: &DMatrix<f64>) -> Vec<(f64, f64)> {
    j.clone()
        .complex_eigenvalues()
        .iter()
        .map(|c| (c.re, c.im))
        .collect()
}

/// Spectral abscissa α = max Re(λ). Stable iff α < 0.
pub fn spectral_abscissa(j: &DMatrix<f64>) -> f64 {
    spectrum(j)
        .iter()
        .map(|&(re, _)| re)
        .fold(f64::NEG_INFINITY, f64::max)
}

/// Reactivity = largest eigenvalue of the symmetric part (J + Jᵀ)/2.
pub fn reactivity(j: &DMatrix<f64>) -> f64 {
    let sym = (j + j.transpose()) * 0.5;
    sym.symmetric_eigenvalues()
        .iter()
        .cloned()
        .fold(f64::NEG_INFINITY, f64::max)
}

/// Press-perturbation sensitivity S = −J⁻¹ (None if J is singular).
pub fn press(j: &DMatrix<f64>) -> Option<DMatrix<f64>> {
    j.clone().try_inverse().map(|inv| -inv)
}

#[derive(Serialize)]
pub struct Analysis {
    pub eigenvalues: Vec<(f64, f64)>,
    pub spectral_abscissa: f64,
    pub stable: bool,
    pub reactivity: f64,
    pub reactive: bool,
    /// row-major −J⁻¹, or empty if J is singular
    pub press_matrix: Vec<f64>,
    pub press_ok: bool,
}

/// Full analysis of a community matrix given row-major flat + dimension.
pub fn analyze(flat: &[f64], n: usize) -> Analysis {
    let j = mat(flat, n);
    let eig = spectrum(&j);
    let alpha = eig.iter().map(|&(re, _)| re).fold(f64::NEG_INFINITY, f64::max);
    let react = reactivity(&j);
    let (press_matrix, press_ok) = match press(&j) {
        Some(s) => (s.transpose().iter().cloned().collect::<Vec<f64>>(), true), // row-major
        None => (Vec::new(), false),
    };
    Analysis {
        eigenvalues: eig,
        spectral_abscissa: alpha,
        stable: alpha < 0.0,
        reactivity: react,
        reactive: react > 0.0,
        press_matrix,
        press_ok,
    }
}

// ── WASM entry point (compiled only for wasm32) ──────────────────────────────
#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;
    use wasm_bindgen::prelude::*;

    /// Analyze a community matrix; returns the Analysis struct as a JSON string.
    #[wasm_bindgen]
    pub fn analyze_community_matrix(flat: &[f64], n: usize) -> String {
        serde_json::to_string(&analyze(flat, n)).unwrap()
    }
}

// ── Native unit tests (validate against matrices with known spectra) ─────────
#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() <= tol * (1.0 + b.abs())
    }

    #[test]
    fn diagonal_spectrum() {
        let j = DMatrix::from_row_slice(2, 2, &[-2.0, 0.0, 0.0, -3.0]);
        let mut re: Vec<f64> = spectrum(&j).iter().map(|&(r, _)| r).collect();
        re.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!(approx(re[0], -3.0, 1e-9) && approx(re[1], -2.0, 1e-9));
        assert!(spectral_abscissa(&j) < 0.0);
    }

    #[test]
    fn damped_oscillator_is_complex_pair() {
        // [[-0.5,-1],[1,-0.5]] → -0.5 ± i
        let j = DMatrix::from_row_slice(2, 2, &[-0.5, -1.0, 1.0, -0.5]);
        let s = spectrum(&j);
        assert!(s.iter().all(|&(re, _)| approx(re, -0.5, 1e-9)));
        assert!(s.iter().any(|&(_, im)| im.abs() > 0.9));
        assert!(approx(spectral_abscissa(&j), -0.5, 1e-9));
    }

    #[test]
    fn unstable_when_positive_eigenvalue() {
        let j = DMatrix::from_row_slice(2, 2, &[1.0, 0.0, 0.0, -3.0]);
        assert!(spectral_abscissa(&j) > 0.0);
        assert!(!analyze(&[1.0, 0.0, 0.0, -3.0], 2).stable);
    }

    #[test]
    fn reactivity_detects_amplification() {
        // a stable but non-normal matrix can still be reactive
        let j = DMatrix::from_row_slice(2, 2, &[-1.0, 10.0, 0.0, -1.0]);
        assert!(spectral_abscissa(&j) < 0.0); // stable
        assert!(reactivity(&j) > 0.0); // but reactive (big off-diagonal)
    }

    #[test]
    fn press_is_negative_inverse() {
        let j = DMatrix::from_row_slice(2, 2, &[-2.0, 0.0, 0.0, -4.0]);
        let s = press(&j).unwrap();
        // −J⁻¹ of diag(-2,-4) = diag(0.5, 0.25)
        assert!(approx(s[(0, 0)], 0.5, 1e-9) && approx(s[(1, 1)], 0.25, 1e-9));
    }

    #[test]
    fn trace_equals_sum_real_parts() {
        let flat = [1.0, 2.0, -1.0, 0.5, -2.0, 1.0, 3.0, 0.0, 1.0];
        let j = mat(&flat, 3);
        let trace = j[(0, 0)] + j[(1, 1)] + j[(2, 2)];
        let sum_re: f64 = spectrum(&j).iter().map(|&(re, _)| re).sum();
        assert!(approx(sum_re, trace, 1e-6));
    }
}
