//! Playing the timed views.
//!
//! RSVP and crawl arrive from the server as ordinary markup: one `<span class="w">`
//! per frame, each carrying the `data-ms` the engine computed for it. Without
//! this module they are a readable list of frames — patient, but correct.
//!
//! With it, they play. The dwell values are the server's, not recomputed here,
//! so the timing you get is the timing the engine described; the speed slider
//! scales them rather than replacing the model.

use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;

use crate::dom;

struct State {
    frames: Vec<web_sys::Element>,
    idx: usize,
    playing: bool,
    /// Multiplier applied to every server-computed dwell. 1.0 is the rate the
    /// page was rendered at.
    scale: f64,
    base_wpm: f64,
    rsvp: bool,
}

pub fn wire() {
    let Some(root) = dom::q(".timed") else { return };
    let rsvp = dom::q(".view-rsvp").is_some();
    let base_wpm = dom::attr(&root, "data-wpm").and_then(|v| v.parse().ok()).unwrap_or(350.0);
    let frames = dom::qa(".timed .w");
    if frames.is_empty() {
        return;
    }

    // RSVP shows one frame at a time in place; crawl reveals cumulatively.
    if rsvp {
        for f in frames.iter().skip(1) {
            dom::add_class(f, "hidden");
        }
    } else {
        for f in frames.iter() {
            dom::add_class(f, "pending");
        }
    }
    dom::add_class(&root, "ready");

    let state = Rc::new(RefCell::new(State {
        frames,
        idx: 0,
        playing: false,
        scale: 1.0,
        base_wpm,
        rsvp,
    }));

    if let Some(btn) = dom::q(".timed .play") {
        let st = state.clone();
        let b = btn.clone();
        dom::on_click(&btn, move || {
            let now_playing = {
                let mut s = st.borrow_mut();
                s.playing = !s.playing;
                s.playing
            };
            b.set_text_content(Some(if now_playing { "❚❚" } else { "▶" }));
            if now_playing {
                tick(st.clone());
            }
        });
    }

    if let Some(slider) = dom::q(".timed .speed") {
        let st = state.clone();
        let sl = slider.clone();
        dom::on_input(&slider, move || {
            let Some(input) = sl.clone().dyn_into::<web_sys::HtmlInputElement>().ok() else { return };
            let wpm: f64 = input.value().parse().unwrap_or(350.0);
            let mut s = st.borrow_mut();
            // Faster words-per-minute means shorter dwells: the scale is the
            // inverse ratio against the rate the server rendered at.
            s.scale = s.base_wpm / wpm.max(60.0);
            dom::set_text(".timed .wpm", &format!("{} wpm", wpm as u32));
        });
    }
}

/// Show the frame at `idx`, then schedule the next.
fn tick(state: Rc<RefCell<State>>) {
    let (delay, done) = {
        let mut s = state.borrow_mut();
        if !s.playing || s.idx >= s.frames.len() {
            (0.0, true)
        } else {
            let i = s.idx;
            let rsvp = s.rsvp;
            let frame = s.frames[i].clone();
            if rsvp {
                if i > 0 {
                    dom::add_class(&s.frames[i - 1], "hidden");
                }
                dom::remove_class(&frame, "hidden");
            } else {
                dom::remove_class(&frame, "pending");
                dom::add_class(&frame, "lit");
                if i >= 2 {
                    dom::remove_class(&s.frames[i - 2], "lit");
                }
            }
            scroll_into_view(&frame);

            let ms: f64 = dom::attr(&frame, "data-ms").and_then(|v| v.parse().ok()).unwrap_or(180.0);
            s.idx += 1;
            (ms * s.scale, false)
        }
    };

    if done {
        if let Some(b) = dom::q(".timed .play") {
            b.set_text_content(Some("▶"));
        }
        state.borrow_mut().playing = false;
        return;
    }

    let next = state.clone();
    let cb = Closure::once_into_js(move || tick(next));
    let _ = dom::window().set_timeout_with_callback_and_timeout_and_arguments_0(
        cb.unchecked_ref(),
        delay.clamp(20.0, 6000.0) as i32,
    );
}

/// Keep the active frame visible in crawl mode. RSVP replaces in place, so it
/// never needs to scroll — and scrolling it would defeat the point.
fn scroll_into_view(el: &web_sys::Element) {
    if dom::q(".view-rsvp").is_some() {
        return;
    }
    // Smooth behaviour needs the options overload, which lives behind an
    // unstable web-sys feature. The boolean overload is enough here: `false`
    // means "align to the nearest edge", so the lit word is kept on screen
    // without yanking the page to the top on every frame.
    el.scroll_into_view_with_bool(false);
}
