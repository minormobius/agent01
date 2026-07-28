//! The composer: a box, a preview, and a post button.
//!
//! The preview is the point. It calls `rant_core::render_body` — the same
//! function the Worker calls, the same compiled code, one crate — so the
//! preview cannot disagree with the published page. Most editors have two
//! renderers and discover the difference in public.
//!
//! It re-renders on every keystroke with no debounce, because it costs a couple
//! of hundred microseconds and a debounce is a workaround for a slow renderer.
//!
//! The view switcher works here too: you can draft in `skeleton` and watch your
//! own function words disappear as you type, which is a genuinely unpleasant
//! and useful experience.

use wasm_bindgen::prelude::*;

use crate::auth::{ensure_write, AuthClient};
use crate::dom;
use crate::records::{err_text, now_iso, to_js};
use rant_core::{
    edit::{self, Action},
    predicates::{parse_chain, Opts, Predicate},
    render_body,
    standard::{Document, NSID_DOCUMENT},
    Doc,
};

const DRAFT_KEY: &str = "rant_draft";

pub fn wire(client: &AuthClient, signed_in: bool) {
    let Some(editor) = dom::q("#editor") else { return };

    restore_draft();
    render_preview();

    dom::on_input(&editor, || {
        render_preview();
        save_draft();
    });

    for link in dom::qa(".compose-views .view-link") {
        let id = dom::attr(&link, "data-view").unwrap_or_default();
        dom::on_click(&link, move || {
            if let Some(el) = dom::q("#preview") {
                let _ = el.set_attribute("data-view", &id);
            }
            for l in dom::qa(".compose-views .view-link") {
                dom::remove_class(&l, "on");
            }
            if let Some(l) = dom::q(&format!(".compose-views .view-link[data-view='{id}']")) {
                dom::add_class(&l, "on");
            }
            render_preview();
        });
    }

    wire_toolbar();
    wire_templates();

    if let Some(btn) = dom::q("#post") {
        dom::set_disabled(&btn, false);
        btn.set_text_content(Some(if signed_in { "post" } else { "sign in & post" }));
        let _ = client;
        let b = btn.clone();
        dom::on_click(&btn, move || {
            let b = b.clone();
            wasm_bindgen_futures::spawn_local(async move {
                publish(&b).await;
            });
        });
    }
}

/// The formatting buttons, and the Ctrl/⌘ shortcuts that do the same thing.
///
/// All the actual work is `rant_core::edit::apply` — pure string maths over
/// `(text, selection)`, tested natively with emoji and accents. This function
/// only reads the textarea, calls it, and writes the result back, which is why
/// the toolbar has no logic of its own to get wrong.
fn wire_toolbar() {
    for btn in dom::qa(".toolbar .tb") {
        let Some(id) = dom::attr(&btn, "data-fmt").and_then(|i| Action::parse(&i)) else { continue };
        // `mousedown` + preventDefault, not `click`: a click steals focus from
        // the textarea first, and the browser discards the selection — so the
        // button would format nothing at all.
        let cb = Closure::<dyn FnMut(web_sys::Event)>::new(move |e: web_sys::Event| {
            e.prevent_default();
            format_selection(id);
        });
        let _ = btn.add_event_listener_with_callback("mousedown", cb.as_ref().unchecked_ref());
        cb.forget();
    }

    let Some(editor) = dom::q("#editor") else { return };
    let cb = Closure::<dyn FnMut(web_sys::KeyboardEvent)>::new(move |e: web_sys::KeyboardEvent| {
        if !(e.meta_key() || e.ctrl_key()) || e.alt_key() {
            return;
        }
        let key = e.key().to_lowercase();
        let Some(ch) = key.chars().next().filter(|_| key.chars().count() == 1) else { return };
        if let Some(a) = Action::ALL.into_iter().find(|a| a.shortcut() == Some(ch)) {
            e.prevent_default();
            format_selection(a);
        }
    });
    let _ = editor.add_event_listener_with_callback("keydown", cb.as_ref().unchecked_ref());
    cb.forget();
}

/// Read selection → apply → write back → re-select → re-render the preview.
fn format_selection(action: Action) {
    let Some(ta) = dom::q("#editor").and_then(|e| e.dyn_into::<web_sys::HtmlTextAreaElement>().ok())
    else {
        return;
    };
    // selectionStart/End are UTF-16 code units, which is exactly what
    // `edit::apply` takes and returns. The conversion to byte offsets happens
    // inside rant-core, under test.
    let start = ta.selection_start().ok().flatten().unwrap_or(0) as usize;
    let end = ta.selection_end().ok().flatten().unwrap_or(0) as usize;

    let out = edit::apply(action, &ta.value(), start, end);
    ta.set_value(&out.text);
    let _ = ta.set_selection_range(out.start as u32, out.end as u32);
    let _ = ta.focus();

    render_preview();
    save_draft();
}

/// The starter chips.
///
/// Inserting into a non-empty editor would destroy what you have written, so it
/// asks first — and only then, because a confirm on an empty box is a dialog for
/// nothing.
fn wire_templates() {
    for chip in dom::qa(".starters .chip") {
        let Some(id) = dom::attr(&chip, "data-template") else { continue };
        dom::on_click(&chip, move || {
            let Some(ta) =
                dom::q("#editor").and_then(|e| e.dyn_into::<web_sys::HtmlTextAreaElement>().ok())
            else {
                return;
            };
            if !ta.value().trim().is_empty() {
                let ok = dom::window()
                    .confirm_with_message("Replace what you have written with this starter?")
                    .unwrap_or(false);
                if !ok {
                    return;
                }
            }
            wasm_bindgen_futures::spawn_local({
                let id = id.clone();
                async move {
                    if let Some(body) = fetch_template(&id).await {
                        let Some(ta) = dom::q("#editor")
                            .and_then(|e| e.dyn_into::<web_sys::HtmlTextAreaElement>().ok())
                        else {
                            return;
                        };
                        ta.set_value(&body);
                        // Land the cursor at the end, where the writing starts.
                        let n = body.chars().map(|c| c.len_utf16()).sum::<usize>() as u32;
                        let _ = ta.set_selection_range(n, n);
                        let _ = ta.focus();
                        render_preview();
                        save_draft();
                    }
                }
            });
        });
    }
}

/// Templates come from `/api/templates` rather than being compiled into this
/// module, so the worker, the API and the chips all read one registry in
/// `rant_core::templates` — and editing a starter needs no wasm rebuild.
async fn fetch_template(id: &str) -> Option<String> {
    let v = crate::records::fetch_json("/api/templates").await.ok()?;
    v.get("templates")?
        .as_array()?
        .iter()
        .find(|t| t.get("id").and_then(|i| i.as_str()) == Some(id))?
        .get("body")?
        .as_str()
        .map(|s| s.to_string())
}

/// The current view chain, from the switcher.
fn current_chain() -> Vec<Predicate> {
    let id = dom::q("#preview").and_then(|e| dom::attr(&e, "data-view")).unwrap_or_default();
    parse_chain(&id)
}

fn render_preview() {
    let src = dom::value("#editor");
    let doc = Doc::parse(&src, "");
    let chain = current_chain();
    let r = render_body(doc.body, &chain, &Opts::default());

    if let Some(p) = dom::q("#preview-body") {
        // `r.html` is produced by the engine: markdown path strips raw HTML and
        // filters link schemes, predicate path escapes every cell. This is the
        // one place the crate trusts a string, and it is trusted because of
        // what produced it, not because of where it came from.
        p.set_inner_html(&r.html);
    }
    if let Some(t) = dom::q("#preview-title") {
        t.set_text_content(Some(if doc.title.is_empty() { "Untitled" } else { &doc.title }));
    }
    dom::set_text(
        "#preview-meta",
        &format!(
            "{} words · {} min · /{}/ · {}",
            r.words,
            r.minutes,
            if doc.slug.is_empty() { "…" } else { &doc.slug },
            if doc.tags.is_empty() { "no tags".to_string() } else { doc.tags.join(", ") }
        ),
    );
}

/// Drafts survive a reload. Losing a rant to a stray refresh is the single
/// worst thing a box you type into can do.
fn save_draft() {
    if let Ok(Some(s)) = dom::window().local_storage() {
        let _ = s.set_item(DRAFT_KEY, &dom::value("#editor"));
    }
}

fn restore_draft() {
    let Ok(Some(s)) = dom::window().local_storage() else { return };
    let Ok(Some(v)) = s.get_item(DRAFT_KEY) else { return };
    if v.trim().is_empty() {
        return;
    }
    if let Some(e) = dom::q("#editor").and_then(|e| e.dyn_into::<web_sys::HtmlTextAreaElement>().ok()) {
        if e.value().trim().is_empty() {
            e.set_value(&v);
        }
    }
}

fn clear_draft() {
    if let Ok(Some(s)) = dom::window().local_storage() {
        let _ = s.remove_item(DRAFT_KEY);
    }
}

async fn publish(btn: &web_sys::Element) {
    let c = AuthClient::new();
    let _ = c.init().await;

    if !c.is_logged_in() {
        // The dialog owns the handle, the scope and the redirect. Nothing after
        // a successful sign-in runs here, because `login()` navigates away — so
        // say what happens to the draft before it does.
        status("Sign in to post — your draft is kept in this browser.");
        crate::signin::open();
        return;
    }

    let src = dom::value("#editor");
    if src.trim().is_empty() {
        status("Nothing to post.");
        return;
    }

    let mut doc = Doc::parse(&src, "");
    if doc.published.is_empty() {
        doc.published = now_iso();
    }

    let site = dom::q("#acct").and_then(|e| dom::attr(&e, "data-pub")).unwrap_or_default();
    let site = if site.is_empty() {
        dom::window().location().origin().unwrap_or_else(|_| "https://rant.mino.mobi".into())
    } else {
        site
    };

    let record = Document::from_doc(&doc, &site, &doc.published.clone());
    let Ok(js) = to_js(&record) else {
        status("Could not serialise the record.");
        return;
    };

    dom::set_disabled(btn, true);
    status("Posting…");

    if let Err(e) = ensure_write(&c, NSID_DOCUMENT).await {
        dom::set_disabled(btn, false);
        status(&format!("Write access was not granted: {}", err_text(e)));
        return;
    }

    match c.pds().create_record(NSID_DOCUMENT, &js).await {
        Ok(v) => {
            clear_draft();
            let uri = js_sys::Reflect::get(&v, &JsValue::from_str("uri"))
                .ok()
                .and_then(|u| u.as_string())
                .unwrap_or_default();
            let rkey = uri.rsplit('/').next().unwrap_or_default().to_string();
            // `/read/<actor>/` resolves a handle or a DID, so fall back to the
            // DID for an account whose handle has not propagated yet.
            let handle = crate::auth::user(&c)
                .map(|u| if u.handle.is_empty() { u.did } else { u.handle })
                .unwrap_or_default();
            // The moment anyone actually wants to share is the moment they have
            // just posted, so the share link is offered here as well as on the
            // page — built by the same `rant_core::share` the worker renders
            // into the post page, against the absolute URL Bluesky will need to
            // fetch the card from.
            let path = format!("/read/{handle}/{rkey}/");
            let origin =
                dom::window().location().origin().unwrap_or_else(|_| "https://rant.mino.mobi".into());
            let share = rant_core::share::bsky_compose(&doc.title, &format!("{origin}{path}"));
            status_html(&format!(
                r#"Posted. <a href="{path}">read it</a> · <a href="{share}" target="_blank" rel="noopener noreferrer">share to bluesky</a> · <a href="https://pdsls.dev/{uri}">the record</a>"#,
                path = crate::html_escape(&path),
                share = crate::html_escape(&share),
                uri = crate::html_escape(&uri),
            ));
        }
        Err(e) => {
            dom::set_disabled(btn, false);
            status(&format!("The PDS refused it: {}", err_text(e)));
        }
    }
}

fn status(msg: &str) {
    dom::set_text("#status", msg);
}

fn status_html(html: &str) {
    if let Some(e) = dom::q("#status") {
        e.set_inner_html(html);
    }
}
