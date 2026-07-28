//! Server-rendered pages.
//!
//! Every page here is complete HTML before any JavaScript runs: the posts, all
//! eleven predicate views, the archive, and other people's publications. The
//! wasm module in `rant-view` upgrades the page — it animates the timed views
//! and drives the composer — but nothing on a reading path depends on it.
//!
//! That is not austerity for its own sake. A view that only exists after a
//! script runs is invisible to the link-card scraper that made you click, to
//! the reader on a train, and to the agent that fetched the URL. The whole
//! point of putting a view in the URL is that the URL answers.

use rant_core::{
    predicates::{Opts, Predicate},
    render_body, Doc,
};

use crate::config::Config;
use crate::slugesc::{a, esc};

/// The standard.site link tags, the OpenGraph block, and everything else that
/// belongs in `<head>` for one post.
pub struct Head<'a> {
    pub title: &'a str,
    pub description: &'a str,
    pub canonical: String,
    /// `at://…` for this document, if it is in a repo.
    pub document_uri: &'a str,
    pub publication_uri: &'a str,
    pub og_image: Option<String>,
    pub published: &'a str,
    pub kind: &'a str,
}

pub fn head(cfg: &Config, h: &Head<'_>) -> String {
    let mut s = String::with_capacity(2048);
    s.push_str("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">");
    s.push_str(r#"<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">"#);
    s.push_str(&format!("<title>{}</title>", esc(h.title)));
    s.push_str(&format!(r#"<meta name="description" content="{}">"#, esc(h.description)));
    s.push_str(&format!(r#"<link rel="canonical" href="{}">"#, esc(&h.canonical)));

    // ── standard.site verification ──
    // The publication tag says which publication this page belongs to; the
    // document tag says which record this page *is*. An indexer that finds the
    // page can walk straight to the record, and vice versa.
    if !h.publication_uri.is_empty() {
        s.push_str(&format!(r#"<link rel="site.standard.publication" href="{}">"#, esc(h.publication_uri)));
    }
    if !h.document_uri.is_empty() {
        s.push_str(&format!(r#"<link rel="site.standard.document" href="{}">"#, esc(h.document_uri)));
    }

    // ── the link card ──
    s.push_str(&format!(r#"<meta property="og:type" content="{}">"#, esc(h.kind)));
    s.push_str(&format!(r#"<meta property="og:title" content="{}">"#, esc(h.title)));
    s.push_str(&format!(r#"<meta property="og:description" content="{}">"#, esc(h.description)));
    s.push_str(&format!(r#"<meta property="og:url" content="{}">"#, esc(&h.canonical)));
    s.push_str(&format!(r#"<meta property="og:site_name" content="{}">"#, esc(&cfg.name)));
    if let Some(img) = &h.og_image {
        // Bluesky, Mastodon and Slack all want an absolute PNG with explicit
        // dimensions; omit either and the card renders small or not at all.
        s.push_str(&format!(r#"<meta property="og:image" content="{}">"#, esc(img)));
        s.push_str(r#"<meta property="og:image:width" content="1200">"#);
        s.push_str(r#"<meta property="og:image:height" content="630">"#);
        s.push_str(r#"<meta name="twitter:card" content="summary_large_image">"#);
        s.push_str(&format!(r#"<meta name="twitter:image" content="{}">"#, esc(img)));
    }
    if !h.published.is_empty() {
        s.push_str(&format!(r#"<meta property="article:published_time" content="{}">"#, esc(h.published)));
    }

    // ── syndication and agents ──
    s.push_str(&format!(
        r#"<link rel="alternate" type="application/rss+xml" title="{}" href="{}">"#,
        esc(&cfg.name),
        esc(&cfg.url_for("/feed.xml"))
    ));
    s.push_str(&format!(
        r#"<link rel="alternate" type="application/feed+json" title="{}" href="{}">"#,
        esc(&cfg.name),
        esc(&cfg.url_for("/feed.json"))
    ));
    s.push_str(&format!(r#"<link rel="stylesheet" href="/rant.css">"#));
    s.push_str(
        r#"<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗯️</text></svg>">"#,
    );
    s.push_str(&format!("<style>:root{{--accent:{}}}</style>", esc(&cfg.accent)));
    s.push_str("</head><body>");
    s
}

/// The site header. `auth` renders the sign-in / subscribe controls, which the
/// browser module wires up; without it they are plain links to `/compose`.
pub fn header(cfg: &Config) -> String {
    // `/setup/` is advertised only until the publication record exists. It is a
    // one-time bootstrap, not a feature, and a permanent "setup" tab on a live
    // blog reads as something being broken.
    let setup = if cfg.publication_uri.is_empty() {
        r#"<a class="needs-setup" href="/setup/" title="No publication record yet">setup</a>"#
    } else {
        ""
    };
    format!(
        r#"<header class="site"><a class="brand" href="/">{name}</a>
<nav>
  <a href="/archive/">archive</a>
  <a href="/read/">read anyone</a>
  <a href="/compose/">compose</a>
  <a href="/mine/">yours</a>
  <a href="/feed.xml">rss</a>
  {setup}
</nav>
<div class="acct" id="acct" data-auth="{auth}" data-pub="{puburi}">
  <button class="btn" type="button" data-signin>sign in with ATProto</button>
  <noscript><span class="fine">Signing in needs JavaScript — the flow is a POST to the auth
  service and a redirect to your own server. Reading works without it.</span></noscript>
</div>
</header>"#,
        name = esc(&cfg.name),
        auth = esc(&cfg.auth_url),
        puburi = esc(&cfg.publication_uri),
        setup = setup,
    )
}

pub fn footer(cfg: &Config) -> String {
    format!(
        r#"<footer class="site">
<p>{} · <a href="/feed.xml">rss</a> · <a href="/feed.json">json feed</a> · <a href="/llms.txt">llms.txt</a> · <a href="/mcp">mcp</a></p>
<p class="fine">Posts are <a href="https://standard.site">standard.site</a> records in their authors' own ATProto repos. This page was rendered by a Rust worker at the edge.</p>
</footer>
<script type="module" src="/boot.js"></script>
</body></html>"#,
        esc(&cfg.name)
    )
}

/// The view switcher. Eleven links, each a real URL.
pub fn view_switcher(base_path: &str, active: &[Predicate]) -> String {
    let mut s = String::from(r#"<nav class="views" aria-label="Reading views">"#);
    let current = active.iter().map(|p| p.id()).collect::<Vec<_>>().join("+");
    for p in Predicate::ALL {
        let is_on = active.len() == 1 && active[0] == p || (active.is_empty() && p == Predicate::Plain);
        let href = if p == Predicate::Plain {
            base_path.to_string()
        } else {
            format!("{base_path}?view={}", p.id())
        };
        s.push_str(&format!(
            r#"<a class="view-link{}" href="{}" title="{}"{}>{}</a>"#,
            if is_on { " on" } else { "" },
            esc(&href),
            esc(p.blurb()),
            if is_on { r#" aria-current="page""# } else { "" },
            esc(p.id()),
        ));
    }
    if active.len() > 1 {
        s.push_str(&format!(r#"<span class="view-chain">chain: {}</span>"#, esc(&current)));
    }
    s.push_str("</nav>");
    s
}

/// One post page.
#[allow(clippy::too_many_arguments)]
pub fn post_page(
    cfg: &Config,
    doc: &Doc<'_>,
    chain: &[Predicate],
    opts: &Opts,
    base_path: &str,
    document_uri: &str,
    byline: Option<&str>,
) -> String {
    let r = render_body(doc.body, chain, opts);
    let view = chain.last().copied().unwrap_or(Predicate::Plain);
    let desc = doc.description.clone().unwrap_or_default();

    let mut s = head(
        cfg,
        &Head {
            title: &format!("{} — {}", doc.title, cfg.name),
            description: &desc,
            canonical: cfg.url_for(base_path),
            document_uri,
            publication_uri: &cfg.publication_uri,
            og_image: Some(cfg.url_for(&format!("/og{base_path}card.png"))),
            published: &doc.published,
            kind: "article",
        },
    );
    s.push_str(&header(cfg));
    s.push_str("<main class=\"post\"><article>");
    s.push_str(&format!("<h1>{}</h1>", esc(&doc.title)));

    s.push_str(r#"<p class="meta">"#);
    if !doc.published.is_empty() {
        s.push_str(&format!(
            r#"<time datetime="{}">{}</time> · "#,
            esc(&doc.published),
            esc(doc.published.get(..10).unwrap_or(&doc.published))
        ));
    }
    s.push_str(&format!("{} words · {} min", r.words, r.minutes));
    if let Some(b) = byline {
        s.push_str(&format!(" · by {}", esc(b)));
    }
    if !doc.tags.is_empty() {
        s.push_str(" · ");
        for t in &doc.tags {
            s.push_str(&format!(r#"<a class="tag" href="/archive/?tag={}">{}</a> "#, esc(t), esc(t)));
        }
    }
    s.push_str("</p>");

    s.push_str(&view_switcher(base_path, chain));

    if view.is_timed() {
        // The timed views need a transport. Server-side they are a numbered
        // list of frames with their dwells attached; the browser module turns
        // that same markup into a player. No second representation.
        s.push_str(&format!(
            r#"<div class="timed" data-wpm="{wpm}"><div class="timed-controls">
<button class="play" type="button" aria-label="Play">▶</button>
<input class="speed" type="range" min="120" max="900" step="10" value="{wpm}" aria-label="Words per minute">
<span class="wpm">{wpm} wpm</span></div>"#,
            wpm = opts.wpm
        ));
        s.push_str(&r.html);
        s.push_str("</div>");
    } else {
        s.push_str(&r.html);
    }

    s.push_str("</article>");
    s.push_str(&actions(cfg, document_uri, &doc.title, &cfg.url_for(base_path)));
    s.push_str("</main>");
    s.push_str(&footer(cfg));
    s
}

/// Share, recommend, subscribe, and the record this page corresponds to.
///
/// Note the order of what needs what: **share is a plain link**. No session, no
/// JavaScript, no wasm — it works on the first paint and it works if every
/// script on the page fails. Recommend and subscribe write records to your repo
/// and so arrive `disabled`, for the browser module to enable once it knows
/// whether you are signed in. Putting the one that needs nothing first is not
/// cosmetic: it is the only action here that cannot break.
fn actions(cfg: &Config, document_uri: &str, title: &str, canonical: &str) -> String {
    let mut s = String::from(r#"<aside class="actions">"#);
    s.push_str(&format!(
        r#"<a class="btn share" href="{}" target="_blank" rel="noopener noreferrer">share to bluesky</a>"#,
        esc(&rant_core::share::bsky_compose(title, canonical))
    ));
    s.push_str(&format!(
        r#"<button class="btn subscribe" type="button" data-pub="{}" disabled>subscribe</button>"#,
        esc(cfg.site_ref())
    ));
    if !document_uri.is_empty() {
        s.push_str(&format!(
            r#"<button class="btn recommend" type="button" data-doc="{}" disabled>recommend</button>"#,
            esc(document_uri)
        ));
        s.push_str(&format!(
            r#"<a class="btn ghost" href="https://pdsls.dev/{}">view the record</a>"#,
            esc(document_uri)
        ));
    }
    if cfg.publication_uri.is_empty() {
        s.push_str(
            r#"<p class="fine">Subscribing needs a publication record, and this domain has not been linked to one yet — <a href="/setup/">set it up</a>.</p>"#,
        );
    } else {
        s.push_str(
            r#"<p class="fine">Subscribing writes a <code>site.standard.graph.subscription</code> record to <em>your</em> repo. Nothing is stored here.</p>"#,
        );
    }
    s.push_str("</aside>");
    s
}

/// A list of posts — the home page and the archive both use it.
pub struct Item {
    pub title: String,
    pub href: String,
    pub published: String,
    pub description: String,
    pub tags: Vec<String>,
    pub minutes: usize,
}

pub fn index_page(cfg: &Config, intro: Option<&str>, items: &[Item], title: &str, desc: &str) -> String {
    let mut s = head(
        cfg,
        &Head {
            title,
            description: desc,
            canonical: cfg.url_for("/"),
            document_uri: "",
            publication_uri: &cfg.publication_uri,
            og_image: Some(cfg.url_for("/og/card.png")),
            published: "",
            kind: "website",
        },
    );
    s.push_str(&header(cfg));
    s.push_str("<main class=\"index\">");
    if let Some(i) = intro {
        s.push_str(&format!(r#"<section class="intro">{i}</section>"#));
    }
    if items.is_empty() {
        s.push_str(r#"<p class="empty">Nothing here yet. <a href="/compose/">Write something.</a></p>"#);
    }
    s.push_str("<ul class=\"posts\">");
    for it in items {
        s.push_str("<li>");
        s.push_str(&format!(r#"<h2>{}</h2>"#, a(&it.href, &it.title)));
        s.push_str(r#"<p class="meta">"#);
        if !it.published.is_empty() {
            s.push_str(&format!(
                r#"<time datetime="{}">{}</time> · "#,
                esc(&it.published),
                esc(it.published.get(..10).unwrap_or(&it.published))
            ));
        }
        s.push_str(&format!("{} min", it.minutes));
        for t in &it.tags {
            s.push_str(&format!(r#" · <a class="tag" href="/archive/?tag={}">{}</a>"#, esc(t), esc(t)));
        }
        s.push_str("</p>");
        if !it.description.is_empty() {
            s.push_str(&format!(r#"<p class="dek">{}</p>"#, esc(&it.description)));
        }
        s.push_str("</li>");
    }
    s.push_str("</ul></main>");
    s.push_str(&footer(cfg));
    s
}

/// The composer.
///
/// The one page that is a shell: an editor without its script is a `<textarea>`
/// that cannot save, and pretending otherwise would be worse than saying it. It
/// is still *rendered here* rather than served as a static file, so it gets the
/// real publication URI in `data-pub` — a static shell would have to guess.
pub fn compose_page(cfg: &Config) -> String {
    // Only the untimed views make sense in a preview: you are not going to draft
    // at 350wpm.
    let previewable = [
        Predicate::Plain,
        Predicate::Bionic,
        Predicate::Skeleton,
        Predicate::Spine,
        Predicate::Cadence,
        Predicate::Hapax,
        Predicate::Reverse,
        Predicate::Concordance,
    ];

    let mut s = head(
        cfg,
        &Head {
            title: &format!("Compose — {}", cfg.name),
            description: "Type. Preview. Post to your own repo.",
            canonical: cfg.url_for("/compose/"),
            document_uri: "",
            publication_uri: &cfg.publication_uri,
            og_image: None,
            published: "",
            kind: "website",
        },
    );
    s.push_str("<meta name=\"robots\" content=\"noindex\">");
    s.push_str(&header(cfg));
    s.push_str(&format!(
        r#"<main class="compose">
<h1>Rant into the box</h1>
<p class="fine">Optional <code>---</code> frontmatter: <code>title</code>, <code>date</code>,
<code>tags</code>, <code>description</code>. Everything else is markdown.
Posting writes a <code>site.standard.document</code> record to your own repo — nothing is stored here.
Drafts are kept in this browser until you post.</p>
<p class="fine starters">Start from: {starters} <span class="dim">— or just type.</span></p>
<nav class="views compose-views" aria-label="Preview view">{views}</nav>
<div class="compose-grid">
  <div>
    <div class="toolbar" role="toolbar" aria-label="Formatting">{toolbar}</div>
    <textarea id="editor" spellcheck="true" autocapitalize="sentences"
      placeholder="---&#10;title: On the tyranny of the empty box&#10;tags: writing&#10;---&#10;&#10;Go on then."></textarea>
  </div>
  <div class="preview" id="preview" data-view="plain">
    <h2 id="preview-title">Untitled</h2>
    <p class="meta" id="preview-meta">0 words · 0 min</p>
    <div id="preview-body"></div>
  </div>
</div>
<div class="compose-bar">
  <button class="btn" id="post" type="button" disabled>loading…</button>
  <span id="status">The preview runs the same Rust renderer the published page will.</span>
</div>
</main>"#,
        toolbar = rant_core::edit::Action::ALL
            .iter()
            .map(|a| format!(
                r#"<button class="tb" type="button" data-fmt="{id}" title="{title}" aria-label="{title}">{label}</button>"#,
                id = a.id(),
                title = esc(a.title()),
                label = esc(a.label()),
            ))
            .collect::<String>(),
        // Low key by design: a line of text chips, not a gallery of cards. A
        // starter you have to dismiss is worse than an empty box.
        starters = rant_core::templates::ALL
            .iter()
            .map(|t| format!(
                r#"<button class="chip" type="button" data-template="{id}" title="{blurb}">{label}</button>"#,
                id = esc(t.id),
                blurb = esc(t.blurb),
                label = esc(t.label),
            ))
            .collect::<String>(),
        views = previewable
            .iter()
            .map(|p| format!(
                // r##…##: the `href="#"` would close an r#…# string.
                r##"<a class="view-link{on}" href="#" data-view="{id}" title="{blurb}">{id}</a>"##,
                on = if *p == Predicate::Plain { " on" } else { "" },
                id = p.id(),
                blurb = esc(p.blurb()),
            ))
            .collect::<String>(),
    ));
    s.push_str(&footer(cfg));
    s
}

/// `/setup/` — create the publication record.
///
/// This page exists because the rest of the site cannot bootstrap itself. A
/// `site.standard.publication` record has to be written to somebody's repo
/// before `/.well-known/site.standard.publication` has anything to return and
/// before a document can point its `site` field at an `at://` URI — and writing
/// it needs an OAuth grant, which only a browser holds. So: one page, one
/// button, once.
///
/// **It is not a prerequisite for anything a visitor does.** Writing posts,
/// publishing them, reading them back, deleting them and subscribing all work
/// with no publication record anywhere, and did for weeks while this page sat in
/// the nav looking like an unfinished chore. The page now says so first, because
/// a bootstrap step that is optional and does not say it is optional reads as a
/// blocked site.
///
/// It used to end by printing two lines to paste into `wrangler.jsonc` and
/// redeploy, because a Worker cannot rewrite its own `vars`. It no longer does:
/// the worker resolves the record from `PUBLICATION_DID` at request time
/// (`pds::publication_for_site`). Pressing the button is the whole of it.
pub fn setup_page(cfg: &Config) -> String {
    let configured = !cfg.publication_uri.is_empty();
    let mut s = head(
        cfg,
        &Head {
            title: &format!("Setup — {}", cfg.name),
            description: "Create this publication's standard.site record.",
            canonical: cfg.url_for("/setup/"),
            document_uri: "",
            publication_uri: &cfg.publication_uri,
            og_image: None,
            published: "",
            kind: "website",
        },
    );
    s.push_str("<meta name=\"robots\" content=\"noindex\">");
    s.push_str(&header(cfg));
    s.push_str("<main class=\"index setup\"><h1>Publication setup</h1>");
    s.push_str(
        r#"<p class="fine"><strong>You do not need this page to post.</strong> Writing, publishing,
reading, sharing and deleting all work without it — your posts go to your own repo either way, and
you can see them at <a href="/mine/">/mine/</a>. This page does one narrow thing: it registers
<em>this domain</em> as a standard.site <em>publication</em>, so that other standard.site software
can discover it as a blog rather than as a pile of individual documents.</p>"#,
    );

    if configured {
        s.push_str(&format!(
            r#"<p class="lede">This domain is linked to a publication record.</p>
<pre class="uri">{}</pre>
<p class="fine">Served at <a href="/.well-known/site.standard.publication">/.well-known/site.standard.publication</a>,
and referenced by the <code>site</code> field of every document posted here.
Re-running the button below updates the record's name, description and theme from this
deployment's <code>vars</code> — it will not create a second one, because the record key is
<code>self</code>.</p>"#,
            esc(&cfg.publication_uri)
        ));
    } else {
        s.push_str(
            r#"<p class="lede">No publication record is linked to this domain yet.</p>
<p class="fine">Until one is, <code>/.well-known/site.standard.publication</code> returns 404 and
documents posted here use this site's URL as their <code>site</code> field — which the lexicon
allows for loose documents, so nothing is broken; the publication is just not discoverable as a
publication.</p>"#,
        );
    }

    s.push_str(&format!(
        r#"<section class="setup-box">
<h2>What the button writes</h2>
<pre class="record" id="preview-record">{}</pre>
<p class="fine">To <em>your</em> repo, at <code>site.standard.publication/self</code>. Nothing is
stored on this server. Whoever presses it owns the record, so it should be whoever owns
<code>{domain}</code>.</p>
<div class="compose-bar">
  <button class="btn" id="claim" type="button" data-url="{url}" data-name="{name}" data-desc="{desc}" data-accent="{accent}" disabled>loading…</button>
  <span id="status">Sign in first.</span>
</div>
<div id="result"></div>
</section>"#,
        esc(&sample_publication_json(cfg)),
        domain = esc(cfg.site_url.trim_start_matches("https://")),
        url = esc(&cfg.site_url),
        name = esc(&cfg.name),
        desc = esc(&cfg.description),
        accent = esc(&cfg.accent),
    ));

    // What happens after the press — which depends on whether this deployment
    // knows which repo to look in. With a DID configured there is genuinely
    // nothing else to do, and saying so is the point of this rewrite; without
    // one, the old paste-and-deploy is still the honest answer and is stated as
    // such rather than quietly omitted.
    s.push_str(&if cfg.did.is_empty() {
        r#"<section>
<h2>Then one manual step</h2>
<p class="fine">This deployment has no <code>PUBLICATION_DID</code>, so it does not know which repo
to look in. Put the DID the button prints into <code>rant/wrangler.jsonc</code> →
<code>vars</code> as <code>PUBLICATION_DID</code> and push; after that, this page needs no follow-up
ever again.</p>
</section>"#
            .to_string()
    } else {
        format!(
            r#"<section>
<h2>Then nothing</h2>
<p class="fine">No second step, no deploy to wait for. This site looks in
<code>{did}</code> and takes the publication record there whose <code>url</code> is
<code>{url}</code> — so the record the button writes is the one it picks up, and any other
publication in the same repo is correctly left alone. Reload — give it up to a minute, the lookup
is cached that long — and the link tags, the well-known endpoint and the subscribe button are
live.</p>
</section>"#,
            did = esc(&cfg.did),
            url = esc(&cfg.site_url),
        )
    });

    s.push_str("</main>");
    s.push_str(&footer(cfg));
    s
}

/// The record the setup button will write, rendered for the page so there is no
/// surprise about what gets put in somebody's repo.
///
/// Calls `rant_core::standard::publication_for` — the same function
/// `rant-view`'s setup button calls — so this preview is the record, not a
/// second rendering of an idea of it.
fn sample_publication_json(cfg: &Config) -> String {
    let p = rant_core::standard::publication_for(&cfg.site_url, &cfg.name, &cfg.description, &cfg.accent);
    serde_json::to_string_pretty(&p).unwrap_or_default()
}

/// `/mine/` — the shell for managing your own records.
///
/// A shell, necessarily: the worker holds no session and cannot know who you
/// are, so the list has to be read from your repo by the browser. That is the
/// same property that makes the site trustworthy — there is no server-side copy
/// of your posts for it to render.
pub fn mine_page(cfg: &Config) -> String {
    let mut s = head(
        cfg,
        &Head {
            title: &format!("Your records — {}", cfg.name),
            description: "Everything this site has written to your repo, with a delete button on each.",
            canonical: cfg.url_for("/mine/"),
            document_uri: "",
            publication_uri: &cfg.publication_uri,
            og_image: None,
            published: "",
            kind: "website",
        },
    );
    s.push_str("<meta name=\"robots\" content=\"noindex\">");
    s.push_str(&header(cfg));
    s.push_str(
        r#"<main class="index mine-page">
<h1>Your records</h1>
<p class="lede">Everything this site has ever written to your repo, and the delete button for each of it.</p>
<p class="fine">Listed straight out of your PDS and deleted straight out of it, under the scope you
already granted — <code>repo:</code> covers create, update and delete, so there is nothing further to
consent to. This site keeps no copy, which is also why it cannot show you this list without you
signing in.</p>
<div id="mine"><p class="fine">Loading…</p></div>
</main>"#,
    );
    s.push_str(&footer(cfg));
    s
}

/// An error page that is still a page.
pub fn error_page(cfg: &Config, code: u16, message: &str) -> String {
    let mut s = head(
        cfg,
        &Head {
            title: &format!("{code} — {}", cfg.name),
            description: message,
            canonical: cfg.url_for("/"),
            document_uri: "",
            publication_uri: &cfg.publication_uri,
            og_image: None,
            published: "",
            kind: "website",
        },
    );
    s.push_str(&header(cfg));
    s.push_str(&format!(
        r#"<main class="error"><h1>{code}</h1><p>{}</p><p><a href="/">back to the front</a></p></main>"#,
        esc(message)
    ));
    s.push_str(&footer(cfg));
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(publication_uri: &str) -> Config {
        Config {
            site_url: "https://rant.mino.mobi".into(),
            name: "Rant".into(),
            description: "A box to rant into.".into(),
            publication_uri: publication_uri.into(),
            did: "did:plc:x".into(),
            auth_url: "https://auth.mino.mobi".into(),
            appview: "https://public.api.bsky.app".into(),
            accent: "#e4b363".into(),
        }
    }

    const PUB: &str = "at://did:plc:x/site.standard.publication/self";
    const DOC: &str = "at://did:plc:x/site.standard.document/3k";

    fn doc() -> Doc<'static> {
        Doc::parse("---\ntitle: On boxes\ndate: 2026-07-28\ntags: writing\n---\n\nBody **here**. Two.", "on-boxes")
    }

    #[test]
    fn standard_site_link_tags_appear_only_when_there_is_a_record_to_point_at() {
        // Configured: both tags.
        let with = post_page(&cfg(PUB), &doc(), &[], &Opts::default(), "/on-boxes/", DOC, None);
        assert!(with.contains(&format!(r#"<link rel="site.standard.publication" href="{PUB}">"#)), "{with}");
        assert!(with.contains(&format!(r#"<link rel="site.standard.document" href="{DOC}">"#)));

        // Unconfigured: neither — an empty href would tell an indexer a record
        // exists at "".
        let without = post_page(&cfg(""), &doc(), &[], &Opts::default(), "/on-boxes/", "", None);
        assert!(!without.contains("rel=\"site.standard."), "{without}");
    }

    #[test]
    fn og_image_is_absolute_and_dimensioned() {
        // Bluesky, Mastodon and Slack all need an absolute URL plus width/height,
        // or the card renders small or not at all.
        let h = post_page(&cfg(PUB), &doc(), &[], &Opts::default(), "/on-boxes/", DOC, None);
        assert!(h.contains(r#"content="https://rant.mino.mobi/og/on-boxes/card.png""#), "{h}");
        assert!(h.contains(r#"og:image:width" content="1200"#));
        assert!(h.contains(r#"og:image:height" content="630"#));
        assert!(h.contains(r#"twitter:card" content="summary_large_image"#));
    }

    /// The page legitimately contains exactly one `<script>`: the module tag in
    /// the footer. Anything else is an injection, so assert on the count rather
    /// than on absence — the naive `!contains("<script")` matches our own tag and
    /// passes for the wrong reason.
    fn script_tags(html: &str) -> usize {
        html.matches("<script").count()
    }

    #[test]
    fn hostile_configuration_cannot_inject_markup() {
        // `vars` are trusted-ish, but a publication name reaches <title>, og:*
        // and the header, and a document URI from someone else's repo reaches an
        // href on every post page.
        //
        // The invariant is that a payload never appears VERBATIM. Structural
        // greps like `!contains("</title><")` are useless here: the real head is
        // `</title><meta …>`, so they fail on a correctly-escaped page.
        const NAME_PAYLOAD: &str = "</title><img onerror=x>";
        const URI_PAYLOAD: &str = "\"><script>alert(1)</script>";
        const DOC_PAYLOAD: &str = "\" onload=\"y";

        let mut c = cfg(URI_PAYLOAD);
        c.name = NAME_PAYLOAD.into();
        let h = post_page(&c, &doc(), &[], &Opts::default(), "/x/", DOC_PAYLOAD, None);

        for payload in [NAME_PAYLOAD, URI_PAYLOAD, DOC_PAYLOAD] {
            assert!(!h.contains(payload), "{payload:?} reached the page unescaped:\n{h}");
        }
        assert_eq!(script_tags(&h), 1, "injected a script tag: {h}");
        assert!(!h.contains("<img"), "injected an img tag: {h}");
        // …and the payloads survive, escaped, rather than being silently dropped.
        assert!(h.contains("&lt;script&gt;alert(1)"), "{h}");
        assert!(h.contains("&lt;img onerror=x&gt;"), "{h}");
        assert!(h.contains("&quot; onload=&quot;y"), "{h}");
    }

    #[test]
    fn a_hostile_post_title_is_escaped_in_the_body_and_the_head() {
        const PAYLOAD: &str = "</h1><script>x</script>";
        let d = Doc::parse(
            "---\ntitle: \"</h1><script>x</script>\"\ndate: 2026-01-01\n---\nbody",
            "s",
        );
        assert_eq!(d.title, PAYLOAD, "the parser must not have mangled the payload");

        let h = post_page(&cfg(PUB), &d, &[], &Opts::default(), "/s/", DOC, None);
        assert!(!h.contains(PAYLOAD), "verbatim payload on the page:\n{h}");
        assert!(!h.contains("<script>x</script>"), "{h}");
        assert_eq!(script_tags(&h), 1, "{h}");
        assert!(h.contains("&lt;/h1&gt;&lt;script&gt;x&lt;/script&gt;"), "{h}");
    }

    #[test]
    fn the_setup_link_appears_only_while_unconfigured() {
        assert!(header(&cfg("")).contains(r#"href="/setup/""#));
        assert!(!header(&cfg(PUB)).contains(r#"href="/setup/""#),
            "a permanent setup tab on a live blog reads as something being broken");
    }

    #[test]
    fn the_view_switcher_marks_the_active_view_and_links_the_rest() {
        let s = view_switcher("/on-boxes/", &[Predicate::Skeleton]);
        assert!(s.contains(r#"class="view-link on" href="/on-boxes/?view=skeleton""#), "{s}");
        assert!(s.contains(r#"aria-current="page""#));
        // `plain` links to the bare path, not `?view=plain`.
        assert!(s.contains(r#"href="/on-boxes/""#));
        // Every predicate is offered.
        for p in Predicate::ALL {
            assert!(s.contains(p.id()), "{} missing from the switcher", p.id());
        }
    }

    #[test]
    fn the_switcher_shows_a_composed_chain() {
        let s = view_switcher("/x/", &[Predicate::Skeleton, Predicate::Bionic]);
        assert!(s.contains("skeleton+bionic"), "{s}");
        // With a chain active, no single view is marked current.
        assert!(!s.contains(r#"aria-current"#), "{s}");
    }

    #[test]
    fn timed_views_ship_their_controls_and_dwells() {
        let h = post_page(&cfg(PUB), &doc(), &[Predicate::Rsvp], &Opts { wpm: 500, ..Opts::default() }, "/x/", DOC, None);
        assert!(h.contains(r#"data-wpm="500""#), "{h}");
        assert!(h.contains("data-ms="), "frames must carry the server's dwell");
        assert!(h.contains(r#"class="timed""#));
        // Untimed views must not.
        let plain = post_page(&cfg(PUB), &doc(), &[], &Opts::default(), "/x/", DOC, None);
        assert!(!plain.contains(r#"class="timed""#));
    }

    #[test]
    fn the_setup_page_previews_the_exact_record_and_carries_it_on_the_button() {
        let c = cfg("");
        let s = setup_page(&c);
        // The preview is the record.
        let expected = rant_core::standard::publication_for(&c.site_url, &c.name, &c.description, &c.accent);
        let json = serde_json::to_string_pretty(&expected).unwrap();
        for line in json.lines().filter(|l| l.contains(':')) {
            let needle = esc(line.trim());
            assert!(s.contains(&needle), "preview is missing {needle:?}");
        }
        // The browser reads the identity off the button, so it must be there.
        for attr in ["data-url", "data-name", "data-desc", "data-accent"] {
            assert!(s.contains(attr), "{attr} missing from the claim button");
        }
        assert!(s.contains("noindex"), "setup is not a public page");
    }

    /// What the page promises about the *next* step has to match what the
    /// worker actually does, in both configurations. Promising "then nothing"
    /// on a deployment that cannot resolve a publication is the exact failure
    /// this page is being rewritten to stop causing.
    #[test]
    fn the_setup_page_promises_only_what_the_worker_can_deliver() {
        // With a DID, `needs_publication_uri` + `publication_for_site` finish
        // the job, so there is nothing left to hand back.
        let auto = setup_page(&cfg(""));
        assert!(auto.contains("Then nothing"), "a DID is configured; nothing else is needed");
        assert!(auto.contains("did:plc:x"), "say which repo it looks in");
        assert!(!auto.contains("PUBLICATION_URI"), "there is no URI to paste any more");

        // Without one, the manual step is real and must still be stated.
        let mut c = cfg("");
        c.did = String::new();
        let manual = setup_page(&c);
        assert!(manual.contains("PUBLICATION_DID"), "name the var that is missing");
        assert!(!manual.contains("Then nothing"), "must not promise it is automatic");
    }

    /// The complaint that prompted the rewrite was "it's still very unclear
    /// what the setup action is" — from someone who had already published a
    /// post and needed none of this.
    #[test]
    fn the_setup_page_says_up_front_that_it_is_optional() {
        for state in ["", PUB] {
            let s = setup_page(&cfg(state));
            let intro = &s[..s.find("What the button writes").unwrap()];
            assert!(
                intro.contains("do not need this page to post"),
                "the optionality has to come before the button, not after it"
            );
        }
    }

    /// Share must survive everything else on the page failing: no session, no
    /// wasm, no JavaScript at all. That is only true if it is an `<a href>`
    /// rendered by the worker, so assert the shape and not just the presence.
    #[test]
    fn sharing_works_with_no_javascript_at_all() {
        let s = post_page(&cfg(PUB), &doc(), &[Predicate::Plain], &Opts::default(), "/hello/", DOC, None);

        let tag = share_tag(&s);
        assert!(tag.starts_with("<a "), "share must be a link, not a button: {tag}");
        assert!(tag.contains("href="), "a share link with no href is furniture: {tag}");
        assert!(!tag.contains("disabled"), "share needs no session: {tag}");

        // The URL Bluesky is handed has to be absolute — it fetches the card
        // from it — and it has to be *this* page, not the site root.
        let href = href_of(&tag);
        let expected = rant_core::share::bsky_compose(&doc().title, "https://rant.mino.mobi/hello/");
        assert_eq!(esc(&expected), href);
        assert!(href.contains("rant.mino.mobi%2Fhello%2F"), "{href}");
    }

    /// A post read out of somebody else's repo shares *their* page, not ours.
    #[test]
    fn sharing_a_read_page_points_at_that_page() {
        let s = post_page(
            &cfg(PUB),
            &doc(),
            &[Predicate::Plain],
            &Opts::default(),
            "/read/alice.bsky.social/a-post/",
            DOC,
            Some("alice.bsky.social"),
        );
        let href = href_of(&share_tag(&s));
        assert!(
            href.contains("%2Fread%2Falice.bsky.social%2Fa-post%2F"),
            "share link does not point at the page being read: {href}"
        );
    }

    /// The whole `<a …>` opening tag carrying `btn share`.
    fn share_tag(s: &str) -> String {
        let i = s.find("btn share").expect("no share control on the page");
        let start = s[..i].rfind('<').unwrap();
        let end = start + s[start..].find('>').unwrap();
        s[start..=end].to_string()
    }

    fn href_of(tag: &str) -> String {
        tag.split("href=\"").nth(1).unwrap().split('"').next().unwrap().to_string()
    }

    #[test]
    fn the_setup_page_says_which_state_it_is_in() {
        assert!(setup_page(&cfg("")).contains("No publication record is linked"));
        let done = setup_page(&cfg(PUB));
        assert!(done.contains(PUB));
        assert!(done.contains("linked to a publication record"));
    }

    #[test]
    fn the_composer_offers_every_formatting_action_and_starter() {
        let s = compose_page(&cfg(PUB));
        // Both toolbars are rendered from rant-core's registries, so adding an
        // action or a template needs no HTML edit — and this test proves the
        // page and the registry cannot drift.
        for a in rant_core::edit::Action::ALL {
            assert!(s.contains(&format!(r#"data-fmt="{}""#, a.id())), "{} missing", a.id());
        }
        for t in rant_core::templates::ALL {
            assert!(s.contains(&format!(r#"data-template="{}""#, t.id)), "{} missing", t.id);
        }
        assert!(s.contains(r#"role="toolbar""#));
        assert!(s.contains("or just type"), "the starters must not read as compulsory");
    }

    #[test]
    fn toolbar_labels_and_tooltips_are_escaped() {
        let s = compose_page(&cfg(PUB));
        // Labels include `<>` for code, which must not become a tag.
        assert!(!s.contains("<button class=\"tb\" type=\"button\" data-fmt=\"code\" title=\"Code (Ctrl/⌘+E)\" aria-label=\"Code (Ctrl/⌘+E)\"><></button>"),
            "the code label must be escaped");
        assert!(s.contains("&lt;&gt;"), "{s}");
    }

    #[test]
    fn the_management_page_is_a_shell_and_says_so() {
        let s = mine_page(&cfg(PUB));
        assert!(s.contains(r#"id="mine""#), "the browser fills this: {s}");
        assert!(s.contains("noindex"), "your records are not a public page");
        // It must not pretend to know anything about you.
        assert!(s.contains("signing in"), "should explain why it cannot render server-side");
        assert!(s.contains("delete"), "the point of the page");
    }

    #[test]
    fn management_is_always_reachable_unlike_setup() {
        // `/mine/` is not a bootstrap — you need it for as long as you have
        // records, so it stays in the nav in both configuration states.
        for c in [cfg(""), cfg(PUB)] {
            assert!(header(&c).contains(r#"href="/mine/""#), "yours link missing");
        }
    }

    #[test]
    fn every_page_closes_its_html() {
        let pages = [
            post_page(&cfg(PUB), &doc(), &[], &Opts::default(), "/x/", DOC, Some("alice.test")),
            index_page(&cfg(PUB), None, &[], "t", "d"),
            setup_page(&cfg("")),
            mine_page(&cfg(PUB)),
            compose_page(&cfg(PUB)),
            error_page(&cfg(PUB), 404, "No such post."),
        ];
        for p in pages {
            assert!(p.starts_with("<!doctype html>"), "{}", &p[..40.min(p.len())]);
            assert!(p.ends_with("</body></html>"), "unclosed: {}", &p[p.len().saturating_sub(40)..]);
            assert_eq!(p.matches("<html").count(), 1);
            assert_eq!(p.matches("</body>").count(), 1);
        }
    }

    #[test]
    fn the_byline_appears_only_for_someone_elses_document() {
        // Scoped to the meta line: the footer says "rendered by a Rust worker",
        // so a bare search for " by " passes for the wrong reason.
        let meta_of = |h: &str| {
            h.split(r#"<p class="meta">"#).nth(1).unwrap().split("</p>").next().unwrap().to_string()
        };
        let mine = meta_of(&post_page(&cfg(PUB), &doc(), &[], &Opts::default(), "/x/", DOC, None));
        assert!(!mine.contains(" by "), "house posts need no byline: {mine}");
        assert!(mine.contains("words"), "{mine}");

        let theirs = meta_of(&post_page(
            &cfg(PUB), &doc(), &[], &Opts::default(), "/read/a/1/", DOC, Some("alice.test"),
        ));
        assert!(theirs.contains("· by alice.test"), "{theirs}");
    }
}
