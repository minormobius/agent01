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
    format!(
        r#"<header class="site"><a class="brand" href="/">{}</a>
<nav>
  <a href="/archive/">archive</a>
  <a href="/read/">read anyone</a>
  <a href="/compose/">compose</a>
  <a href="/feed.xml">rss</a>
</nav>
<div class="acct" id="acct" data-auth="{}" data-pub="{}"><a class="btn" href="/compose/">sign in</a></div>
</header>"#,
        esc(&cfg.name),
        esc(&cfg.auth_url),
        esc(&cfg.publication_uri),
    )
}

pub fn footer(cfg: &Config) -> String {
    format!(
        r#"<footer class="site">
<p>{} · <a href="/feed.xml">rss</a> · <a href="/feed.json">json feed</a> · <a href="/llms.txt">llms.txt</a> · <a href="/mcp">mcp</a></p>
<p class="fine">Posts are <a href="https://standard.site">standard.site</a> records in their authors' own ATProto repos. This page was rendered by a Rust worker at the edge.</p>
</footer>
<script type="module" src="/pkg/rant_view.js"></script>
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
    s.push_str(&actions(cfg, document_uri));
    s.push_str("</main>");
    s.push_str(&footer(cfg));
    s
}

/// Recommend + subscribe, and the record this page corresponds to.
fn actions(cfg: &Config, document_uri: &str) -> String {
    let mut s = String::from(r#"<aside class="actions">"#);
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
    s.push_str(
        r#"<p class="fine">Subscribing writes a <code>site.standard.graph.subscription</code> record to <em>your</em> repo. Nothing is stored here.</p>"#,
    );
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
<nav class="views compose-views" aria-label="Preview view">{views}</nav>
<div class="compose-grid">
  <div>
    <label class="fine" for="editor">Markdown</label>
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
