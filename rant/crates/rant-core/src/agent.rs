//! The agent-facing surface.
//!
//! Rant is a text engine with a URL, which makes it a natural tool for a model
//! to call. This module defines that contract in one place so the MCP manifest,
//! the `/.well-known/rant-agent` descriptor and the docs are generated from the
//! same list and cannot disagree.
//!
//! **The boundary is deliberate.** Every tool here is read-or-transform.
//! Publishing is not a tool, and never will be: a `site.standard.document` is
//! written to a *person's* repo with *their* OAuth grant, and the only thing
//! holding that grant is their browser. An agent can draft, render, critique
//! and index; a human hits Post. `draft_post` returns the exact record that
//! *would* be written, which is the useful part anyway — it can be reviewed.

use serde_json::{json, Value};

/// One callable tool.
pub struct Tool {
    pub name: &'static str,
    pub description: &'static str,
    /// JSON Schema for the arguments.
    pub schema: fn() -> Value,
}

pub const TOOLS: &[Tool] = &[
    Tool {
        name: "list_posts",
        description: "List the publication's posts: title, path, url, published date, tags, \
                      word count, and the at:// record URI when the post is in a repo.",
        schema: || json!({
            "type": "object",
            "properties": {
                "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 },
                "tag": { "type": "string", "description": "Only posts carrying this tag." }
            }
        }),
    },
    Tool {
        name: "read_post",
        description: "Fetch one post by slug. Returns the raw markdown, the plaintext, the \
                      rendered HTML, and the standard.site document record.",
        schema: || json!({
            "type": "object",
            "required": ["slug"],
            "properties": {
                "slug": { "type": "string" },
                "view": {
                    "type": "string",
                    "description": "Optional predicate chain, e.g. 'skeleton' or 'skeleton+bionic'. \
                                    Call list_predicates for the registry."
                }
            }
        }),
    },
    Tool {
        name: "list_predicates",
        description: "The registry of predicates — the alternate renderings a post can be read \
                      through. Each has an id, a one-line description, and whether it is timed.",
        schema: || json!({ "type": "object", "properties": {} }),
    },
    Tool {
        name: "list_templates",
        description: "The composer's starter templates — the shapes a post can take (rant, note, \
                      review, log, letter, against). Each has an id, a one-line description and a \
                      body you can pass to draft_post.",
        schema: || json!({ "type": "object", "properties": {} }),
    },
    Tool {
        name: "apply_predicate",
        description: "Run a predicate chain over arbitrary text and return the transformed text. \
                      Works on any prose, not only on posts — 'skeleton' over a draft is a \
                      genuinely useful editing pass.",
        schema: || json!({
            "type": "object",
            "required": ["text", "view"],
            "properties": {
                "text": { "type": "string" },
                "view": { "type": "string", "description": "Predicate id, or a '+'-joined chain." },
                "wpm": { "type": "integer", "description": "For timed views.", "default": 350 },
                "round": { "type": "integer", "minimum": 0, "maximum": 5, "description": "For 'memorize'." }
            }
        }),
    },
    Tool {
        name: "render_markdown",
        description: "Render GFM markdown to sanitised HTML with the same engine the site uses. \
                      Raw HTML is dropped and link schemes are filtered.",
        schema: || json!({
            "type": "object",
            "required": ["markdown"],
            "properties": { "markdown": { "type": "string" } }
        }),
    },
    Tool {
        name: "draft_post",
        description: "Build the exact site.standard.document record that publishing this text \
                      would write, without writing it. Returns the record, the derived slug and \
                      path, the plaintext, and the link-card SVG. Publishing itself requires the \
                      author's own OAuth session in a browser — there is no agent write path.",
        schema: || json!({
            "type": "object",
            "required": ["text"],
            "properties": {
                "text": { "type": "string", "description": "Markdown, with optional --- frontmatter." },
                "title": { "type": "string", "description": "Overrides the frontmatter/heading title." },
                "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 10 }
            }
        }),
    },
    Tool {
        name: "read_publication",
        description: "Read ANY standard.site publication by handle or DID, not just this one, \
                      and render its documents through the same predicates. This is the point of \
                      a shared lexicon: the reader is not coupled to the publisher.",
        schema: || json!({
            "type": "object",
            "required": ["actor"],
            "properties": {
                "actor": { "type": "string", "description": "Handle (alice.bsky.social) or DID." },
                "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 25 }
            }
        }),
    },
];

/// The MCP `tools/list` payload.
pub fn tools_list() -> Value {
    json!({
        "tools": TOOLS.iter().map(|t| json!({
            "name": t.name,
            "description": t.description,
            "inputSchema": (t.schema)(),
        })).collect::<Vec<_>>()
    })
}

/// The MCP `initialize` result.
pub fn initialize(site_url: &str) -> Value {
    json!({
        "protocolVersion": "2024-11-05",
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": { "name": "rant", "version": env!("CARGO_PKG_VERSION"), "url": site_url },
        "instructions": "A standard.site publication engine. Read posts, transform prose through \
                         predicates, and draft records. Writing to a repo requires the author's \
                         browser session; draft_post returns what would be written."
    })
}

/// The `/.well-known/rant-agent` descriptor: everything an agent needs to use
/// this site without a crawl — the endpoints, the tools, and the honest note
/// about what it cannot do.
pub fn descriptor(site_url: &str) -> Value {
    json!({
        "name": "rant",
        "version": env!("CARGO_PKG_VERSION"),
        "url": site_url,
        "protocol": "site.standard",
        "lexicons": crate::standard::WRITE_COLLECTIONS,
        "endpoints": {
            "mcp": format!("{site_url}/mcp"),
            "index": format!("{site_url}/llms.txt"),
            "full_text": format!("{site_url}/llms-full.txt"),
            "posts": format!("{site_url}/api/posts"),
            "post": format!("{site_url}/api/post/{{slug}}"),
            "predicates": format!("{site_url}/api/predicates"),
            "render": format!("{site_url}/api/render"),
            "rss": format!("{site_url}/feed.xml"),
            "json_feed": format!("{site_url}/feed.json"),
            "publication_record": format!("{site_url}/.well-known/site.standard.publication")
        },
        "writes": {
            "supported": false,
            "reason": "Documents are written to the author's own ATProto repo under their OAuth \
                       grant, which only their browser holds. Use draft_post and hand the record \
                       to a human."
        },
        "tools": TOOLS.iter().map(|t| t.name).collect::<Vec<_>>()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_names_are_unique_and_schemas_are_objects() {
        let mut seen = std::collections::BTreeSet::new();
        for t in TOOLS {
            assert!(seen.insert(t.name), "duplicate tool {}", t.name);
            assert!(!t.description.is_empty());
            let s = (t.schema)();
            assert_eq!(s["type"], "object", "{} schema must be an object", t.name);
            // Every `required` entry must actually be declared.
            if let Some(req) = s["required"].as_array() {
                for r in req {
                    let k = r.as_str().unwrap();
                    assert!(s["properties"].get(k).is_some(), "{}: required {k} not declared", t.name);
                }
            }
        }
    }

    #[test]
    fn tools_list_is_mcp_shaped() {
        let v = tools_list();
        let tools = v["tools"].as_array().unwrap();
        assert_eq!(tools.len(), TOOLS.len());
        for t in tools {
            assert!(t["name"].is_string());
            assert!(t["inputSchema"].is_object());
        }
    }

    #[test]
    fn there_is_no_write_tool() {
        // The boundary is the design. If a future edit adds a publishing tool,
        // this test should be the thing that makes someone justify it.
        for t in TOOLS {
            assert!(
                !["publish", "post", "create_post", "write_post", "publish_post"].contains(&t.name),
                "{} would let an agent write to somebody's repo",
                t.name
            );
        }
        assert_eq!(descriptor("https://x.test")["writes"]["supported"], false);
    }

    #[test]
    fn descriptor_advertises_every_lexicon_we_write() {
        let d = descriptor("https://rant.mino.mobi");
        let lex = d["lexicons"].as_array().unwrap();
        assert_eq!(lex.len(), crate::standard::WRITE_COLLECTIONS.len());
        assert!(d["endpoints"]["mcp"].as_str().unwrap().ends_with("/mcp"));
    }

    #[test]
    fn initialize_declares_a_protocol_version() {
        let v = initialize("https://x.test");
        assert!(v["protocolVersion"].is_string());
        assert!(v["capabilities"]["tools"].is_object());
    }
}
