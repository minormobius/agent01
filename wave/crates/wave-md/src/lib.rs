use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

mod plugins;
mod render;

pub use plugins::{PluginConfig, WavePlugin};
pub use render::render_markdown;

/// Title index entry for wikilink resolution
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TitleEntry {
    pub rkey: String,
    pub title: String,
}

/// Render config passed from JS
#[derive(Serialize, Deserialize, Debug)]
pub struct RenderConfig {
    /// Available page titles for wikilink resolution
    #[serde(default)]
    pub title_index: Vec<TitleEntry>,
    /// Enable kanban plugin
    #[serde(default = "default_true")]
    pub kanban: bool,
    /// Enable dataview plugin
    #[serde(default = "default_true")]
    pub dataview: bool,
    /// Enable embed plugin (images, iframes)
    #[serde(default = "default_true")]
    pub embeds: bool,
    /// Template variables to expand
    #[serde(default)]
    pub template_vars: Vec<TemplateVar>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TemplateVar {
    pub key: String,
    pub value: String,
}

fn default_true() -> bool {
    true
}

impl Default for RenderConfig {
    fn default() -> Self {
        Self {
            title_index: vec![],
            kanban: true,
            dataview: true,
            embeds: true,
            template_vars: vec![],
        }
    }
}

/// Main WASM entry point: render markdown to HTML
#[wasm_bindgen(js_name = renderMarkdown)]
pub fn render_markdown_wasm(markdown: &str, config_json: &str) -> Result<String, JsValue> {
    let config: RenderConfig = serde_json::from_str(config_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid config: {}", e)))?;
    Ok(render::render_markdown(markdown, &config))
}

/// Parse wikilinks from markdown text, returns JSON array of link targets
#[wasm_bindgen(js_name = parseWikilinks)]
pub fn parse_wikilinks_wasm(markdown: &str) -> String {
    let links = plugins::wikilink::extract_wikilinks(markdown);
    serde_json::to_string(&links).unwrap_or_else(|_| "[]".to_string())
}

/// Expand template variables in text
#[wasm_bindgen(js_name = expandTemplate)]
pub fn expand_template_wasm(template: &str, vars_json: &str) -> Result<String, JsValue> {
    let vars: Vec<TemplateVar> = serde_json::from_str(vars_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid vars: {}", e)))?;
    Ok(plugins::template::expand_template(template, &vars))
}
