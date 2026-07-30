//! Behavioural tests for the cell. These are the checks that would catch a
//! sign error or a runaway before it reaches the browser, where "it looks
//! wrong" is the only diagnostic available.

use bearings_solver::sim::{param, World, R_CUP, R_PIN};

fn settle(w: &mut World, seconds: f32) {
    let steps = (seconds / (1.0 / 60.0)) as usize;
    for _ in 0..steps {
        w.step(1.0 / 60.0, 8);
    }
}

#[test]
fn bearings_stay_inside_the_cup_and_off_the_pin() {
    let mut w = World::new(400, 3);
    settle(&mut w, 12.0);
    for i in 0..w.n {
        let rad = (w.x[i] * w.x[i] + w.y[i] * w.y[i]).sqrt();
        assert!(
            rad + w.r[i] <= R_CUP + 1e-3,
            "bearing {i} escaped the cup: r={rad}"
        );
        assert!(
            rad + 1e-3 >= R_PIN + w.r[i] - 1e-3,
            "bearing {i} is inside the pin: r={rad}"
        );
        assert!(w.x[i].is_finite() && w.y[i].is_finite(), "bearing {i} is NaN");
    }
}

#[test]
fn nothing_blows_up_at_full_voltage() {
    let mut w = World::new(500, 11);
    w.set_param(param::VOLTAGE, 1.0);
    w.set_param(param::CHARGE, 0.5);
    w.set_param(param::CHAIN, 1.5);
    settle(&mut w, 15.0);
    // A well-charged bearing really does cross the cell fast — the real thing
    // does ~0.3 m/s in a 50 mm cup, i.e. about 6 cup-radii a second — so this
    // bound is "the dance, not a divergence".
    assert!(
        w.stats.max_speed < 9.0,
        "max speed {} — the solver is running away",
        w.stats.max_speed
    );
    assert!(
        w.kinetic_energy().is_finite(),
        "kinetic energy went non-finite"
    );
    let worst = w.max_overlap();
    assert!(
        worst < 0.35,
        "worst overlap is {:.1}% of the contact distance — contacts are too soft",
        worst * 100.0
    );
}

#[test]
fn no_voltage_means_no_charge_and_a_quiet_dish() {
    let mut w = World::new(250, 5);
    w.set_param(param::VOLTAGE, 0.0);
    w.set_param(param::NOISE, 0.0);
    settle(&mut w, 6.0);
    assert!(
        w.total_charge().abs() < 1e-6,
        "charge {} appeared with the supply off",
        w.total_charge()
    );
    assert!(
        w.stats.max_speed < 0.05,
        "dish is not settling: max speed {}",
        w.stats.max_speed
    );
    assert_eq!(w.stats.current, 0.0);
    assert_eq!(w.stats.closed, 0.0);
}

#[test]
fn polarity_flips_the_sign_of_the_charge_and_the_current() {
    let mut run = |pol: f32| {
        let mut w = World::new(300, 21);
        w.set_param(param::POLARITY, pol);
        w.set_param(param::VOLTAGE, 1.0);
        settle(&mut w, 8.0);
        (w.total_charge(), w.stats.current)
    };
    let (qp, ip) = run(1.0);
    let (qn, i_n) = run(-1.0);
    assert!(qp > 0.0 && qn < 0.0, "charge signs: {qp} / {qn}");
    assert!(
        ip >= 0.0 && i_n <= 0.0,
        "pin current should follow polarity: {ip} / {i_n}"
    );
}

/// The point of the whole toy: with the supply on, bearings must actually
/// migrate inward and link up into chains — and with it off, they must not.
#[test]
fn the_field_assembles_chains() {
    // at the default fill — a dendrite needs neighbours within reach to grow
    let mut hot = World::new(560, 7);
    hot.set_param(param::VOLTAGE, 1.0);
    settle(&mut hot, 25.0);

    let mut cold = World::new(560, 7);
    cold.set_param(param::VOLTAGE, 0.0);
    settle(&mut cold, 25.0);

    assert!(
        hot.stats.longest_chain >= 4.0,
        "no chain assembled with the field on (longest {})",
        hot.stats.longest_chain
    );
    assert!(
        hot.stats.longest_chain > cold.stats.longest_chain,
        "field-on chains ({}) should beat field-off ({})",
        hot.stats.longest_chain,
        cold.stats.longest_chain
    );
    // and the structure must actually be *attached to the pin* and reach out
    // into the cell — a pile of unattached pairs is not a wire
    assert!(
        hot.stats.reach > 0.5,
        "the live structure only reaches {:.2} of the way to the cup",
        hot.stats.reach
    );
    // (with the supply off, "wired" only ever means the bearings that happen
    // to be resting against the pin — the geometry, not a structure)
    assert!(
        cold.stats.reach < 0.35,
        "unpowered bearings should not reach out: {}",
        cold.stats.reach
    );

    // the field also gathers bearings onto the electrode
    let inner = |w: &World| {
        (0..w.n)
            .filter(|&i| (w.x[i] * w.x[i] + w.y[i] * w.y[i]).sqrt() < 0.25)
            .count()
    };
    assert!(
        inner(&hot) > inner(&cold),
        "the field should collect bearings on the pin: {} vs {}",
        inner(&hot),
        inner(&cold)
    );
}

/// A bearing bridging pin to cup must close the circuit and draw current;
/// hand-place one line of them so the test does not depend on emergence.
#[test]
fn a_hand_built_bridge_closes_the_circuit() {
    let mut w = World::new(60, 2);
    w.set_param(param::VOLTAGE, 1.0);
    // lay a chain of touching bearings straight out along +x
    let mut at = R_PIN;
    for i in 0..w.n {
        let r = w.r[i];
        if at + 2.0 * r < R_CUP {
            w.x[i] = at + r;
            w.y[i] = 0.0;
            at += 2.0 * r;
        } else {
            // park the leftovers against the far wall, out of the way
            let th = 3.0 + 0.1 * i as f32;
            w.x[i] = (R_CUP - r) * th.cos();
            w.y[i] = (R_CUP - r) * th.sin();
        }
        w.vx[i] = 0.0;
        w.vy[i] = 0.0;
    }
    // one frame is enough: the network solve is instantaneous
    w.step(1.0 / 60.0, 8);
    assert_eq!(w.stats.closed, 1.0, "a touching bridge must close the circuit");
    assert!(
        w.stats.current > 1e-3,
        "closed circuit draws no current: {}",
        w.stats.current
    );
    // and the potential must fall monotonically along the bridge
    let mut chain: Vec<(f32, f32)> = (0..w.n)
        .filter(|&i| w.y[i].abs() < 1e-6)
        .map(|i| (w.x[i], w.v[i]))
        .collect();
    chain.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    for pair in chain.windows(2) {
        assert!(
            pair[1].1 <= pair[0].1 + 1e-3,
            "potential rises along the bridge: {:?}",
            pair
        );
    }
}

/// Same geometry, one bearing removed from the middle: the gap must open the
/// circuit (below breakdown) and the current must collapse.
#[test]
fn breaking_the_bridge_opens_the_circuit() {
    let mut w = World::new(60, 2);
    w.set_param(param::VOLTAGE, 0.35);
    let mut at = R_PIN;
    let mut on_chain = vec![];
    for i in 0..w.n {
        let r = w.r[i];
        if at + 2.0 * r < R_CUP * 0.95 {
            w.x[i] = at + r;
            w.y[i] = 0.0;
            at += 2.0 * r;
            on_chain.push(i);
        } else {
            let th = 3.0 + 0.1 * i as f32;
            w.x[i] = (R_CUP - r) * th.cos();
            w.y[i] = (R_CUP - r) * th.sin();
        }
    }
    // yank the middle bearing far away
    let victim = on_chain[on_chain.len() / 2];
    w.x[victim] = 0.0;
    w.y[victim] = -R_CUP + 0.05;
    w.step(1.0 / 60.0, 1);
    let broken = w.stats.current;
    assert_eq!(w.stats.closed, 0.0, "gapped bridge must read open");
    assert!(broken < 1e-2, "open circuit still draws {broken}");
}

#[test]
fn stir_and_shake_stay_finite() {
    let mut w = World::new(300, 13);
    for k in 0..120 {
        let t = k as f32 * 0.05;
        w.stir(0.4 * t.cos(), 0.4 * t.sin(), 2.0, -1.5, 0.3);
        w.step(1.0 / 60.0, 8);
    }
    w.shake(3.0);
    settle(&mut w, 3.0);
    for i in 0..w.n {
        assert!(w.x[i].is_finite() && w.vx[i].is_finite(), "bearing {i} diverged");
        let rad = (w.x[i] * w.x[i] + w.y[i] * w.y[i]).sqrt();
        assert!(rad + w.r[i] <= R_CUP + 1e-3);
    }
}

#[test]
fn the_solver_is_deterministic() {
    let run = || {
        let mut w = World::new(200, 77);
        w.set_param(param::VOLTAGE, 0.8);
        settle(&mut w, 4.0);
        (w.x.clone(), w.y.clone(), w.q.clone())
    };
    let a = run();
    let b = run();
    assert_eq!(a.0, b.0, "x drifted between identical runs");
    assert_eq!(a.1, b.1);
    assert_eq!(a.2, b.2);
}

#[test]
fn render_buffers_stay_in_range() {
    let mut w = World::new(350, 31);
    w.set_param(param::VOLTAGE, 1.0);
    settle(&mut w, 10.0);
    let (bs, es, ss) = bearings_solver::sim::STRIDES;
    assert_eq!(w.ball_buf().len(), w.n * bs);
    assert_eq!(w.edge_buf().len() % es, 0);
    assert_eq!(w.stat_buf().len(), ss);
    for (k, v) in w.ball_buf().iter().enumerate() {
        assert!(v.is_finite(), "ball buffer slot {k} is not finite");
    }
    for chunk in w.ball_buf().chunks(bs) {
        assert!(chunk[3] >= -1.0 && chunk[3] <= 1.0, "charge not normalised");
        assert!(chunk[4] >= -1.0 && chunk[4] <= 1.0, "potential not normalised");
        let qn = chunk[6] * chunk[6] + chunk[7] * chunk[7] + chunk[8] * chunk[8] + chunk[9] * chunk[9];
        assert!((qn - 1.0).abs() < 1e-3, "orientation quaternion drifted: {qn}");
    }
    for chunk in w.edge_buf().chunks(es) {
        assert!(chunk[4] >= -1.0 && chunk[4] <= 1.0, "edge current not normalised");
    }
}
