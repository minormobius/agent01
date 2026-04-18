use super::WavePlugin;

/// Dataview plugin — renders structured data queries inline.
///
/// Supports two modes:
///
/// 1. **Table mode** — renders a markdown-style table from key:value frontmatter
///    ```dataview
///    TABLE title, status, due
///    FROM [[Project Notes]]
///    SORT due ASC
///    ```
///    Since we don't have a full query engine, this renders as a styled placeholder
///    showing the query intent. The JS side can hydrate it with actual data.
///
/// 2. **Inline data** — renders structured key:value pairs as a definition list
///    ```data
///    status: active
///    priority: high
///    due: 2026-04-20
///    tags: rust, wasm, wave
///    ```
pub struct DataviewPlugin;

impl WavePlugin for DataviewPlugin {
    fn process_code_block(&self, info: &str, code: &str) -> Option<String> {
        match info.trim() {
            "dataview" => Some(render_dataview_query(code)),
            "data" => Some(render_inline_data(code)),
            _ => None,
        }
    }
}

/// Render a dataview query block as a styled query display.
/// The actual query execution happens on the JS side — this provides
/// the visual scaffold with data attributes for hydration.
fn render_dataview_query(code: &str) -> String {
    let mut query_type = "TABLE";
    let mut fields: Vec<String> = Vec::new();
    let mut source = String::new();
    let mut sort_field = String::new();
    let mut sort_dir = "ASC";

    for line in code.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let upper = trimmed.to_uppercase();
        if upper.starts_with("TABLE ") {
            query_type = "TABLE";
            fields = trimmed[6..]
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        } else if upper.starts_with("LIST") {
            query_type = "LIST";
            if trimmed.len() > 4 {
                fields = trimmed[4..]
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
        } else if upper.starts_with("FROM ") {
            source = trimmed[5..].trim().to_string();
        } else if upper.starts_with("SORT ") {
            let parts: Vec<&str> = trimmed[5..].trim().splitn(2, ' ').collect();
            if !parts.is_empty() {
                sort_field = parts[0].to_string();
                if parts.len() > 1 {
                    sort_dir = if parts[1].to_uppercase() == "DESC" {
                        "DESC"
                    } else {
                        "ASC"
                    };
                }
            }
        }
    }

    let fields_json = serde_json::to_string(&fields).unwrap_or_else(|_| "[]".to_string());

    let mut html = format!(
        "<div class=\"wave-dataview\" data-query-type=\"{}\" data-fields='{}' data-source=\"{}\"",
        html_escape(query_type),
        html_escape(&fields_json),
        html_escape(&source),
    );

    if !sort_field.is_empty() {
        html.push_str(&format!(
            " data-sort=\"{}\" data-sort-dir=\"{}\"",
            html_escape(&sort_field),
            sort_dir
        ));
    }

    html.push_str(">\n");

    // Render table header as scaffold
    if query_type == "TABLE" && !fields.is_empty() {
        html.push_str("  <table class=\"wave-dataview-table\">\n    <thead><tr>\n");
        for f in &fields {
            html.push_str(&format!(
                "      <th>{}</th>\n",
                html_escape(f)
            ));
        }
        html.push_str("    </tr></thead>\n    <tbody>\n");
        html.push_str("      <tr><td colspan=\"");
        html.push_str(&fields.len().to_string());
        html.push_str("\" class=\"wave-dataview-loading\">Loading...</td></tr>\n");
        html.push_str("    </tbody>\n  </table>\n");
    } else {
        html.push_str("  <div class=\"wave-dataview-loading\">Loading query results...</div>\n");
    }

    if !source.is_empty() {
        html.push_str(&format!(
            "  <div class=\"wave-dataview-source\">from {}</div>\n",
            html_escape(&source)
        ));
    }

    html.push_str("</div>\n");
    html
}

/// Render inline data (key: value pairs) as a styled definition list
fn render_inline_data(code: &str) -> String {
    let mut html = String::from("<dl class=\"wave-data\">\n");

    for line in code.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(colon_pos) = trimmed.find(':') {
            let key = trimmed[..colon_pos].trim();
            let value = trimmed[colon_pos + 1..].trim();

            html.push_str(&format!(
                "  <dt>{}</dt>\n  <dd>{}</dd>\n",
                html_escape(key),
                render_value(value)
            ));
        }
    }

    html.push_str("</dl>\n");
    html
}

/// Render a value — detect comma-separated lists and render as tags
fn render_value(value: &str) -> String {
    if value.contains(',') {
        let tags: Vec<&str> = value.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        if tags.len() > 1 {
            let mut html = String::from("<span class=\"wave-data-tags\">");
            for tag in tags {
                html.push_str(&format!(
                    "<span class=\"wave-data-tag\">{}</span>",
                    html_escape(tag)
                ));
            }
            html.push_str("</span>");
            return html;
        }
    }
    html_escape(value)
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inline_data() {
        let plugin = DataviewPlugin;
        let result = plugin
            .process_code_block("data", "status: active\npriority: high")
            .unwrap();
        assert!(result.contains("<dt>status</dt>"));
        assert!(result.contains("<dd>active</dd>"));
    }

    #[test]
    fn test_data_tags() {
        let plugin = DataviewPlugin;
        let result = plugin
            .process_code_block("data", "tags: rust, wasm, wave")
            .unwrap();
        assert!(result.contains("wave-data-tag"));
        assert!(result.contains("rust"));
    }

    #[test]
    fn test_dataview_table() {
        let plugin = DataviewPlugin;
        let result = plugin
            .process_code_block("dataview", "TABLE title, status\nFROM [[Projects]]")
            .unwrap();
        assert!(result.contains("wave-dataview-table"));
        assert!(result.contains("<th>title</th>"));
        assert!(result.contains("data-source"));
    }
}
