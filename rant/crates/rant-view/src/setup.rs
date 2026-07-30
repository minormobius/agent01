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
//! ## One repo, several publications
//!
//! A person can have more than one blog, and through a shared lexicon they all
//! live in the same collection. The first repo this was ever pointed at proves
//! it: it holds a Leaflet publication (`momo.leaflet.pub`) *and* wants one for
//! this site.
//!
//! So **the record is keyed by its `url`, not by the fact that it exists.**
//! Writing looks for a publication whose `url` is the target being written and
//! updates that one; if there is none, it creates a new record with a fresh
//! rkey. It never touches a record pointing somewhere else.
//!
//! The first version got this wrong in the most damaging way available: it took
//! the *first* record in the collection, offered "replace my publication
//! record", and would have overwritten a working Leaflet blog with this site's
//! details had the confirm been accepted. Reading before writing is not enough
//! if you then write over the thing you read.

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
        let _ = btn.set_attribute("data-signin", "");
        return; // signin::wire_triggers() picks it up
    }

    // Signed in: find out what they already have before offering anything.
    wasm_bindgen_futures::spawn_local(async {
        let c = AuthClient::new();
        let _ = c.init().await;
        let existing = publications(&c).await;
        present(&c, existing);
    });
}

struct Existing {
    rkey: String,
    url: String,
    name: String,
}

/// Every publication record in the signed-in user's repo.
///
/// All of them, not the first: which one matters depends entirely on the `url`
/// being written, and that is not known until the button is pressed.
async fn publications(c: &AuthClient) -> Vec<Existing> {
    let Ok(v) = c.pds().list_records(NSID_PUBLICATION, 50).await else { return Vec::new() };
    let Ok(v) = serde_wasm_bindgen::from_value::<serde_json::Value>(v) else { return Vec::new() };
    let Some(records) = v.get("records").and_then(|r| r.as_array()) else { return Vec::new() };
    records
        .iter()
        .filter_map(|r| {
            let rkey = AtUri::parse(r.get("uri")?.as_str()?).map(|u| u.rkey)?;
            let val = r.get("value")?;
            Some(Existing {
                rkey,
                url: val.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                name: val.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            })
        })
        .collect()
}

/// Two URLs naming the same publication.
fn same_url(a: &str, b: &str) -> bool {
    a.trim_end_matches('/') == b.trim_end_matches('/')
}

/// Render the button and the surrounding explanation for the state we are in.
fn present(c: &AuthClient, existing: Vec<Existing>) {
    let Some(btn) = dom::q("#claim") else { return };
    let user = crate::auth::user(c);
    let handle = user.as_ref().map(|u| u.handle.clone()).unwrap_or_default();
    let did = user.as_ref().map(|u| u.did.clone()).unwrap_or_default();
    let site = dom::attr(&btn, "data-url").unwrap_or_default();
    let domain_taken = !dom::q("#acct")
        .and_then(|e| dom::attr(&e, "data-pub"))
        .unwrap_or_default()
        .is_empty();

    // Your own reading space on this site. This is where your documents resolve,
    // so it is the honest `url` for a publication published through here.
    let own = format!("{}/read/{}", site.trim_end_matches('/'), handle);

    // Whoever the site is configured to look in *is* the operator, so default
    // them to the domain. Defaulting the operator to their reading space is how
    // this page managed to be pressed without linking the domain: the record
    // written had `url = …/read/<handle>`, which is not SITE_URL, so nothing
    // resolved and the page still said no publication was linked.
    let operator = !did.is_empty() && dom::q("#claim").and_then(|b| dom::attr(&b, "data-site-did")) == Some(did);
    let domain_default = operator && !domain_taken;

    let mut choices = String::from(r#"<fieldset class="setup-target"><legend>This publication is for</legend>"#);
    if !domain_taken {
        choices.push_str(&format!(
            r#"<label><input type="radio" name="target" value="{site}"{checked}>
the whole site — <code>{site}</code>{note}</label>"#,
            site = crate::html_escape(&site),
            checked = if domain_default { " checked" } else { "" },
            note = if operator {
                r#" <span class="fine">(this is the one that lights up the link card)</span>"#
            } else {
                r#" <span class="fine">(only if you run it)</span>"#
            },
        ));
    }
    choices.push_str(&format!(
        r#"<label><input type="radio" name="target" value="{own}"{checked}>
your space — <code>{own}</code></label>"#,
        own = crate::html_escape(&own),
        checked = if domain_default { "" } else { " checked" },
    ));
    choices.push_str("</fieldset>");

    // What is already in the repo, stated as fact rather than as a threat. None
    // of it is at risk: writing matches on `url` and only ever updates the
    // record for the URL being written.
    if existing.is_empty() {
        dom::set_text("#status", "This writes one record to your repo. Nothing is stored here.");
    } else {
        let list = existing
            .iter()
            .map(|e| {
                format!(
                    "{} → {}",
                    if e.name.is_empty() { "unnamed" } else { &e.name },
                    if e.url.is_empty() { "nothing" } else { &e.url }
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        dom::set_text(
            "#status",
            &format!(
                "You already publish: {list}. Those are left alone — writing only \
                 touches the record for the URL selected above."
            ),
        );
    }
    btn.set_text_content(Some("write the publication record"));

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
        crate::signin::open();
        return;
    }

    let site = dom::attr(btn, "data-url").unwrap_or_default();
    let name = dom::attr(btn, "data-name").unwrap_or_default();
    let desc = dom::attr(btn, "data-desc").unwrap_or_default();
    let accent = dom::attr(btn, "data-accent").unwrap_or_else(|| "#e4b363".into());
    let url = chosen_target(&site);

    // Which record — if any — already describes *this* URL. Re-read at press
    // time rather than trusting what was on screen: the target is chosen after
    // the page rendered, and the repo may have changed in another tab.
    let existing = publications(&c).await;
    let target = existing.iter().find(|e| same_url(&e.url, &url));

    // Updating the record for this URL is deliberate but unremarkable. Nothing
    // else in the collection is a candidate, so nothing else can be lost.
    if let Some(e) = target {
        let ok = dom::window()
            .confirm_with_message(&format!(
                "Update your existing publication record for {url}?\n\nIt is currently named \"{}\".",
                if e.name.is_empty() { "unnamed" } else { &e.name }
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

    // Update the record for this URL, or create a brand new one. `create_record`
    // mints its own rkey, so a new publication can never land on top of an
    // existing one — which is exactly how the previous version would have
    // destroyed a Leaflet blog.
    let written = match target {
        Some(e) => c.pds().put_record(NSID_PUBLICATION, &e.rkey, &js).await,
        None => c.pds().create_record(NSID_PUBLICATION, &js).await,
    };

    match written {
        Ok(v) => {
            let uri = js_sys::Reflect::get(&v, &JsValue::from_str("uri"))
                .ok()
                .and_then(|u| u.as_string())
                .unwrap_or_default();
            dom::set_text("#status", "Written.");
            if let Some(out) = dom::q("#result") {
                let is_domain = same_url(&url, &site);
                // No paste, no redeploy: the worker resolves the record from
                // PUBLICATION_DID and matches it on `url`. It just has to be the
                // domain that was written — a publication for /read/<handle> is
                // a perfectly good blog but it is not this site.
                let operator_note = if is_domain {
                    r#"<h2>The domain is linked</h2>
<p class="fine">Reload any page — within a minute, the lookup being cached that long — and the
standard.site link tags, <code>/.well-known/site.standard.publication</code> and the subscribe
button all come live. Nothing to paste anywhere.</p>"#
                        .to_string()
                } else {
                    format!(
                        r#"<h2>This is your own publication, not the site's</h2>
<p class="fine">It points at <code>{url}</code>, so it does not link <code>{site}</code> itself —
<code>/.well-known/site.standard.publication</code> will still 404 and shared links will still get a
plain preview. That is the right choice unless you run this site; if you do, pick
<em>the whole site</em> above and press again.</p>"#,
                        url = crate::html_escape(&url),
                        site = crate::html_escape(&site),
                    )
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
