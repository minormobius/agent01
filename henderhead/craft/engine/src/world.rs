//! The grid, the motion, and the crafting.
//!
//! Two phases per tick, in this order:
//!
//!   1. **Motion.** Each cell, with probability `motion`, exchanges contents
//!      with a random orthogonal neighbour. Exchange rather than "move into an
//!      empty cell", because exchange is the same operation whether the
//!      neighbour is empty or not, and it keeps stirring after the grid has
//!      filled up — which is when a move-into-empty rule would seize solid.
//!
//!      This phase is the whole reason the automaton is alive. Without it the
//!      grid crafts whatever its initial layout happens to contain and then
//!      sits there forever: every recipe consumes its ingredients, nothing
//!      brings new neighbours together, and the thing dies in a few hundred
//!      ticks. "I added random motion to keep the grid alive" is not a
//!      decoration, it is the load-bearing half of the rule, and the motion
//!      slider on the page lets you watch it fail at zero.
//!
//!   2. **Crafting.** Every recipe shape is matched against the grid wherever
//!      it fits, all matches are collected, and then they are taken one at a
//!      time with no cell used twice in a tick — so two recipes competing for
//!      the same plank do not both get it.
//!
//!      **Which one gets it is the one thing the video does not settle**, and
//!      it changes the automaton completely. Five planks in a U are a boat,
//!      but the bottom three of them are also a slab and the left two are also
//!      a stick, and whichever rule picks between those decides whether the
//!      grid ever reaches boats at all. In the video's opening seconds that U
//!      becomes a boat, which is why `Priority::Biggest` — prefer the match
//!      with the most ingredients — is the default here. `Priority::Random`
//!      is the other reading, and the page offers it as a switch rather than
//!      pretending the question was answered.
//!
//! The grid is a torus. That is a choice, not something the video shows: it
//! costs nothing, and it keeps the statistics honest, since on a bounded grid
//! the corners see fewer recipe placements than the middle and the histogram
//! would be measuring the edge as much as the rule.

use crate::recipes::{self, Recipe, EMPTY};

/// How to choose between two recipes that want the same cell.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Priority {
    /// Most ingredients first. Big recipes survive being nibbled at by small
    /// ones, so the grid climbs its own tech tree.
    Biggest,
    /// Shuffled. Small high-yield recipes win most of the time simply by being
    /// more numerous, and the deep end of the tree is far rarer.
    Random,
}

pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self { Rng(seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407) | 1) }
    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    #[inline]
    pub fn below(&mut self, n: usize) -> usize {
        if n == 0 { return 0; }
        (self.next_u64() % n as u64) as usize
    }
    #[inline]
    pub fn chance(&mut self, p: f64) -> bool {
        p > 0.0 && (self.next_u64() >> 11) as f64 * (1.0 / 9007199254740992.0) < p
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Craft {
    /// top-left of the matched shape, already wrapped into the grid
    pub x: u16,
    pub y: u16,
    pub w: u8,
    pub h: u8,
    /// the recipe that fired, as an index into `World::recipes`
    pub recipe: u16,
    pub out: u16,
    /// how many of the output were actually placed…
    pub placed: u8,
    /// …and how many had nowhere to go. A grid with no room left loses these.
    pub spilled: u8,
    /// where the first one landed
    pub out_x: u16,
    pub out_y: u16,
}

pub struct World {
    pub w: usize,
    pub h: usize,
    pub cells: Vec<u16>,
    pub recipes: Vec<Recipe>,
    /// item id → the recipes whose *first* ingredient (reading order) is that
    /// item, with the offset of that ingredient inside the shape. Anchoring on
    /// one designated cell rather than any of them is what stops the same
    /// (recipe, position) pair being tested once per ingredient.
    index: Vec<Vec<(u16, u8, u8)>>,
    /// stamped with `tick + 1` when a cell is consumed or filled this tick
    used: Vec<u64>,
    pub counts: Vec<u32>,
    pub banned: Vec<bool>,
    pub discovered: Vec<u64>,
    pub rng: Rng,
    pub motion: f64,
    /// crafts fired per tick per 1000 cells — see `craft_phase`
    pub craft_rate: f64,
    /// The fraction of the grid to keep stocked with fresh logs, planks and
    /// cobblestone. Zero is off.
    ///
    /// **Not in the video** — an addition, and the page says so. Every recipe
    /// in the table is a one-way trip and nothing on this grid mines, so a
    /// world left running turns into a field of slabs and levers with no wood
    /// or stone left and nothing further to do. Forty seconds is not long
    /// enough to see that; a page somebody leaves open is.
    ///
    /// It is a *level* rather than a rate for the same reason a bath has a
    /// float valve: a constant drip eventually fills the grid solid with
    /// terminal items, and a jammed grid cannot craft at all, so the end state
    /// of a fixed-rate supply is a worse kind of death than the one it was
    /// meant to prevent. Supplying up to a level instead leaves room to work
    /// in, and the automaton settles into a real equilibrium.
    pub restock: f64,
    pub priority: Priority,
    pub tick: u64,
    pub crafts: Vec<Craft>,
    pub total_crafts: u64,
    pub total_spilled: u64,
}

pub const NEVER: u64 = u64::MAX;

impl World {
    pub fn new(w: usize, h: usize, seed: u64) -> Self {
        let recipes = recipes::all();
        let n_items = recipes::ITEMS.len() + 1;
        let mut index = vec![Vec::new(); n_items];
        for (ri, r) in recipes.iter().enumerate() {
            let (ax, ay, item) = first_ingredient(r);
            index[item as usize].push((ri as u16, ax, ay));
        }
        let mut banned = vec![false; n_items];
        for name in recipes::BANNED_BY_DEFAULT {
            if let Some(id) = recipes::item_id(name) { banned[id as usize] = true; }
        }
        let mut world = World {
            w, h,
            cells: vec![EMPTY; w * h],
            recipes,
            index,
            used: vec![0; w * h],
            counts: vec![0; n_items],
            banned,
            discovered: vec![NEVER; n_items],
            rng: Rng::new(seed),
            motion: 0.15,
            craft_rate: 2.0,
            restock: 0.0,
            priority: Priority::Random,
            tick: 0,
            crafts: Vec::new(),
            total_crafts: 0,
            total_spilled: 0,
        };
        world.seed(0.12);
        world
    }

    /// Scatter the seed stock at the given density. Everything else on the
    /// grid from here on has to be crafted.
    pub fn seed(&mut self, density: f64) {
        self.cells.iter_mut().for_each(|c| *c = EMPTY);
        self.counts.iter_mut().for_each(|c| *c = 0);
        self.discovered.iter_mut().for_each(|d| *d = NEVER);
        self.tick = 0;
        self.total_crafts = 0;
        self.total_spilled = 0;
        self.crafts.clear();
        let seeds: Vec<u16> = recipes::SEEDS.iter().filter_map(|n| recipes::item_id(n)).collect();
        for i in 0..self.cells.len() {
            if self.rng.chance(density) {
                let it = seeds[self.rng.below(seeds.len())];
                self.cells[i] = it;
                self.counts[it as usize] += 1;
                self.discovered[it as usize] = 0;
            }
        }
    }

    #[inline]
    fn idx(&self, x: usize, y: usize) -> usize { y * self.w + x }
    #[inline]
    fn wrap_x(&self, x: isize) -> usize { x.rem_euclid(self.w as isize) as usize }
    #[inline]
    fn wrap_y(&self, y: isize) -> usize { y.rem_euclid(self.h as isize) as usize }

    pub fn step(&mut self) {
        self.tick += 1;
        self.crafts.clear();
        self.motion_phase();
        self.craft_phase();
        self.restock_phase();
    }

    fn motion_phase(&mut self) {
        if self.motion <= 0.0 { return; }
        let (w, h) = (self.w, self.h);
        for y in 0..h {
            for x in 0..w {
                if !self.rng.chance(self.motion) { continue; }
                let (dx, dy) = match self.rng.below(4) {
                    0 => (1isize, 0isize),
                    1 => (-1, 0),
                    2 => (0, 1),
                    _ => (0, -1),
                };
                let a = self.idx(x, y);
                let b = self.idx(self.wrap_x(x as isize + dx), self.wrap_y(y as isize + dy));
                self.cells.swap(a, b);
            }
        }
    }

    /// Top the grid up towards `restock` full with fresh seed stock.
    fn restock_phase(&mut self) {
        if self.restock <= 0.0 { return; }
        let total = self.cells.len() as f64;
        let frac = self.occupied() as f64 / total;
        if frac >= self.restock { return; }
        // proportional, so it fills briskly when far below the mark and eases
        // off as it approaches instead of overshooting into a jam
        let n = (self.restock - frac) * total * 0.006;
        let whole = n.floor() as usize;
        let extra = if self.rng.chance(n - n.floor()) { 1 } else { 0 };
        let seeds: Vec<u16> = recipes::SEEDS.iter().filter_map(|s| recipes::item_id(s)).collect();
        for _ in 0..(whole + extra) {
            // one blind try per drop: on a crowded grid most land on an
            // occupied cell and do nothing, which is the right behaviour —
            // restocking should slow down as the grid fills, not force its way in
            let i = self.rng.below(self.cells.len());
            if self.cells[i] != EMPTY { continue; }
            let it = seeds[self.rng.below(seeds.len())];
            self.cells[i] = it;
            self.counts[it as usize] += 1;
            if self.discovered[it as usize] == NEVER { self.discovered[it as usize] = self.tick; }
        }
    }

    fn craft_phase(&mut self) {
        let stamp = self.tick + 1;
        // ---- find every match, changing nothing ----
        let mut found: Vec<(u8, u32, u16, i32, i32)> = Vec::new(); // (size, tiebreak, recipe, ox, oy)
        for cell in 0..self.cells.len() {
            let item = self.cells[cell];
            if item == EMPTY { continue; }
            let (x, y) = (cell % self.w, cell / self.w);
            for c in 0..self.index[item as usize].len() {
                let (ri, ax, ay) = self.index[item as usize][c];
                let r = &self.recipes[ri as usize];
                if self.banned[r.out as usize] { continue; }
                let ox = x as isize - ax as isize;
                let oy = y as isize - ay as isize;
                if self.matches(ri as usize, ox, oy) {
                    found.push((r.ingredients() as u8, 0, ri, ox as i32, oy as i32));
                }
            }
        }
        if found.is_empty() { return; }

        // ---- order them ----
        for f in found.iter_mut() { f.1 = self.rng.next_u64() as u32; }
        match self.priority {
            Priority::Biggest => found.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1))),
            Priority::Random => found.sort_by_key(|f| f.1),
        }

        // ---- fire a few of them ----
        //
        // Not all of them. Firing every match every tick burns the whole grid
        // down in about a hundred ticks: the logs go in the first few, then the
        // planks, then the cobblestone, and what is left is a field of slabs
        // and walls that are ingredients in nothing. The video does not look
        // like that — it has one to three green boxes on screen at a time over
        // forty seconds, and its closing histogram still has cobblestone
        // second and planks fourth, which a grid running flat out would not.
        //
        // So the table works at a rate. `craft_rate` is crafts per tick per
        // 1000 cells; turn it up far enough and you get the flat-out rule back,
        // and can watch it strip the grid.
        // Fractional: at the rates that look like the video a 700-cell grid
        // wants well under one craft per tick, so the remainder is taken as a
        // probability rather than rounded away.
        let want = (self.craft_rate * self.cells.len() as f64) / 1000.0;
        let mut budget = want.floor() as usize;
        if self.rng.chance(want - want.floor()) { budget += 1; }
        if budget == 0 { return; }
        let mut fired = 0;
        for &(_, _, ri, ox, oy) in &found {
            if fired >= budget { break; }
            // try_craft re-checks the shape, so a match whose cells were taken
            // by an earlier one simply fails here rather than needing to be
            // tracked and removed.
            if let Some(craft) = self.try_craft(ri as usize, ox as isize, oy as isize, stamp) {
                self.crafts.push(craft);
                self.total_crafts += 1;
                self.total_spilled += craft.spilled as u64;
                fired += 1;
            }
        }
    }

    /// Does this recipe sit at (ox, oy)? Read-only, and it ignores the used
    /// marks — it is the survey pass, not the firing pass.
    fn matches(&self, ri: usize, ox: isize, oy: isize) -> bool {
        let r = &self.recipes[ri];
        let (rw, rh) = (r.w as usize, r.h as usize);
        if rw > self.w || rh > self.h { return false; }
        for ry in 0..rh {
            for rx in 0..rw {
                let cx = self.wrap_x(ox + rx as isize);
                let cy = self.wrap_y(oy + ry as isize);
                if self.cells[self.idx(cx, cy)] != r.cells[ry * rw + rx] { return false; }
            }
        }
        true
    }

    /// Test one recipe with its top-left at (ox, oy) and, if it matches, fire
    /// it. Returns None on any mismatch, leaving the grid untouched.
    fn try_craft(&mut self, ri: usize, ox: isize, oy: isize, stamp: u64) -> Option<Craft> {
        let (rw, rh) = (self.recipes[ri].w as usize, self.recipes[ri].h as usize);
        if rw > self.w || rh > self.h { return None; }
        let mut consumed: Vec<usize> = Vec::with_capacity(9);
        let mut sum_x = 0f64;
        let mut sum_y = 0f64;
        for ry in 0..rh {
            for rx in 0..rw {
                let want = self.recipes[ri].cells[ry * rw + rx];
                let cx = self.wrap_x(ox + rx as isize);
                let cy = self.wrap_y(oy + ry as isize);
                let ci = self.idx(cx, cy);
                // a cell already spoken for this tick is not available, whether
                // the recipe wants an item there or an empty slot
                if self.used[ci] == stamp { return None; }
                if self.cells[ci] != want { return None; }
                if want != EMPTY {
                    consumed.push(ci);
                    sum_x += rx as f64;
                    sum_y += ry as f64;
                }
            }
        }
        if consumed.is_empty() { return None; }

        let out = self.recipes[ri].out;
        let want = self.recipes[ri].yield_ as usize;
        let cx = sum_x / consumed.len() as f64;
        let cy = sum_y / consumed.len() as f64;

        // consume
        for &ci in &consumed {
            let was = self.cells[ci];
            self.cells[ci] = EMPTY;
            self.counts[was as usize] -= 1;
            self.used[ci] = stamp;
        }

        // Place the outputs. The first goes to the ingredient cell nearest the
        // middle of the shape, which is where the video puts it — a boat made
        // from a 3×2 of planks lands in the bottom middle, and that cell is the
        // one closest to the centroid of the five planks, not the centre of the
        // bounding box (which is the hole).
        let mut targets: Vec<(u64, usize)> = consumed
            .iter()
            .map(|&ci| {
                let (x, y) = (ci % self.w, ci / self.w);
                let rx = wrap_delta(x as isize - ox, self.w) as f64;
                let ry = wrap_delta(y as isize - oy, self.h) as f64;
                let d = (rx - cx) * (rx - cx) + (ry - cy) * (ry - cy);
                ((d * 4096.0) as u64, ci)
            })
            .collect();
        targets.sort_by_key(|t| (t.0, t.1));

        let mut placed = 0usize;
        let mut first = None;
        for &(_, ci) in targets.iter() {
            if placed >= want { break; }
            self.cells[ci] = out;
            self.counts[out as usize] += 1;
            placed += 1;
            if first.is_none() { first = Some(ci); }
        }

        // Anything left over spills into the nearest empty cells. This is the
        // inference the video's histogram forces: the top of the ranking is
        // very nearly the ranking of yields, so the extra planks, sticks and
        // slabs a recipe returns must be going somewhere rather than being
        // thrown away.
        if placed < want {
            let start_x = self.wrap_x(ox + (cx.round() as isize));
            let start_y = self.wrap_y(oy + (cy.round() as isize));
            placed += self.spill(out, want - placed, start_x, start_y, stamp);
        }

        let anchor = first.unwrap_or(consumed[0]);
        if placed > 0 && self.discovered[out as usize] == NEVER {
            self.discovered[out as usize] = self.tick;
        }
        Some(Craft {
            x: self.wrap_x(ox) as u16,
            y: self.wrap_y(oy) as u16,
            w: rw as u8,
            h: rh as u8,
            recipe: ri as u16,
            out,
            placed: placed.min(255) as u8,
            spilled: (want - placed).min(255) as u8,
            out_x: (anchor % self.w) as u16,
            out_y: (anchor / self.w) as u16,
        })
    }

    /// Put `n` of `item` into the nearest free cells, searching outward in
    /// rings. `RADIUS` bounds the work; beyond it the grid is full enough that
    /// the output is genuinely lost, which is worth counting rather than
    /// hiding.
    fn spill(&mut self, item: u16, n: usize, sx: usize, sy: usize, stamp: u64) -> usize {
        const RADIUS: isize = 6;
        let mut done = 0;
        for r in 1..=RADIUS {
            for dy in -r..=r {
                for dx in -r..=r {
                    if dx.abs() != r && dy.abs() != r { continue; } // ring only
                    let x = self.wrap_x(sx as isize + dx);
                    let y = self.wrap_y(sy as isize + dy);
                    let ci = self.idx(x, y);
                    if self.cells[ci] != EMPTY || self.used[ci] == stamp { continue; }
                    self.cells[ci] = item;
                    self.counts[item as usize] += 1;
                    self.used[ci] = stamp;
                    done += 1;
                    if done == n { return done; }
                }
            }
        }
        done
    }

    pub fn occupied(&self) -> u32 { self.counts.iter().sum() }

    /// Put an item in a cell, keeping `counts` and the discovery log honest.
    /// Used to set up an exact starting position — by the tests, and by the
    /// page when someone paints on the grid.
    pub fn put(&mut self, x: usize, y: usize, item: u16) {
        if x >= self.w || y >= self.h { return; }
        let i = self.idx(x, y);
        let was = self.cells[i];
        if was != EMPTY { self.counts[was as usize] -= 1; }
        self.cells[i] = item;
        if item != EMPTY {
            self.counts[item as usize] += 1;
            if self.discovered[item as usize] == NEVER { self.discovered[item as usize] = self.tick; }
        }
    }

    pub fn get(&self, x: usize, y: usize) -> u16 { self.cells[self.idx(x, y)] }

    /// Recount the grid from scratch. `counts` is maintained incrementally on
    /// every consume, place and spill, so this is the thing that proves the
    /// bookkeeping has not drifted.
    pub fn recount(&self) -> Vec<u32> {
        let mut c = vec![0u32; self.counts.len()];
        for &v in &self.cells { c[v as usize] += 1; }
        c[EMPTY as usize] = 0;
        c
    }

    pub fn clear(&mut self) {
        self.cells.iter_mut().for_each(|c| *c = EMPTY);
        self.counts.iter_mut().for_each(|c| *c = 0);
    }

    pub fn set_banned(&mut self, item: u16, on: bool) {
        if (item as usize) < self.banned.len() { self.banned[item as usize] = on; }
    }
}

/// The first ingredient of a shape in reading order, and where it sits.
fn first_ingredient(r: &Recipe) -> (u8, u8, u16) {
    for y in 0..r.h {
        for x in 0..r.w {
            let v = r.at(x, y);
            if v != EMPTY { return (x, y, v); }
        }
    }
    unreachable!("a recipe with no ingredients")
}

/// Shortest signed distance on a ring of length `n` — a shape that straddles
/// the wrap must still know its own geometry.
fn wrap_delta(d: isize, n: usize) -> isize {
    let n = n as isize;
    let m = d.rem_euclid(n);
    if m > n / 2 { m - n } else { m }
}
