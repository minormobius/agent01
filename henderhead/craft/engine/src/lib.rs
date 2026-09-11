//! craftca — the engine behind henderhead.mino.mobi/craft/.
//!
//! A cellular automaton whose transition rule is a table of Minecraft crafting
//! recipes, after Matt Henderson's post of 2026-09-11. The idea is his; this
//! implementation, the recipe table and the item art on the page are ours, and
//! no Mojang asset is used anywhere in the surface.
//!
//! Same ABI style as the continued-fraction engine next door: a plain cdylib
//! for wasm32-unknown-unknown with a C ABI and no wasm-bindgen, so the build is
//! one `cargo build` and the module has no imports.
//!
//! Results live in engine-owned buffers and are handed back as pointer +
//! length. Every pointer here is invalidated by the next call that can resize
//! its buffer — `step` and `init` — so read before you step.

mod recipes;
mod world;

use world::World;

static mut W: Option<World> = None;
static mut DESC: String = String::new();
static mut FLAT: Vec<u16> = Vec::new();
static mut DISC: Vec<f64> = Vec::new();

fn world() -> &'static mut World {
    unsafe { (*&raw mut W).as_mut().expect("init() first") }
}

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n);
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(p: *mut u8, n: usize) {
    if !p.is_null() && n > 0 { drop(Vec::from_raw_parts(p, n, n)); }
}

/// Build a world. Returns the number of cells.
#[no_mangle]
pub extern "C" fn init(w: u32, h: u32, seed: f64, density: f64) -> u32 {
    let (w, h) = (w.clamp(4, 512) as usize, h.clamp(4, 512) as usize);
    let mut world = World::new(w, h, seed as u64);
    world.seed(density.clamp(0.0, 0.9));
    unsafe {
        *(&raw mut W) = Some(world);
        *(&raw mut DESC) = describe();
    }
    (w * h) as u32
}

/// Re-scatter the seed stock without rebuilding the recipe tables.
#[no_mangle]
pub extern "C" fn reseed(seed: f64, density: f64) {
    let w = world();
    w.rng = world::Rng::new(seed as u64);
    w.seed(density.clamp(0.0, 0.9));
}

#[no_mangle]
pub extern "C" fn set_motion(p: f64) { world().motion = p.clamp(0.0, 1.0); }

#[no_mangle]
pub extern "C" fn set_craft_rate(p: f64) { world().craft_rate = p.clamp(0.0, 1000.0); }

#[no_mangle]
pub extern "C" fn set_restock(p: f64) { world().restock = p.clamp(0.0, 0.95); }

/// 0 = prefer the match with the most ingredients, 1 = pick at random.
#[no_mangle]
pub extern "C" fn set_priority(mode: u32) {
    world().priority = if mode == 0 { world::Priority::Biggest } else { world::Priority::Random };
}

/// Paint one cell. 0 clears it.
#[no_mangle]
pub extern "C" fn put(x: u32, y: u32, item: u32) { world().put(x as usize, y as usize, item as u16); }

#[no_mangle]
pub extern "C" fn set_banned(item: u32, on: u32) { world().set_banned(item as u16, on != 0); }

#[no_mangle]
pub extern "C" fn is_banned(item: u32) -> u32 {
    let w = world();
    (*w.banned.get(item as usize).unwrap_or(&false)) as u32
}

/// Advance `n` ticks. Only the last tick's crafts are reported — at speed the
/// page is not drawing the intermediate ones anyway, and keeping every event
/// from a thousand-tick skip would be a lot of memory for something nobody
/// sees.
#[no_mangle]
pub extern "C" fn step(n: u32) -> u32 {
    let w = world();
    for _ in 0..n.max(1) { w.step(); }
    w.crafts.len() as u32
}

// ------------------------------------------------------------- reading out --

#[no_mangle] pub extern "C" fn cells_ptr() -> *const u16 { world().cells.as_ptr() }
#[no_mangle] pub extern "C" fn cells_len() -> u32 { world().cells.len() as u32 }
#[no_mangle] pub extern "C" fn counts_ptr() -> *const u32 { world().counts.as_ptr() }
#[no_mangle] pub extern "C" fn n_items() -> u32 { (recipes::ITEMS.len() + 1) as u32 }
#[no_mangle] pub extern "C" fn n_recipes() -> u32 { world().recipes.len() as u32 }
#[no_mangle] pub extern "C" fn tick() -> f64 { world().tick as f64 }
#[no_mangle] pub extern "C" fn occupied() -> u32 { world().occupied() }
#[no_mangle] pub extern "C" fn total_crafts() -> f64 { world().total_crafts as f64 }
#[no_mangle] pub extern "C" fn total_spilled() -> f64 { world().total_spilled as f64 }

/// The last tick's crafts, ten u16 each:
/// x, y, w, h, recipe, out, placed, spilled, out_x, out_y.
#[no_mangle]
pub extern "C" fn crafts_ptr() -> *const u16 {
    let w = world();
    let flat = unsafe { &mut *(&raw mut FLAT) };
    flat.clear();
    for c in &w.crafts {
        flat.extend_from_slice(&[c.x, c.y, c.w as u16, c.h as u16, c.recipe, c.out,
                                 c.placed as u16, c.spilled as u16, c.out_x, c.out_y]);
    }
    flat.as_ptr()
}

/// Tick at which each item first appeared, or -1 for never. The emergent tech
/// tree, in the order the grid actually found it.
#[no_mangle]
pub extern "C" fn discovered_ptr() -> *const f64 {
    let w = world();
    let d = unsafe { &mut *(&raw mut DISC) };
    d.clear();
    d.extend(w.discovered.iter().map(|&t| if t == world::NEVER { -1.0 } else { t as f64 }));
    d.as_ptr()
}

/// Everything static about the rule, as JSON, built once at init: the item
/// list, the seed stock, the default ban, and every recipe shape. The page
/// takes its labels and its recipe book from this, so the table in
/// `recipes.rs` stays the only place the rule is written down.
fn desc() -> &'static str { unsafe { &*(&raw const DESC) } }
#[no_mangle] pub extern "C" fn desc_ptr() -> *const u8 { desc().as_ptr() }
#[no_mangle] pub extern "C" fn desc_len() -> u32 { desc().len() as u32 }

fn describe() -> String {
    let w = world();
    let mut s = String::with_capacity(8192);
    s.push_str("{\"items\":[");
    for (i, name) in recipes::ITEMS.iter().enumerate() {
        if i > 0 { s.push(','); }
        s.push('"'); s.push_str(name); s.push('"');
    }
    s.push_str("],\"seeds\":[");
    for (i, name) in recipes::SEEDS.iter().enumerate() {
        if i > 0 { s.push(','); }
        s.push('"'); s.push_str(name); s.push('"');
    }
    s.push_str("],\"bannedByDefault\":[");
    for (i, name) in recipes::BANNED_BY_DEFAULT.iter().enumerate() {
        if i > 0 { s.push(','); }
        s.push('"'); s.push_str(name); s.push('"');
    }
    s.push_str("],\"recipes\":[");
    for (i, r) in w.recipes.iter().enumerate() {
        if i > 0 { s.push(','); }
        s.push_str("{\"out\":");
        s.push_str(&r.out.to_string());
        s.push_str(",\"yield\":");
        s.push_str(&r.yield_.to_string());
        s.push_str(",\"w\":");
        s.push_str(&r.w.to_string());
        s.push_str(",\"h\":");
        s.push_str(&r.h.to_string());
        s.push_str(",\"source\":");
        s.push_str(&r.source.to_string());
        s.push_str(",\"mirrored\":");
        s.push_str(if r.mirrored { "true" } else { "false" });
        s.push_str(",\"cells\":[");
        for (j, c) in r.cells.iter().enumerate() {
            if j > 0 { s.push(','); }
            s.push_str(&c.to_string());
        }
        s.push_str("]}");
    }
    s.push_str("]}");
    s
}

#[cfg(test)]
mod tests;
