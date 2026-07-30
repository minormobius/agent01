//! Sign in with ATProto: a handle field with real typeahead, then OAuth.
//!
//! Ported from `fluoddity/handle-dialog.js`, which exists for exactly the reason
//! this module does — its header comment says it replaced "a bare `prompt()`".
//! This site shipped the bare prompt anyway, and worse: the header's sign-in
//! control was an `<a href="/compose/">`, so pressing it navigated and never
//! authenticated at all.
//!
//! ## Two CSP holes this had to fix
//!
//! `default-src 'self'` forbade `WebAssembly.instantiateStreaming`, so the whole
//! browser module refused to compile — `script-src 'wasm-unsafe-eval'` fixes that
//! and permits wasm without permitting `eval`. Avatars come from `cdn.bsky.app`,
//! which needed an `img-src` entry. The suggestion *query* is proxied through
//! `/api/typeahead` so it needs no exception at all. CSP failures are silent: a
//! console warning and a dead feature.
//!
//! ## No-JavaScript
//!
//! Sign-in genuinely requires it — the flow is a JSON POST to the auth worker
//! followed by a redirect to the user's own authorization server, which a plain
//! form cannot express. Everything on a *reading* path still works without it;
//! the server-rendered header carries a `<noscript>` saying so rather than
//! offering a control that does nothing.

use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use web_sys::{HtmlInputElement, KeyboardEvent};

use crate::auth::AuthClient;
use crate::dom;

/// Proxied through our own origin — see `rant-worker`'s `typeahead()` for why.
/// It keeps `connect-src` at `'self'`, keeps the visitor's IP away from the
/// AppView, and is the only reason the browser test can exercise this at all.
const TYPEAHEAD: &str = "/api/typeahead";
const DEBOUNCE_MS: i32 = 180;
const LIMIT: usize = 8;

#[derive(Clone)]
struct Actor {
    handle: String,
    display: String,
    avatar: String,
}

struct State {
    items: Vec<Actor>,
    active: i32,
    /// Bumped on every keystroke. A response whose generation is stale is
    /// dropped, which is the same protection `AbortController` gives the JS
    /// reference without pulling another web-sys feature in.
    generation: u32,
}

/// Wire every control that should open the dialog.
///
/// Anything with `data-signin` opens it — the header button, the empty states on
/// `/mine/`, whatever comes next — so there is one sign-in affordance and one
/// place it is implemented.
pub fn wire_triggers() {
    for el in dom::qa("[data-signin]") {
        dom::on_click(&el, || open());
    }
}

/// Show the dialog. Focus lands in the input; Escape or the backdrop closes it.
pub fn open() {
    if dom::q(".signin-ov").is_some() {
        return; // already open
    }
    let doc = dom::document();
    let ov = doc.create_element("div").unwrap();
    let _ = ov.set_attribute("class", "signin-ov");
    let _ = ov.set_attribute("role", "dialog");
    let _ = ov.set_attribute("aria-modal", "true");
    let _ = ov.set_attribute("aria-label", "Sign in with ATProto");
    ov.set_inner_html(
        r#"<div class="signin-card">
<h2 class="signin-title">Sign in with ATProto</h2>
<p class="fine">Your handle on Bluesky or any ATProto PDS. You authorise on your own server —
this site never sees your password, and asks for write access to four
<code>site.standard.*</code> collections and nothing else.</p>
<div class="signin-wrap">
  <input class="signin-input" type="text" inputmode="url" placeholder="you.bsky.social"
    autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false"
    aria-label="Your ATProto handle" aria-autocomplete="list">
  <div class="signin-results" role="listbox"></div>
</div>
<p class="signin-status fine"></p>
<div class="signin-row">
  <button class="btn ghost signin-cancel" type="button">cancel</button>
  <button class="btn signin-go" type="button">sign in →</button>
</div>
</div>"#,
    );
    let _ = doc.body().unwrap().append_child(&ov);

    let input: HtmlInputElement =
        ov.query_selector(".signin-input").unwrap().unwrap().dyn_into().unwrap();
    let results = ov.query_selector(".signin-results").unwrap().unwrap();

    let state = Rc::new(RefCell::new(State { items: Vec::new(), active: -1, generation: 0 }));

    wire_typeahead(&input, &results, state.clone());

    // Submit
    {
        let i = input.clone();
        if let Some(go) = ov.query_selector(".signin-go").unwrap() {
            dom::on_click(&go, move || submit(&i));
        }
    }
    // Cancel, and clicking the backdrop
    {
        if let Some(cancel) = ov.query_selector(".signin-cancel").unwrap() {
            dom::on_click(&cancel, close);
        }
        let ov2 = ov.clone();
        let cb = Closure::<dyn FnMut(web_sys::Event)>::new(move |e: web_sys::Event| {
            // Only the backdrop itself, not a click that bubbled from the card.
            if e.target().map(|t| t == ov2.clone().into()).unwrap_or(false) {
                close();
            }
        });
        let _ = ov.add_event_listener_with_callback("mousedown", cb.as_ref().unchecked_ref());
        cb.forget();
    }

    let _ = input.focus();
}

pub fn close() {
    if let Some(ov) = dom::q(".signin-ov") {
        ov.remove();
    }
}

fn wire_typeahead(input: &HtmlInputElement, results: &web_sys::Element, state: Rc<RefCell<State>>) {
    // Debounced search on input.
    {
        let input = input.clone();
        let results = results.clone();
        let state = state.clone();
        dom::on_input(&input.clone().into(), move || {
            let q = input.value().trim().trim_start_matches('@').to_string();
            let generation = {
                let mut s = state.borrow_mut();
                s.generation += 1;
                s.generation
            };
            if q.chars().count() < 2 {
                state.borrow_mut().items.clear();
                render(&results, &state);
                return;
            }
            let results = results.clone();
            let state = state.clone();
            let cb = Closure::once_into_js(move || {
                wasm_bindgen_futures::spawn_local(async move {
                    let found = search(&q).await;
                    // Drop a response the user has already typed past.
                    if state.borrow().generation != generation {
                        return;
                    }
                    {
                        let mut s = state.borrow_mut();
                        s.items = found;
                        s.active = -1;
                    }
                    render(&results, &state);
                });
            });
            let _ = dom::window().set_timeout_with_callback_and_timeout_and_arguments_0(
                cb.unchecked_ref(),
                DEBOUNCE_MS,
            );
        });
    }

    // Keyboard: arrows move, Enter picks-then-submits, Escape closes.
    {
        let input_k = input.clone();
        let results_k = results.clone();
        let state_k = state.clone();
        let cb = Closure::<dyn FnMut(KeyboardEvent)>::new(move |e: KeyboardEvent| {
            let len = state_k.borrow().items.len() as i32;
            match e.key().as_str() {
                "ArrowDown" if len > 0 => {
                    e.prevent_default();
                    let mut s = state_k.borrow_mut();
                    s.active = (s.active + 1).rem_euclid(len);
                    drop(s);
                    render(&results_k, &state_k);
                }
                "ArrowUp" if len > 0 => {
                    e.prevent_default();
                    let mut s = state_k.borrow_mut();
                    s.active = (s.active - 1 + len).rem_euclid(len);
                    drop(s);
                    render(&results_k, &state_k);
                }
                "Escape" => {
                    if len > 0 {
                        state_k.borrow_mut().items.clear();
                        render(&results_k, &state_k);
                    } else {
                        close();
                    }
                }
                "Enter" => {
                    e.prevent_default();
                    let picked = {
                        let s = state_k.borrow();
                        if s.active >= 0 {
                            s.items.get(s.active as usize).map(|a| a.handle.clone())
                        } else {
                            None
                        }
                    };
                    if let Some(h) = picked {
                        input_k.set_value(&h);
                        state_k.borrow_mut().items.clear();
                        render(&results_k, &state_k);
                    }
                    submit(&input_k);
                }
                _ => {}
            }
        });
        let _ = input.add_event_listener_with_callback("keydown", cb.as_ref().unchecked_ref());
        cb.forget();
    }

    // Clicking a suggestion. `mousedown` rather than `click`, so the pick lands
    // before the input's blur can tear the list down underneath the pointer.
    {
        let input_m = input.clone();
        let results_m = results.clone();
        let state_m = state.clone();
        let cb = Closure::<dyn FnMut(web_sys::Event)>::new(move |e: web_sys::Event| {
            let Some(target) = e.target() else { return };
            let Ok(el) = target.dyn_into::<web_sys::Element>() else { return };
            let Some(item) = el.closest(".signin-item").ok().flatten() else { return };
            e.prevent_default();
            if let Some(h) = dom::attr(&item, "data-handle") {
                input_m.set_value(&h);
                state_m.borrow_mut().items.clear();
                render(&results_m, &state_m);
                let _ = input_m.focus();
            }
        });
        let _ = results.add_event_listener_with_callback("mousedown", cb.as_ref().unchecked_ref());
        cb.forget();
    }
}

/// Query the public AppView. No auth needed — that is the point of using the
/// public endpoint for the pre-login step.
async fn search(q: &str) -> Vec<Actor> {
    let url = format!("{TYPEAHEAD}?q={}&limit={LIMIT}", enc(q));
    let Ok(v) = fetch_json(&url).await else { return Vec::new() };
    v.get("actors")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let handle = a.get("handle")?.as_str()?.to_string();
                    Some(Actor {
                        display: a
                            .get("displayName")
                            .and_then(|d| d.as_str())
                            .filter(|d| !d.trim().is_empty())
                            .unwrap_or(&handle)
                            .to_string(),
                        avatar: a.get("avatar").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                        handle,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn render(results: &web_sys::Element, state: &Rc<RefCell<State>>) {
    let s = state.borrow();
    if s.items.is_empty() {
        results.set_inner_html("");
        dom::remove_class(results, "show");
        return;
    }
    let mut html = String::new();
    for (i, a) in s.items.iter().enumerate() {
        // Every field here is somebody else's display name. All of it is escaped.
        let avatar = if a.avatar.is_empty() {
            r#"<span class="av"></span>"#.to_string()
        } else {
            format!(
                r#"<img src="{}" alt="" referrerpolicy="no-referrer" loading="lazy">"#,
                crate::html_escape(&a.avatar)
            )
        };
        html.push_str(&format!(
            r#"<div class="signin-item{on}" role="option" aria-selected="{sel}" data-handle="{h}">{avatar}<span class="nm">{d}<small>@{h}</small></span></div>"#,
            on = if i as i32 == s.active { " on" } else { "" },
            sel = if i as i32 == s.active { "true" } else { "false" },
            h = crate::html_escape(&a.handle),
            d = crate::html_escape(&a.display),
            avatar = avatar,
        ));
    }
    results.set_inner_html(&html);
    dom::add_class(results, "show");
}

/// Take the handle out of the field and start OAuth.
fn submit(input: &HtmlInputElement) {
    let handle = input.value().trim().trim_start_matches('@').to_string();
    if handle.is_empty() {
        dom::set_text(".signin-status", "Enter your handle first.");
        let _ = input.focus();
        return;
    }
    dom::set_text(".signin-status", "Redirecting to your server…");
    if let Some(go) = dom::q(".signin-go") {
        dom::set_disabled(&go, true);
    }

    wasm_bindgen_futures::spawn_local(async move {
        let c = AuthClient::new();
        // No init() first: this is a user gesture and login() ends in a
        // top-level redirect, so there is nothing to resume.
        if let Err(e) = c.login(&handle, &crate::auth::login_opts()).await {
            let msg = crate::records::err_text(e);
            dom::set_text(".signin-status", &format!("Sign-in failed: {msg}"));
            if let Some(go) = dom::q(".signin-go") {
                dom::set_disabled(&go, false);
            }
        }
    });
}

fn enc(s: &str) -> String {
    js_sys::encode_uri_component(s).as_string().unwrap_or_default()
}

async fn fetch_json(url: &str) -> Result<serde_json::Value, JsValue> {
    let resp = wasm_bindgen_futures::JsFuture::from(dom::window().fetch_with_str(url)).await?;
    let resp: web_sys::Response = resp.dyn_into()?;
    if !resp.ok() {
        return Err(JsValue::from_str(&format!("HTTP {}", resp.status())));
    }
    let json = wasm_bindgen_futures::JsFuture::from(resp.json()?).await?;
    serde_wasm_bindgen::from_value(json).map_err(|e| JsValue::from_str(&e.to_string()))
}
