#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Dir {
    N  = 0,
    NE = 1,
    E  = 2,
    SE = 3,
    S  = 4,
    SW = 5,
    W  = 6,
    NW = 7,
}

impl Dir {
    pub const ALL: [Dir; 8] = [
        Dir::N, Dir::NE, Dir::E, Dir::SE,
        Dir::S, Dir::SW, Dir::W, Dir::NW,
    ];

    /// Clockwise ordering means the opposite is always +4 mod 8.
    pub fn opposite(self) -> Dir {
        Dir::ALL[(self as usize + 4) % 8]
    }

    pub fn delta(self) -> (i32, i32) {
        match self {
            Dir::N  => ( 0, -1),
            Dir::NE => ( 1, -1),
            Dir::E  => ( 1,  0),
            Dir::SE => ( 1,  1),
            Dir::S  => ( 0,  1),
            Dir::SW => (-1,  1),
            Dir::W  => (-1,  0),
            Dir::NW => (-1, -1),
        }
    }
}

/// Bitmask of which of a tile's 8 neighbours it is connected to.
/// Bit position matches `Dir as u8`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Connections(pub u8);

impl Connections {
    pub fn has(self, dir: Dir) -> bool {
        self.0 & (1 << dir as u8) != 0
    }

    fn set(&mut self, dir: Dir, active: bool) {
        if active {
            self.0 |= 1 << dir as u8;
        } else {
            self.0 &= !(1 << dir as u8);
        }
    }

    pub fn iter(self) -> impl Iterator<Item = Dir> {
        Dir::ALL.into_iter().filter(move |&d| self.has(d))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Tile {
    Wall,
    Floor,
    /// Radiation zone — deals 1 damage/turn, visible as glowing tiles.
    RadiationZone,
    /// Electrical hazard — can stun the player, sparks visually.
    ElectricalHazard,
    /// Unstable floor — can collapse, causing fall to next level.
    CollapseHazard,
    /// Acid pool — corrosive, deals damage and applies acid status.
    AcidPool,
    /// Control Panel — victory tile on Level 5. Interact to win.
    ControlPanel,
    /// Spreading fire pool left by a thrown molotov. Damages and
    /// applies the `Burning` status to anyone who enters. Always
    /// posted via an `ExpiringHazard` so the tile reverts after a
    /// turn — there is no permanent FirePool spawn path.
    FirePool,
}

impl Tile {
    pub fn is_walkable(self) -> bool {
        matches!(
            self,
            Tile::Floor
            | Tile::RadiationZone
            | Tile::ElectricalHazard
            | Tile::CollapseHazard
            | Tile::AcidPool
            | Tile::ControlPanel
            | Tile::FirePool,
        )
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Room {
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub height: usize,
}

impl Room {
    pub fn center(&self) -> (usize, usize) {
        (self.x + self.width / 2, self.y + self.height / 2)
    }

    /// Is `(x, y)` inside the room rectangle? (Room interior only;
    /// the bounding wall — `room.x - 1` etc. — is *not* counted.)
    pub fn contains(&self, x: usize, y: usize) -> bool {
        x >= self.x && x < self.x + self.width
            && y >= self.y && y < self.y + self.height
    }
}

/// Which door art to draw. Both kinds share the same open sprite —
/// the user-visible difference is only on the closed face. New
/// kinds plug in by adding a variant + a closed-sprite path in the
/// renderer's lookup; the rotation / FOV / movement plumbing is
/// kind-agnostic.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum DoorKind {
    /// Standard ship corridor door — heavy bulkhead with a porthole.
    /// Default for any door spawned by `detect_doors`.
    Bulkhead,
    /// Lighter maintenance door — used on the cryo-bay janitorial
    /// closet entrance. Authored separately so the closet reads as
    /// "service hatch" rather than "armoured corridor".
    Janitor,
    /// Zone-transition door — sits on the east / west edge of the
    /// map and links one level (zone) to its neighbour around the
    /// rotating drum of the ship. The eastern zone door advances
    /// to the next level; the western one is locked until the
    /// player finds an access key.
    Zone,
}

/// A door. Sits on a Floor tile at the boundary between a corridor
/// (or another room) and a room. The `room_dir` field points from
/// the door tile **toward** the room — `S` for the canonical "north
/// wall" door (room is south of the door, corridor approaches from
/// the north). The renderer rotates the sprite per `room_dir` and
/// picks which sprite to show via `kind`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Door {
    pub pos: (usize, usize),
    pub room_dir: Dir,
    pub kind: DoorKind,
    /// Persistent open / closed state. Doors start closed; the
    /// player flips this with a deliberate `E` press while adjacent.
    /// FOV, monster pathfinding, and the renderer all key off this
    /// flag (proximity-based auto-open is gone).
    pub open: bool,
    /// Locked doors refuse to open without an access key. The only
    /// locked door we currently spawn is the western zone door;
    /// adding more is a flag flip in level-gen.
    pub locked: bool,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Map {
    pub width: usize,
    pub height: usize,
    pub rooms: Vec<Room>,
    pub entrance: Option<(usize, usize)>,
    tiles: Vec<Tile>,
    connections: Vec<Connections>,
}

impl Map {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            rooms: Vec::new(),
            entrance: None,
            tiles: vec![Tile::Wall; width * height],
            connections: vec![Connections::default(); width * height],
        }
    }

    fn idx(&self, x: usize, y: usize) -> usize {
        y * self.width + x
    }

    pub fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && x < self.width as i32 && y < self.height as i32
    }

    pub fn tile(&self, x: usize, y: usize) -> Tile {
        self.tiles[self.idx(x, y)]
    }

    pub fn is_open(&self, x: usize, y: usize) -> bool {
        self.tile(x, y).is_walkable()
    }

    pub fn connections_at(&self, x: usize, y: usize) -> Connections {
        self.connections[self.idx(x, y)]
    }

    pub fn tile_slice(&self) -> &[Tile] {
        &self.tiles
    }

    pub fn save_tiles(&self) -> Vec<Tile> {
        self.tiles.clone()
    }

    pub fn load_tiles(&mut self, snapshot: Vec<Tile>) {
        self.tiles = snapshot;
    }

    /// Open this tile and update the connections of all eight neighbours.
    /// This is the normal mutation path — safe to call at any time.
    pub fn dig(&mut self, x: usize, y: usize) {
        let idx = self.idx(x, y);
        if self.tiles[idx] == Tile::Floor {
            return;
        }
        self.tiles[idx] = Tile::Floor;
        self.sync_connections(x, y);
    }

    /// Set a tile without touching connections.
    /// Use together with `rebuild_connections` for bulk writes (e.g. cellular automata).
    pub fn set_tile(&mut self, x: usize, y: usize, tile: Tile) {
        let idx = self.idx(x, y);
        self.tiles[idx] = tile;
    }

    /// Recompute every connection from the current tile state.
    pub fn rebuild_connections(&mut self) {
        for c in &mut self.connections {
            *c = Connections::default();
        }
        for y in 0..self.height {
            for x in 0..self.width {
                self.sync_connections(x, y);
            }
        }
    }

    /// Update the connection bitmask for (x, y) and each of its neighbours.
    fn sync_connections(&mut self, x: usize, y: usize) {
        let si = self.idx(x, y);
        let self_open = self.tiles[si] == Tile::Floor;
        for &dir in &Dir::ALL {
            let (dx, dy) = dir.delta();
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if !self.in_bounds(nx, ny) {
                continue;
            }
            let (nx, ny) = (nx as usize, ny as usize);
            let ni = self.idx(nx, ny);
            let connected = self_open && self.tiles[ni] == Tile::Floor;
            self.connections[si].set(dir, connected);
            self.connections[ni].set(dir.opposite(), connected);
        }
    }
}
