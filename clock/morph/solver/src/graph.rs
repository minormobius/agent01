//! The graph rewrite engine.
//!
//! A cell is one node. Expanding it replaces it with the subcells its body
//! instantiates, wired to each other and to the buses the parent already holds.
//! Gates never expand — they are the leaves the structure is finally made of.
//!
//! # The chicken and the egg
//!
//! Bus widths are inferred, not declared, so to wire a child into its parent we
//! must know how many wires the child emits — and that is only knowable by
//! working out what the child expands into, which needs *its* children, and so
//! on. The engine breaks this the way the original does: by **materialising on
//! demand**. [`Engine::resolve`] runs a cell's body in *probe* mode — the same
//! interpreter, allocating throwaway net ids and creating no nodes — purely to
//! learn its output widths, the fallback it lands on, and how big it will
//! eventually get. Results are cached by `(cell, input widths)`, so a probe
//! costs one pass over one body however deep the structure below it goes.
//!
//! Because probing and growing are the same interpreter behind one `real` flag,
//! the widths a probe predicts cannot drift from the widths growth produces.
//!
//! # Failure is the base case
//!
//! There are no conditionals. A body that cannot instantiate — `SPLIT` on a
//! single wire, an index off the end of a bus, a gate handed an empty bus —
//! raises [`Fail`], and the engine unwinds to that cell's `fallback`. A
//! recursive cell therefore terminates exactly when its buses stop dividing.
//! Self-referential programs that never narrow (`cell f(x) { return f(x) }`)
//! would probe forever, so re-entering a resolution already in progress is
//! itself a `Fail`: such a cell falls back, or is reported as unresolvable,
//! rather than hanging the tab.

use crate::lang::{resolve_slice, Builtin, Expr, Fallback, Program};
use std::collections::{BinaryHeap, HashMap, HashSet};

pub type Net = u32;
pub type Bus = Vec<Net>;

/// Instantiation failure: unwind to the fallback. Not an error to report.
#[derive(Debug, Clone, Copy)]
pub struct Fail;

/// Ceiling on live cells. A wide `grow` can ask for something that would not
/// fit in memory, let alone on screen; growth simply stops here.
pub const MAX_CELLS: usize = 60_000;
/// Ceiling on distinct `(cell, widths)` materialisations, as a guard against a
/// program whose bus widths never repeat.
const MAX_RESOLUTIONS: usize = 20_000;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    /// An unexpanded cell instance — a bud. Carries the cell it will become.
    Bud(u16),
    /// A terminal gate instance.
    Gate(u16),
}

/// What a `(cell, widths)` pair actually materialises into.
#[derive(Clone, Debug)]
struct Resolved {
    target: Target,
    out_widths: Vec<u32>,
    /// Gates a full expansion would eventually produce. Drives the
    /// largest-first schedule; saturating, because estimates can be enormous.
    est_size: u64,
}

#[derive(Clone, Copy, Debug)]
enum Target {
    /// Expand this cell definition's body.
    Def(usize),
    /// `fallback %N`: pass positional argument N straight through, no nodes.
    Arg(usize),
}

/// One cell creation, for the sonification.
#[derive(Clone, Copy)]
pub struct Event {
    /// Gate index, or `u16::MAX` for a bud.
    pub gate: u16,
    pub depth: u16,
    /// Width of the bus this cell was one lane of — how "wide" the moment was.
    pub width: u16,
    pub cell: u32,
}

pub struct Graph {
    pub kind: Vec<Kind>,
    pub parent: Vec<i32>,
    /// Recursion depth: how many divisions deep this cell's lineage is.
    pub depth: Vec<u16>,
    /// Longest gate path from an input. What the depth colouring uses.
    pub logic_depth: Vec<u16>,
    /// A leaf: either a gate, or a bud not yet expanded.
    pub active: Vec<bool>,
    /// Frame at which this cell appeared, for the fade-in.
    pub born: Vec<u32>,
    ins: Vec<Vec<Bus>>,
    outs: Vec<Vec<Bus>>,

    /// Union-find over nets. Expanding a bud unifies the outputs its body
    /// produced with the outputs the parent had already allocated for it.
    net_alias: Vec<Net>,
    net_driver: Vec<i32>,
}

impl Graph {
    fn new() -> Graph {
        Graph {
            kind: Vec::new(),
            parent: Vec::new(),
            depth: Vec::new(),
            logic_depth: Vec::new(),
            active: Vec::new(),
            born: Vec::new(),
            ins: Vec::new(),
            outs: Vec::new(),
            net_alias: Vec::new(),
            net_driver: Vec::new(),
        }
    }

    pub fn cell_count(&self) -> usize {
        self.kind.len()
    }

    fn new_net(&mut self) -> Net {
        let id = self.net_alias.len() as Net;
        self.net_alias.push(id);
        self.net_driver.push(-1);
        id
    }

    pub fn find(&self, n: Net) -> Net {
        // Iterative, and without path compression, so `find` stays available
        // behind a shared reference. Chains are short: a net is aliased once
        // per expansion of the bud that produced it.
        let mut n = n;
        while self.net_alias[n as usize] != n {
            n = self.net_alias[n as usize];
        }
        n
    }

    /// Merge `from` (the dying bud's output) into `to` (what the body built).
    /// The surviving driver is always `to`'s: the bud is on its way out.
    fn unite(&mut self, from: Net, to: Net) {
        let (a, b) = (self.find(from), self.find(to));
        if a == b {
            return;
        }
        let driver = self.net_driver[b as usize];
        self.net_alias[a as usize] = b;
        self.net_driver[b as usize] = driver;
    }

    fn driver_of(&self, n: Net) -> i32 {
        self.net_driver[self.find(n) as usize]
    }
}

pub struct Engine {
    pub prog: Program,
    pub graph: Graph,
    cache: HashMap<(usize, Vec<u32>), Option<Resolved>>,
    /// Resolutions currently on the stack, to catch non-narrowing recursion.
    in_progress: HashSet<(usize, Vec<u32>)>,
    /// Scratch net counter used by probe runs.
    probe_net: Net,
    /// Gates a probe run would create, accumulated while probing.
    probe_size: u64,

    /// BFS cursor and largest-first heap. Only one is used per run.
    head: usize,
    heap: Option<BinaryHeap<(u64, std::cmp::Reverse<usize>)>>,
    queued: Vec<bool>,

    pub events: Vec<Event>,
    pub frame: u32,
    /// Set when growth stopped because [`MAX_CELLS`] was reached.
    pub capped: bool,
}

impl Engine {
    /// Build the root cell and its dangling input buses. Fails only if the
    /// entry cell cannot be materialised at the widths `grow` asked for.
    pub fn new(prog: Program) -> Result<Engine, String> {
        let mut e = Engine {
            prog,
            graph: Graph::new(),
            cache: HashMap::new(),
            in_progress: HashSet::new(),
            probe_net: 0,
            probe_size: 0,
            head: 0,
            heap: None,
            queued: Vec::new(),
            events: Vec::new(),
            frame: 0,
            capped: false,
        };

        let widths = e.prog.entry_widths.clone();
        let entry = e.prog.entry;
        let resolved = e
            .resolve(entry, &widths)
            .ok_or_else(|| {
                format!(
                    "`{}` cannot be grown at {:?}: the body fails and there is no fallback",
                    e.prog.cells[entry].name, widths
                )
            })?;

        let ins: Vec<Bus> = widths
            .iter()
            .map(|&w| (0..w).map(|_| e.graph.new_net()).collect())
            .collect();
        let outs: Vec<Bus> = resolved
            .out_widths
            .iter()
            .map(|&w| (0..w).map(|_| e.graph.new_net()).collect())
            .collect();

        let root = e.push_cell(Kind::Bud(entry as u16), -1, 0, 0, ins, outs);
        for bus in e.graph.outs[root].clone() {
            for n in bus {
                e.graph.net_driver[n as usize] = root as i32;
            }
        }
        Ok(e)
    }

    fn push_cell(
        &mut self,
        kind: Kind,
        parent: i32,
        depth: u16,
        logic_depth: u16,
        ins: Vec<Bus>,
        outs: Vec<Bus>,
    ) -> usize {
        let id = self.graph.kind.len();
        self.graph.kind.push(kind);
        self.graph.parent.push(parent);
        self.graph.depth.push(depth);
        self.graph.logic_depth.push(logic_depth);
        self.graph.active.push(true);
        self.graph.born.push(self.frame);
        self.graph.ins.push(ins);
        self.graph.outs.push(outs);
        self.queued.push(false);
        id
    }

    // -----------------------------------------------------------------------
    // Resolution (probe mode)
    // -----------------------------------------------------------------------

    /// What does `def` become when instantiated at these input widths?
    /// `None` means it cannot be instantiated at all and the caller must fail.
    fn resolve(&mut self, def: usize, widths: &[u32]) -> Option<Resolved> {
        let key = (def, widths.to_vec());
        if let Some(hit) = self.cache.get(&key) {
            return hit.clone();
        }
        if self.cache.len() >= MAX_RESOLUTIONS || !self.in_progress.insert(key.clone()) {
            // Either the program is unbounded, or this cell is recursing
            // without ever narrowing its buses. Treat as a failed
            // instantiation so an enclosing fallback can still catch it.
            return None;
        }

        let result = self.resolve_uncached(def, widths);
        self.in_progress.remove(&key);
        self.cache.insert(key, result.clone());
        result
    }

    fn resolve_uncached(&mut self, def: usize, widths: &[u32]) -> Option<Resolved> {
        if self.prog.cells[def].params.len() != widths.len() {
            return None;
        }

        let args: Vec<Bus> = widths
            .iter()
            .map(|&w| (0..w).map(|_| self.probe_alloc()).collect())
            .collect();

        let saved = self.probe_size;
        self.probe_size = 0;
        let body = self.run_body(def, &args, None);
        let size = self.probe_size;
        self.probe_size = saved;

        match body {
            Ok(outs) => Some(Resolved {
                target: Target::Def(def),
                out_widths: outs.iter().map(|b| b.len() as u32).collect(),
                est_size: size,
            }),
            Err(Fail) => match self.prog.cells[def].fallback {
                Fallback::None => None,
                Fallback::Arg(n) => Some(Resolved {
                    target: Target::Arg(n),
                    out_widths: vec![widths[n]],
                    est_size: 0,
                }),
                // The fallback chain is followed all the way here, so growth
                // jumps straight to whatever finally instantiates.
                Fallback::Cell(c) => self.resolve(c, widths),
            },
        }
    }

    fn probe_alloc(&mut self) -> Net {
        self.probe_net = self.probe_net.wrapping_add(1);
        self.probe_net
    }

    // -----------------------------------------------------------------------
    // The interpreter — one body, probe or real
    // -----------------------------------------------------------------------

    /// Run `def`'s body against `args`. With `parent = Some(cell)` this creates
    /// real nodes as children of that cell; with `None` it is a probe.
    fn run_body(
        &mut self,
        def: usize,
        args: &[Bus],
        parent: Option<usize>,
    ) -> Result<Vec<Bus>, Fail> {
        let cell = self.prog.cells[def].clone();
        let mut env: HashMap<String, Bus> = HashMap::new();
        for (p, a) in cell.params.iter().zip(args.iter()) {
            env.insert(p.clone(), a.clone());
        }

        for stmt in &cell.body {
            let vals = self.eval(&stmt.expr, &env, parent, stmt.targets.len())?;
            if vals.len() != stmt.targets.len() {
                // e.g. `a, b = CAT(x, y)`. A static arity check would need the
                // whole call graph; failing here lets a fallback absorb it.
                return Err(Fail);
            }
            for (t, v) in stmt.targets.iter().zip(vals) {
                env.insert(t.clone(), v);
            }
        }

        let mut outs = Vec::with_capacity(cell.ret.len());
        for r in &cell.ret {
            let v = self.eval(r, &env, parent, 1)?;
            if v.len() != 1 {
                return Err(Fail);
            }
            outs.push(v.into_iter().next().unwrap());
        }
        Ok(outs)
    }

    /// Evaluate one expression to `want` buses.
    fn eval(
        &mut self,
        e: &Expr,
        env: &HashMap<String, Bus>,
        parent: Option<usize>,
        want: usize,
    ) -> Result<Vec<Bus>, Fail> {
        match e {
            Expr::Var(name) => Ok(vec![env.get(name).ok_or(Fail)?.clone()]),
            Expr::Const(_) => {
                // A constant is an undriven one-wire bus. Nothing drives it, so
                // it contributes no edge — exactly like a program input.
                let n = self.alloc(parent);
                Ok(vec![vec![n]])
            }
            Expr::Slice(inner, spec) => {
                let bus = self.eval(inner, env, parent, 1)?.remove(0);
                let idx = resolve_slice(spec, bus.len()).ok_or(Fail)?;
                Ok(vec![idx.into_iter().map(|i| bus[i]).collect()])
            }
            Expr::Call(name, arg_exprs) => {
                let mut args = Vec::with_capacity(arg_exprs.len());
                for a in arg_exprs {
                    args.push(self.eval(a, env, parent, 1)?.remove(0));
                }
                if let Some(b) = Builtin::from_name(name) {
                    return self.eval_builtin(b, &args);
                }
                if let Some(&gi) = self.prog.gate_index.get(name) {
                    return Ok(vec![self.emit_gate(gi, &args, parent)?]);
                }
                let &def = self.prog.cell_index.get(name).ok_or(Fail)?;
                self.emit_call(def, &args, parent, want)
            }
        }
    }

    fn eval_builtin(&mut self, b: Builtin, args: &[Bus]) -> Result<Vec<Bus>, Fail> {
        match b {
            Builtin::Split => {
                let x = &args[0];
                if x.len() < 2 {
                    return Err(Fail); // the usual way a recursion ends
                }
                // Odd widths send the middle wire low, always, so odd-width
                // structures stay legal instead of losing a wire.
                let mid = x.len().div_ceil(2);
                Ok(vec![x[..mid].to_vec(), x[mid..].to_vec()])
            }
            Builtin::Cat => {
                let mut out = Vec::new();
                for a in args {
                    out.extend_from_slice(a);
                }
                Ok(vec![out])
            }
            Builtin::Lslice => {
                let (x, r) = (&args[0], args[1].len());
                if x.len() < r {
                    return Err(Fail);
                }
                Ok(vec![x[..r].to_vec(), x[r..].to_vec()])
            }
            Builtin::Hslice => {
                let (x, r) = (&args[0], args[1].len());
                if x.len() < r {
                    return Err(Fail);
                }
                let cut = x.len() - r;
                Ok(vec![x[..cut].to_vec(), x[cut..].to_vec()])
            }
            Builtin::Repeat => {
                let (v, r) = (&args[0], args[1].len());
                if v.len() != 1 {
                    return Err(Fail);
                }
                Ok(vec![vec![v[0]; r]])
            }
        }
    }

    /// Instantiate a gate across a bus: one node per lane. A one-wire argument
    /// broadcasts, which is what lets `AND(a0, b)` mean "gate every wire of `b`
    /// against the single wire `a0`".
    fn emit_gate(
        &mut self,
        gate: usize,
        args: &[Bus],
        parent: Option<usize>,
    ) -> Result<Bus, Fail> {
        let mut width = 1usize;
        for a in args {
            if a.is_empty() {
                return Err(Fail); // a gate on an empty bus stops the recursion
            }
            if a.len() != 1 {
                if width != 1 && width != a.len() {
                    return Err(Fail); // mismatched buses
                }
                width = a.len();
            }
        }

        let mut out = Vec::with_capacity(width);
        for lane in 0..width {
            let lane_in: Vec<Bus> = args
                .iter()
                .map(|a| vec![a[if a.len() == 1 { 0 } else { lane }]])
                .collect();
            match parent {
                None => {
                    self.probe_size = self.probe_size.saturating_add(1);
                    out.push(self.probe_alloc());
                }
                Some(p) => {
                    if self.graph.cell_count() >= MAX_CELLS {
                        self.capped = true;
                        return Err(Fail);
                    }
                    let net = self.graph.new_net();
                    let ld = self.logic_depth_of(&lane_in);
                    let depth = self.graph.depth[p] + 1;
                    let id = self.push_cell(
                        Kind::Gate(gate as u16),
                        p as i32,
                        depth,
                        ld,
                        lane_in,
                        vec![vec![net]],
                    );
                    self.graph.net_driver[net as usize] = id as i32;
                    self.events.push(Event {
                        gate: gate as u16,
                        depth,
                        width: width.min(u16::MAX as usize) as u16,
                        cell: id as u32,
                    });
                    out.push(net);
                }
            }
        }
        Ok(out)
    }

    /// Instantiate a child cell. In probe mode this only consults the cache for
    /// the child's output widths; in real mode it also creates the bud.
    fn emit_call(
        &mut self,
        def: usize,
        args: &[Bus],
        parent: Option<usize>,
        _want: usize,
    ) -> Result<Vec<Bus>, Fail> {
        let widths: Vec<u32> = args.iter().map(|a| a.len() as u32).collect();
        let resolved = self.resolve(def, &widths).ok_or(Fail)?;

        match parent {
            None => {
                self.probe_size = self.probe_size.saturating_add(resolved.est_size);
                Ok(resolved
                    .out_widths
                    .iter()
                    .map(|&w| (0..w).map(|_| self.probe_alloc()).collect())
                    .collect())
            }
            Some(p) => {
                if self.graph.cell_count() >= MAX_CELLS {
                    self.capped = true;
                    return Err(Fail);
                }
                let outs: Vec<Bus> = resolved
                    .out_widths
                    .iter()
                    .map(|&w| (0..w).map(|_| self.graph.new_net()).collect())
                    .collect();
                let ld = self.logic_depth_of(args);
                let depth = self.graph.depth[p] + 1;
                let id = self.push_cell(
                    Kind::Bud(def as u16),
                    p as i32,
                    depth,
                    ld,
                    args.to_vec(),
                    outs.clone(),
                );
                for bus in &outs {
                    for &n in bus {
                        self.graph.net_driver[n as usize] = id as i32;
                    }
                }
                self.events.push(Event {
                    gate: u16::MAX,
                    depth,
                    width: widths.iter().sum::<u32>().min(u16::MAX as u32) as u16,
                    cell: id as u32,
                });
                Ok(outs)
            }
        }
    }

    /// One past the deepest driver feeding these buses.
    ///
    /// Only a seed value: a cell wired to a bud's output is guessing, because
    /// what will finally drive that net has not been created yet. The real
    /// depths come from [`Self::recompute_depths`] once the edges are known.
    fn logic_depth_of(&self, args: &[Bus]) -> u16 {
        let mut d = 0u16;
        for bus in args {
            for &n in bus {
                let drv = self.graph.driver_of(n);
                if drv >= 0 {
                    d = d.max(self.graph.logic_depth[drv as usize]);
                }
            }
        }
        d.saturating_add(1)
    }

    fn alloc(&mut self, parent: Option<usize>) -> Net {
        match parent {
            None => self.probe_alloc(),
            Some(_) => self.graph.new_net(),
        }
    }

    // -----------------------------------------------------------------------
    // Growth
    // -----------------------------------------------------------------------

    /// Expand one cell. Returns false if it is a gate, already expanded, or the
    /// cell budget is spent.
    pub fn expand(&mut self, id: usize) -> bool {
        if !self.graph.active[id] || self.graph.cell_count() >= MAX_CELLS {
            if self.graph.cell_count() >= MAX_CELLS {
                self.capped = true;
            }
            return false;
        }
        let def = match self.graph.kind[id] {
            Kind::Gate(_) => return false,
            Kind::Bud(d) => d as usize,
        };

        let widths: Vec<u32> = self.graph.ins[id].iter().map(|b| b.len() as u32).collect();
        let Some(resolved) = self.resolve(def, &widths) else {
            // Unresolvable buds are simply left standing as leaves.
            self.graph.kind[id] = Kind::Bud(def as u16);
            self.graph.active[id] = true;
            return false;
        };

        let ins = self.graph.ins[id].clone();
        let outs = self.graph.outs[id].clone();

        match resolved.target {
            Target::Arg(n) => {
                // Pass-through: no nodes, just wire the parent's output bus
                // onto the input it forwards. The cell vanishes.
                let src = &ins[n];
                if src.len() != outs[0].len() {
                    return false;
                }
                let pairs: Vec<(Net, Net)> =
                    outs[0].iter().zip(src.iter()).map(|(&o, &s)| (o, s)).collect();
                for (o, s) in pairs {
                    self.graph.unite(o, s);
                }
                self.graph.active[id] = false;
                true
            }
            Target::Def(d) => {
                let before = self.graph.cell_count();
                match self.run_body(d, &ins, Some(id)) {
                    Ok(body_outs) if body_outs.len() == outs.len() => {
                        let mut ok = true;
                        for (a, b) in outs.iter().zip(body_outs.iter()) {
                            if a.len() != b.len() {
                                ok = false;
                            }
                        }
                        if !ok {
                            self.rollback(before);
                            return false;
                        }
                        for (obus, bbus) in outs.iter().zip(body_outs.iter()) {
                            for (&o, &b) in obus.iter().zip(bbus.iter()) {
                                self.graph.unite(o, b);
                            }
                        }
                        self.graph.active[id] = false;
                        true
                    }
                    // The probe said this instantiates, so a failure here means
                    // the budget ran out mid-body. Undo the partial expansion
                    // rather than leave half-wired nodes on screen.
                    _ => {
                        self.rollback(before);
                        false
                    }
                }
            }
        }
    }

    /// Drop cells created after `mark`. Nets are left allocated — they are
    /// cheap, unreferenced, and never rendered.
    fn rollback(&mut self, mark: usize) {
        let n = self.graph.cell_count();
        for id in mark..n {
            for bus in &self.graph.outs[id] {
                for &net in bus {
                    self.graph.net_driver[net as usize] = -1;
                }
            }
        }
        self.graph.kind.truncate(mark);
        self.graph.parent.truncate(mark);
        self.graph.depth.truncate(mark);
        self.graph.logic_depth.truncate(mark);
        self.graph.active.truncate(mark);
        self.graph.born.truncate(mark);
        self.graph.ins.truncate(mark);
        self.graph.outs.truncate(mark);
        self.queued.truncate(mark);
        self.events.retain(|e| (e.cell as usize) < mark);
    }

    /// Expand one cell under the given schedule. `largest` grows the whole
    /// structure at once; BFS grows it from a moving front. Same final graph,
    /// very different thing to watch.
    pub fn step(&mut self, largest: bool) -> bool {
        if largest {
            self.step_largest()
        } else {
            self.step_bfs()
        }
    }

    fn step_bfs(&mut self) -> bool {
        while self.head < self.graph.cell_count() {
            let id = self.head;
            self.head += 1;
            if self.expand(id) {
                return true;
            }
        }
        false
    }

    fn step_largest(&mut self) -> bool {
        if self.heap.is_none() {
            let mut h = BinaryHeap::new();
            for id in 0..self.graph.cell_count() {
                if let Some(k) = self.heap_key(id) {
                    h.push(k);
                    self.queued[id] = true;
                }
            }
            self.heap = Some(h);
        }

        loop {
            let Some((_, std::cmp::Reverse(id))) = self.heap.as_mut().unwrap().pop() else {
                return false;
            };
            if !self.graph.active[id] {
                continue;
            }
            let before = self.graph.cell_count();
            if !self.expand(id) {
                continue;
            }
            for child in before..self.graph.cell_count() {
                if !self.queued[child] {
                    if let Some(k) = self.heap_key(child) {
                        self.heap.as_mut().unwrap().push(k);
                        self.queued[child] = true;
                    }
                }
            }
            return true;
        }
    }

    /// Order by estimated final size, ties broken by age so the schedule is
    /// deterministic. `Reverse` on the id makes the *older* cell win.
    fn heap_key(&mut self, id: usize) -> Option<(u64, std::cmp::Reverse<usize>)> {
        let Kind::Bud(def) = self.graph.kind[id] else {
            return None;
        };
        if !self.graph.active[id] {
            return None;
        }
        let widths: Vec<u32> = self.graph.ins[id].iter().map(|b| b.len() as u32).collect();
        let size = self
            .resolve(def as usize, &widths)
            .map(|r| r.est_size)
            .unwrap_or(0);
        Some((size, std::cmp::Reverse(id)))
    }

    pub fn fully_grown(&self) -> bool {
        match &self.heap {
            Some(h) => h.is_empty(),
            None => self.head >= self.graph.cell_count(),
        }
    }

    /// Deduplicated driver→consumer pairs over active cells. Rebuilt whenever
    /// the graph changed; there is no incremental version because expansion
    /// rewires nets that existing edges already point at.
    ///
    /// Direction is kept — the renderer does not care, but [`Self::recompute_depths`]
    /// does. Circuits here are feedforward, so a pair can only ever run one way.
    pub fn build_edges(&self, out: &mut Vec<(u32, u32)>) {
        out.clear();
        let mut seen: Vec<u64> = Vec::new();
        for id in 0..self.graph.cell_count() {
            if !self.graph.active[id] {
                continue;
            }
            for bus in &self.graph.ins[id] {
                for &n in bus {
                    let drv = self.graph.driver_of(n);
                    if drv < 0 || drv as usize == id {
                        continue;
                    }
                    if !self.graph.active[drv as usize] {
                        continue;
                    }
                    seen.push(((drv as u64) << 32) | id as u64);
                }
            }
        }
        seen.sort_unstable();
        seen.dedup();
        out.reserve(seen.len());
        for k in seen {
            out.push(((k >> 32) as u32, (k & 0xffff_ffff) as u32));
        }
    }

    /// Recompute every active cell's depth from the inputs, by longest path.
    ///
    /// The value assigned at creation time is only ever an estimate: a gate
    /// wired to a bud's output has to guess, because what will eventually drive
    /// that net does not exist yet. Left alone those guesses never correct
    /// themselves, and since depth is what the colouring is, the gradient would
    /// slowly stop meaning anything. So it is recomputed outright whenever the
    /// graph changes — a Kahn pass over a DAG, linear in the graph, and only on
    /// frames where something actually grew.
    pub fn recompute_depths(&mut self, edges: &[(u32, u32)]) {
        let n = self.graph.cell_count();
        if n == 0 {
            return;
        }
        let mut indeg = vec![0u32; n];
        let mut head = vec![u32::MAX; n];
        let mut next = vec![u32::MAX; edges.len()];
        for (i, &(a, b)) in edges.iter().enumerate() {
            indeg[b as usize] += 1;
            next[i] = head[a as usize];
            head[a as usize] = i as u32;
        }

        let mut depth = vec![0u16; n];
        let mut queue: Vec<u32> = (0..n as u32)
            .filter(|&i| self.graph.active[i as usize] && indeg[i as usize] == 0)
            .collect();
        let mut seen = 0usize;
        let mut cursor = 0usize;
        while cursor < queue.len() {
            let u = queue[cursor] as usize;
            cursor += 1;
            seen += 1;
            let mut e = head[u];
            while e != u32::MAX {
                let v = edges[e as usize].1 as usize;
                depth[v] = depth[v].max(depth[u].saturating_add(1));
                indeg[v] -= 1;
                if indeg[v] == 0 {
                    queue.push(v as u32);
                }
                e = next[e as usize];
            }
        }

        let active_count = self.graph.active.iter().filter(|&&a| a).count();
        if seen != active_count {
            // Not a DAG after all. Cannot happen for feedforward circuits, but
            // rather than emit nonsense depths, leave the estimates in place.
            return;
        }
        for i in 0..n {
            if self.graph.active[i] {
                self.graph.logic_depth[i] = depth[i].saturating_add(1);
            }
        }
    }
}
