//! wasm ABI for the bearing cell.
//!
//! Deliberately no wasm-bindgen: the whole interface is a handful of scalars
//! plus three pointers into linear memory that JS views as `Float32Array`s, so
//! `cargo build --target wasm32-unknown-unknown` is the entire toolchain and
//! the module stays tiny. The glue lives in `../solver.js`.
//!
//! Layouts (all f32, tightly packed):
//!
//! * ball, stride 12: `x y r q v heat qx qy qz qw speed wired`
//! * edge, stride 6:  `x0 y0 x1 y1 current spark`
//! * stats, 16 slots: see `Stats` in `sim.rs`
//!
//! The buffers are rebuilt in place every `step`, so a JS view stays valid
//! until the wasm memory grows — the glue re-creates its views whenever the
//! ArrayBuffer detaches.

pub mod grid;
pub mod network;
pub mod rng;
pub mod sim;

use core::cell::UnsafeCell;
use sim::World;

struct SimCell(UnsafeCell<Option<World>>);
// wasm32 is single-threaded; nothing else can reach this.
unsafe impl Sync for SimCell {}
static SIM: SimCell = SimCell(UnsafeCell::new(None));

#[allow(clippy::mut_from_ref)]
fn world() -> &'static mut World {
    unsafe {
        let slot = &mut *SIM.0.get();
        if slot.is_none() {
            *slot = Some(World::new(560, 1));
        }
        slot.as_mut().unwrap()
    }
}

#[no_mangle]
pub extern "C" fn init(n: u32, seed: u32) -> u32 {
    let w = world();
    w.reset(n.clamp(2, 4000) as usize, seed);
    w.n as u32
}

#[no_mangle]
pub extern "C" fn step(dt: f32, substeps: u32) {
    // A tab that was backgrounded hands us a huge dt; clamp rather than
    // explode.
    let dt = dt.clamp(0.0, 1.0 / 20.0);
    world().step(dt, substeps.clamp(1, 32) as usize);
}

#[no_mangle]
pub extern "C" fn set_param(id: u32, value: f32) {
    world().set_param(id, value);
}

#[no_mangle]
pub extern "C" fn stir(x: f32, y: f32, vx: f32, vy: f32, radius: f32) {
    world().stir(x, y, vx, vy, radius);
}

#[no_mangle]
pub extern "C" fn shake(strength: f32) {
    world().shake(strength);
}

#[no_mangle]
pub extern "C" fn ball_ptr() -> *const f32 {
    world().ball_buf().as_ptr()
}

#[no_mangle]
pub extern "C" fn ball_count() -> u32 {
    world().n as u32
}

#[no_mangle]
pub extern "C" fn edge_ptr() -> *const f32 {
    world().edge_buf().as_ptr()
}

#[no_mangle]
pub extern "C" fn edge_count() -> u32 {
    world().edge_count() as u32
}

#[no_mangle]
pub extern "C" fn stats_ptr() -> *const f32 {
    world().stat_buf().as_ptr()
}

/// Strides, so the JS glue can assert it agrees with the layout above instead
/// of silently misreading a buffer after someone adds a field.
#[no_mangle]
pub extern "C" fn layout(which: u32) -> u32 {
    let (b, e, s) = sim::STRIDES;
    match which {
        0 => b as u32,
        1 => e as u32,
        2 => s as u32,
        _ => 0,
    }
}
