//! The JSON surface: `/api/*` and `/mcp`.
//!
//! Two audiences, one implementation. The `/api/*` routes are what a sibling
//! `mino.mobi` site calls when it wants the Rust engine over HTTP; `/mcp` is
//! the same seven operations wrapped in JSON-RPC so a model can call them as
//! tools. `dispatch` below is the single place either lands, so the MCP tools
//! and the REST endpoints cannot drift apart.

use rant_core::{
    agent,
    predicates::{apply_chain, cells_to_plain, parse_chain, Opts, Predicate},
    render_body, standard, text, Doc,
};
use serde_json::{json, Value};

use crate::config::Config;

/// Arguments, however they arrived: a query string or an MCP `arguments` object.
pub struct Args(pub Value);

impl Args {
    pub fn str(&self, k: &str) -> Option<&str> {
        self.0.get(k).and_then(|v| v.as_str())
    }
    pub fn u32(&self, k: &str) -> Option<u32> {
        self.0.get(k).and_then(|v| v.as_u64()).map(|n| n as u32)
    }
    pub fn opts(&self) -> Opts {
        Opts {
            wpm: self.u32("wpm").unwrap_or(350).clamp(60, 1200),
            min_chars: self.u32("min_chars").unwrap_or(0) as usize,
            round: self.u32("round").unwrap_or(1).min(5) as u8,
        }
    }
}

/// Run one named operation. Returns the JSON result, or an error message.
///
/// The two operations that need the network (`read_publication`, and
/// `list_posts` once a PDS-backed publication exists) are handled by the
/// caller; everything here is pure and synchronous, which is why it can be
/// tested without a runtime.
pub fn dispatch(cfg: &Config, name: &str, args: &Args) -> Result<Value, String> {
    match name {
        "list_predicates" => Ok(predicates_json()),

        "render_markdown" => {
            let md = args.str("markdown").ok_or("markdown is required")?;
            Ok(json!({
                "html": rant_core::markdown::render(md),
                "text": text::strip_markdown(md),
                "words": text::word_count(md),
            }))
        }

        "apply_predicate" => {
            let body = args.str("text").ok_or("text is required")?;
            let view = args.str("view").ok_or("view is required")?;
            let chain = parse_chain(view);
            if chain.is_empty() {
                return Err(format!("no known predicate in {view:?}; see list_predicates"));
            }
            let o = args.opts();
            let cells = apply_chain(&chain, &text::tokenize(body), &o);
            Ok(json!({
                "view": chain.iter().map(|p| p.id()).collect::<Vec<_>>(),
                "text": cells_to_plain(&cells),
                "html": rant_core::predicates::cells_to_html(*chain.last().unwrap(), &cells),
                "cells": cells.len(),
                "timed": chain.last().unwrap().is_timed(),
            }))
        }

        "draft_post" => {
            let body = args.str("text").ok_or("text is required")?;
            let mut doc = Doc::parse(body, "");
            if let Some(t) = args.str("title") {
                doc.title = t.to_string();
                doc.slug = rant_core::slug::slugify(t);
            }
            if let Some(tags) = self_tags(&args.0) {
                doc.tags = tags;
            }
            // No clock in this crate and none in a pure dispatch: an undated
            // draft stays undated rather than being stamped with a lie.
            let record = standard::Document::from_doc(&doc, cfg.site_ref(), &doc.published.clone());
            let meta = format!("{} words · {} min", doc.word_count(), doc.reading_minutes());
            Ok(json!({
                "record": record,
                "collection": standard::NSID_DOCUMENT,
                "rkey_hint": doc.slug,
                "url_if_published": cfg.url_for(&doc.path()),
                "card_svg": rant_core::card::svg(
                    &rant_core::card::Card {
                        title: &doc.title,
                        kicker: &cfg.name,
                        domain: cfg.site_url.trim_start_matches("https://"),
                        dek: doc.description.as_deref().unwrap_or(""),
                        meta: &meta,
                        body: doc.body,
                    },
                    &rant_core::card::Palette { accent: cfg.accent.clone(), ..Default::default() },
                ),
                "note": "Not published. Writing this record needs the author's OAuth session in a browser.",
            }))
        }

        _ => Err(format!("unknown operation {name:?}")),
    }
}

fn self_tags(v: &Value) -> Option<Vec<String>> {
    Some(
        v.get("tags")?
            .as_array()?
            .iter()
            .filter_map(|t| t.as_str())
            .map(|t| t.trim_start_matches('#').to_string())
            .filter(|t| !t.is_empty())
            .take(10)
            .collect(),
    )
}

pub fn predicates_json() -> Value {
    json!({
        "predicates": Predicate::ALL.iter().map(|p| json!({
            "id": p.id(),
            "description": p.blurb(),
            "timed": p.is_timed(),
        })).collect::<Vec<_>>(),
        "compose": "Join with '+' — e.g. ?view=skeleton+bionic. Up to four stages.",
    })
}

/// One post, as JSON, in whatever view was asked for.
pub fn post_json(cfg: &Config, doc: &Doc<'_>, at_uri: &str, chain: &[Predicate], o: &Opts) -> Value {
    let r = render_body(doc.body, chain, o);
    json!({
        "title": doc.title,
        "slug": doc.slug,
        "path": doc.path(),
        "url": cfg.url_for(&doc.path()),
        "published": doc.published,
        "updated": doc.updated,
        "description": doc.description,
        "tags": doc.tags,
        "words": r.words,
        "minutes": r.minutes,
        "at_uri": at_uri,
        "view": chain.iter().map(|p| p.id()).collect::<Vec<_>>(),
        "markdown": doc.body,
        "text": r.plain,
        "html": r.html,
        "record": standard::Document::from_doc(doc, cfg.site_ref(), &doc.published),
    })
}

// ─────────────────────────────────────────────────────────────────────── mcp ──

/// A JSON-RPC 2.0 response envelope.
pub fn rpc_ok(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn rpc_err(id: Value, code: i32, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// Wrap a result as MCP tool content.
pub fn tool_result(v: &Value) -> Value {
    json!({
        "content": [{ "type": "text", "text": serde_json::to_string_pretty(v).unwrap_or_default() }],
        "isError": false,
    })
}

pub fn tool_error(message: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": message }], "isError": true })
}

/// Handle an MCP request that needs no network. Returns `None` for the two
/// methods the router has to service itself because they hit a PDS.
pub fn mcp_local(cfg: &Config, method: &str, params: &Value, id: Value) -> Option<Value> {
    match method {
        "initialize" => Some(rpc_ok(id, agent::initialize(&cfg.site_url))),
        "notifications/initialized" | "ping" => Some(rpc_ok(id, json!({}))),
        "tools/list" => Some(rpc_ok(id, agent::tools_list())),
        "tools/call" => {
            let name = params.get("name").and_then(|n| n.as_str()).unwrap_or_default();
            if matches!(name, "list_posts" | "read_post" | "read_publication") {
                return None; // needs the router
            }
            let args = Args(params.get("arguments").cloned().unwrap_or_else(|| json!({})));
            Some(match dispatch(cfg, name, &args) {
                Ok(v) => rpc_ok(id, tool_result(&v)),
                Err(e) => rpc_ok(id, tool_error(&e)),
            })
        }
        _ => Some(rpc_err(id, -32601, &format!("method not found: {method}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> Config {
        Config {
            site_url: "https://rant.mino.mobi".into(),
            name: "Rant".into(),
            description: "d".into(),
            publication_uri: "at://did:plc:x/site.standard.publication/self".into(),
            did: "did:plc:x".into(),
            auth_url: "https://auth.mino.mobi".into(),
            appview: "https://public.api.bsky.app".into(),
            accent: "#e4b363".into(),
        }
    }

    #[test]
    fn every_pure_tool_in_the_manifest_dispatches() {
        // The manifest and the dispatcher must not drift: each tool is either
        // handled here or explicitly routed by the worker.
        const ROUTED: [&str; 3] = ["list_posts", "read_post", "read_publication"];
        for t in agent::TOOLS {
            if ROUTED.contains(&t.name) {
                continue;
            }
            let args = Args(json!({ "text": "a b c", "markdown": "# x", "view": "skeleton" }));
            assert!(dispatch(&cfg(), t.name, &args).is_ok(), "{} did not dispatch", t.name);
        }
    }

    #[test]
    fn unknown_operations_are_errors_not_panics() {
        assert!(dispatch(&cfg(), "rm_rf", &Args(json!({}))).is_err());
    }

    #[test]
    fn missing_required_arguments_are_reported() {
        assert!(dispatch(&cfg(), "render_markdown", &Args(json!({}))).is_err());
        assert!(dispatch(&cfg(), "apply_predicate", &Args(json!({ "text": "x" }))).is_err());
    }

    #[test]
    fn apply_predicate_rejects_a_chain_with_no_known_stage() {
        let e = dispatch(&cfg(), "apply_predicate", &Args(json!({ "text": "a", "view": "wat" }))).unwrap_err();
        assert!(e.contains("list_predicates"), "{e}");
    }

    #[test]
    fn draft_post_returns_a_record_but_does_not_claim_to_publish() {
        let v = dispatch(
            &cfg(),
            "draft_post",
            &Args(json!({ "text": "# Hi\n\nbody", "tags": ["a", "#b"] })),
        )
        .unwrap();
        assert_eq!(v["record"]["$type"], standard::NSID_DOCUMENT);
        assert_eq!(v["record"]["tags"], json!(["a", "b"]));
        assert_eq!(v["rkey_hint"], "hi");
        assert!(v["card_svg"].as_str().unwrap().starts_with("<svg"));
        assert!(v["note"].as_str().unwrap().contains("OAuth"));
    }

    #[test]
    fn predicate_registry_matches_the_core_enum() {
        let v = predicates_json();
        assert_eq!(v["predicates"].as_array().unwrap().len(), Predicate::ALL.len());
    }

    #[test]
    fn mcp_handshake_and_tool_call() {
        let init = mcp_local(&cfg(), "initialize", &json!({}), json!(1)).unwrap();
        assert!(init["result"]["protocolVersion"].is_string());

        let list = mcp_local(&cfg(), "tools/list", &json!({}), json!(2)).unwrap();
        assert_eq!(list["result"]["tools"].as_array().unwrap().len(), agent::TOOLS.len());

        let call = mcp_local(
            &cfg(),
            "tools/call",
            &json!({ "name": "apply_predicate", "arguments": { "text": "The cat sat.", "view": "skeleton" } }),
            json!(3),
        )
        .unwrap();
        let body = call["result"]["content"][0]["text"].as_str().unwrap();
        assert!(body.contains("cat"), "{body}");
        assert!(!body.contains("\"The\""), "{body}");
        assert_eq!(call["result"]["isError"], false);
    }

    #[test]
    fn mcp_defers_the_network_tools_to_the_router() {
        for n in ["list_posts", "read_post", "read_publication"] {
            assert!(
                mcp_local(&cfg(), "tools/call", &json!({ "name": n, "arguments": {} }), json!(1)).is_none(),
                "{n} should be routed"
            );
        }
    }

    #[test]
    fn unknown_mcp_methods_return_jsonrpc_errors() {
        let v = mcp_local(&cfg(), "tools/destroy", &json!({}), json!(9)).unwrap();
        assert_eq!(v["error"]["code"], -32601);
        assert_eq!(v["id"], 9);
    }

    #[test]
    fn a_failing_tool_call_is_a_tool_error_not_a_protocol_error() {
        // MCP distinguishes the two, and clients treat them very differently.
        let v = mcp_local(&cfg(), "tools/call", &json!({ "name": "render_markdown", "arguments": {} }), json!(4)).unwrap();
        assert!(v["error"].is_null(), "{v}");
        assert_eq!(v["result"]["isError"], true);
    }

    #[test]
    fn wpm_is_clamped_to_something_a_human_can_use() {
        assert_eq!(Args(json!({ "wpm": 99999 })).opts().wpm, 1200);
        assert_eq!(Args(json!({ "wpm": 1 })).opts().wpm, 60);
        assert_eq!(Args(json!({})).opts().wpm, 350);
        assert_eq!(Args(json!({ "round": 99 })).opts().round, 5);
    }
}
