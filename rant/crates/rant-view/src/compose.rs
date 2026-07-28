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
        let Ok(Some(handle)) = dom::window().prompt_with_message("Your Bluesky handle:") else { return };
        let handle = handle.trim().to_string();
        if handle.is_empty() {
            return;
        }
        // This redirects; nothing after it runs.
        if let Err(e) = c.login(&handle, &crate::auth::login_opts()).await {
            status(&format!("Sign-in failed: {}", err_text(e)));
        }
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
            status_html(&format!(
                r#"Posted. <a href="/read/{handle}/{rkey}/">read it</a> · <a href="https://pdsls.dev/{uri}">the record</a>"#,
                handle = crate::html_escape(&handle),
                rkey = crate::html_escape(&rkey),
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
