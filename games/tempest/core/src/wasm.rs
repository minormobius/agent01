//! The browser ABI.
//!
//! Deliberately no `wasm-bindgen`. This crate has no dependencies anywhere
//! else and there is no reason for the one artefact that actually ships to be
//! the exception — `wasm-bindgen` would pull in a build tool, a generated glue
//! file and a version to keep in step with the toolchain, in exchange for
//! marshalling that amounts to a few dozen integers. So the interface is flat:
//! `i32` in, `i32` out, and one shared buffer the JavaScript reads through a
//! typed array.
//!
//! The result is a `tempest.wasm` small enough to commit, which keeps the
//! `games` surface exactly what it has always been — a directory of static
//! files with no build step on the deploy path.
//!
//! ## The interface
//!
//! ```text
//! tp_epoch()                 -> seed epoch; must match the pack's
//! tp_alloc(bytes)            -> ptr        scratch for handing a level in
//! tp_free(ptr, bytes)
//! tp_new(ptr, words, lane)   -> handle     decode a wave (see pack::encode_wire)
//! tp_drop(handle)
//! tp_step(handle, action)                  0 hold · 1 fire · 2 cw · 3 ccw
//! tp_state(handle)           -> ptr        packed snapshot, see STATE_* below
//! tp_state_len(handle)       -> words
//! tp_kills(handle)           -> ptr        [threat, tick, lane, depth] per kill
//! tp_kills_len(handle)       -> words
//! tp_slack(handle, opening)  -> ticks      margin left under that opening
//! tp_openings(handle)        -> bitmask    which ways round still hold
//! tp_holdable(handle)        -> 0 / 1
//! tp_autopsy(handle)         -> ptr        UTF-8, the verdict
//! tp_autopsy_len(handle)     -> bytes
//! tp_lost_at(handle)         -> tick, or -1
//! ```
//!
//! Everything is defensive: a bad handle or a malformed level returns `-1`
//! rather than trapping, because a trap in wasm takes the page's whole module
//! with it and there is no way back from one.

use std::cell::RefCell;

use crate::autopsy::{self, Autopsy};
use crate::level::Wave;
use crate::sim::{Action, Outcome, SimState};
use crate::solver::Opening;
use crate::web::{Dir, Web};

/// Fixed prefix of the state snapshot.
pub const STATE_HEADER: usize = 10;
/// Words per threat in the snapshot.
pub const STATE_THREAT: usize = 5;
/// Words per shot in the snapshot.
pub const STATE_SHOT: usize = 2;

struct Game {
    web: Web,
    wave: Wave,
    st: SimState,
    start_lane: usize,
    actions: Vec<Action>,
    state_buf: Vec<i32>,
    kill_buf: Vec<i32>,
    text_buf: Vec<u8>,
    autopsy: Option<Autopsy>,
}

thread_local! {
    static GAMES: RefCell<Vec<Option<Game>>> = const { RefCell::new(Vec::new()) };
    static SCRATCH: RefCell<Vec<Vec<u8>>> = const { RefCell::new(Vec::new()) };
}

fn with_game<T>(h: i32, f: impl FnOnce(&mut Game) -> T, dflt: T) -> T {
    GAMES.with(|g| {
        let mut g = g.borrow_mut();
        match g.get_mut(h as usize).and_then(|s| s.as_mut()) {
            Some(game) => f(game),
            None => dflt,
        }
    })
}

#[no_mangle]
pub extern "C" fn tp_epoch() -> i32 {
    crate::SEED_EPOCH as i32
}

/// Scratch memory for handing a level in. The allocation is remembered so
/// `tp_free` can hand back a `Vec` with the right capacity — wasm has no
/// `free(ptr)` that works without one.
#[no_mangle]
pub extern "C" fn tp_alloc(bytes: i32) -> i32 {
    if bytes <= 0 || bytes > 1 << 20 {
        return 0;
    }
    let mut v = vec![0u8; bytes as usize];
    let ptr = v.as_mut_ptr() as i32;
    SCRATCH.with(|s| s.borrow_mut().push(v));
    ptr
}

#[no_mangle]
pub extern "C" fn tp_free(ptr: i32, _bytes: i32) {
    SCRATCH.with(|s| {
        let mut s = s.borrow_mut();
        if let Some(i) = s.iter().position(|v| v.as_ptr() as i32 == ptr) {
            s.remove(i);
        }
    });
}

/// Decode a wave written by [`crate::pack::encode_wire`] and start it.
/// Returns a handle, or `-1` if the buffer does not describe a legal wave.
///
/// # Safety
///
/// `ptr` must point at `words` readable `i32`s, which is what `tp_alloc`
/// returned and JavaScript filled in.
#[no_mangle]
pub unsafe extern "C" fn tp_new(ptr: i32, words: i32, start_lane: i32) -> i32 {
    if ptr == 0 || words <= 0 || words > 1 << 16 {
        return -1;
    }
    let slice = std::slice::from_raw_parts(ptr as *const i32, words as usize);
    let Some((web, wave)) = crate::pack::decode_wire(slice) else {
        return -1;
    };
    if wave.is_empty() {
        return -1;
    }
    let lane = (start_lane.max(0) as usize) % web.lanes;
    let st = SimState::new(&web, &wave, lane);
    let game = Game {
        web,
        wave,
        st,
        start_lane: lane,
        actions: Vec::new(),
        state_buf: Vec::new(),
        kill_buf: Vec::new(),
        text_buf: Vec::new(),
        autopsy: None,
    };
    GAMES.with(|g| {
        let mut g = g.borrow_mut();
        let slot = g.iter().position(|s| s.is_none()).unwrap_or_else(|| {
            g.push(None);
            g.len() - 1
        });
        g[slot] = Some(game);
        slot as i32
    })
}

#[no_mangle]
pub extern "C" fn tp_drop(h: i32) {
    GAMES.with(|g| {
        let mut g = g.borrow_mut();
        if let Some(slot) = g.get_mut(h as usize) {
            *slot = None;
        }
    });
}

/// Rewind to the start of the same wave, keeping the handle.
#[no_mangle]
pub extern "C" fn tp_reset(h: i32, start_lane: i32) -> i32 {
    with_game(
        h,
        |g| {
            let lane = (start_lane.max(0) as usize) % g.web.lanes;
            g.start_lane = lane;
            g.st = SimState::new(&g.web, &g.wave, lane);
            g.actions.clear();
            g.autopsy = None;
            0
        },
        -1,
    )
}

fn action_of(code: i32) -> Action {
    match code {
        1 => Action::Fire,
        2 => Action::Move(Dir::Cw),
        3 => Action::Move(Dir::Ccw),
        _ => Action::Hold,
    }
}

#[no_mangle]
pub extern "C" fn tp_step(h: i32, action: i32) -> i32 {
    with_game(
        h,
        |g| {
            let a = action_of(action);
            g.actions.push(a);
            let web = &g.web;
            let wave = &g.wave;
            g.st.step(web, wave, a);
            match g.st.outcome {
                Outcome::Running => 0,
                Outcome::Cleared { .. } => 1,
                Outcome::Breached { .. } => 2,
                Outcome::Stalled { .. } => 3,
            }
        },
        -1,
    )
}

/// Pack the snapshot the renderer draws from.
///
/// ```text
/// [0] tick              [5] can fire (0/1)
/// [1] outcome           [6] settled (0/1)
/// [2] player lane       [7] kills so far
/// [3] player from-lane  [8] threat count  t
/// [4] transit ‰         [9] shot count    s
/// then t × [alive, active, lane, depth, kind]
/// then s × [lane, depth]
/// ```
#[no_mangle]
pub extern "C" fn tp_state(h: i32) -> i32 {
    with_game(
        h,
        |g| {
            let st = &g.st;
            let mut v = Vec::with_capacity(
                STATE_HEADER + g.wave.len() * STATE_THREAT + st.shots.len() * STATE_SHOT,
            );
            v.push(st.tick);
            v.push(match st.outcome {
                Outcome::Running => 0,
                Outcome::Cleared { .. } => 1,
                Outcome::Breached { .. } => 2,
                Outcome::Stalled { .. } => 3,
            });
            v.push(st.lane as i32);
            v.push(st.from_lane as i32);
            v.push(st.transit_permille(&g.web));
            v.push(st.can_fire() as i32);
            v.push(st.settled() as i32);
            v.push(st.kills.len() as i32);
            v.push(g.wave.len() as i32);
            v.push(st.shots.len() as i32);
            for i in 0..g.wave.len() {
                let t = &g.wave.threats[i];
                match st.entry[i] {
                    Some(e) if st.alive[i] => {
                        let active = e.tick <= st.tick;
                        v.push(1);
                        v.push(active as i32);
                        v.push(t.lane_at(&g.web, e, st.tick) as i32);
                        v.push(t.depth_at(e, st.tick));
                    }
                    _ => v.extend_from_slice(&[st.alive[i] as i32, 0, 0, 0]),
                }
                v.push(match t.kind {
                    crate::level::Kind::Flipper => 0,
                    crate::level::Kind::Tanker => 1,
                    crate::level::Kind::Spiker => 2,
                });
            }
            for s in &st.shots {
                v.push(s.lane as i32);
                v.push(s.depth_at(st.tick));
            }
            g.state_buf = v;
            g.state_buf.as_ptr() as i32
        },
        0,
    )
}

/// Every kill so far, as `[threat, tick, lane, depth]` per kill. The golden
/// vectors compare these tick for tick, which is what makes the committed
/// `tempest.wasm` checkable against the Rust it was built from.
#[no_mangle]
pub extern "C" fn tp_kills(h: i32) -> i32 {
    with_game(
        h,
        |g| {
            let mut v = Vec::with_capacity(g.st.kills.len() * 4);
            for k in &g.st.kills {
                v.push(k.threat as i32);
                v.push(k.tick);
                v.push(k.lane as i32);
                v.push(k.depth);
            }
            g.kill_buf = v;
            g.kill_buf.as_ptr() as i32
        },
        0,
    )
}

#[no_mangle]
pub extern "C" fn tp_kills_len(h: i32) -> i32 {
    with_game(h, |g| g.kill_buf.len() as i32, 0)
}

/// Slack under `opening` (0 cw, 1 ccw, 2 stand) from the current board, or -1
/// if that opening no longer holds.
#[no_mangle]
pub extern "C" fn tp_slack(h: i32, opening: i32) -> i32 {
    with_game(
        h,
        |g| {
            let sit = autopsy::situation_from(&g.wave, &g.st);
            let o = match opening {
                0 => Some(Opening::Cw),
                1 => Some(Opening::Ccw),
                2 => Some(Opening::Stand),
                _ => None,
            };
            crate::solver::slack_of(&g.web, &g.wave, &sit, o, g.wave.horizon() + 1)
        },
        -1,
    )
}

#[no_mangle]
pub extern "C" fn tp_state_len(h: i32) -> i32 {
    with_game(h, |g| g.state_buf.len() as i32, 0)
}

/// Is the rim still holdable from right now? The live version of the
/// certificate — cheap enough to ask once a second, not once a frame.
#[no_mangle]
pub extern "C" fn tp_holdable(h: i32) -> i32 {
    with_game(
        h,
        |g| autopsy::still_alive(&g.web, &g.wave, &g.st) as i32,
        -1,
    )
}

/// Bit 0 clockwise, bit 1 counter-clockwise, bit 2 stand: which openings from
/// here still hold the rim. Drives the assist arrows.
#[no_mangle]
pub extern "C" fn tp_openings(h: i32) -> i32 {
    with_game(
        h,
        |g| {
            let sit = autopsy::situation_from(&g.wave, &g.st);
            let mut mask = 0;
            for o in Opening::ALL {
                if crate::solver::hold(&g.web, &g.wave, &sit, Some(o), 0).is_some() {
                    mask |= 1 << (o as usize);
                }
            }
            mask
        },
        -1,
    )
}

fn ensure_autopsy(g: &mut Game) {
    if g.autopsy.is_none() {
        let a = autopsy::examine(&g.web, &g.wave, g.start_lane, &g.actions);
        g.text_buf = a.verdict.clone().into_bytes();
        g.autopsy = Some(a);
    }
}

#[no_mangle]
pub extern "C" fn tp_autopsy(h: i32) -> i32 {
    with_game(
        h,
        |g| {
            ensure_autopsy(g);
            g.text_buf.as_ptr() as i32
        },
        0,
    )
}

#[no_mangle]
pub extern "C" fn tp_autopsy_len(h: i32) -> i32 {
    with_game(
        h,
        |g| {
            ensure_autopsy(g);
            g.text_buf.len() as i32
        },
        0,
    )
}

/// The tick the run stopped being winnable, or `-1` if it never did.
#[no_mangle]
pub extern "C" fn tp_lost_at(h: i32) -> i32 {
    with_game(
        h,
        |g| {
            ensure_autopsy(g);
            g.autopsy.as_ref().and_then(|a| a.lost_at).unwrap_or(-1)
        },
        -1,
    )
}

/// How many ticks the player kept going after the run was already decided.
#[no_mangle]
pub extern "C" fn tp_doomed_for(h: i32) -> i32 {
    with_game(
        h,
        |g| {
            ensure_autopsy(g);
            g.autopsy.as_ref().map(|a| a.doomed_for).unwrap_or(0)
        },
        0,
    )
}
