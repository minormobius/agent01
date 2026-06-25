//! Atlas viewer.
//!
//! Loads a PNG and draws a labeled grid over it so we can reference cells
//! by letter-column / number-row the same way the existing atlas does.
//!
//! Usage:
//!   cargo run --bin atlas_view -- <path-to-png> [cell_w] [cell_h]
//!
//! Cell size defaults to 16×16 if not specified. Once the window is open,
//! tweak it live with the bracket / semicolon keys until the grid lines
//! up with the sprite boundaries. The HUD shows the current cell size
//! and total grid dimensions (e.g. "14×9").
//!
//! Controls:
//!   [  ]     cell width  -1 / +1
//!   ;  '     cell height -1 / +1
//!   -  =     zoom        -1 / +1  (also mouse wheel)
//!   WASD     pan
//!   R        reset cell size to 16×16
//!   Esc / Q  quit

use macroquad::prelude::*;

fn cfg() -> Conf {
    Conf {
        window_title: "Atlas Viewer".to_owned(),
        window_width: 1280,
        window_height: 900,
        window_resizable: true,
        ..Default::default()
    }
}

#[macroquad::main(cfg)]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: atlas_view <path-to-png> [cell_w] [cell_h]");
        std::process::exit(1);
    }
    let path = args[1].clone();
    let mut cell_w: i32 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(16);
    let mut cell_h: i32 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(cell_w);

    let tex = load_texture(&path).await
        .unwrap_or_else(|_| panic!("failed to load {}", path));
    tex.set_filter(FilterMode::Nearest);
    let iw = tex.width() as i32;
    let ih = tex.height() as i32;
    println!("loaded {} ({}×{})", path, iw, ih);

    let mut zoom: f32 = 3.0;
    let mut pan = vec2(80.0, 60.0);

    let grid_color  = Color::from_rgba(120, 230, 140, 200);
    let label_color = Color::from_rgba(240, 220, 80, 255);
    let hud_color   = Color::from_rgba(200, 230, 210, 255);

    loop {
        if is_key_pressed(KeyCode::Escape) || is_key_pressed(KeyCode::Q) { break; }

        // Cell size tweaks.
        if is_key_pressed(KeyCode::LeftBracket)  { cell_w = (cell_w - 1).max(1); }
        if is_key_pressed(KeyCode::RightBracket) { cell_w += 1; }
        if is_key_pressed(KeyCode::Semicolon)    { cell_h = (cell_h - 1).max(1); }
        if is_key_pressed(KeyCode::Apostrophe)   { cell_h += 1; }
        if is_key_pressed(KeyCode::R)            { cell_w = 16; cell_h = 16; }

        // Zoom.
        if is_key_pressed(KeyCode::Minus)                                { zoom = (zoom - 1.0).max(1.0); }
        if is_key_pressed(KeyCode::Equal) || is_key_pressed(KeyCode::KpAdd) { zoom += 1.0; }
        let wheel = mouse_wheel().1;
        if wheel != 0.0 { zoom = (zoom + wheel.signum()).clamp(1.0, 20.0); }

        // Pan.
        let pan_step = 10.0;
        if is_key_down(KeyCode::A) { pan.x += pan_step; }
        if is_key_down(KeyCode::D) { pan.x -= pan_step; }
        if is_key_down(KeyCode::W) { pan.y += pan_step; }
        if is_key_down(KeyCode::S) { pan.y -= pan_step; }

        let cols = (iw / cell_w).max(0);
        let rows = (ih / cell_h).max(0);

        clear_background(Color::from_rgba(30, 30, 40, 255));

        let dest_w = iw as f32 * zoom;
        let dest_h = ih as f32 * zoom;
        draw_texture_ex(&tex, pan.x, pan.y, WHITE, DrawTextureParams {
            dest_size: Some(vec2(dest_w, dest_h)),
            ..Default::default()
        });

        // Grid lines.
        for c in 0..=cols {
            let x = pan.x + c as f32 * cell_w as f32 * zoom;
            draw_line(x, pan.y, x, pan.y + dest_h, 1.0, grid_color);
        }
        for r in 0..=rows {
            let y = pan.y + r as f32 * cell_h as f32 * zoom;
            draw_line(pan.x, y, pan.x + dest_w, y, 1.0, grid_color);
        }

        // Column letter labels above the image.
        let label_size = (cell_h as f32 * zoom * 0.32).clamp(10.0, 22.0);
        for c in 0..cols {
            let cx = pan.x + c as f32 * cell_w as f32 * zoom + cell_w as f32 * zoom * 0.5;
            let s = col_label(c as usize);
            let td = measure_text(&s, None, label_size as u16, 1.0);
            draw_text(&s, cx - td.width * 0.5, pan.y - 6.0, label_size, label_color);
        }
        // Row number labels to the left.
        for r in 0..rows {
            let cy = pan.y + r as f32 * cell_h as f32 * zoom + cell_h as f32 * zoom * 0.65;
            let s = format!("{}", r + 1);
            let td = measure_text(&s, None, label_size as u16, 1.0);
            draw_text(&s, pan.x - td.width - 8.0, cy, label_size, label_color);
        }

        // HUD.
        let hud = format!(
            "{}  |  image {}×{}  |  cell {}×{}  |  grid {}×{}  |  zoom {:.0}×  |  [/] width  ;/' height  -/= zoom  WASD pan  R reset  Esc quit",
            path, iw, ih, cell_w, cell_h, cols, rows, zoom
        );
        draw_text(&hud, 10.0, screen_height() - 12.0, 14.0, hud_color);

        next_frame().await;
    }
}

/// Spreadsheet-style column label: 0→A, 25→Z, 26→AA, 27→AB, etc.
fn col_label(mut c: usize) -> String {
    let mut out = Vec::<u8>::new();
    c += 1; // convert to 1-based so the wrap math works
    while c > 0 {
        let r = (c - 1) % 26;
        out.push(b'A' + r as u8);
        c = (c - 1) / 26;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}
