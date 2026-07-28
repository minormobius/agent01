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
//! reader, so the button can say "subscribed" rather than lying.

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
            b.set_text_content(Some("…"));
            match write_subscription(&c, &publication).await {
                Ok(_) => {
                    b.set_text_content(Some("subscribed ✓"));
                    dom::add_class(&b, "done");
                    dom::set_disabled(&b, true);
                }
                Err(e) => {
                    b.set_text_content(Some("subscribe"));
                    fail(&b, &e);
                }
            }
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
            b.set_text_content(Some("…"));
            match write_recommend(&c, &document_uri).await {
                Ok(_) => {
                    b.set_text_content(Some("recommended ✓"));
                    dom::add_class(&b, "done");
                    dom::set_disabled(&b, true);
                }
                Err(e) => {
                    b.set_text_content(Some("recommend"));
                    fail(&b, &e);
                }
            }
        });
    });
}

async fn write_subscription(c: &AuthClient, publication: &str) -> Result<JsValue, String> {
    ensure_write(c, NSID_SUBSCRIPTION).await.map_err(err_text)?;
    let rec = Subscription::new(publication, &now_iso());
    let v = to_js(&rec)?;
    c.pds().create_record(NSID_SUBSCRIPTION, &v).await.map_err(err_text)
}

async fn write_recommend(c: &AuthClient, document_uri: &str) -> Result<JsValue, String> {
    ensure_write(c, NSID_RECOMMEND).await.map_err(err_text)?;
    let rec = Recommend::new(document_uri, &now_iso());
    let v = to_js(&rec)?;
    c.pds().create_record(NSID_RECOMMEND, &v).await.map_err(err_text)
}

/// If the reader already subscribed or recommended, say so instead of offering
/// to write a duplicate record.
async fn reflect_existing(c: &AuthClient) {
    if let Some(btn) = dom::q(".btn.subscribe") {
        if let Some(target) = dom::attr(&btn, "data-pub") {
            if has_record(c, NSID_SUBSCRIPTION, "publication", &target).await {
                btn.set_text_content(Some("subscribed ✓"));
                dom::add_class(&btn, "done");
                dom::set_disabled(&btn, true);
            }
        }
    }
    if let Some(btn) = dom::q(".btn.recommend") {
        if let Some(target) = dom::attr(&btn, "data-doc") {
            if has_record(c, NSID_RECOMMEND, "document", &target).await {
                btn.set_text_content(Some("recommended ✓"));
                dom::add_class(&btn, "done");
                dom::set_disabled(&btn, true);
            }
        }
    }
}

/// Does the reader's repo already hold a record in `collection` whose `field`
/// equals `target`?
///
/// Only the most recent 100 are checked. A reader with more than a hundred
/// subscriptions may be offered a duplicate — the PDS will happily store it,
/// and a duplicate subscription is harmless. Paging the whole collection on
/// every page load to prevent that is the wrong trade.
async fn has_record(c: &AuthClient, collection: &str, field: &str, target: &str) -> bool {
    let Ok(v) = c.pds().list_records(collection, 100).await else { return false };
    let Ok(v) = serde_wasm_bindgen::from_value::<serde_json::Value>(v) else { return false };
    v.get("records")
        .and_then(|r| r.as_array())
        .is_some_and(|arr| {
            arr.iter().any(|r| r.pointer(&format!("/value/{field}")).and_then(|x| x.as_str()) == Some(target))
        })
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

async fn prompt_login(c: &AuthClient) {
    let Ok(Some(handle)) = dom::window().prompt_with_message("Your Bluesky handle:") else { return };
    let handle = handle.trim().to_string();
    if handle.is_empty() {
        return;
    }
    if let Err(e) = c.login(&handle, &crate::auth::login_opts()).await {
        dom::log(&format!("rant: login failed: {}", err_text(e)));
    }
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
