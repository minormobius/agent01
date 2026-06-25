//! UI drawing for Ecdysium.
//!
//! Everything here is pure rendering: takes snapshots of game state
//! and paints the screen. No game logic, no side effects beyond
//! macroquad draw calls.
//!
//! Screens:
//! - `draw_intro` / `draw_game_over` — bookend splashes.
//! - `draw_class_select` — start-of-run picker.
//! - `draw_inventory` / `draw_status_screen` / `draw_use_confirm` — in-run overlays.
//! - `draw_log_sidebar` / `draw_health_bar` / `draw_armor_badge` — persistent HUD.
//!
//! Shared helpers (`wrap_text`, `overlay_panel`, `right_hud_top`,
//! colour constants) stay visible at module scope because more than
//! one drawer uses them.

use macroquad::prelude::*;

use crate::classes;
use crate::items::{ItemCategory, ItemKind};
use crate::{Inventory, InventoryEntry, LogLine};

// ── Shared palette ─────────────────────────────────────────────────

/// Phosphor-terminal green, à la the MU/TH/UR console displays in Alien.
/// Hex `#78E68C` (rgb 120, 230, 140).
pub fn retro_green() -> Color { Color::from_rgba(120, 230, 140, 255) }
/// Warning red for the game-over screen.
/// Hex `#E65A5A` (rgb 230, 90, 90).
pub fn retro_red() -> Color { Color::from_rgba(230, 90, 90, 255) }

/// Same color, different alpha. Replaces the noisy
/// `let mut x = c; x.a = 0.55` pattern that was scattered through
/// every overlay drawer.
pub fn with_alpha(c: Color, a: f32) -> Color {
    Color::new(c.r, c.g, c.b, a)
}

/// Multiplier applied to inventory / equipment icon size on top of
/// the per-row `line_h * 0.95` baseline. `1.0` = icon fits exactly
/// inside its row; `1.5` makes the sprite pop visibly larger at
/// the cost of overlapping a little into the rows above and below.
/// Tune to taste — the row spacing itself stays the same.
pub const INVENTORY_ICON_SCALE: f32 = 1.5;

// ── Shared layout helpers ──────────────────────────────────────────

/// Greedy word-wrap. Returns lines that each fit within `max_width`
/// at the given font size.
pub fn wrap_text(text: &str, max_width: f32, font_size: f32) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        let candidate = if current.is_empty() { word.to_string() }
                        else { format!("{} {}", current, word) };
        let w = measure_text(&candidate, None, font_size as u16, 1.0).width;
        if w <= max_width || current.is_empty() {
            current = candidate;
        } else {
            lines.push(std::mem::take(&mut current));
            current = word.to_string();
        }
    }
    if !current.is_empty() { lines.push(current); }
    lines
}

/// Lay out a centered panel covering ~70% of the screen. Returns the
/// rectangle and the font sizes the inventory/status screens share so
/// they read consistently. Width clamps generously — the cap was
/// previously 760px which would clip footer hints like
/// `"a-z select item | r) take all | wheel/Up/Down scroll | Esc close"`
/// at default zoom; the higher cap lets long footers and titles breathe.
pub fn overlay_panel() -> (f32, f32, f32, f32, f32, f32, f32) {
    let sw = screen_width();
    let sh = screen_height();
    let pw = (sw * 0.75).clamp(640.0, 1100.0);
    let ph = (sh * 0.78).clamp(480.0, 820.0);
    let px = (sw - pw) * 0.5;
    let py = (sh - ph) * 0.5;
    let title_size = (sh * 0.055).max(22.0);
    let body_size  = (sh * 0.032).max(16.0);
    let footer_size = (sh * 0.026).max(12.0);
    (px, py, pw, ph, title_size, body_size, footer_size)
}

/// Pixel step for one arrow-key scroll tick on overlays whose rows
/// are a single line tall (equipment slot list, crafting recipe
/// list). One full row per press; mouse-wheel keeps its per-pixel
/// grain.
pub fn overlay_scroll_step() -> f32 {
    let body_size = (screen_height() * 0.032).max(16.0);
    body_size * 2.1
}

/// Pixel step for the inventory / loot screens, whose entries are a
/// row + a wrapped description. Sized to clear the row plus enough
/// description height to put the *next* entry in view on every
/// press — one Down key never leaves the player staring at the same
/// item's description sub-lines. Mouse-wheel keeps its per-pixel
/// grain so finer adjustments stay possible.
pub fn inventory_scroll_step() -> f32 {
    let body_size = (screen_height() * 0.032).max(16.0);
    // row (2.1) + ~5 description lines (5.0) — generous on items
    // with short blurbs (the next entry pops two slots forward),
    // tight on items with the longest blurbs (the next entry sits
    // exactly at the top of the viewport).
    body_size * 7.1
}

/// Clamp `*scroll` to `[0, max_scroll]` and return the max. Pair
/// with `draw_scrollbar` — call `clamp_scroll` *before* laying out
/// content (so the y-offset is correct), draw the scrollbar after.
pub fn clamp_scroll(scroll: &mut f32, viewport_h: f32, total: f32) -> f32 {
    let max = (total - viewport_h).max(0.0);
    *scroll = scroll.clamp(0.0, max);
    max
}

/// Draw a vertical scrollbar pinned to the right edge of a panel.
/// Track height = `viewport_h`. No-op when `total <= viewport_h`.
pub fn draw_scrollbar(
    panel_right: f32,
    body_size: f32,
    viewport_top: f32,
    viewport_h: f32,
    total: f32,
    scroll: f32,
    fg: Color,
    track_bg: Color,
) {
    if total <= viewport_h { return; }
    let track_x = panel_right - body_size * 0.9;
    let track_w = body_size * 0.25;
    draw_rectangle(track_x, viewport_top, track_w, viewport_h, track_bg);
    let thumb_h = (viewport_h * viewport_h / total).max(12.0);
    let max = total - viewport_h;
    let t = (scroll / max).clamp(0.0, 1.0);
    let thumb_y = viewport_top + t * (viewport_h - thumb_h);
    draw_rectangle(track_x, thumb_y, track_w, thumb_h, fg);
}

/// Top edge of the right-side HUD stack (AC badge sitting above the HP
/// bar). Used by the event log to cap its bottom so the newest
/// entries aren't hidden behind the bars.
pub fn right_hud_top(status_h: f32) -> f32 {
    let sh = screen_height();
    let bar_h = (status_h * 0.72).max(18.0);
    let badge_h = (status_h * 0.52).max(14.0);
    let hp_y = sh - status_h + (status_h - bar_h) * 0.5;
    hp_y - badge_h - 4.0
}

// ── Pause / system menu ───────────────────────────────────────────

/// Ordered list of options shown in the pause menu. The runtime in
/// `main.rs` matches on these strings to dispatch the selection, so
/// renaming an entry here is a two-touch edit (UI label + the
/// matching arm). Future options (`Save`, `Load`, `Settings`) slot
/// in by appending to this list and adding their handlers; ordering
/// here is the display ordering.
/// `PAUSE_OPTIONS` and `TITLE_OPTIONS` store **i18n keys** rather
/// than display labels. The dispatch in `main.rs` matches on the
/// key (a stable identifier) while the renderer here calls
/// `tr(key)` to fetch the localized label. New options plug in by
/// adding the key here, the entry to the i18n table, and the
/// dispatch arm in `main.rs`.
pub const PAUSE_OPTIONS: &[&str] = &[
    "pause.option.resume",
    "pause.option.save",
    "pause.option.load",
    "pause.option.keybindings",
    "pause.option.quit_to_desktop",
];

pub const TITLE_OPTIONS: &[&str] = &[
    "title.option.new_game",
    "title.option.load_game",
    "title.option.quit_to_desktop",
];

/// Pause / system menu — opened with bare Esc when nothing else is
/// up. Quit-to-desktop lives behind this menu so a stray Esc / Q
/// can't end a run by accident. Mirrors the class-select layout for
/// visual consistency.
pub fn draw_pause_menu(selection: usize) {
    let sw = screen_width();
    let sh = screen_height();
    let green = retro_green();
    let amber = Color::from_rgba(240, 220, 80, 255);
    let dim = with_alpha(green, 0.55);

    // Backdrop dim — the dungeon underneath stays visible but
    // de-emphasised so the menu is the focal point.
    draw_rectangle(0.0, 0.0, sw, sh, Color::new(0.0, 0.0, 0.0, 0.65));

    let title_size = (sh * 0.08).max(32.0);
    let body_size  = (sh * 0.040).max(20.0);
    let line_h     = body_size * 1.7;

    let title = crate::i18n::tr("pause.title");
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title,
        (sw - td.width) * 0.5,
        sh * 0.30,
        title_size, green);

    let total_h = PAUSE_OPTIONS.len() as f32 * line_h;
    let mut y = sh * 0.45;
    let _ = total_h; // reserved for future centring rework
    for (i, key) in PAUSE_OPTIONS.iter().enumerate() {
        let is_sel = i == selection;
        let prefix = if is_sel { "> " } else { "  " };
        let color  = if is_sel { amber } else { green };
        let text = format!("{}{}", prefix, crate::i18n::tr(key));
        let dim_size = measure_text(&text, None, body_size as u16, 1.0);
        draw_text(&text,
            (sw - dim_size.width) * 0.5,
            y,
            body_size, color);
        y += line_h;
    }

    let hint = crate::i18n::tr("pause.hint");
    let hint_size = (sh * 0.026).max(14.0);
    let hd = measure_text(hint, None, hint_size as u16, 1.0);
    draw_text(hint,
        (sw - hd.width) * 0.5,
        sh * 0.88,
        hint_size, dim);
}

// ── Splash screens ─────────────────────────────────────────────────

/// Save-name text-entry overlay. Player types a slot name with
/// the cursor sitting at `cursor_pos`; default text is pre-filled
/// (sequential `save_NNN`) and selected so a single keystroke
/// replaces it.
pub fn draw_save_prompt(name: &str, cursor_pos: usize) {
    let sw = screen_width();
    let sh = screen_height();
    let green = retro_green();
    let amber = Color::from_rgba(240, 220, 80, 255);
    let dim = with_alpha(green, 0.55);

    draw_rectangle(0.0, 0.0, sw, sh, Color::new(0.0, 0.0, 0.0, 0.7));

    let title = crate::i18n::tr("ui.save.title");
    let title_size = (sh * 0.06).max(28.0);
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title, (sw - td.width) * 0.5, sh * 0.32, title_size, green);

    let label = crate::i18n::tr("ui.save.prompt_label");
    let label_size = (sh * 0.030).max(16.0);
    let ld = measure_text(label, None, label_size as u16, 1.0);
    draw_text(label, (sw - ld.width) * 0.5, sh * 0.42, label_size, dim);

    // Field bar.
    let body_size = (sh * 0.045).max(22.0);
    let bar_w = (sw * 0.5).clamp(420.0, 720.0);
    let bar_h = body_size * 1.8;
    let bar_x = (sw - bar_w) * 0.5;
    let bar_y = sh * 0.48;
    draw_rectangle(bar_x, bar_y, bar_w, bar_h, Color::new(0.10, 0.16, 0.10, 1.0));
    draw_rectangle_lines(bar_x, bar_y, bar_w, bar_h, 2.0, dim);

    // Caret blinks at 2 Hz.
    let caret_visible = (get_time() * 2.0).floor() as i64 % 2 == 0;
    let safe_cursor = cursor_pos.min(name.chars().count());
    let pre: String = name.chars().take(safe_cursor).collect();
    let post: String = name.chars().skip(safe_cursor).collect();
    let pre_w = measure_text(&pre, None, body_size as u16, 1.0).width;
    let text_x = bar_x + body_size * 0.5;
    let text_y = bar_y + bar_h * 0.72;
    draw_text(&pre, text_x, text_y, body_size, amber);
    if caret_visible {
        let caret_x = text_x + pre_w;
        let caret_w = (body_size * 0.08).max(2.0);
        draw_rectangle(caret_x, bar_y + bar_h * 0.18,
            caret_w, bar_h * 0.64, amber);
    }
    draw_text(&post, text_x + pre_w, text_y, body_size, amber);

    let hint = crate::i18n::tr("ui.save.hint");
    let hint_size = (sh * 0.026).max(14.0);
    let hd = measure_text(hint, None, hint_size as u16, 1.0);
    draw_text(hint, (sw - hd.width) * 0.5, sh * 0.88, hint_size, dim);
}

/// Load-slot picker overlay. Lists save names, most recent first,
/// with the current selection highlighted. Empty list shows a
/// "no saves" message that the player can dismiss with Esc.
pub fn draw_load_picker(slots: &[(String, Option<std::time::SystemTime>)], selection: usize) {
    let sw = screen_width();
    let sh = screen_height();
    let green = retro_green();
    let amber = Color::from_rgba(240, 220, 80, 255);
    let dim = with_alpha(green, 0.55);

    draw_rectangle(0.0, 0.0, sw, sh, Color::new(0.0, 0.0, 0.0, 0.7));

    let title = crate::i18n::tr("ui.load.title");
    let title_size = (sh * 0.06).max(28.0);
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title, (sw - td.width) * 0.5, sh * 0.20, title_size, green);

    if slots.is_empty() {
        let msg = crate::i18n::tr("ui.load.empty");
        let msg_size = (sh * 0.035).max(18.0);
        let md = measure_text(msg, None, msg_size as u16, 1.0);
        draw_text(msg, (sw - md.width) * 0.5, sh * 0.48, msg_size, dim);
    } else {
        let body_size = (sh * 0.035).max(18.0);
        let line_h = body_size * 1.6;
        let mut y = sh * 0.30;
        for (i, (name, _)) in slots.iter().enumerate() {
            let is_sel = i == selection;
            let prefix = if is_sel { "> " } else { "  " };
            let color = if is_sel { amber } else { green };
            let text = format!("{}{}", prefix, name);
            let m = measure_text(&text, None, body_size as u16, 1.0);
            draw_text(&text, (sw - m.width) * 0.5, y, body_size, color);
            y += line_h;
        }
    }

    let hint = crate::i18n::tr("ui.load.hint");
    let hint_size = (sh * 0.026).max(14.0);
    let hd = measure_text(hint, None, hint_size as u16, 1.0);
    draw_text(hint, (sw - hd.width) * 0.5, sh * 0.90, hint_size, dim);
}

/// Title screen drawn during `Phase::Title`. Two big options
/// (New Game / Load Game) plus the game logotype. The renderer is
/// kept in sync with `draw_pause_menu`'s look so the player learns
/// one menu vocabulary.
pub fn draw_title(selection: usize) {
    clear_background(Color::from_rgba(0, 0, 0, 255));
    let sw = screen_width();
    let sh = screen_height();
    let green = retro_green();
    let amber = Color::from_rgba(240, 220, 80, 255);
    let dim = with_alpha(green, 0.55);

    let title = crate::i18n::tr("intro.title");
    let title_size = (sh * 0.16).max(56.0);
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title, (sw - td.width) * 0.5, sh * 0.30, title_size, green);

    let body_size = (sh * 0.045).max(22.0);
    let line_h    = body_size * 1.8;
    let mut y = sh * 0.55;
    for (i, key) in TITLE_OPTIONS.iter().enumerate() {
        let is_sel = i == selection;
        let prefix = if is_sel { "> " } else { "  " };
        let color  = if is_sel { amber } else { green };
        let text = format!("{}{}", prefix, crate::i18n::tr(key));
        let m = measure_text(&text, None, body_size as u16, 1.0);
        draw_text(&text, (sw - m.width) * 0.5, y, body_size, color);
        y += line_h;
    }

    let hint = crate::i18n::tr("title.hint");
    let hint_size = (sh * 0.026).max(14.0);
    let hd = measure_text(hint, None, hint_size as u16, 1.0);
    draw_text(hint, (sw - hd.width) * 0.5, sh * 0.88, hint_size, dim);
}

pub fn draw_intro() {
    clear_background(Color::from_rgba(0, 0, 0, 255));
    let green = retro_green();
    let sw = screen_width();
    let sh = screen_height();

    let title = crate::i18n::tr("intro.title");
    let title_size = (sh * 0.14).max(48.0);
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title, (sw - td.width) * 0.5, sh * 0.42, title_size, green);

    if (get_time() * 2.0).floor() as i64 % 2 == 0 {
        let sub = crate::i18n::tr("intro.subtitle");
        let sub_size = (sh * 0.035).max(14.0);
        let sd = measure_text(sub, None, sub_size as u16, 1.0);
        draw_text(sub, (sw - sd.width) * 0.5, sh * 0.62, sub_size, green);
    }
}

pub fn draw_game_over(reached_level: u8, log: &[LogLine]) {
    clear_background(Color::from_rgba(0, 0, 0, 255));
    let sw = screen_width();
    let sh = screen_height();

    let title = crate::i18n::tr("ui.game_over.title");
    let title_size = (sh * 0.14).max(48.0);
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title, (sw - td.width) * 0.5, sh * 0.34, title_size, retro_red());

    let sub_text = crate::tr_fmt!("ui.game_over.reached_floor", reached_level);
    let sub_size = (sh * 0.04).max(16.0);
    let sd = measure_text(&sub_text, None, sub_size as u16, 1.0);
    draw_text(&sub_text, (sw - sd.width) * 0.5, sh * 0.44, sub_size, retro_green());

    // Recap: the last few log entries so the player knows what killed
    // them. Skip the final "You collapse" line and surface the 3 lines
    // before it — usually the attacks that took the last of their HP.
    let entry_size = (sh * 0.028).max(13.0);
    let entry_line_h = entry_size * 1.35;
    // Filter the death-line by comparing against the localized
    // template so non-English builds still skip the right entry.
    let death_line = crate::i18n::tr("log.death");
    let recap: Vec<&str> = log.iter().rev()
        .filter(|l| l.text.as_str() != death_line)
        .take(3)
        .map(|l| l.text.as_str())
        .collect();
    if !recap.is_empty() {
        let recap_top = sh * 0.54;
        let heading = crate::i18n::tr("ui.game_over.last_moments");
        let hd = measure_text(heading, None, entry_size as u16, 1.0);
        let dim = with_alpha(retro_green(), 0.65);
        draw_text(heading, (sw - hd.width) * 0.5, recap_top, entry_size, dim);
        // Oldest first so the killing blow is read last.
        for (i, line) in recap.iter().rev().enumerate() {
            let ld = measure_text(line, None, entry_size as u16, 1.0);
            draw_text(
                line,
                (sw - ld.width) * 0.5,
                recap_top + entry_line_h * (i as f32 + 1.3),
                entry_size,
                retro_green(),
            );
        }
    }

    if (get_time() * 2.0).floor() as i64 % 2 == 0 {
        let prompt = crate::i18n::tr("ui.game_over.hint");
        let ps = (sh * 0.035).max(14.0);
        let pd = measure_text(prompt, None, ps as u16, 1.0);
        draw_text(prompt, (sw - pd.width) * 0.5, sh * 0.82, ps, retro_green());
    }
}

// ── Roll stats ─────────────────────────────────────────────────────

/// Pre-class screen: the survivor's six attributes (Strength,
/// Agility, Toughness, Intelligence, Perception, Willpower), each
/// rolled 3d6, with the matching D&D modifier shown alongside.
/// Player can re-roll until they like what they see, then confirm
/// to advance into the department picker.
pub fn draw_roll_stats(stats: &crate::attributes::Attributes) {
    let sw = screen_width();
    let sh = screen_height();
    let green = retro_green();
    let dim = with_alpha(green, 0.55);
    let amber = Color::from_rgba(240, 220, 80, 255);

    clear_background(Color::from_rgba(0, 0, 0, 255));

    let title_size = (sh * 0.06).max(26.0);
    let body_size  = (sh * 0.034).max(16.0);
    let line_h     = body_size * 1.55;

    let title = crate::i18n::tr("ui.roll_stats.title_full");
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title, (sw - td.width) * 0.5, sh * 0.18, title_size, green);

    // Centre the six rows. Two columns: name on the left,
    // value (modifier) on the right; both right-aligned within
    // their respective gutters so columns line up.
    let panel_w = (sw * 0.40).clamp(320.0, 520.0);
    let panel_x = (sw - panel_w) * 0.5;
    let label_x = panel_x;
    let value_x = panel_x + panel_w;
    let mut y = sh * 0.30 + body_size;
    for (label, score) in stats.rows() {
        let modifier = crate::attributes::Attributes::modifier(score);
        let value_text = if modifier == 0 {
            format!("{}", score)
        } else if modifier > 0 {
            format!("{}  (+{})", score, modifier)
        } else {
            format!("{}  ({})", score, modifier)
        };
        draw_text(label, label_x, y, body_size, green);
        let vd = measure_text(&value_text, None, body_size as u16, 1.0);
        draw_text(&value_text, value_x - vd.width, y, body_size, amber);
        y += line_h;
    }

    // Footer hints.
    let hint_size = (sh * 0.028).max(14.0);
    let hint = crate::i18n::tr("ui.roll_stats.hint_full");
    let hd = measure_text(hint, None, hint_size as u16, 1.0);
    draw_text(hint, (sw - hd.width) * 0.5, sh * 0.86, hint_size, dim);
}

// ── Class select ──────────────────────────────────────────────────

pub fn draw_class_select(class_options: &[classes::PlayerClass], selection: usize) {
    let sw = screen_width();
    let sh = screen_height();
    let green = retro_green();
    let dim = Color::new(green.r, green.g, green.b, 0.55);
    let amber = Color::from_rgba(240, 220, 80, 255);

    // Layout: title across the top, left column for the list, right
    // column for the currently-selected class's mechanical info.
    let title_size = (sh * 0.06).max(26.0);
    let body_size  = (sh * 0.028).max(14.0);
    let label_size = (sh * 0.022).max(12.0);
    let line_h     = body_size * 1.5;

    draw_text(crate::i18n::tr("ui.class_select.title_full"),
        32.0, title_size + 16.0, title_size, green);

    // Left: class list
    let list_x = 48.0;
    let list_top = title_size * 2.6;
    let list_width = sw * 0.28;
    for (i, class) in class_options.iter().enumerate() {
        let is_selected = i == selection;
        let color = if is_selected { amber } else { green };
        let marker = if is_selected { "> " } else { "  " };
        draw_text(
            &format!("{}{}", marker, class.name()),
            list_x,
            list_top + i as f32 * line_h * 1.25,
            body_size * 1.15,
            color,
        );
    }

    // Right: selected class details
    let right_x = list_x + list_width + 40.0;
    let right_w = (sw - right_x - 40.0).max(240.0);
    let mut y = list_top;
    let class = class_options[selection];

    draw_text(class.name(), right_x, y, body_size * 1.35, amber);
    y += line_h * 1.5;

    // Wrapped description
    for line in wrap_text(class.description(), right_w, body_size) {
        draw_text(&line, right_x, y, body_size, green);
        y += body_size * 1.2;
    }
    y += line_h * 0.6;

    // Stats block
    let hp_bonus = class.hp_bonus();
    let hp_line = if hp_bonus >= 0 {
        crate::tr_fmt!("ui.class_select.hp_bonus_pos", hp_bonus)
    } else {
        crate::tr_fmt!("ui.class_select.hp_bonus_neg", hp_bonus)
    };
    let melee = class.melee_dmg_mult();
    let ranged = class.ranged_dmg_mult();
    for line in [
        hp_line,
        crate::tr_fmt!("ui.class_select.melee_pct", melee),
        crate::tr_fmt!("ui.class_select.ranged_pct", ranged),
    ] {
        draw_text(&line, right_x, y, label_size, green);
        y += label_size * 1.45;
    }
    y += line_h * 0.4;

    // Starting kit
    draw_text(crate::i18n::tr("ui.class_select.starting_kit"),
        right_x, y, label_size, dim);
    y += label_size * 1.45;
    let items = class.starting_items();
    if items.is_empty() {
        draw_text(crate::i18n::tr("ui.class_select.empty_kit"),
            right_x, y, label_size, dim);
        y += label_size * 1.45;
    } else {
        for item in &items {
            draw_text(&format!("  * {}", item.name()), right_x, y, label_size, green);
            y += label_size * 1.45;
        }
    }
    y += line_h * 0.4;

    // Special ability
    draw_text(crate::i18n::tr("ui.class_select.special"),
        right_x, y, label_size, dim);
    y += label_size * 1.45;
    for line in wrap_text(class.special_ability(), right_w, label_size) {
        draw_text(&format!("  {}", line), right_x, y, label_size, green);
        y += label_size * 1.35;
    }

    // Footer hint
    let hint = crate::i18n::tr("ui.class_select.hint_full");
    let hint_size = (sh * 0.024).max(12.0);
    let hd = measure_text(hint, None, hint_size as u16, 1.0);
    draw_text(
        hint,
        (sw - hd.width) * 0.5,
        sh - hint_size * 1.4,
        hint_size,
        dim,
    );
}

// ── Persistent HUD ─────────────────────────────────────────────────

/// Right-side persistent event log. Panel spans from the top of the
/// screen to just above the right-HUD stack. Entries stay until
/// scrolled off the top by newer ones.
pub fn draw_log_sidebar(log: &[LogLine], status_h: f32) {
    let sw = screen_width();
    let sh = screen_height();
    let panel_w = (sw * 0.22).clamp(200.0, 340.0);
    let panel_x = sw - panel_w;
    let panel_y = 0.0;
    let hud_top = right_hud_top(status_h);
    let panel_h = (hud_top - panel_y - 4.0).max(40.0);

    // Panel background + left border edge.
    draw_rectangle(panel_x, panel_y, panel_w, panel_h,
        Color::new(0.02, 0.05, 0.03, 0.72));
    let edge = with_alpha(retro_green(), 0.35);
    draw_line(panel_x, panel_y, panel_x, panel_y + panel_h, 1.0, edge);

    let title_size = (sh * 0.028).max(14.0);
    let font_size = (sh * 0.022).max(12.0);
    let pad_x = 10.0;
    let text_x = panel_x + pad_x;
    let text_w = panel_w - pad_x * 2.0;

    draw_text("- EVENT LOG -", text_x, title_size * 1.4, title_size, retro_green());
    let top = title_size * 2.6;
    let bottom_cap = panel_h - font_size * 0.6;

    // Layout newest-at-bottom, growing upward. Each entry's wrapped
    // lines are pushed in reverse so when we draw bottom-up, the first
    // line of the entry ends up ON TOP and the last line AT THE BOTTOM —
    // reading top-to-bottom as written.
    let line_h = font_size * 1.25;
    let mut wrapped: Vec<String> = Vec::new();
    for entry in log.iter().rev() {
        let mut lines = wrap_text(&entry.text, text_w, font_size);
        lines.reverse();
        for line in lines {
            wrapped.push(line);
        }
        let used = wrapped.len() as f32 * line_h;
        if used >= bottom_cap - top { break; }
    }

    let mut y = bottom_cap;
    for (i, line) in wrapped.iter().enumerate() {
        if y < top { break; }
        // Newest line is solid green; older lines dim slowly so recency
        // is still legible without a hard fade-out.
        let mut c = retro_green();
        c.a = (1.0 - (i as f32 * 0.05)).clamp(0.45, 1.0);
        draw_text(line, text_x, y, font_size, c);
        y -= line_h;
    }
}

/// Qud-style HP readout: a bar that depletes behind a crisp "HP: N/M"
/// numeric overlay. Numbers are the source of truth — the bar is a
/// secondary glance indicator. Fill colour shifts green → amber → red
/// as the ratio drops below 50% / 25%.
pub fn draw_health_bar(hp: u32, hp_max: u32, status_h: f32) {
    let sw = screen_width();
    let sh = screen_height();
    let bar_h = (status_h * 0.72).max(18.0);
    let bar_w = (sw * 0.16).clamp(140.0, 220.0);
    let margin = 14.0;
    let x = sw - bar_w - margin;
    let y = sh - status_h + (status_h - bar_h) * 0.5;

    draw_rectangle(x, y, bar_w, bar_h, Color::from_rgba(18, 20, 24, 230));

    let max = hp_max.max(1);
    let ratio = (hp as f32 / max as f32).clamp(0.0, 1.0);
    let fill_w = bar_w * ratio;
    let fill = if hp * 2 >= max {
        Color::from_rgba(180, 55, 55, 255)
    } else if hp * 4 >= max {
        Color::from_rgba(210, 150, 40, 255)
    } else {
        Color::from_rgba(235, 80, 60, 255)
    };
    draw_rectangle(x, y, fill_w, bar_h, fill);

    let edge = with_alpha(retro_green(), 0.85);
    draw_rectangle_lines(x, y, bar_w, bar_h, 1.5, edge);

    let label = crate::tr_fmt!("ui.hud.hp_value", hp, hp_max);
    let text_size = bar_h * 0.68;
    let td = measure_text(&label, None, text_size as u16, 1.0);
    let tx = x + (bar_w - td.width) * 0.5;
    let ty = y + bar_h * 0.5 + text_size * 0.35;
    draw_text(&label, tx, ty, text_size, WHITE);
}

/// "AC: N" badge sitting directly above the HP bar, sharing its right
/// edge and width. Reads as a second small gauge stacked on the main
/// one.
pub fn draw_armor_badge(ac: i32, status_h: f32) {
    let sw = screen_width();
    let sh = screen_height();
    let bar_h  = (status_h * 0.72).max(18.0);
    let bar_w  = (sw * 0.16).clamp(140.0, 220.0);
    let badge_h = (status_h * 0.52).max(14.0);
    let margin = 14.0;
    let x = sw - bar_w - margin;
    let hp_y = sh - status_h + (status_h - bar_h) * 0.5;
    let y = hp_y - badge_h - 4.0;

    draw_rectangle(x, y, bar_w, badge_h, Color::from_rgba(18, 20, 24, 230));
    let edge = with_alpha(retro_green(), 0.75);
    draw_rectangle_lines(x, y, bar_w, badge_h, 1.0, edge);

    let label = crate::tr_fmt!("ui.hud.ac_value", ac);
    let text_size = badge_h * 0.70;
    let td = measure_text(&label, None, text_size as u16, 1.0);
    let tx = x + (bar_w - td.width) * 0.5;
    let ty = y + badge_h * 0.5 + text_size * 0.35;
    draw_text(&label, tx, ty, text_size, WHITE);
}

// ── Overlays ──────────────────────────────────────────────────────

/// Which screen of the item prompt is currently shown — the action
/// menu (the default) or the description blurb the player asked for
/// via Examine.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemPromptMode {
    Actions,
    Examining,
}

/// Whether the prompt is being driven by the inventory screen (full
/// Use / Equip verbs) or the loot screen (Examine + Take + optional
/// Equip). The renderer routes this to pick which verbs to show;
/// the input handler in `main.rs` reads the same flag to decide
/// which keypress to act on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemPromptContext {
    Inventory,
    Loot,
}

/// Build the stat lines shown under the description on the Examine
/// view. Only emits lines for fields that *carry information* —
/// items with no mechanical attributes (raw crafting components,
/// the admin keycard) return an empty Vec, and the caller hides the
/// stats block entirely.
fn item_stat_lines(kind: ItemKind) -> Vec<String> {
    use crate::items::{UseEffect, ItemKind};
    let t = kind.template();
    let mut lines: Vec<String> = Vec::new();

    // Equip-shape lines: slot label, two-handed flag, AC bonus.
    if t.equippable {
        let slot = t.equip_slot.map(|s| s.label()).unwrap_or("-");
        if t.two_handed {
            lines.push(crate::tr_fmt!("ui.item_stats.slot_two_handed", slot));
        } else {
            lines.push(crate::tr_fmt!("ui.item_stats.slot", slot));
        }
    }
    if t.ac_bonus != 0 {
        // Pre-format the signed integer with an explicit `+` so the
        // template stays a plain `{0}` substitution.
        let signed = format!("{:+}", t.ac_bonus);
        lines.push(crate::tr_fmt!("ui.item_stats.ac_bonus", signed));
    }

    // Light source: bright + dim radii while equipped.
    if let Some(light) = t.light_source {
        lines.push(crate::tr_fmt!("ui.item_stats.light",
            light.bright_radius, light.dim_radius));
    }

    // Use effect: heal amount, special action, etc.
    if t.useable {
        match t.use_effect {
            UseEffect::Heal(n) =>
                lines.push(crate::tr_fmt!("ui.item_stats.use_heal", n)),
            UseEffect::None => {}
        }
    }

    // Weapon profiles — melee always, ranged when present.
    if let ItemKind::Weapon(w) = kind {
        let wt = w.template();
        let m = &wt.melee;
        if m.damage_min == m.damage_max {
            lines.push(crate::tr_fmt!("ui.item_stats.melee_flat", m.damage_min));
        } else {
            lines.push(crate::tr_fmt!("ui.item_stats.melee_range",
                m.damage_min, m.damage_max));
        }
        if let Some(r) = wt.ranged {
            let a = &r.attack;
            if a.damage_min == a.damage_max {
                lines.push(crate::tr_fmt!("ui.item_stats.ranged_flat", a.damage_min));
            } else {
                lines.push(crate::tr_fmt!("ui.item_stats.ranged_range",
                    a.damage_min, a.damage_max));
            }
            lines.push(crate::tr_fmt!("ui.item_stats.range_tiles",
                r.hit_scan_range as i32));
            // Pre-format float with two decimals; template keeps `{0}s`.
            let cooldown = format!("{:.2}", r.fire_cooldown);
            lines.push(crate::tr_fmt!("ui.item_stats.fire_cooldown", cooldown));
        }
    }

    lines
}

/// Modal item-action prompt. Used by both the inventory and the loot
/// screen — `context` decides which verbs the menu offers. Inventory
/// shows Examine plus Use / Equip (gated by template flags); Loot
/// shows Examine + Take.
pub fn draw_item_prompt(kind: ItemKind, mode: ItemPromptMode, context: ItemPromptContext) {
    let sw = screen_width();
    let sh = screen_height();
    let template = kind.template();

    // Extra backdrop to set this apart from the inventory panel behind.
    draw_rectangle(0.0, 0.0, sw, sh, Color::new(0.0, 0.0, 0.0, 0.35));

    let green = retro_green();
    let amber = Color::from_rgba(240, 220, 80, 255);
    let dim = with_alpha(green, 0.65);

    let title_size = (sh * 0.038).max(18.0);
    let body_size  = (sh * 0.028).max(14.0);
    let line_h     = body_size * 1.45;

    match mode {
        ItemPromptMode::Actions => {
            // Build the list of action lines so the panel sizes to
            // exactly the verbs this context supports.
            let can_ready = template.extra_equip_slots
                .contains(&crate::items::EquipSlot::ReadyWeapon);
            let mut lines: Vec<&'static str> = Vec::with_capacity(4);
            lines.push("e) Examine");
            match context {
                ItemPromptContext::Inventory => {
                    if template.useable     { lines.push("u) Use"); }
                    if template.equippable  { lines.push("q) Equip"); }
                    // Weapons (and anything else that lists
                    // ReadyWeapon as a valid alternate slot) get a
                    // direct "stash in reserve" shortcut so the
                    // player doesn't have to walk through the
                    // equipment screen to fill the ready slot.
                    if can_ready            { lines.push("r) Ready"); }
                }
                ItemPromptContext::Loot => {
                    lines.push("t) Take");
                    // Equip-from-container short-cut: takes the item
                    // out of the container and slots it directly,
                    // skipping the "take, then open inventory, then
                    // equip" three-step.
                    if template.equippable  { lines.push("q) Equip"); }
                }
            }

            let pw = (sw * 0.40).clamp(320.0, 500.0);
            let ph = (title_size * 1.6 + 0.5
                + lines.len() as f32 * line_h
                + body_size * 2.4)
                .max(140.0);
            let px = (sw - pw) * 0.5;
            let py = (sh - ph) * 0.5;
            draw_rectangle(px, py, pw, ph, Color::new(0.05, 0.08, 0.06, 1.0));
            draw_rectangle_lines(px, py, pw, ph, 2.0, amber);

            let title = crate::tr_fmt!("ui.examine.title", kind.name());
            let td = measure_text(&title, None, title_size as u16, 1.0);
            draw_text(&title,
                px + (pw - td.width) * 0.5,
                py + title_size * 1.6,
                title_size, green);

            let mut y = py + title_size * 2.6;
            for line in &lines {
                draw_text(line, px + body_size, y, body_size, amber);
                y += line_h;
            }

            let hint = crate::i18n::tr("ui.examine.cancel_hint");
            let hd = measure_text(hint, None, body_size as u16, 1.0);
            draw_text(hint,
                px + (pw - hd.width) * 0.5,
                py + ph - body_size * 1.2,
                body_size, dim);
        }
        ItemPromptMode::Examining => {
            // Wider panel for the description; height is whatever the
            // wrapped text needs plus title + footer slack.
            let pw = (sw * 0.50).clamp(360.0, 640.0);
            let inner_w = pw - body_size * 2.0;
            let desc_lines = wrap_text(template.description, inner_w, body_size);
            // Stat block — AC bonus, damage range, slot, light radii,
            // use effect, etc. Pulled by `item_stat_lines` so the
            // description blurb stays prose-only and the mechanical
            // info is one block of consistent labels.
            let stat_lines = item_stat_lines(kind);
            let stat_line_h = body_size * 1.15;
            let stats_h = if stat_lines.is_empty() {
                0.0
            } else {
                body_size * 0.6 + stat_lines.len() as f32 * stat_line_h
            };
            let ph = (title_size * 1.6
                + 0.5 + (desc_lines.len() as f32) * (body_size * 1.25)
                + stats_h
                + body_size * 3.0)
                .max(160.0);
            let px = (sw - pw) * 0.5;
            let py = (sh - ph) * 0.5;
            draw_rectangle(px, py, pw, ph, Color::new(0.05, 0.08, 0.06, 1.0));
            draw_rectangle_lines(px, py, pw, ph, 2.0, amber);

            let title = crate::tr_fmt!("ui.examine.title", kind.name());
            let td = measure_text(&title, None, title_size as u16, 1.0);
            draw_text(&title,
                px + (pw - td.width) * 0.5,
                py + title_size * 1.6,
                title_size, green);

            let mut y = py + title_size * 2.6;
            for line in &desc_lines {
                draw_text(line, px + body_size, y, body_size, green);
                y += body_size * 1.25;
            }
            // Stat block: amber labels under the description. Empty
            // for items with no mechanical attributes (the keycard,
            // raw crafting components).
            if !stat_lines.is_empty() {
                y += body_size * 0.6;
                for line in &stat_lines {
                    draw_text(line, px + body_size, y, body_size, amber);
                    y += stat_line_h;
                }
            }

            let hint = crate::i18n::tr("ui.examine.back_hint");
            let hd = measure_text(hint, None, body_size as u16, 1.0);
            draw_text(hint,
                px + (pw - hd.width) * 0.5,
                py + ph - body_size * 1.2,
                body_size, dim);
        }
    }
}

pub fn draw_inventory(
    sprites: &crate::render::pixel::Sprites,
    inventory: &Inventory,
    collapsed: &std::collections::HashSet<ItemCategory>,
    scroll: &mut f32,
) {
    draw_rectangle(0.0, 0.0, screen_width(), screen_height(),
        Color::new(0.0, 0.0, 0.0, 0.75));
    let (px, py, pw, ph, title_size, body_size, footer_size) = overlay_panel();
    let green = retro_green();
    let dim = with_alpha(green, 0.55);
    let faint = with_alpha(green, 0.30);
    let amber = Color::from_rgba(240, 220, 80, 255);
    draw_rectangle(px, py, pw, ph, Color::new(0.02, 0.05, 0.02, 1.0));
    draw_rectangle_lines(px, py, pw, ph, 2.0, green);

    let title = "- INVENTORY -";
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title, px + (pw - td.width) * 0.5,
        py + title_size * 1.4, title_size, green);

    // Content area bounds — the scroll region clips to this.
    let content_x = px + body_size;
    let content_top = py + title_size * 2.4;
    let content_bottom = py + ph - footer_size * 2.4;
    let content_w = pw - body_size * 2.4;
    let desc_w = content_w - body_size;
    // Entry rows are tall enough to hold a 32×32 icon at ~50%
    // larger than text-row baseline (~2.1× body_size). Icon size
    // mirrors the row height so floor-pickup sprites read cleanly
    // in the bag.
    let line_h = body_size * 2.1;
    let desc_line_h = body_size * 1.0;

    // Build the linear "display list": a Vec of rendered lines with
    // per-line colour. Sections are rendered whether or not they have
    // items, so the player sees the whole structure.
    enum DisplayLine {
        Header { label: String, color: Color },
        Empty  { label: String, color: Color },
        Entry  { label: String, color: Color, kind: ItemKind },
        Desc   { text: String,  color: Color, step: f32 },
    }
    let mut lines: Vec<DisplayLine> = Vec::new();
    let mut letter_cursor = 0usize;
    for (ci, cat) in ItemCategory::ALL.iter().enumerate() {
        let is_collapsed = collapsed.contains(cat);
        let count = inventory.entries.iter()
            .filter(|e| e.kind.category() == *cat).count();
        let marker = if is_collapsed { "[+]" } else { "[-]" };
        let header = format!("{marker} {}  ({count})  - press {}",
            cat.label(), ci + 1);
        lines.push(DisplayLine::Header { label: header, color: amber });

        if is_collapsed { continue; }

        if count == 0 {
            lines.push(DisplayLine::Empty {
                label: "  (nothing)".to_string(),
                color: dim,
            });
            continue;
        }

        for entry in inventory.entries.iter().filter(|e| e.kind.category() == *cat) {
            let letter = (b'a' + letter_cursor as u8) as char;
            letter_cursor += 1;
            let label = format!("{}) {}  x{}", letter, entry.kind.name(), entry.count);
            lines.push(DisplayLine::Entry {
                label, color: green, kind: entry.kind,
            });
            for (i, wl) in wrap_text(entry.kind.description(), desc_w, body_size * 0.8)
                .into_iter().enumerate()
            {
                lines.push(DisplayLine::Desc {
                    text: wl,
                    color: dim,
                    step: if i == 0 { desc_line_h * 0.9 } else { desc_line_h },
                });
            }
        }
    }

    let total_h: f32 = lines.iter().map(|l| match l {
        DisplayLine::Header { .. } => line_h,
        DisplayLine::Empty  { .. } => desc_line_h,
        DisplayLine::Entry  { .. } => line_h,
        DisplayLine::Desc   { step, .. } => *step,
    }).sum();
    let viewport_h = content_bottom - content_top;
    clamp_scroll(scroll, viewport_h, total_h);

    // Icon draws to the left of each Entry line. Baseline size is
    // `line_h * 0.95` — INVENTORY_ICON_SCALE multiplies that to
    // make the sprite pop without changing row spacing.
    let icon_size = line_h * 0.95 * INVENTORY_ICON_SCALE;
    let icon_gutter = icon_size + body_size * 0.4;

    let mut y = content_top - *scroll;
    for line in &lines {
        let h_step = match line {
            DisplayLine::Header { .. } | DisplayLine::Entry { .. } => line_h,
            DisplayLine::Empty { .. }  => desc_line_h,
            DisplayLine::Desc { step, .. } => *step,
        };
        let y_top = y;
        let y_bot = y + h_step;
        if y_bot >= content_top && y_top <= content_bottom {
            match line {
                DisplayLine::Entry { label, color, kind } => {
                    // Icon centered vertically in the row.
                    let icon_y = y + (line_h - icon_size) * 0.5;
                    crate::render::pixel::draw_item_icon(
                        sprites, kind.template().sprite,
                        content_x, icon_y, icon_size, WHITE,
                    );
                    draw_text(label, content_x + icon_gutter,
                        y + body_size, body_size, *color);
                }
                DisplayLine::Header { label, color }
                | DisplayLine::Empty { label, color } => {
                    let size = match line {
                        DisplayLine::Empty { .. } => body_size * 0.9,
                        _ => body_size,
                    };
                    draw_text(label, content_x, y + size, size, *color);
                }
                DisplayLine::Desc { text, color, .. } => {
                    // Description text aligns with the entry label
                    // so it visually belongs to the icon-having row
                    // above it.
                    let size = body_size * 0.8;
                    draw_text(text, content_x + icon_gutter, y + size, size, *color);
                }
            }
        }
        y += h_step;
    }

    draw_scrollbar(px + pw, body_size, content_top, viewport_h,
        total_h, *scroll, green, faint);

    let footer = "a-z select item  |  1-5 toggle section  |  wheel/Up/Down scroll  |  Esc close";
    let fd = measure_text(footer, None, footer_size as u16, 1.0);
    draw_text(footer,
        px + (pw - fd.width) * 0.5,
        py + ph - footer_size * 1.5,
        footer_size, dim);
}

/// Looting screen — same overlay shape as the inventory but with
/// the *container's* contents in a flat list (no category headers,
/// since corpses / lockers / crates rarely warrant categorisation).
/// Each row carries the item's icon + name; letter hotkeys feed
/// `pending_loot_prompt` in `main.rs`, which then routes through
/// the shared `draw_item_prompt` (in `ItemPromptContext::Loot` mode)
/// to offer Examine + Take.
pub fn draw_loot_screen(
    sprites: &crate::render::pixel::Sprites,
    container_name: &str,
    contents: &[ItemKind],
    scroll: &mut f32,
) {
    draw_rectangle(0.0, 0.0, screen_width(), screen_height(),
        Color::new(0.0, 0.0, 0.0, 0.75));
    let (px, py, pw, ph, title_size, body_size, footer_size) = overlay_panel();
    let green = retro_green();
    let dim = with_alpha(green, 0.55);
    let faint = with_alpha(green, 0.30);
    let amber = Color::from_rgba(240, 220, 80, 255);
    draw_rectangle(px, py, pw, ph, Color::new(0.02, 0.05, 0.02, 1.0));
    draw_rectangle_lines(px, py, pw, ph, 2.0, green);

    let title = format!("- LOOTING: {} -", container_name.to_uppercase());
    let td = measure_text(&title, None, title_size as u16, 1.0);
    draw_text(&title, px + (pw - td.width) * 0.5,
        py + title_size * 1.4, title_size, green);

    let content_x = px + body_size;
    let content_top = py + title_size * 2.4;
    let content_bottom = py + ph - footer_size * 2.4;
    let viewport_h = content_bottom - content_top;
    let content_w = pw - body_size * 2.4;
    let desc_w = content_w - body_size;
    let line_h = body_size * 2.1;
    let desc_line_h = body_size * 1.0;
    let icon_size = line_h * 0.95 * INVENTORY_ICON_SCALE;
    let icon_gutter = icon_size + body_size * 0.4;

    if contents.is_empty() {
        draw_text(crate::i18n::tr("ui.loot.empty"),
            content_x, content_top + body_size, body_size, dim);
    } else {
        // Build entry rows + their wrapped descriptions, same shape
        // as the inventory's display list. No category headers —
        // every entry sits at the top level.
        let mut rows: Vec<(String, ItemKind, Vec<String>)> = Vec::with_capacity(contents.len());
        for (i, kind) in contents.iter().enumerate() {
            let letter = (b'a' + i as u8) as char;
            let label = format!("{}) {}", letter, kind.name());
            let desc_lines = wrap_text(kind.description(), desc_w, body_size * 0.8);
            rows.push((label, *kind, desc_lines));
        }

        let total_h: f32 = rows.iter()
            .map(|(_, _, d)| line_h + d.len() as f32 * desc_line_h)
            .sum();
        clamp_scroll(scroll, viewport_h, total_h);

        let mut y = content_top - *scroll;
        for (label, kind, desc_lines) in &rows {
            let row_top = y;
            let row_bot = y + line_h;
            if row_bot >= content_top && row_top <= content_bottom {
                let icon_y = y + (line_h - icon_size) * 0.5;
                crate::render::pixel::draw_item_icon(
                    sprites, kind.template().sprite,
                    content_x, icon_y, icon_size, WHITE,
                );
                draw_text(label, content_x + icon_gutter,
                    y + body_size, body_size, green);
            }
            y += line_h;
            for dl in desc_lines {
                if y + desc_line_h >= content_top && y <= content_bottom {
                    draw_text(dl, content_x + icon_gutter,
                        y + body_size * 0.8, body_size * 0.8, dim);
                }
                y += desc_line_h;
            }
        }

        draw_scrollbar(px + pw, body_size, content_top, viewport_h,
            total_h, *scroll, green, faint);
    }

    let _ = amber;  // reserved for future "loot all" prompt etc.
    let footer = "a-z select item  |  r) take all  |  wheel/Up/Down scroll  |  Esc close";
    let fd = measure_text(footer, None, footer_size as u16, 1.0);
    draw_text(footer,
        px + (pw - fd.width) * 0.5,
        py + ph - footer_size * 1.5,
        footer_size, dim);
}

/// Crafting screen — list view + detail view + quantity prompt.
///
/// **List view** (`focus` is `None`): one row per recipe, with letter
/// hotkey + a "ready / N short" availability tag. Letters select.
///
/// **Detail view** (`focus = Some(idx)`): the selected recipe's
/// ingredients with `have / need` counts; lines for missing
/// requirements render in red so the bottleneck pops at a glance.
/// Tools render with a separate "(tool)" tag — required to be
/// present, not consumed. The footer offers `f) craft` which the
/// caller routes through to the quantity prompt.
///
/// **Quantity prompt** (`quantity_prompt = Some(_)`): a small modal
/// over the detail view with `Up / Down` to adjust and `Enter` to
/// confirm. Caller passes the current value + max so the renderer
/// can clamp the displayed slider.
pub fn draw_crafting(
    sprites: &crate::render::pixel::Sprites,
    inventory: &Inventory,
    focus: Option<usize>,
    quantity_prompt: Option<(u32, u32)>,
    scroll: &mut f32,
) {
    use crate::recipes::{ALL, count_in_inventory, max_craftable};

    draw_rectangle(0.0, 0.0, screen_width(), screen_height(),
        Color::new(0.0, 0.0, 0.0, 0.75));
    let (px, py, pw, ph, title_size, body_size, footer_size) = overlay_panel();
    let green = retro_green();
    let dim   = with_alpha(green, 0.55);
    let faint = with_alpha(green, 0.30);
    let amber = Color::from_rgba(240, 220, 80, 255);
    let red   = retro_red();
    draw_rectangle(px, py, pw, ph, Color::new(0.02, 0.05, 0.02, 1.0));
    draw_rectangle_lines(px, py, pw, ph, 2.0, green);

    let title = "- CRAFTING -";
    let td = measure_text(title, None, title_size as u16, 1.0);
    draw_text(title, px + (pw - td.width) * 0.5,
        py + title_size * 1.4, title_size, green);

    let content_x = px + body_size;
    let content_top = py + title_size * 2.4;
    let content_bottom = py + ph - footer_size * 2.4;
    let viewport_h = content_bottom - content_top;
    let content_w = pw - body_size * 2.4;
    let line_h = body_size * 2.1;
    let icon_size = line_h * 0.95 * INVENTORY_ICON_SCALE;
    let icon_gutter = icon_size + body_size * 0.4;

    // ── Detail view ────────────────────────────────────────────────
    if let Some(idx) = focus {
        if let Some(recipe) = ALL.get(idx) {
            let max = max_craftable(inventory, recipe);
            // Header line: result name + how many we could make.
            let header = format!("{}  (can craft x{})", recipe.name(), max);
            draw_text(&header, content_x,
                content_top + body_size * 1.1, body_size * 1.15, amber);
            let mut y = content_top + body_size * 2.6;

            // Wrapped result description.
            for line in wrap_text(recipe.result.description(),
                                  content_w, body_size) {
                draw_text(&line, content_x, y, body_size, green);
                y += body_size * 1.25;
            }
            y += body_size * 0.6;

            draw_text(crate::i18n::tr("ui.crafting.requires"),
                content_x, y, body_size, dim);
            y += body_size * 1.4;
            for &(kind, need) in recipe.requirements {
                let have = count_in_inventory(inventory, kind);
                let label = format!("  {} {}/{}",
                    kind.name(), have, need);
                let color = if have >= need { green } else { red };
                draw_text(&label, content_x, y, body_size, color);
                y += body_size * 1.25;
            }
            if let Some(tool) = recipe.tool {
                let have = count_in_inventory(inventory, tool);
                let status_key = if have > 0 {
                    "ui.crafting.req_ok"
                } else {
                    "ui.crafting.req_missing"
                };
                let label = format!("  {} (tool, not consumed)  {}",
                    tool.name(), crate::i18n::tr(status_key));
                let color = if have > 0 { green } else { red };
                draw_text(&label, content_x, y, body_size, color);
                y += body_size * 1.25;
            }

            // Quantity prompt overlay — sits on top of the detail
            // view, dims everything beneath. Caller manages its
            // own state; the renderer just paints.
            if let Some((qty, max)) = quantity_prompt {
                draw_rectangle(0.0, 0.0, screen_width(), screen_height(),
                    Color::new(0.0, 0.0, 0.0, 0.55));
                let pw2 = (screen_width() * 0.40).clamp(320.0, 500.0);
                let ph2 = body_size * 7.0;
                let px2 = (screen_width() - pw2) * 0.5;
                let py2 = (screen_height() - ph2) * 0.5;
                draw_rectangle(px2, py2, pw2, ph2, Color::new(0.05, 0.08, 0.06, 1.0));
                draw_rectangle_lines(px2, py2, pw2, ph2, 2.0, amber);

                let q_title = crate::tr_fmt!("ui.crafting.craft_recipe", recipe.name());
                let qtd = measure_text(&q_title, None, body_size as u16, 1.0);
                draw_text(&q_title,
                    px2 + (pw2 - qtd.width) * 0.5,
                    py2 + body_size * 1.5,
                    body_size, green);

                let qty_text = format!("{} / {}", qty, max);
                let qd = measure_text(&qty_text, None, (body_size * 1.6) as u16, 1.0);
                draw_text(&qty_text,
                    px2 + (pw2 - qd.width) * 0.5,
                    py2 + body_size * 3.6,
                    body_size * 1.6, amber);

                let hint = crate::i18n::tr("ui.crafting.qty_hint_full");
                let hd = measure_text(hint, None, footer_size as u16, 1.0);
                draw_text(hint,
                    px2 + (pw2 - hd.width) * 0.5,
                    py2 + ph2 - body_size * 0.9,
                    footer_size, dim);
            }

            let footer = if max > 0 {
                "f) craft  -  Esc back"
            } else {
                "(missing components)  -  Esc back"
            };
            let fd = measure_text(footer, None, footer_size as u16, 1.0);
            draw_text(footer,
                px + (pw - fd.width) * 0.5,
                py + ph - footer_size * 1.5,
                footer_size, dim);
            return;
        }
    }

    // ── List view ──────────────────────────────────────────────────
    let total_h: f32 = ALL.len() as f32 * line_h;
    clamp_scroll(scroll, viewport_h, total_h);

    let mut y = content_top - *scroll;
    for (i, recipe) in ALL.iter().enumerate() {
        let row_top = y;
        let row_bot = y + line_h;
        if row_bot >= content_top && row_top <= content_bottom {
            let max = max_craftable(inventory, recipe);
            let letter = (b'a' + i as u8) as char;
            let tag = if max > 0 {
                format!("(ready x{})", max)
            } else {
                "(missing parts)".to_string()
            };
            let label = format!("{}) {}  {}", letter, recipe.name(), tag);
            let color = if max > 0 { green } else { dim };
            let icon_y = y + (line_h - icon_size) * 0.5;
            crate::render::pixel::draw_item_icon(
                sprites, recipe.result.template().sprite,
                content_x, icon_y, icon_size, WHITE,
            );
            draw_text(&label, content_x + icon_gutter,
                y + body_size, body_size, color);
        }
        y += line_h;
    }

    draw_scrollbar(px + pw, body_size, content_top, viewport_h,
        total_h, *scroll, green, faint);

    let _ = faint;
    let footer = "a-z select recipe  |  wheel/Up/Down scroll  |  Esc close";
    let fd = measure_text(footer, None, footer_size as u16, 1.0);
    draw_text(footer,
        px + (pw - fd.width) * 0.5,
        py + ph - footer_size * 1.5,
        footer_size, dim);
}

/// Equipment screen — slot list with current contents, plus a
/// per-slot zoom view when `focus` is set. Two-handed items in the
/// right hand block the left hand: that row renders as "(blocked
/// by …)" instead of "(empty)".
///
/// Letter hotkeys (a..j) map to `EquipSlot::ALL` in declaration
/// order. When zoomed into a slot, `Examine` / `Unequip` show up
/// for filled slots and a compatible-items list shows up for empty
/// slots; `examining` swaps the panel for the focused item's
/// description blurb.
pub fn draw_equipment(
    sprites: &crate::render::pixel::Sprites,
    equipment: &crate::PlayerEquipment,
    inventory: &Inventory,
    focus: Option<crate::items::EquipSlot>,
    examining: bool,
    scroll: &mut f32,
) {
    use crate::items::EquipSlot;
    draw_rectangle(0.0, 0.0, screen_width(), screen_height(),
        Color::new(0.0, 0.0, 0.0, 0.75));
    let (px, py, pw, ph, title_size, body_size, footer_size) = overlay_panel();
    let green = retro_green();
    let dim = with_alpha(green, 0.55);
    let amber = Color::from_rgba(240, 220, 80, 255);
    draw_rectangle(px, py, pw, ph, Color::new(0.02, 0.05, 0.02, 1.0));
    draw_rectangle_lines(px, py, pw, ph, 2.0, green);

    let title_str = "- EQUIPMENT -";
    let td = measure_text(title_str, None, title_size as u16, 1.0);
    draw_text(title_str, px + (pw - td.width) * 0.5,
        py + title_size * 1.4, title_size, green);

    let content_x = px + body_size;
    let content_top = py + title_size * 2.4;

    // ── Examining sub-screen ─────────────────────────────────────
    if examining {
        if let Some(slot) = focus {
            if let Some(kind) = equipment.get(slot) {
                draw_text(&format!("{} - {}", slot.label(), kind.name()),
                    content_x, content_top + body_size,
                    body_size * 1.1, amber);
                let desc_w = pw - body_size * 2.4;
                let mut y = content_top + body_size * 2.6;
                for line in wrap_text(kind.description(), desc_w, body_size) {
                    draw_text(&line, content_x, y, body_size, green);
                    y += body_size * 1.25;
                }
                let footer = crate::i18n::tr("ui.examine.back_hint");
                let fd = measure_text(footer, None, footer_size as u16, 1.0);
                draw_text(footer,
                    px + (pw - fd.width) * 0.5,
                    py + ph - footer_size * 1.5,
                    footer_size, dim);
                return;
            }
        }
    }

    // ── Zoomed slot view ─────────────────────────────────────────
    if let Some(slot) = focus {
        let label = slot.label();
        let line_h = body_size * 2.1;
        let icon_size = line_h * 0.95 * INVENTORY_ICON_SCALE;
        let icon_gutter = icon_size + body_size * 0.4;
        draw_text(label, content_x,
            content_top + body_size, body_size * 1.2, amber);
        let header_bottom = content_top + body_size * 2.6;
        let content_bottom = py + ph - footer_size * 2.4;
        if let Some(kind) = equipment.get(slot) {
            // Filled slot — short, fixed-height layout.
            let mut y = header_bottom;
            crate::render::pixel::draw_item_icon(
                sprites, kind.template().sprite,
                content_x, y, icon_size, WHITE,
            );
            draw_text(&format!("{}", kind.name()),
                content_x + icon_gutter, y + body_size, body_size, green);
            y += line_h + body_size * 0.4;
            for line in [
                "e) Examine".to_string(),
                "u) Unequip".to_string(),
            ] {
                draw_text(&line, content_x + body_size, y, body_size, amber);
                y += body_size * 1.4;
            }
            *scroll = 0.0;
        } else {
            // Empty slot — list compatible items from inventory.
            // Header pinned, list scrolls underneath. Compatibility
            // honours both the primary `equip_slot` and any
            // `extra_equip_slots` declared by the item template, so
            // weapons show up under `ReadyWeapon`, hand lamps under
            // the belt pouches, etc.
            let compatible: Vec<&InventoryEntry> = inventory.entries.iter()
                .filter(|e| {
                    let t = e.kind.template();
                    t.equip_slot == Some(slot)
                        || t.extra_equip_slots.contains(&slot)
                })
                .collect();
            let header_key = if compatible.is_empty() {
                "ui.equipment.no_compatible"
            } else {
                "ui.equipment.equip_from_inventory"
            };
            draw_text(
                crate::i18n::tr(header_key),
                content_x + body_size, header_bottom + body_size,
                body_size, dim,
            );
            let list_top = header_bottom + line_h * 0.7;
            let list_viewport = (content_bottom - list_top).max(0.0);
            let list_total = compatible.len() as f32 * line_h;
            clamp_scroll(scroll, list_viewport, list_total);
            let mut y = list_top - *scroll;
            let mut letter = b'a';
            for entry in &compatible {
                let row_top = y;
                let row_bot = y + line_h;
                if row_bot >= list_top && row_top <= content_bottom {
                    crate::render::pixel::draw_item_icon(
                        sprites, entry.kind.template().sprite,
                        content_x + body_size, y, icon_size, WHITE,
                    );
                    let mark = (letter as char).to_string();
                    draw_text(
                        &format!("{}) {}  x{}", mark, entry.kind.name(), entry.count),
                        content_x + body_size + icon_gutter,
                        y + body_size,
                        body_size, green);
                }
                y += line_h;
                letter += 1;
                if letter > b'z' { break; }
            }
            let faint = with_alpha(green, 0.30);
            draw_scrollbar(px + pw, body_size, list_top, list_viewport,
                list_total, *scroll, green, faint);
        }
        let footer = "e/u - actions     a-z - equip from list     Esc - back";
        let fd = measure_text(footer, None, footer_size as u16, 1.0);
        draw_text(footer,
            px + (pw - fd.width) * 0.5,
            py + ph - footer_size * 1.5,
            footer_size, dim);
        return;
    }

    // ── Slot list (default) ──────────────────────────────────────
    let line_h = body_size * 2.1;
    let icon_size = line_h * 0.95 * INVENTORY_ICON_SCALE;
    let icon_gutter = icon_size + body_size * 0.4;
    let content_bottom = py + ph - footer_size * 2.4;
    let viewport_h = content_bottom - content_top;
    let total_h = EquipSlot::ALL.len() as f32 * line_h;
    clamp_scroll(scroll, viewport_h, total_h);

    let blocked = equipment.left_hand_blocked();
    let mut y = content_top - *scroll;
    for (i, &slot) in EquipSlot::ALL.iter().enumerate() {
        // Cull rows whose y-range falls entirely outside the
        // viewport so long lists stay cheap and the panel border
        // crisp regardless of scroll.
        let row_top = y;
        let row_bot = y + line_h;
        if row_bot >= content_top && row_top <= content_bottom {
            let letter = (b'a' + i as u8) as char;
            let label = slot.label();
            let kind = equipment.get(slot);
            if let Some(k) = kind {
                crate::render::pixel::draw_item_icon(
                    sprites, k.template().sprite,
                    content_x, y, icon_size, WHITE,
                );
            }
            let contents = match (kind, slot, blocked) {
                (Some(k), _, _)                          => k.name().to_string(),
                (None, EquipSlot::LeftHand, true)        => {
                    let occupant = equipment.get(EquipSlot::RightHand)
                        .map(|k| k.name()).unwrap_or("?");
                    crate::tr_fmt!("ui.equipment.blocked_by", occupant)
                }
                _                                        => crate::i18n::tr("ui.equipment.empty_slot").to_string(),
            };
            let line = format!("{}) {:<11} {}", letter, format!("{}:", label), contents);
            let color = if kind.is_some() { green } else { dim };
            draw_text(&line, content_x + icon_gutter, y + body_size, body_size, color);
        }
        y += line_h;
    }

    let faint = with_alpha(green, 0.30);
    draw_scrollbar(px + pw, body_size, content_top, viewport_h,
        total_h, *scroll, green, faint);

    let footer = "a-j - open slot     wheel/Up/Down scroll     Esc - close";
    let fd = measure_text(footer, None, footer_size as u16, 1.0);
    draw_text(footer,
        px + (pw - fd.width) * 0.5,
        py + ph - footer_size * 1.5,
        footer_size, dim);
}

