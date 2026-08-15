//! Contrast: why tissues look different, rather than merely being in the right
//! place.
//!
//! Parts one and two build an image of **proton density**. That image is nearly
//! useless: brain tissue is about 70–80% water everywhere, so a pure
//! proton-density picture of a head is a fairly uniform blob. Every clinical MR
//! image you have seen is instead a picture of **how fast the magnetisation
//! recovers and decays** in each voxel — of `T₁` and `T₂` — and which of those
//! you see is a *choice*, made by picking `TR`, `TE`, and a flip angle.
//!
//! That is the thing worth understanding: an MRI does not measure tissue, it
//! measures a tissue's *response to a schedule*, and the radiographer picks the
//! schedule. Change TR and TE and the same two tissues can swap which one is
//! brighter, or become indistinguishable altogether.
//!
//! Every equation here is checked in `tests.rs` against a full Bloch simulation
//! built from [`crate::bloch`] — the same integrator part one uses — so the
//! closed forms are validated against the physics rather than against a
//! textbook.

/// A tissue, as three numbers.
#[derive(Clone, Copy, Debug)]
pub struct Tissue {
    pub name: &'static str,
    /// Longitudinal relaxation, seconds.
    pub t1: f64,
    /// Transverse relaxation, seconds.
    pub t2: f64,
    /// Reported uncertainty on T₁ and T₂, seconds.
    pub t1_sd: f64,
    pub t2_sd: f64,
    /// Proton density, relative. **All 1.0 here** — see `STANISZ_3T`.
    pub pd: f64,
}

/// Measured tissue properties at 3 T, from Stanisz GJ, Odrobina EE, Pun J,
/// Escaravage M, Graham SJ, Bronskill MJ & Henkelman RM, *T₁, T₂ relaxation
/// and magnetization transfer in tissue at 3T*, Magn Reson Med 54:507–512
/// (2005), Table 1, "This study" columns.
///
/// **Read the caveats before trusting a digit of this.**
///
/// * These are **in vitro** measurements on excised tissue at 37 °C — bovine
///   white and grey matter, mouse liver and muscle, rat kidney, human blood.
///   They are not in-vivo human numbers and do not claim to be.
/// * The same table's "Literature" column disagrees with several of them well
///   outside the quoted error: grey-matter T₁ is 1820 ± 114 ms here against
///   1470 ± 50 ms from the literature it cites. That is a 24% disagreement in
///   the single most-used tissue parameter in the field, and it is not an
///   error in either measurement — T₁ depends on preparation, temperature,
///   method, and magnetization transfer.
/// * Proton density is set to 1.0 for every tissue, because this table does not
///   measure it. So every bit of contrast this module produces comes from T₁
///   and T₂ alone. Real proton-density differences in brain are small (order
///   10%) but not zero, so this slightly overstates how much of clinical
///   contrast is relaxation.
pub const STANISZ_3T: [Tissue; 6] = [
    Tissue { name: "white matter", t1: 1.084, t2: 0.069, t1_sd: 0.045, t2_sd: 0.003, pd: 1.0 },
    Tissue { name: "grey matter",  t1: 1.820, t2: 0.099, t1_sd: 0.114, t2_sd: 0.007, pd: 1.0 },
    Tissue { name: "muscle",       t1: 1.412, t2: 0.050, t1_sd: 0.013, t2_sd: 0.004, pd: 1.0 },
    Tissue { name: "blood",        t1: 1.932, t2: 0.275, t1_sd: 0.085, t2_sd: 0.050, pd: 1.0 },
    Tissue { name: "liver",        t1: 0.812, t2: 0.042, t1_sd: 0.064, t2_sd: 0.003, pd: 1.0 },
    Tissue { name: "cartilage",    t1: 1.168, t2: 0.027, t1_sd: 0.018, t2_sd: 0.003, pd: 1.0 },
];

pub fn tissue(name: &str) -> Tissue {
    *STANISZ_3T
        .iter()
        .find(|t| t.name == name)
        .unwrap_or(&STANISZ_3T[0])
}

/// A pulse sequence, as the schedule it imposes.
#[derive(Clone, Copy, Debug)]
pub enum Sequence {
    /// 90° — TE/2 — 180° — TE/2 — read, repeated every TR. The workhorse.
    SpinEcho { tr: f64, te: f64 },
    /// 180° — TI — (spin echo). Used to *delete* a tissue: choose TI so that
    /// one T₁ is passing through zero at the moment of excitation.
    InversionRecovery { tr: f64, ti: f64, te: f64 },
    /// Spoiled gradient echo (FLASH): a small flip angle every TR, transverse
    /// magnetisation destroyed between repetitions. Fast, and reads T₂* rather
    /// than T₂ because there is no refocusing pulse.
    SpoiledGradientEcho { tr: f64, te: f64, flip: f64 },
}

impl Sequence {
    /// Steady-state signal from a tissue, as a fraction of its full
    /// magnetisation. `t2star` is used only by the gradient-echo case.
    pub fn signal(&self, t: &Tissue, t2star: f64) -> f64 {
        match *self {
            // The exact spin-echo steady state, including the fact that the
            // 180° pulse arrives TE/2 into the recovery period rather than at
            // its start. The simplified PD·(1−e^{−TR/T₁})·e^{−TE/T₂} that most
            // texts print drops that middle term; `tests.rs` measures how much
            // that matters, against a Bloch simulation.
            Sequence::SpinEcho { tr, te } => {
                let e1 = (-tr / t.t1).exp();
                let mid = (-(tr - te / 2.0) / t.t1).exp();
                t.pd * (1.0 - 2.0 * mid + e1) * (-te / t.t2).exp()
            }
            Sequence::InversionRecovery { tr, ti, te } => {
                let s = 1.0 - 2.0 * (-ti / t.t1).exp() + (-tr / t.t1).exp();
                // Magnitude reconstruction, so the sign is lost — which is why
                // an inversion-recovery image has a dark band either side of
                // the null rather than a signed transition.
                t.pd * s.abs() * (-te / t.t2).exp()
            }
            Sequence::SpoiledGradientEcho { tr, te, flip } => {
                let e1 = (-tr / t.t1).exp();
                t.pd * flip.sin() * (1.0 - e1) / (1.0 - e1 * flip.cos()) * (-te / t2star).exp()
            }
        }
    }
}

/// The **Ernst angle**: the flip angle that maximises spoiled gradient-echo
/// signal for a given `TR/T₁`, `cos α = e^(−TR/T₁)`.
///
/// Ernst RR & Anderson WA, *Rev Sci Instrum* 37:93–102 (1966). Differentiate
/// the gradient-echo signal with respect to α and this falls out. It maximises
/// *signal* for one tissue — not contrast between two, which is a different
/// optimisation and generally has a different answer.
pub fn ernst_angle(tr: f64, t1: f64) -> f64 {
    (-tr / t1).exp().acos()
}

/// The inversion time that nulls a given `T₁`: `TI = T₁ · ln(2 / (1 + e^(−TR/T₁)))`.
///
/// For `TR ≫ T₁` this is the familiar `T₁ · ln 2`. With a finite TR the
/// magnetisation has not fully recovered before the inversion, so the null
/// comes earlier — which is why a STIR sequence's TI has to be re-derived when
/// the TR changes, and why the same TI does not null fat on two scanners with
/// different protocols.
pub fn null_time(t1: f64, tr: f64) -> f64 {
    t1 * (2.0 / (1.0 + (-tr / t1).exp())).ln()
}

/// Contrast between two tissues under one sequence: the difference in signal.
///
/// This, not the signal, is what an image is *for*. A sequence can be bright
/// and useless.
pub fn contrast(a: &Tissue, b: &Tissue, seq: &Sequence, t2star: f64) -> f64 {
    seq.signal(a, t2star) - seq.signal(b, t2star)
}

/// Which of two tissues appears brighter, and by how much, as `TR` sweeps —
/// used to locate the crossing where they become indistinguishable.
///
/// There is such a crossing for most tissue pairs, because T₁ and T₂ pull
/// contrast in opposite directions: a tissue with the longer T₁ is darker on a
/// short-TR image and a tissue with the longer T₂ is brighter on a long-TE one,
/// and when a pair differs in both, some schedule cancels them exactly.
pub fn contrast_zero_crossing(
    a: &Tissue,
    b: &Tissue,
    te: f64,
    tr_lo: f64,
    tr_hi: f64,
) -> Option<f64> {
    let f = |tr: f64| contrast(a, b, &Sequence::SpinEcho { tr, te }, 1.0);
    let (mut lo, mut hi) = (tr_lo, tr_hi);
    if f(lo) * f(hi) > 0.0 {
        return None;
    }
    for _ in 0..80 {
        let mid = 0.5 * (lo + hi);
        if f(lo) * f(mid) <= 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    Some(0.5 * (lo + hi))
}
