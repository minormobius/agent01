//! Uniform bucket grid over the cell. Every pair interaction in the solver —
//! contact, lubrication, electrostatics, conduction — is cut off at the same
//! radius, so one neighbour structure serves all of them.

pub struct Grid {
    pub cell: f32,
    pub nx: usize,
    pub ny: usize,
    pub min: (f32, f32),
    /// CSR-ish: `start[c]..start[c+1]` indexes into `items`.
    start: Vec<u32>,
    items: Vec<u32>,
    counts: Vec<u32>,
}

impl Grid {
    pub fn new() -> Self {
        Grid {
            cell: 1.0,
            nx: 1,
            ny: 1,
            min: (0.0, 0.0),
            start: Vec::new(),
            items: Vec::new(),
            counts: Vec::new(),
        }
    }

    /// Rebuild for `n` particles inside the square [-half, half]².
    pub fn rebuild(&mut self, x: &[f32], y: &[f32], n: usize, half: f32, cell: f32) {
        let cell = cell.max(1e-4);
        let span = 2.0 * half;
        let nx = ((span / cell).ceil() as usize).max(1);
        self.cell = cell;
        self.nx = nx;
        self.ny = nx;
        self.min = (-half, -half);

        let ncells = nx * nx;
        self.counts.clear();
        self.counts.resize(ncells, 0);
        for i in 0..n {
            let c = self.cell_of(x[i], y[i]);
            self.counts[c] += 1;
        }
        self.start.clear();
        self.start.resize(ncells + 1, 0);
        let mut acc = 0u32;
        for c in 0..ncells {
            self.start[c] = acc;
            acc += self.counts[c];
        }
        self.start[ncells] = acc;

        self.items.clear();
        self.items.resize(n, 0);
        // reuse counts as a write cursor
        for c in self.counts.iter_mut() {
            *c = 0;
        }
        for i in 0..n {
            let c = self.cell_of(x[i], y[i]);
            let at = self.start[c] + self.counts[c];
            self.items[at as usize] = i as u32;
            self.counts[c] += 1;
        }
    }

    #[inline]
    fn cell_of(&self, x: f32, y: f32) -> usize {
        let cx = (((x - self.min.0) / self.cell) as isize).clamp(0, self.nx as isize - 1) as usize;
        let cy = (((y - self.min.1) / self.cell) as isize).clamp(0, self.ny as isize - 1) as usize;
        cy * self.nx + cx
    }

    /// Call `f(i, j)` once for every ordered pair (i < j) sharing a cell or in
    /// adjacent cells. Cell size is the interaction cutoff, so this is a
    /// superset of the pairs within cutoff and the caller filters by distance.
    pub fn for_each_pair<F: FnMut(usize, usize)>(&self, x: &[f32], y: &[f32], mut f: F) {
        for cy in 0..self.ny {
            for cx in 0..self.nx {
                let c = cy * self.nx + cx;
                let a0 = self.start[c] as usize;
                let a1 = self.start[c + 1] as usize;
                if a0 == a1 {
                    continue;
                }
                // same cell
                for ai in a0..a1 {
                    let i = self.items[ai] as usize;
                    for bi in (ai + 1)..a1 {
                        let j = self.items[bi] as usize;
                        f(i.min(j), i.max(j));
                    }
                }
                // half of the 8-neighbourhood, so each cell pair is visited once
                const OFF: [(isize, isize); 4] = [(1, 0), (-1, 1), (0, 1), (1, 1)];
                for (dx, dy) in OFF {
                    let ox = cx as isize + dx;
                    let oy = cy as isize + dy;
                    if ox < 0 || oy < 0 || ox >= self.nx as isize || oy >= self.ny as isize {
                        continue;
                    }
                    let d = oy as usize * self.nx + ox as usize;
                    let b0 = self.start[d] as usize;
                    let b1 = self.start[d + 1] as usize;
                    for ai in a0..a1 {
                        let i = self.items[ai] as usize;
                        for bi in b0..b1 {
                            let j = self.items[bi] as usize;
                            f(i.min(j), i.max(j));
                        }
                    }
                }
            }
        }
        let _ = (x, y);
    }
}

#[cfg(test)]
mod tests {
    use super::Grid;

    /// The grid must enumerate every pair a brute-force sweep finds within the
    /// cutoff, and never enumerate a pair twice.
    #[test]
    fn grid_pairs_match_brute_force() {
        let mut rng = crate::rng::Rng::new(4242);
        let n = 400;
        let x: Vec<f32> = (0..n).map(|_| rng.range(-0.98, 0.98)).collect();
        let y: Vec<f32> = (0..n).map(|_| rng.range(-0.98, 0.98)).collect();
        let cut = 0.12f32;

        let mut g = Grid::new();
        g.rebuild(&x, &y, n, 1.0, cut);

        let mut seen = std::collections::HashSet::new();
        let mut found = std::collections::HashSet::new();
        g.for_each_pair(&x, &y, |i, j| {
            assert!(seen.insert((i, j)), "pair ({i},{j}) enumerated twice");
            let d2 = (x[i] - x[j]).powi(2) + (y[i] - y[j]).powi(2);
            if d2 <= cut * cut {
                found.insert((i, j));
            }
        });

        let mut brute = std::collections::HashSet::new();
        for i in 0..n {
            for j in (i + 1)..n {
                let d2 = (x[i] - x[j]).powi(2) + (y[i] - y[j]).powi(2);
                if d2 <= cut * cut {
                    brute.insert((i, j));
                }
            }
        }
        assert_eq!(found, brute, "grid missed pairs within the cutoff");
    }
}
