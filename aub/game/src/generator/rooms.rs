use std::collections::HashSet;
use rand::Rng;
use crate::dungeon::Map;
use super::Generator;

const MIN_ROOM_SIZE: usize = 4;
const MAX_ROOM_SIZE: usize = 12;
const MIN_LEAF_SIZE: usize = MIN_ROOM_SIZE + 4;

type Point = (usize, usize);

// Stable key for an unordered pair of points.
fn pair_key(a: Point, b: Point) -> (Point, Point) {
    if a <= b { (a, b) } else { (b, a) }
}

pub struct RoomGenerator {
    pub max_depth: usize,
}

impl Default for RoomGenerator {
    fn default() -> Self {
        Self { max_depth: 5 }
    }
}

impl Generator for RoomGenerator {
    fn generate(&self, width: usize, height: usize, rng: &mut impl Rng) -> Map {
        let mut map = Map::new(width, height);
        let mut root = BspNode::new(Rect { x: 0, y: 0, width, height });
        root.split(rng, self.max_depth);
        root.place_rooms(rng);
        root.carve(&mut map);

        // BSP connectivity — tracks every connected pair so extras can't duplicate them.
        let mut connected: HashSet<(Point, Point)> = HashSet::new();
        root.connect(&mut map, rng, &mut connected);

        let mut centers: Vec<Point> = Vec::new();
        root.gather_centers(&mut centers);
        let n = centers.len();
        if n >= 2 {
            for _ in 0..(n / 3).max(2) {
                let a = centers[rng.gen_range(0..n)];
                let b = centers[rng.gen_range(0..n)];
                if a != b {
                    let key = pair_key(a, b);
                    if connected.insert(key) {
                        dig_corridor(&mut map, a, b, rng.gen_bool(0.5));
                    }
                }
            }
        }

        map
    }
}

struct Rect {
    x: usize,
    y: usize,
    width: usize,
    height: usize,
}

struct BspNode {
    region: Rect,
    left: Option<Box<BspNode>>,
    right: Option<Box<BspNode>>,
    room: Option<Rect>,
}

impl BspNode {
    fn new(region: Rect) -> Self {
        Self { region, left: None, right: None, room: None }
    }

    fn split(&mut self, rng: &mut impl Rng, depth: usize) {
        if depth == 0 {
            return;
        }
        let can_h = self.region.height >= MIN_LEAF_SIZE * 2;
        let can_v = self.region.width >= MIN_LEAF_SIZE * 2;
        if !can_h && !can_v {
            return;
        }
        let horizontal = if can_h && can_v { rng.gen_bool(0.5) } else { can_h };

        let dim = if horizontal { self.region.height } else { self.region.width };
        let lo = MIN_LEAF_SIZE;
        let hi = dim - MIN_LEAF_SIZE;
        let range = hi - lo;

        let offset = match rng.gen_range(0..10u32) {
            0..=2 => rng.gen_range(0..=range / 3),
            3..=5 => rng.gen_range((2 * range / 3)..=range),
            _     => rng.gen_range((range / 4)..=((3 * range / 4).max(range / 4))),
        };
        let split_at = lo + offset;

        if horizontal {
            self.left = Some(Box::new(BspNode::new(Rect {
                x: self.region.x, y: self.region.y,
                width: self.region.width, height: split_at,
            })));
            self.right = Some(Box::new(BspNode::new(Rect {
                x: self.region.x, y: self.region.y + split_at,
                width: self.region.width, height: self.region.height - split_at,
            })));
        } else {
            self.left = Some(Box::new(BspNode::new(Rect {
                x: self.region.x, y: self.region.y,
                width: split_at, height: self.region.height,
            })));
            self.right = Some(Box::new(BspNode::new(Rect {
                x: self.region.x + split_at, y: self.region.y,
                width: self.region.width - split_at, height: self.region.height,
            })));
        }

        if let Some(left) = &mut self.left { left.split(rng, depth - 1); }
        if let Some(right) = &mut self.right { right.split(rng, depth - 1); }
    }

    fn place_rooms(&mut self, rng: &mut impl Rng) {
        if self.left.is_none() && self.right.is_none() {
            let max_w = self.region.width.saturating_sub(2).min(MAX_ROOM_SIZE);
            let max_h = self.region.height.saturating_sub(2).min(MAX_ROOM_SIZE);
            if max_w < MIN_ROOM_SIZE || max_h < MIN_ROOM_SIZE {
                return;
            }
            let w = rng.gen_range(MIN_ROOM_SIZE..=max_w);
            let h = rng.gen_range(MIN_ROOM_SIZE..=max_h);
            let x = self.region.x + rng.gen_range(1..=self.region.width - 1 - w);
            let y = self.region.y + rng.gen_range(1..=self.region.height - 1 - h);
            self.room = Some(Rect { x, y, width: w, height: h });
        } else {
            if let Some(left) = &mut self.left { left.place_rooms(rng); }
            if let Some(right) = &mut self.right { right.place_rooms(rng); }
        }
    }

    fn center(&self) -> Option<Point> {
        if let Some(r) = &self.room {
            return Some((r.x + r.width / 2, r.y + r.height / 2));
        }
        if let Some(c) = self.left.as_ref().and_then(|l| l.center()) {
            return Some(c);
        }
        self.right.as_ref().and_then(|r| r.center())
    }

    fn gather_centers(&self, out: &mut Vec<Point>) {
        if let Some(r) = &self.room {
            out.push((r.x + r.width / 2, r.y + r.height / 2));
        }
        if let Some(l) = &self.left { l.gather_centers(out); }
        if let Some(r) = &self.right { r.gather_centers(out); }
    }

    fn carve(&self, map: &mut Map) {
        if let Some(r) = &self.room {
            for y in r.y..r.y + r.height {
                for x in r.x..r.x + r.width {
                    map.dig(x, y);
                }
            }
        }
        if let Some(left) = &self.left { left.carve(map); }
        if let Some(right) = &self.right { right.carve(map); }
    }

    fn connect(&self, map: &mut Map, rng: &mut impl Rng, connected: &mut HashSet<(Point, Point)>) {
        if let (Some(left), Some(right)) = (&self.left, &self.right) {
            left.connect(map, rng, connected);
            right.connect(map, rng, connected);
            if let (Some(a), Some(b)) = (left.center(), right.center()) {
                connected.insert(pair_key(a, b));
                dig_corridor(map, a, b, rng.gen_bool(0.5));
            }
        }
    }
}

fn dig_corridor(map: &mut Map, from: Point, to: Point, h_first: bool) {
    let (mut x, mut y) = from;
    let (tx, ty) = to;
    if h_first {
        while x != tx { map.dig(x, y); x = if x < tx { x + 1 } else { x - 1 }; }
        while y != ty { map.dig(x, y); y = if y < ty { y + 1 } else { y - 1 }; }
    } else {
        while y != ty { map.dig(x, y); y = if y < ty { y + 1 } else { y - 1 }; }
        while x != tx { map.dig(x, y); x = if x < tx { x + 1 } else { x - 1 }; }
    }
    map.dig(x, y);
}
