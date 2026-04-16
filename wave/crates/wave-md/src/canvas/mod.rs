/// Canvas rendering module — bypasses the DOM entirely.
///
/// Architecture:
///   pulldown-cmark events → layout engine → positioned RenderItems → Canvas2D painter
///
/// The Rust side owns the layout and painting. React only provides the <canvas>
/// element and forwards scroll/resize/click events.

pub mod layout;
pub mod painter;
pub mod theme;

use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

use crate::plugins::wikilink;
use crate::RenderConfig;
use layout::{KanbanCard, KanbanColumn, LayoutContext, RenderItem};

/// Persistent canvas renderer — holds layout state between frames.
#[wasm_bindgen]
pub struct CanvasRenderer {
    canvas: HtmlCanvasElement,
    ctx: CanvasRenderingContext2d,
    items: Vec<RenderItem>,
    content_height: f64,
    viewport_w: f64,
    viewport_h: f64,
    dpr: f64,
    scroll_y: f64,
}

#[wasm_bindgen]
impl CanvasRenderer {
    /// Create a new renderer attached to a canvas element.
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Result<CanvasRenderer, JsValue> {
        let ctx = canvas
            .get_context("2d")?
            .ok_or_else(|| JsValue::from_str("Failed to get 2d context"))?
            .dyn_into::<CanvasRenderingContext2d>()?;

        let dpr = web_sys::window()
            .map(|w| w.device_pixel_ratio())
            .unwrap_or(1.0);

        let viewport_w = canvas.client_width() as f64;
        let viewport_h = canvas.client_height() as f64;

        // Set canvas buffer size for sharp rendering
        canvas.set_width((viewport_w * dpr) as u32);
        canvas.set_height((viewport_h * dpr) as u32);

        Ok(CanvasRenderer {
            canvas,
            ctx,
            items: Vec::new(),
            content_height: 0.0,
            viewport_w,
            viewport_h,
            dpr,
            scroll_y: 0.0,
        })
    }

    /// Resize the canvas (call on window resize).
    pub fn resize(&mut self, width: f64, height: f64) {
        self.viewport_w = width;
        self.viewport_h = height;
        self.canvas.set_width((width * self.dpr) as u32);
        self.canvas.set_height((height * self.dpr) as u32);
    }

    /// Set scroll position.
    #[wasm_bindgen(js_name = setScroll)]
    pub fn set_scroll(&mut self, scroll_y: f64) {
        self.scroll_y = scroll_y.max(0.0).min((self.content_height - self.viewport_h).max(0.0));
    }

    /// Get total content height (for scrollbar).
    #[wasm_bindgen(js_name = getContentHeight)]
    pub fn get_content_height(&self) -> f64 {
        self.content_height
    }

    /// Get current scroll position.
    #[wasm_bindgen(js_name = getScroll)]
    pub fn get_scroll(&self) -> f64 {
        self.scroll_y
    }

    /// Layout and paint markdown content.
    pub fn render(&mut self, markdown: &str, config_json: &str) -> Result<(), JsValue> {
        let config: RenderConfig = serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid config: {}", e)))?;

        // Step 1: Expand wikilinks
        let title_map = wikilink::build_title_map(&config.title_index);
        let expanded = crate::plugins::template::expand_template(markdown, &config.template_vars);

        // Step 2: Layout
        self.items = layout_markdown(&expanded, self.viewport_w, &self.ctx, &title_map, &config);
        self.content_height = self.items.iter().fold(0.0f64, |max, item| {
            let bottom = item_bottom(item);
            if bottom > max { bottom } else { max }
        }) + 32.0;

        // Step 3: Paint
        self.paint();

        Ok(())
    }

    /// Repaint without re-layout (e.g. after scroll).
    pub fn paint(&self) {
        painter::paint(
            &self.ctx,
            &self.items,
            self.scroll_y,
            self.viewport_w,
            self.viewport_h,
            self.dpr,
        );
    }

    /// Hit test at viewport coordinates. Returns JSON or empty string.
    #[wasm_bindgen(js_name = hitTest)]
    pub fn hit_test(&self, viewport_x: f64, viewport_y: f64) -> String {
        // Convert viewport coords to document coords
        let doc_x = viewport_x;
        let doc_y = viewport_y + self.scroll_y;

        match painter::hit_test(&self.items, doc_x, doc_y) {
            Some(action) => serde_json::to_string(&action).unwrap_or_default(),
            None => String::new(),
        }
    }
}

/// Get the bottom y-coordinate of a render item.
fn item_bottom(item: &RenderItem) -> f64 {
    match item {
        RenderItem::Text { y, font, .. } => {
            // Estimate height from font size
            let size: f64 = font
                .split("px")
                .next()
                .and_then(|s| s.rsplit(' ').next())
                .and_then(|s| s.parse().ok())
                .unwrap_or(14.0);
            y + size * 1.7
        }
        RenderItem::Rect { y, h, .. } | RenderItem::StrokeRect { y, h, .. } => y + h,
        RenderItem::Line { y1, y2, .. } => y1.max(*y2),
        RenderItem::Circle { cy, r, .. } => cy + r,
        RenderItem::Checkbox { y, size, .. } => y + size,
        RenderItem::HitRegion { y, h, .. } => y + h,
    }
}

/// Run pulldown-cmark and build layout items.
fn layout_markdown(
    markdown: &str,
    page_width: f64,
    ctx: &CanvasRenderingContext2d,
    title_map: &std::collections::HashMap<String, String>,
    config: &RenderConfig,
) -> Vec<RenderItem> {
    // Create measure function that calls canvas measureText
    let ctx_ref = ctx.clone();
    let measure: layout::MeasureFn = Box::new(move |text: &str, font: &str| {
        ctx_ref.set_font(font);
        ctx_ref
            .measure_text(text)
            .map(|m| m.width())
            .unwrap_or(text.len() as f64 * 8.0)
    });

    let mut lc = LayoutContext::new(page_width, measure);

    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let parser = Parser::new_ext(markdown, opts);

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                lc.y += theme::HEADING_MARGIN_TOP;
                lc.x = lc.margin_left + lc.current_indent();
                lc.style.heading = level as u8;
                lc.style.bold = true;
            }

            Event::End(TagEnd::Heading(_)) => {
                lc.y += lc.style.line_height() + theme::HEADING_MARGIN_BOTTOM;
                lc.style.heading = 0;
                lc.style.bold = false;
                lc.x = lc.margin_left + lc.current_indent();
            }

            Event::Start(Tag::Paragraph) => {
                lc.x = lc.margin_left + lc.current_indent();
                lc.emit_blockquote_bar();
            }

            Event::End(TagEnd::Paragraph) => {
                lc.y += lc.style.line_height() + theme::PARAGRAPH_SPACING;
                lc.x = lc.margin_left + lc.current_indent();
            }

            Event::Start(Tag::BlockQuote(_)) => {
                lc.in_blockquote = true;
                lc.x = lc.margin_left + lc.current_indent();
            }

            Event::End(TagEnd::BlockQuote(_)) => {
                lc.in_blockquote = false;
                lc.y += theme::PARAGRAPH_SPACING;
                lc.x = lc.margin_left;
            }

            Event::Start(Tag::List(start)) => {
                lc.list_depth += 1;
                lc.in_list = true;
                lc.list_ordered = start.is_some();
                lc.list_counter = start.unwrap_or(1) as u32;
                lc.x = lc.margin_left + lc.current_indent();
            }

            Event::End(TagEnd::List(_)) => {
                lc.list_depth = lc.list_depth.saturating_sub(1);
                if lc.list_depth == 0 {
                    lc.in_list = false;
                    lc.y += theme::PARAGRAPH_SPACING;
                }
                lc.x = lc.margin_left + lc.current_indent();
            }

            Event::Start(Tag::Item) => {
                lc.x = lc.margin_left + lc.current_indent();
                lc.emit_bullet();
            }

            Event::End(TagEnd::Item) => {
                lc.newline();
                lc.list_counter += 1;
            }

            Event::Start(Tag::Emphasis) => {
                lc.style.italic = true;
            }
            Event::End(TagEnd::Emphasis) => {
                lc.style.italic = false;
            }

            Event::Start(Tag::Strong) => {
                lc.style.bold = true;
            }
            Event::End(TagEnd::Strong) => {
                if lc.style.heading == 0 {
                    lc.style.bold = false;
                }
            }

            Event::Start(Tag::Strikethrough) => {
                lc.style.strikethrough = true;
            }
            Event::End(TagEnd::Strikethrough) => {
                lc.style.strikethrough = false;
            }

            Event::Start(Tag::Link { dest_url, .. }) => {
                let url = dest_url.to_string();
                lc.style.link_url = Some(url);
            }

            Event::End(TagEnd::Link) => {
                lc.style.link_url = None;
            }

            Event::Start(Tag::CodeBlock(kind)) => {
                lc.in_code_block = true;
                lc.code_block_content.clear();
                lc.code_block_info = match kind {
                    CodeBlockKind::Fenced(info) => info.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
            }

            Event::End(TagEnd::CodeBlock) => {
                lc.in_code_block = false;
                let info = lc.code_block_info.clone();
                let content = lc.code_block_content.clone();

                if info == "kanban" && config.kanban {
                    // Parse kanban columns
                    let cols = parse_kanban_content(&content);
                    lc.kanban_columns = cols;
                    lc.emit_kanban();
                } else if (info == "data" || info == "dataview") && config.dataview {
                    // Render data block as styled key-value pairs
                    emit_data_block(&mut lc, &info, &content);
                } else {
                    lc.emit_code_block(&info, &content);
                }
            }

            Event::Start(Tag::Table(_)) => {
                lc.in_table = true;
                lc.table_col = 0;
                lc.table_row = 0;
                lc.table_col_widths.clear();
                lc.table_cell_texts.clear();
                lc.table_start_x = lc.margin_left;
                lc.table_start_y = lc.y;
            }

            Event::End(TagEnd::Table) => {
                emit_table(&mut lc);
                lc.in_table = false;
                lc.y += theme::PARAGRAPH_SPACING;
            }

            Event::Start(Tag::TableHead) => {
                lc.table_cell_texts.push(Vec::new());
            }

            Event::End(TagEnd::TableHead) => {
                lc.table_row += 1;
            }

            Event::Start(Tag::TableRow) => {
                lc.table_cell_texts.push(Vec::new());
                lc.table_col = 0;
            }

            Event::End(TagEnd::TableRow) => {
                lc.table_row += 1;
            }

            Event::Start(Tag::TableCell) => {}

            Event::End(TagEnd::TableCell) => {
                lc.table_col += 1;
            }

            Event::Text(text) => {
                if lc.in_code_block {
                    lc.code_block_content.push_str(&text);
                } else if lc.in_table {
                    // Accumulate cell text
                    if let Some(row) = lc.table_cell_texts.last_mut() {
                        if lc.table_col < row.len() {
                            row[lc.table_col].push_str(&text);
                        } else {
                            row.push(text.to_string());
                        }
                    }
                } else {
                    // Check for inline wikilinks
                    let text_str = text.to_string();
                    let parts = split_wikilinks(&text_str, title_map);
                    for part in parts {
                        match part {
                            TextPart::Plain(s) => lc.emit_text(&s),
                            TextPart::WikiLink { display, rkey } => {
                                lc.style.wiki_rkey = Some(rkey);
                                lc.emit_text(&display);
                                lc.style.wiki_rkey = None;
                            }
                            TextPart::WikiLinkMissing { display } => {
                                let old_color = lc.style.link_url.clone();
                                lc.style.link_url = Some(String::new()); // trigger accent color
                                lc.emit_text(&display);
                                lc.style.link_url = old_color;
                            }
                        }
                    }
                }
            }

            Event::Code(text) => {
                let old_code = lc.style.code;
                lc.style.code = true;

                // Inline code background
                let font = lc.style.font_string();
                let w = lc.measure_text(&text, &font);
                let h = lc.style.font_size() + 4.0;
                let pad = 4.0;

                lc.items.push(RenderItem::Rect {
                    x: lc.x - pad / 2.0,
                    y: lc.y + 1.0,
                    w: w + pad,
                    h,
                    color: theme::BG_HOVER.to_string(),
                    radius: 3.0,
                });

                lc.emit_text(&text);
                lc.style.code = old_code;
            }

            Event::SoftBreak => {
                lc.emit_text(" ");
            }

            Event::HardBreak => {
                lc.newline();
            }

            Event::Rule => {
                lc.emit_hr();
            }

            Event::TaskListMarker(checked) => {
                lc.emit_checkbox(checked);
            }

            _ => {}
        }
    }

    lc.items
}

/// Split text containing [[wikilinks]] into plain text and link parts.
enum TextPart {
    Plain(String),
    WikiLink { display: String, rkey: String },
    WikiLinkMissing { display: String },
}

fn split_wikilinks(
    text: &str,
    title_map: &std::collections::HashMap<String, String>,
) -> Vec<TextPart> {
    let mut parts = Vec::new();
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut plain_start = 0;

    while i + 1 < len {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            // Flush plain text before this
            if i > plain_start {
                parts.push(TextPart::Plain(text[plain_start..i].to_string()));
            }

            let start = i + 2;
            let mut j = start;
            while j + 1 < len {
                if bytes[j] == b']' && bytes[j + 1] == b']' {
                    let inner = &text[start..j];
                    let (display, target) = if let Some(pipe) = inner.find('|') {
                        (&inner[..pipe], inner[pipe + 1..].trim())
                    } else {
                        (inner, inner.trim())
                    };

                    if let Some(rkey) = title_map.get(&target.to_lowercase()) {
                        parts.push(TextPart::WikiLink {
                            display: display.to_string(),
                            rkey: rkey.clone(),
                        });
                    } else {
                        parts.push(TextPart::WikiLinkMissing {
                            display: display.to_string(),
                        });
                    }

                    i = j + 2;
                    plain_start = i;
                    break;
                }
                j += 1;
            }
            if j + 1 >= len {
                // Unclosed [[
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    // Flush remaining plain text
    if plain_start < len {
        parts.push(TextPart::Plain(text[plain_start..].to_string()));
    }

    parts
}

/// Parse kanban content into columns.
fn parse_kanban_content(content: &str) -> Vec<KanbanColumn> {
    let mut columns = Vec::new();
    let mut current: Option<KanbanColumn> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("## ") {
            if let Some(col) = current.take() {
                columns.push(col);
            }
            current = Some(KanbanColumn {
                title: heading.to_string(),
                items: Vec::new(),
            });
        } else if let Some(item) = trimmed.strip_prefix("- ").or(trimmed.strip_prefix("* ")) {
            if let Some(ref mut col) = current {
                let checked = item.starts_with("[x] ") || item.starts_with("[X] ");
                col.items.push(KanbanCard {
                    text: item.to_string(),
                    checked,
                });
            }
        }
    }

    if let Some(col) = current {
        columns.push(col);
    }

    columns
}

/// Emit a data/dataview block as styled key-value pairs on canvas.
fn emit_data_block(lc: &mut LayoutContext, info: &str, content: &str) {
    let pad = 12.0;
    let line_h = theme::FONT_SIZE_BASE * 1.5;
    let key_font = format!("bold {}px {}", theme::FONT_SIZE_SMALL, theme::FONT_BODY);
    let val_font = format!("normal normal {}px {}", theme::FONT_SIZE_BASE, theme::FONT_BODY);

    let lines: Vec<(&str, &str)> = content
        .lines()
        .filter_map(|l| {
            let l = l.trim();
            l.find(':').map(|pos| (l[..pos].trim(), l[pos + 1..].trim()))
        })
        .collect();

    if lines.is_empty() {
        lc.emit_code_block(info, content);
        return;
    }

    let block_h = pad * 2.0 + lines.len() as f64 * line_h;

    // Background
    lc.items.push(RenderItem::Rect {
        x: lc.margin_left,
        y: lc.y,
        w: lc.content_width(),
        h: block_h,
        color: theme::BG.to_string(),
        radius: theme::CODE_BLOCK_RADIUS,
    });
    lc.items.push(RenderItem::StrokeRect {
        x: lc.margin_left,
        y: lc.y,
        w: lc.content_width(),
        h: block_h,
        color: theme::BORDER.to_string(),
        radius: theme::CODE_BLOCK_RADIUS,
    });

    let mut cy = lc.y + pad;
    for (key, value) in &lines {
        // Key
        lc.items.push(RenderItem::Text {
            x: lc.margin_left + pad,
            y: cy,
            text: key.to_uppercase(),
            font: key_font.clone(),
            color: theme::TEXT_DIM.to_string(),
            baseline: cy + theme::FONT_SIZE_SMALL,
        });

        let key_w = lc.measure_text(&key.to_uppercase(), &key_font);

        // Value
        lc.items.push(RenderItem::Text {
            x: lc.margin_left + pad + key_w + 12.0,
            y: cy,
            text: value.to_string(),
            font: val_font.clone(),
            color: theme::TEXT.to_string(),
            baseline: cy + theme::FONT_SIZE_BASE,
        });

        cy += line_h;
    }

    lc.y += block_h + theme::PARAGRAPH_SPACING;
    lc.x = lc.margin_left;
}

/// Emit a table from accumulated cell data.
fn emit_table(lc: &mut LayoutContext) {
    if lc.table_cell_texts.is_empty() {
        return;
    }

    let cell_pad = theme::TABLE_CELL_PAD;
    let row_h = theme::FONT_SIZE_BASE * 1.7 + cell_pad * 2.0;
    let header_font = format!("bold {}px {}", theme::FONT_SIZE_BASE, theme::FONT_BODY);
    let body_font = format!("normal normal {}px {}", theme::FONT_SIZE_BASE, theme::FONT_BODY);

    // Calculate column widths
    let num_cols = lc
        .table_cell_texts
        .iter()
        .map(|row| row.len())
        .max()
        .unwrap_or(0);
    if num_cols == 0 {
        return;
    }

    let available = lc.content_width();
    let col_w = available / num_cols as f64;

    let start_y = lc.table_start_y;
    let start_x = lc.table_start_x;
    let total_h = lc.table_cell_texts.len() as f64 * row_h;

    // Table border
    lc.items.push(RenderItem::StrokeRect {
        x: start_x,
        y: start_y,
        w: available,
        h: total_h,
        color: theme::BORDER.to_string(),
        radius: 0.0,
    });

    for (row_idx, row) in lc.table_cell_texts.iter().enumerate() {
        let ry = start_y + row_idx as f64 * row_h;
        let is_header = row_idx == 0;

        // Row background
        if is_header {
            lc.items.push(RenderItem::Rect {
                x: start_x,
                y: ry,
                w: available,
                h: row_h,
                color: theme::BG_ACTIVE.to_string(),
                radius: 0.0,
            });
        }

        // Row bottom border
        lc.items.push(RenderItem::Line {
            x1: start_x,
            y1: ry + row_h,
            x2: start_x + available,
            y2: ry + row_h,
            color: theme::BORDER.to_string(),
            width: 1.0,
        });

        for (col_idx, cell) in row.iter().enumerate() {
            let cx = start_x + col_idx as f64 * col_w;

            // Cell right border
            if col_idx > 0 {
                lc.items.push(RenderItem::Line {
                    x1: cx,
                    y1: ry,
                    x2: cx,
                    y2: ry + row_h,
                    color: theme::BORDER.to_string(),
                    width: 1.0,
                });
            }

            // Cell text
            let font = if is_header {
                &header_font
            } else {
                &body_font
            };
            let color = if is_header {
                theme::TEXT_DIM
            } else {
                theme::TEXT
            };
            lc.items.push(RenderItem::Text {
                x: cx + cell_pad,
                y: ry + cell_pad,
                text: cell.clone(),
                font: font.clone(),
                color: color.to_string(),
                baseline: ry + cell_pad + theme::FONT_SIZE_BASE,
            });
        }
    }

    lc.y = start_y + total_h;
}
