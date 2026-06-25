use std::collections::HashSet;
use rand::Rng;
use rand::seq::SliceRandom;
use crate::dungeon::{Map, Room, Tile};
use super::Generator;

pub struct MazeRoomsGenerator {
    /// Exact number of rooms to place. Generation retries up to `room_attempts`
    /// times to find valid non-overlapping positions.
    pub target_rooms: usize,
    /// Maximum placement attempts before giving up (should be >> target_rooms).
    pub room_attempts: usize,
    pub min_room_size: usize, // must be odd
    pub max_room_size: usize, // must be odd
    /// Probability of opening a redundant connector to create loops.
    pub extra_connector_chance: f64,
    /// Remove dead-end corridors until only inter-room paths remain.
    pub prune_dead_ends: bool,
    /// Fraction of odd cells that seed maze growth (0.0 = no corridors, 1.0 = full maze).
    /// Lower values leave more open wall substrate between rooms.
    pub maze_density: f64,
    /// Maximum walkable tiles in any corridor segment between rooms.
    /// Chains longer than this are removed entirely. If doing so would leave
    /// fewer than min_rooms connected rooms, the cap is skipped for this map.
    pub max_corridor_length: usize,
    /// Minimum number of connected rooms that must survive before the corridor
    /// length cap is allowed to run. Guards against overly aggressive trimming
    /// on seeds where rooms happen to be widely spaced.
    pub min_rooms: usize,
}

impl Default for MazeRoomsGenerator {
    fn default() -> Self {
        Self {
            target_rooms: 9,
            room_attempts: 500,
            min_room_size: 3,
            max_room_size: 9,
            extra_connector_chance: 0.03,
            prune_dead_ends: true,
            maze_density: 0.4,
            max_corridor_length: 20,
            min_rooms: 4,
        }
    }
}

impl Generator for MazeRoomsGenerator {
    fn generate(&self, width: usize, height: usize, rng: &mut impl Rng) -> Map {
        let mut map = Map::new(width, height);
        // Each floor tile is tagged with the region it belongs to (0 = wall / unassigned).
        let mut regions = vec![0usize; width * height];
        let mut next_id = 1usize;

        // ── 1. Place rooms ──────────────────────────────────────────────────
        // Rooms must have odd dimensions and sit at odd (x, y) so they align
        // with the maze cell grid that fills the space between them.
        let mut anchor: Option<(usize, usize)> = None;
        let mut placed = 0usize;
        // room_tiles tracks which map indices belong to placed rooms so the
        // cycle-removal step never touches them.
        let mut room_tiles = vec![false; width * height];
        // One representative tile per room for fast connectivity checks.
        let mut room_reps: Vec<(usize, usize)> = Vec::new();

        for _ in 0..self.room_attempts {
            if placed >= self.target_rooms { break; }
            let w = match odd_in(rng, self.min_room_size, self.max_room_size) {
                Some(v) => v, None => continue,
            };
            let h = match odd_in(rng, self.min_room_size, self.max_room_size) {
                Some(v) => v, None => continue,
            };
            // Room + its surrounding wall must fit inside the map.
            let max_x = match width.checked_sub(w + 1) { Some(v) if v >= 1 => v, _ => continue };
            let max_y = match height.checked_sub(h + 1) { Some(v) if v >= 1 => v, _ => continue };

            let x = match odd_in(rng, 1, max_x) { Some(v) => v, None => continue };
            let y = match odd_in(rng, 1, max_y) { Some(v) => v, None => continue };

            // Reject if no existing room is within corridor-length reach.
            if !room_reps.is_empty() {
                let (cx, cy) = (x + w / 2, y + h / 2);
                let in_range = room_reps.iter().any(|&(rx, ry)| {
                    cx.abs_diff(rx) + cy.abs_diff(ry) <= self.max_corridor_length
                });
                if !in_range { continue; }
            }

            // Reject if any tile in the room + 1-cell border is already open.
            let x0 = x.saturating_sub(1);
            let y0 = y.saturating_sub(1);
            let x1 = (x + w).min(width - 1);
            let y1 = (y + h).min(height - 1);
            if (x0..=x1).any(|rx| (y0..=y1).any(|ry| map.tile(rx, ry) == Tile::Floor)) {
                continue;
            }

            let id = next_id;
            next_id += 1;
            for ry in y..y + h {
                for rx in x..x + w {
                    map.dig(rx, ry);
                    regions[ry * width + rx] = id;
                    room_tiles[ry * width + rx] = true;
                }
            }
            let center = (x + w / 2, y + h / 2);
            map.rooms.push(Room { x, y, width: w, height: h });
            room_reps.push(center);
            anchor.get_or_insert(center);
            placed += 1;
        }

        // ── 2. Fill remaining space with a maze ─────────────────────────────
        // The recursive backtracker walks from a random subset of unvisited odd
        // cells (controlled by maze_density). Skipped cells remain solid wall,
        // keeping the substrate open and corridors sparse.
        for cy in (1..height - 1).step_by(2) {
            for cx in (1..width - 1).step_by(2) {
                if map.tile(cx, cy) == Tile::Wall && rng.gen_bool(self.maze_density) {
                    let id = next_id;
                    next_id += 1;
                    grow_maze(&mut map, &mut regions, cx, cy, id, width, rng);
                }
            }
        }

        // ── 3. Connect regions via connectors ───────────────────────────────
        // A connector is a wall tile whose cardinal floor neighbours belong to
        // at least two different regions.  We shuffle them for randomness, then
        // use a union-find to open the minimum set that connects everything,
        // plus a small random extra for loops.
        let mut connectors: Vec<(usize, usize)> = Vec::new();
        for y in 1..height - 1 {
            for x in 1..width - 1 {
                if map.tile(x, y) != Tile::Wall { continue; }
                let adj = adjacent_regions(x, y, &regions, &map, width);
                if adj.len() >= 2 {
                    connectors.push((x, y));
                }
            }
        }
        connectors.shuffle(rng);

        let mut uf = UnionFind::new(next_id);

        for &(cx, cy) in &connectors {
            let adj = adjacent_regions(cx, cy, &regions, &map, width);
            if adj.len() < 2 { continue; }

            let regs: Vec<usize> = adj.into_iter().collect();
            if !uf.connected(regs[0], regs[1]) {
                map.dig(cx, cy);
                regions[cy * width + cx] = regs[0];
                uf.union(regs[0], regs[1]);
            } else if rng.gen_bool(self.extra_connector_chance) {
                map.dig(cx, cy);
            }
        }

        // ── 4. Prune dead ends ───────────────────────────────────────────────
        // Repeatedly remove floor tiles that have only one open cardinal
        // neighbour until none remain.  This trims the maze corridors down to
        // only the paths that actually connect rooms.
        if self.prune_dead_ends {
            loop {
                let mut changed = false;
                for y in 1..height - 1 {
                    for x in 1..width - 1 {
                        if map.tile(x, y) == Tile::Wall { continue; }
                        if open_cardinal_count(&map, x, y) <= 1 {
                            map.set_tile(x, y, Tile::Wall);
                            changed = true;
                        }
                    }
                }
                if !changed { break; }
            }
        }

        // ── 4b. Remove corridor cycles that don't connect rooms ─────────────
        // Dead-end pruning removes stubs but leaves cycles (every tile in a
        // loop has ≥2 neighbours, so it looks "useful"). We iteratively try to
        // wall off each non-room floor tile; if all rooms remain connected the
        // tile was redundant (part of a useless loop) and stays walled. This
        // converges to a spanning-tree of corridors with no dead-end paths to
        // nowhere while preserving intentional extra_connector_chance loops
        // that actually bridge two different room groups.
        if room_reps.len() >= 2 {
            loop {
                let mut changed = false;
                for y in 1..height - 1 {
                    for x in 1..width - 1 {
                        if map.tile(x, y) != Tile::Floor { continue; }
                        if room_tiles[y * width + x] { continue; }
                        map.set_tile(x, y, Tile::Wall);
                        if rooms_connected(&map, &room_reps) {
                            changed = true;
                        } else {
                            map.set_tile(x, y, Tile::Floor);
                        }
                    }
                }
                if !changed { break; }
            }
            // A second dead-end pass cleans up stubs left behind by removed cycles.
            loop {
                let mut changed = false;
                for y in 1..height - 1 {
                    for x in 1..width - 1 {
                        if map.tile(x, y) == Tile::Wall { continue; }
                        if room_tiles[y * width + x] { continue; }
                        if open_cardinal_count(&map, x, y) <= 1 {
                            map.set_tile(x, y, Tile::Wall);
                            changed = true;
                        }
                    }
                }
                if !changed { break; }
            }
        }

        // ── 4c. Cap corridor length ──────────────────────────────────────────
        // Walks every corridor chain — a run of tiles with exactly 2 open
        // cardinal neighbours, ending at a room or junction on each side.
        // Over-long chains are replaced with a direct L-shaped corridor between
        // their endpoints if the Manhattan distance fits; otherwise the chain is
        // simply removed. If fewer than min_rooms rooms survive, the whole step
        // is rolled back.
        {
            let snap = map.save_tiles();

            // Phase 1: detect all over-long chains (read-only pass).
            let mut chain_visited = vec![false; width * height];
            let mut over_long: Vec<Vec<(usize, usize)>> = Vec::new();

            for start_y in 1..height - 1 {
                for start_x in 1..width - 1 {
                    let idx = start_y * width + start_x;
                    if map.tile(start_x, start_y) != Tile::Floor { continue; }
                    if chain_visited[idx] { continue; }
                    if is_key_tile(&map, &room_tiles, start_x, start_y, width) { continue; }

                    let adj_key = [(0i32,-1i32),(0,1),(1,0),(-1,0)].iter().any(|&(dx,dy)| {
                        let nx = start_x as i32 + dx;
                        let ny = start_y as i32 + dy;
                        map.in_bounds(nx, ny)
                            && is_key_tile(&map, &room_tiles, nx as usize, ny as usize, width)
                    });
                    if !adj_key { continue; }

                    let mut chain = vec![(start_x, start_y)];
                    chain_visited[idx] = true;
                    let mut cur = (start_x, start_y);
                    loop {
                        let next = [(0i32,-1i32),(0,1),(1,0),(-1,0)].iter().find_map(|&(dx,dy)| {
                            let nx = cur.0 as i32 + dx;
                            let ny = cur.1 as i32 + dy;
                            if !map.in_bounds(nx, ny) { return None; }
                            let (nx, ny) = (nx as usize, ny as usize);
                            let nidx = ny * width + nx;
                            if map.tile(nx, ny) == Tile::Floor
                                && !chain_visited[nidx]
                                && !is_key_tile(&map, &room_tiles, nx, ny, width)
                            { Some((nx, ny)) } else { None }
                        });
                        match next {
                            Some((nx, ny)) => {
                                chain_visited[ny * width + nx] = true;
                                chain.push((nx, ny));
                                cur = (nx, ny);
                            }
                            None => break,
                        }
                    }

                    if chain.len() > self.max_corridor_length {
                        over_long.push(chain);
                    }
                }
            }

            // Phase 2: remove old chains, then carve direct replacements.
            for chain in &over_long {
                for &(x, y) in chain {
                    map.set_tile(x, y, Tile::Wall);
                }
            }
            for chain in &over_long {
                let (x1, y1) = chain[0];
                let (x2, y2) = *chain.last().unwrap();
                let manhattan = x1.abs_diff(x2) + y1.abs_diff(y2);
                if manhattan < self.max_corridor_length {
                    for (px, py) in l_path(x1, y1, x2, y2, rng.gen_bool(0.5)) {
                        map.set_tile(px, py, Tile::Floor);
                    }
                }
            }

            // Remove stubs left by chains that had no direct replacement.
            loop {
                let mut changed = false;
                for y in 1..height - 1 {
                    for x in 1..width - 1 {
                        if map.tile(x, y) == Tile::Wall { continue; }
                        if room_tiles[y * width + x] { continue; }
                        if open_cardinal_count(&map, x, y) <= 1 {
                            map.set_tile(x, y, Tile::Wall);
                            changed = true;
                        }
                    }
                }
                if !changed { break; }
            }

            // Roll back if the cap left too few connected rooms.
            let reachable = count_reachable_rooms(&map, &room_reps);
            let floor = self.min_rooms.min(room_reps.len());
            if reachable < floor {
                map.load_tiles(snap);
            }
        }

        // ── 5. Remove isolated islands ───────────────────────────────────────
        // Flood-fill from a known-good tile (first room centre) and wall off
        // anything unreachable.  Handles rare isolated maze pockets.
        let start = anchor.or_else(|| {
            (0..height).flat_map(|y| (0..width).map(move |x| (x, y)))
                .find(|&(x, y)| map.tile(x, y) == Tile::Floor)
        });
        if let Some((sx, sy)) = start {
            let mut visited = vec![false; width * height];
            let mut stack = vec![(sx, sy)];
            visited[sy * width + sx] = true;
            while let Some((x, y)) = stack.pop() {
                for (nx, ny) in cardinal_floor_neighbours(&map, x, y) {
                    let idx = ny * width + nx;
                    if !visited[idx] {
                        visited[idx] = true;
                        stack.push((nx, ny));
                    }
                }
            }
            for y in 0..height {
                for x in 0..width {
                    if map.tile(x, y) == Tile::Floor && !visited[y * width + x] {
                        map.set_tile(x, y, Tile::Wall);
                    }
                }
            }
        }

        // ── 5b. Relabel rooms after pruning ─────────────────────────────────
        // Island removal may have walled off rooms that were isolated. Drop any
        // room whose center tile is no longer floor so labels stay sequential.
        let centers: Vec<(usize, usize)> = map.rooms.iter().map(|r| r.center()).collect();
        let keep: Vec<bool> = centers.iter().map(|&(cx, cy)| map.tile(cx, cy) == Tile::Floor).collect();
        let mut ki = 0;
        map.rooms.retain(|_| { let k = keep[ki]; ki += 1; k });

        // ── 6. Place entrance on the map border ─────────────────────────────
        // Collect border tiles that have an interior floor neighbour so the
        // opening connects to the dungeon, then pick one at random.
        {
            let mut candidates: Vec<(usize, usize)> = Vec::new();
            for x in 0..width {
                if map.tile(x, 1) == Tile::Floor          { candidates.push((x, 0)); }
                if map.tile(x, height - 2) == Tile::Floor { candidates.push((x, height - 1)); }
            }
            for y in 1..height - 1 {
                if map.tile(1, y) == Tile::Floor          { candidates.push((0, y)); }
                if map.tile(width - 2, y) == Tile::Floor  { candidates.push((width - 1, y)); }
            }
            if let Some(&(ex, ey)) = candidates.choose(rng) {
                map.dig(ex, ey);
                map.entrance = Some((ex, ey));
            }
        }

        map.rebuild_connections();
        map
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Uniformly random odd number in [lo, hi], or None if no odd number exists there.
fn odd_in(rng: &mut impl Rng, lo: usize, hi: usize) -> Option<usize> {
    let lo = if lo % 2 == 0 { lo + 1 } else { lo };
    let hi = if hi % 2 == 0 { hi.saturating_sub(1) } else { hi };
    if lo > hi { return None; }
    let count = (hi - lo) / 2 + 1;
    Some(lo + rng.gen_range(0..count) * 2)
}

/// Recursive-backtracker maze from (sx, sy), tagging every carved tile with `region`.
fn grow_maze(
    map: &mut Map,
    regions: &mut Vec<usize>,
    sx: usize,
    sy: usize,
    region: usize,
    width: usize,
    rng: &mut impl Rng,
) {
    map.dig(sx, sy);
    regions[sy * width + sx] = region;
    let mut stack = vec![(sx, sy)];

    while !stack.is_empty() {
        let &(cx, cy) = stack.last().unwrap();

        // Candidate next cells are 2 steps away in cardinal directions.
        let candidates: Vec<(usize, usize, usize, usize)> =
            [(0i32, -2i32), (2, 0), (0, 2), (-2, 0)]
            .iter()
            .filter_map(|&(dx, dy)| {
                let nx = cx as i32 + dx;
                let ny = cy as i32 + dy;
                if !map.in_bounds(nx, ny) { return None; }
                let (nx, ny) = (nx as usize, ny as usize);
                if map.tile(nx, ny) != Tile::Wall { return None; }
                let wx = (cx as i32 + dx / 2) as usize;
                let wy = (cy as i32 + dy / 2) as usize;
                Some((nx, ny, wx, wy))
            })
            .collect();

        if candidates.is_empty() {
            stack.pop();
        } else {
            let &(nx, ny, wx, wy) = candidates.choose(rng).unwrap();
            map.dig(wx, wy);
            regions[wy * width + wx] = region;
            map.dig(nx, ny);
            regions[ny * width + nx] = region;
            stack.push((nx, ny));
        }
    }
}

/// Distinct region IDs of the cardinal floor neighbours of (x, y).
fn adjacent_regions(
    x: usize, y: usize,
    regions: &[usize],
    map: &Map,
    width: usize,
) -> HashSet<usize> {
    [(0i32, -1i32), (0, 1), (1, 0), (-1, 0)]
        .iter()
        .filter_map(|&(dx, dy)| {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if !map.in_bounds(nx, ny) { return None; }
            let r = regions[ny as usize * width + nx as usize];
            if r > 0 { Some(r) } else { None }
        })
        .collect()
}

fn open_cardinal_count(map: &Map, x: usize, y: usize) -> usize {
    [(0i32, -1i32), (0, 1), (1, 0), (-1, 0)]
        .iter()
        .filter(|&&(dx, dy)| {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            map.in_bounds(nx, ny)
                && map.tile(nx as usize, ny as usize) == Tile::Floor
        })
        .count()
}

fn cardinal_floor_neighbours(map: &Map, x: usize, y: usize) -> Vec<(usize, usize)> {
    [(0i32, -1i32), (0, 1), (1, 0), (-1, 0)]
        .iter()
        .filter_map(|&(dx, dy)| {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if map.in_bounds(nx, ny) && map.tile(nx as usize, ny as usize) == Tile::Floor {
                Some((nx as usize, ny as usize))
            } else {
                None
            }
        })
        .collect()
}

/// L-shaped path of tiles from (x1,y1) to (x2,y2), both endpoints included.
/// `h_first` selects horizontal-then-vertical vs vertical-then-horizontal.
fn l_path(x1: usize, y1: usize, x2: usize, y2: usize, h_first: bool) -> Vec<(usize, usize)> {
    let mut path = Vec::new();
    if h_first {
        let mut x = x1;
        while x != x2 { path.push((x, y1)); x = if x < x2 { x + 1 } else { x - 1 }; }
        let mut y = y1;
        while y != y2 { path.push((x2, y)); y = if y < y2 { y + 1 } else { y - 1 }; }
    } else {
        let mut y = y1;
        while y != y2 { path.push((x1, y)); y = if y < y2 { y + 1 } else { y - 1 }; }
        let mut x = x1;
        while x != x2 { path.push((x, y2)); x = if x < x2 { x + 1 } else { x - 1 }; }
    }
    path.push((x2, y2));
    path
}

/// A key tile is one that terminates a corridor chain: either a room tile or a
/// corridor junction (non-room tile with 3+ open cardinal neighbours).
fn is_key_tile(map: &Map, room_tiles: &[bool], x: usize, y: usize, width: usize) -> bool {
    room_tiles[y * width + x] || open_cardinal_count(map, x, y) >= 3
}

/// Count how many room representatives are reachable from the first one.
fn count_reachable_rooms(map: &Map, reps: &[(usize, usize)]) -> usize {
    if reps.is_empty() { return 0; }
    let w = map.width;
    let &(sx, sy) = &reps[0];
    if map.tile(sx, sy) != Tile::Floor { return 0; }
    let mut visited = vec![false; w * map.height];
    let mut stack = vec![(sx, sy)];
    visited[sy * w + sx] = true;
    while let Some((x, y)) = stack.pop() {
        for (nx, ny) in cardinal_floor_neighbours(map, x, y) {
            if !visited[ny * w + nx] {
                visited[ny * w + nx] = true;
                stack.push((nx, ny));
            }
        }
    }
    reps.iter().filter(|&&(rx, ry)| visited[ry * w + rx]).count()
}

/// True if every room representative is reachable from the first one.
/// Used by the cycle-removal step to ensure rooms stay connected.
fn rooms_connected(map: &Map, reps: &[(usize, usize)]) -> bool {
    if reps.len() < 2 { return true; }
    let w = map.width;
    let &(sx, sy) = &reps[0];
    if map.tile(sx, sy) != Tile::Floor { return false; }
    let mut visited = vec![false; w * map.height];
    let mut stack = vec![(sx, sy)];
    visited[sy * w + sx] = true;
    while let Some((x, y)) = stack.pop() {
        for (nx, ny) in cardinal_floor_neighbours(map, x, y) {
            if !visited[ny * w + nx] {
                visited[ny * w + nx] = true;
                stack.push((nx, ny));
            }
        }
    }
    reps[1..].iter().all(|&(rx, ry)| visited[ry * w + rx])
}

// ── Union-Find ───────────────────────────────────────────────────────────────

struct UnionFind {
    parent: Vec<usize>,
}

impl UnionFind {
    fn new(n: usize) -> Self {
        Self { parent: (0..n).collect() }
    }

    fn find(&mut self, mut x: usize) -> usize {
        while self.parent[x] != x {
            self.parent[x] = self.parent[self.parent[x]]; // path splitting
            x = self.parent[x];
        }
        x
    }

    fn connected(&mut self, a: usize, b: usize) -> bool {
        self.find(a) == self.find(b)
    }

    fn union(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra != rb { self.parent[ra] = rb; }
    }
}
