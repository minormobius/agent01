//! `/mine/` — your records, and the delete button for each of them.
//!
//! The site's whole claim is that your posts live in your repo rather than in a
//! database here. That claim is only half-true if the only thing this frontend
//! can do is *add* to your repo: "it's your data" and "you cannot remove it from
//! here" do not sit together. `rant/CLAUDE.md` already said unsubscribing was
//! deleting your own record; this is the page that makes that true.
//!
//! Everything is listed from *your* repo through the auth proxy and deleted the
//! same way. No server-side state is involved, which is why this page is a shell
//! rather than server-rendered — the worker has no idea who you are and no way
//! to find out.
//!
//! Delete is `com.atproto.repo.deleteRecord`, covered by the same `repo:<nsid>`
//! scope as the write. No extra consent, because there is nothing extra to
//! consent to: the grant was always "manage these four collections".

use crate::auth::{ensure_write, AuthClient};
use crate::dom;
use crate::records::err_text;
use rant_core::standard::{
    AtUri, NSID_DOCUMENT, NSID_PUBLICATION, NSID_RECOMMEND, NSID_SUBSCRIPTION,
};

/// The four collections, in the order they are useful to look at.
const SECTIONS: [(&str, &str, &str); 4] = [
    ("posts", NSID_DOCUMENT, "Documents you have published. Deleting one removes it from your repo and from every reader that indexed it."),
    ("publication", NSID_PUBLICATION, "Your publication record. Deleting it orphans your documents — they stay, but stop being a publication."),
    ("subscriptions", NSID_SUBSCRIPTION, "Publications you subscribe to. Deleting one IS unsubscribing; nobody else holds the list."),
    ("recommends", NSID_RECOMMEND, "Documents you have recommended."),
];

pub fn wire(_client: &AuthClient, signed_in: bool) {
    let Some(root) = dom::q("#mine") else { return };

    if !signed_in {
        root.set_inner_html(
            r#"<p class="lede">Sign in to see and manage the records in your own repo.</p>
<div class="compose-bar"><button class="btn" id="mine-signin" type="button">sign in</button></div>"#,
        );
        if let Some(b) = dom::q("#mine-signin") {
            dom::on_click(&b, || {
                wasm_bindgen_futures::spawn_local(async {
                    let c = AuthClient::new();
                    let _ = c.init().await;
                    crate::records::prompt_login(&c).await;
                });
            });
        }
        return;
    }

    wasm_bindgen_futures::spawn_local(async {
        let c = AuthClient::new();
        let _ = c.init().await;
        render_all(&c).await;
    });
}

async fn render_all(c: &AuthClient) {
    let Some(root) = dom::q("#mine") else { return };
    root.set_inner_html(r#"<p class="fine">Reading your repo…</p>"#);

    let handle = crate::auth::user(c).map(|u| u.handle).unwrap_or_default();
    let mut html = String::new();

    for (label, nsid, blurb) in SECTIONS {
        let rows = list(c, nsid).await;
        html.push_str(&format!(
            r#"<section class="mine-section"><h2>{label} <span class="count">{}</span></h2><p class="fine">{blurb}</p>"#,
            rows.len(),
        ));
        if rows.is_empty() {
            html.push_str(r#"<p class="empty">None.</p>"#);
        } else {
            html.push_str(r#"<ul class="mine-list">"#);
            for r in &rows {
                html.push_str(&row_html(&r.rkey, nsid, &r.title, &r.sub, &handle));
            }
            html.push_str("</ul>");
        }
        html.push_str("</section>");
    }

    html.push_str(
        r#"<p class="fine">Every delete here is <code>com.atproto.repo.deleteRecord</code> against your own
repo, under the scope you already granted. Nothing is kept on this server, so there is nothing here
left to delete afterwards.</p>"#,
    );
    root.set_inner_html(&html);
    wire_delete_buttons();
}

struct Row {
    rkey: String,
    title: String,
    sub: String,
}

/// List one collection out of the signed-in user's repo.
async fn list(c: &AuthClient, nsid: &str) -> Vec<Row> {
    let Ok(v) = c.pds().list_records(nsid, 100).await else { return Vec::new() };
    let Ok(v) = serde_wasm_bindgen::from_value::<serde_json::Value>(v) else { return Vec::new() };
    let Some(records) = v.get("records").and_then(|r| r.as_array()) else { return Vec::new() };

    records
        .iter()
        .filter_map(|r| {
            let uri = r.get("uri")?.as_str()?;
            let rkey = AtUri::parse(uri).map(|u| u.rkey)?;
            let val = r.get("value")?;
            let s = |k: &str| val.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();

            // Each collection has a different natural label. A record we cannot
            // label still gets a row — you must be able to delete a malformed
            // record, and that is precisely when you most want to.
            let (title, sub) = match nsid {
                NSID_DOCUMENT => (
                    if s("title").is_empty() { "(untitled)".into() } else { s("title") },
                    format!("{} · {}", s("publishedAt").chars().take(10).collect::<String>(), s("path")),
                ),
                NSID_PUBLICATION => (if s("name").is_empty() { "(unnamed)".into() } else { s("name") }, s("url")),
                NSID_SUBSCRIPTION => (s("publication"), s("createdAt").chars().take(10).collect()),
                NSID_RECOMMEND => (s("document"), s("createdAt").chars().take(10).collect()),
                _ => (rkey.clone(), String::new()),
            };
            Some(Row { rkey, title, sub })
        })
        .collect()
}

fn row_html(rkey: &str, nsid: &str, title: &str, sub: &str, handle: &str) -> String {
    // A document gets a link to where it reads on this site; a subscription or
    // recommend gets a link to the thing it points at.
    let view = match nsid {
        NSID_DOCUMENT if !handle.is_empty() => format!(
            r#"<a class="mine-view" href="/read/{}/{}/">read</a>"#,
            crate::html_escape(handle),
            crate::html_escape(rkey)
        ),
        NSID_SUBSCRIPTION | NSID_RECOMMEND if title.starts_with("at://") => {
            format!(r#"<a class="mine-view" href="https://pdsls.dev/{}">target</a>"#, crate::html_escape(title))
        }
        _ => String::new(),
    };
    format!(
        r#"<li data-rkey="{rkey}" data-nsid="{nsid}">
<div class="mine-main"><span class="mine-title">{title}</span><span class="fine">{sub}</span></div>
<div class="mine-actions">{view}<button class="btn ghost mine-del" type="button">delete</button></div>
</li>"#,
        rkey = crate::html_escape(rkey),
        nsid = crate::html_escape(nsid),
        title = crate::html_escape(title),
        sub = crate::html_escape(sub),
        view = view,
    )
}

fn wire_delete_buttons() {
    for btn in dom::qa(".mine-del") {
        let b = btn.clone();
        dom::on_click(&btn, move || {
            let b = b.clone();
            wasm_bindgen_futures::spawn_local(async move {
                delete_row(&b).await;
            });
        });
    }
}

async fn delete_row(btn: &web_sys::Element) {
    // The row carries the identity, so a re-render cannot mismatch a button
    // against a record.
    let Some(li) = btn.closest("li").ok().flatten() else { return };
    let Some(rkey) = dom::attr(&li, "data-rkey") else { return };
    let Some(nsid) = dom::attr(&li, "data-nsid") else { return };

    let label = dom::q(".mine-title")
        .and_then(|_| li.query_selector(".mine-title").ok().flatten())
        .and_then(|e| e.text_content())
        .unwrap_or_else(|| rkey.clone());

    // Deletion is not reversible: an ATProto record delete is a real commit, and
    // nothing here keeps a copy. Ask.
    let ok = dom::window()
        .confirm_with_message(&format!("Delete “{label}” from your repo?\n\nThis cannot be undone."))
        .unwrap_or(false);
    if !ok {
        return;
    }

    let c = AuthClient::new();
    let _ = c.init().await;
    dom::set_disabled(btn, true);
    btn.set_text_content(Some("…"));

    if let Err(e) = ensure_write(&c, &nsid).await {
        dom::set_disabled(btn, false);
        btn.set_text_content(Some("delete"));
        let _ = btn.set_attribute("title", &format!("not granted: {}", err_text(e)));
        return;
    }

    match c.pds().delete_record(&nsid, &rkey).await {
        Ok(_) => {
            dom::add_class(&li, "deleted");
            btn.set_text_content(Some("deleted"));
            // Leave the row visible-but-struck rather than removing it, so you
            // can see what you just did before reloading.
            let _ = li.set_attribute("aria-hidden", "false");
        }
        Err(e) => {
            dom::set_disabled(btn, false);
            btn.set_text_content(Some("delete"));
            let _ = btn.set_attribute("title", &err_text(e));
        }
    }
}

/// Whether the signed-in user holds a record in `collection` whose `field`
/// equals `target`, and its rkey if so — which is what makes un-subscribing and
/// un-recommending possible rather than just detectable.
pub async fn find_record(
    c: &AuthClient,
    collection: &str,
    field: &str,
    target: &str,
) -> Option<String> {
    let v = c.pds().list_records(collection, 100).await.ok()?;
    let v: serde_json::Value = serde_wasm_bindgen::from_value(v).ok()?;
    v.get("records")?.as_array()?.iter().find_map(|r| {
        if r.pointer(&format!("/value/{field}"))?.as_str()? == target {
            AtUri::parse(r.get("uri")?.as_str()?).map(|u| u.rkey)
        } else {
            None
        }
    })
}
