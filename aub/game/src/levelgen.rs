//! Per-floor level generation.
//!
//! Pure functions: `(rng, num) → Level`. No game-loop state lives
//! here — the runtime in `main.rs` calls `generate_level` at every
//! floor boundary and treats the returned `Level` as fresh data.
//!
//! What sits where:
//! - `generate_level` — the standard 3×3 sector dungeon.
//! - `generate_boss_level` — the bigger floor 5 with a Station
//!   Master, minions, escape stairs, and a Control Panel tile.
//! - `place_hazards` — drops 1–3 hazard tiles per floor, with the
//!   palette widening at deeper levels.
//! - `roll_item` — random item kind, weighted by depth.
//! - `place_starter_gear` — floor-1 cryo-pod kit (jumpsuit + rifle)
//!   placed inside the spawn room.

use ::rand::{Rng, rngs::StdRng};

use crate::{Level, Monster, MAP_W, MAP_H};
use crate::creatures::CreatureKind;
use crate::dungeon::{self, Tile};
use crate::generator::{Generator, sector::SectorGenerator};
use crate::items::ItemKind;
use crate::props::{self, Prop, PropKind};
use crate::stock::{stock_rooms, RoomContents};

/// Roll a random item appropriate to this dungeon level. Now that
/// the legacy utility salvage (CircuitBoard / RadiationDetector /
/// PlasmaCore / HazmatFragment / Crayons) has been retired, the
/// non-storage-crate floor drops are the consumables and a thin
/// chance at a crafting component. Deeper floors lean harder on
/// the medkit so the difficulty curve doesn't outrun healing.
pub(crate) fn roll_item(level: u8, rng: &mut StdRng) -> ItemKind {
    let roll = rng.gen_range(1..=100);
    match level {
        1 => {
            if roll <= 60 { ItemKind::RationCube }
            else { ItemKind::MedKit }
        }
        2 => {
            if roll <= 40 { ItemKind::MedKit }
            else { ItemKind::RationCube }
        }
        _ => {
            if roll <= 60 { ItemKind::MedKit }
            else { ItemKind::RationCube }
        }
    }
}

/// Roll 2-3 random items appropriate to this dungeon level. Used by
/// the cryo-bay's secondary gear locker so the contents vary between
/// runs without the level designer having to author them by hand.
pub(crate) fn random_gear(level: u8, rng: &mut StdRng) -> Vec<ItemKind> {
    let count = rng.gen_range(2..=3);
    (0..count).map(|_| roll_item(level, rng)).collect()
}

/// Drop `count` instances of `kind` into the room. The first
/// always lands at the room centre (so the encounter has a clear
/// "anchor"); the rest spiral out into adjacent walkable interior
/// tiles. Skips the player's spawn tile and any tile we've already
/// claimed for a packmate. Stops early if the room runs out of room.
fn place_pack(
    map: &dungeon::Map,
    room: &dungeon::Room,
    kind: CreatureKind,
    count: usize,
    spawn: (usize, usize),
    level_num: u8,
    rng: &mut StdRng,
) -> Vec<Monster> {
    if count == 0 { return Vec::new(); }
    let (cx, cy) = room.center();
    // Build a candidate list of every walkable interior tile,
    // sorted by Chebyshev distance from the centre so the pack
    // clusters around its anchor. Shuffle within each ring so
    // packs don't form perfect rings on every spawn.
    let mut candidates: Vec<(usize, usize)> = Vec::new();
    for ry in room.y..room.y + room.height {
        for rx in room.x..room.x + room.width {
            if (rx, ry) == spawn { continue; }
            if !map.tile(rx, ry).is_walkable() { continue; }
            candidates.push((rx, ry));
        }
    }
    candidates.sort_by_key(|&(x, y)| {
        let dx = (x as i32 - cx as i32).abs();
        let dy = (y as i32 - cy as i32).abs();
        dx.max(dy)
    });
    // Light shuffle within the same-distance bands so identical
    // pack sizes don't always collapse to the same shape.
    use ::rand::seq::SliceRandom;
    candidates.shuffle(rng);
    candidates.sort_by_key(|&(x, y)| {
        let dx = (x as i32 - cx as i32).abs();
        let dy = (y as i32 - cy as i32).abs();
        dx.max(dy)
    });
    let mut out: Vec<Monster> = Vec::with_capacity(count);
    for (rx, ry) in candidates {
        if out.len() >= count { break; }
        if out.iter().any(|m| (m.x, m.y) == (rx, ry)) { continue; }
        out.push(Monster::new(kind, rx, ry, level_num));
    }
    out
}

/// Generate a fresh level: map, stocking, monster placement, items,
/// spawn, and stairs. Stairs land in the room furthest through the
/// room list that isn't the spawn and isn't a monster room; falls
/// back to any non-spawn room if needed.
///
/// Special handling for level 5 (boss level): uses larger map,
/// spawns Station Master in central room, and places Control Panel.
pub(crate) fn generate_level(rng: &mut StdRng, num: u8) -> Level {
    if num == 5 {
        return generate_boss_level(rng);
    }
    let mut map = SectorGenerator::default().generate(MAP_W, MAP_H, rng);
    let contents = stock_rooms(map.rooms.len(), num, rng);
    // Provisional spawn — used to pick which room the cryo bay
    // lives in on level 1, and as the fallback spawn elsewhere.
    let provisional_spawn = map.entrance
        .or_else(|| map.rooms.first().map(|r| r.center()))
        .unwrap_or((1, 1));

    // Floor-1 cryo bay: place the cryo tube + supply locker first,
    // because we want the survivor to spawn standing **directly
    // beneath the cryo tube** (one tile south of the tube anchor).
    // That's only knowable once the tube is placed; we then pin
    // the spawn there and the rest of generation flows from it.
    let mut props: Vec<Prop> = Vec::new();
    // Position of the janitor-closet door, recorded during cryo-bay
    // setup so we can override its kind after `detect_doors` (which
    // defaults every entry to Bulkhead) runs.
    let mut janitor_door_pos: Option<(usize, usize)> = None;
    let spawn = if num == 1 {
        if let Some(cryo_pos) = cryo_tube_anchor(&map, provisional_spawn) {
            props.push(Prop::new(PropKind::CryoTube, cryo_pos));

            // Helper: is `(x, y)` a free north-wall anchor (walkable
            // floor with a wall directly above and no prop already
            // claiming it)? Used by every additional cryo-bay prop
            // we drop along the same wall.
            let north_wall_free = |x: usize, y: usize, props: &[Prop]| -> bool {
                map.tile(x, y).is_walkable()
                    && y > 0
                    && map.tile(x, y - 1) == Tile::Wall
                    && !props.iter().any(|p| p.pos == (x, y))
            };

            // Empty cryo's matching supply locker — one tile west,
            // sharing the north-wall overlay.
            if cryo_pos.0 > 0 {
                let locker_pos = (cryo_pos.0 - 1, cryo_pos.1);
                if north_wall_free(locker_pos.0, locker_pos.1, &props) {
                    props.push(Prop::with_contents(
                        PropKind::LockerUnlocked,
                        locker_pos,
                        props::starter_locker_contents(),
                    ));
                }
            }

            // Second cryo bay: an *occupied* tube two tiles east of
            // the empty one (one-tile gap so the player can walk
            // between them), with its own gear locker one tile west
            // of it. Sequence west→east along the wall ends up:
            //   [empty_locker] [empty_cryo] _ [gear_locker] [occupied_cryo]
            // Skip silently if the room isn't wide enough.
            let occupied_pos = (cryo_pos.0 + 3, cryo_pos.1);
            let gear_locker_pos = (cryo_pos.0 + 2, cryo_pos.1);
            if north_wall_free(gear_locker_pos.0, gear_locker_pos.1, &props)
                && north_wall_free(occupied_pos.0, occupied_pos.1, &props)
            {
                props.push(Prop::with_contents(
                    PropKind::LockerUnlocked,
                    gear_locker_pos,
                    random_gear(num, rng),
                ));
                props.push(Prop::new(PropKind::CryoTubeOccupied, occupied_pos));
            }

            // Janitor closet — a 4x4 service room west of the cryo
            // bay, with a single janitor-door entrance level with
            // the player's spawn row. Stocked with a locker full of
            // crafting components. Skipped silently if the area
            // west of the bay isn't all wall (e.g. another room
            // already lives there, or the bay is too close to the
            // map edge).
            let cryo_room_dims = map.rooms.iter()
                .find(|r| r.contains(cryo_pos.0, cryo_pos.1))
                .map(|r| (r.x, r.y, r.width, r.height));
            if let Some((rx, _ry, _rw, _rh)) = cryo_room_dims {
                let cw: usize = 4;
                let ch: usize = 4;
                let spawn_y = cryo_pos.1 + 1;
                if rx >= cw + 1 {
                    let cx0 = rx - cw - 1;        // closet west column
                    let cx1 = rx - 1;             // exclusive — last col is rx - 2
                    // Vertical: closet's top row aligns with the
                    // cryo bay's top row (`cryo_pos.1`) so the
                    // closet sits directly alongside the cryo bay,
                    // sharing its north / south wall lines as far
                    // as possible.
                    let cy0 = cryo_pos.1;
                    let cy1 = cy0 + ch;
                    let door_pos = (rx - 1, spawn_y);
                    // Verify every closet cell + the door cell is
                    // currently Wall and not part of another room.
                    let mut viable = cy1 < map.height
                        && spawn_y >= cy0 && spawn_y < cy1;
                    for y in cy0..cy1 {
                        if !viable { break; }
                        for x in cx0..cx1 {
                            if map.tile(x, y) != Tile::Wall {
                                viable = false; break;
                            }
                            if map.rooms.iter().any(|r| r.contains(x, y)) {
                                viable = false; break;
                            }
                        }
                    }
                    if viable && map.tile(door_pos.0, door_pos.1) != Tile::Wall {
                        viable = false;
                    }
                    if viable {
                        for y in cy0..cy1 {
                            for x in cx0..cx1 {
                                map.dig(x, y);
                            }
                        }
                        map.dig(door_pos.0, door_pos.1);
                        janitor_door_pos = Some(door_pos);
                        // Locker against the closet's north wall,
                        // centred horizontally. Same anchor + sprite
                        // as the cryo-bay locker; contents are the
                        // full crafting-component panoply.
                        let locker_pos = (cx0 + cw / 2, cy0);
                        let locker_viable = locker_pos.1 > 0
                            && map.tile(locker_pos.0, locker_pos.1).is_walkable()
                            && map.tile(locker_pos.0, locker_pos.1 - 1) == Tile::Wall
                            && !props.iter().any(|p| p.pos == locker_pos);
                        if locker_viable {
                            props.push(Prop::with_contents(
                                PropKind::LockerUnlocked,
                                locker_pos,
                                props::janitor_locker_contents(),
                            ));
                        }
                        // Deactivated custodibot — slumped one tile
                        // east of the locker against the north wall.
                        // Skip if the spot's already in use (storage
                        // crate, door tile, locker overlap) or sits
                        // on the closet's entrance row, which is
                        // the only path in.
                        let bot_pos = (locker_pos.0 + 1, cy0);
                        let bot_viable = bot_pos.0 < cx1
                            && map.in_bounds(bot_pos.0 as i32, bot_pos.1 as i32)
                            && map.tile(bot_pos.0, bot_pos.1).is_walkable()
                            && bot_pos != door_pos
                            && !props.iter().any(|p| p.pos == bot_pos);
                        if bot_viable {
                            props.push(Prop::new(
                                PropKind::CustodibotDeactivated,
                                bot_pos,
                            ));
                        }
                    }
                }
            }

            // Spawn = tile south of the cryo tube — the player
            // "steps out" of the pod. Verify it's walkable and
            // not blocked by a prop; fall back to the provisional
            // spawn otherwise.
            let beneath = (cryo_pos.0, cryo_pos.1 + 1);
            if map.in_bounds(beneath.0 as i32, beneath.1 as i32)
                && map.tile(beneath.0, beneath.1).is_walkable()
                && !props.iter().any(|p| p.pos == beneath)
            {
                beneath
            } else {
                provisional_spawn
            }
        } else {
            provisional_spawn
        }
    } else {
        provisional_spawn
    };

    // Each "monster" room rolls a creature kind and a pack count
    // from the kind's template. Solo creatures spawn one at the
    // room centre; pack creatures (gruboids: 1d6) scatter across
    // the room's interior. Spawn tile is excluded so the player
    // doesn't wake up on top of a pack.
    let monsters: Vec<Monster> = contents.iter().enumerate()
        .flat_map(|(i, c)| {
            if !matches!(c, RoomContents::Monster { .. }) { return Vec::new(); }
            let room = &map.rooms[i];
            let (cx, cy) = room.center();
            if (cx, cy) == spawn { return Vec::new(); }
            let kind = CreatureKind::roll_at_level(num, rng);
            let (pmin, pmax) = kind.template().pack_size;
            let pmin = pmin.max(1);
            let pmax = pmax.max(pmin);
            let count = rng.gen_range(pmin..=pmax) as usize;
            place_pack(&map, room, kind, count, spawn, num, rng)
        })
        .collect();

    // Place items in empty rooms (and loot rooms via treasure locations).
    let mut items: Vec<(ItemKind, usize, usize)> = contents.iter().enumerate()
        .filter_map(|(i, c)| {
            if !matches!(c, RoomContents::Empty { .. }) { return None; }
            let (x, y) = map.rooms[i].center();
            if (x, y) == spawn { return None; }
            let item = roll_item(num, rng);
            Some((item, x, y))
        })
        .collect();
    // Ensure at least one item exists; place in fallback room if needed.
    if items.is_empty() {
        let fallback = contents.iter().enumerate()
            .find(|(i, c)| !matches!(c, RoomContents::Monster { .. })
                        && map.rooms[*i].center() != spawn)
            .map(|(i, _)| map.rooms[i].center())
            .or_else(|| map.rooms.iter().map(|r| r.center())
                .find(|&c| c != spawn));
        if let Some((x, y)) = fallback {
            items.push((roll_item(num, rng), x, y));
        }
    }
    // Items can't share a tile with a prop's anchor (the tile is
    // blocked / hidden under the prop sprite).
    items.retain(|&(_, ix, iy)| !props.iter().any(|p| p.pos == (ix, iy)));

    let mut doors = detect_doors(&map);
    // Tag the janitor closet's entrance — `detect_doors` defaults
    // every detected door to Bulkhead, so we override per-position
    // here. Future bespoke door placements should follow the same
    // pattern.
    if let Some(jpos) = janitor_door_pos {
        if let Some(d) = doors.iter_mut().find(|d| d.pos == jpos) {
            d.kind = dungeon::DoorKind::Janitor;
        }
    }

    // Zone-transition doors. The ship is conceptually a rotating
    // drum, so each level has spinward / anti-spinward neighbours
    // reached by walking through a door on the east / west edge of
    // the map. Both doors are guaranteed to exist on every floor
    // (the carver is infallible: it always returns a tile, even if
    // the corridor collapses to a single cell inside the source
    // room). The eastern door is unlocked and acts as the level-
    // descent tile; the western door is locked until the player
    // finds a matching access keycard.
    let east_zone = carve_zone_door(&mut map, ZoneSide::East);
    let west_zone = carve_zone_door(&mut map, ZoneSide::West);
    doors.push(dungeon::Door {
        pos: east_zone,
        // Room sits west of the door; the canonical sprite is a
        // north-wall door (room south), so a west-pointing
        // `room_dir` rotates 90deg.
        room_dir: dungeon::Dir::W,
        kind: dungeon::DoorKind::Zone,
        open: false,
        locked: false,
    });
    doors.push(dungeon::Door {
        pos: west_zone,
        room_dir: dungeon::Dir::E,
        kind: dungeon::DoorKind::Zone,
        open: false,
        // Only the very first zone's anti-spinward door is sealed
        // (the player has nowhere to go back *to* yet). Every
        // deeper zone's west door is unlocked, since the player
        // arrived through it from the previous zone.
        locked: num == 1,
    });

    // Storage crates: rolled after the full doors list (corridor +
    // janitor + zone) is in place so the doorway-blocking guard
    // can see every door. Each room gets a chance to spawn one
    // crate on a random interior floor tile - never on the spawn
    // tile, never on an existing prop or item drop, and never on
    // a door tile or the cardinal cell next to one. The spawn
    // room (level 1's cryo bay) is excluded so the opening beat
    // stays handcrafted.
    const STORAGE_CRATE_CHANCE: f64 = 0.6;
    for room in map.rooms.iter() {
        if room.contains(spawn.0, spawn.1) { continue; }
        if !rng.gen_bool(STORAGE_CRATE_CHANCE) { continue; }
        for _ in 0..8 {
            let cx = room.x + rng.gen_range(0..room.width);
            let cy = room.y + rng.gen_range(0..room.height);
            if (cx, cy) == spawn { continue; }
            if !map.tile(cx, cy).is_walkable() { continue; }
            if props.iter().any(|p| p.pos == (cx, cy)) { continue; }
            if items.iter().any(|&(_, ix, iy)| (ix, iy) == (cx, cy)) { continue; }
            // Centralised guard: same rule any future impassable
            // prop placement should use. Storage crates are
            // passable, but we still skip these tiles so the
            // sprite doesn't paint over a doorway.
            if props::blocks_doorway((cx, cy), &doors) { continue; }
            props.push(Prop::with_contents(
                PropKind::StorageCrate,
                (cx, cy),
                props::storage_crate_contents(rng),
            ));
            break;
        }
    }

    // Stairs down is the eastern zone door tile — stepping onto it
    // descends to the next floor.
    let stairs_down = east_zone;

    Level {
        map, monsters, items, props, doors, stairs_down,
        west_zone_door: Some(west_zone),
        spawn, num,
        expiring_hazards: Vec::new(),
    }
}

/// Which edge of the map a zone door is carved against. Drives the
/// target column and the side of the source room we tunnel from.
#[derive(Clone, Copy)]
enum ZoneSide { East, West }

/// Tunnel from the easternmost / westernmost room out to the map
/// edge and return the door tile (one in from the boundary wall).
/// On success the tunnel cells are dug as floor and the final
/// door cell is left walkable; the caller stamps a `Door` on top.
/// Returns `None` when the map has no rooms or carving the
/// straight-line corridor would clip something we don't want to
/// break — in that case the level falls back to the legacy
/// room-centre stairs.
fn carve_zone_door(map: &mut dungeon::Map, side: ZoneSide) -> (usize, usize) {
    // Target column: one tile in from the boundary wall so the
    // door always has the boundary as its "outside" face.
    let target_x = match side {
        ZoneSide::East => map.width - 2,
        ZoneSide::West => 1,
    };
    // Pick the room nearest the target edge as the corridor source.
    // `max_by_key` over `r.x + r.width` is the easternmost-right-edge
    // room — by definition, no room sits east of it, so the corridor
    // we carve toward the boundary can't punch into another room.
    // The mirrored selector handles the western edge.
    let room = match side {
        ZoneSide::East => map.rooms.iter()
            .max_by_key(|r| r.x + r.width)
            .expect("level-gen invariant: at least one room exists per zone"),
        ZoneSide::West => map.rooms.iter()
            .min_by_key(|r| r.x)
            .expect("level-gen invariant: at least one room exists per zone"),
    };
    let door_y = room.y + room.height / 2;
    // Build the inclusive [start, end] x-range to dig. When the
    // source room already overlaps the target column (a room butted
    // up against the boundary), the range collapses to just the
    // door tile — already Floor inside the room — and `dig` is a
    // no-op. Either way the door tile ends up walkable.
    let (carve_start, carve_end) = match side {
        ZoneSide::East => {
            let wall_x = room.x + room.width;
            (wall_x.min(target_x), target_x)
        }
        ZoneSide::West => {
            // `room.x` is the room's interior west edge; the wall
            // sits at `room.x - 1`. Saturate to keep us in-bounds
            // for tiny rooms hugging the western edge.
            let wall_x = room.x.saturating_sub(1);
            (target_x, wall_x.max(target_x))
        }
    };
    for x in carve_start..=carve_end {
        map.dig(x, door_y);
    }
    (target_x, door_y)
}

/// Scan every Floor tile and pick out the corridor cells that abut a
/// room — those are the doors. A door tile is one that:
///
/// 1. Is itself **outside** every room rectangle (so it's a corridor
///    cell, not a room interior).
/// 2. Has exactly one cardinal neighbour that **is** inside a room.
///
/// The orientation is the cardinal direction toward that room
/// neighbour — the renderer rotates the sprite from `Dir::S` (the
/// canonical "north wall door") accordingly.
///
/// Diagonal corridor turns and irregular geometry can leave a single
/// corridor tile bordering two rooms at once; we keep the *first*
/// match we find. Same-tile dupes are filtered by position. Good
/// enough for the placement test the user asked for; can be tuned
/// later (e.g. require corridor-side neighbour, snap to canonical
/// "first cell on entry") once gameplay leans on doors.
fn detect_doors(map: &dungeon::Map) -> Vec<dungeon::Door> {
    use dungeon::Dir;
    let cardinals = [Dir::N, Dir::E, Dir::S, Dir::W];
    let mut out: Vec<dungeon::Door> = Vec::new();
    for y in 0..map.height {
        for x in 0..map.width {
            if !map.tile(x, y).is_walkable() { continue; }
            // Skip cells inside any room rectangle.
            if map.rooms.iter().any(|r| r.contains(x, y)) { continue; }
            // First cardinal neighbour that lands inside a room
            // wins — single door tile per corridor cell.
            let room_dir = cardinals.iter().copied().find(|&d| {
                let (dx, dy) = d.delta();
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if !map.in_bounds(nx, ny) { return false; }
                let (nxu, nyu) = (nx as usize, ny as usize);
                map.rooms.iter().any(|r| r.contains(nxu, nyu))
            });
            if let Some(room_dir) = room_dir {
                // A real door is a corridor cell wedged in a wall:
                // the two cardinals perpendicular to `room_dir`
                // must both be walls. Without this, a corridor
                // running parallel to a room edge ends up with
                // every cell flagged as a door.
                let perp = perpendicular_cardinals(room_dir);
                let framed = perp.iter().all(|&d| {
                    let (dx, dy) = d.delta();
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    !map.in_bounds(nx, ny)
                        || map.tile(nx as usize, ny as usize) == Tile::Wall
                });
                if !framed { continue; }
                out.push(dungeon::Door {
                    pos: (x, y),
                    room_dir,
                    // Auto-detected doors default to the standard
                    // corridor bulkhead. Per-door kind overrides
                    // (e.g. the janitor closet entrance) are
                    // applied by the level-gen caller after this.
                    kind: dungeon::DoorKind::Bulkhead,
                    open: false,
                    locked: false,
                });
            }
        }
    }
    out
}

fn perpendicular_cardinals(dir: dungeon::Dir) -> [dungeon::Dir; 2] {
    use dungeon::Dir;
    match dir {
        Dir::N | Dir::S => [Dir::E, Dir::W],
        Dir::E | Dir::W => [Dir::N, Dir::S],
        _ => [Dir::N, Dir::S],
    }
}

/// Pick the anchor tile for the floor-1 cryo tube. We want a floor
/// tile inside the spawn room with a wall directly north of it, so
/// the tube's top half draws over the wall and the survivor "steps
/// out" of it onto the spawn tile. Tries the room containing the
/// spawn first (typical case); if the spawn lives on a corridor /
/// border tile, falls back to the first room. Returns `None` only
/// if no room has a viable top-row floor cell.
fn cryo_tube_anchor(
    map: &dungeon::Map,
    spawn: (usize, usize),
) -> Option<(usize, usize)> {
    let containing = map.rooms.iter().find(|r| {
        spawn.0 >= r.x && spawn.0 < r.x + r.width
            && spawn.1 >= r.y && spawn.1 < r.y + r.height
    });
    let candidates: [Option<&dungeon::Room>; 2] =
        [containing, map.rooms.first()];
    for room_opt in candidates {
        let Some(room) = room_opt else { continue };
        if let Some(pos) = anchor_in_room(map, room, spawn) {
            return Some(pos);
        }
    }
    None
}

/// Scan a room's top row outward from horizontal center for a floor
/// tile with a wall directly above it. Skips the spawn tile so the
/// tube never lands on top of the player.
fn anchor_in_room(
    map: &dungeon::Map,
    room: &dungeon::Room,
    spawn: (usize, usize),
) -> Option<(usize, usize)> {
    let top_y = room.y;
    if top_y == 0 { return None; }
    let cx = room.x + room.width / 2;
    let mut xs: Vec<usize> = (room.x..room.x + room.width).collect();
    xs.sort_by_key(|&x| (x as i32 - cx as i32).abs());
    for x in xs {
        if (x, top_y) == spawn { continue; }
        if !map.tile(x, top_y).is_walkable() { continue; }
        if map.tile(x, top_y - 1) != Tile::Wall { continue; }
        return Some((x, top_y));
    }
    None
}

/// Generate the boss level (Level 5): larger map with Station Master
/// and Control Panel.
fn generate_boss_level(rng: &mut StdRng) -> Level {
    let mut map = SectorGenerator::default().generate(80, 50, rng);
    let spawn = map.entrance
        .or_else(|| map.rooms.first().map(|r| r.center()))
        .unwrap_or((40, 25));

    // Spawn Station Master in the center-ish room
    let boss_room_idx = map.rooms.len() / 2;
    let boss_pos = if boss_room_idx < map.rooms.len() {
        map.rooms[boss_room_idx].center()
    } else {
        (40, 25)
    };

    let boss = Monster::new(
        CreatureKind::StationMaster,
        boss_pos.0, boss_pos.1, 5,
    );

    // Spawn 1d2 mutated-human attendants around the boss
    let mut monsters = vec![boss];
    let minion_count = rng.gen_range(1..=2);
    for _ in 0..minion_count {
        let offset_x: i32 = rng.gen_range(-2..=2);
        let offset_y: i32 = rng.gen_range(-2..=2);
        let mx = (boss_pos.0 as i32 + offset_x).max(1).min(79) as usize;
        let my = (boss_pos.1 as i32 + offset_y).max(1).min(49) as usize;
        if map.tile(mx, my).is_walkable() {
            monsters.push(Monster::new(
                CreatureKind::MutantHuman, mx, my, 5,
            ));
        }
    }

    // Place loot and a few healing items near the boss
    let mut items = vec![];
    for _ in 0..3 {
        let loot_offset_x: i32 = rng.gen_range(-4..=4);
        let loot_offset_y: i32 = rng.gen_range(-4..=4);
        let ix = (boss_pos.0 as i32 + loot_offset_x).max(1).min(79) as usize;
        let iy = (boss_pos.1 as i32 + loot_offset_y).max(1).min(49) as usize;
        if map.tile(ix, iy).is_walkable() && (ix, iy) != boss_pos {
            let item = if rng.gen_bool(0.5) {
                ItemKind::MedKit
            } else {
                ItemKind::RationCube
            };
            items.push((item, ix, iy));
        }
    }

    // Stairs down is far away in a safe room (player needs to escape
    // after boss).
    let stairs_down = map.rooms.iter()
        .enumerate()
        .rev()
        .find(|(i, r)| r.center() != spawn && *i != boss_room_idx)
        .map(|(_, r)| r.center())
        .unwrap_or((40, 40));

    // Place Control Panel near the boss (victory condition tile).
    let panel_x = (boss_pos.0 as i32 + 3).max(1).min(79) as usize;
    let panel_y = boss_pos.1;
    if map.tile(panel_x, panel_y).is_walkable() {
        map.set_tile(panel_x, panel_y, Tile::ControlPanel);
    }

    let mut doors = detect_doors(&map);

    // Boss floor still gets zone doors so the player can retreat
    // anti-spinward to floor 4 if a fight goes south. The eastern
    // door isn't a level transition (the run terminates at the
    // Control Panel), but we keep it for visual consistency. The
    // unused `_east_zone` is a deliberate signal that the door
    // exists in the world but doesn't drive a transition.
    let _east_zone = carve_zone_door(&mut map, ZoneSide::East);
    let west_zone = carve_zone_door(&mut map, ZoneSide::West);
    doors.push(dungeon::Door {
        pos: _east_zone,
        room_dir: dungeon::Dir::W,
        kind: dungeon::DoorKind::Zone,
        open: false,
        // Locked: the boss floor is the bottom of the spinward
        // ring; there's nothing east of it to walk into.
        locked: true,
    });
    doors.push(dungeon::Door {
        pos: west_zone,
        room_dir: dungeon::Dir::E,
        kind: dungeon::DoorKind::Zone,
        open: false,
        locked: false,
    });

    Level {
        map,
        monsters,
        items,
        props: Vec::new(),
        doors,
        stairs_down,
        west_zone_door: Some(west_zone),
        spawn,
        num: 5,
        expiring_hazards: Vec::new(),
    }
}

/// Place environmental hazards randomly in the level.
/// - Levels 1-2: 1-2 hazards (radiation or electrical)
/// - Levels 3-4: 2-3 hazards (all types)
/// - Level 5: 2-3 hazards clustered near boss
///
/// **Currently disabled** — the simple "step on tile, take damage"
/// hazard model isn't satisfying yet, and we want to revisit it
/// (probably as something more deliberate / telegraphed) before it
/// goes back into the rotation. The early-return below short-circuits
/// every per-floor placement; restoring hazards is a one-line edit.
/// The per-level counts and tile-type tables are left in place so
/// the next iteration can lean on them once the redesign lands.
pub(crate) fn place_hazards(level: &mut Level, rng: &mut StdRng) {
    // Hazards globally disabled. Drop this `return` (or gate it
    // behind a feature flag / config) to bring them back.
    let _ = (level, rng);
    return;
    #[allow(unreachable_code)]
    let hazard_count = match level.num {
        1..=2 => rng.gen_range(1..=2),
        3..=4 => rng.gen_range(2..=3),
        _ => rng.gen_range(2..=3),
    };

    for _ in 0..hazard_count {
        // Pick a random floor tile that's not spawn or stairs.
        let mut attempts = 0;
        while attempts < 20 {
            let x = rng.gen_range(1..level.map.width - 1);
            let y = rng.gen_range(1..level.map.height - 1);
            if (x, y) == level.spawn || (x, y) == level.stairs_down {
                attempts += 1;
                continue;
            }
            if level.map.tile(x, y) != Tile::Floor {
                attempts += 1;
                continue;
            }
            let hazard = match level.num {
                1 => if rng.gen_bool(0.5) { Tile::RadiationZone } else { Tile::ElectricalHazard },
                2 => match rng.gen_range(0..3) {
                    0 => Tile::RadiationZone,
                    1 => Tile::ElectricalHazard,
                    _ => Tile::AcidPool,
                },
                _ => match rng.gen_range(0..4) {
                    0 => Tile::RadiationZone,
                    1 => Tile::ElectricalHazard,
                    2 => Tile::AcidPool,
                    _ => Tile::CollapseHazard,
                },
            };
            level.map.set_tile(x, y, hazard);
            break;
        }
    }
}
