pub mod dataview;
pub mod embeds;
pub mod kanban;
pub mod template;
pub mod wikilink;

use serde::{Deserialize, Serialize};

/// Plugin configuration — which plugins are active
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PluginConfig {
    pub kanban: bool,
    pub dataview: bool,
    pub embeds: bool,
}

/// Trait for Wave markdown plugins
pub trait WavePlugin {
    /// Process a fenced code block. Returns Some(html) if this plugin handles
    /// the given info string, None otherwise.
    fn process_code_block(&self, info: &str, code: &str) -> Option<String>;
}
