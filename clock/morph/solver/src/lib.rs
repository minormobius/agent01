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
//! * node, stride 7:  `x y r depth kind age act`
//! * edge, stride 6:  `x0 y0 x1 y1 age act`
//! * event, stride 5: `kind gate depth weight cell`
//! * stats, 20 slots: see `STAT` in `solver.js`
//!
//! One call to [`step`] is one **tick**. The caller decides how many ticks a
//! rendered frame is worth, which is what lets the same structure be watched in
//! slow motion or run far ahead of the display without any of the three
//! subsystems — growth, layout, signals — changing character.
//!
//! Source text goes the other way: JS writes UTF-8 into the buffer at
//! `src_ptr()` and calls `compile(len)`. On failure the message is at
//! `err_ptr()`/`err_len()`.

pub mod graph;
pub mod lang;
pub mod layout;
pub mod rng;
pub mod signal;

use core::cell::UnsafeCell;
use graph::{Engine, Kind, MAX_CELLS};
use layout::Layout;
use signal::Signals;

pub const NODE_STRIDE: usize = 7;
pub const EDGE_STRIDE: usize = 6;
pub const EVENT_STRIDE: usize = 5;
pub const STAT_COUNT: usize = 20;

/// Cap on events handed over per drain. A wave through a large structure fires
/// thousands of gates; the sonification can play a few dozen, and the rest are
/// counted rather than queued.
const MAX_EVENTS: usize = 512;
/// Events held between drains. The page drains every frame; this only bounds a
/// client that does not.
const EVENT_BACKLOG: usize = MAX_EVENTS * 4;
const SRC_CAPACITY: usize = 32 * 1024;

/// Event kinds, mirrored by `EVENT` in `solver.js`.
pub mod event_kind {
    /// A gate fired: a signal reached it. The main voice.
    pub const FIRE: f32 = 0.0;
    /// A cell was created. A grace note under the firings.
    pub const BORN: f32 = 1.0;
    /// A cell starved and was removed.
    pub const DIED: f32 = 2.0;
}

/// Parameter ids, mirrored by `PARAM` in `solver.js`.
pub mod param {
    pub const REPULSION: u32 = 0;
    pub const WIRE: u32 = 1;
    pub const DECAY: u32 = 2;
    pub const LINK_DISTANCE: u32 = 3;
    pub const GRAVITY: u32 = 4;
    pub const MAX_SPEED: u32 = 5;
    pub const SIGNAL_RATE: u32 = 6;
    pub const THRESHOLD: u32 = 7;
    pub const LEAK: u32 = 8;
    pub const STARVE: u32 = 9;
}

#[derive(Clone, Copy)]
struct Event {
    kind: f32,
    gate: f32,
    depth: f32,
    weight: f32,
    cell: f32,
}

pub struct World {
    engine: Option<Engine>,
    layout: Layout,
    signals: Signals,
    edges: Vec<(u32, u32)>,
    node_buf: Vec<f32>,
    edge_buf: Vec<f32>,
    event_buf: Vec<f32>,
    /// Events accumulated across every tick since the last drain — a frame may
    /// be worth many ticks, and the firings of the ones in between are exactly
    /// what the sound is made of.
    pending: Vec<Event>,
    stats: [f32; STAT_COUNT],
    /// Fractional cells-per-tick carried between ticks.
    grow_debt: f32,
    dirty: bool,
    err: String,
    /// Events created since the last drain, dropped ones included.
    events_seen: u32,
    /// Scratch list of cells that starved this tick.
    starved: Vec<u32>,
    /// Cells that starved / lineages that re-armed, since the last drain.
    deaths: u32,
    regrowths: u32,
    /// Longest gate path in the current structure — how many ticks a wave needs
    /// to cross it, and so what turns the pulse rate into "waves in flight".
    max_depth: f32,
}

impl World {
    fn new() -> World {
        World {
            engine: None,
            layout: Layout::new(1337),
            signals: Signals::new(),
            edges: Vec::new(),
            node_buf: Vec::new(),
            edge_buf: Vec::new(),
            event_buf: vec![0.0; MAX_EVENTS * EVENT_STRIDE],
            pending: Vec::new(),
            stats: [0.0; STAT_COUNT],
            grow_debt: 0.0,
            dirty: true,
            err: String::new(),
            events_seen: 0,
            starved: Vec::new(),
            deaths: 0,
            regrowths: 0,
            max_depth: 1.0,
        }
    }

    /// Parse and prepare a program. Returns false with `err` set on failure;
    /// the previous structure is dropped either way, so a bad edit clears the
    /// canvas rather than leaving a graph the source no longer describes.
    fn compile(&mut self, src: &str, seed: u32) -> bool {
        let params = core::mem::take(&mut self.signals.params);
        self.engine = None;
        self.layout = Layout::new(seed);
        self.signals.reset();
        self.signals.params = params; // knobs survive a regrow
        self.edges.clear();
        self.pending.clear();
        self.grow_debt = 0.0;
        self.dirty = true;
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

    /// One tick: expand up to `grow` cells, relax the layout, propagate one
    /// step of signal.
    ///
    /// Growth and relaxation deliberately share a tick — that overlap is what
    /// makes the structure look like it is assembling rather than being drawn.
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
            self.signals
                .rebuild(engine.graph.cell_count(), &engine.graph.active, &self.edges);
            self.dirty = false;
        }

        let count = engine.graph.cell_count();
        self.layout.sync(count, &engine.graph.parent);
        self.layout
            .relax(&engine.graph.active, &self.edges, relax.clamp(0, 16));
        self.signals.depth_scale = self.max_depth;
        self.signals.tick(&engine.graph.active);

        // Apoptosis. Cells that have stopped conducting are removed, and a
        // lineage that loses every descendant re-arms as a bud — so the
        // structure keeps dividing inside a fixed budget instead of eroding.
        self.signals.starved(&engine.graph.active, &mut self.starved);
        if !self.starved.is_empty() {
            let dying = core::mem::take(&mut self.starved);
            for &id in &dying {
                // Read the cell before it goes; afterwards the slot may already
                // belong to something else.
                let i = id as usize;
                self.pending.push(Event {
                    kind: event_kind::DIED,
                    gate: match engine.graph.kind[i] {
                        Kind::Gate(gi) => gi as f32,
                        Kind::Bud(_) => -1.0,
                    },
                    depth: engine.graph.depth[i] as f32,
                    weight: engine.graph.logic_depth[i] as f32,
                    cell: id as f32,
                });
                engine.starve(i);
            }
            self.starved = dying;
            self.starved.clear();
            self.dirty = true;
        }
        // Recycled slots inherit a dead cell's position and its silence; both
        // have to be cleared or new growth appears in the wrong place and
        // starves on arrival.
        if !engine.reseed.is_empty() {
            let reseed = core::mem::take(&mut engine.reseed);
            for &(cell, parent) in &reseed {
                self.layout.reseed(cell as usize, parent);
                self.signals.wake(cell as usize);
            }
        }
        for &id in &engine.rearmed {
            self.signals.wake(id as usize);
        }
        engine.rearmed.clear();
        self.deaths = engine.deaths;
        self.regrowths = engine.regrowths;

        self.collect_events();
        self.rebuild_buffers();
    }

    /// Fold this tick's firings, and any cells born since the last drain, into
    /// the pending queue.
    fn collect_events(&mut self) {
        let Some(engine) = self.engine.as_mut() else {
            return;
        };
        let g = &engine.graph;

        for f in &self.signals.firings {
            let i = f.cell as usize;
            self.pending.push(Event {
                kind: event_kind::FIRE,
                gate: match g.kind[i] {
                    Kind::Gate(gi) => gi as f32,
                    Kind::Bud(_) => -1.0,
                },
                depth: g.logic_depth[i] as f32,
                weight: f.fanout as f32,
                cell: f.cell as f32,
            });
        }
        for e in engine.events.drain(..) {
            self.pending.push(Event {
                kind: event_kind::BORN,
                gate: if e.gate == u16::MAX { -1.0 } else { e.gate as f32 },
                depth: e.depth as f32,
                weight: e.width as f32,
                cell: e.cell as f32,
            });
        }

        if self.pending.len() > EVENT_BACKLOG {
            let cut = self.pending.len() - EVENT_BACKLOG;
            self.pending.drain(..cut);
        }
    }

    fn rebuild_buffers(&mut self) {
        let Some(engine) = self.engine.as_ref() else {
            self.node_buf.clear();
            self.edge_buf.clear();
            self.stats = [0.0; STAT_COUNT];
            return;
        };
        // Every cell must have a position and a signal slot before it can be
        // written out. `step` has already done this; `compile` reaches here
        // with a root cell and nothing else, so both paths are covered.
        self.layout
            .sync(engine.graph.cell_count(), &engine.graph.parent);
        if self.signals.act.len() < engine.graph.cell_count() {
            self.signals
                .rebuild(engine.graph.cell_count(), &engine.graph.active, &self.edges);
        }
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
        self.max_depth = max_depth as f32;
        let inv_depth = 1.0 / max_depth as f32;

        self.node_buf.clear();
        let (mut gates, mut buds) = (0u32, 0u32);
        for i in 0..n {
            if !g.active[i] {
                continue;
            }
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
                self.signals.act[i],
            ]);
        }

        self.edge_buf.clear();
        for &(a, b) in &self.edges {
            let (a, b) = (a as usize, b as usize);
            let age = (frame.wrapping_sub(g.born[a].max(g.born[b]))) as f32;
            // A wire carries its driver's activation, so a pulse is visible
            // moving along it rather than just blinking at the endpoints.
            self.edge_buf.extend_from_slice(&[
                self.layout.x[a],
                self.layout.y[a],
                self.layout.x[b],
                self.layout.y[b],
                age,
                self.signals.act[a],
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
            self.signals.activity,
            self.signals.firings.len() as f32,
            self.deaths as f32,
            self.regrowths as f32,
        ];
    }

    /// Move pending events into the shared buffer and clear them.
    fn drain_events(&mut self) -> usize {
        let total = self.pending.len();
        self.events_seen = total.min(u32::MAX as usize) as u32;
        let take = total.min(MAX_EVENTS);
        // On overflow keep the *last* events: they are the deepest in the
        // wavefront, and the leading edge of a burst all sounds alike anyway.
        let skip = total - take;
        for (i, ev) in self.pending[skip..].iter().enumerate() {
            let o = i * EVENT_STRIDE;
            self.event_buf[o] = ev.kind;
            self.event_buf[o + 1] = ev.gate;
            self.event_buf[o + 2] = ev.depth;
            self.event_buf[o + 3] = ev.weight;
            self.event_buf[o + 4] = ev.cell;
        }
        self.pending.clear();
        take
    }

    fn set_param(&mut self, id: u32, v: f32) {
        match id {
            param::REPULSION => self.layout.params.repulsion = v.clamp(0.0, 40.0),
            param::WIRE => self.layout.params.wire = v.clamp(0.0, 8.0),
            param::DECAY => self.layout.params.decay = v.clamp(0.001, 0.9),
            param::LINK_DISTANCE => self.layout.params.link_distance = v.clamp(0.1, 20.0),
            param::GRAVITY => self.layout.params.gravity = v.clamp(0.0, 2.0),
            param::MAX_SPEED => self.layout.params.max_speed = v.clamp(0.01, 20.0),
            param::SIGNAL_RATE => self.signals.params.rate = v.clamp(0.0, 64.0),
            param::THRESHOLD => self.signals.params.threshold = v.clamp(0.05, 4.0),
            param::LEAK => self.signals.params.leak = v.clamp(0.0, 1.0),
            param::STARVE => self.signals.params.starve_after = v.max(0.0) as u32,
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

/// Advance one tick. Call it as many times per rendered frame as the desired
/// tick speed asks for.
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

/// Hand over pending events and clear them. Call once per frame.
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
