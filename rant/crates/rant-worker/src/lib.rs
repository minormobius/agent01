//! `rant.mino.mobi` — the Worker.
//!
//! Rust compiled to WebAssembly, running at the edge. There is no hand-written
//! JavaScript in this crate: `worker-build` generates the module shim, and
//! everything from routing to HTML to PNG encoding happens in here.
//!
//! ## Routes
//!
//! | path | what |
//! |---|---|
//! | `/` | the house publication, newest first |
//! | `/<slug>/` | one post; `?view=<chain>` for a predicate view |
//! | `/archive/` | everything, optionally `?tag=` |
//! | `/read/<actor>/` | **anyone's** standard.site publication, through our views |
//! | `/read/<actor>/<rkey>/` | one of their documents |
//! | `/og/<slug>/card.png` `.svg` | the link card |
//! | `/feed.xml` `/feed.json` | syndication |
//! | `/llms.txt` `/llms-full.txt` | the agent index and the whole corpus |
//! | `/mine/` | your own records, with a delete button on each (a shell) |
//! | `/mcp` | JSON-RPC tools |
//! | `/api/*` | the engine as a service |
//! | `/.well-known/site.standard.publication` | standard.site verification |
//!
//! ## Caching
//!
//! House pages are rendered per request and not cached: the render is a quarter
//! of a millisecond, and a cache would only add an invalidation bug. PDS reads
//! *are* cached (60s), because those are network round trips and the firehose
//! is not going to notice the difference.

mod api;
mod card;
mod config;
mod page;
mod pds;
mod slugesc;

use rant_core::{
    agent, feeds, house,
    predicates::{parse_chain, Opts},
    standard::AtUri,
    Doc,
};
use serde_json::json;
use worker::*;

use config::Config;

const CACHE_PDS: &str = "public, max-age=60, stale-while-revalidate=600";
/// HTML pages. **`no-cache` means "store it, but revalidate before reuse"** —
/// not "do not store". Pages are rendered in ~240µs, so a stale window buys
/// nothing and costs correctness.
///
/// It used to be `max-age=300`, which flatly contradicted the design note at the
/// top of this file ("rendered per request and not cached") and cost real time:
/// after a deploy the edge kept serving the previous HTML for five minutes, so
/// the composer's new toolbar was missing from production long enough to fail
/// the browser gate and look like a code bug. A cache header that disagrees with
/// the documented design is worse than either choice made honestly.
const CACHE_PAGE: &str = "no-cache";
/// Machine output where a few minutes of staleness is harmless: feeds, the
/// predicate and template registries, the agent descriptor.
const CACHE_STATIC: &str = "public, max-age=300";
const CACHE_CARD: &str = "public, max-age=86400, stale-while-revalidate=604800";

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();

    let mut cfg = Config::load(&env);
    let url = req.url()?;
    let path = url.path().to_string();
    let q = Query::from(&url);

    // Normalise: every *content* path ends in a slash, so canonical URLs, the
    // `path` field on records, and the router all agree. Machine endpoints are
    // exempt — see `should_normalise`.
    if should_normalise(&path) {
        let mut to = url.clone();
        to.set_path(&format!("{path}/"));
        return Response::redirect_with_status(to, 308);
    }

    // The house publication, if it has not been pinned in `vars`. Doing this at
    // request time rather than at deploy time is what makes `/setup/` a single
    // button press: press it, and the site finds the record it just wrote. The
    // lookup is edge-cached for an hour and skipped for paths that never
    // mention a publication, so the common case costs nothing.
    if cfg.publication_uri.is_empty() && !cfg.did.is_empty() && needs_publication_uri(&path) {
        if let Some(uri) = pds::publication_for_site(&cfg.did, &cfg.site_url, &cfg.appview).await {
            cfg.publication_uri = uri;
        }
    }

    match route(&req, &env, &cfg, match_key(&path), &q).await {
        Ok(r) => Ok(r),
        Err(e) => {
            // A failed upstream (someone's PDS is down, a handle does not
            // resolve) is a 502 with the reason, not a blank 500.
            let msg = e.to_string();
            console_error!("rant: {path}: {msg}");
            if wants_json(&path) {
                return json_response(&json!({ "error": msg }), 502, CACHE_NONE);
            }
            html(page::error_page(&cfg, 502, &msg), 502, CACHE_NONE)
        }
    }
}

const CACHE_NONE: &str = "no-store";

/// The page policy. Every clause here is load-bearing and three of them were
/// learned by watching the site fail in a real browser:
///
/// - **`script-src 'wasm-unsafe-eval'`** — without it `default-src 'self'` forbids
///   `WebAssembly.instantiateStreaming`, so the browser module refuses to compile
///   and *nothing* client-side runs. `'wasm-unsafe-eval'` permits wasm without
///   permitting `eval()`, which is exactly the distinction wanted.
/// - **`img-src … cdn.bsky.app`** — avatars in the sign-in suggestions. The
///   suggestion *query* needs no exception because it is proxied through
///   `/api/typeahead`; only the avatar images are third-party, and they degrade to
///   a placeholder circle if blocked.
///
/// CSP failures are silent by design: a console warning and a dead feature. Any
/// change here wants a run of `.signin.test.mjs`, which drives a real browser and
/// fails on a violation.
const CSP: &str = "default-src 'self'; \
script-src 'self' 'wasm-unsafe-eval'; \
img-src 'self' data: https://cdn.bsky.app; \
style-src 'self' 'unsafe-inline'; \
connect-src 'self' https://auth.mino.mobi; \
base-uri 'none'; \
form-action 'self'";

async fn route(req: &Request, env: &Env, cfg: &Config, path: &str, q: &Query) -> Result<Response> {
    // `path` here is the match key from `match_key`, not the raw URL path.
    match path {
        "/" => home(cfg),
        "/archive/" => archive(cfg, q),
        "/compose/" => html(page::compose_page(cfg), 200, CACHE_PAGE),
        "/setup/" => html(page::setup_page(cfg), 200, CACHE_NONE),
        "/mine/" => html(page::mine_page(cfg), 200, CACHE_NONE),
        "/api/health" => json_response(
            &json!({ "ok": true, "service": "rant", "posts": house::count(), "version": env!("CARGO_PKG_VERSION") }),
            200,
            CACHE_NONE,
        ),
        "/api/predicates" => json_response(&api::predicates_json(), 200, CACHE_STATIC),
        "/api/templates" => json_response(&api::templates_json(), 200, CACHE_STATIC),
        "/api/subscribers" => subscribers(cfg).await,
        "/api/typeahead" => typeahead(cfg, q).await,
        "/api/posts" => json_response(&posts_json(cfg), 200, CACHE_STATIC),
        "/api/render" => api_render(req, cfg).await,
        "/mcp" => mcp(req, cfg).await,
        "/feed.xml" => feed_rss(cfg),
        "/feed.json" => feed_json(cfg),
        "/llms.txt" => llms(cfg, false),
        "/llms-full.txt" => llms(cfg, true),
        "/robots.txt" => robots(cfg),
        "/boot.js" => boot_js(),
        "/.well-known/site.standard.publication" => well_known_publication(cfg),
        "/.well-known/atproto-did" => well_known_did(cfg),
        "/.well-known/rant-agent" => json_response(&agent::descriptor(&cfg.site_url), 200, CACHE_STATIC),
        _ => {
            if let Some(rest) = path.strip_prefix("/og/") {
                return card(cfg, rest).await;
            }
            if let Some(rest) = path.strip_prefix("/read/") {
                return read_anyone(cfg, rest, q).await;
            }
            if let Some(rest) = path.strip_prefix("/api/post/") {
                return api_post(cfg, rest.trim_end_matches('/'), q);
            }
            // A bare `/<slug>/` is a house post. Anything else falls through to
            // the static assets (the stylesheet, the wasm module, the composer
            // shell), and only then to a 404.
            let slug = path.trim_matches('/');
            if let Some(doc) = house::get(slug) {
                return post(cfg, &doc, &format!("/{slug}/"), "", None, q);
            }
            assets_or_404(req, env, cfg).await
        }
    }
}

/// A machine endpoint: exempt from slash-normalisation, and matched with any
/// trailing slash trimmed so `/api/health` and `/api/health/` are the same route.
///
/// This exists because the first version normalised *everything*, which turned
/// `GET /api/health` into a 308 to `/api/health/` and then a 404 — a redirect
/// most HTTP clients follow silently, so the endpoint simply appeared to return
/// nothing. Content paths still normalise; a post has exactly one URL.
fn is_machine_path(path: &str) -> bool {
    path.starts_with("/api/")
        || path.starts_with("/.well-known/")
        || matches!(
            path.trim_end_matches('/'),
            "/mcp" | "/robots.txt" | "/feed.xml" | "/feed.json" | "/llms.txt" | "/llms-full.txt"
        )
}

/// Paths that should not be slash-normalised: anything with a file extension
/// (`/rant.css`, `/og/x/card.png`) and every machine endpoint.
fn is_file_path(path: &str) -> bool {
    path.rsplit('/').next().is_some_and(|last| last.contains('.'))
}

fn should_normalise(path: &str) -> bool {
    path.len() > 1 && !path.ends_with('/') && !is_file_path(path) && !is_machine_path(path)
}

/// Whether this path can reference the house publication, and so whether it is
/// worth resolving one for.
///
/// Stated as an exclusion rather than a list of pages on purpose: every HTML
/// page carries the `<link rel="site.standard.publication">` tags, so a new page
/// added later should inherit the lookup rather than quietly ship without it.
/// What is excluded is only what can never need it — static files (the
/// stylesheet, `/boot.js`, `/pkg/*`, the link cards) and the registries that are
/// pure functions of the compiled binary.
///
/// Note what this deliberately does *not* reuse: `is_file_path`, which calls
/// anything with a dot in its last segment a file and would therefore exclude
/// `/.well-known/site.standard.publication` — the one endpoint whose entire
/// response *is* the publication URI. That heuristic is right for
/// slash-normalisation and wrong here, so the exclusions are named.
fn needs_publication_uri(path: &str) -> bool {
    !(path.starts_with("/og/")
        || path.starts_with("/pkg/")
        || path.starts_with("/packages/")
        || matches!(path, "/rant.css" | "/boot.js" | "/favicon.ico" | "/robots.txt")
        || matches!(
            path.trim_end_matches('/'),
            "/api/health" | "/api/predicates" | "/api/templates" | "/api/typeahead"
        ))
}

/// The key `route` matches on: machine endpoints lose a trailing slash, content
/// paths are left exactly as they arrived.
fn match_key(path: &str) -> &str {
    if is_machine_path(path) && path.len() > 1 {
        let t = path.trim_end_matches('/');
        if t.is_empty() { path } else { t }
    } else {
        path
    }
}

fn wants_json(path: &str) -> bool {
    path.starts_with("/api/") || match_key(path) == "/mcp" || path.starts_with("/.well-known/rant-agent")
}

#[cfg(test)]
mod route_tests {
    use super::*;

    #[test]
    fn content_paths_normalise_to_a_trailing_slash() {
        for p in ["/hello", "/archive", "/read/alice", "/compose"] {
            assert!(should_normalise(p), "{p} should redirect to {p}/");
        }
        for p in ["/", "/hello/", "/archive/"] {
            assert!(!should_normalise(p), "{p} is already canonical");
        }
    }

    #[test]
    fn machine_endpoints_are_never_redirected() {
        // The regression: a 308 here made /api/health look like it returned
        // nothing, because clients follow the redirect and the slashed form 404s.
        for p in [
            "/api/health", "/api/posts", "/api/predicates", "/api/subscribers",
            "/api/post/hello", "/api/render", "/mcp", "/robots.txt",
            "/.well-known/site.standard.publication", "/.well-known/atproto-did",
            "/.well-known/rant-agent", "/llms.txt", "/llms-full.txt",
            "/feed.xml", "/feed.json",
        ] {
            assert!(!should_normalise(p), "{p} must not redirect");
        }
    }

    #[test]
    fn machine_endpoints_match_with_or_without_a_trailing_slash() {
        for p in ["/api/health", "/mcp", "/llms.txt", "/.well-known/atproto-did"] {
            assert_eq!(match_key(p), p);
            assert_eq!(match_key(&format!("{p}/")), p, "trailing slash must be tolerated");
        }
    }

    #[test]
    fn every_page_that_shows_a_publication_resolves_one() {
        // Pages carry <link rel="site.standard.publication">; the well-known
        // endpoint *is* the publication URI; subscribe needs something to point
        // at. Missing one of these is a silent omission, not an error, which is
        // why it is asserted rather than left to review.
        for p in [
            "/", "/hello/", "/archive/", "/compose/", "/setup/", "/mine/",
            "/read/alice.bsky.social/", "/read/alice.bsky.social/a-post/",
            "/.well-known/site.standard.publication", "/api/subscribers", "/api/posts",
        ] {
            assert!(needs_publication_uri(p), "{p} renders a publication reference");
        }
    }

    #[test]
    fn static_files_and_registries_skip_the_lookup() {
        // These are on the hot path and cannot mention a publication, so they
        // must not pay for a PDS round trip.
        for p in [
            "/rant.css", "/boot.js", "/pkg/rant_view.js", "/pkg/rant_view_bg.wasm",
            "/og/hello/card.png", "/og/hello/card.svg", "/favicon.ico",
            "/api/health", "/api/predicates", "/api/templates", "/api/typeahead",
        ] {
            assert!(!needs_publication_uri(p), "{p} must not trigger a PDS lookup");
        }
    }

    #[test]
    fn content_paths_keep_their_slash_in_the_match_key() {
        assert_eq!(match_key("/hello/"), "/hello/");
        assert_eq!(match_key("/"), "/");
    }

    #[test]
    fn the_wasm_bootstrap_is_routable() {
        // /boot.js is what instantiates the browser module. If it were
        // slash-normalised or rewritten it would 404 and the entire browser half
        // of the site would go dark again — which is exactly what happened when
        // the page pointed straight at the wasm-bindgen glue.
        assert!(!should_normalise("/boot.js"));
        assert_eq!(match_key("/boot.js"), "/boot.js");
        assert!(!wants_json("/boot.js"));
    }

    #[test]
    fn asset_paths_are_left_alone() {
        for p in ["/rant.css", "/pkg/rant_view.js", "/og/hello/card.png", "/packages/oauth-client/auth.js", "/boot.js"] {
            assert!(!should_normalise(p), "{p} is a file");
            assert_eq!(match_key(p), p);
        }
    }

    #[test]
    fn a_handle_with_dots_still_reaches_the_read_route() {
        // `/read/alice.bsky.social` looks like a file path, so it is not
        // redirected — the router strips the `/read/` prefix either way.
        let p = "/read/alice.bsky.social";
        assert!(!should_normalise(p));
        assert_eq!(match_key(p), p);
        assert!(p.strip_prefix("/read/").is_some());
    }
}

// ─────────────────────────────────────────────────────────────────── pages ──

fn home(cfg: &Config) -> Result<Response> {
    let docs = house::all();
    let items: Vec<page::Item> = docs.iter().map(|d| item(d)).collect();
    let intro = format!(
        r#"<h1>{}</h1><p class="lede">{}</p>
<p class="fine">Every post is a <a href="https://standard.site"><code>site.standard.document</code></a> record.
Append <code>?view=skeleton</code>, <code>?view=cadence</code>, <code>?view=reverse</code> — or any
<a href="/api/predicates">predicate</a> — to a post URL to read it differently.</p>"#,
        slugesc::esc(&cfg.name),
        slugesc::esc(&cfg.description),
    );
    html(page::index_page(cfg, Some(&intro), &items, &cfg.name.clone(), &cfg.description), 200, CACHE_PAGE)
}

fn archive(cfg: &Config, q: &Query) -> Result<Response> {
    let tag = q.get("tag");
    let docs = house::all();
    let items: Vec<page::Item> = docs
        .iter()
        .filter(|d| tag.as_deref().is_none_or(|t| d.tags.iter().any(|x| x == t)))
        .map(item)
        .collect();
    let title = match &tag {
        Some(t) => format!("#{t} — {}", cfg.name),
        None => format!("Archive — {}", cfg.name),
    };
    html(page::index_page(cfg, None, &items, &title, &cfg.description), 200, CACHE_PAGE)
}

fn item(d: &Doc<'_>) -> page::Item {
    page::Item {
        title: d.title.clone(),
        href: d.path(),
        published: d.published.clone(),
        description: d.description.clone().unwrap_or_default(),
        tags: d.tags.clone(),
        minutes: d.reading_minutes(),
    }
}

fn post(
    cfg: &Config,
    doc: &Doc<'_>,
    base_path: &str,
    at_uri: &str,
    byline: Option<&str>,
    q: &Query,
) -> Result<Response> {
    let chain = parse_chain(&q.get("view").unwrap_or_default());
    let o = q.opts();

    if q.get("format").as_deref() == Some("text") {
        let r = rant_core::render_body(doc.body, &chain, &o);
        return text_response(r.plain, "text/plain; charset=utf-8", CACHE_PAGE);
    }
    html(page::post_page(cfg, doc, &chain, &o, base_path, at_uri, byline), 200, CACHE_PAGE)
}

/// `/read/<actor>/` and `/read/<actor>/<rkey>/` — anyone's publication.
async fn read_anyone(cfg: &Config, rest: &str, q: &Query) -> Result<Response> {
    let parts: Vec<&str> = rest.trim_matches('/').split('/').filter(|s| !s.is_empty()).collect();
    if parts.is_empty() {
        // The form on this page GETs back to it with ?actor=; turn that into the
        // clean URL so what people share is /read/alice.bsky.social/ and not a
        // query string.
        if let Some(actor) = q.get("actor").map(|a| a.trim().to_string()).filter(|a| !a.is_empty()) {
            let to = Url::parse(&cfg.url_for(&format!("/read/{}/", pds::enc(&actor))))?;
            return Response::redirect_with_status(to, 303);
        }
        return html(read_form(cfg), 200, CACHE_PAGE);
    }

    let actor = parts[0];
    let a = pds::resolve(actor, &cfg.appview).await?;

    if let Some(key) = parts.get(1) {
        // Two ways in, because a publication record declares its documents'
        // canonical URLs as `url + path` — and `path` is a slug, not an rkey. If
        // only the rkey resolved, every canonical URL a generic publication
        // advertises would 404 on the site that told it to advertise them.
        let (uri, record) = match resolve_document(cfg, &a, key).await? {
            Some(pair) => pair,
            None => {
                return html(
                    page::error_page(cfg, 404, "No such document in that repo."),
                    404,
                    CACHE_NONE,
                )
            }
        };
        let doc = record.as_doc();
        let base = format!("/read/{actor}/{key}/");
        return post(cfg, &doc, &base, &uri.to_string(), Some(actor), q);
    }

    let pub_rec = pds::publication(&a, None).await?;
    let docs = pds::documents(&a, 100, None).await?;
    let items: Vec<page::Item> = docs
        .iter()
        .map(|(uri, d)| {
            let doc = d.as_doc();
            let rkey = AtUri::parse(uri).map(|u| u.rkey).unwrap_or_default();
            page::Item {
                title: doc.title.clone(),
                href: format!("/read/{actor}/{rkey}/"),
                published: doc.published.clone(),
                description: doc.description.clone().unwrap_or_default(),
                tags: doc.tags.clone(),
                minutes: doc.reading_minutes(),
            }
        })
        .collect();

    let (name, desc) = match &pub_rec {
        Some((_, p)) => (p.name.clone(), p.description.clone().unwrap_or_default()),
        None => (actor.to_string(), String::new()),
    };
    let intro = format!(
        r#"<h1>{}</h1><p class="lede">{}</p>
<p class="fine">Read from <code>{}</code>'s repo, rendered here. This publication has nothing to do with this site —
that is the point of a <a href="https://standard.site">shared lexicon</a>.
Every <a href="/api/predicates">predicate</a> works on it.</p>"#,
        slugesc::esc(&name),
        slugesc::esc(&desc),
        slugesc::esc(&a.did),
    );
    let body = page::index_page(cfg, Some(&intro), &items, &format!("{name} — via {}", cfg.name), &desc);
    html(body, 200, CACHE_PDS)
}

/// Find one of an actor's documents by rkey **or** by slug.
///
/// The rkey path is one `getRecord`; the slug path costs a `listRecords` and a
/// scan, which is why it is the fallback rather than the first attempt. Slugs are
/// not guaranteed unique within a repo — two posts can share a title — so the
/// newest match wins, `documents()` having already sorted by publish date.
async fn resolve_document(
    cfg: &Config,
    a: &pds::Actor,
    key: &str,
) -> Result<Option<(AtUri, rant_core::standard::Document)>> {
    let uri = AtUri {
        authority: a.did.clone(),
        collection: rant_core::standard::NSID_DOCUMENT.to_string(),
        rkey: key.to_string(),
    };
    if let Ok(record) = pds::document(&uri, &cfg.appview).await {
        return Ok(Some((uri, record)));
    }

    let wanted = rant_core::slug::slugify(key);
    for (found_uri, d) in pds::documents(a, 100, None).await? {
        let doc = d.as_doc();
        if doc.slug == wanted {
            if let Some(parsed) = AtUri::parse(&found_uri) {
                return Ok(Some((parsed, d)));
            }
        }
    }
    Ok(None)
}

fn read_form(cfg: &Config) -> String {
    let mut s = page::head(
        cfg,
        &page::Head {
            title: &format!("Read anyone — {}", cfg.name),
            description: "Render any standard.site publication through these views.",
            canonical: cfg.url_for("/read/"),
            document_uri: "",
            publication_uri: &cfg.publication_uri,
            og_image: None,
            published: "",
            kind: "website",
        },
    );
    s.push_str(&page::header(cfg));
    s.push_str(
        r#"<main class="index"><h1>Read anyone</h1>
<p class="lede">Any ATProto handle or DID with <code>site.standard.document</code> records in their repo.
Their posts, rendered here, through every predicate. No permission needed — the records are public.</p>
<form class="read-form" method="get" action="/read/">
  <input name="actor" placeholder="alice.bsky.social" aria-label="Handle or DID" required>
  <button class="btn" type="submit">read</button>
</form>
<p class="fine">This works because standard.site is a shared lexicon rather than a platform.
The reader is not coupled to the publisher.</p></main>"#,
    );
    s.push_str(&page::footer(cfg));
    s
}

// ─────────────────────────────────────────────────────────────────── cards ──

/// `/og/card.png` (the publication), `/og/<slug>/card.png` (a house post), and
/// `/og/read/<actor>/<rkey>/card.png` (somebody's PDS document).
///
/// The third case is not an afterthought — once you post from the composer, your
/// posts live in your repo and `/read/…` is where they are read, so that is the
/// card that will actually be shared. Getting it wrong would mean every real
/// post fell back to the generic publication card.
async fn card(cfg: &Config, rest: &str) -> Result<Response> {
    let (slug, file) = match rest.rsplit_once('/') {
        Some((s, f)) => (s.trim_matches('/'), f),
        None => ("", rest),
    };

    let pal = rant_core::card::Palette { accent: cfg.accent.clone(), ..Default::default() };

    // A card for a document in somebody's repo.
    if let Some(target) = slug.strip_prefix("read/") {
        let parts: Vec<&str> = target.split('/').filter(|s| !s.is_empty()).collect();
        if let [actor, rkey] = parts[..] {
            let a = pds::resolve(actor, &cfg.appview).await?;
            let uri = AtUri {
                authority: a.did,
                collection: rant_core::standard::NSID_DOCUMENT.to_string(),
                rkey: rkey.to_string(),
            };
            let record = pds::document(&uri, &cfg.appview).await?;
            let doc = record.as_doc();
            let svg = rant_core::card::svg(
                &rant_core::card::Card {
                    title: &doc.title,
                    kicker: actor,
                    domain: cfg.site_url.trim_start_matches("https://"),
                    dek: doc.description.as_deref().unwrap_or(""),
                    meta: &format!("{} words · {} min read", doc.word_count(), doc.reading_minutes()),
                    body: doc.body,
                },
                &pal,
            );
            return deliver_card(svg, file);
        }
    }

    let domain = cfg.site_url.trim_start_matches("https://");
    let svg = match house::get(slug) {
        Some(d) => rant_core::card::svg(
            &rant_core::card::Card {
                title: &d.title,
                kicker: &cfg.name,
                domain,
                dek: d.description.as_deref().unwrap_or(""),
                meta: &format!("{} words · {} min read", d.word_count(), d.reading_minutes()),
                body: d.body,
            },
            &pal,
        ),
        None => {
            // The publication card. Its "body" is the titles of recent posts,
            // so the cadence bars show the shape of the blog rather than of a
            // single essay.
            let corpus: String =
                house::all().iter().map(|d| format!("{}. ", d.title)).collect::<Vec<_>>().join("");
            rant_core::card::svg(
                &rant_core::card::Card {
                    title: &cfg.name,
                    kicker: "a standard.site publication",
                    domain,
                    dek: &cfg.description,
                    meta: &format!("{} posts", house::count()),
                    body: &corpus,
                },
                &pal,
            )
        }
    };

    deliver_card(svg, file)
}

/// Serve a card SVG as PNG, or as SVG if that was asked for — or if resvg fails.
fn deliver_card(svg: String, file: &str) -> Result<Response> {
    if file.ends_with(".svg") {
        return text_response(svg, "image/svg+xml; charset=utf-8", CACHE_CARD);
    }

    match card::png(&svg) {
        Ok(bytes) => Ok(Response::from_bytes(bytes)?.with_headers(headers(&[
            ("content-type", "image/png"),
            ("cache-control", CACHE_CARD),
            ("access-control-allow-origin", "*"),
        ]))),
        Err(e) => {
            // Better a card some clients cannot render than no card at all.
            console_error!("rant: card rasterisation failed: {e}");
            text_response(svg, "image/svg+xml; charset=utf-8", CACHE_CARD)
        }
    }
}

// ──────────────────────────────────────────────────────────────────── feeds ──

fn entries(cfg: &Config) -> Vec<feeds::Entry> {
    house::all()
        .iter()
        .map(|d| feeds::Entry {
            title: d.title.clone(),
            url: cfg.url_for(&d.path()),
            path: d.path(),
            published: d.published.clone(),
            description: d.description.clone().unwrap_or_default(),
            body: d.body.to_string(),
            tags: d.tags.clone(),
            at_uri: String::new(),
        })
        .collect()
}

fn feed_meta<'a>(cfg: &'a Config, now: &'a str) -> feeds::FeedMeta<'a> {
    feeds::FeedMeta { title: &cfg.name, description: &cfg.description, site_url: &cfg.site_url, now }
}

fn feed_rss(cfg: &Config) -> Result<Response> {
    let now = now_iso();
    let body = feeds::rss(&feed_meta(cfg, &now), &entries(cfg));
    text_response(body, "application/rss+xml; charset=utf-8", CACHE_STATIC)
}

fn feed_json(cfg: &Config) -> Result<Response> {
    let now = now_iso();
    let body = feeds::json_feed(&feed_meta(cfg, &now), &entries(cfg));
    text_response(body, "application/feed+json; charset=utf-8", CACHE_STATIC)
}

fn llms(cfg: &Config, full: bool) -> Result<Response> {
    let now = now_iso();
    let m = feed_meta(cfg, &now);
    let e = entries(cfg);
    let body = if full {
        feeds::llms_full_txt(&m, &e)
    } else {
        let posts = cfg.url_for("/api/posts");
        let preds = cfg.url_for("/api/predicates");
        let mcp = cfg.url_for("/mcp");
        let full_url = cfg.url_for("/llms-full.txt");
        feeds::llms_txt(
            &m,
            &e,
            &[
                (&full_url, "every post's full text, in one file"),
                (&posts, "JSON index"),
                (&preds, "the predicate registry"),
                (&mcp, "MCP JSON-RPC — list_posts, read_post, apply_predicate, draft_post, …"),
            ],
        )
    };
    text_response(body, "text/plain; charset=utf-8", CACHE_STATIC)
}

/// The two lines that actually start the browser module.
///
/// **This file is why the whole browser half of the site was dead.**
/// `wasm-bindgen --target web` emits a glue module whose default export *is* the
/// init function — it does not run itself. So
/// `<script type="module" src="/pkg/rant_view.js">` evaluated the glue, never
/// instantiated the wasm, and `#[wasm_bindgen(start)]` never fired. Everything
/// looked right from `curl`: the module was served, 200, correct MIME. Nothing
/// in the browser worked.
///
/// It is generated by the worker rather than committed as a `.js` file for two
/// reasons: the CSP is `default-src 'self'` with no `unsafe-inline`, so an inline
/// `<script>` would be blocked; and generating it here keeps the invariant that
/// nothing under `rant/` is hand-written JavaScript. The worker already generates
/// every byte of HTML — two lines of ES module is the same act.
fn boot_js() -> Result<Response> {
    text_response(
        // A failed init must be loud. Silent is how this shipped.
        "import init from '/pkg/rant_view.js';\n         init().catch((e) => console.error('rant: wasm init failed —', e));\n"
            .to_string(),
        "text/javascript; charset=utf-8",
        CACHE_STATIC,
    )
}

fn robots(cfg: &Config) -> Result<Response> {
    // Everything is public and machine-readable on purpose; point crawlers at
    // the index rather than making them discover it.
    text_response(
        format!(
            "User-agent: *\nAllow: /\n\nSitemap: {}\nX-Robots-Tag: all\n\n# Agents: {} and {}\n",
            cfg.url_for("/feed.xml"),
            cfg.url_for("/llms.txt"),
            cfg.url_for("/.well-known/rant-agent"),
        ),
        "text/plain; charset=utf-8",
        CACHE_STATIC,
    )
}

// ───────────────────────────────────────────────────────────── well-known ──

fn well_known_publication(cfg: &Config) -> Result<Response> {
    if cfg.publication_uri.is_empty() {
        // Honest 404 rather than an empty 200 that would make an indexer think
        // it had found a publication with no record.
        return text_response(
            "No publication record is linked to this domain yet. Set PUBLICATION_URI in wrangler.jsonc \
             to the at:// URI of this site's site.standard.publication record.\n"
                .to_string(),
            "text/plain; charset=utf-8",
            CACHE_NONE,
        )
        .map(|r| r.with_status(404));
    }
    text_response(format!("{}\n", cfg.publication_uri), "text/plain; charset=utf-8", CACHE_STATIC)
}

fn well_known_did(cfg: &Config) -> Result<Response> {
    if cfg.did.is_empty() {
        return text_response("No DID configured.\n".to_string(), "text/plain; charset=utf-8", CACHE_NONE)
            .map(|r| r.with_status(404));
    }
    text_response(format!("{}\n", cfg.did), "text/plain; charset=utf-8", CACHE_STATIC)
}

// ────────────────────────────────────────────────────────────────────── api ──

fn posts_json(cfg: &Config) -> serde_json::Value {
    json!({
        "publication": {
            "name": cfg.name,
            "url": cfg.site_url,
            "description": cfg.description,
            "uri": cfg.publication_uri,
        },
        "posts": house::all().iter().map(|d| json!({
            "title": d.title,
            "slug": d.slug,
            "path": d.path(),
            "url": cfg.url_for(&d.path()),
            "published": d.published,
            "description": d.description,
            "tags": d.tags,
            "words": d.word_count(),
            "minutes": d.reading_minutes(),
        })).collect::<Vec<_>>(),
    })
}

/// Handle typeahead for the sign-in dialog, proxied through this origin.
///
/// The browser could call `public.api.bsky.app` directly — the fluoddity
/// reference does — but proxying is better on three counts, and the third is what
/// forced the issue:
///
/// 1. **Privacy.** Bluesky's AppView does not need the visitor's IP for every
///    keystroke of a handle they are typing into somebody else's site.
/// 2. **A tighter CSP.** `connect-src 'self'` covers it, so the policy needs no
///    third-party exception for the fetch at all.
/// 3. **Testability.** A browser in a sandbox with no direct egress cannot reach
///    the AppView; the Worker can. The browser test that found the wasm never
///    booting could not have checked the typeahead otherwise.
///
/// Only the three fields the dialog renders are passed through. An upstream
/// failure returns an empty list rather than an error: a typeahead that is
/// briefly unhelpful is fine, one that shows an error box while you are typing is
/// not.
async fn typeahead(cfg: &Config, q: &Query) -> Result<Response> {
    let term = q.get("q").unwrap_or_default().trim().trim_start_matches('@').to_string();
    if term.chars().count() < 2 {
        return json_response(&json!({ "actors": [] }), 200, CACHE_NONE);
    }
    let url = format!(
        "{}/xrpc/app.bsky.actor.searchActorsTypeahead?q={}&limit=8",
        cfg.appview,
        pds::enc(&term)
    );
    let actors = match pds::get_json_public(&url).await {
        Ok(v) => v
            .get("actors")
            .and_then(|a| a.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| {
                        let handle = a.get("handle")?.as_str()?;
                        Some(json!({
                            "handle": handle,
                            "displayName": a.get("displayName").and_then(|d| d.as_str()).unwrap_or(handle),
                            "avatar": a.get("avatar").and_then(|d| d.as_str()).unwrap_or(""),
                        }))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
        Err(e) => {
            console_error!("rant: typeahead upstream failed: {e}");
            Vec::new()
        }
    };
    // Short cache: handles change slowly, but a stale suggestion list is the
    // least consequential thing on the site.
    json_response(&json!({ "actors": actors }), 200, "public, max-age=30")
}

/// How many people subscribe, counted from the public backlink index.
///
/// Kept off the page-render path deliberately: rendering a post is a local
/// computation with a hard latency budget, and this is a network call to a
/// third party. The browser asks for it after the page is already readable, and
/// a `null` count renders as "—" rather than as a zero we made up.
async fn subscribers(cfg: &Config) -> Result<Response> {
    let count = pds::subscriber_count(cfg.site_ref()).await;
    json_response(
        &json!({ "publication": cfg.site_ref(), "subscribers": count, "source": "constellation.microcosm.blue" }),
        200,
        CACHE_PDS,
    )
}

fn api_post(cfg: &Config, slug: &str, q: &Query) -> Result<Response> {
    let Some(doc) = house::get(slug) else {
        return json_response(&json!({ "error": format!("no post {slug:?}") }), 404, CACHE_NONE);
    };
    let chain = parse_chain(&q.get("view").unwrap_or_default());
    json_response(&api::post_json(cfg, &doc, "", &chain, &q.opts()), 200, CACHE_STATIC)
}

async fn api_render(req: &Request, cfg: &Config) -> Result<Response> {
    if req.method() != Method::Post {
        return json_response(&json!({ "error": "POST a JSON body" }), 405, CACHE_NONE);
    }
    let mut r = req.clone()?;
    let body: serde_json::Value = r.json().await.unwrap_or_else(|_| json!({}));
    let name = body.get("op").and_then(|o| o.as_str()).unwrap_or("render_markdown").to_string();
    match api::dispatch(cfg, &name, &api::Args(body)) {
        Ok(v) => json_response(&v, 200, CACHE_NONE),
        Err(e) => json_response(&json!({ "error": e }), 400, CACHE_NONE),
    }
}

async fn mcp(req: &Request, cfg: &Config) -> Result<Response> {
    if req.method() == Method::Get {
        // A GET on the MCP endpoint is a person in a browser; tell them what
        // this is rather than returning a protocol error.
        return json_response(&agent::descriptor(&cfg.site_url), 200, CACHE_STATIC);
    }
    let mut r = req.clone()?;
    let body: serde_json::Value = r.json().await.unwrap_or_else(|_| json!({}));
    let id = body.get("id").cloned().unwrap_or(json!(null));
    let method = body.get("method").and_then(|m| m.as_str()).unwrap_or_default();
    let params = body.get("params").cloned().unwrap_or_else(|| json!({}));

    if let Some(v) = api::mcp_local(cfg, method, &params, id.clone()) {
        return json_response(&v, 200, CACHE_NONE);
    }

    // The three tools that need the network.
    let name = params.get("name").and_then(|n| n.as_str()).unwrap_or_default();
    let args = api::Args(params.get("arguments").cloned().unwrap_or_else(|| json!({})));
    let result = match name {
        "list_posts" => Ok(posts_json(cfg)),
        "read_post" => match args.str("slug").and_then(house::get) {
            Some(d) => {
                let chain = parse_chain(args.str("view").unwrap_or(""));
                Ok(api::post_json(cfg, &d, "", &chain, &args.opts()))
            }
            None => Err("no such slug".to_string()),
        },
        "read_publication" => match args.str("actor") {
            Some(actor) => read_publication_json(cfg, actor, args.u32("limit").unwrap_or(25))
                .await
                .map_err(|e| e.to_string()),
            None => Err("actor is required".to_string()),
        },
        other => Err(format!("unknown tool {other:?}")),
    };

    let payload = match result {
        Ok(v) => api::rpc_ok(id, api::tool_result(&v)),
        Err(e) => api::rpc_ok(id, api::tool_error(&e)),
    };
    json_response(&payload, 200, CACHE_NONE)
}

async fn read_publication_json(cfg: &Config, actor: &str, limit: u32) -> Result<serde_json::Value> {
    let a = pds::resolve(actor, &cfg.appview).await?;
    let p = pds::publication(&a, None).await?;
    let docs = pds::documents(&a, limit, None).await?;
    Ok(json!({
        "did": a.did,
        "pds": a.pds,
        "publication": p.as_ref().map(|(uri, rec)| json!({ "uri": uri, "record": rec })),
        "documents": docs.iter().map(|(uri, d)| json!({
            "uri": uri,
            "title": d.title,
            "publishedAt": d.published_at,
            "path": d.path,
            "description": d.description,
            "tags": d.tags,
            "read_here": cfg.url_for(&format!("/read/{actor}/{}/", AtUri::parse(uri).map(|u| u.rkey).unwrap_or_default())),
        })).collect::<Vec<_>>(),
    }))
}

// ───────────────────────────────────────────────────────────────── plumbing ──

/// Query-string access with the shape the rest of the file wants.
struct Query(Vec<(String, String)>);

impl Query {
    fn from(url: &Url) -> Query {
        Query(url.query_pairs().map(|(k, v)| (k.into_owned(), v.into_owned())).collect())
    }
    fn get(&self, k: &str) -> Option<String> {
        self.0.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone())
    }
    fn opts(&self) -> Opts {
        Opts {
            wpm: self.get("wpm").and_then(|v| v.parse().ok()).unwrap_or(350u32).clamp(60, 1200),
            min_chars: self.get("chars").and_then(|v| v.parse().ok()).unwrap_or(0usize).min(80),
            round: self.get("round").and_then(|v| v.parse().ok()).unwrap_or(1u8).min(5),
        }
    }
}

async fn assets_or_404(req: &Request, env: &Env, cfg: &Config) -> Result<Response> {
    let assets = env.assets("ASSETS")?;
    let resp = assets.fetch(req.url()?, None).await?;
    if resp.status_code() != 404 {
        return Ok(resp);
    }
    html(page::error_page(cfg, 404, "No such post."), 404, CACHE_NONE)
}

fn headers(pairs: &[(&str, &str)]) -> Headers {
    let h = Headers::new();
    for (k, v) in pairs {
        let _ = h.set(k, v);
    }
    h
}

fn html(body: String, status: u16, cache: &str) -> Result<Response> {
    Ok(Response::from_html(body)?.with_status(status).with_headers(headers(&[
        ("content-type", "text/html; charset=utf-8"),
        ("cache-control", cache),
        // The pages contain no inline script and no third-party anything.
        ("content-security-policy", CSP),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "strict-origin-when-cross-origin"),
    ])))
}

fn text_response(body: String, ct: &str, cache: &str) -> Result<Response> {
    Ok(Response::ok(body)?.with_headers(headers(&[
        ("content-type", ct),
        ("cache-control", cache),
        ("access-control-allow-origin", "*"),
        ("x-content-type-options", "nosniff"),
    ])))
}

fn json_response(v: &serde_json::Value, status: u16, cache: &str) -> Result<Response> {
    Ok(Response::from_json(v)?.with_status(status).with_headers(headers(&[
        ("content-type", "application/json; charset=utf-8"),
        ("cache-control", cache),
        // The JSON surface is meant to be called from anywhere: sibling
        // mino.mobi sites, agents, somebody's notebook. It is all public data.
        ("access-control-allow-origin", "*"),
        ("access-control-allow-headers", "content-type"),
        ("x-content-type-options", "nosniff"),
    ])))
}

/// RFC-3339 now, from the JS clock. The only nondeterminism in the worker, and
/// it is confined to this function so `rant-core` can stay a pure library.
fn now_iso() -> String {
    js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default()
}
