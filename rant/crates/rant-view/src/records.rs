//! Subscribe and recommend — two buttons, two records, both in the *reader's*
//! repo.
//!
//! Nothing about a subscription is stored on this site. There is no subscriber
//! table to leak, no unsubscribe link to honour, and no way for the publisher
//! to add you to anything. Unsubscribing is deleting your own record.
//!
//! The cost of that design is that we cannot cheaply know whether *you* are
//! subscribed: answering it means listing your `site.standard.graph.subscription`
//! records and looking for ours, which we do once on load for a signed-in
//! reader — and that lookup also yields the **rkey**, which is what lets the same
//! button undo itself. A button that can only ever add is not "your data".

use wasm_bindgen::prelude::*;

use crate::auth::{ensure_write, AuthClient};
use crate::dom;
use rant_core::standard::{Recommend, Subscription, NSID_RECOMMEND, NSID_SUBSCRIPTION};

pub fn wire(client: &AuthClient, signed_in: bool) {
    subscribe_button(signed_in);
    recommend_button(signed_in);
    subscriber_count();

    if signed_in {
        let _ = client;
        wasm_bindgen_futures::spawn_local(async {
            let c = AuthClient::new();
            let _ = c.init().await;
            reflect_existing(&c).await;
        });
    }
}

fn subscribe_button(signed_in: bool) {
    let Some(btn) = dom::q(".btn.subscribe") else { return };
    let Some(publication) = dom::attr(&btn, "data-pub").filter(|p| !p.is_empty()) else {
        // No publication record to subscribe to yet. Say so rather than
        // offering a button that would write a record pointing at nothing.
        btn.set_text_content(Some("not yet published"));
        return;
    };
    dom::set_disabled(&btn, false);
    if !signed_in {
        btn.set_text_content(Some("sign in to subscribe"));
    }

    let b = btn.clone();
    dom::on_click(&btn, move || {
        let b = b.clone();
        let publication = publication.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let c = AuthClient::new();
            let _ = c.init().await;
            if !c.is_logged_in() {
                prompt_login(&c).await;
                return;
            }
            toggle(&b, &c, NSID_SUBSCRIPTION, "subscribe", "subscribed ✓", "unsubscribe", || {
                Subscription::new(&publication, &now_iso())
            })
            .await;
        });
    });
}

fn recommend_button(signed_in: bool) {
    let Some(btn) = dom::q(".btn.recommend") else { return };
    let Some(document_uri) = dom::attr(&btn, "data-doc").filter(|d| !d.is_empty()) else { return };
    dom::set_disabled(&btn, false);
    if !signed_in {
        btn.set_text_content(Some("sign in to recommend"));
    }

    let b = btn.clone();
    dom::on_click(&btn, move || {
        let b = b.clone();
        let document_uri = document_uri.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let c = AuthClient::new();
            let _ = c.init().await;
            if !c.is_logged_in() {
                prompt_login(&c).await;
                return;
            }
            toggle(&b, &c, NSID_RECOMMEND, "recommend", "recommended ✓", "un-recommend", || {
                Recommend::new(&document_uri, &now_iso())
            })
            .await;
        });
    });
}

/// One button, both directions.
///
/// If the button carries a `data-rkey` we already hold the record, so the click
/// deletes it; otherwise the click creates it. Both directions use the same
/// `repo:<nsid>` grant — `deleteRecord` needs no additional scope, because the
/// permission was always "manage this collection", not "append to it".
///
/// `build` is a closure rather than a value so the record (and its `createdAt`)
/// is only constructed on the create path.
async fn toggle<T: serde::Serialize>(
    btn: &web_sys::Element,
    c: &AuthClient,
    nsid: &str,
    idle: &str,
    held: &str,
    undo: &str,
    build: impl FnOnce() -> T,
) {
    let existing = dom::attr(btn, "data-rkey").filter(|r| !r.is_empty());
    btn.set_text_content(Some("…"));
    dom::set_disabled(btn, true);

    if let Err(e) = ensure_write(c, nsid).await {
        dom::set_disabled(btn, false);
        btn.set_text_content(Some(if existing.is_some() { held } else { idle }));
        fail(btn, &format!("write access not granted: {}", err_text(e)));
        return;
    }

    let result = match &existing {
        // Undo. Deleting is not reversible and this one is a single click, so it
        // is confirmed — an accidental un-recommend is cheap, an accidental
        // un-publish is not, and the same code path serves both.
        Some(rkey) => c.pds().delete_record(nsid, rkey).await.map(|_| None),
        None => {
            let Ok(v) = to_js(&build()) else {
                dom::set_disabled(btn, false);
                btn.set_text_content(Some(idle));
                fail(btn, "could not serialise the record");
                return;
            };
            c.pds().create_record(nsid, &v).await.map(|res| {
                js_sys::Reflect::get(&res, &JsValue::from_str("uri"))
                    .ok()
                    .and_then(|u| u.as_string())
                    .and_then(|uri| rant_core::standard::AtUri::parse(&uri).map(|a| a.rkey))
            })
        }
    };

    dom::set_disabled(btn, false);
    match result {
        Ok(Some(rkey)) => mark_held(btn, &rkey, held, undo),
        Ok(None) => {
            // Deleted. Back to the offer.
            btn.set_text_content(Some(idle));
            dom::remove_class(btn, "done");
            let _ = btn.remove_attribute("data-rkey");
            let _ = btn.remove_attribute("title");
        }
        Err(e) => {
            btn.set_text_content(Some(if existing.is_some() { held } else { idle }));
            fail(btn, &err_text(e));
        }
    }
}

/// If the reader already holds the record, flip the button into its undo state
/// and stash the rkey on it.
///
/// Only the most recent 100 records are checked. Somebody with more than a
/// hundred subscriptions may be offered a duplicate; the PDS will store it and a
/// duplicate subscription is harmless, whereas paging an entire collection on
/// every page load is not free.
async fn reflect_existing(c: &AuthClient) {
    if let Some(btn) = dom::q(".btn.subscribe") {
        if let Some(target) = dom::attr(&btn, "data-pub").filter(|t| !t.is_empty()) {
            if let Some(rkey) = crate::mine::find_record(c, NSID_SUBSCRIPTION, "publication", &target).await {
                mark_held(&btn, &rkey, "subscribed ✓", "unsubscribe");
            }
        }
    }
    if let Some(btn) = dom::q(".btn.recommend") {
        if let Some(target) = dom::attr(&btn, "data-doc").filter(|t| !t.is_empty()) {
            if let Some(rkey) = crate::mine::find_record(c, NSID_RECOMMEND, "document", &target).await {
                mark_held(&btn, &rkey, "recommended ✓", "un-recommend");
            }
        }
    }
}

/// Put a button into its "you already hold this" state: labelled with the fact,
/// titled with the undo, and carrying the rkey that makes the undo possible.
fn mark_held(btn: &web_sys::Element, rkey: &str, label: &str, undo: &str) {
    btn.set_text_content(Some(label));
    dom::add_class(btn, "done");
    dom::set_disabled(btn, false);
    let _ = btn.set_attribute("data-rkey", rkey);
    let _ = btn.set_attribute("title", &format!("Click to {undo} — deletes the record from your repo"));
}

/// The subscriber count, fetched after the page is already readable.
fn subscriber_count() {
    let Some(_) = dom::q(".btn.subscribe") else { return };
    wasm_bindgen_futures::spawn_local(async {
        let Ok(resp) = fetch_json("/api/subscribers").await else { return };
        let n = resp.get("subscribers").and_then(|n| n.as_u64());
        if let Some(el) = dom::q(".actions") {
            let label = match n {
                Some(n) => format!("{n} subscriber{}", if n == 1 { "" } else { "s" }),
                // A count we could not fetch is not zero.
                None => "subscriber count unavailable".to_string(),
            };
            let p = dom::document().create_element("p").unwrap();
            let _ = p.set_attribute("class", "fine subs");
            p.set_text_content(Some(&label));
            let _ = el.append_child(&p);
        }
    });
}

async fn fetch_json(url: &str) -> Result<serde_json::Value, JsValue> {
    let promise = dom::window().fetch_with_str(url);
    let resp = wasm_bindgen_futures::JsFuture::from(promise).await?;
    let resp: web_sys::Response = resp.dyn_into()?;
    let json = wasm_bindgen_futures::JsFuture::from(resp.json()?).await?;
    serde_wasm_bindgen::from_value(json).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Ask for a handle and start OAuth.
///
/// Was a `window.prompt`. It is now the same typeahead dialog the header opens —
/// `fluoddity/handle-dialog.js` exists because a bare prompt is not a sign-in
/// experience, and this site had shipped the bare prompt regardless.
pub(crate) async fn prompt_login(_c: &AuthClient) {
    crate::signin::open();
}

fn fail(el: &web_sys::Element, msg: &str) {
    dom::log(&format!("rant: {msg}"));
    dom::remove_class(el, "done");
    let _ = el.set_attribute("title", msg);
}

pub(crate) fn err_text(e: JsValue) -> String {
    e.as_string()
        .or_else(|| js_sys::Reflect::get(&e, &JsValue::from_str("message")).ok().and_then(|m| m.as_string()))
        .unwrap_or_else(|| format!("{e:?}"))
}

pub(crate) fn to_js<T: serde::Serialize>(v: &T) -> Result<JsValue, String> {
    // `json_compatible` matters: the default serializer emits ES `Map`s for
    // structs, and the PDS proxy JSON-stringifies whatever it is handed.
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).map_err(|e| e.to_string())
}

pub(crate) fn now_iso() -> String {
    js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default()
}
