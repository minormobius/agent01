//! Reading other people's repos.
//!
//! Everything here is unauthenticated: `com.atproto.repo.listRecords` and
//! `getRecord` are public XRPC methods, so rendering somebody's publication
//! needs no session and no permission. That is the property that makes
//! `/read/<handle>/` possible at all — a shared lexicon is only shared if the
//! reader is not coupled to the publisher.
//!
//! *Writes* never come through here. A document is written by the author's own
//! browser, through `auth.mino.mobi`, with the author's OAuth grant. The worker
//! holds no credentials of any kind.

use rant_core::standard::{AtUri, Document, Publication, NSID_DOCUMENT, NSID_PUBLICATION};
use worker::{Fetch, Method, Request, RequestInit, Result};

/// Resolve a handle or DID to a DID, and that DID to its PDS endpoint.
///
/// Handles resolve through the public AppView (which does the DNS/well-known
/// dance for us); DIDs resolve through the PLC directory or, for `did:web`, the
/// domain itself.
pub struct Actor {
    pub did: String,
    pub pds: String,
}

pub async fn resolve(actor: &str, appview: &str) -> Result<Actor> {
    let did = if actor.starts_with("did:") {
        actor.to_string()
    } else {
        let url = format!("{appview}/xrpc/com.atproto.identity.resolveHandle?handle={}", enc(actor));
        let v = get_json(&url).await?;
        v.get("did")
            .and_then(|d| d.as_str())
            .ok_or_else(|| worker::Error::RustError(format!("cannot resolve handle {actor}")))?
            .to_string()
    };

    let doc = if let Some(host) = did.strip_prefix("did:web:") {
        // did:web:example.com → https://example.com/.well-known/did.json
        get_json(&format!("https://{}/.well-known/did.json", host.replace("%3A", ":"))).await?
    } else {
        get_json(&format!("https://plc.directory/{}", enc(&did))).await?
    };

    let pds = doc
        .get("service")
        .and_then(|s| s.as_array())
        .and_then(|arr| {
            arr.iter().find(|s| {
                s.get("id").and_then(|i| i.as_str()).is_some_and(|i| i.ends_with("#atproto_pds"))
            })
        })
        .and_then(|s| s.get("serviceEndpoint"))
        .and_then(|e| e.as_str())
        .ok_or_else(|| worker::Error::RustError(format!("no PDS in the DID document for {did}")))?
        .trim_end_matches('/')
        .to_string();

    Ok(Actor { did, pds })
}

/// The actor's `site.standard.publication`, if they have one.
///
/// Convention is `rkey = self`, but nothing in the lexicon requires it, so fall
/// back to listing the collection and taking the first.
pub async fn publication(a: &Actor, rkey: Option<&str>) -> Result<Option<(String, Publication)>> {
    if let Some(rk) = rkey {
        let url = format!(
            "{}/xrpc/com.atproto.repo.getRecord?repo={}&collection={NSID_PUBLICATION}&rkey={}",
            a.pds,
            enc(&a.did),
            enc(rk)
        );
        if let Ok(v) = get_json(&url).await {
            if let Some(p) = decode::<Publication>(&v) {
                return Ok(Some((uri(&a.did, NSID_PUBLICATION, rk), p)));
            }
        }
        return Ok(None);
    }

    let url = format!(
        "{}/xrpc/com.atproto.repo.listRecords?repo={}&collection={NSID_PUBLICATION}&limit=5",
        a.pds,
        enc(&a.did)
    );
    let v = get_json(&url).await?;
    let Some(records) = v.get("records").and_then(|r| r.as_array()) else {
        return Ok(None);
    };
    for r in records {
        if let Some(p) = decode::<Publication>(r) {
            let u = r.get("uri").and_then(|u| u.as_str()).unwrap_or_default().to_string();
            return Ok(Some((u, p)));
        }
    }
    Ok(None)
}

/// The house publication: the record in `did`'s repo whose `url` is this site.
///
/// This exists so that linking the house publication is **one button press and
/// nothing else**. The alternative — and what this replaced — was printing an
/// `at://` URI on `/setup/` for a human to paste into `wrangler.jsonc` and push,
/// which is a deploy standing between a button and its effect, and which nobody
/// could be blamed for not understanding was required.
///
/// Matching on `url` rather than taking the first record is what makes it safe
/// to look in a *person's* repo: the operator of this site may well publish
/// elsewhere through the same lexicon (the author of this code does — a Leaflet
/// publication sits in the same collection), and that publication is not this
/// one. Its `url` says so.
///
/// Setting `PUBLICATION_URI` explicitly skips this lookup entirely.
pub async fn publication_for_site(did: &str, site_url: &str, appview: &str) -> Option<String> {
    let a = resolve(did, appview).await.ok()?;
    let url = format!(
        "{}/xrpc/com.atproto.repo.listRecords?repo={}&collection={NSID_PUBLICATION}&limit=50",
        a.pds,
        enc(&a.did)
    );
    let v = get_json_cached(&url, PUBLICATION_TTL).await.ok()?;
    let want = site_url.trim_end_matches('/');
    v.get("records")?.as_array()?.iter().find_map(|r| {
        let p: Publication = decode(r)?;
        (p.url.trim_end_matches('/') == want).then(|| r.get("uri")?.as_str().map(String::from))?
    })
}

/// How long the house-publication lookup is cached at the edge. Long, because
/// the answer changes roughly never — a publication record is written once —
/// and this sits on the HTML render path.
const PUBLICATION_TTL: i32 = 3600;

/// The actor's documents, newest first, optionally filtered to one publication.
pub async fn documents(a: &Actor, limit: u32, site: Option<&str>) -> Result<Vec<(String, Document)>> {
    let url = format!(
        "{}/xrpc/com.atproto.repo.listRecords?repo={}&collection={NSID_DOCUMENT}&limit={}",
        a.pds,
        enc(&a.did),
        limit.clamp(1, 100)
    );
    let v = get_json(&url).await?;
    let mut out: Vec<(String, Document)> = v
        .get("records")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|r| {
                    let d: Document = decode(r)?;
                    if let Some(s) = site {
                        if d.site != s {
                            return None;
                        }
                    }
                    Some((r.get("uri")?.as_str()?.to_string(), d))
                })
                .collect()
        })
        .unwrap_or_default();

    out.sort_by(|a, b| b.1.published_at.cmp(&a.1.published_at));
    Ok(out)
}

/// One document by AT-URI.
pub async fn document(uri: &AtUri, appview: &str) -> Result<Document> {
    let a = resolve(&uri.authority, appview).await?;
    let url = format!(
        "{}/xrpc/com.atproto.repo.getRecord?repo={}&collection={}&rkey={}",
        a.pds,
        enc(&uri.authority),
        enc(&uri.collection),
        enc(&uri.rkey)
    );
    let v = get_json(&url).await?;
    decode(&v).ok_or_else(|| worker::Error::RustError("record is not a site.standard.document".into()))
}

/// How many `site.standard.graph.subscription` records point at a publication.
///
/// There is no index for this — the records are scattered across every
/// subscriber's own repo, which is the price of not holding a subscriber list.
/// Constellation is a public backlink index over the firehose that will answer
/// it; if it is unavailable we return `None` and the page says "—" rather than
/// inventing a zero.
pub async fn subscriber_count(publication_uri: &str) -> Option<u64> {
    let url = format!(
        "https://constellation.microcosm.blue/links/count?target={}&collection=site.standard.graph.subscription&path=.publication",
        enc(publication_uri)
    );
    let v = get_json(&url).await.ok()?;
    v.get("total").and_then(|t| t.as_u64()).or_else(|| v.as_u64())
}

// ────────────────────────────────────────────────────────────────── helpers ──

/// A record envelope from `getRecord`/`listRecords` wraps the record in
/// `.value`; a bare record does not. Accept both.
fn decode<T: serde::de::DeserializeOwned>(v: &serde_json::Value) -> Option<T> {
    let body = v.get("value").unwrap_or(v);
    serde_json::from_value(body.clone()).ok()
}

fn uri(did: &str, collection: &str, rkey: &str) -> String {
    format!("at://{did}/{collection}/{rkey}")
}

/// Percent-encode a query-string value.
///
/// Handles and DIDs contain `:` and `.`, and a `did:web` can contain `%3A`
/// already; encoding conservatively is cheaper than reasoning about which.
pub fn enc(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Public wrapper for callers outside this module (the typeahead proxy).
/// Unauthenticated, like everything else here.
pub async fn get_json_public(url: &str) -> Result<serde_json::Value> {
    get_json(url).await
}

async fn get_json(url: &str) -> Result<serde_json::Value> {
    fetch_json(url, None).await
}

/// As `get_json`, but held in Cloudflare's edge cache for `ttl` seconds.
///
/// `cache_everything` is required: without it the `cache_ttl` is ignored for a
/// response the origin did not mark cacheable, which a PDS XRPC response is not.
async fn get_json_cached(url: &str, ttl: i32) -> Result<serde_json::Value> {
    fetch_json(url, Some(ttl)).await
}

async fn fetch_json(url: &str, cache_ttl: Option<i32>) -> Result<serde_json::Value> {
    let mut init = RequestInit::new();
    init.with_method(Method::Get);
    if let Some(ttl) = cache_ttl {
        init.with_cf_properties(worker::CfProperties {
            cache_everything: Some(true),
            cache_ttl: Some(ttl),
            ..Default::default()
        });
    }
    let req = Request::new_with_init(url, &init)?;
    let mut resp = Fetch::Request(req).send().await?;
    if resp.status_code() >= 400 {
        return Err(worker::Error::RustError(format!("{} returned {}", url, resp.status_code())));
    }
    resp.json().await
}
