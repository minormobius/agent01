//! How far a sound gets before the air eats it.
//!
//! This module is the load-bearing science of the whole surface. The reason a
//! 5 kHz prophalangopsid can call across a Jurassic clearing and a 22 kHz one
//! cannot is *not* that the ultrasonic insect is quieter — it is that air
//! absorbs sound roughly as the square of frequency, so the ultrasonic call is
//! spent within a few tens of metres. The map draws that as a radius; the
//! mixer hears it as a gain. Both come from here.
//!
//! `absorption_db_per_m` is ISO 9613-1:1993 verbatim (classical + rotational
//! losses, plus vibrational relaxation of O₂ and N₂). `foliage_db_per_m` is the
//! dense-foliage row of ISO 9613-2:1996 Table 6, log-interpolated — see the note
//! on that function for where it stops being a standard and starts being an
//! extrapolation.

/// Reference air temperature, K (20 °C).
pub const T0: f64 = 293.15;
/// Triple-point isotherm, K.
pub const T01: f64 = 273.16;
/// Reference ambient pressure, kPa.
pub const PR: f64 = 101.325;

/// Pure-tone atmospheric attenuation in dB per metre. ISO 9613-1:1993 §6.
///
/// * `f_hz` — tone frequency
/// * `t_c`  — air temperature, °C
/// * `rh`   — relative humidity, %
/// * `p_kpa`— ambient pressure, kPa
///
/// Humidity is not a detail here: absorption at 20 kHz varies by roughly a
/// factor of three between a dry and a saturated forest, which moves the
/// ultrasonic audible radius by tens of metres.
pub fn absorption_db_per_m(f_hz: f64, t_c: f64, rh: f64, p_kpa: f64) -> f64 {
    if f_hz <= 0.0 {
        return 0.0;
    }
    let t = t_c + 273.15;
    let pa = p_kpa / PR;

    // Saturation vapour pressure as a fraction of the reference pressure, then
    // the molar concentration of water vapour in per cent.
    let psat = 10f64.powf(-6.8346 * (T01 / t).powf(1.261) + 4.6151);
    let h = rh * psat / pa;

    // Relaxation frequencies of oxygen and nitrogen.
    let fr_o = pa * (24.0 + 4.04e4 * h * (0.02 + h) / (0.391 + h));
    let fr_n = pa * (t / T0).powf(-0.5)
        * (9.0 + 280.0 * h * (-4.170 * ((t / T0).powf(-1.0 / 3.0) - 1.0)).exp());

    let f2 = f_hz * f_hz;
    let classical = 1.84e-11 / pa * (t / T0).sqrt();
    let o2 = 0.01275 * (-2239.1 / t).exp() / (fr_o + f2 / fr_o);
    let n2 = 0.1068 * (-3352.0 / t).exp() / (fr_n + f2 / fr_n);

    8.686 * f2 * (classical + (t / T0).powf(-2.5) * (o2 + n2))
}

/// Octave-band centres and dense-foliage attenuation, dB per metre of foliage
/// path — ISO 9613-2:1996 Table 6, second row (propagation distance 10–20 m).
const FOLIAGE_HZ: [f64; 8] = [63.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0];
const FOLIAGE_DB: [f64; 8] = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.09, 0.12];

/// Excess attenuation from scattering off leaves, dB per metre, for a path
/// through *dense* foliage. Multiply by a 0–1 canopy density for thinner cover.
///
/// **Honesty note.** ISO 9613-2 tabulates this only to 8 kHz, which is where a
/// standard written for road and industrial noise stops caring. Everything
/// above 8 kHz here is a log-log extrapolation of the top two octaves, and the
/// ultrasonic band is therefore the least trustworthy number on the page — it
/// is a plausible continuation of a rising trend, not a measurement. It matters
/// much less than it looks: at 20 kHz atmospheric absorption alone is already
/// an order of magnitude larger than this term.
pub fn foliage_db_per_m(f_hz: f64) -> f64 {
    if f_hz <= FOLIAGE_HZ[0] {
        return FOLIAGE_DB[0];
    }
    let n = FOLIAGE_HZ.len();
    for i in 1..n {
        if f_hz <= FOLIAGE_HZ[i] {
            let t = (f_hz.ln() - FOLIAGE_HZ[i - 1].ln())
                / (FOLIAGE_HZ[i].ln() - FOLIAGE_HZ[i - 1].ln());
            return FOLIAGE_DB[i - 1] * (FOLIAGE_DB[i] / FOLIAGE_DB[i - 1]).powf(t);
        }
    }
    // Above the table: continue the 4→8 kHz log-log slope.
    let slope = (FOLIAGE_DB[n - 1] / FOLIAGE_DB[n - 2]).ln()
        / (FOLIAGE_HZ[n - 1] / FOLIAGE_HZ[n - 2]).ln();
    FOLIAGE_DB[n - 1] * (f_hz / FOLIAGE_HZ[n - 1]).powf(slope)
}

/// Total transmission loss in dB from a source at 1 m to a receiver at `r_m`:
/// spherical spreading plus atmospheric absorption plus foliage scattering.
///
/// Held at 0 dB inside 1 m — the near field of a 70 mm wing is not a point
/// source, and pretending otherwise only produces a divide-by-zero.
pub fn transmission_loss_db(
    r_m: f64,
    f_hz: f64,
    t_c: f64,
    rh: f64,
    p_kpa: f64,
    canopy: f64,
) -> f64 {
    let r = if r_m < 1.0 { 1.0 } else { r_m };
    let spreading = 20.0 * r.log10();
    let air = absorption_db_per_m(f_hz, t_c, rh, p_kpa) * r;
    let leaves = foliage_db_per_m(f_hz) * canopy * r;
    spreading + air + leaves
}

/// The distance at which a source of `spl_db` (dB SPL at 1 m) falls to
/// `threshold_db` at the receiver.
///
/// Transmission loss is strictly increasing in `r`, so a bisection is exact to
/// the tolerance and cannot get stuck the way a Newton step on the log term
/// can. Returns 1 m if the source is already inaudible at 1 m, and clamps at
/// 4 km, past which no insect is a going concern.
pub fn audible_radius_m(
    spl_db: f64,
    threshold_db: f64,
    f_hz: f64,
    t_c: f64,
    rh: f64,
    p_kpa: f64,
    canopy: f64,
) -> f64 {
    let budget = spl_db - threshold_db;
    if budget <= 0.0 {
        return 1.0;
    }
    let (mut lo, mut hi) = (1.0f64, 4000.0f64);
    if transmission_loss_db(hi, f_hz, t_c, rh, p_kpa, canopy) < budget {
        return hi;
    }
    for _ in 0..64 {
        let mid = 0.5 * (lo + hi);
        if transmission_loss_db(mid, f_hz, t_c, rh, p_kpa, canopy) < budget {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}
