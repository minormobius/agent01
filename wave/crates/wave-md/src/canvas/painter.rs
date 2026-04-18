/// Canvas painter — draws RenderItems directly via web-sys Canvas2D bindings.

use web_sys::CanvasRenderingContext2d;
use super::layout::{RenderItem, HitAction};
use super::theme;
use std::f64::consts::PI;

/// Paint the cursor at the given document coordinates.
pub fn paint_cursor(
    ctx: &CanvasRenderingContext2d,
    cursor_x: f64,
    cursor_y: f64,
    line_h: f64,
    scroll_y: f64,
    viewport_h: f64,
    visible: bool,
) {
    if !visible {
        return;
    }
    let screen_y = cursor_y - scroll_y;
    if screen_y + line_h < 0.0 || screen_y > viewport_h {
        return;
    }
    ctx.set_fill_style_str(theme::TEXT);
    ctx.fill_rect(cursor_x, screen_y, 2.0, line_h);
}

/// Paint selection highlights for the given offset range.
pub fn paint_selection(
    ctx: &CanvasRenderingContext2d,
    items: &[RenderItem],
    sel_start: usize,
    sel_end: usize,
    scroll_y: f64,
    viewport_h: f64,
) {
    ctx.set_fill_style_str("rgba(99, 102, 241, 0.3)"); // accent with transparency

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

            // Skip items entirely outside the selection
            if item_end <= sel_start || item_start >= sel_end {
                continue;
            }

            let screen_y = y - scroll_y;
            if screen_y + 30.0 < 0.0 || screen_y > viewport_h {
                continue;
            }

            // Calculate the highlighted portion within this item
            let highlight_start_byte = if sel_start > item_start {
                sel_start - item_start
            } else {
                0
            };
            let highlight_end_byte = if sel_end < item_end {
                sel_end - item_start
            } else {
                *src_len
            };

            // Measure pixel positions
            ctx.set_font(font);
            let prefix_text = &text[..highlight_start_byte.min(text.len())];
            let highlight_text =
                &text[highlight_start_byte.min(text.len())..highlight_end_byte.min(text.len())];

            let prefix_w = ctx
                .measure_text(prefix_text)
                .map(|m| m.width())
                .unwrap_or(0.0);
            let highlight_w = ctx
                .measure_text(highlight_text)
                .map(|m| m.width())
                .unwrap_or(0.0);

            let size: f64 = font
                .split("px")
                .next()
                .and_then(|s| s.rsplit(' ').next())
                .and_then(|s| s.parse().ok())
                .unwrap_or(14.0);
            let line_h = size * 1.7;

            ctx.fill_rect(x + prefix_w, screen_y, highlight_w, line_h);
        }
    }
}

/// Paint a list of render items onto a canvas context.
///
/// `scroll_y` offsets all items vertically (for scrolling).
/// `viewport_h` is the visible height — items outside are skipped.
pub fn paint(
    ctx: &CanvasRenderingContext2d,
    items: &[RenderItem],
    scroll_y: f64,
    viewport_w: f64,
    viewport_h: f64,
    dpr: f64,
) {
    // Clear
    ctx.set_fill_style_str(theme::BG);
    ctx.fill_rect(0.0, 0.0, viewport_w * dpr, viewport_h * dpr);

    // Scale for DPR
    ctx.save();
    ctx.scale(dpr, dpr).ok();

    for item in items {
        match item {
            RenderItem::Text {
                x, y, text, font, color, baseline, ..
            } => {
                let screen_y = y - scroll_y;
                // Skip if off-screen (with generous margin for line height)
                if screen_y + 40.0 < 0.0 || screen_y > viewport_h + 10.0 {
                    continue;
                }
                ctx.set_font(font);
                ctx.set_fill_style_str(color);
                ctx.fill_text(text, *x, baseline - scroll_y).ok();
            }

            RenderItem::Rect {
                x, y, w, h, color, radius,
            } => {
                let screen_y = y - scroll_y;
                if screen_y + h < 0.0 || screen_y > viewport_h {
                    continue;
                }
                ctx.set_fill_style_str(color);
                if *radius > 0.0 {
                    draw_rounded_rect(ctx, *x, screen_y, *w, *h, *radius);
                    ctx.fill();
                } else {
                    ctx.fill_rect(*x, screen_y, *w, *h);
                }
            }

            RenderItem::StrokeRect {
                x, y, w, h, color, radius,
            } => {
                let screen_y = y - scroll_y;
                if screen_y + h < 0.0 || screen_y > viewport_h {
                    continue;
                }
                ctx.set_stroke_style_str(color);
                ctx.set_line_width(1.0);
                if *radius > 0.0 {
                    draw_rounded_rect(ctx, *x, screen_y, *w, *h, *radius);
                    ctx.stroke();
                } else {
                    ctx.stroke_rect(*x, screen_y, *w, *h);
                }
            }

            RenderItem::Line {
                x1, y1, x2, y2, color, width,
            } => {
                let sy1 = y1 - scroll_y;
                let sy2 = y2 - scroll_y;
                if sy1.max(sy2) < -10.0 || sy1.min(sy2) > viewport_h + 10.0 {
                    continue;
                }
                ctx.set_stroke_style_str(color);
                ctx.set_line_width(*width);
                ctx.begin_path();
                ctx.move_to(*x1, sy1);
                ctx.line_to(*x2, sy2);
                ctx.stroke();
            }

            RenderItem::Circle { cx, cy, r, color } => {
                let screen_y = cy - scroll_y;
                if screen_y + r < 0.0 || screen_y - r > viewport_h {
                    continue;
                }
                ctx.set_fill_style_str(color);
                ctx.begin_path();
                ctx.arc(*cx, screen_y, *r, 0.0, 2.0 * PI).ok();
                ctx.fill();
            }

            RenderItem::Checkbox {
                x, y, size, checked,
            } => {
                let screen_y = y - scroll_y;
                if screen_y + size < 0.0 || screen_y > viewport_h {
                    continue;
                }
                // Box
                ctx.set_stroke_style_str(if *checked { theme::ACCENT } else { theme::BORDER });
                ctx.set_line_width(1.5);
                draw_rounded_rect(ctx, *x, screen_y, *size, *size, 3.0);
                ctx.stroke();

                if *checked {
                    // Fill
                    ctx.set_fill_style_str(theme::ACCENT);
                    draw_rounded_rect(ctx, *x, screen_y, *size, *size, 3.0);
                    ctx.fill();
                    // Checkmark
                    ctx.set_stroke_style_str("#ffffff");
                    ctx.set_line_width(2.0);
                    ctx.begin_path();
                    ctx.move_to(x + size * 0.2, screen_y + size * 0.5);
                    ctx.line_to(x + size * 0.4, screen_y + size * 0.7);
                    ctx.line_to(x + size * 0.8, screen_y + size * 0.25);
                    ctx.stroke();
                }
            }

            RenderItem::HitRegion { .. } => {
                // Hit regions are invisible — used only for hit testing
            }
        }
    }

    ctx.restore();
}

/// Hit test: find what was clicked at (x, y) in document coordinates.
pub fn hit_test(items: &[RenderItem], x: f64, y: f64) -> Option<HitAction> {
    // Iterate in reverse so topmost items match first
    for item in items.iter().rev() {
        if let RenderItem::HitRegion {
            x: rx,
            y: ry,
            w,
            h,
            action,
        } = item
        {
            if x >= *rx && x <= rx + w && y >= *ry && y <= ry + h {
                return Some(action.clone());
            }
        }
    }
    None
}

/// Draw a rounded rectangle path (does not fill or stroke).
fn draw_rounded_rect(
    ctx: &CanvasRenderingContext2d,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    r: f64,
) {
    let r = r.min(w / 2.0).min(h / 2.0);
    ctx.begin_path();
    ctx.move_to(x + r, y);
    ctx.line_to(x + w - r, y);
    ctx.arc_to(x + w, y, x + w, y + r, r).ok();
    ctx.line_to(x + w, y + h - r);
    ctx.arc_to(x + w, y + h, x + w - r, y + h, r).ok();
    ctx.line_to(x + r, y + h);
    ctx.arc_to(x, y + h, x, y + h - r, r).ok();
    ctx.line_to(x, y + r);
    ctx.arc_to(x, y, x + r, y, r).ok();
    ctx.close_path();
}
