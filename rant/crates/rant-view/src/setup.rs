//! `/setup/` — write the publication record.
//!
//! One button, pressed once, by whoever owns the domain. It `putRecord`s a
//! `site.standard.publication` at rkey `self`, which makes it idempotent: press
//! it again after changing the site's name or accent colour and the record is
//! updated rather than duplicated.
//!
//! The page then prints the resulting `at://` URI, because the last step cannot
//! be automated — a Worker cannot rewrite its own `vars`, so a human has to hand
//! the URI back to `wrangler.jsonc`. A setup flow that hid that would look
//! finished and not be.

use wasm_bindgen::prelude::*;

use crate::auth::{ensure_write, AuthClient};
use crate::dom;
use crate::records::{err_text, to_js};
use rant_core::standard::{publication_for, NSID_PUBLICATION};

pub fn wire(_client: &AuthClient, signed_in: bool) {
    let Some(btn) = dom::q("#claim") else { return };
    dom::set_disabled(&btn, false);
    btn.set_text_content(Some(if signed_in {
        "write the publication record"
    } else {
        "sign in, then write it"
    }));
    if signed_in {
        dom::set_text("#status", "This writes to your repo, at site.standard.publication/self.");
    }

    let b = btn.clone();
    dom::on_click(&btn, move || {
        let b = b.clone();
        wasm_bindgen_futures::spawn_local(async move {
            claim(&b).await;
        });
    });
}

async fn claim(btn: &web_sys::Element) {
    let c = AuthClient::new();
    let _ = c.init().await;

    if !c.is_logged_in() {
        let Ok(Some(handle)) = dom::window().prompt_with_message("Your Bluesky handle:") else { return };
        let handle = handle.trim().to_string();
        if handle.is_empty() {
            return;
        }
        if let Err(e) = c.login(&handle, &crate::auth::login_opts()).await {
            dom::set_text("#status", &format!("Sign-in failed: {}", err_text(e)));
        }
        return; // login redirects
    }

    // Everything the record needs is on the button, put there by the worker, so
    // the page and the record cannot disagree about this deployment's identity.
    let url = dom::attr(btn, "data-url").unwrap_or_default();
    let name = dom::attr(btn, "data-name").unwrap_or_default();
    let desc = dom::attr(btn, "data-desc").unwrap_or_default();
    let accent = dom::attr(btn, "data-accent").unwrap_or_else(|| "#e4b363".into());

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

    // `self` is the conventional rkey for a singleton record, and putRecord
    // makes pressing this twice an update rather than a second publication.
    match c.pds().put_record(NSID_PUBLICATION, "self", &js).await {
        Ok(v) => {
            let uri = js_sys::Reflect::get(&v, &JsValue::from_str("uri"))
                .ok()
                .and_then(|u| u.as_string())
                .unwrap_or_default();
            let did = crate::auth::user(&c).map(|u| u.did).unwrap_or_default();
            dom::set_text("#status", "Written.");
            if let Some(out) = dom::q("#result") {
                out.set_inner_html(&format!(
                    r#"<h2>Now paste these and push</h2>
<pre class="record">"PUBLICATION_URI": "{uri}",
"PUBLICATION_DID": "{did}"</pre>
<p class="fine">Into <code>rant/wrangler.jsonc</code> → <code>vars</code>. Until then this page is the
only thing that knows the record exists — <a href="https://pdsls.dev/{uri}">inspect it</a>.</p>"#,
                    uri = crate::html_escape(&uri),
                    did = crate::html_escape(&did),
                ));
            }
        }
        Err(e) => {
            dom::set_disabled(btn, false);
            dom::set_text("#status", &format!("The PDS refused it: {}", err_text(e)));
        }
    }
}
