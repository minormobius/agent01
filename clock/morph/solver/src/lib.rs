//! wasm ABI for the morphogenesis engine.
//!
//! No wasm-bindgen, matching `clock/bearings`: the module exports a handful of
//! C functions plus its memory, and everything bulky is read straight out of
//! linear memory as `Float32Array` views. `cargo build --target
//! wasm32-unknown-unknown` is the entire toolchain. The glue is `../solver.js`.
//!
//! Buffer layouts, all f32, tightly packed. `layout(i)` reports each stride so
//! the glue can assert against it — a field added on one side and not the other
//! then fails loudly instead of rendering nonsense.
//!
//! * node, stride 6:  `x y r depth kind age`
//! * edge, stride 5:  `x0 y0 x1 y1 age`
//! * event, stride 4: `gate depth width cell`
//! * stats, 16 slots: see `STAT` in `solver.js`
//!
//! Source text goes the other way: JS writes UTF-8 into the buffer at
//! `src_ptr()` and calls `compile(len)`. On failure the message is at
//! `err_ptr()`/`err_len()`.

pub mod graph;
pub mod lang;
pub mod layout;
pub mod rng;

use core::cell::UnsafeCell;
use graph::{Engine, Kind, MAX_CELLS};
use layout::Layout;

pub const NODE_STRIDE: usize = 6;
pub const EDGE_STRIDE: usize = 5;
pub const EVENT_STRIDE: usize = 4;
pub const STAT_COUNT: usize = 16;

/// Cap on events handed over per frame. A single expansion of a wide cell can
/// create thousands of gates at once; the sonification can only ever play a few
/// dozen, and the rest are counted rather than queued.
const MAX_EVENTS: usize = 512;
const SRC_CAPACITY: usize = 32 * 1024;

/// Parameter ids, mirrored by `PARAM` in `solver.js`.
pub mod param {
    pub const REPULSION: u32 = 0;
    pub const WIRE: u32 = 1;
    pub const DECAY: u32 = 2;
    pub const LINK_DISTANCE: u32 = 3;
    pub const GRAVITY: u32 = 4;
    pub const MAX_SPEED: u32 = 5;
}

pub struct World {
    engine: Option<Engine>,
    layout: Layout,
    edges: Vec<(u32, u32)>,
    node_buf: Vec<f32>,
    edge_buf: Vec<f32>,
    event_buf: Vec<f32>,
    stats: [f32; STAT_COUNT],
    /// Fractional cells-per-frame carried between frames.
    grow_debt: f32,
    dirty: bool,
    err: String,
    seed: u32,
    /// Events created since the last drain, including those dropped.
    events_seen: u32,
}

impl World {
    fn new() -> World {
        World {
            engine: None,
            layout: Layout::new(1337),
            edges: Vec::new(),
            node_buf: Vec::new(),
            edge_buf: Vec::new(),
            event_buf: vec![0.0; MAX_EVENTS * EVENT_STRIDE],
            stats: [0.0; STAT_COUNT],
            grow_debt: 0.0,
            dirty: true,
            err: String::new(),
            seed: 1337,
            events_seen: 0,
        }
    }

    /// Parse and prepare a program. Returns false with `err` set on failure;
    /// the previous structure is dropped either way, so a bad edit clears the
    /// canvas rather than leaving a stale graph the source no longer describes.
    fn compile(&mut self, src: &str, seed: u32) -> bool {
        self.engine = None;
        self.layout = Layout::new(seed);
        self.edges.clear();
        self.grow_debt = 0.0;
        self.dirty = true;
        self.seed = seed;
        self.events_seen = 0;
        self.err.clear();

        let prog = match lang::parse(src) {
            Ok(p) => p,
            Err(e) => {
                self.err = e.to_string();
                return false;
            }
        };
        match Engine::new(prog) {
            Ok(e) => {
                self.engine = Some(e);
                true
            }
            Err(msg) => {
                self.err = msg;
                false
            }
        }
    }

    /// Advance one frame: expand up to `grow` cells, then relax `relax` steps.
    ///
    /// Growth and relaxation deliberately share the frame. `grow` is a float so
    /// the caller can ask for less than one cell per frame and get a structure
    /// that unfolds slowly rather than one that stutters.
    fn step(&mut self, grow: f32, relax: u32, largest: bool) {
        let Some(engine) = self.engine.as_mut() else {
            return;
        };
        engine.frame = engine.frame.wrapping_add(1);

        self.grow_debt += grow.clamp(0.0, 4096.0);
        let budget = self.grow_debt as u32;
        self.grow_debt -= budget as f32;
        for _ in 0..budget {
            if !engine.step(largest) {
                break;
            }
            self.dirty = true;
        }

        if self.dirty {
            engine.build_edges(&mut self.edges);
            engine.recompute_depths(&self.edges);
            self.dirty = false;
        }
        // A client that never drains would otherwise accumulate events for as
        // long as the tab is open. The page drains every frame, so this only
        // ever fires for one that does not.
        let backlog = MAX_EVENTS * 4;
        if engine.events.len() > backlog {
            let cut = engine.events.len() - backlog;
            engine.events.drain(..cut);
        }

        let count = engine.graph.cell_count();
        self.layout.sync(count, &engine.graph.parent);
        self.layout
            .relax(&engine.graph.active, &self.edges, relax.clamp(0, 16));

        self.rebuild_buffers();
    }

    fn rebuild_buffers(&mut self) {
        let Some(engine) = self.engine.as_ref() else {
            self.node_buf.clear();
            self.edge_buf.clear();
            self.stats = [0.0; STAT_COUNT];
            return;
        };
        // Every cell must have a position before it can be written out. `step`
        // has already done this; `compile` reaches here with a root cell and an
        // empty layout, so seeding here keeps both paths safe.
        self.layout
            .sync(engine.graph.cell_count(), &engine.graph.parent);
        let engine = self.engine.as_ref().unwrap();
        let g = &engine.graph;
        let n = g.cell_count();
        let frame = engine.frame;

        let mut max_depth = 1u16;
        for i in 0..n {
            if g.active[i] {
                max_depth = max_depth.max(g.logic_depth[i]);
            }
        }
        let inv_depth = 1.0 / max_depth as f32;

        self.node_buf.clear();
        // Dense index for the edge pass: only active cells are emitted, so an
        // edge's endpoints have to be looked up by their position in this list.
        let mut slot = vec![u32::MAX; n];
        let (mut gates, mut buds) = (0u32, 0u32);
        for i in 0..n {
            if !g.active[i] {
                continue;
            }
            slot[i] = (self.node_buf.len() / NODE_STRIDE) as u32;
            let (kind, r) = match g.kind[i] {
                Kind::Gate(gi) => {
                    gates += 1;
                    (gi as f32, 0.5)
                }
                // Buds are drawn bigger: an unexpanded cell stands for
                // everything it has not become yet.
                Kind::Bud(_) => {
                    buds += 1;
                    (-1.0, 0.9)
                }
            };
            let age = (frame.wrapping_sub(g.born[i])) as f32;
            self.node_buf.extend_from_slice(&[
                self.layout.x[i],
                self.layout.y[i],
                r,
                g.logic_depth[i] as f32 * inv_depth,
                kind,
                age,
            ]);
        }

        self.edge_buf.clear();
        for &(a, b) in &self.edges {
            let (a, b) = (a as usize, b as usize);
            if slot[a] == u32::MAX || slot[b] == u32::MAX {
                continue;
            }
            let age = (frame.wrapping_sub(g.born[a].max(g.born[b]))) as f32;
            self.edge_buf.extend_from_slice(&[
                self.layout.x[a],
                self.layout.y[a],
                self.layout.x[b],
                self.layout.y[b],
                age,
            ]);
        }

        let active = gates + buds;
        let edge_n = (self.edge_buf.len() / EDGE_STRIDE) as f32;
        let (lo_x, lo_y, hi_x, hi_y) = self.layout.bounds(&g.active);

        self.stats = [
            active as f32,
            edge_n,
            n as f32,
            buds as f32,
            self.layout.energy,
            if active > 0 { 2.0 * edge_n / active as f32 } else { 0.0 },
            max_depth as f32,
            if engine.fully_grown() { 1.0 } else { 0.0 },
            if engine.capped { 1.0 } else { 0.0 },
            lo_x,
            lo_y,
            hi_x,
            hi_y,
            gates as f32,
            frame as f32,
            self.events_seen as f32,
        ];
    }

    /// Move pending creation events into the shared buffer and clear them.
    fn drain_events(&mut self) -> usize {
        let Some(engine) = self.engine.as_mut() else {
            return 0;
        };
        let total = engine.events.len();
        self.events_seen = total.min(u32::MAX as usize) as u32;
        let take = total.min(MAX_EVENTS);
        // When a burst overflows the buffer, keep the *last* events: they are
        // the deepest, and the leading edge of a burst all sounds alike anyway.
        let skip = total - take;
        for (i, ev) in engine.events[skip..].iter().enumerate() {
            let o = i * EVENT_STRIDE;
            self.event_buf[o] = if ev.gate == u16::MAX { -1.0 } else { ev.gate as f32 };
            self.event_buf[o + 1] = ev.depth as f32;
            self.event_buf[o + 2] = ev.width as f32;
            self.event_buf[o + 3] = ev.cell as f32;
        }
        engine.events.clear();
        take
    }

    fn set_param(&mut self, id: u32, v: f32) {
        let p = &mut self.layout.params;
        match id {
            param::REPULSION => p.repulsion = v.clamp(0.0, 40.0),
            param::WIRE => p.wire = v.clamp(0.0, 8.0),
            param::DECAY => p.decay = v.clamp(0.001, 0.9),
            param::LINK_DISTANCE => p.link_distance = v.clamp(0.1, 20.0),
            param::GRAVITY => p.gravity = v.clamp(0.0, 2.0),
            param::MAX_SPEED => p.max_speed = v.clamp(0.01, 20.0),
            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------
// Singletons. wasm32 is single-threaded; nothing else can reach these.
// ---------------------------------------------------------------------------

struct Cell<T>(UnsafeCell<T>);
unsafe impl<T> Sync for Cell<T> {}

static WORLD: Cell<Option<World>> = Cell(UnsafeCell::new(None));
static SRC: Cell<[u8; SRC_CAPACITY]> = Cell(UnsafeCell::new([0; SRC_CAPACITY]));

#[allow(clippy::mut_from_ref)]
fn world() -> &'static mut World {
    unsafe {
        let slot = &mut *WORLD.0.get();
        if slot.is_none() {
            *slot = Some(World::new());
        }
        slot.as_mut().unwrap()
    }
}

/// Where JS writes program source, up to `src_capacity()` bytes of UTF-8.
#[no_mangle]
pub extern "C" fn src_ptr() -> *mut u8 {
    unsafe { (*SRC.0.get()).as_mut_ptr() }
}

#[no_mangle]
pub extern "C" fn src_capacity() -> u32 {
    SRC_CAPACITY as u32
}

/// Compile the first `len` bytes at `src_ptr()`. Returns 1 on success, 0 on
/// failure with the reason at `err_ptr()`.
#[no_mangle]
pub extern "C" fn compile(len: u32, seed: u32) -> u32 {
    let len = (len as usize).min(SRC_CAPACITY);
    let bytes = unsafe { &(&*SRC.0.get())[..len] };
    let w = world();
    match core::str::from_utf8(bytes) {
        Ok(src) => {
            let ok = w.compile(src, seed);
            w.rebuild_buffers();
            u32::from(ok)
        }
        Err(_) => {
            w.engine = None;
            w.err = "source is not valid UTF-8".into();
            w.rebuild_buffers();
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn step(grow: f32, relax: u32, largest: u32) {
    world().step(grow, relax, largest != 0);
}

#[no_mangle]
pub extern "C" fn set_param(id: u32, value: f32) {
    world().set_param(id, value);
}

#[no_mangle]
pub extern "C" fn node_ptr() -> *const f32 {
    world().node_buf.as_ptr()
}

#[no_mangle]
pub extern "C" fn node_count() -> u32 {
    (world().node_buf.len() / NODE_STRIDE) as u32
}

#[no_mangle]
pub extern "C" fn edge_ptr() -> *const f32 {
    world().edge_buf.as_ptr()
}

#[no_mangle]
pub extern "C" fn edge_count() -> u32 {
    (world().edge_buf.len() / EDGE_STRIDE) as u32
}

#[no_mangle]
pub extern "C" fn event_ptr() -> *const f32 {
    world().event_buf.as_ptr()
}

/// Hand over pending creation events and clear them. Call once per frame.
#[no_mangle]
pub extern "C" fn drain_events() -> u32 {
    world().drain_events() as u32
}

#[no_mangle]
pub extern "C" fn stats_ptr() -> *const f32 {
    world().stats.as_ptr()
}

#[no_mangle]
pub extern "C" fn err_ptr() -> *const u8 {
    world().err.as_ptr()
}

#[no_mangle]
pub extern "C" fn err_len() -> u32 {
    world().err.len() as u32
}

/// Buffer strides, so the glue can assert it was built against this module.
/// 0 node, 1 edge, 2 event, 3 stats, 4 max cells.
#[no_mangle]
pub extern "C" fn layout(i: u32) -> u32 {
    match i {
        0 => NODE_STRIDE as u32,
        1 => EDGE_STRIDE as u32,
        2 => EVENT_STRIDE as u32,
        3 => STAT_COUNT as u32,
        4 => MAX_CELLS as u32,
        _ => 0,
    }
}
