//! Serialisation: the certified level pack, and the golden vectors.
//!
//! # Why a pack at all
//!
//! Generating a level is cheap. *Certifying* one is not — the solver runs
//! hundreds of times per wave between the repair loop and the per-lane
//! guarantee. So the proving happens here, once, offline, and the browser
//! ships with the answers already in hand. The game does not re-derive what
//! `tempest pack` has already established; it plays the level and uses the
//! solver only for the two things that need it live: "is this still winnable"
//! and the autopsy.
//!
//! # Why hand-rolled JSON
//!
//! Same house rule as everything else in `packages/`: no dependencies. The
//! output is small, the shapes are fixed, and a serialiser for this is forty
//! lines. Reading it back is JavaScript's problem, and JavaScript has a JSON
//! parser.

use std::fmt::Write as _;

use crate::gen::{self, Level};
use crate::level::{Kind, Threat, Wave};
use crate::sim::{self, Action, Outcome};
use crate::solver::Cert;
use crate::web::{Dir, Web};
use crate::SEED_EPOCH;

fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out
}

fn ints(xs: &[i32]) -> String {
    let mut s = String::from("[");
    for (i, x) in xs.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        let _ = write!(s, "{x}");
    }
    s.push(']');
    s
}

fn dir_name(d: Dir) -> &'static str {
    d.name()
}

pub fn web_json(web: &Web) -> String {
    let mut verts = String::from("[");
    for (i, p) in web.verts.iter().enumerate() {
        if i > 0 {
            verts.push(',');
        }
        let _ = write!(verts, "[{},{}]", p.x, p.y);
    }
    verts.push(']');
    let mut seats = String::from("[");
    for (i, p) in web.seats.iter().enumerate() {
        if i > 0 {
            seats.push(',');
        }
        let _ = write!(seats, "[{},{}]", p.x, p.y);
    }
    seats.push(']');
    let steps = if web.closed {
        web.step.clone()
    } else {
        web.step[..web.lanes - 1].to_vec()
    };
    format!(
        r#"{{"lanes":{},"closed":{},"shape":"{}","character":"{}","unevenness":{},"diameter":{},"step":{},"verts":{},"seats":{}}}"#,
        web.lanes,
        web.closed,
        esc(&web.shape.label()),
        web.character().name(),
        web.unevenness(),
        web.diameter(),
        ints(&steps),
        verts,
        seats
    )
}

fn threat_json(t: &Threat) -> String {
    let entry = match t.entry {
        Some(e) => format!(
            r#"{{"lane":{},"depth":{},"tick":{}}}"#,
            e.lane, e.depth, e.tick
        ),
        None => "null".into(),
    };
    let kind = match t.kind {
        Kind::Flipper => "flipper",
        Kind::Tanker => "tanker",
        Kind::Spiker => "spiker",
    };
    format!(
        r#"{{"kind":"{kind}","climb":{},"flipPeriod":{},"flipDir":"{}","entry":{entry},"parent":{},"side":"{}"}}"#,
        t.climb,
        t.flip_period,
        dir_name(t.flip_dir),
        match t.parent {
            Some(p) => p as i64,
            None => -1,
        },
        dir_name(t.side)
    )
}

pub fn cert_json(c: &Cert) -> String {
    let mut tour = String::from("[");
    for (i, s) in c.tour.steps.iter().enumerate() {
        if i > 0 {
            tour.push(',');
        }
        let _ = write!(
            tour,
            r#"{{"threat":{},"fire":{},"lane":{},"meet":{},"margin":{}}}"#,
            s.threat, s.fire, s.lane, s.meet, s.margin
        );
    }
    tour.push(']');
    format!(
        r#"{{"holdable":{},"slack":{},"openSlack":{{"cw":{},"ccw":{},"stand":{}}},"wrongWayCost":{},"commits":{},"bottleneck":{},"end":{},"tour":{tour}}}"#,
        c.holdable,
        c.slack,
        c.open_slack[0],
        c.open_slack[1],
        c.open_slack[2],
        c.wrong_way_cost(),
        c.commits(),
        c.tour.bottleneck,
        c.tour.end
    )
}

pub fn level_json(lvl: &Level) -> String {
    let mut waves = String::from("[");
    for (i, w) in lvl.waves.iter().enumerate() {
        if i > 0 {
            waves.push(',');
        }
        let mut ts = String::from("[");
        for (j, t) in w.threats.iter().enumerate() {
            if j > 0 {
                ts.push(',');
            }
            ts.push_str(&threat_json(t));
        }
        ts.push(']');
        let _ = write!(
            waves,
            r#"{{"threats":{ts},"worstLane":{},"cert":{}}}"#,
            lvl.worst_lane[i],
            cert_json(&lvl.certs[i])
        );
    }
    waves.push(']');
    format!(
        r#"{{"seed":{},"index":{},"web":{},"waves":{waves}}}"#,
        lvl.seed,
        lvl.index,
        web_json(&lvl.web)
    )
}

/// The whole shipped pack.
pub fn pack_json(levels: &[Level]) -> String {
    let mut out = format!(
        "{{\n  \"epoch\": {SEED_EPOCH},\n  \"note\": \"{}\",\n  \"levels\": [\n",
        esc("Generated by `tempest pack`. Every wave here has been proved holdable from every lane. Do not hand-edit — regenerate.")
    );
    for (i, lvl) in levels.iter().enumerate() {
        if i > 0 {
            out.push_str(",\n");
        }
        out.push_str("    ");
        out.push_str(&level_json(lvl));
    }
    out.push_str("\n  ]\n}\n");
    out
}

/// Build a pack: `count` levels, level `n` from seed `base + n`.
pub fn build_pack(base: u64, count: u32) -> (Vec<Level>, crate::lab::Ensure) {
    let mut levels = Vec::new();
    let mut ens = crate::lab::Ensure::new(&["drop a threat"]);
    for i in 1..=count {
        let (lvl, e) = gen::level(base.wrapping_add(i as u64), i);
        ens.merge(&e);
        levels.push(lvl);
    }
    (levels, ens)
}

// ---------------------------------------------------------------- golden --

/// The action pattern the golden replays use, cycled. Deliberately clumsy: it
/// walks past things and loses, which exercises the breach path and the
/// autopsy as well as the plain sim. Written out as a string so the JavaScript
/// side reads the same spec from the same file rather than reimplementing it.
pub const GOLDEN_SCRIPT: &str = "cw,cw,fire,ccw,ccw,fire,hold";
pub const GOLDEN_TICKS: usize = 600;

fn action_from_name(name: &str) -> Action {
    match name {
        "fire" => Action::Fire,
        "cw" => Action::Move(Dir::Cw),
        "ccw" => Action::Move(Dir::Ccw),
        _ => Action::Hold,
    }
}

pub fn golden_script(len: usize) -> Vec<Action> {
    let pattern: Vec<Action> = GOLDEN_SCRIPT.split(',').map(action_from_name).collect();
    (0..len).map(|i| pattern[i % pattern.len()]).collect()
}

/// Fixed boards for the golden vectors.
///
/// Hand-built rather than generated, and that is the point: generating a level
/// takes the better part of a minute, so goldens built from `gen` could not be
/// a gate anyone actually runs. These are small, instant, and between them
/// cover a ring, an uneven ring, a strip with no wrap, and a tanker — which is
/// every code path that can drift.
pub fn fixtures() -> Vec<(&'static str, Web, Wave)> {
    use crate::web::Shape;
    vec![
        (
            "ring: a flipper walking, and a spiker opposite",
            Web::new(12, Shape::Circle),
            Wave::new(vec![
                Threat::root(Kind::Flipper, 2, 850, 0, 3).with_flip(19, Dir::Cw),
                Threat::root(Kind::Spiker, 8, 700, 24, 4),
                Threat::root(Kind::Flipper, 5, 640, 40, 3).with_flip(26, Dir::Ccw),
            ]),
        ),
        (
            "star: the long lanes cost what they look like they cost",
            Web::new(13, Shape::Star { depth: 45 }),
            Wave::new(vec![
                Threat::root(Kind::Spiker, 0, 900, 0, 3),
                Threat::root(Kind::Flipper, 6, 780, 15, 4).with_flip(14, Dir::Cw),
                Threat::root(Kind::Spiker, 11, 660, 30, 3),
                Threat::root(Kind::Flipper, 3, 820, 55, 3).with_flip(22, Dir::Ccw),
            ]),
        ),
        (
            "strip: no way round the back",
            Web::new(11, Shape::Ramp { growth: 18 }),
            Wave::new(vec![
                Threat::root(Kind::Flipper, 9, 800, 0, 3).with_flip(17, Dir::Cw),
                Threat::root(Kind::Spiker, 1, 720, 20, 4),
                Threat::root(Kind::Flipper, 5, 900, 45, 3).with_flip(25, Dir::Ccw),
            ]),
        ),
        (
            "tanker: when it dies is part of the state",
            Web::new(12, Shape::Lobed { lobes: 3, amp: 34 }),
            Wave::new(vec![
                Threat::root(Kind::Tanker, 3, 900, 0, 3),
                Threat::child(0, Dir::Cw, 6, 24, Dir::Cw),
                Threat::child(0, Dir::Ccw, 6, 24, Dir::Ccw),
                Threat::root(Kind::Spiker, 9, 780, 30, 4),
            ]),
        ),
    ]
}

/// Golden vectors: the drift gate between the Rust source and the committed
/// `tempest.wasm`.
///
/// The trick is that both sides check the *same* file. `cargo test` asserts the
/// Rust reproduces these numbers; `test/tempest.selftest.mjs` asserts the
/// shipped wasm reproduces them. Change the Rust without rebuilding the wasm
/// and the node side fails; rebuild without regenerating the goldens and
/// `cargo test` fails. There is no way to be quietly out of step.
///
/// Each case carries the wire-encoded board, so the JavaScript needs nothing
/// but this file and the wasm — and the encoding itself is under test, because
/// that array is exactly what the browser hands to `tp_new`.
pub fn golden_json() -> String {
    let mut out = format!(
        "{{\n  \"epoch\": {SEED_EPOCH},\n  \"script\": \"{GOLDEN_SCRIPT}\",\n  \"ticks\": {GOLDEN_TICKS},\n  \"cases\": [\n"
    );
    let script = golden_script(GOLDEN_TICKS);
    for (i, (name, web, wave)) in fixtures().into_iter().enumerate() {
        if i > 0 {
            out.push_str(",\n");
        }
        let st = sim::replay(&web, &wave, 0, &script);
        let outcome = match st.outcome {
            Outcome::Cleared { tick } => format!("cleared@{tick}"),
            Outcome::Breached { tick, threat } => format!("breached@{tick}:{threat}"),
            Outcome::Stalled { tick } => format!("stalled@{tick}"),
            Outcome::Running => "running".into(),
        };
        let kills: Vec<i32> = st
            .kills
            .iter()
            .flat_map(|k| [k.threat as i32, k.tick, k.lane as i32, k.depth])
            .collect();
        let cert = crate::solver::certify(&web, &wave, 0);
        let a = crate::autopsy::examine(&web, &wave, 0, &script);
        let _ = write!(
            out,
            concat!(
                "    {{\"name\":\"{}\",\"lanes\":{},\"closed\":{},\"startLane\":0,",
                "\"wire\":{},\"replay\":\"{}\",\"kills\":{},",
                "\"slack\":{},\"openSlack\":[{},{},{}],\"wrongWayCost\":{},",
                "\"lostAt\":{},\"doomedFor\":{}}}"
            ),
            esc(name),
            web.lanes,
            web.closed,
            ints(&encode_wire(&web, &wave)),
            esc(&outcome),
            ints(&kills),
            cert.slack,
            cert.open_slack[0],
            cert.open_slack[1],
            cert.open_slack[2],
            cert.wrong_way_cost(),
            a.lost_at.unwrap_or(-1),
            a.doomed_for
        );
    }
    out.push_str("\n  ]\n}\n");
    out
}

/// Where the shipped pack comes from. `tempest pack` and the audit both
/// default to these, so "the pack" means one specific thing.
pub const PACK_BASE: u64 = 20260820;
pub const PACK_LEVELS: u32 = 14;

/// The flat `i32` encoding the browser hands to wasm. Documented here because
/// the JavaScript that writes it and the Rust that reads it have to agree, and
/// this is the only place that says how.
///
/// ```text
/// [0]            lanes
/// [1]            closed (0 / 1)
/// [2]            threat count
/// [3 .. 3+lanes] step costs, one per lane (the last is unused when open)
/// then 10 ints per threat:
///   kind (0 flipper, 1 tanker, 2 spiker)
///   climb, flipPeriod, flipDir (0 cw, 1 ccw, 2 still)
///   hasEntry (0/1), entryLane, entryDepth, entryTick
///   parent (-1 for none), side (0 cw, 1 ccw, 2 still)
/// ```
pub const WIRE_THREAT_WORDS: usize = 10;

pub fn encode_wire(web: &Web, wave: &Wave) -> Vec<i32> {
    let mut v = vec![web.lanes as i32, web.closed as i32, wave.len() as i32];
    for i in 0..web.lanes {
        v.push(web.step[i]);
    }
    for t in &wave.threats {
        v.push(match t.kind {
            Kind::Flipper => 0,
            Kind::Tanker => 1,
            Kind::Spiker => 2,
        });
        v.push(t.climb);
        v.push(t.flip_period);
        v.push(dir_code(t.flip_dir));
        match t.entry {
            Some(e) => {
                v.push(1);
                v.push(e.lane as i32);
                v.push(e.depth);
                v.push(e.tick);
            }
            None => v.extend_from_slice(&[0, 0, 0, 0]),
        }
        v.push(t.parent.map(|p| p as i32).unwrap_or(-1));
        v.push(dir_code(t.side));
    }
    v
}

pub fn dir_code(d: Dir) -> i32 {
    match d {
        Dir::Cw => 0,
        Dir::Ccw => 1,
        Dir::Still => 2,
    }
}

pub fn dir_from_code(c: i32) -> Dir {
    match c {
        0 => Dir::Cw,
        1 => Dir::Ccw,
        _ => Dir::Still,
    }
}

/// Read back what [`encode_wire`] wrote. The web it reconstructs carries the
/// real step costs but a placeholder outline — the browser draws from the pack
/// JSON, so wasm never needs the vertices.
pub fn decode_wire(words: &[i32]) -> Option<(Web, Wave)> {
    if words.len() < 3 {
        return None;
    }
    let lanes = words[0] as usize;
    let closed = words[1] != 0;
    let count = words[2] as usize;
    if !(crate::web::MIN_LANES..=crate::web::MAX_LANES).contains(&lanes) {
        return None;
    }
    if count > crate::level::MAX_THREATS {
        return None;
    }
    if words.len() < 3 + lanes + count * WIRE_THREAT_WORDS {
        return None;
    }
    let mut web = Web::new(
        lanes,
        if closed {
            crate::web::Shape::Circle
        } else {
            crate::web::Shape::Arc { sweep: 70 }
        },
    );
    let mut step = words[3..3 + lanes].to_vec();
    for s in step.iter_mut() {
        *s = (*s).clamp(crate::web::MIN_STEP, crate::web::MAX_STEP);
    }
    web.set_step(step);

    let mut threats = Vec::with_capacity(count);
    for i in 0..count {
        let b = 3 + lanes + i * WIRE_THREAT_WORDS;
        let kind = match words[b] {
            0 => Kind::Flipper,
            1 => Kind::Tanker,
            _ => Kind::Spiker,
        };
        let climb = words[b + 1].clamp(1, 32);
        let entry = if words[b + 4] != 0 {
            Some(crate::level::Entry {
                lane: (words[b + 5].max(0) as usize) % lanes,
                depth: words[b + 6].clamp(1, crate::level::DEPTH_MAX),
                tick: words[b + 7].max(0),
            })
        } else {
            None
        };
        let parent = if words[b + 8] < 0 {
            None
        } else {
            let p = words[b + 8] as usize;
            if p >= i {
                return None; // a child must follow its parent
            }
            Some(p)
        };
        threats.push(Threat {
            kind,
            climb,
            flip_period: words[b + 2].max(0),
            flip_dir: dir_from_code(words[b + 3]),
            entry,
            parent,
            side: dir_from_code(words[b + 9]),
        });
    }
    Some((web, Wave::new(threats)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::level::Threat;
    use crate::web::Shape;

    #[test]
    fn the_wire_survives_a_round_trip() {
        let web = Web::new(13, Shape::Lobed { lobes: 3, amp: 34 });
        let wave = Wave::new(vec![
            Threat::root(Kind::Flipper, 2, 850, 0, 3).with_flip(19, Dir::Cw),
            Threat::root(Kind::Tanker, 7, 900, 12, 3),
            Threat::child(1, Dir::Cw, 6, 26, Dir::Cw),
            Threat::child(1, Dir::Ccw, 6, 26, Dir::Ccw),
        ]);
        let words = encode_wire(&web, &wave);
        let (web2, wave2) = decode_wire(&words).expect("round trip");
        assert_eq!(web2.lanes, web.lanes);
        assert_eq!(web2.closed, web.closed);
        assert_eq!(web2.step, web.step);
        assert_eq!(wave2.threats, wave.threats);
        // …and the travel table, which is what the sim actually uses.
        for a in 0..web.lanes {
            for b in 0..web.lanes {
                assert_eq!(web2.travel(a, b), web.travel(a, b), "{a}->{b}");
            }
        }
    }

    #[test]
    fn the_wire_refuses_nonsense_rather_than_trusting_it() {
        assert!(decode_wire(&[]).is_none());
        assert!(decode_wire(&[3, 0, 0]).is_none(), "3 lanes is not a web");
        assert!(decode_wire(&[12, 1, 99]).is_none(), "truncated");
        // A child declared before its parent.
        let mut w = vec![12, 1, 1];
        w.extend(std::iter::repeat_n(5, 12));
        w.extend_from_slice(&[0, 3, 0, 2, 0, 0, 0, 0, 0, 2]);
        assert!(decode_wire(&w).is_none());
    }

    #[test]
    fn a_level_serialises_to_parseable_json() {
        let (lvl, _) = gen::level(5, 2);
        let s = level_json(&lvl);
        // No parser here, so check the shape by hand: balanced braces, no
        // stray control characters, and the fields the browser reads.
        let opens = s.chars().filter(|c| *c == '{').count();
        let closes = s.chars().filter(|c| *c == '}').count();
        assert_eq!(opens, closes, "unbalanced braces");
        for key in [
            "\"verts\"",
            "\"seats\"",
            "\"step\"",
            "\"cert\"",
            "\"slack\"",
            "\"worstLane\"",
        ] {
            assert!(s.contains(key), "missing {key}");
        }
        assert!(!s.contains('\n'));
    }

    #[test]
    fn golden_vectors_are_stable_within_a_run() {
        assert_eq!(golden_json(), golden_json());
        assert!(golden_json().contains("\"replay\""));
        assert!(golden_json().contains("\"wire\""));
    }

    #[test]
    fn the_committed_goldens_match_the_source() {
        // The drift gate, from the Rust side. If this fails, either the
        // behaviour changed on purpose — in which case regenerate with
        // `tempest golden > ../test/golden.json` and rebuild the wasm — or it
        // changed by accident, which is what this is for.
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../test/golden.json");
        let Ok(committed) = std::fs::read_to_string(path) else {
            panic!("{path} is missing. Generate it with `tempest golden > games/tempest/test/golden.json`.");
        };
        assert_eq!(
            committed.trim(),
            golden_json().trim(),
            "the committed golden vectors no longer match the source. If this \
             change is intended, regenerate them AND rebuild tempest.wasm."
        );
    }

    #[test]
    fn every_fixture_is_a_legal_board_that_round_trips() {
        for (name, web, wave) in fixtures() {
            web.assert_sane();
            wave.assert_sane(&web);
            let (w2, v2) = decode_wire(&encode_wire(&web, &wave))
                .unwrap_or_else(|| panic!("{name} does not survive the wire"));
            assert_eq!(v2.threats, wave.threats, "{name}");
            assert_eq!(w2.step, web.step, "{name}");
        }
    }

    #[test]
    fn escaping_handles_the_awkward_characters() {
        assert_eq!(esc("a\"b\\c"), "a\\\"b\\\\c");
        assert_eq!(esc("a\nb"), "a\\nb");
        assert_eq!(esc("a\u{1}b"), "a\\u0001b");
    }
}
