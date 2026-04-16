use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};

use crate::plugins::dataview::DataviewPlugin;
use crate::plugins::embeds::EmbedPlugin;
use crate::plugins::kanban::KanbanPlugin;
use crate::plugins::wikilink;
use crate::plugins::WavePlugin;
use crate::RenderConfig;

/// Render markdown to HTML with Wave plugin pipeline.
///
/// Pipeline:
/// 1. Expand wikilinks in source text ([[Page]] → <a> tags)
/// 2. Expand template variables ({{var}} → value)
/// 3. Parse with pulldown-cmark (CommonMark + extensions)
/// 4. Intercept fenced code blocks → route to plugins
/// 5. Render remaining events to HTML
pub fn render_markdown(markdown: &str, config: &RenderConfig) -> String {
    // Step 1: Expand wikilinks before parsing
    let title_map = wikilink::build_title_map(&config.title_index);
    let expanded = wikilink::expand_wikilinks(markdown, &title_map);

    // Step 2: Expand template variables
    let expanded = crate::plugins::template::expand_template(&expanded, &config.template_vars);

    // Step 3: Parse with pulldown-cmark
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let parser = Parser::new_ext(&expanded, opts);

    // Step 4 & 5: Process events through plugin pipeline
    let plugins = build_plugins(config);
    process_events(parser, &plugins)
}

fn build_plugins(config: &RenderConfig) -> Vec<Box<dyn WavePlugin>> {
    let mut plugins: Vec<Box<dyn WavePlugin>> = Vec::new();
    if config.kanban {
        plugins.push(Box::new(KanbanPlugin));
    }
    if config.dataview {
        plugins.push(Box::new(DataviewPlugin));
    }
    if config.embeds {
        plugins.push(Box::new(EmbedPlugin));
    }
    plugins
}

/// Process pulldown-cmark events, intercepting code blocks for plugins
fn process_events<'a, I>(events: I, plugins: &[Box<dyn WavePlugin>]) -> String
where
    I: Iterator<Item = Event<'a>>,
{
    let mut html = String::new();
    let mut in_code_block = false;
    let mut code_info = String::new();
    let mut code_content = String::new();

    for event in events {
        match event {
            Event::Start(Tag::CodeBlock(kind)) => {
                in_code_block = true;
                code_content.clear();
                code_info = match kind {
                    CodeBlockKind::Fenced(info) => info.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
            }

            Event::Text(text) if in_code_block => {
                code_content.push_str(&text);
            }

            Event::End(TagEnd::CodeBlock) => {
                in_code_block = false;

                // Try plugins first
                let mut handled = false;
                if !code_info.is_empty() {
                    for plugin in plugins {
                        if let Some(plugin_html) = plugin.process_code_block(&code_info, &code_content) {
                            html.push_str(&plugin_html);
                            handled = true;
                            break;
                        }
                    }
                }

                // If no plugin handled it, render as standard code block
                if !handled {
                    if code_info.is_empty() {
                        html.push_str("<pre><code>");
                    } else {
                        html.push_str(&format!(
                            "<pre><code class=\"language-{}\">",
                            html_escape(&code_info)
                        ));
                    }
                    html.push_str(&html_escape(&code_content));
                    html.push_str("</code></pre>\n");
                }
            }

            // For all other events, render to HTML normally
            Event::Start(tag) => {
                render_start_tag(&mut html, &tag);
            }

            Event::End(tag) => {
                render_end_tag(&mut html, &tag);
            }

            Event::Text(text) => {
                // Text inside wikilink expansions already has HTML — check for it
                if text.contains("<a class=\"wiki-link") {
                    html.push_str(&text);
                } else {
                    html.push_str(&html_escape(&text));
                }
            }

            Event::Code(text) => {
                html.push_str("<code>");
                html.push_str(&html_escape(&text));
                html.push_str("</code>");
            }

            Event::Html(text) | Event::InlineHtml(text) => {
                html.push_str(&text);
            }

            Event::SoftBreak => {
                html.push('\n');
            }

            Event::HardBreak => {
                html.push_str("<br />\n");
            }

            Event::Rule => {
                html.push_str("<hr />\n");
            }

            Event::FootnoteReference(_) | Event::TaskListMarker(_) | Event::DisplayMath(_) | Event::InlineMath(_) => {
                // TaskListMarker is handled by pulldown-cmark's HTML output via the tag
                // Math not supported yet
                match event {
                    Event::TaskListMarker(checked) => {
                        if checked {
                            html.push_str("<input type=\"checkbox\" checked disabled />");
                        } else {
                            html.push_str("<input type=\"checkbox\" disabled />");
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    html
}

fn render_start_tag(html: &mut String, tag: &Tag) {
    match tag {
        Tag::Paragraph => html.push_str("<p>"),
        Tag::Heading { level, .. } => {
            html.push_str(&format!("<{}>", level));
        }
        Tag::BlockQuote(_) => html.push_str("<blockquote>\n"),
        Tag::List(Some(start)) => {
            if *start == 1 {
                html.push_str("<ol>\n");
            } else {
                html.push_str(&format!("<ol start=\"{}\">\n", start));
            }
        }
        Tag::List(None) => html.push_str("<ul>\n"),
        Tag::Item => html.push_str("<li>"),
        Tag::Emphasis => html.push_str("<em>"),
        Tag::Strong => html.push_str("<strong>"),
        Tag::Strikethrough => html.push_str("<del>"),
        Tag::Link { dest_url, title, .. } => {
            html.push_str(&format!("<a href=\"{}\"", html_escape(dest_url)));
            if !title.is_empty() {
                html.push_str(&format!(" title=\"{}\"", html_escape(title)));
            }
            html.push('>');
        }
        Tag::Image { dest_url, title, .. } => {
            html.push_str(&format!(
                "<img src=\"{}\" alt=\"",
                html_escape(dest_url)
            ));
            if !title.is_empty() {
                html.push_str(&format!("\" title=\"{}", html_escape(title)));
            }
            // alt text comes as Text events, we handle closing in end tag
        }
        Tag::Table(alignments) => {
            html.push_str("<table>\n");
            // Store alignments — we'll use them in table head/body
            let _ = alignments; // alignment handling happens at cell level
        }
        Tag::TableHead => html.push_str("<thead><tr>\n"),
        Tag::TableRow => html.push_str("<tr>\n"),
        Tag::TableCell => html.push_str("<td>"),
        Tag::CodeBlock(_) => {} // Handled in process_events
        _ => {}
    }
}

fn render_end_tag(html: &mut String, tag: &TagEnd) {
    match tag {
        TagEnd::Paragraph => html.push_str("</p>\n"),
        TagEnd::Heading(level) => {
            html.push_str(&format!("</{}>\n", level));
        }
        TagEnd::BlockQuote(_) => html.push_str("</blockquote>\n"),
        TagEnd::List(ordered) => {
            if *ordered {
                html.push_str("</ol>\n");
            } else {
                html.push_str("</ul>\n");
            }
        }
        TagEnd::Item => html.push_str("</li>\n"),
        TagEnd::Emphasis => html.push_str("</em>"),
        TagEnd::Strong => html.push_str("</strong>"),
        TagEnd::Strikethrough => html.push_str("</del>"),
        TagEnd::Link => html.push_str("</a>"),
        TagEnd::Image => html.push_str("\" />"),
        TagEnd::Table => html.push_str("</table>\n"),
        TagEnd::TableHead => html.push_str("</tr></thead>\n<tbody>\n"),
        TagEnd::TableRow => html.push_str("</tr>\n"),
        TagEnd::TableCell => html.push_str("</td>\n"),
        TagEnd::CodeBlock => {} // Handled in process_events
        _ => {}
    }
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
    use crate::TitleEntry;

    #[test]
    fn test_basic_markdown() {
        let config = RenderConfig::default();
        let html = render_markdown("# Hello\n\nWorld **bold** text", &config);
        assert!(html.contains("<h1>Hello</h1>"));
        assert!(html.contains("<strong>bold</strong>"));
    }

    #[test]
    fn test_wikilinks_resolved() {
        let config = RenderConfig {
            title_index: vec![TitleEntry {
                rkey: "abc123".to_string(),
                title: "My Page".to_string(),
            }],
            ..Default::default()
        };
        let html = render_markdown("See [[My Page]] for more", &config);
        assert!(html.contains("data-rkey=\"abc123\""));
    }

    #[test]
    fn test_kanban_plugin() {
        let config = RenderConfig::default();
        let md = "```kanban\n## Todo\n- Task one\n\n## Done\n- Task two\n```";
        let html = render_markdown(md, &config);
        assert!(html.contains("wave-kanban"));
        assert!(html.contains("Task one"));
    }

    #[test]
    fn test_data_plugin() {
        let config = RenderConfig::default();
        let md = "```data\nstatus: active\npriority: high\n```";
        let html = render_markdown(md, &config);
        assert!(html.contains("wave-data"));
        assert!(html.contains("<dt>status</dt>"));
    }

    #[test]
    fn test_embed_plugin() {
        let config = RenderConfig::default();
        let md = "```embed\nhttps://youtube.com/watch?v=abc123\n```";
        let html = render_markdown(md, &config);
        assert!(html.contains("wave-embed-youtube"));
    }

    #[test]
    fn test_regular_code_block_unaffected() {
        let config = RenderConfig::default();
        let md = "```rust\nfn main() {}\n```";
        let html = render_markdown(md, &config);
        assert!(html.contains("language-rust"));
        assert!(html.contains("fn main()"));
    }

    #[test]
    fn test_template_expansion() {
        let config = RenderConfig {
            template_vars: vec![crate::TemplateVar {
                key: "project".to_string(),
                value: "Wave".to_string(),
            }],
            ..Default::default()
        };
        let html = render_markdown("# {{project}} Notes", &config);
        assert!(html.contains("Wave Notes"));
    }

    #[test]
    fn test_strikethrough() {
        let config = RenderConfig::default();
        let html = render_markdown("~~deleted~~", &config);
        assert!(html.contains("<del>deleted</del>"));
    }

    #[test]
    fn test_table() {
        let config = RenderConfig::default();
        let md = "| A | B |\n|---|---|\n| 1 | 2 |";
        let html = render_markdown(md, &config);
        assert!(html.contains("<table>"));
        assert!(html.contains("<td>"));
    }
}
