/// Layout engine: converts pulldown-cmark events into positioned render items.
///
/// Each RenderItem has an absolute (x, y) position and dimensions, ready
/// for the painter to draw without further computation.

use super::theme;

/// A positioned item ready to paint on canvas.
#[derive(Debug, Clone)]
pub enum RenderItem {
    /// A run of styled text
    Text {
        x: f64,
        y: f64,
        text: String,
        font: String,
        color: String,
        baseline: f64,
    },
    /// A filled rectangle (backgrounds, table cells, code blocks)
    Rect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        color: String,
        radius: f64,
    },
    /// A stroked rectangle (borders)
    StrokeRect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        color: String,
        radius: f64,
    },
    /// A horizontal line (hr, underlines, borders)
    Line {
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
        color: String,
        width: f64,
    },
    /// A filled circle (list bullets)
    Circle {
        cx: f64,
        cy: f64,
        r: f64,
        color: String,
    },
    /// A checkbox (task list)
    Checkbox {
        x: f64,
        y: f64,
        size: f64,
        checked: bool,
    },
    /// A clickable region (wikilinks, URLs) — invisible, used for hit-testing
    HitRegion {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        action: HitAction,
    },
}

/// What happens when a hit region is clicked
#[derive(Debug, Clone, serde::Serialize)]
pub enum HitAction {
    WikiLink { rkey: String },
    ExternalLink { url: String },
    Checkbox { index: usize },
}

/// Text style state tracked during layout
#[derive(Debug, Clone)]
pub struct TextStyle {
    pub bold: bool,
    pub italic: bool,
    pub strikethrough: bool,
    pub code: bool,
    pub heading: u8, // 0 = body, 1-6 = heading level
    pub link_url: Option<String>,
    pub wiki_rkey: Option<String>,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            bold: false,
            italic: false,
            strikethrough: false,
            code: false,
            heading: 0,
            link_url: None,
            wiki_rkey: None,
        }
    }
}

impl TextStyle {
    pub fn font_size(&self) -> f64 {
        if self.code {
            return theme::FONT_SIZE_CODE;
        }
        match self.heading {
            1 => theme::FONT_SIZE_H1,
            2 => theme::FONT_SIZE_H2,
            3 => theme::FONT_SIZE_H3,
            4 | 5 | 6 => theme::FONT_SIZE_H4,
            _ => theme::FONT_SIZE_BASE,
        }
    }

    pub fn font_string(&self) -> String {
        let size = self.font_size();
        let family = if self.code {
            theme::FONT_MONO
        } else {
            theme::FONT_BODY
        };
        let weight = if self.bold || self.heading > 0 {
            "bold"
        } else {
            "normal"
        };
        let style = if self.italic { "italic" } else { "normal" };
        format!("{} {} {}px {}", style, weight, size, family)
    }

    pub fn color(&self) -> &str {
        if self.wiki_rkey.is_some() || self.link_url.is_some() {
            return theme::ACCENT;
        }
        if self.strikethrough {
            return theme::TEXT_DIM;
        }
        if self.code {
            return theme::ACCENT;
        }
        theme::TEXT
    }

    pub fn line_height(&self) -> f64 {
        self.font_size() * theme::LINE_HEIGHT
    }
}

/// Measure text width using a callback to the canvas context.
/// The caller provides a closure that calls ctx.measureText().
pub type MeasureFn = Box<dyn Fn(&str, &str) -> f64>;

/// Layout context — tracks cursor position and builds render items.
pub struct LayoutContext {
    pub items: Vec<RenderItem>,
    pub x: f64,
    pub y: f64,
    pub page_width: f64,
    pub margin_left: f64,
    pub margin_right: f64,
    pub style: TextStyle,

    // Block-level state
    pub in_list: bool,
    pub list_depth: u32,
    pub list_ordered: bool,
    pub list_counter: u32,
    pub in_blockquote: bool,
    pub in_code_block: bool,
    pub code_block_info: String,
    pub code_block_content: String,
    pub code_block_start_y: f64,
    pub in_table: bool,
    pub table_col: usize,
    pub table_row: usize,
    pub table_col_widths: Vec<f64>,
    pub table_start_x: f64,
    pub table_start_y: f64,
    pub table_cell_texts: Vec<Vec<String>>,
    pub checkbox_count: usize,

    // Kanban accumulator
    pub kanban_columns: Vec<KanbanColumn>,
    pub in_kanban: bool,

    measure: MeasureFn,
}

#[derive(Debug, Clone)]
pub struct KanbanColumn {
    pub title: String,
    pub items: Vec<KanbanCard>,
}

#[derive(Debug, Clone)]
pub struct KanbanCard {
    pub text: String,
    pub checked: bool,
}

impl LayoutContext {
    pub fn new(page_width: f64, measure: MeasureFn) -> Self {
        let margin = 16.0;
        Self {
            items: Vec::new(),
            x: margin,
            y: 16.0,
            page_width,
            margin_left: margin,
            margin_right: margin,
            style: TextStyle::default(),
            in_list: false,
            list_depth: 0,
            list_ordered: false,
            list_counter: 0,
            in_blockquote: false,
            in_code_block: false,
            code_block_info: String::new(),
            code_block_content: String::new(),
            code_block_start_y: 0.0,
            in_table: false,
            table_col: 0,
            table_row: 0,
            table_col_widths: Vec::new(),
            table_start_x: 0.0,
            table_start_y: 0.0,
            table_cell_texts: Vec::new(),
            checkbox_count: 0,
            kanban_columns: Vec::new(),
            in_kanban: false,
            measure,
        }
    }

    pub fn content_width(&self) -> f64 {
        self.page_width - self.margin_left - self.margin_right
    }

    pub fn measure_text(&self, text: &str, font: &str) -> f64 {
        (self.measure)(text, font)
    }

    /// Newline — advance y by current line height, reset x.
    pub fn newline(&mut self) {
        self.y += self.style.line_height();
        self.x = self.margin_left + self.current_indent();
    }

    /// Current indentation from lists/blockquotes.
    pub fn current_indent(&self) -> f64 {
        let mut indent = 0.0;
        if self.in_blockquote {
            indent += theme::BLOCKQUOTE_PAD_LEFT + theme::BLOCKQUOTE_BAR_WIDTH + 4.0;
        }
        indent += self.list_depth as f64 * theme::LIST_INDENT;
        indent
    }

    /// Emit a text run with word-wrapping.
    pub fn emit_text(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }

        let font = self.style.font_string();
        let color = self.style.color().to_string();
        let line_h = self.style.line_height();
        let max_x = self.page_width - self.margin_right;
        let indent = self.current_indent();

        // Split on whitespace for word wrapping
        let words: Vec<&str> = text.split_inclusive(char::is_whitespace).collect();
        if words.is_empty() {
            return;
        }

        for word in &words {
            let w = self.measure_text(word, &font);

            // If adding this word would overflow and we're not at line start, wrap
            if self.x + w > max_x && self.x > self.margin_left + indent + 1.0 {
                self.y += line_h;
                self.x = self.margin_left + indent;
            }

            let start_x = self.x;
            let baseline = self.y + self.style.font_size();

            self.items.push(RenderItem::Text {
                x: self.x,
                y: self.y,
                text: word.to_string(),
                font: font.clone(),
                color: color.clone(),
                baseline,
            });

            // If this is a link, add a hit region
            if let Some(ref rkey) = self.style.wiki_rkey {
                self.items.push(RenderItem::HitRegion {
                    x: start_x,
                    y: self.y,
                    w,
                    h: line_h,
                    action: HitAction::WikiLink {
                        rkey: rkey.clone(),
                    },
                });
                // Underline
                self.items.push(RenderItem::Line {
                    x1: start_x,
                    y1: baseline + 2.0,
                    x2: start_x + w,
                    y2: baseline + 2.0,
                    color: theme::ACCENT.to_string(),
                    width: 1.0,
                });
            } else if let Some(ref url) = self.style.link_url {
                self.items.push(RenderItem::HitRegion {
                    x: start_x,
                    y: self.y,
                    w,
                    h: line_h,
                    action: HitAction::ExternalLink {
                        url: url.clone(),
                    },
                });
                self.items.push(RenderItem::Line {
                    x1: start_x,
                    y1: baseline + 2.0,
                    x2: start_x + w,
                    y2: baseline + 2.0,
                    color: theme::ACCENT.to_string(),
                    width: 1.0,
                });
            }

            // Strikethrough
            if self.style.strikethrough {
                let mid_y = self.y + self.style.font_size() * 0.55;
                self.items.push(RenderItem::Line {
                    x1: start_x,
                    y1: mid_y,
                    x2: start_x + w,
                    y2: mid_y,
                    color: theme::TEXT_DIM.to_string(),
                    width: 1.0,
                });
            }

            self.x += w;
        }
    }

    /// Emit a list bullet or number.
    pub fn emit_bullet(&mut self) {
        let baseline_y = self.y + self.style.font_size();
        if self.list_ordered {
            let label = format!("{}.", self.list_counter);
            let font = self.style.font_string();
            let w = self.measure_text(&label, &font);
            self.items.push(RenderItem::Text {
                x: self.x - w - 4.0,
                y: self.y,
                text: label,
                font,
                color: theme::TEXT_DIM.to_string(),
                baseline: baseline_y,
            });
        } else {
            self.items.push(RenderItem::Circle {
                cx: self.x - 10.0,
                cy: baseline_y - self.style.font_size() * 0.35,
                r: theme::BULLET_RADIUS,
                color: theme::TEXT_DIM.to_string(),
            });
        }
    }

    /// Emit a checkbox.
    pub fn emit_checkbox(&mut self, checked: bool) {
        let s = theme::CHECKBOX_SIZE;
        let y = self.y + (self.style.font_size() - s) / 2.0 + 2.0;
        self.items.push(RenderItem::Checkbox {
            x: self.x,
            y,
            size: s,
            checked,
        });
        self.items.push(RenderItem::HitRegion {
            x: self.x,
            y,
            w: s,
            h: s,
            action: HitAction::Checkbox {
                index: self.checkbox_count,
            },
        });
        self.checkbox_count += 1;
        self.x += s + 6.0;
    }

    /// Emit an HR.
    pub fn emit_hr(&mut self) {
        self.y += theme::HR_MARGIN;
        self.items.push(RenderItem::Line {
            x1: self.margin_left,
            y1: self.y,
            x2: self.page_width - self.margin_right,
            y2: self.y,
            color: theme::BORDER.to_string(),
            width: 1.0,
        });
        self.y += theme::HR_MARGIN;
        self.x = self.margin_left;
    }

    /// Layout a kanban board from accumulated columns.
    pub fn emit_kanban(&mut self) {
        if self.kanban_columns.is_empty() {
            return;
        }

        let start_x = self.margin_left;
        let start_y = self.y;
        let col_w = theme::KANBAN_COL_WIDTH;
        let gap = theme::KANBAN_COL_GAP;
        let header_h = theme::KANBAN_HEADER_HEIGHT;
        let card_h = theme::KANBAN_CARD_HEIGHT;
        let card_gap = theme::KANBAN_CARD_GAP;

        let mut max_height: f64 = 0.0;

        for (i, col) in self.kanban_columns.iter().enumerate() {
            let cx = start_x + i as f64 * (col_w + gap);

            // Column background
            let col_height = header_h + col.items.len() as f64 * (card_h + card_gap) + 8.0;
            max_height = max_height.max(col_height);

            self.items.push(RenderItem::Rect {
                x: cx,
                y: start_y,
                w: col_w,
                h: col_height,
                color: theme::BG.to_string(),
                radius: theme::CODE_BLOCK_RADIUS,
            });
            self.items.push(RenderItem::StrokeRect {
                x: cx,
                y: start_y,
                w: col_w,
                h: col_height,
                color: theme::BORDER.to_string(),
                radius: theme::CODE_BLOCK_RADIUS,
            });

            // Column header
            self.items.push(RenderItem::Rect {
                x: cx,
                y: start_y,
                w: col_w,
                h: header_h,
                color: theme::BG_ACTIVE.to_string(),
                radius: 0.0,
            });

            let header_font = format!("bold {}px {}", theme::FONT_SIZE_BASE, theme::FONT_BODY);
            self.items.push(RenderItem::Text {
                x: cx + 10.0,
                y: start_y + 4.0,
                text: col.title.clone(),
                font: header_font,
                color: theme::TEXT.to_string(),
                baseline: start_y + header_h - 8.0,
            });

            // Cards
            for (j, card) in col.items.iter().enumerate() {
                let cy = start_y + header_h + 4.0 + j as f64 * (card_h + card_gap);

                // Card background
                self.items.push(RenderItem::Rect {
                    x: cx + 4.0,
                    y: cy,
                    w: col_w - 8.0,
                    h: card_h,
                    color: theme::BG_SURFACE.to_string(),
                    radius: 4.0,
                });
                self.items.push(RenderItem::StrokeRect {
                    x: cx + 4.0,
                    y: cy,
                    w: col_w - 8.0,
                    h: card_h,
                    color: theme::BORDER.to_string(),
                    radius: 4.0,
                });

                // Checkbox if applicable
                let text_x;
                if card.text.starts_with("[ ] ") || card.text.starts_with("[x] ") || card.text.starts_with("[X] ") {
                    let cbs = 12.0;
                    self.items.push(RenderItem::Checkbox {
                        x: cx + 10.0,
                        y: cy + (card_h - cbs) / 2.0,
                        size: cbs,
                        checked: card.checked,
                    });
                    text_x = cx + 10.0 + cbs + 4.0;
                } else {
                    text_x = cx + 10.0;
                }

                // Card text
                let card_font = format!("normal normal {}px {}", theme::FONT_SIZE_SMALL, theme::FONT_BODY);
                let display_text = if card.text.starts_with("[ ] ") || card.text.starts_with("[x] ") || card.text.starts_with("[X] ") {
                    &card.text[4..]
                } else {
                    &card.text
                };
                let card_color = if card.checked { theme::TEXT_DIM } else { theme::TEXT };
                self.items.push(RenderItem::Text {
                    x: text_x,
                    y: cy + 4.0,
                    text: display_text.to_string(),
                    font: card_font,
                    color: card_color.to_string(),
                    baseline: cy + card_h - 8.0,
                });
            }
        }

        self.y = start_y + max_height + theme::PARAGRAPH_SPACING;
        self.x = self.margin_left;
        self.kanban_columns.clear();
    }

    /// Emit a code block (non-plugin).
    pub fn emit_code_block(&mut self, info: &str, content: &str) {
        let pad = theme::CODE_BLOCK_PAD;
        let font = format!("normal normal {}px {}", theme::FONT_SIZE_CODE, theme::FONT_MONO);
        let line_h = theme::FONT_SIZE_CODE * 1.5;

        let lines: Vec<&str> = content.lines().collect();
        let block_height = pad * 2.0 + lines.len() as f64 * line_h;

        // Background
        self.items.push(RenderItem::Rect {
            x: self.margin_left,
            y: self.y,
            w: self.content_width(),
            h: block_height,
            color: theme::BG.to_string(),
            radius: theme::CODE_BLOCK_RADIUS,
        });
        self.items.push(RenderItem::StrokeRect {
            x: self.margin_left,
            y: self.y,
            w: self.content_width(),
            h: block_height,
            color: theme::BORDER.to_string(),
            radius: theme::CODE_BLOCK_RADIUS,
        });

        // Language label
        if !info.is_empty() {
            let label_font = format!("normal normal {}px {}", theme::FONT_SIZE_SMALL, theme::FONT_MONO);
            self.items.push(RenderItem::Text {
                x: self.margin_left + self.content_width() - self.measure_text(info, &label_font) - pad,
                y: self.y + 2.0,
                text: info.to_string(),
                font: label_font,
                color: theme::TEXT_DIM.to_string(),
                baseline: self.y + theme::FONT_SIZE_SMALL + 2.0,
            });
        }

        // Code lines
        let mut cy = self.y + pad;
        for line in &lines {
            self.items.push(RenderItem::Text {
                x: self.margin_left + pad,
                y: cy,
                text: line.to_string(),
                font: font.clone(),
                color: theme::TEXT.to_string(),
                baseline: cy + theme::FONT_SIZE_CODE,
            });
            cy += line_h;
        }

        self.y += block_height + theme::PARAGRAPH_SPACING;
        self.x = self.margin_left;
    }

    /// Emit the blockquote left bar for the current line.
    pub fn emit_blockquote_bar(&mut self) {
        if self.in_blockquote {
            self.items.push(RenderItem::Rect {
                x: self.margin_left,
                y: self.y,
                w: theme::BLOCKQUOTE_BAR_WIDTH,
                h: self.style.line_height(),
                color: theme::ACCENT.to_string(),
                radius: 1.0,
            });
        }
    }

    /// Content height (for scrollbar calculations).
    pub fn content_height(&self) -> f64 {
        self.y + 32.0 // add bottom padding
    }
}
