//! A radix-2 complex FFT, and the 2D transform built from it.
//!
//! Written out rather than pulled in, because the whole point of the page is
//! that the reconstruction is *the* Fourier transform and nothing else — no
//! model, no prior, no network. Sixty lines of Cooley–Tukey is the entire
//! reconstruction algorithm of a clinical MRI scanner.
//!
//! Complex data is stored interleaved, `[re, im, re, im, …]`, which is also how
//! it crosses into JavaScript.

/// In-place 1D FFT of `n` complex samples (`data.len() == 2n`, `n` a power of
/// two). `inverse` also applies the 1/n normalisation.
pub fn fft(data: &mut [f64], inverse: bool) {
    let n = data.len() / 2;
    if n <= 1 {
        return;
    }
    debug_assert!(n.is_power_of_two(), "radix-2 FFT needs a power of two");

    // Bit-reversal permutation.
    let mut j = 0usize;
    for i in 0..n {
        if i < j {
            data.swap(2 * i, 2 * j);
            data.swap(2 * i + 1, 2 * j + 1);
        }
        let mut m = n >> 1;
        while m >= 1 && j & m != 0 {
            j ^= m;
            m >>= 1;
        }
        j |= m;
    }

    let sign = if inverse { 1.0 } else { -1.0 };
    let mut len = 2usize;
    while len <= n {
        let ang = sign * 2.0 * std::f64::consts::PI / len as f64;
        let (ws, wc) = ang.sin_cos();
        for start in (0..n).step_by(len) {
            let (mut wr, mut wi) = (1.0f64, 0.0f64);
            for k in 0..len / 2 {
                let i = 2 * (start + k);
                let j = 2 * (start + k + len / 2);
                let (ur, ui) = (data[i], data[i + 1]);
                let (vr, vi) = (
                    data[j] * wr - data[j + 1] * wi,
                    data[j] * wi + data[j + 1] * wr,
                );
                data[i] = ur + vr;
                data[i + 1] = ui + vi;
                data[j] = ur - vr;
                data[j + 1] = ui - vi;
                let nwr = wr * wc - wi * ws;
                wi = wr * ws + wi * wc;
                wr = nwr;
            }
        }
        len <<= 1;
    }

    if inverse {
        let s = 1.0 / n as f64;
        for v in data.iter_mut() {
            *v *= s;
        }
    }
}

/// In-place 2D FFT of an `n × n` complex image stored row-major.
pub fn fft2(data: &mut [f64], n: usize, inverse: bool) {
    let mut row = vec![0.0f64; 2 * n];
    for r in 0..n {
        row.copy_from_slice(&data[2 * r * n..2 * (r + 1) * n]);
        fft(&mut row, inverse);
        data[2 * r * n..2 * (r + 1) * n].copy_from_slice(&row);
    }
    let mut col = vec![0.0f64; 2 * n];
    for c in 0..n {
        for r in 0..n {
            col[2 * r] = data[2 * (r * n + c)];
            col[2 * r + 1] = data[2 * (r * n + c) + 1];
        }
        fft(&mut col, inverse);
        for r in 0..n {
            data[2 * (r * n + c)] = col[2 * r];
            data[2 * (r * n + c) + 1] = col[2 * r + 1];
        }
    }
}

/// Swap quadrants, so that k = 0 sits at the centre of the array (the way
/// k-space is always displayed) rather than at index 0 (the way the FFT wants
/// it). Its own inverse for even `n`.
pub fn fftshift2(data: &mut [f64], n: usize) {
    let h = n / 2;
    for r in 0..h {
        for c in 0..n {
            let (r2, c2) = (r + h, (c + h) % n);
            let i = 2 * (r * n + c);
            let j = 2 * (r2 * n + c2);
            data.swap(i, j);
            data.swap(i + 1, j + 1);
        }
    }
}
