/// Edit state for the WYSIWYG canvas editor.
///
/// Tracks cursor position, selection range, and provides methods
/// for text manipulation in the markdown source.

use super::layout::RenderItem;
use web_sys::CanvasRenderingContext2d;

/// Edit state maintained between frames.
#[derive(Debug, Clone)]
pub struct EditState {
    /// The markdown source being edited.
    pub markdown: String,
    /// Cursor byte offset in the markdown source.
    pub cursor: usize,
    /// Selection: (anchor, cursor). None = no selection.
    pub selection: Option<(usize, usize)>,
    /// Whether the cursor is currently visible (for blinking).
    pub cursor_visible: bool,
}

impl EditState {
    pub fn new(markdown: String) -> Self {
        let cursor = markdown.len();
        Self {
            markdown,
            cursor,
            selection: None,
            cursor_visible: true,
        }
    }

    /// Insert text at the cursor position.
    pub fn insert(&mut self, text: &str) {
        // If there's a selection, delete it first
        if let Some((start, end)) = self.selection_range() {
            self.markdown.drain(start..end);
            self.cursor = start;
            self.selection = None;
        }

        self.markdown.insert_str(self.cursor, text);
        self.cursor += text.len();
    }

    /// Delete the character before the cursor (backspace).
    pub fn backspace(&mut self) {
        if let Some((start, end)) = self.selection_range() {
            self.markdown.drain(start..end);
            self.cursor = start;
            self.selection = None;
            return;
        }

        if self.cursor == 0 {
            return;
        }

        // Find the previous character boundary
        let prev = prev_char_boundary(&self.markdown, self.cursor);
        self.markdown.drain(prev..self.cursor);
        self.cursor = prev;
    }

    /// Delete the character after the cursor (delete key).
    pub fn delete(&mut self) {
        if let Some((start, end)) = self.selection_range() {
            self.markdown.drain(start..end);
            self.cursor = start;
            self.selection = None;
            return;
        }

        if self.cursor >= self.markdown.len() {
            return;
        }

        let next = next_char_boundary(&self.markdown, self.cursor);
        self.markdown.drain(self.cursor..next);
    }

    /// Move cursor left by one character.
    pub fn move_left(&mut self, shift: bool) {
        if self.cursor == 0 {
            if !shift {
                self.selection = None;
            }
            return;
        }

        if shift {
            let anchor = self.selection.map(|(a, _)| a).unwrap_or(self.cursor);
            self.cursor = prev_char_boundary(&self.markdown, self.cursor);
            self.selection = Some((anchor, self.cursor));
        } else {
            if let Some((start, _)) = self.selection_range() {
                self.cursor = start;
                self.selection = None;
            } else {
                self.cursor = prev_char_boundary(&self.markdown, self.cursor);
            }
        }
    }

    /// Move cursor right by one character.
    pub fn move_right(&mut self, shift: bool) {
        if self.cursor >= self.markdown.len() {
            if !shift {
                self.selection = None;
            }
            return;
        }

        if shift {
            let anchor = self.selection.map(|(a, _)| a).unwrap_or(self.cursor);
            self.cursor = next_char_boundary(&self.markdown, self.cursor);
            self.selection = Some((anchor, self.cursor));
        } else {
            if let Some((_, end)) = self.selection_range() {
                self.cursor = end;
                self.selection = None;
            } else {
                self.cursor = next_char_boundary(&self.markdown, self.cursor);
            }
        }
    }

    /// Move cursor to the start of the line.
    pub fn move_home(&mut self, shift: bool) {
        let line_start = self.markdown[..self.cursor]
            .rfind('\n')
            .map(|i| i + 1)
            .unwrap_or(0);

        if shift {
            let anchor = self.selection.map(|(a, _)| a).unwrap_or(self.cursor);
            self.cursor = line_start;
            self.selection = Some((anchor, self.cursor));
        } else {
            self.cursor = line_start;
            self.selection = None;
        }
    }

    /// Move cursor to the end of the line.
    pub fn move_end(&mut self, shift: bool) {
        let line_end = self.markdown[self.cursor..]
            .find('\n')
            .map(|i| self.cursor + i)
            .unwrap_or(self.markdown.len());

        if shift {
            let anchor = self.selection.map(|(a, _)| a).unwrap_or(self.cursor);
            self.cursor = line_end;
            self.selection = Some((anchor, self.cursor));
        } else {
            self.cursor = line_end;
            self.selection = None;
        }
    }

    /// Select all text.
    pub fn select_all(&mut self) {
        self.selection = Some((0, self.markdown.len()));
        self.cursor = self.markdown.len();
    }

    /// Get the selected text, if any.
    pub fn selected_text(&self) -> Option<&str> {
        self.selection_range().map(|(s, e)| &self.markdown[s..e])
    }

    /// Get the normalized selection range (start <= end).
    pub fn selection_range(&self) -> Option<(usize, usize)> {
        self.selection.map(|(a, b)| {
            if a <= b { (a, b) } else { (b, a) }
        })
    }

    /// Toggle cursor blink state.
    pub fn toggle_blink(&mut self) {
        self.cursor_visible = !self.cursor_visible;
    }

    /// Reset cursor to visible (call on any keypress).
    pub fn show_cursor(&mut self) {
        self.cursor_visible = true;
    }
}

/// Find the cursor's (x, y) position in canvas coordinates given the layout items.
/// Returns (x, y, line_height) for cursor rendering.
pub fn cursor_position(
    items: &[RenderItem],
    cursor_offset: usize,
    ctx: &CanvasRenderingContext2d,
) -> Option<(f64, f64, f64)> {
    if cursor_offset == usize::MAX {
        return None;
    }

    // Find the text item that contains or is immediately before the cursor
    let mut best: Option<(f64, f64, f64, &str, &str)> = None; // (x, y, line_h, text, font)
    let mut best_offset_diff: isize = isize::MAX;

    for item in items {
        if let RenderItem::Text {
            x, y, text, font, src_offset, src_len, ..
        } = item
        {
            if *src_offset == usize::MAX {
                continue;
            }

            let item_start = *src_offset;
            let item_end = item_start + src_len;

            // Cursor is within this text item
            if cursor_offset >= item_start && cursor_offset <= item_end {
                let char_offset = cursor_offset - item_start;
                let prefix = &text[..char_offset.min(text.len())];
                ctx.set_font(font);
                let prefix_w = ctx
                    .measure_text(prefix)
                    .map(|m| m.width())
                    .unwrap_or(0.0);

                let size: f64 = font
                    .split("px")
                    .next()
                    .and_then(|s| s.rsplit(' ').next())
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(14.0);
                let line_h = size * 1.7;

                return Some((x + prefix_w, *y, line_h));
            }

            // Track closest item for cursor-at-end-of-line cases
            let diff = (item_end as isize - cursor_offset as isize).abs();
            if diff < best_offset_diff {
                best_offset_diff = diff;
                best = Some((*x, *y, 0.0, text, font));
            }
        }
    }

    // Cursor is after all text — place at end of last item
    if let Some((x, y, _, text, font)) = best {
        ctx.set_font(font);
        let w = ctx
            .measure_text(text)
            .map(|m| m.width())
            .unwrap_or(0.0);
        let size: f64 = font
            .split("px")
            .next()
            .and_then(|s| s.rsplit(' ').next())
            .and_then(|s| s.parse().ok())
            .unwrap_or(14.0);
        Some((x + w, y, size * 1.7))
    } else {
        // Empty document — place at top-left
        Some((16.0, 16.0, 14.0 * 1.7))
    }
}

/// Find the source byte offset at a given (x, y) canvas position.
/// Returns the byte offset in the markdown source.
pub fn offset_at_position(
    items: &[RenderItem],
    doc_x: f64,
    doc_y: f64,
    ctx: &CanvasRenderingContext2d,
) -> usize {
    // Find the line that contains doc_y
    let mut best_item: Option<&RenderItem> = None;
    let mut best_y_diff = f64::MAX;

    for item in items {
        if let RenderItem::Text {
            y, font, src_offset, ..
        } = item
        {
            if *src_offset == usize::MAX {
                continue;
            }
            let size: f64 = font
                .split("px")
                .next()
                .and_then(|s| s.rsplit(' ').next())
                .and_then(|s| s.parse().ok())
                .unwrap_or(14.0);
            let line_h = size * 1.7;

            // Check if doc_y falls within this item's line
            if doc_y >= *y && doc_y < *y + line_h {
                // On this line — now check horizontal position
                if let Some(prev) = best_item {
                    if let RenderItem::Text { .. } = prev {
                        // Same line — pick the one whose x is closest
                        if let RenderItem::Text { x, .. } = item {
                            if let RenderItem::Text { x: px, .. } = prev {
                                if (*x - doc_x).abs() < (*px - doc_x).abs()
                                    || doc_x >= *x
                                {
                                    best_item = Some(item);
                                    best_y_diff = 0.0;
                                }
                            }
                        }
                    }
                } else {
                    best_item = Some(item);
                    best_y_diff = 0.0;
                }
            } else {
                let mid_y = *y + line_h / 2.0;
                let diff = (mid_y - doc_y).abs();
                if diff < best_y_diff && best_y_diff > 0.0 {
                    best_y_diff = diff;
                    best_item = Some(item);
                }
            }
        }
    }

    let item = match best_item {
        Some(i) => i,
        None => return 0,
    };

    if let RenderItem::Text {
        x, text, font, src_offset, src_len, ..
    } = item
    {
        // Binary search within the text for the character position
        ctx.set_font(font);
        let local_x = doc_x - x;

        if local_x <= 0.0 {
            return *src_offset;
        }

        // Walk character by character
        let chars: Vec<char> = text.chars().collect();
        let mut prev_w = 0.0;
        for (i, _) in chars.iter().enumerate() {
            let prefix: String = chars[..=i].iter().collect();
            let w = ctx
                .measure_text(&prefix)
                .map(|m| m.width())
                .unwrap_or(0.0);

            if local_x < (prev_w + w) / 2.0 {
                // Click is closer to before this character
                let byte_offset: usize = text[..].char_indices().nth(i).map(|(b, _)| b).unwrap_or(0);
                return src_offset + byte_offset.min(*src_len);
            }
            prev_w = w;
        }

        // Past the end of this word
        return src_offset + src_len;
    }

    0
}

/// Find previous character boundary (handles UTF-8).
fn prev_char_boundary(s: &str, pos: usize) -> usize {
    let mut p = pos.saturating_sub(1);
    while p > 0 && !s.is_char_boundary(p) {
        p -= 1;
    }
    p
}

/// Find next character boundary (handles UTF-8).
fn next_char_boundary(s: &str, pos: usize) -> usize {
    let mut p = pos + 1;
    while p < s.len() && !s.is_char_boundary(p) {
        p += 1;
    }
    p.min(s.len())
}
