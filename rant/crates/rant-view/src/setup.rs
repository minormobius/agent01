//! `/setup/` — create or update a `site.standard.publication` in **your** repo.
//!
//! Generic on purpose. Anybody who signs in can publish through this shell, so
//! anybody needs a publication record; there is nothing owner-only about it.
//! What differs is the record's `url`:
//!
//! - **your space** — `https://rant.mino.mobi/read/<handle>`, where your
//!   documents are actually read. Correct for anybody, and the default.
//! - **the whole domain** — `https://rant.mino.mobi`. Only meaningful for
//!   whoever runs the site, and only offered while the domain has no publication
//!   linked yet.
//!
//! ## Why this reads before it writes
//!
//! A repo holds at most one record per rkey, and `self` is the convention for a
//! singleton. So a naive `putRecord(…, "self", …)` would **silently overwrite**
//! the publication record of somebody who already blogs elsewhere through the
//! same lexicon — which is exactly the person most likely to press a button on a
//! standard.site site. So: list first, show what is there, and make an overwrite
//! an explicit second click rather than a surprise.

use wasm_bindgen::prelude::*;

use crate::auth::{ensure_write, AuthClient};
use crate::dom;
use crate::records::{err_text, to_js};
use rant_core::standard::{publication_for, AtUri, NSID_PUBLICATION};

pub fn wire(_client: &AuthClient, signed_in: bool) {
    let Some(btn) = dom::q("#claim") else { return };

    if !signed_in {
        dom::set_disabled(&btn, false);
        btn.set_text_content(Some("sign in, then set up"));
        let b = btn.clone();
        dom::on_click(&btn, move || {
            let _ = &b;
            wasm_bindgen_futures::spawn_local(async {
                let c = AuthClient::new();
                let _ = c.init().await;
                crate::records::prompt_login(&c).await;
            });
        });
        return;
    }

    // Signed in: find out what they already have before offering anything.
    wasm_bindgen_futures::spawn_local(async {
        let c = AuthClient::new();
        let _ = c.init().await;
        let existing = existing_publication(&c).await;
        present(&c, existing);
    });
}

struct Existing {
    rkey: String,
    url: String,
    name: String,
}

/// The signed-in user's own publication record, if they have one.
async fn existing_publication(c: &AuthClient) -> Option<Existing> {
    let v = c.pds().list_records(NSID_PUBLICATION, 20).await.ok()?;
    let v: serde_json::Value = serde_wasm_bindgen::from_value(v).ok()?;
    let r = v.get("records")?.as_array()?.first()?;
    let rkey = AtUri::parse(r.get("uri")?.as_str()?).map(|u| u.rkey)?;
    let val = r.get("value")?;
    Some(Existing {
        rkey,
        url: val.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        name: val.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
    })
}

/// Render the button and the surrounding explanation for the state we are in.
fn present(c: &AuthClient, existing: Option<Existing>) {
    let Some(btn) = dom::q("#claim") else { return };
    let handle = crate::auth::user(c).map(|u| u.handle).unwrap_or_default();
    let site = dom::attr(&btn, "data-url").unwrap_or_default();
    let domain_taken = !dom::q("#acct")
        .and_then(|e| dom::attr(&e, "data-pub"))
        .unwrap_or_default()
        .is_empty();

    // Your own reading space on this site. This is where your documents resolve,
    // so it is the honest `url` for a publication published through here.
    let own = format!("{}/read/{}", site.trim_end_matches('/'), handle);

    let mut choices = String::from(r#"<fieldset class="setup-target"><legend>This publication is for</legend>"#);
    choices.push_str(&format!(
        r#"<label><input type="radio" name="target" value="{own}" checked>
your space — <code>{own}</code></label>"#,
        own = crate::html_escape(&own)
    ));
    if !domain_taken {
        choices.push_str(&format!(
            r#"<label><input type="radio" name="target" value="{site}">
the whole site — <code>{site}</code> <span class="fine">(only if you run it)</span></label>"#,
            site = crate::html_escape(&site)
        ));
    }
    choices.push_str("</fieldset>");

    if let Some(e) = &existing {
        // Say plainly that pressing the button replaces what is already there.
        dom::set_text(
            "#status",
            &format!(
                "You already have a publication record ({}), pointing at {}. Writing will REPLACE it.",
                if e.name.is_empty() { "unnamed" } else { &e.name },
                if e.url.is_empty() { "nothing" } else { &e.url }
            ),
        );
        btn.set_text_content(Some("replace my publication record"));
        let _ = btn.set_attribute("data-rkey", &e.rkey);
        dom::add_class(&btn, "ghost");
    } else {
        dom::set_text("#status", "This writes one record to your repo. Nothing is stored here.");
        btn.set_text_content(Some("write the publication record"));
        let _ = btn.set_attribute("data-rkey", "self");
    }

    if let Some(box_) = dom::q(".setup-box") {
        let el = dom::document().create_element("div").unwrap();
        el.set_inner_html(&choices);
        // Insert the target choice above the button row.
        if let Some(bar) = box_.query_selector(".compose-bar").ok().flatten() {
            let _ = box_.insert_before(&el, Some(&bar));
        } else {
            let _ = box_.append_child(&el);
        }
    }

    dom::set_disabled(&btn, false);
    let b = btn.clone();
    dom::on_click(&btn, move || {
        let b = b.clone();
        wasm_bindgen_futures::spawn_local(async move {
            claim(&b).await;
        });
    });
}

fn chosen_target(fallback: &str) -> String {
    for el in dom::qa(".setup-target input") {
        if let Ok(input) = el.dyn_into::<web_sys::HtmlInputElement>() {
            if input.checked() {
                return input.value();
            }
        }
    }
    fallback.to_string()
}

async fn claim(btn: &web_sys::Element) {
    let c = AuthClient::new();
    let _ = c.init().await;
    if !c.is_logged_in() {
        crate::records::prompt_login(&c).await;
        return;
    }

    let site = dom::attr(btn, "data-url").unwrap_or_default();
    let name = dom::attr(btn, "data-name").unwrap_or_default();
    let desc = dom::attr(btn, "data-desc").unwrap_or_default();
    let accent = dom::attr(btn, "data-accent").unwrap_or_else(|| "#e4b363".into());
    let rkey = dom::attr(btn, "data-rkey").unwrap_or_else(|| "self".into());
    let url = chosen_target(&site);

    // Replacing an existing record is destructive; make it deliberate.
    if rkey != "self" || dom::q(".btn.ghost#claim").is_some() {
        let ok = dom::window()
            .confirm_with_message(&format!(
                "Replace your site.standard.publication record?\n\nIt will point at {url}.\nThe old values are not recoverable."
            ))
            .unwrap_or(false);
        if !ok {
            return;
        }
    }

    // The same constructor the worker used to render the preview on this page.
    let record = publication_for(&url, &name, &desc, &accent);
    let Ok(js) = to_js(&record) else {
        dom::set_text("#status", "Could not serialise the record.");
        return;
    };

    dom::set_disabled(btn, true);
    dom::set_text("#status", "Writing…");

    if let Err(e) = ensure_write(&c, NSID_PUBLICATION).await {
        dom::set_disabled(btn, false);
        dom::set_text("#status", &format!("Write access was not granted: {}", err_text(e)));
        return;
    }

    match c.pds().put_record(NSID_PUBLICATION, &rkey, &js).await {
        Ok(v) => {
            let uri = js_sys::Reflect::get(&v, &JsValue::from_str("uri"))
                .ok()
                .and_then(|u| u.as_string())
                .unwrap_or_default();
            let did = crate::auth::user(&c).map(|u| u.did).unwrap_or_default();
            dom::set_text("#status", "Written.");
            if let Some(out) = dom::q("#result") {
                let is_domain = url.trim_end_matches('/') == site.trim_end_matches('/');
                let operator_note = if is_domain {
                    format!(
                        r#"<h2>You chose the whole site — one manual step left</h2>
<pre class="record">"PUBLICATION_URI": "{uri}",
"PUBLICATION_DID": "{did}"</pre>
<p class="fine">Paste into <code>rant/wrangler.jsonc</code> → <code>vars</code> and push. A Worker cannot
rewrite its own configuration, which is why this part is yours.</p>"#,
                        uri = crate::html_escape(&uri),
                        did = crate::html_escape(&did),
                    )
                } else {
                    String::new()
                };
                out.set_inner_html(&format!(
                    r#"<p class="lede">Your publication record is live.</p>
<pre class="uri">{uri}</pre>
<p class="fine"><a href="/mine/">Manage or delete it</a> · <a href="https://pdsls.dev/{uri}">inspect the record</a>
· <a href="/compose/">write something</a></p>{operator_note}"#,
                    uri = crate::html_escape(&uri),
                    operator_note = operator_note,
                ));
            }
            btn.set_text_content(Some("written ✓"));
        }
        Err(e) => {
            dom::set_disabled(btn, false);
            dom::set_text("#status", &format!("The PDS refused it: {}", err_text(e)));
        }
    }
}
