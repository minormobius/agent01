use super::WavePlugin;

/// Kanban board plugin.
///
/// Renders ` ```kanban ` code blocks as interactive board HTML.
///
/// Format:
/// ```kanban
/// ## Todo
/// - Task one
/// - Task two
///
/// ## In Progress
/// - Working on this
///
/// ## Done
/// - Finished item
/// ```
pub struct KanbanPlugin;

impl WavePlugin for KanbanPlugin {
    fn process_code_block(&self, info: &str, code: &str) -> Option<String> {
        if info.trim() != "kanban" {
            return None;
        }
        Some(render_kanban(code))
    }
}

fn render_kanban(code: &str) -> String {
    let mut html = String::from("<div class=\"wave-kanban\">\n");
    let mut current_column: Option<String> = None;
    let mut items: Vec<String> = Vec::new();

    for line in code.lines() {
        let trimmed = line.trim();

        if let Some(heading) = trimmed.strip_prefix("## ") {
            // Flush previous column
            if let Some(col_title) = current_column.take() {
                flush_column(&mut html, &col_title, &items);
                items.clear();
            }
            current_column = Some(heading.to_string());
        } else if let Some(item) = trimmed.strip_prefix("- ") {
            items.push(item.to_string());
        } else if let Some(item) = trimmed.strip_prefix("* ") {
            items.push(item.to_string());
        }
        // Skip blank lines and other content
    }

    // Flush last column
    if let Some(col_title) = current_column.take() {
        flush_column(&mut html, &col_title, &items);
    }

    html.push_str("</div>\n");
    html
}

fn flush_column(html: &mut String, title: &str, items: &[String]) {
    html.push_str("<div class=\"wave-kanban-column\">\n");
    html.push_str(&format!(
        "  <div class=\"wave-kanban-header\">{}</div>\n",
        html_escape(title)
    ));
    html.push_str("  <div class=\"wave-kanban-items\">\n");
    for item in items {
        // Support checkbox syntax: - [x] Done item, - [ ] Pending item
        let (checked, text) = if let Some(rest) = item.strip_prefix("[x] ").or(item.strip_prefix("[X] ")) {
            (true, rest)
        } else if let Some(rest) = item.strip_prefix("[ ] ") {
            (false, rest)
        } else {
            (false, item.as_str())
        };

        let check_class = if checked { " checked" } else { "" };
        let check_icon = if checked { "&#x2611;" } else { "&#x2610;" };

        html.push_str(&format!(
            "    <div class=\"wave-kanban-card{}\">{} {}</div>\n",
            check_class,
            check_icon,
            html_escape(text)
        ));
    }
    html.push_str("  </div>\n");
    html.push_str("</div>\n");
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kanban_render() {
        let input = "## Todo\n- Buy milk\n- Write code\n\n## Done\n- [x] Ship it";
        let plugin = KanbanPlugin;
        let result = plugin.process_code_block("kanban", input).unwrap();
        assert!(result.contains("wave-kanban-column"));
        assert!(result.contains("Buy milk"));
        assert!(result.contains("Ship it"));
        assert!(result.contains("checked"));
    }

    #[test]
    fn test_kanban_ignores_other() {
        let plugin = KanbanPlugin;
        assert!(plugin.process_code_block("rust", "fn main() {}").is_none());
    }
}
