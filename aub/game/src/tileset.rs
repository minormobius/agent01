//! Biome tilesets for dungeon rendering.
//!
//! A `Tileset` is the set of graphical pieces the renderer needs to
//! paint a single dungeon floor: the floor itself, a fill/substrate
//! for interior walls, and one piece per adjacency slot for walls
//! that touch floor.
//!
//! ## Five-tile biomes
//!
//! Every biome ships **five canonical pieces**:
//!
//! 1. `floor`        — the deck plating / regolith / etc.
//! 2. `wall_n`       — wall whose floor side is to the north.
//! 3. `wall_s`       — wall whose floor side is to the south.
//! 4. `wall_e`       — wall whose floor side is to the east.
//! 5. `corner_ne`    — wall with floor to its north and east.
//!
//! From those five we derive the remaining slots:
//!
//! - `wall_w`        ← horizontal mirror of `wall_e`.
//! - `corner_se`     ← `corner_ne` rotated 90° clockwise.
//! - `corner_sw`     ← `corner_ne` rotated 180°.
//! - `corner_nw`     ← `corner_ne` rotated 270° clockwise.
//!
//! Outer corners (corridor entrances etc.) re-use the same piece pool
//! as inner corners for now — the engine can split them later by
//! adding a sixth field to `BiomeTiles`. Genuinely-interior wall
//! tiles fall back to a solid `fill` color the biome supplies.
//!
//! ## Tile variants
//!
//! Each slot is a `Vec<TilePiece>` so a biome can ship multiple
//! variants per slot for visual noise. The renderer hashes the
//! tile's `(x, y)` to pick one deterministically; a single-piece
//! `Vec` degenerates to "one piece per slot". Five-tile biomes only
//! ship one variant per slot today; pushing more pieces into the
//! `Vec` is a one-line edit when richer art lands.
//!
//! ## Switching biomes
//!
//! Build a `Tileset` for a `Biome` via `Tileset::for_biome(biome, sprites)`.
//! The caller (typically `Sprites::build` or a per-floor swap in
//! `main.rs`) picks the biome — generators and stocking don't care.

use macroquad::prelude::*;
use crate::dungeon::{Map, Tile};

/// One drawable tile piece — solid colour or a texture region.
///
/// `Sprite` carries an optional baked rotation (in radians) plus
/// independent horizontal / vertical flips. The renderer always
/// applies them. Use these to derive sibling slots from a single
/// canonical piece — e.g. a west-facing wall is `wall_e` mirrored
/// horizontally; the SW corner is `corner_ne` rotated 180°.
/// Combined with `draw_tile`'s `rotate_random` flag for floors, the
/// total rotation is `baked + random`.
#[derive(Clone)]
pub enum TilePiece {
    Color(Color),
    Sprite {
        texture: Texture2D,
        source: Rect,
        rotation: f32,
        flip_x: bool,
        flip_y: bool,
    },
}

impl TilePiece {
    /// Build a sprite piece sampling the full texture, no rotation
    /// or flip. Most biome tiles start life as one of these.
    pub fn sprite(texture: Texture2D, source: Rect) -> Self {
        Self::Sprite { texture, source, rotation: 0.0, flip_x: false, flip_y: false }
    }

    /// Same piece, mirrored across the vertical axis. Used to derive
    /// `wall_w` from `wall_e` (the rim of an east-facing wall ends
    /// up on the left side, which is exactly what a west-facing wall
    /// wants). For solid colors this is a no-op.
    pub fn mirrored_horizontal(&self) -> Self {
        match self {
            Self::Color(c) => Self::Color(*c),
            Self::Sprite { texture, source, rotation, flip_x, flip_y } => Self::Sprite {
                texture: texture.clone(),
                source: *source,
                rotation: *rotation,
                flip_x: !flip_x,
                flip_y: *flip_y,
            },
        }
    }

    /// Same piece, rotated by `turns × 90°` clockwise. Used to derive
    /// the three other corner slots from `corner_ne`. For solid
    /// colors this is a no-op.
    pub fn rotated_clockwise(&self, turns: u32) -> Self {
        let extra = (turns as f32) * std::f32::consts::FRAC_PI_2;
        match self {
            Self::Color(c) => Self::Color(*c),
            Self::Sprite { texture, source, rotation, flip_x, flip_y } => Self::Sprite {
                texture: texture.clone(),
                source: *source,
                rotation: *rotation + extra,
                flip_x: *flip_x,
                flip_y: *flip_y,
            },
        }
    }
}

/// Pool of one or more pieces for a single slot. The renderer picks
/// per `(x, y)` via `tile_hash`, so a slot with N variants gets used
/// to visually "shuffle" without flickering frame-to-frame.
#[derive(Clone)]
pub struct TileVariants {
    /// Non-empty by construction — `single` and `many` enforce this.
    pieces: Vec<TilePiece>,
}

impl TileVariants {
    /// Single-piece pool — the variant model degenerates to the old
    /// "one piece per slot" behaviour.
    pub fn single(piece: TilePiece) -> Self {
        Self { pieces: vec![piece] }
    }
    /// Multi-piece pool. Panics on empty input — callers should
    /// always ship at least one piece.
    pub fn many(pieces: Vec<TilePiece>) -> Self {
        assert!(!pieces.is_empty(), "TileVariants::many requires ≥1 piece");
        Self { pieces }
    }
    /// Pick the piece for tile `(x, y)`. Stable across frames; for
    /// a single-piece pool this is just the lone entry.
    pub fn pick(&self, x: usize, y: usize) -> &TilePiece {
        if self.pieces.len() == 1 { return &self.pieces[0]; }
        // `coord_hash` mixes both axes through a SplitMix-style
        // avalanche, so neither the variant nor the rotation pick
        // (which uses the same hash) repeats periodically along
        // either axis. The naive `x * prime + y * prime` we used
        // before leaked low bits — `% 4` collapsed to `x % 4` on
        // any odd-prime multiplier, which made the floor's
        // 0/90/180/270 rotation rotate every four columns.
        &self.pieces[coord_hash(x, y) % self.pieces.len()]
    }
}

/// Stable per-tile mix of `(x, y)` with proper avalanche so the low
/// bits aren't a simple linear function of a single coordinate. Used
/// for both variant selection in `TileVariants::pick` and the floor
/// rotation in `draw_tile` — the salt parameter lets callers
/// decorrelate the two without writing a second mixer.
fn coord_hash(x: usize, y: usize) -> usize {
    salted_coord_hash(x, y, 0)
}

/// Same mixer as `coord_hash`, but with a caller-supplied salt fed
/// into the avalanche. Two callsites with different salts produce
/// independent-looking hashes for the same `(x, y)` — used by the
/// rotation pick so it doesn't track the variant pick.
fn salted_coord_hash(x: usize, y: usize, salt: u64) -> usize {
    // SplitMix64-style mixer. The constants are the published
    // SplitMix finaliser primes; the initial mix folds in both
    // coordinates plus the salt before the avalanche kicks in.
    let mut h = (x as u64).wrapping_mul(0x9E3779B97F4A7C15)
        ^ (y as u64).wrapping_mul(0xBF58476D1CE4E5B9)
        ^ salt;
    h ^= h >> 30;
    h = h.wrapping_mul(0xBF58476D1CE4E5B9);
    h ^= h >> 27;
    h = h.wrapping_mul(0x94D049BB133111EB);
    h ^= h >> 31;
    h as usize
}

/// Which wall piece to draw at a given tile. The renderer picks one
/// of these per wall-tile based on its neighbourhood.
///
/// **Two kinds of corner.** A wall whose two adjacent cardinals are
/// floor (e.g. floor to N and E) is an *outer* corner — the wall
/// juts into a floor area, like at a corridor entrance. A wall with
/// all four cardinals walled but a single diagonal floor is an
/// *inner* corner — a room's inside corner where the floor only
/// shows around the bend. They share the same source art today, so
/// both feed off the biome's single `corner_ne` piece.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WallSlot {
    EdgeN, EdgeS, EdgeE, EdgeW,
    /// Inner corners — diagonal-only floor.
    CornerNE, CornerNW, CornerSE, CornerSW,
    /// Outer corners — two adjacent cardinals are floor (corridor
    /// entrances, branching walls). Same name convention: NE means
    /// floor is to the wall's N AND E.
    OuterCornerNE, OuterCornerNW, OuterCornerSE, OuterCornerSW,
    /// Interior wall with no floor neighbours — also used as the
    /// fallback for T-junctions and other unusual shapes until we
    /// give them dedicated slots.
    Fill,
}

/// The built-in biome catalogue. Add a variant + a match arm in
/// `Tileset::for_biome` to introduce a new one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Biome {
    /// Cool-grey solid-color regolith floors with structural walls —
    /// the original placeholder palette. Useful for any unloaded /
    /// fallback case since it requires no assets.
    Lunar,
    /// Derelict-ship plating — bulkhead corridors, sealed compartments.
    /// Five hand-drawn PNGs in `assets/biomes/`: `floor_tile_dark`,
    /// `north_wall`, `south_wall`, `east_wall`, `northeast_wall`. The
    /// other wall slots are derived via mirror / rotation.
    Ship,
}

/// The five canonical textures a biome ships, named from the
/// **author's perspective** — "north_wall" is the wall the player
/// would see at the *north* side of a room, regardless of the slot
/// machinery in `WallSlot`. The renderer remaps these to the
/// slot-perspective fields of `Tileset` inside `from_biome_tiles`.
///
/// Author-perspective naming because that's how the on-disk PNGs
/// are organised — `assets/biomes/north_wall.png` is the wall you'd
/// expect to see along a room's north edge.
pub struct BiomeAssets<'a> {
    pub floor:      &'a Texture2D,
    /// Wall that sits at the north side of a room. (Slot semantics:
    /// floor is to its south → `WallSlot::EdgeS`.)
    pub north_wall: &'a Texture2D,
    /// Wall that sits at the south side of a room. (`WallSlot::EdgeN`.)
    pub south_wall: &'a Texture2D,
    /// Wall that sits at the east side of a room. The west-side
    /// counterpart is derived by horizontal mirror. (`WallSlot::EdgeW`.)
    pub east_wall:  &'a Texture2D,
    /// Wall that sits at the NE corner of a room. The other three
    /// room-corner orientations are derived via 90°/180°/270° CW
    /// rotation. (Inner-corner slot `CornerSW`; outer corners
    /// reuse the same source with their own rotations.)
    pub ne_corner:  &'a Texture2D,
}

/// The five canonical pieces a biome ships, plus the fallback fill
/// for genuine interior walls. Field names match the **author's
/// perspective** (`north_wall` = the wall along the north side of a
/// room) — the same convention as `BiomeAssets` and the on-disk
/// PNGs. `from_biome_tiles` handles the remap to slot perspective
/// (where `EdgeN` means "wall whose floor is to the *north*", which
/// is the south wall of a room).
///
/// Each slot is a `Vec<TilePiece>` so future variant work just
/// pushes more pieces into the slot's pool; the renderer already
/// hashes `(x, y)` to pick one. Single-element `Vec`s are fine and
/// represent the current "one tile per slot" state.
pub struct BiomeTiles {
    pub floor:      Vec<TilePiece>,
    pub north_wall: Vec<TilePiece>,
    pub south_wall: Vec<TilePiece>,
    pub east_wall:  Vec<TilePiece>,
    pub ne_corner:  Vec<TilePiece>,
    /// Solid colour painted for `WallSlot::Fill` — interior walls with
    /// no floor neighbour. Five-tile biomes don't ship art for this,
    /// so it stays a flat colour the biome chooses to match its mood.
    pub fill:       TilePiece,
    /// `true` to apply a deterministic 0/90/180/270° rotation per
    /// floor tile, breaking up tiled repetition. Only safe for
    /// rotation-symmetric floor art (regolith, gravel, abstract
    /// patterns); directional sprites with rivets / seams / arrows
    /// should leave this `false` so the orientation cue stays
    /// consistent. Walls always render unrotated regardless of this
    /// flag — their slot art is orientation-bearing by design.
    pub floor_rotate: bool,
}

/// Full biome description for dungeon rendering. Each slot is a
/// pool of pieces; the renderer hashes the tile coords to pick one.
#[derive(Clone)]
pub struct Tileset {
    pub floor:     TileVariants,
    pub fill:      TileVariants,
    pub edge_n:    TileVariants,
    pub edge_s:    TileVariants,
    pub edge_e:    TileVariants,
    pub edge_w:    TileVariants,
    /// Inner corners (diagonal-only floor).
    pub corner_ne: TileVariants,
    pub corner_nw: TileVariants,
    pub corner_se: TileVariants,
    pub corner_sw: TileVariants,
    /// Outer corners (cardinal-pair floor — corridor entrances etc.).
    pub outer_corner_ne: TileVariants,
    pub outer_corner_nw: TileVariants,
    pub outer_corner_se: TileVariants,
    pub outer_corner_sw: TileVariants,
    /// Carried through from `BiomeTiles::floor_rotate`. Read by the
    /// renderer at draw time to decide whether to apply the per-tile
    /// 0/90/180/270° rotation that breaks up tiled repetition.
    pub floor_rotate: bool,
}

impl Tileset {
    /// Borrow the variant pool for the given slot.
    pub fn wall(&self, slot: WallSlot) -> &TileVariants {
        match slot {
            WallSlot::EdgeN          => &self.edge_n,
            WallSlot::EdgeS          => &self.edge_s,
            WallSlot::EdgeE          => &self.edge_e,
            WallSlot::EdgeW          => &self.edge_w,
            WallSlot::CornerNE       => &self.corner_ne,
            WallSlot::CornerNW       => &self.corner_nw,
            WallSlot::CornerSE       => &self.corner_se,
            WallSlot::CornerSW       => &self.corner_sw,
            WallSlot::OuterCornerNE  => &self.outer_corner_ne,
            WallSlot::OuterCornerNW  => &self.outer_corner_nw,
            WallSlot::OuterCornerSE  => &self.outer_corner_se,
            WallSlot::OuterCornerSW  => &self.outer_corner_sw,
            WallSlot::Fill           => &self.fill,
        }
    }

    /// Build a tileset for a given biome. `assets` carries every
    /// texture pool the biome factories might consult — biomes that
    /// don't need a particular asset just don't touch the field.
    pub fn for_biome(biome: Biome, assets: &BiomeAssets) -> Self {
        let bt = match biome {
            Biome::Lunar   => lunar_tiles(),
            Biome::Ship => ship_tiles(assets),
        };
        Tileset::from_biome_tiles(&bt)
    }

    /// Build a tileset from a biome's five author-perspective pieces.
    /// Routes them into the slot-perspective fields of `Tileset`,
    /// deriving the missing four pieces (west wall + three non-NE
    /// corners) by mirror / rotation.
    ///
    /// **Author → slot remap.** The author thinks "the wall at the
    /// north side of a room"; the engine thinks "the wall whose
    /// neighbour to the north is floor". Those describe the same
    /// physical tile but with opposite directional language —
    /// `WallSlot::EdgeN` (floor to its north) is the wall at the
    /// *south* side of a room, and so on. So `north_wall` feeds
    /// `edge_s`, `south_wall` feeds `edge_n`, `east_wall` feeds
    /// `edge_w`, and the mirrored `east_wall` feeds `edge_e`.
    ///
    /// **Corner rotation map.** Author's `ne_corner` is the wall
    /// piece that lives at a room's NE corner — wall mass in one
    /// half of the tile, floor side along the diagonal. That
    /// canonical orientation fits slot `CornerSW` (wall has floor
    /// to its SW = wall sits at the NE of a room) **with no
    /// rotation**. The other three room-corner orientations are 90°
    /// / 180° / 270° clockwise rotations of the canonical.
    ///
    /// **Outer corners get an extra 180°** on top of the inner
    /// derivation. At a corridor entry the wall stub points the
    /// opposite direction from a room corner — the bevel needs to
    /// face the corridor opening, not the room interior — so the
    /// canonical art is flipped before landing in the
    /// `OuterCorner*` slots.
    pub fn from_biome_tiles(t: &BiomeTiles) -> Self {
        let mirror_h = |pieces: &[TilePiece]| -> Vec<TilePiece> {
            pieces.iter().map(TilePiece::mirrored_horizontal).collect()
        };
        let rotate = |pieces: &[TilePiece], turns: u32| -> Vec<TilePiece> {
            pieces.iter().map(|p| p.rotated_clockwise(turns)).collect()
        };

        let west_wall = mirror_h(&t.east_wall);

        // Inner corners (room corners). The author's NE-of-room
        // piece lives at slot `CornerSW`; rotating 90° CW each step
        // walks it through the other three room corners.
        let inner_sw = t.ne_corner.clone();              // NE-of-room (canonical)
        let inner_nw = rotate(&t.ne_corner, 1);          // SE-of-room
        let inner_ne = rotate(&t.ne_corner, 2);          // SW-of-room
        let inner_se = rotate(&t.ne_corner, 3);          // NW-of-room

        // Outer corners (corridor entries) — inner derivation +180°.
        let outer_sw = rotate(&t.ne_corner, 2);
        let outer_nw = rotate(&t.ne_corner, 3);
        let outer_ne = t.ne_corner.clone();
        let outer_se = rotate(&t.ne_corner, 1);

        Tileset {
            floor:     TileVariants::many(t.floor.clone()),
            fill:      TileVariants::single(t.fill.clone()),

            // Author → slot edge remap (described above).
            edge_n:    TileVariants::many(t.south_wall.clone()),
            edge_s:    TileVariants::many(t.north_wall.clone()),
            edge_e:    TileVariants::many(west_wall),
            edge_w:    TileVariants::many(t.east_wall.clone()),

            // Inner corners (room corners with diagonal-only floor).
            corner_ne: TileVariants::many(inner_ne),
            corner_se: TileVariants::many(inner_se),
            corner_sw: TileVariants::many(inner_sw),
            corner_nw: TileVariants::many(inner_nw),

            // Outer corners (corridor entries).
            outer_corner_ne: TileVariants::many(outer_ne),
            outer_corner_se: TileVariants::many(outer_se),
            outer_corner_sw: TileVariants::many(outer_sw),
            outer_corner_nw: TileVariants::many(outer_nw),

            floor_rotate: t.floor_rotate,
        }
    }
}

// ── Built-in biomes ──────────────────────────────────────────────────────────

/// Default fallback. Cool-grey regolith + structural walls + near-
/// black rock. All slots solid colour so they tile perfectly with
/// every neighbour; seam-free by construction.
fn lunar_tiles() -> BiomeTiles {
    let floor_c = Color::from_rgba(142, 142, 152, 255);
    let wall_c  = Color::from_rgba( 78,  82,  96, 255);
    let fill_c  = Color::from_rgba( 28,  30,  40, 255);
    let wall    = TilePiece::Color(wall_c);
    BiomeTiles {
        floor_rotate: false,
        floor:      vec![TilePiece::Color(floor_c)],
        north_wall: vec![wall.clone()],
        south_wall: vec![wall.clone()],
        east_wall:  vec![wall.clone()],
        ne_corner:  vec![wall.clone()],
        fill:       TilePiece::Color(fill_c),
    }
}

/// Derelict-ship hull built from five hand-drawn PNGs in
/// `assets/biomes/`. Each slot pulls its full-texture extent — no
/// atlas slicing. Future variants just push more pieces into the
/// slot's `Vec`. The `Fill` slot stays solid (lunar's dark interior)
/// since the biome doesn't ship dedicated interior-wall art.
///
/// **Floor rotation off** — the ship floor sprite is directional
/// (rivets, deck-plate seams) and looks wrong rotated 90°/180°/270°.
/// Other biomes can opt back in via `floor_rotate: true` when their
/// floor art is rotation-symmetric.
fn ship_tiles(assets: &BiomeAssets) -> BiomeTiles {
    let full = |tex: &Texture2D| -> Vec<TilePiece> {
        vec![TilePiece::sprite(
            tex.clone(),
            Rect::new(0.0, 0.0, tex.width(), tex.height()),
        )]
    };
    BiomeTiles {
        floor:        full(assets.floor),
        north_wall:   full(assets.north_wall),
        south_wall:   full(assets.south_wall),
        east_wall:    full(assets.east_wall),
        ne_corner:    full(assets.ne_corner),
        fill:         lunar_tiles().fill,
        floor_rotate: false,
    }
}

// ── Drawing ──────────────────────────────────────────────────────────────────

/// Paint the variant chosen by `(tile_x, tile_y)` from the pool at
/// screen position `(x, y)`, sized `size × size`, modulated by `tint`.
///
/// `rotate_random` adds a per-tile 0/90/180/270° rotation, picked
/// deterministically from `(tile_x, tile_y)` so the same tile keeps
/// the same orientation across frames. Only meaningful for square
/// sprite pieces — solid colours and non-square textures should
/// pass `false`. Use it on the floor pool to break up tiled
/// repetition; leave it off for walls (their slot art is
/// orientation-bearing).
pub fn draw_tile(
    variants: &TileVariants,
    tile_x: usize,
    tile_y: usize,
    x: f32,
    y: f32,
    size: f32,
    tint: Color,
    rotate_random: bool,
) {
    let piece = variants.pick(tile_x, tile_y);
    match piece {
        TilePiece::Color(c) => {
            let col = Color::new(c.r * tint.r, c.g * tint.g, c.b * tint.b, c.a * tint.a);
            draw_rectangle(x, y, size, size, col);
        }
        TilePiece::Sprite { texture, source, rotation, flip_x, flip_y } => {
            // Salted hash so the rotation pick stays independent of
            // the variant pick — same `(x, y)` produces well-mixed
            // bits for both, but the two streams don't correlate.
            let extra = if rotate_random {
                let h = salted_coord_hash(tile_x, tile_y, 0xA5A5A5A5_5A5A5A5A);
                (h % 4) as f32 * std::f32::consts::FRAC_PI_2
            } else {
                0.0
            };
            draw_texture_ex(texture, x, y, tint, DrawTextureParams {
                dest_size: Some(vec2(size, size)),
                source: Some(*source),
                rotation: *rotation + extra,
                flip_x: *flip_x,
                flip_y: *flip_y,
                ..Default::default()
            });
        }
    }
}

// ── Wall slot resolution ─────────────────────────────────────────────────────

/// Look at the 8-neighbourhood of this wall tile and pick the slot
/// whose name matches the pattern. `Fill` is reserved for walls that
/// have **no** floor neighbour in any of the 8 directions — i.e.
/// truly-interior walls that never show a boundary to a room.
///
/// Any wall that *does* touch floor is a boundary wall and resolves
/// to an edge or corner slot. Clean one-cardinal / adjacent-cardinal
/// patterns pick the obvious slot; T-junctions (three cardinal floors)
/// and crossroads don't have a dedicated slot yet, so they fall
/// through to the edge that faces whichever single floor cardinal is
/// present (solid-colour biomes don't care; textured biomes can break
/// these out later if they want).
pub fn pick_wall_slot(map: &Map, x: usize, y: usize) -> WallSlot {
    // "Floor" here means *any walkable tile* — hazards, fire pools,
    // and the control panel still count as the open side of a wall.
    // A wall doesn't change its silhouette because a molotov dropped
    // a FirePool overlay onto the floor next to it; we only want
    // `Tile::Wall` to read as a wall neighbour.
    let is_floor = |dx: i32, dy: i32| -> bool {
        let nx = x as i32 + dx;
        let ny = y as i32 + dy;
        map.in_bounds(nx, ny)
            && map.tile(nx as usize, ny as usize).is_walkable()
    };
    let n  = is_floor( 0, -1);
    let s  = is_floor( 0,  1);
    let e  = is_floor( 1,  0);
    let w  = is_floor(-1,  0);
    let ne = is_floor( 1, -1);
    let nw = is_floor(-1, -1);
    let se = is_floor( 1,  1);
    let sw = is_floor(-1,  1);

    // Exact single-cardinal edges.
    if n && !s && !e && !w { return WallSlot::EdgeN; }
    if s && !n && !e && !w { return WallSlot::EdgeS; }
    if e && !n && !s && !w { return WallSlot::EdgeE; }
    if w && !n && !s && !e { return WallSlot::EdgeW; }

    // Two-adjacent-cardinal *outer* corners — the wall juts into a
    // floor area (corridor entrance / branching wall). Visually
    // distinct from the inner-corner variants below: the rim has to
    // sit on the floor side, not the void side, so the slot enum
    // splits them.
    if n && e && !s && !w { return WallSlot::OuterCornerNE; }
    if n && w && !s && !e { return WallSlot::OuterCornerNW; }
    if s && e && !n && !w { return WallSlot::OuterCornerSE; }
    if s && w && !n && !e { return WallSlot::OuterCornerSW; }

    // No cardinal floor — check diagonals for jut-out corners.
    if !n && !s && !e && !w {
        if ne && !nw && !sw && !se { return WallSlot::CornerNE; }
        if nw && !ne && !sw && !se { return WallSlot::CornerNW; }
        if se && !nw && !ne && !sw { return WallSlot::CornerSE; }
        if sw && !nw && !ne && !se { return WallSlot::CornerSW; }
    }

    // **Opposite-cardinal pair** — wall sandwiched between two
    // rooms on opposite sides (the shared wall between the cryo
    // bay and its janitor closet, for instance). Treat it as an
    // axis-aligned separator and render the perpendicular edge so
    // the bevel runs along the divider's length, not into a
    // perpendicular door tile that may also be a floor neighbour.
    // Without this case, a wall above / below the closet door
    // would pick `EdgeN` / `EdgeS` (bevel pointing at the door)
    // instead of the vertical separator we want.
    if e && w { return WallSlot::EdgeE; }
    if n && s { return WallSlot::EdgeN; }

    // Complex patterns (T-junction, crossroad, etc.): this is still
    // a BOUNDARY wall (it touches floor somewhere), so never drop
    // it onto the `Fill` dark-interior slot. Pick an edge slot if
    // any cardinal is floor, else a corner slot if any diagonal is.
    if n { return WallSlot::EdgeN; }
    if s { return WallSlot::EdgeS; }
    if e { return WallSlot::EdgeE; }
    if w { return WallSlot::EdgeW; }
    if ne { return WallSlot::CornerNE; }
    if nw { return WallSlot::CornerNW; }
    if se { return WallSlot::CornerSE; }
    if sw { return WallSlot::CornerSW; }

    // Genuine interior wall — every neighbour is wall (or off-map).
    WallSlot::Fill
}
