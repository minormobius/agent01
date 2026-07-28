//! The browser half of `rant.mino.mobi`, in Rust.
//!
//! Three jobs, and it is honest about the fact that only one of them is
//! load-bearing:
//!
//! 1. **The composer.** Type, preview, post. The preview calls the *same*
//!    `rant_core::render_body` the worker calls, compiled into this module, so
//!    what you see while typing is what the page will be — not a second
//!    renderer that agrees most of the time.
//! 2. **Subscribe and recommend.** Two buttons that each write one record to
//!    the reader's own repo through the shared OAuth client.
//! 3. **Managing your records** — `/setup/` writes the publication record, and
//!    `/mine/` lists everything in your repo with a delete button on each row.
//!    A frontend that can only add to your repo does not really hand you your
//!    data.
//! 4. **Playing the timed views.** RSVP and crawl arrive as server-rendered
//!    markup with `data-ms` on every frame; this turns that into a player. With
//!    this module absent, they stay a readable list of frames.
//!
//! Everything else on the site works with this file deleted.

mod auth;
mod compose;
mod dom;
mod mine;
mod player;
mod records;
mod setup;

use wasm_bindgen::prelude::*;

/// Entry point. `wasm-bindgen`'s `start` runs it on module load, so the page
//  only has to include the module.
#[wasm_bindgen(start)]
pub fn start() {
    // A panic in wasm is otherwise an opaque "unreachable executed".
    std::panic::set_hook(Box::new(|info| {
        dom::log(&format!("rant panicked: {info}"));
    }));

    wasm_bindgen_futures::spawn_local(async {
        let client = auth::AuthClient::new();
        // A failed init is a signed-out page, not a broken one.
        if client.init().await.is_err() {
            dom::log("rant: auth init failed; continuing signed out");
        }
        let signed_in = client.is_logged_in();

        records::wire(&client, signed_in);
        compose::wire(&client, signed_in);
        setup::wire(&client, signed_in);
        mine::wire(&client, signed_in);
        player::wire();
        header(&client, signed_in);
    });
}

/// Fill in the account corner.
fn header(client: &auth::AuthClient, signed_in: bool) {
    let Some(acct) = dom::q("#acct") else { return };
    match (signed_in, auth::user(client)) {
        (true, Some(u)) => {
            acct.set_inner_html(&format!(
                r#"<a class="btn ghost" href="/compose/">write</a><span class="who">@{}</span><button class="btn ghost" id="signout" type="button">sign out</button>"#,
                html_escape(&u.handle)
            ));
            if let Some(b) = dom::q("#signout") {
                let c = auth::AuthClient::new();
                dom::on_click(&b, move || {
                    let c2 = auth::AuthClient::new();
                    let _ = &c;
                    wasm_bindgen_futures::spawn_local(async move {
                        let _ = c2.logout().await;
                        let _ = dom::window().location().reload();
                    });
                });
            }
        }
        _ => {
            acct.set_inner_html(r#"<a class="btn" href="/compose/">sign in &amp; write</a>"#);
        }
    }
}

/// Escape for insertion into markup we build here.
///
/// Everything user-shaped that reaches `set_inner_html` in this crate goes
/// through this; the alternative is `create_element` plus `set_text_content`
/// everywhere, which is safer still but turns every three-line template into
/// twenty.
pub(crate) fn html_escape(s: &str) -> String {
    rant_core::slug::esc(s)
}
