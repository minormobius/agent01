//! Force layout: Barnes–Hut repulsion, degree-weighted springs, weak gravity.
//!
//! The layout is never "run to completion". It relaxes a few steps every frame
//! *while cells are still dividing*, and that overlap is the whole visual idea:
//! a subcell is born on top of its parent and has to shove its way out against
//! everything already there. Relax first and grow second and you get a diagram;
//! interleave them and you get something that looks like it is assembling
//! itself.
//!
//! Repulsion is all-pairs in principle, which is why it goes through a
//! quadtree: at tens of thousands of nodes the direct sum is the frame budget
//! several times over. A cell of half-width `s` seen from distance `d` is
//! treated as a single mass when `s/d < theta`.
//!
//! The force law matters more than the constants. Repulsion has to fall off as
//! 1/d² and the centring pull must not grow with radius — get either wrong and
//! the layout reaches a perfectly stable equilibrium that has nothing to do
//! with the graph, which looks like a bug in the circuit rather than in the
//! physics. See the comments at each term.

use crate::rng::Rng;

/// Barnes–Hut opening angle. Higher is faster and blurrier.
const THETA: f32 = 0.5;
/// Repulsion beyond this distance is dropped: it is what keeps a big structure
/// from being squeezed uniformly inward by its own far side.
const MAX_DIST: f32 = 80.0;
/// Coincident nodes would otherwise produce infinite force.
const EPS2: f32 = 0.05;
/// Guards against a pathological quadtree when many nodes share a position.
const MAX_DEPTH: u32 = 24;

pub struct Params {
    pub repulsion: f32,
    pub wire: f32,
    /// Fraction of velocity shed per step.
    pub decay: f32,
    pub link_distance: f32,
    pub gravity: f32,
    pub max_speed: f32,
}

impl Default for Params {
    fn default() -> Params {
        Params {
            repulsion: 1.0,
            wire: 1.0,
            decay: 0.05,
            link_distance: 2.0,
            gravity: 0.06,
            max_speed: 1.0,
        }
    }
}

struct QNode {
    /// Centre of mass and total mass of everything below this node.
    com_x: f32,
    com_y: f32,
    mass: f32,
    /// Half-width of the square this node covers.
    half: f32,
    cx: f32,
    cy: f32,
    child: [i32; 4],
    /// Index of the single body here, or -1 for internal/empty nodes.
    body: i32,
}

pub struct Layout {
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub params: Params,
    rng: Rng,

    tree: Vec<QNode>,
    /// Scratch, reused between steps so a frame allocates nothing.
    fx: Vec<f32>,
    fy: Vec<f32>,
    degree: Vec<f32>,
    stack: Vec<i32>,

    /// Sum of squared speeds after the last step — the "still settling" signal
    /// the drone tracks.
    pub energy: f32,
}

impl Layout {
    pub fn new(seed: u32) -> Layout {
        Layout {
            x: Vec::new(),
            y: Vec::new(),
            vx: Vec::new(),
            vy: Vec::new(),
            params: Params::default(),
            rng: Rng::new(seed),
            tree: Vec::new(),
            fx: Vec::new(),
            fy: Vec::new(),
            degree: Vec::new(),
            stack: Vec::new(),
            energy: 0.0,
        }
    }

    /// Give every newly created cell a position. A child starts on top of its
    /// parent, nudged: it has to push its way out, which is what makes growth
    /// read as growth rather than as re-layout.
    pub fn sync(&mut self, count: usize, parent: &[i32]) {
        while self.x.len() < count {
            let i = self.x.len();
            let p = parent[i];
            let (px, py) = if p < 0 {
                (0.0, 0.0)
            } else {
                (self.x[p as usize], self.y[p as usize])
            };
            self.x.push(px + self.rng.signed());
            self.y.push(py + self.rng.signed());
            self.vx.push(0.0);
            self.vy.push(0.0);
        }
    }

    /// One or more relaxation steps over the active subgraph.
    ///
    /// `active` marks the cells that are currently leaves; expanded cells keep
    /// their coordinates (children are seeded from them) but exert and feel
    /// nothing.
    pub fn relax(&mut self, active: &[bool], edges: &[(u32, u32)], steps: u32) {
        let n = self.x.len();
        if n == 0 {
            return;
        }
        self.fx.resize(n, 0.0);
        self.fy.resize(n, 0.0);
        self.degree.clear();
        self.degree.resize(n, 0.0);
        for &(a, b) in edges {
            self.degree[a as usize] += 1.0;
            self.degree[b as usize] += 1.0;
        }

        for _ in 0..steps {
            self.step(active, edges);
        }
    }

    fn step(&mut self, active: &[bool], edges: &[(u32, u32)]) {
        let n = self.x.len();
        for i in 0..n {
            self.fx[i] = 0.0;
            self.fy[i] = 0.0;
        }

        self.build_tree(active);
        if !self.tree.is_empty() {
            for i in 0..n {
                if active[i] {
                    self.repel(i);
                }
            }
        }

        // Springs. Weighting by the summed degree of the endpoints stops a
        // high-degree hub from dragging its whole neighbourhood into a knot —
        // the same job the original's fanout buffers do structurally.
        let p = &self.params;
        for &(a, b) in edges {
            let (a, b) = (a as usize, b as usize);
            let (dx, dy) = (self.x[b] - self.x[a], self.y[b] - self.y[a]);
            let d2 = dx * dx + dy * dy;
            if d2 < 1e-9 {
                continue;
            }
            let d = d2.sqrt();
            let w = 1.0 / (self.degree[a] + self.degree[b]).max(1.0);
            let f = p.wire * w * (d - p.link_distance) / d;
            self.fx[a] += dx * f;
            self.fy[a] += dy * f;
            self.fx[b] -= dx * f;
            self.fy[b] -= dy * f;
        }

        let (decay, gravity, max_speed) = (p.decay, p.gravity, p.max_speed);
        let mut energy = 0.0f32;
        for i in 0..n {
            if !active[i] {
                self.vx[i] = 0.0;
                self.vy[i] = 0.0;
                continue;
            }
            // Centring only. A linear pull is a spring to the origin, and at
            // any real radius it overwhelms both other terms and compresses
            // whatever the graph is into a ball — so the magnitude is capped
            // near-constant instead of growing with distance.
            let r = (self.x[i] * self.x[i] + self.y[i] * self.y[i]).sqrt();
            let pull = gravity / (1.0 + r);
            self.fx[i] -= self.x[i] * pull;
            self.fy[i] -= self.y[i] * pull;

            let (mut vx, mut vy) = (
                (self.vx[i] + self.fx[i]) * (1.0 - decay),
                (self.vy[i] + self.fy[i]) * (1.0 - decay),
            );
            let sp2 = vx * vx + vy * vy;
            if sp2 > max_speed * max_speed {
                let s = max_speed / sp2.sqrt();
                vx *= s;
                vy *= s;
            }
            self.vx[i] = vx;
            self.vy[i] = vy;
            self.x[i] += vx;
            self.y[i] += vy;
            energy += sp2;
        }
        self.energy = energy;
    }

    // -----------------------------------------------------------------------
    // Quadtree
    // -----------------------------------------------------------------------

    fn build_tree(&mut self, active: &[bool]) {
        self.tree.clear();
        let n = self.x.len();

        let (mut lo_x, mut lo_y, mut hi_x, mut hi_y) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        let mut any = false;
        for i in 0..n {
            if !active[i] {
                continue;
            }
            any = true;
            lo_x = lo_x.min(self.x[i]);
            lo_y = lo_y.min(self.y[i]);
            hi_x = hi_x.max(self.x[i]);
            hi_y = hi_y.max(self.y[i]);
        }
        if !any {
            return;
        }

        let cx = (lo_x + hi_x) * 0.5;
        let cy = (lo_y + hi_y) * 0.5;
        let half = ((hi_x - lo_x).max(hi_y - lo_y) * 0.5).max(1e-3);
        self.tree.push(QNode {
            com_x: 0.0,
            com_y: 0.0,
            mass: 0.0,
            half,
            cx,
            cy,
            child: [-1; 4],
            body: -1,
        });

        for i in 0..n {
            if active[i] {
                self.insert(i);
            }
        }

        // Centres of mass, bottom-up. The tree is built parent-before-child, so
        // a reverse pass has every child finished before its parent.
        for k in (0..self.tree.len()).rev() {
            if self.tree[k].body >= 0 {
                continue;
            }
            let (mut mx, mut my, mut m) = (0.0f32, 0.0f32, 0.0f32);
            for c in 0..4 {
                let ci = self.tree[k].child[c];
                if ci < 0 {
                    continue;
                }
                let ch = &self.tree[ci as usize];
                mx += ch.com_x * ch.mass;
                my += ch.com_y * ch.mass;
                m += ch.mass;
            }
            if m > 0.0 {
                self.tree[k].com_x = mx / m;
                self.tree[k].com_y = my / m;
                self.tree[k].mass = m;
            }
        }
    }

    fn insert(&mut self, body: usize) {
        let (bx, by) = (self.x[body], self.y[body]);
        let mut k = 0usize;
        let mut depth = 0u32;

        loop {
            let node_body = self.tree[k].body;
            let empty = self.tree[k].mass == 0.0 && node_body < 0 && self.tree[k].child == [-1; 4];

            if empty {
                self.tree[k].body = body as i32;
                self.tree[k].com_x = bx;
                self.tree[k].com_y = by;
                self.tree[k].mass = 1.0;
                return;
            }

            if node_body >= 0 {
                if depth >= MAX_DEPTH {
                    // Coincident (or near-coincident) bodies: stop dividing and
                    // let this leaf hold several. EPS2 keeps the force finite.
                    self.tree[k].mass += 1.0;
                    return;
                }
                // Push the resident body down one level, then carry on with the
                // new one.
                self.tree[k].body = -1;
                let (rx, ry) = (self.x[node_body as usize], self.y[node_body as usize]);
                let q = Layout::quadrant(self.tree[k].cx, self.tree[k].cy, rx, ry);
                let ci = self.new_child(k, q);
                self.tree[ci].body = node_body;
                self.tree[ci].com_x = rx;
                self.tree[ci].com_y = ry;
                self.tree[ci].mass = 1.0;
            }

            self.tree[k].mass += 1.0;
            let q = Layout::quadrant(self.tree[k].cx, self.tree[k].cy, bx, by);
            k = if self.tree[k].child[q] < 0 {
                self.new_child(k, q)
            } else {
                self.tree[k].child[q] as usize
            };
            depth += 1;
        }
    }

    fn quadrant(cx: f32, cy: f32, x: f32, y: f32) -> usize {
        (if x >= cx { 1 } else { 0 }) | (if y >= cy { 2 } else { 0 })
    }

    fn new_child(&mut self, parent: usize, q: usize) -> usize {
        let half = self.tree[parent].half * 0.5;
        let cx = self.tree[parent].cx + if q & 1 != 0 { half } else { -half };
        let cy = self.tree[parent].cy + if q & 2 != 0 { half } else { -half };
        let id = self.tree.len();
        self.tree.push(QNode {
            com_x: 0.0,
            com_y: 0.0,
            mass: 0.0,
            half,
            cx,
            cy,
            child: [-1; 4],
            body: -1,
        });
        self.tree[parent].child[q] = id as i32;
        id
    }

    fn repel(&mut self, i: usize) {
        let (px, py) = (self.x[i], self.y[i]);
        let k = self.params.repulsion;
        let (mut ax, mut ay) = (0.0f32, 0.0f32);

        self.stack.clear();
        self.stack.push(0);
        while let Some(ni) = self.stack.pop() {
            let node = &self.tree[ni as usize];
            if node.mass == 0.0 || node.body == i as i32 {
                continue;
            }
            let (dx, dy) = (px - node.com_x, py - node.com_y);
            let d2 = dx * dx + dy * dy + EPS2;

            // Open the node unless it is far enough to pass as a point mass.
            if node.body < 0 && (node.half * node.half * 4.0) > THETA * THETA * d2 {
                for c in 0..4 {
                    let ci = node.child[c];
                    if ci >= 0 {
                        self.stack.push(ci);
                    }
                }
                continue;
            }
            if d2 > MAX_DIST * MAX_DIST {
                continue;
            }
            // Coulomb: magnitude k·m/d², so the extra 1/d turns the direction
            // vector into a unit vector. Getting this wrong by one power is not
            // subtle — with 1/d the far side of a large graph out-pushes the
            // springs entirely and every structure relaxes into the same disc.
            let w = k * node.mass / (d2 * d2.sqrt());
            ax += dx * w;
            ay += dy * w;
        }

        self.fx[i] += ax;
        self.fy[i] += ay;
    }

    /// Bounding box of the active nodes, for the viewer's autoscale.
    pub fn bounds(&self, active: &[bool]) -> (f32, f32, f32, f32) {
        let (mut lo_x, mut lo_y, mut hi_x, mut hi_y) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        let mut any = false;
        for i in 0..self.x.len() {
            if !active[i] {
                continue;
            }
            any = true;
            lo_x = lo_x.min(self.x[i]);
            lo_y = lo_y.min(self.y[i]);
            hi_x = hi_x.max(self.x[i]);
            hi_y = hi_y.max(self.y[i]);
        }
        if any {
            (lo_x, lo_y, hi_x, hi_y)
        } else {
            (-1.0, -1.0, 1.0, 1.0)
        }
    }
}
