//! Per-deployment configuration, read from `wrangler.jsonc` `vars`.
//!
//! Everything here has a default that produces a *working* site, because a
//! worker that 500s on a missing variable is a worse failure than one that says
//! plainly what has not been set up yet. The one thing that genuinely cannot be
//! defaulted is the house publication's AT-URI — no DID, no records — and that
//! degrades to "the house publication is not linked to a repo yet" rather than
//! to an error page.

use worker::Env;

pub struct Config {
    /// Origin, no trailing slash. Every canonical URL is built from this.
    pub site_url: String,
    pub name: String,
    pub description: String,
    /// `at://did:plc:…/site.standard.publication/<rkey>` for the house
    /// publication, or empty if it has not been created yet.
    pub publication_uri: String,
    /// The DID that owns the house publication, served at
    /// `/.well-known/atproto-did`.
    pub did: String,
    /// The shared OAuth worker.
    pub auth_url: String,
    /// Public AppView, for resolving handles and reading other people's repos
    /// without a session.
    pub appview: String,
    pub accent: String,
}

fn var(env: &Env, key: &str, default: &str) -> String {
    env.var(key).map(|v| v.to_string()).unwrap_or_else(|_| default.to_string())
}

impl Config {
    pub fn load(env: &Env) -> Config {
        Config {
            site_url: var(env, "SITE_URL", "https://rant.mino.mobi").trim_end_matches('/').to_string(),
            name: var(env, "PUBLICATION_NAME", "Rant"),
            description: var(env, "PUBLICATION_DESCRIPTION", "A box to rant into. Posts live in your own repo."),
            publication_uri: var(env, "PUBLICATION_URI", "").trim().to_string(),
            did: var(env, "PUBLICATION_DID", "").trim().to_string(),
            auth_url: var(env, "AUTH_URL", "https://auth.mino.mobi").trim_end_matches('/').to_string(),
            appview: var(env, "APPVIEW_URL", "https://public.api.bsky.app").trim_end_matches('/').to_string(),
            accent: var(env, "ACCENT", "#e4b363"),
        }
    }

    /// The `site` value for documents in the house publication: the AT-URI when
    /// we have one, otherwise the site URL. The lexicon explicitly allows an
    /// `https://` publication URL for "loose" documents, so the fallback is
    /// spec-legal rather than a fudge.
    pub fn site_ref(&self) -> &str {
        if self.publication_uri.is_empty() {
            &self.site_url
        } else {
            &self.publication_uri
        }
    }

    pub fn url_for(&self, path: &str) -> String {
        format!("{}{}", self.site_url, path)
    }
}
