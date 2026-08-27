//! Known-answer tests. The point of these is that the acoustics on the page
//! can be checked against something outside this repository — a published
//! standard, a published fossil — rather than against itself.

use crate::air::{absorption_db_per_m, audible_radius_m, foliage_db_per_m, transmission_loss_db};
use crate::synth::{FileShape, Voice, VoiceParams};
use crate::{Scene, MAX_FRAMES};

/// ISO 9613-2:1996 Table 2 — the atmospheric attenuation coefficient in dB per
/// kilometre, for all four tabulated combinations of temperature and humidity.
///
/// This is the load-bearing test of the surface. Every audible radius on the
/// map and every distance gain in the mixer comes out of
/// `absorption_db_per_m`, so pinning it to a published standard at four
/// conditions across eight octaves is what stops the whole thing being a
/// plausible-sounding invention. Note how much the same octave moves with the
/// weather: 8 kHz costs 118 dB/km on a cool night and 60 dB/km on a warm one.
#[test]
fn iso9613_reference_table() {
    const BANDS: [f64; 8] = [63.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0];
    // (temperature °C, relative humidity %, α per band in dB/km)
    let rows: [(f64, f64, [f64; 8]); 4] = [
        (10.0, 70.0, [0.1, 0.4, 1.0, 1.9, 3.7, 9.7, 32.8, 117.0]),
        (20.0, 70.0, [0.1, 0.3, 1.1, 2.8, 5.0, 9.0, 22.9, 76.6]),
        (30.0, 70.0, [0.1, 0.3, 1.0, 3.1, 7.4, 12.7, 23.1, 59.3]),
        (15.0, 20.0, [0.3, 0.6, 1.2, 2.7, 8.2, 28.2, 88.8, 202.1]),
    ];
    for (t_c, rh, expected) in rows {
        for (f, expect) in BANDS.iter().zip(expected.iter()) {
            let got = absorption_db_per_m(*f, t_c, rh, 101.325) * 1000.0;
            // The table is printed to one decimal, so a 0.05 dB/km absolute
            // slack covers its own rounding; 3 % covers the rest.
            let tol = (expect * 0.03).max(0.06);
            assert!(
                (got - expect).abs() < tol,
                "{t_c} °C / {rh} % RH, {f} Hz: got {got:.3} dB/km, table says {expect} ± {tol:.3}"
            );
        }
    }
}

/// The ultrasonic penalty is real and large — the premise of the whole surface.
#[test]
fn ultrasound_is_punished() {
    let a5 = absorption_db_per_m(5_000.0, 24.0, 80.0, 101.325);
    let a22 = absorption_db_per_m(22_000.0, 24.0, 80.0, 101.325);
    assert!(a22 > a5 * 5.0, "22 kHz {a22} should cost far more than 5 kHz {a5}");

    // Same source level, same forest: the ultrasonic singer's audience lives
    // in a much smaller circle.
    let r5 = audible_radius_m(90.0, 20.0, 5_000.0, 24.0, 80.0, 101.325, 0.6);
    let r22 = audible_radius_m(90.0, 20.0, 22_000.0, 24.0, 80.0, 101.325, 0.6);
    assert!(r5 > 3.0 * r22, "5 kHz reaches {r5:.1} m, 22 kHz {r22:.1} m");
}

/// The radius solver must invert the loss model exactly: at the radius it
/// returns, the received level should equal the threshold.
#[test]
fn radius_inverts_the_loss_model() {
    for f in [1_000.0, 5_000.0, 12_000.0, 22_000.0] {
        let r = audible_radius_m(88.0, 15.0, f, 24.0, 80.0, 101.325, 0.6);
        let received = 88.0 - transmission_loss_db(r, f, 24.0, 80.0, 101.325, 0.6);
        assert!(
            (received - 15.0).abs() < 0.05 || r >= 3999.0,
            "{f} Hz: at {r:.2} m the level is {received:.3} dB, not the 15 dB threshold"
        );
    }
}

/// Transmission loss must never decrease with distance, or the bisection in
/// `audible_radius_m` is unsound.
#[test]
fn loss_is_monotone_in_distance() {
    for f in [500.0, 5_000.0, 22_000.0] {
        let mut prev = f64::NEG_INFINITY;
        let mut r = 1.0;
        while r < 2000.0 {
            let l = transmission_loss_db(r, f, 24.0, 80.0, 101.325, 0.6);
            assert!(l >= prev, "loss dropped at {r} m, {f} Hz");
            prev = l;
            r *= 1.2;
        }
    }
}

/// Foliage attenuation follows the ISO 9613-2 dense-foliage row where the
/// standard has one, and keeps rising past it.
#[test]
fn foliage_matches_iso_table() {
    for (f, expect) in [(250.0, 0.04), (1000.0, 0.06), (8000.0, 0.12)] {
        let got = foliage_db_per_m(f);
        assert!((got - expect).abs() < 1e-6, "{f} Hz: {got} vs {expect}");
    }
    assert!(foliage_db_per_m(20_000.0) > foliage_db_per_m(8_000.0));
}

/// *Bacharaboilus curvus* — Gu et al. 2026 reconstruct a 5.0 kHz call from a
/// file of ~185 teeth whose spacing runs flat then flares toward the basal end
/// (their Figs. 3 and 4). Drive the synthesiser with that file and it must ring
/// at that pitch. This is where the synthesiser is pinned to a published fossil
/// rather than to itself.
#[test]
fn bacharaboilus_curvus_rings_at_its_published_pitch() {
    let sr = 48_000.0f32;
    let mut v = Voice::new();
    let mut p = VoiceParams::silent();
    p.carrier_hz = 5_000.0;
    p.tooth_rate_hz = 5_000.0;
    p.teeth = 185;
    p.q = 56.8;
    p.file = FileShape {
        sweep: 1.6,
        flare: 6.0,
        ripple: 0.0,
        ripple_cycles: 0.0,
        jitter: 0.04,
        pegs: 0,
        peg_ratio: 1.0,
    };
    p.opening = 0.7;
    p.stroke_gap_s = 0.012;
    p.syllables = 1;
    p.gap_s = 0.05;
    p.chirp_period_s = 0.4;
    p.spl_db = 90.0;
    p.seed = 7;
    v.set(p);

    // 185 teeth at 5 kHz is a ~37 ms traverse — the note IS the traverse.
    let h = p.hemisyllable_s();
    assert!(
        (h - 0.037).abs() < 0.004,
        "hemisyllable {h:.4} s, expected ~0.037 s"
    );
    // Both strokes, so the whole syllable is twice that plus the turnaround.
    assert!((p.syllable_s() - (2.0 * h + 0.012)).abs() < 1e-6);

    let buf = loudest_window(&mut v, sr, p.carrier_hz, p.tooth_rate_hz, 4096, 60);
    let f = dominant_hz(&buf, sr);
    assert!(
        (f - 5_000.0).abs() < 250.0,
        "dominant partial {f:.0} Hz, expected 5000 Hz"
    );
}

/// The file's shape has to reach the sound, or Fig. 4B is decoration.
///
/// *Allaboilus gigantus* carries about eight widely spaced pegs before a dense
/// regular file. At constant scraper velocity those pegs must arrive as
/// separated clicks — a slow start — and the file proper as a fast burst. So
/// the strike rate early in the stroke must be far below the rate later in it.
#[test]
fn a_bipartite_file_starts_slow_and_finishes_fast() {
    let plain = FileShape::plain();
    let bipartite = FileShape {
        pegs: 8,
        peg_ratio: 5.0,
        ..FileShape::plain()
    };
    let teeth = 43;
    // Spacing is private, so probe it through the duration it produces.
    let mut p = VoiceParams::silent();
    p.tooth_rate_hz = 4_930.0;
    p.teeth = teeth;
    p.file = plain;
    let flat = p.hemisyllable_s();
    p.file = bipartite;
    let pegged = p.hemisyllable_s();
    assert!(
        pegged > flat * 1.5,
        "the pegs should stretch the traverse: {pegged:.4} s vs {flat:.4} s"
    );

    // And the effect must be at the START of the file, not spread over it.
    let early = bipartite.mean_spacing(8);
    assert!(early > 4.0, "the first eight teeth should be the pegs, got {early}");
}

/// *Archaboilus polyneurus*'s file rises and falls regularly along its length,
/// which the authors read as deliberate frequency modulation. A rippled file
/// must therefore spread the call's energy over a wider band than a flat one
/// with the same carrier and Q.
#[test]
fn a_rippled_file_modulates_the_call() {
    let sr = 48_000.0f32;
    let render = |file: FileShape| {
        let mut v = Voice::new();
        let mut p = VoiceParams::silent();
        p.carrier_hz = 10_200.0;
        p.tooth_rate_hz = 10_200.0;
        p.teeth = 92;
        p.q = 36.0;
        p.file = file;
        p.syllables = 1;
        p.gap_s = 0.02;
        p.chirp_period_s = 0.25;
        p.spl_db = 88.0;
        p.seed = 4;
        v.set(p);
        loudest_window(&mut v, sr, p.carrier_hz, p.tooth_rate_hz, 4096, 60)
    };
    // Energy away from the carrier, relative to energy at it.
    let spread = |buf: &[f32]| {
        let peak = goertzel(buf, sr, 10_200.0).max(1e-12);
        let side = band_energy(buf, sr, 6_000.0, 9_000.0).sqrt()
            + band_energy(buf, sr, 11_500.0, 14_500.0).sqrt();
        side / peak
    };
    let flat = spread(&render(FileShape::plain()));
    let rippled = spread(&render(FileShape {
        ripple: 0.28,
        ripple_cycles: 3.0,
        ..FileShape::plain()
    }));
    assert!(
        rippled > flat * 1.5,
        "a rippled file should broaden the call: {rippled:.4} vs flat {flat:.4}"
    );
}

/// Symmetric wings mean sound on both strokes, so a syllable must contain two
/// bursts of energy separated by the turnaround, not one.
#[test]
fn both_strokes_radiate() {
    let sr = 48_000.0f32;
    let mut p = VoiceParams::silent();
    p.carrier_hz = 6_140.0;
    p.tooth_rate_hz = 6_140.0;
    p.teeth = 100;
    p.q = 60.0;
    p.syllables = 1;
    p.gap_s = 0.05;
    p.chirp_period_s = 0.6;
    p.spl_db = 90.0;
    p.seed = 9;

    let energy_of = |opening: f32| {
        let mut q = p;
        q.opening = opening;
        q.stroke_gap_s = 0.015;
        let mut v = Voice::new();
        v.set(q);
        let n = (sr * 0.6) as usize;
        let mut e = 0.0f64;
        for _ in 0..n {
            let s = v.tick(sr, q.carrier_hz, q.tooth_rate_hz);
            e += (s as f64).powi(2);
        }
        e
    };
    let closing_only = energy_of(0.0);
    let both = energy_of(0.8);
    assert!(
        both > closing_only * 1.3,
        "the opening stroke should add energy: {both:.5} vs {closing_only:.5}"
    );
}

/// A 22 kHz carrier at a 48 kHz sample rate is the hard case: a naive impulse
/// train folds its harmonics down into the audible band, and the "ultrasonic"
/// voice would betray itself as an audible buzz. With the bandlimited train
/// there must be no meaningful energy an octave below the carrier.
#[test]
fn ultrasonic_voice_does_not_alias_into_the_audible_band() {
    let sr = 48_000.0f32;
    let mut v = Voice::new();
    let mut p = VoiceParams::silent();
    p.carrier_hz = 22_500.0;
    p.tooth_rate_hz = 22_500.0;
    p.teeth = 50;
    p.q = 18.9;
    p.syllables = 4;
    p.gap_s = 0.01;
    p.chirp_period_s = 0.4;
    p.spl_db = 88.0;
    p.seed = 3;
    v.set(p);

    let buf = loudest_window(&mut v, sr, p.carrier_hz, p.tooth_rate_hz, 4096, 60);
    let carrier = band_energy(&buf, sr, 20_500.0, 23_800.0);
    let audible = band_energy(&buf, sr, 200.0, 11_000.0);
    assert!(carrier > 0.0, "the ultrasonic voice produced no carrier at all");
    assert!(
        audible < carrier * 0.01,
        "aliasing: {audible:.6} in the audible band vs {carrier:.6} at the carrier"
    );
}

/// A carrier this output cannot carry must be silent, not transposed down to
/// the edge of the band. The detector is the only honest way to hear it.
#[test]
fn a_carrier_above_nyquist_is_silent_not_squashed() {
    let sr = 44_100.0f32;
    let mut v = Voice::new();
    let mut p = VoiceParams::silent();
    p.carrier_hz = 22_500.0;
    p.tooth_rate_hz = 22_500.0;
    p.teeth = 50;
    p.q = 18.9;
    p.syllables = 6;
    p.gap_s = 0.012;
    p.chirp_period_s = 0.4;
    p.spl_db = 88.0;
    p.seed = 17;
    v.set(p);

    let mut peak = 0.0f32;
    for _ in 0..(sr as usize) {
        peak = peak.max(v.tick(sr, p.carrier_hz, p.tooth_rate_hz).abs());
    }
    assert_eq!(peak, 0.0, "22.5 kHz at a 44.1 kHz rate must render as silence");

    // Divide it by ten and it comes back.
    let mut heard = 0.0f32;
    for _ in 0..(sr as usize) {
        heard = heard.max(v.tick(sr, p.carrier_hz / 10.0, p.tooth_rate_hz / 10.0).abs());
    }
    assert!(heard > 0.01, "the detector should make it audible again, got {heard}");

    // At 48 kHz the same call fits and must NOT be silent.
    let mut w = Voice::new();
    w.set(p);
    let mut at48 = 0.0f32;
    for _ in 0..48_000 {
        at48 = at48.max(w.tick(48_000.0, p.carrier_hz, p.tooth_rate_hz).abs());
    }
    assert!(at48 > 0.005, "22.5 kHz fits under 48 kHz and should sound, got {at48}");
}

/// The detector divides what you hear without touching what the air hears.
#[test]
fn detector_shifts_pitch_but_not_physics() {
    let mut s = Scene::new();
    s.sample_rate = 48_000.0;
    let mut p = VoiceParams::silent();
    p.carrier_hz = 22_500.0;
    p.tooth_rate_hz = 22_500.0;
    p.teeth = 50;
    p.spl_db = 88.0;
    p.seed = 11;
    p.x = 12.0;
    s.add(p);

    let plain = s.received_db(0);
    let r_plain = s.audible_radius(0, 20.0);
    s.detector_div = 10.0;
    s.detector_threshold_hz = 14_000.0;
    assert_eq!(plain, s.received_db(0), "the detector must not change the level");
    assert_eq!(r_plain, s.audible_radius(0, 20.0), "nor the audible radius");

    let (carrier, rate) = s.render_freqs(0);
    assert!((carrier - 2_250.0).abs() < 1.0, "carrier should divide to 2.25 kHz, got {carrier}");
    assert!((rate - 2_250.0).abs() < 1.0, "strike rate should divide with it, got {rate}");

    // A 5 kHz singer is below the detector threshold and must be left alone.
    let mut q = VoiceParams::silent();
    q.carrier_hz = 5_000.0;
    q.tooth_rate_hz = 5_000.0;
    q.seed = 12;
    s.add(q);
    let (c2, _) = s.render_freqs(1);
    assert!((c2 - 5_000.0).abs() < 1.0, "the audible chorus must not be shifted, got {c2}");
}

/// Sixty singers at once must not clip, and must not be silent.
#[test]
fn a_full_chorus_stays_inside_full_scale() {
    let mut s = Scene::new();
    s.sample_rate = 48_000.0;
    s.master = 8.0;
    for i in 0..60u32 {
        let mut p = VoiceParams::silent();
        p.carrier_hz = 4_500.0 + (i as f32) * 30.0;
        p.tooth_rate_hz = p.carrier_hz;
        p.teeth = 90;
        p.q = 25.0;
        p.opening = 0.7;
        p.syllables = 3;
        p.gap_s = 0.03;
        p.chirp_period_s = 1.5;
        p.spl_db = 92.0;
        p.seed = i + 1;
        p.x = ((i % 10) as f32 - 5.0) * 6.0;
        p.y = ((i / 10) as f32 - 3.0) * 6.0;
        s.add(p);
    }
    let mut out = vec![0.0f32; MAX_FRAMES * 2];
    let mut loudest = 0.0f32;
    for _ in 0..200 {
        s.render(&mut out, 512);
        for v in out[..1024].iter() {
            assert!(v.is_finite(), "non-finite sample");
            loudest = loudest.max(v.abs());
        }
    }
    assert!(loudest <= 1.0, "clipped at {loudest}");
    assert!(loudest > 0.05, "a sixty-voice chorus rendered near silence ({loudest})");
}

/// Walking away from a singer must quieten it, monotonically.
#[test]
fn distance_is_a_volume_control_in_the_right_direction() {
    let mut s = Scene::new();
    let mut p = VoiceParams::silent();
    p.carrier_hz = 5_000.0;
    p.tooth_rate_hz = 5_000.0;
    p.spl_db = 90.0;
    p.seed = 5;
    s.add(p);
    let mut prev = f32::INFINITY;
    for d in [1.0f32, 5.0, 20.0, 60.0, 150.0, 400.0] {
        s.listener_x = d;
        let db = s.received_db(0);
        assert!(db < prev, "level rose walking from {prev} to {db} at {d} m");
        prev = db;
    }
}

/// A singer to the listener's right must be louder in the right ear, and the
/// left ear must hear it late.
#[test]
fn a_singer_on_the_right_arrives_right_and_late() {
    let mut s = Scene::new();
    s.sample_rate = 48_000.0;
    s.master = 4.0;
    let mut p = VoiceParams::silent();
    p.carrier_hz = 5_000.0;
    p.tooth_rate_hz = 5_000.0;
    p.teeth = 200;
    p.syllables = 8;
    p.gap_s = 0.001;
    p.chirp_period_s = 0.5;
    p.spl_db = 95.0;
    p.seed = 21;
    p.x = 10.0; // due east; the listener faces north
    s.add(p);

    let mut out = vec![0.0f32; MAX_FRAMES * 2];
    let (mut el, mut er) = (0.0f64, 0.0f64);
    for _ in 0..40 {
        s.render(&mut out, 512);
        for f in 0..512 {
            el += (out[f * 2] as f64).powi(2);
            er += (out[f * 2 + 1] as f64).powi(2);
        }
    }
    assert!(er > el * 1.5, "right ear {er:.4} should dominate left {el:.4}");
}

// ---------------------------------------------------------------- helpers --

/// Run the voice and return the most energetic window of `n` samples found in
/// `tries` attempts — the singers are silent between chirps, so a fixed offset
/// would sample the gap as often as the note.
fn loudest_window(v: &mut Voice, sr: f32, fc: f32, fr: f32, n: usize, tries: usize) -> Vec<f32> {
    let mut best: Vec<f32> = vec![0.0; n];
    let mut best_e = -1.0f64;
    for _ in 0..tries {
        let mut buf = vec![0.0f32; n];
        for s in buf.iter_mut() {
            *s = v.tick(sr, fc, fr);
        }
        let e: f64 = buf.iter().map(|x| (*x as f64).powi(2)).sum();
        if e > best_e {
            best_e = e;
            best = buf;
        }
    }
    assert!(best_e > 0.0, "the voice never produced a sample");
    best
}

/// Windowed DFT magnitude at one frequency. Slow, but exact and
/// dependency-free, which is what a known-answer test wants.
fn goertzel(buf: &[f32], sr: f32, f: f32) -> f32 {
    let w = 2.0 * std::f64::consts::PI * (f as f64) / (sr as f64);
    let (mut re, mut im) = (0.0f64, 0.0f64);
    for (i, s) in buf.iter().enumerate() {
        let win = 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / buf.len() as f64).cos();
        let v = *s as f64 * win;
        re += v * (w * i as f64).cos();
        im += v * (w * i as f64).sin();
    }
    ((re * re + im * im).sqrt() / buf.len() as f64) as f32
}

fn dominant_hz(buf: &[f32], sr: f32) -> f32 {
    let mut best = (0.0f32, 0.0f32);
    let mut f = 200.0f32;
    while f < sr * 0.45 {
        let m = goertzel(buf, sr, f);
        if m > best.1 {
            best = (f, m);
        }
        f += 25.0;
    }
    best.0
}

fn band_energy(buf: &[f32], sr: f32, lo: f32, hi: f32) -> f32 {
    let mut e = 0.0f32;
    let mut f = lo;
    while f < hi {
        let m = goertzel(buf, sr, f);
        e += m * m;
        f += 100.0;
    }
    e
}
