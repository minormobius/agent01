//! Binding to the shared OAuth client.
//!
//! **This module deliberately contains no OAuth.** `packages/oauth-client/auth.js`
//! is the repo's single implementation of PKCE + DPoP + PAR against
//! `auth.mino.mobi`, and the standing rule is that a new site imports it rather
//! than growing its own. Reimplementing it in Rust would be a second thing to
//! keep correct, and the second one is always the one that rots.
//!
//! So: `#[wasm_bindgen(module = …)]` declares the shared client's surface, and
//! every call from here goes through it. Tokens never enter this crate; the
//! `AuthClient` holds them and proxies PDS writes through the auth worker, so
//! the browser never sees a PDS credential either.

use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "/../../../packages/oauth-client/auth.js")]
extern "C" {
    #[wasm_bindgen(js_name = AuthClient)]
    pub type AuthClient;

    #[wasm_bindgen(constructor, js_class = "AuthClient")]
    pub fn new() -> AuthClient;

    #[wasm_bindgen(method, catch)]
    pub async fn init(this: &AuthClient) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, js_name = getUser)]
    pub fn get_user(this: &AuthClient) -> JsValue;

    #[wasm_bindgen(method, js_name = isLoggedIn)]
    pub fn is_logged_in(this: &AuthClient) -> bool;

    #[wasm_bindgen(method, js_name = hasScope)]
    pub fn has_scope(this: &AuthClient, required: &JsValue) -> bool;

    #[wasm_bindgen(method, catch)]
    pub async fn login(this: &AuthClient, handle: &str, opts: &JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = ensureScope)]
    pub async fn ensure_scope(this: &AuthClient, required: &JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch)]
    pub async fn logout(this: &AuthClient) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, getter)]
    pub fn pds(this: &AuthClient) -> PdsProxy;

    /// The proxy that forwards repo writes through `auth.mino.mobi/pds/*`, so
    /// the page never holds a PDS token.
    pub type PdsProxy;

    #[wasm_bindgen(method, catch, js_name = createRecord)]
    pub async fn create_record(this: &PdsProxy, collection: &str, record: &JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = putRecord)]
    pub async fn put_record(this: &PdsProxy, collection: &str, rkey: &str, record: &JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = deleteRecord)]
    pub async fn delete_record(this: &PdsProxy, collection: &str, rkey: &str) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = listRecords)]
    pub async fn list_records(this: &PdsProxy, collection: &str, limit: u32) -> Result<JsValue, JsValue>;
}

/// The signed-in user, as much of it as this crate needs.
pub struct User {
    pub did: String,
    pub handle: String,
}

pub fn user(auth: &AuthClient) -> Option<User> {
    let v = auth.get_user();
    if v.is_null() || v.is_undefined() {
        return None;
    }
    let get = |k: &str| js_sys::Reflect::get(&v, &JsValue::from_str(k)).ok()?.as_string();
    Some(User { did: get("did")?, handle: get("handle").unwrap_or_default() })
}

/// The narrow scope this site asks for — exactly the four collections it
/// writes, computed from `rant_core::standard::WRITE_COLLECTIONS` so the
/// consent screen can never drift from the code.
pub fn scope() -> String {
    rant_core::standard::scope_string()
}

/// Login options: `{ scope }`. Passing the narrow scope is the whole point;
/// omitting it falls back to the broad legacy union.
pub fn login_opts() -> JsValue {
    let o = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&o, &JsValue::from_str("scope"), &JsValue::from_str(&scope()));
    o.into()
}

/// Make sure we hold write access to one collection before writing to it.
///
/// Scope is fixed at authorization time, so a session minted by a sibling site
/// (identity SSO is instant across `*.mino.mobi`) will not carry our write
/// scope. `ensureScope` re-consents for the union of held and needed, which is
/// why this must be called from a user gesture — a popup blocker will eat it
/// otherwise.
pub async fn ensure_write(auth: &AuthClient, collection: &str) -> Result<(), JsValue> {
    let needed = js_sys::Array::of1(&JsValue::from_str(&format!("repo:{collection}")));
    let needed: JsValue = needed.into();
    if auth.has_scope(&needed) {
        return Ok(());
    }
    auth.ensure_scope(&needed).await.map(|_| ())
}
