//! What actually killed the run.
//!
//! A score tells you that you lost. This tells you *when* you lost, which is
//! almost never the same tick.
//!
//! Because [`crate::solver`] can answer "is the rim still holdable from here"
//! about any board, it can be asked that after every tick of a recorded run.
//! The answer starts as yes and ends as no, and the tick it changes is the
//! moment the run was actually decided — usually seconds before the breach,
//! and usually while the player still thought they were fine.
//!
//! Then there is the part that only this game can say. At that tick the solver
//! also knows which *openings* were still alive: whether the surviving plays
//! went clockwise, counter-clockwise, or stood. Compare that against the way
//! the player actually went and you get the sentence the whole design is for:
//!
//! ```text
//! the web turned against you at tick 214.
//! you went clockwise. every play that still held the rim went the other way.
//! ```
//!
//! The Ratchet, elsewhere in this family, names the *move* that lost a run.
//! This names the **direction**.

use crate::level::Wave;
use crate::sim::{self, Action, Kill, Outcome, SimState};
use crate::solver::{self, Opening, Situation};
use crate::web::{Dir, Web};

/// One probe of the run's health.
#[derive(Clone, Copy, Debug)]
pub struct Beat {
    pub tick: i32,
    pub holdable: bool,
    /// Which openings still survive, in [`Opening::ALL`] order.
    pub openings: [bool; 3],
    pub alive: usize,
}

#[derive(Clone, Debug)]
pub struct Autopsy {
    pub outcome: Outcome,
    /// The first tick from which no play holds the rim. `None` if the run was
    /// never lost — either it was cleared, or it ended while still winnable.
    pub lost_at: Option<i32>,
    /// Ticks the player kept playing after the run was already decided.
    pub doomed_for: i32,
    /// Openings still alive on the last tick the run was winnable.
    pub last_openings: [bool; 3],
    /// The way the player actually went next.
    pub went: Option<Dir>,
    pub kills: Vec<Kill>,
    pub beats: Vec<Beat>,
    pub verdict: String,
}

/// Sample every this many ticks, then bisect. The transition from holdable to
/// lost is monotone — killing time never gives options back — so a coarse
/// sweep plus a binary search finds the exact tick for a fraction of the cost
/// of asking every tick.
const PROBE: i32 = 8;

/// Read the situation off a part-played board.
///
/// Two details matter. The player's usable position is where they will *be*
/// when they can next act, which mid-stride is the lane they are walking into
/// rather than the one they left. And a tanker already killed contributes its
/// kill tick, because its children's whole future hangs off it.
pub fn situation_from(wave: &Wave, st: &SimState) -> Situation {
    let mut tk = [i32::MAX; crate::level::MAX_TANKERS];
    for (slot, idx) in wave.tankers().iter().enumerate() {
        if slot >= tk.len() {
            break;
        }
        if let Some(k) = st.kills.iter().find(|k| k.threat == *idx) {
            tk[slot] = k.tick;
        }
    }
    let mut killed = 0u32;
    for (i, alive) in st.alive.iter().enumerate() {
        if !alive {
            killed |= 1 << i;
        }
    }
    Situation {
        lane: st.lane,
        tick: st.tick.max(st.busy_until),
        last_fire: st.last_fire,
        killed,
        entries: st.entry.clone(),
        tk,
    }
}

/// Is the rim still holdable from this board?
pub fn still_alive(web: &Web, wave: &Wave, st: &SimState) -> bool {
    let sit = situation_from(wave, st);
    solver::hold(web, wave, &sit, None, 0).is_some()
}

/// Replay a recorded run and work out where it went wrong.
pub fn examine(web: &Web, wave: &Wave, start_lane: usize, actions: &[Action]) -> Autopsy {
    // Replay once, keeping a snapshot per probe tick, so the solver work
    // happens on states we already know are reachable.
    let mut snaps: Vec<SimState> = Vec::new();
    let mut st = SimState::new(web, wave, start_lane);
    let mut i = 0usize;
    while !st.done() {
        if st.tick % PROBE == 0 {
            snaps.push(st.clone());
        }
        let a = actions.get(i).copied().unwrap_or(Action::Hold);
        i += 1;
        st.step(web, wave, a);
    }
    let outcome = st.outcome;
    let kills = st.kills.clone();

    // Coarse sweep for the first probe that is already lost.
    let mut lost_idx = None;
    for (k, s) in snaps.iter().enumerate() {
        if !still_alive(web, wave, s) {
            lost_idx = Some(k);
            break;
        }
    }

    let mut beats = Vec::new();
    for s in snaps.iter() {
        let alive = (0..wave.len()).filter(|i| s.alive[*i]).count();
        beats.push(Beat {
            tick: s.tick,
            holdable: still_alive(web, wave, s),
            openings: openings_at(web, wave, s),
            alive,
        });
    }

    let Some(k) = lost_idx else {
        return Autopsy {
            outcome,
            lost_at: None,
            doomed_for: 0,
            last_openings: [false; 3],
            went: None,
            kills,
            beats,
            verdict: match outcome {
                Outcome::Cleared { tick } => format!("rim held. cleared at tick {tick}."),
                _ => "the run ended while it was still winnable — a mis-play, not a trap."
                    .to_string(),
            },
        };
    };

    // Bisect between the last good probe and the first lost one, replaying
    // from the last good snapshot a tick at a time.
    let (lo_state, exact) = if k == 0 {
        (snaps[0].clone(), snaps[0].tick)
    } else {
        let mut cursor = snaps[k - 1].clone();
        let mut j = cursor.tick as usize;
        let mut found = snaps[k].tick;
        while cursor.tick < snaps[k].tick && !cursor.done() {
            let a = actions.get(j).copied().unwrap_or(Action::Hold);
            j += 1;
            cursor.step(web, wave, a);
            if !still_alive(web, wave, &cursor) {
                found = cursor.tick;
                break;
            }
        }
        (snaps[k - 1].clone(), found)
    };

    // Rewind to the tick before the loss to read what was still open.
    let mut good = lo_state.clone();
    let mut j = good.tick as usize;
    while good.tick < exact - 1 && !good.done() {
        let a = actions.get(j).copied().unwrap_or(Action::Hold);
        j += 1;
        good.step(web, wave, a);
    }
    let last_openings = openings_at(web, wave, &good);
    let went = actions
        .get(good.tick as usize)
        .and_then(|a| match a {
            Action::Move(d) => Some(*d),
            _ => None,
        })
        .or_else(|| {
            // Nothing that tick; take the next move the player made.
            actions[(good.tick as usize).min(actions.len())..]
                .iter()
                .find_map(|a| match a {
                    Action::Move(d) => Some(*d),
                    _ => None,
                })
        });

    let breach = match outcome {
        Outcome::Breached { tick, .. } => tick,
        Outcome::Cleared { tick } => tick,
        Outcome::Stalled { tick } => tick,
        Outcome::Running => exact,
    };

    Autopsy {
        outcome,
        lost_at: Some(exact),
        doomed_for: (breach - exact).max(0),
        last_openings,
        went,
        kills,
        beats,
        verdict: verdict_for(exact, breach, last_openings, went),
    }
}

fn openings_at(web: &Web, wave: &Wave, st: &SimState) -> [bool; 3] {
    let sit = situation_from(wave, st);
    let mut out = [false; 3];
    for (i, o) in Opening::ALL.iter().enumerate() {
        out[i] = solver::hold(web, wave, &sit, Some(*o), 0).is_some();
    }
    out
}

fn verdict_for(lost_at: i32, breach: i32, openings: [bool; 3], went: Option<Dir>) -> String {
    let doomed = (breach - lost_at).max(0);
    let head = format!(
        "the web turned against you at tick {lost_at}. \
         you played on for {doomed} more tick{} before it showed.",
        if doomed == 1 { "" } else { "s" }
    );
    let cw = openings[0];
    let ccw = openings[1];
    let stand = openings[2];
    let tail = match (cw, ccw, went) {
        (true, false, Some(Dir::Ccw)) => Some(
            "you went counter-clockwise. every play that still held the rim went the other way.",
        ),
        (false, true, Some(Dir::Cw)) => {
            Some("you went clockwise. every play that still held the rim went the other way.")
        }
        (true, false, _) => Some("clockwise was the only way round that still held."),
        (false, true, _) => Some("counter-clockwise was the only way round that still held."),
        (false, false, _) if stand => {
            Some("both ways round were already lost; the only play left was to stand and shoot.")
        }
        (false, false, _) => None,
        (true, true, _) => Some(
            "both ways round still held a tick earlier — this one was the timing, not the route.",
        ),
    };
    match tail {
        Some(t) => format!("{head}\n{t}"),
        None => head,
    }
}

/// Convenience: play a wave with a bot and examine what happened.
pub fn examine_bot(web: &Web, wave: &Wave, start_lane: usize, bot: &crate::bots::Bot) -> Autopsy {
    let mut actions = Vec::new();
    let st = sim::run(web, wave, start_lane, |st, web, wave| {
        let a = bot.act(st, web, wave);
        actions.push(a);
        a
    });
    let _ = st;
    examine(web, wave, start_lane, &actions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bots;
    use crate::level::{Kind, Threat};
    use crate::web::Shape;

    #[test]
    fn a_run_that_was_never_in_danger_reports_no_loss() {
        let web = Web::new(12, Shape::Circle);
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 0, 700, 0, 4)]);
        let a = examine_bot(&web, &wave, 0, &bots::DEADLINE);
        assert!(matches!(a.outcome, Outcome::Cleared { .. }));
        assert_eq!(a.lost_at, None);
        assert!(a.verdict.contains("rim held"), "{}", a.verdict);
    }

    #[test]
    fn standing_still_while_the_rim_falls_is_diagnosed() {
        let web = Web::new(14, Shape::Circle);
        // Far side, and not much time. Doing nothing loses, and the tick it
        // becomes unwinnable is well before the breach.
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 7, 900, 0, 3)]);
        let actions = vec![Action::Hold; 400];
        let a = examine(&web, &wave, 0, &actions);
        assert!(matches!(a.outcome, Outcome::Breached { .. }));
        let lost = a.lost_at.expect("the run was lost, so it has a moment");
        assert!(lost > 0, "you cannot lose before you have played");
        assert!(
            a.doomed_for > 20,
            "the loss should land well before the breach, got {}",
            a.doomed_for
        );
        assert!(a.verdict.contains("turned against you"), "{}", a.verdict);
    }

    #[test]
    fn going_the_wrong_way_round_is_named_as_such() {
        // Two threats one lane counter-clockwise, urgent. Walking clockwise is
        // the long way round a fourteen-lane ring, and it is fatal.
        let web = Web::new(14, Shape::Circle);
        let wave = Wave::new(vec![
            Threat::root(Kind::Spiker, 13, 260, 0, 3),
            Threat::root(Kind::Spiker, 12, 420, 0, 3),
        ]);
        let actions: Vec<Action> = (0..400).map(|_| Action::Move(Dir::Cw)).collect();
        let a = examine(&web, &wave, 0, &actions);
        assert!(matches!(a.outcome, Outcome::Breached { .. }));
        assert!(a.lost_at.is_some());
        assert_eq!(a.went, Some(Dir::Cw));
        assert!(
            a.verdict.contains("went the other way") || a.verdict.contains("only way round"),
            "the direction should be named: {}",
            a.verdict
        );
    }

    /// Step the sim to exactly `tick` and stop there. `sim::replay` runs to
    /// completion, which is the wrong tool for asking what a board looked like
    /// part-way through.
    fn board_at(web: &Web, wave: &Wave, start: usize, actions: &[Action], tick: i32) -> SimState {
        let mut st = SimState::new(web, wave, start);
        let mut i = 0usize;
        while st.tick < tick && !st.done() {
            let a = actions.get(i).copied().unwrap_or(Action::Hold);
            i += 1;
            st.step(web, wave, a);
        }
        st
    }

    #[test]
    fn the_moment_of_loss_is_exact() {
        let web = Web::new(14, Shape::Circle);
        let wave = Wave::new(vec![Threat::root(Kind::Spiker, 7, 900, 0, 3)]);
        let actions = vec![Action::Hold; 400];
        let a = examine(&web, &wave, 0, &actions);
        let lost = a.lost_at.unwrap();
        // The tick before is winnable and the tick itself is not. Anything
        // else and the autopsy is naming the wrong moment.
        let before = board_at(&web, &wave, 0, &actions, lost - 1);
        let at = board_at(&web, &wave, 0, &actions, lost);
        assert_eq!(before.tick, lost - 1);
        assert!(
            still_alive(&web, &wave, &before),
            "tick {} should still be winnable",
            lost - 1
        );
        assert!(!still_alive(&web, &wave, &at), "tick {lost} should be lost");
    }

    #[test]
    fn beats_are_monotone_once_lost() {
        // Options never come back. If they appear to, the situation the
        // autopsy reads off the board is wrong.
        let web = Web::new(12, Shape::Star { depth: 40 });
        let wave = Wave::new(vec![
            Threat::root(Kind::Flipper, 3, 800, 0, 4).with_flip(17, Dir::Cw),
            Threat::root(Kind::Spiker, 9, 700, 20, 4),
        ]);
        let actions: Vec<Action> = (0..500)
            .map(|i| {
                if i % 3 == 0 {
                    Action::Fire
                } else {
                    Action::Move(Dir::Cw)
                }
            })
            .collect();
        let a = examine(&web, &wave, 0, &actions);
        let mut seen_dead = false;
        for b in &a.beats {
            if !b.holdable {
                seen_dead = true;
            } else {
                assert!(
                    !seen_dead,
                    "tick {} says holdable after an earlier tick said lost",
                    b.tick
                );
            }
        }
    }
}
