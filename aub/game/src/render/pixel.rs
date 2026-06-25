//! 32×32 tile sprites themed as a ruined, overgrown colony ship
//! (Metamorphosis Alpha / Pandorum). Floor is uniform deck plating; walls
//! come in two variants so long bulkhead runs don't look obviously stamped.
//! All textures use nearest-neighbour filtering so they stay crisp when the
//! window is resized.

use macroquad::prelude::*;
use crate::creatures::{AnimationSet, CreatureKind};
use crate::dungeon::{Map, Tile};
use crate::hazards;
use crate::tileset::{self, Biome, Tileset};

/// Native sprite raster size and initial tile size. The renderer accepts any
/// `tile` at draw time, so this value only sets the window's default size
/// and the resolution at which the sprites are rasterised internally.
pub const TILE_SIZE: f32 = 32.0;
const SPRITE_PX: u16 = 32;

// ── Palette ──────────────────────────────────────────────────────────────────
const DECK_BASE:   (u8, u8, u8) = (55,  65,  80);
const DECK_SEAM:   (u8, u8, u8) = (38,  46,  58);
const DECK_RIVET:  (u8, u8, u8) = (22,  28,  40);
const RUST:        (u8, u8, u8) = (130, 70,  38);
const RUST_DARK:   (u8, u8, u8) = (95,  50,  28);
const WALL_BASE:   (u8, u8, u8) = (45,  52,  65);
const WALL_DARK:   (u8, u8, u8) = (28,  34,  45);
const WALL_HI:     (u8, u8, u8) = (72,  82,  98);
const HULL_VOID:   (u8, u8, u8) = (8,   10,  18);
const HULL_FAINT:  (u8, u8, u8) = (16,  20,  30);
const EMERGENCY:   (u8, u8, u8) = (215, 155, 45);
const EMERGENCY_D: (u8, u8, u8) = (140, 95,  25);
const WARN:        (u8, u8, u8) = (180, 45,  45);

/// Per-animation frame layout. Each player sheet now carries its own
/// frame size + count + playback rate so different sources can
/// coexist without forcing every sheet onto a single grid.
pub struct PlayerSheet {
    pub texture:     Texture2D,
    /// Same source with every opaque pixel forced to white. Used as
    /// the hurt-flash overlay — same trick the creature renderer
    /// uses with `frames_white`.
    pub texture_white: Texture2D,
    pub frame_w:     f32,
    pub frame_h:     f32,
    pub frame_count: usize,
    pub fps:         f64,
    /// True when the source art faces *right* in its native pose.
    /// The renderer flips when the player's facing direction differs
    /// from this. New original art faces left (`false`); the legacy
    /// Scifi Character sheets face right (`true`).
    pub faces_right: bool,
}

/// How long the player's white hurt-flash holds before fading out.
/// Used outside the renderer too — main loops on `hurt_progress`
/// against this and clears the flash once it elapses.
pub const HURT_DURATION: f64 = 0.25;

// Weapon overlay constants for the old rotating-rifle render are
// gone — the gun now lives on the `hands_gun` paper-doll layer and
// the muzzle flash anchors directly to that sprite's barrel pixel.

pub struct PlayerSprites {
    pub idle:    PlayerSheet,
    pub run:     PlayerSheet,
    /// Paper-doll layers, one per equipment slot. Each is drawn at
    /// the same screen position and size as the base sprite, so
    /// they composite into a layered character. Add more fields
    /// here as new slots come online; the renderer reads them by
    /// name matched to the player's `equipped_*` state.
    ///
    /// Body-slot art stacks: `body_jumpsuit` is the Clothing layer
    /// (base garment); `body_chest_plate` is the Body layer (over
    /// clothing). Both can render simultaneously — chest plate on
    /// top of jumpsuit, just like equipping order.
    pub body_jumpsuit:    PlayerSheet,
    pub body_chest_plate: PlayerSheet,
    /// Right-hand paper dolls — only one fires per frame, picked
    /// from the equipped weapon's `WeaponKind` in `draw_dungeon`.
    pub hands_gun:     PlayerSheet,
    pub hands_wrench:  PlayerSheet,
    /// Left-hand paper doll for the hand lamp. Drawn whenever the
    /// `LeftHand` slot holds an `ItemKind::HandLamp`.
    pub hands_lamp:    PlayerSheet,
}

pub struct ItemSprites {
    /// Standalone item textures, keyed by their `ItemSprite::File`
    /// path. Built once at startup by scanning every `ItemKind::ALL`
    /// for File-sprited templates; the renderer looks up by path
    /// at draw time. New file-sprited items just declare their
    /// path on the template — no per-item plumbing needed here.
    pub files: std::collections::HashMap<&'static str, Texture2D>,
}

/// Standalone prop textures, keyed by `PropTemplate::sprite` path.
/// Same pattern as `ItemSprites::files`: pre-loaded once by walking
/// `PropKind::ALL` so the renderer's draw call is a HashMap lookup
/// instead of an async load. Adding a new prop is data-only — the
/// loader picks up its sprite path automatically.
pub struct PropSprites {
    pub files: std::collections::HashMap<&'static str, Texture2D>,
}

/// One biome's five canonical PNGs, kept in memory so a per-floor
/// biome swap rebuilds the active `Tileset` without touching disk.
/// Each variant of `tileset::Biome` has a matching field on
/// `BiomeTextures`; adding a biome is "drop the assets, add a
/// `<Name>Textures` struct + a field here, load it in `Sprites::build`".
pub struct ShipTextures {
    pub floor:      Texture2D,
    pub north_wall: Texture2D,
    pub south_wall: Texture2D,
    pub east_wall:  Texture2D,
    pub ne_corner:  Texture2D,
}

impl ShipTextures {
    pub async fn load() -> Self {
        let load = |path: &'static str| async move {
            load_texture_or_standin(path).await
        };
        Self {
            floor:      load("assets/biomes/floor_tile_dark.png").await,
            north_wall: load("assets/biomes/north_wall.png").await,
            south_wall: load("assets/biomes/south_wall.png").await,
            east_wall:  load("assets/biomes/east_wall.png").await,
            ne_corner:  load("assets/biomes/northeast_wall.png").await,
        }
    }

    /// Borrow the textures into the shape the tileset factory
    /// expects. Cheap — every field is a `&Texture2D`.
    pub fn assets(&self) -> tileset::BiomeAssets<'_> {
        tileset::BiomeAssets {
            floor:      &self.floor,
            north_wall: &self.north_wall,
            south_wall: &self.south_wall,
            east_wall:  &self.east_wall,
            ne_corner:  &self.ne_corner,
        }
    }
}

pub struct BiomeTextures {
    pub ship: ShipTextures,
}

pub struct Sprites {
    /// Atlas texture we sample item, monster, and HP-bar art from. No
    /// longer sampled for floor / wall tiles — those come from the
    /// `Tileset` below.
    pub atlas:          Texture2D,
    /// Same atlas with every opaque pixel's RGB forced to white. Sampled
    /// from the same source rects as `atlas` to paint a hit-flash silhouette.
    pub atlas_white:    Texture2D,
    /// Loaded biome textures, keyed by biome. Owns the canonical 5
    /// PNGs for each biome (floor + N/S/E walls + NE corner) so a
    /// per-floor biome swap can rebuild the active `Tileset` without
    /// reloading any image off disk.
    pub biomes:         BiomeTextures,
    /// Active dungeon biome. Owns floor / fill / wall-slot variants.
    /// Rebuild via `tileset::Tileset::for_biome(biome, &assets)` to
    /// swap biomes at run time (e.g. on descent).
    pub tileset:        Tileset,
    /// F14 is a 2×2 grid of 8×8 quarters. The top row holds the empty
    /// (unlit) bar halves; the bottom row holds the full (red) halves.
    /// Within each row the left quarter is the rounded cap and the right
    /// quarter is the inner fill. The UI composes a 4-section bar by
    /// tiling these and flipping the cap for the right end.
    pub health_bar_full_cap:   Rect,
    pub health_bar_full_fill:  Rect,
    pub health_bar_empty_cap:  Rect,
    pub health_bar_empty_fill: Rect,
    pub entrance:       Texture2D,
    pub player:         PlayerSprites,
    pub items:          ItemSprites,
    /// Stationary prop textures (cryo tube, locker, terminal, …).
    /// Pre-loaded once at startup by walking `PropKind::ALL`.
    pub props:          PropSprites,
    /// One entry per `CreatureKind` in `CreatureKind::ALL` order.
    /// Missing animation directories / missing frames are tolerated —
    /// the renderer falls back to a solid-colour placeholder when a
    /// creature has no loaded idle frames.
    pub creatures:      Vec<LoadedCreature>,
    /// Radial darkness overlay. Black everywhere; alpha is 0 inside the
    /// bright radius and ramps to 1.0 at the dim radius. Drawn with linear
    /// filtering so the falloff stays smooth when the window is resized.
    pub light_mask:     Texture2D,
    /// Warm, diffuse radial glow used for the muzzle flash. Bright at the
    /// center, fading smoothly to transparent — reads as a torch-flash.
    pub muzzle_flash:   Texture2D,
    /// Neutral-white radial glow with quadratic alpha falloff. Same
    /// shape as `muzzle_flash` but uncolored, so callers can tint it
    /// to any hue at draw time. Used for constant hazard auras.
    pub hazard_glow:    Texture2D,
    /// Yellow fissile-waste drum. Drawn centred on each radiation
    /// tile as the hazard prop.
    pub rad_barrel:     Texture2D,
    /// Bulkhead door — closed and open halves of the same animation.
    /// 32×32 sprites authored for a "north wall" door (room is south
    /// of the door); the renderer rotates them per `Door::room_dir`
    /// to land on east / south / west sides of other rooms. When a
    /// future biome ships a different door style, lift these onto
    /// `BiomeTextures` and pick per-biome.
    pub door_closed:    Texture2D,
    pub door_open:      Texture2D,
    /// Maintenance / janitor closet door — same rotation rules as
    /// `door_closed`, just a different closed-state art. The open
    /// state shares `door_open` (the user authored the two kinds to
    /// be visually compatible when open).
    pub door_janitor_closed: Texture2D,
    /// Zone-transition door — sits on the east / west edge of the
    /// map. Same rotation rules and shared open sprite as the
    /// other kinds; only the closed art is bespoke.
    pub door_zone_closed: Texture2D,
}

/// One animation's worth of pre-loaded textures. `frames_white` holds a
/// whitened copy of each frame for the hit-flash silhouette — built at
/// load time so we don't allocate per draw.
pub struct LoadedAnimation {
    pub frames: Vec<Texture2D>,
    pub frames_white: Vec<Texture2D>,
}

/// All animations we could manage to load for one creature kind. Any
/// animation file that was missing just comes back as `None`.
#[derive(Default)]
pub struct LoadedCreature {
    pub idle:   Option<LoadedAnimation>,
    pub walk:   Option<LoadedAnimation>,
    pub hurt:   Option<LoadedAnimation>,
    pub attack: Option<LoadedAnimation>,
    pub death:  Option<LoadedAnimation>,
}

impl LoadedCreature {
    pub fn has_any(&self) -> bool {
        self.idle.is_some() || self.walk.is_some()
            || self.hurt.is_some() || self.attack.is_some() || self.death.is_some()
    }
}

/// Pick the animation strip that best matches what the caller asked
/// for. Each state has a **fallback chain** so a creature without
/// dedicated hurt / walk / attack art still produces something the
/// renderer can draw (usually its idle loop). This keeps "add a new
/// creature" content-only: drop an `assets/creatures/<name>/` folder
/// with whatever strips you have, and the game animates what it can.
fn pick_creature_anim(c: &LoadedCreature, state: CreatureAnimState) -> Option<&LoadedAnimation> {
    match state {
        CreatureAnimState::Attack =>
            c.attack.as_ref().or(c.walk.as_ref()).or(c.idle.as_ref()),
        CreatureAnimState::Hurt =>
            c.hurt.as_ref().or(c.idle.as_ref()),
        CreatureAnimState::Walk =>
            c.walk.as_ref().or(c.idle.as_ref()),
        CreatureAnimState::Idle =>
            c.idle.as_ref(),
    }
}

/// Which animation strip the renderer should prefer for a creature
/// this frame. Falls back through related strips if the requested
/// one isn't loaded, so a creature without dedicated hurt / walk /
/// attack art still plays its idle frames gracefully.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CreatureAnimState {
    Idle,
    Walk,
    Hurt,
    Attack,
}

/// Per-frame data the caller hands the renderer for each monster. The
/// renderer looks up the creature's loaded animation textures via
/// `sprite_idx` and picks the current frame itself.
pub struct MonsterView {
    pub pos: (usize, usize),
    /// 0.0 = normal colours, 1.0 = full white flash overlay.
    pub flash: f32,
    /// Index into `Sprites::creatures`, matching `CreatureKind::sprite_index()`.
    pub sprite_idx: usize,
    /// Fraction of a tile to render at (1.0 = full tile).
    pub render_scale: f32,
    /// Footprint `(w, h)` in tiles. Single-tile critters use `(1, 1)`;
    /// 2×2 bosses use `(2, 2)`. Each animation frame then consists of
    /// `w * h` labels laid out clockwise from upper-left.
    pub tile_size: (u32, u32),
    /// When true the sprite is mirrored horizontally (flip_x). For
    /// multi-tile monsters the quadrants also swap columns so the
    /// mirrored composite reads correctly. Most source art faces
    /// left, so `false` = the sprite's native orientation.
    pub facing_right: bool,
    /// Which animation strip to prefer. Caller picks based on what
    /// the creature is doing this turn; the renderer's selector
    /// silently falls back to `idle` if the requested strip isn't
    /// loaded, so callers can always request the "right" state
    /// without worrying about which art exists.
    pub anim_state: CreatureAnimState,
}

/// Per-frame data the caller hands the renderer for each floor item.
/// Carries the item's catalog `ItemSprite` directly — the renderer's
/// `draw_item_icon` helper handles every variant (Atlas / File /
/// Glyph) so the caller doesn't have to know the difference.
pub struct ItemView {
    pub pos: (usize, usize),
    pub sprite: crate::items::ItemSprite,
    pub render_scale: f32,
}

/// Per-frame data the caller hands the renderer for each placed prop.
/// `pos` is the anchor tile per `PropAnchor`; `footprint` and `anchor`
/// drive how the sprite is positioned over neighbouring tiles. The
/// renderer derives the screen rect, samples the texture map by
/// `sprite_path`, and fades the prop with the local lightmap so it
/// behaves like the rest of the world. `animation` is read at draw
/// time to slice horizontal sprite-strip frames and pace the cycle.
pub struct PropView {
    pub pos: (usize, usize),
    pub footprint: (u32, u32),
    pub anchor: crate::props::PropAnchor,
    pub sprite_path: &'static str,
    pub animation: crate::props::PropAnimation,
}

/// Per-frame data the caller hands the renderer for each placed
/// door. `room_dir` points from the door tile **toward** the room
/// it belongs to; the renderer rotates the canonical "north wall"
/// art accordingly. `open` is recomputed every frame from the
/// player's distance — caller computes, renderer just picks the
/// matching texture. `kind` selects which closed-state sprite
/// fires; both kinds share the same open sprite.
pub struct DoorView {
    pub pos: (usize, usize),
    pub room_dir: crate::dungeon::Dir,
    pub open: bool,
    pub kind: crate::dungeon::DoorKind,
}


impl Sprites {
    pub async fn build(bright_radius: usize, dim_radius: usize) -> Self {
        // Player BASE sprite: the survivor in their underwear, which
        // is what they wake up in straight out of cryo. Single frame
        // at 32×32 — used for both idle and walk until a walk
        // animation lands. Equipment layers (jumpsuit, gun) stack
        // ON TOP at the same scale via the paper-doll system.
        // Every survivor paper-doll layer is currently a single-frame
        // 32×32 left-facing sprite. `load_layer` defaults to those
        // values — when a sheet picks up multiple frames or a different
        // size, drop back to `load_player_sheet` for that one entry.
        let player_idle    = load_layer("assets/original/survivor/survivor_underwear.png").await;
        let player_run     = load_layer("assets/original/survivor/survivor_underwear.png").await;
        // Paper-doll layers — one per equipment slot we currently
        // support. Drawn over the base in slot-order (Body before
        // Hands) so a held weapon sits on top of clothing. Add
        // more sheets here when new equipment slots come online.
        let body_jumpsuit    = load_layer("assets/original/survivor/survivor_jumpsuit.png").await;
        let body_chest_plate = load_layer("assets/original/survivor/survivor_sheet_armor.png").await;
        let hands_gun      = load_layer("assets/original/survivor/survivor_gun.png").await;
        let hands_wrench   = load_layer("assets/original/survivor/survivor_wrench.png").await;
        let hands_lamp     = load_layer("assets/original/survivor/survivor_hand_lamp.png").await;

        let rad_barrel = load_texture_or_standin("assets/props/rad_barrel.png").await;
        let door_closed = load_texture_or_standin("assets/biomes/north_bulkhead_door_closed.png").await;
        let door_open   = load_texture_or_standin("assets/biomes/north_bulkhead_door_open.png").await;
        let door_janitor_closed = load_texture_or_standin("assets/biomes/north_janitor_door_closed.png").await;
        let door_zone_closed = load_texture_or_standin("assets/biomes/north_zone_door_closed.png").await;

        // Pre-load every standalone item PNG referenced by an
        // `ItemSprite::File` in the catalog. Walk `ItemKind::ALL`,
        // dedupe by path, and stash each loaded texture in a map.
        // Adding a new `File`-sprited item is now a one-template
        // edit: drop the path in, register the kind in `ItemKind::ALL`
        // if it's a new variant, and the loader picks it up.
        let mut item_files: std::collections::HashMap<&'static str, Texture2D> =
            std::collections::HashMap::new();
        for kind in crate::items::ItemKind::ALL {
            if let crate::items::ItemSprite::File(path) = kind.template().sprite {
                if item_files.contains_key(path) { continue; }
                let tex = load_texture_or_standin(path).await;
                item_files.insert(path, tex);
            }
        }

        // Same plumbing for stationary props. Each `PropKind` declares
        // a sprite path on its template; we pre-load every distinct
        // path once and let the renderer look up by string at draw
        // time. Multi-tile prop sprites (e.g. 32×64 cryo tube) are
        // loaded as a single texture and drawn over their full
        // footprint in `draw_dungeon`.
        let mut prop_files: std::collections::HashMap<&'static str, Texture2D> =
            std::collections::HashMap::new();
        for &kind in crate::props::PropKind::ALL {
            let path = kind.template().sprite;
            if prop_files.contains_key(path) { continue; }
            let tex = load_texture_or_standin(path).await;
            prop_files.insert(path, tex);
        }

        // Five canonical biome tiles. One PNG per slot — the
        // tileset module derives `wall_w` from `wall_e` (mirror) and
        // the three non-NE corners from `corner_ne` (rotation). Add a
        // new biome by dropping its five PNGs in
        // `assets/biomes/<name>/` and pre-loading them here.
        let ship = ShipTextures::load().await;
        let atlas_path = "assets/SciFiDungeonTileset/SciFi_DungeonTileset16x16_0x72Like.png";
        let atlas = load_texture_or_standin(atlas_path).await;
        // Build a whitened copy of the whole atlas once, so any sprite we
        // sample from it has a ready-made silhouette for hit flashes.
        let atlas_img = load_image_or_standin(atlas_path).await;
        let mut white_img = atlas_img.clone();
        for y in 0..white_img.height as u32 {
            for x in 0..white_img.width as u32 {
                let c = white_img.get_pixel(x, y);
                white_img.set_pixel(x, y, Color::new(1.0, 1.0, 1.0, c.a));
            }
        }
        let atlas_white = crisp(Texture2D::from_image(&white_img));

        // Creature and item sprite rects live in their respective
        // modules' templates (`creatures::CreatureTemplate::sprite_frames`,
        // `items::ItemTemplate::sprite`). Dungeon floor/walls live in
        // the Tileset below. Only HP-bar atlas rects stay here.

        // F14 packs both bar states into 2×2 quarters of 8×8 px:
        //   top-left  = empty cap        top-right = empty fill
        //   bot-left  = full  cap        bot-right = full  fill
        let f14 = tile_rect(5, 13);
        let health_bar_empty_cap  = Rect::new(f14.x,       f14.y,        8.0, 8.0);
        let health_bar_empty_fill = Rect::new(f14.x + 8.0, f14.y,        8.0, 8.0);
        let health_bar_full_cap   = Rect::new(f14.x,       f14.y + 8.0,  8.0, 8.0);
        let health_bar_full_fill  = Rect::new(f14.x + 8.0, f14.y + 8.0,  8.0, 8.0);

        let entrance = make_entrance(SPRITE_PX);

        // The mask is drawn at 2*(dim_radius + 1) tiles on screen, giving one
        // tile of slack past `dim_radius`. That guarantees every pixel of
        // every edge-visible tile (which extend half a tile past the dim
        // radius on their far sides) is covered by the mask and gets
        // darkened. Fractions here map the texture's normalised radius so
        // the fade zone `[inner_frac, outer_frac]` lines up with
        // `[bright_radius, dim_radius]` in world tiles.
        let scale = (dim_radius + 1) as f32;
        let inner_frac = bright_radius as f32 / scale;
        let outer_frac = dim_radius    as f32 / scale;

        let light_mask = make_light_mask(512, inner_frac, outer_frac);
        light_mask.set_filter(FilterMode::Linear);

        let muzzle_flash = make_muzzle_flash(256);
        muzzle_flash.set_filter(FilterMode::Linear);
        let hazard_glow = make_hazard_glow(256);
        hazard_glow.set_filter(FilterMode::Linear);

        // Walk the creature catalog and load each kind's per-creature
        // animation directory. Missing files are tolerated; they just
        // leave the animation as `None`.
        let mut creatures: Vec<LoadedCreature> = Vec::with_capacity(CreatureKind::ALL.len());
        for &kind in CreatureKind::ALL {
            creatures.push(load_creature_animations(kind.animations()).await);
        }

        // Default biome: Ship. Swap this for `Biome::Lunar` (or any
        // future biome) by rebuilding via `Tileset::for_biome`
        // against the matching `BiomeTextures` entry — typically at
        // level boundaries so the look changes per floor.
        let tileset = Tileset::for_biome(Biome::Ship, &ship.assets());
        let biomes = BiomeTextures { ship };

        Self {
            atlas: crisp(atlas),
            atlas_white,
            biomes,
            tileset,
            health_bar_full_cap,
            health_bar_full_fill,
            health_bar_empty_cap,
            health_bar_empty_fill,
            entrance: crisp(entrance),
            player: PlayerSprites {
                idle: player_idle,
                run: player_run,
                body_jumpsuit,
                body_chest_plate,
                hands_gun,
                hands_wrench,
                hands_lamp,
            },
            items: ItemSprites {
                files: item_files,
            },
            props: PropSprites { files: prop_files },
            creatures,
            light_mask,
            muzzle_flash,
            hazard_glow,
            rad_barrel: crisp(rad_barrel),
            door_closed: crisp(door_closed),
            door_open:   crisp(door_open),
            door_janitor_closed: crisp(door_janitor_closed),
            door_zone_closed:    crisp(door_zone_closed),
        }
    }
}

/// Load every animation in a creature's `AnimationSet` from its parent
/// directory. Each animation loads its frames in order, plus a
/// whitened companion texture for the hit-flash. Missing files are
/// tolerated — they just leave that animation as `None`.
pub async fn load_creature_animations(anims: AnimationSet) -> LoadedCreature {
    LoadedCreature {
        idle:   load_animation(anims.dir, anims.idle).await,
        walk:   load_animation(anims.dir, anims.walk).await,
        hurt:   load_animation(anims.dir, anims.hurt).await,
        attack: load_animation(anims.dir, anims.attack).await,
        death:  load_animation(anims.dir, anims.death).await,
    }
}

/// Convenience wrapper for the dominant case: a single-frame 32×32
/// left-facing PNG. Cuts the per-call boilerplate in `Sprites::build`
/// where every survivor / paper-doll layer ships as one of these.
/// When a sheet picks up multiple frames or a different size, call
/// `load_player_sheet` directly.
async fn load_layer(path: &str) -> PlayerSheet {
    load_player_sheet(path, 32.0, 32.0, 1, 1.0, false).await
}

/// Load a player sheet plus its whitened twin in one shot. The
/// whitened texture has every opaque pixel forced to RGB white,
/// alpha preserved — overlaid at low opacity it reads as a flash on
/// the silhouette.
async fn load_player_sheet(
    path: &str,
    frame_w: f32,
    frame_h: f32,
    frame_count: usize,
    fps: f64,
    faces_right: bool,
) -> PlayerSheet {
    let texture = load_texture_or_standin(path).await;
    let img = load_image_or_standin(path).await;
    let mut white_img = img.clone();
    for y in 0..white_img.height as u32 {
        for x in 0..white_img.width as u32 {
            let c = white_img.get_pixel(x, y);
            white_img.set_pixel(x, y, Color::new(1.0, 1.0, 1.0, c.a));
        }
    }
    PlayerSheet {
        texture: crisp(texture),
        texture_white: crisp(Texture2D::from_image(&white_img)),
        frame_w, frame_h, frame_count, fps, faces_right,
    }
}

/// Build the whitened "all opaque pixels forced RGB white" companion
/// of a `macroquad::Image`, used by the hit-flash overlay. Pulled out
/// so both the per-file and strip-slice loaders share the math.
fn whiten_image(img: &Image) -> Image {
    let mut w = img.clone();
    for y in 0..w.height as u32 {
        for x in 0..w.width as u32 {
            let c = w.get_pixel(x, y);
            w.set_pixel(x, y, Color::new(1.0, 1.0, 1.0, c.a));
        }
    }
    w
}

async fn load_animation(
    dir: &str,
    source: Option<crate::creatures::AnimationSource>,
) -> Option<LoadedAnimation> {
    let source = source?;
    let mut loaded: Vec<Texture2D> = Vec::new();
    let mut white:  Vec<Texture2D> = Vec::new();
    match source {
        crate::creatures::AnimationSource::Files(labels) => {
            if labels.is_empty() { return None; }
            for label in labels {
                let path = format!("{}/{}.png", dir, label);
                let tex = match load_texture(&path).await {
                    Ok(t) => t,
                    Err(_) => {
                        eprintln!("creature sprite missing: {}", path);
                        continue;
                    }
                };
                tex.set_filter(FilterMode::Nearest);
                let white_tex = match load_image(&path).await {
                    Ok(img) => crisp(Texture2D::from_image(&whiten_image(&img))),
                    Err(_) => tex.clone(),
                };
                loaded.push(tex);
                white.push(white_tex);
            }
        }
        crate::creatures::AnimationSource::Strip { file, frames } => {
            let path = format!("{}/{}", dir, file);
            // Decode the whole sheet to an Image so we can slice it.
            // Falls back to a missing-art message if the file isn't
            // there — same treatment as the per-file path.
            let Ok(img) = load_image(&path).await else {
                eprintln!("creature strip missing: {}", path);
                return None;
            };
            let frames = frames.max(1);
            let cell_w = img.width as u32 / frames;
            let cell_h = img.height as u32;
            let white_src = whiten_image(&img);
            for i in 0..frames {
                let rect = Rect::new(
                    (i * cell_w) as f32, 0.0,
                    cell_w as f32, cell_h as f32,
                );
                let frame_img = img.sub_image(rect);
                let frame_white = white_src.sub_image(rect);
                loaded.push(crisp(Texture2D::from_image(&frame_img)));
                white .push(crisp(Texture2D::from_image(&frame_white)));
            }
        }
        crate::creatures::AnimationSource::Quadrants { file } => {
            let path = format!("{}/{}", dir, file);
            let Ok(img) = load_image(&path).await else {
                eprintln!("creature quadrant sheet missing: {}", path);
                return None;
            };
            let half_w = img.width as u32 / 2;
            let half_h = img.height as u32 / 2;
            let white_src = whiten_image(&img);
            // Clockwise from upper-left: UL, UR, LR, LL — matching the
            // renderer's 2×2 quadrant draw order in `draw_monsters`.
            let quadrants = [(0, 0), (half_w, 0), (half_w, half_h), (0, half_h)];
            for &(qx, qy) in &quadrants {
                let rect = Rect::new(qx as f32, qy as f32, half_w as f32, half_h as f32);
                loaded.push(crisp(Texture2D::from_image(&img.sub_image(rect))));
                white .push(crisp(Texture2D::from_image(&white_src.sub_image(rect))));
            }
        }
    }
    if loaded.is_empty() { None }
    else { Some(LoadedAnimation { frames: loaded, frames_white: white }) }
}

/// Pin a texture to nearest-neighbour filtering so pixel art stays blocky
/// when scaled up, instead of going blurry.
fn crisp(t: Texture2D) -> Texture2D {
    t.set_filter(FilterMode::Nearest);
    t
}

/// Load a single-texture sprite, falling back to a generated stand-in
/// when the file is missing. Use this for standalone sprites that would
/// otherwise `.expect()`-panic on a removed/not-yet-authored PNG — the
/// item, prop, and creature loaders already tolerate missing art, and
/// this keeps the dedicated handles (e.g. `rad_barrel`) playable too.
/// The stand-in is a magenta/black "missing texture" checker so the gap
/// is obvious on screen.
async fn load_texture_or_standin(path: &str) -> Texture2D {
    match load_texture(path).await {
        Ok(t) => crisp(t),
        Err(_) => {
            eprintln!("sprite missing, using stand-in: {}", path);
            crisp(make_standin())
        }
    }
}

/// Image-returning twin of `load_texture_or_standin`, for the few
/// loaders that also decode the PNG to an `Image` (e.g. to build a
/// whitened hit-flash companion). Falls back to the same checker.
async fn load_image_or_standin(path: &str) -> Image {
    match load_image(path).await {
        Ok(img) => img,
        Err(_) => {
            eprintln!("sprite missing, using stand-in: {}", path);
            make_standin_image()
        }
    }
}

/// The "missing texture" stand-in image: a magenta/black checker.
/// Deliberately garish so a removed sprite reads as a gap at a glance
/// rather than blending in as intended art.
fn make_standin_image() -> Image {
    const S: u16 = 16;
    let magenta = Color::from_rgba(220, 40, 180, 255);
    let black = Color::from_rgba(20, 20, 20, 255);
    let mut img = Image::gen_image_color(S, S, magenta);
    for y in 0..S as u32 {
        for x in 0..S as u32 {
            // 8×8 checker: two cells across, two down.
            if (x / 8 + y / 8) % 2 == 1 {
                img.set_pixel(x, y, black);
            }
        }
    }
    img
}

/// Texture form of the stand-in checker. See `make_standin_image`.
fn make_standin() -> Texture2D {
    Texture2D::from_image(&make_standin_image())
}

/// Short-hand for a 16×16 cell at grid (col, row) inside the atlas.
fn tile_rect(col: i32, row: i32) -> Rect {
    Rect::new((col * 16) as f32, (row * 16) as f32, 16.0, 16.0)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn rgba((r, g, b): (u8, u8, u8)) -> Color {
    Color::from_rgba(r, g, b, 255)
}


// ── Substrate (deep hull / void) ─────────────────────────────────────────────

// ── Radial darkness mask ─────────────────────────────────────────────────────

/// Bake a light-mask texture sized to the given radii. Convenience
/// wrapper that handles the inner/outer fraction math + filtering
/// setup so callers (Sprites::build, Sprites::rebuild_light_mask)
/// don't need to know the layout details.
pub fn build_light_mask(bright_radius: usize, dim_radius: usize) -> Texture2D {
    let scale = (dim_radius + 1) as f32;
    let inner_frac = bright_radius as f32 / scale;
    let outer_frac = dim_radius    as f32 / scale;
    let tex = make_light_mask(512, inner_frac, outer_frac);
    tex.set_filter(FilterMode::Linear);
    tex
}

impl Sprites {
    /// Replace the active light-mask with one baked for the given
    /// radii. Call whenever the player's effective vision changes
    /// (new equipment, class swap, ...). Cheap — a single 512×512
    /// image rebuild — but rare enough that we don't try to amortize.
    pub fn rebuild_light_mask(&mut self, bright_radius: usize, dim_radius: usize) {
        self.light_mask = build_light_mask(bright_radius, dim_radius);
    }
}

/// Black texture whose alpha ramps from 0 inside `inner_frac` to 1.0 at
/// `outer_frac`, via a smoothstep. Pixels past `outer_frac` (including the
/// square's corners) stay fully opaque.
fn make_light_mask(size: u16, inner_frac: f32, outer_frac: f32) -> Texture2D {
    let mut img = Image::gen_image_color(size, size, Color::new(0.0, 0.0, 0.0, 1.0));
    let cx = size as f32 / 2.0;
    let cy = size as f32 / 2.0;
    let max_r = size as f32 / 2.0;

    for y in 0..size as u32 {
        for x in 0..size as u32 {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let r = (dx * dx + dy * dy).sqrt() / max_r;
            let t = ((r - inner_frac) / (outer_frac - inner_frac)).clamp(0.0, 1.0);
            let alpha = t * t * (3.0 - 2.0 * t);
            img.set_pixel(x, y, Color::new(0.0, 0.0, 0.0, alpha));
        }
    }
    Texture2D::from_image(&img)
}

// ── Muzzle flash (soft warm radial glow) ─────────────────────────────────────

/// Warm glow that's bright in the centre and fades to transparent at the
/// rim. Colour is a warm torch tint; alpha falls off with a soft quadratic
/// curve so the edge stays diffuse rather than rimmed.
fn make_muzzle_flash(size: u16) -> Texture2D {
    let mut img = Image::gen_image_color(size, size, Color::new(0.0, 0.0, 0.0, 0.0));
    let cx = size as f32 / 2.0;
    let cy = size as f32 / 2.0;
    let max_r = size as f32 / 2.0;
    for y in 0..size as u32 {
        for x in 0..size as u32 {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let r = ((dx * dx + dy * dy).sqrt() / max_r).clamp(0.0, 1.0);
            let t = 1.0 - r;
            let alpha = t * t;
            img.set_pixel(x, y, Color::new(1.0, 0.88, 0.58, alpha));
        }
    }
    Texture2D::from_image(&img)
}

/// Neutral-white radial glow with the same quadratic falloff shape as
/// the muzzle flash, but uncolored — tintable at draw time via the
/// `color` argument on `draw_texture_ex`. Used for constant hazard
/// auras (green for radiation, blue for electrical, etc.).
fn make_hazard_glow(size: u16) -> Texture2D {
    let mut img = Image::gen_image_color(size, size, Color::new(0.0, 0.0, 0.0, 0.0));
    let cx = size as f32 / 2.0;
    let cy = size as f32 / 2.0;
    let max_r = size as f32 / 2.0;
    for y in 0..size as u32 {
        for x in 0..size as u32 {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let r = ((dx * dx + dy * dy).sqrt() / max_r).clamp(0.0, 1.0);
            let t = 1.0 - r;
            let alpha = t * t;
            img.set_pixel(x, y, Color::new(1.0, 1.0, 1.0, alpha));
        }
    }
    Texture2D::from_image(&img)
}

// ── Entrance (airlock with emergency strip) ──────────────────────────────────

fn make_entrance(size: u16) -> Texture2D {
    let s = size as i32;
    let mut img = Image::gen_image_color(size, size, rgba(WALL_DARK));
    for y in 4..s - 4 {
        for x in 4..s - 4 {
            img.set_pixel(x as u32, y as u32, rgba(HULL_VOID));
        }
    }
    for i in 0..s {
        img.set_pixel(i as u32, 0, rgba(WALL_BASE));
        img.set_pixel(i as u32, (s - 1) as u32, rgba(WALL_BASE));
        img.set_pixel(0, i as u32, rgba(WALL_BASE));
        img.set_pixel((s - 1) as u32, i as u32, rgba(WALL_BASE));
    }
    for x in 4..s - 4 {
        img.set_pixel(x as u32, 2, rgba(EMERGENCY));
        img.set_pixel(x as u32, 3, rgba(EMERGENCY_D));
    }
    for x in 4..s - 4 {
        if x % 4 < 2 {
            img.set_pixel(x as u32, 1, rgba(WARN));
        }
    }
    Texture2D::from_image(&img)
}

// ── Drawing ──────────────────────────────────────────────────────────────────

/// Draw the dungeon into the rectangle (`ox`, `oy`, `MAP_W*tile`, `MAP_H*tile`).
/// Caller picks `tile`, `ox`, `oy` each frame — that's how resizing works.
pub fn draw_dungeon(
    map: &Map,
    sprites: &Sprites,
    player: (usize, usize),
    player_moving: bool,
    facing_right: bool,
    // `right_hand_weapon`: which weapon (if any) is held in the
    // right-hand slot. `None` → no right-hand layer; `Some(Wrench)`
    // → wrench paper doll; `Some(_)` → gun paper doll. Drives the
    // muzzle-flash anchor too — only ranged weapons trigger a flash.
    right_hand_weapon: Option<crate::items::weapons::WeaponKind>,
    // `lamp_equipped`: hand-lamp held in the left-hand slot. Drives
    // the off-hand paper-doll layer; visibility radii are handled
    // upstream in `vision_radii`.
    lamp_equipped: bool,
    // `jumpsuit_equipped`: true when the flight jumpsuit is in the
    // Clothing slot. Drives the base body paper-doll layer.
    jumpsuit_equipped: bool,
    // `chest_plate_equipped`: true when the crafted chest plate is
    // in the Body slot. Drives the over-clothing armor layer; can
    // stack with `jumpsuit_equipped` (chest plate goes on top).
    chest_plate_equipped: bool,
    // `fire_flash`: 0.0 = no flash, 1.0 = peak muzzle flash. Caller fades
    // this to 0 over the desired flash duration.
    fire_flash: f32,
    // `hurt_progress`: when `Some(elapsed_seconds)` and elapsed is within
    // `HURT_DURATION`, the player sheet is swapped for the hurt animation.
    hurt_progress: Option<f64>,
    // `aim_cursor`: screen-space cursor position while aiming. When
    // `Some`, the rifle rotates around the hand to point at it; when
    // `None`, the rifle sits in its carry pose with the per-frame bob.
    aim_cursor: Option<Vec2>,
    monsters: &[MonsterView],
    // `items`: tile-aligned pickable items. Each carries its own sprite
    // source (atlas rect or standalone texture tag) and render scale.
    items: &[ItemView],
    // `props`: stationary scenery (cryo tubes, lockers, terminals).
    // Drawn after items so a tube's tall sprite sits on top of any
    // dropped loot sharing its column. Faded with the local lightmap
    // off the anchor tile so visibility tracks the rest of the world.
    props: &[PropView],
    // `doors`: bulkhead doors at corridor / room boundaries. Drawn
    // on top of the floor (so the door art replaces the tiled floor
    // visually) but before tall props / monsters / items, so a
    // monster standing on the threshold draws over the door.
    doors: &[DoorView],
    // `stairs_down`: the tile the player steps on to descend. Rendered
    // under the FOV mask so it fades with distance like other map
    // features.
    stairs_down: Option<(usize, usize)>,
    brightness: &[f32],
    dim_radius: usize,
    tile: f32,
    ox: f32,
    oy: f32,
) {
    let params = |s: f32| DrawTextureParams {
        dest_size: Some(vec2(s, s)),
        ..Default::default()
    };
    let warm = Color::new(1.0, 0.93, 0.80, 1.0);

    // 1. Every visible tile at full warm brightness — the mask darkens them.
    for y in 0..map.height {
        for x in 0..map.width {
            if brightness[y * map.width + x] <= 0.0 { continue; }

            let px = ox + x as f32 * tile;
            let py = oy + y as f32 * tile;

            // Look up the tile-piece for this cell on the active biome.
            // Walls dispatch via `pick_wall_slot` — the tileset owns
            // which sprite goes in each named slot. Hazards draw the
            // floor piece with a colored overlay on top.
            let t = map.tile(x, y);
            let (variants, rotate) = match t {
                Tile::Floor
                | Tile::RadiationZone
                | Tile::ElectricalHazard
                | Tile::CollapseHazard
                | Tile::AcidPool
                | Tile::FirePool
                // Floor rotation is per-biome — opt-in for tiles
                // that read fine at any 0/90/180/270° angle, opt-
                // out (Ship) for directional sprites whose seams
                // / rivets / arrows lock the orientation.
                | Tile::ControlPanel => (&sprites.tileset.floor, sprites.tileset.floor_rotate),
                Tile::Wall => {
                    let slot = tileset::pick_wall_slot(map, x, y);
                    // Wall slot art is orientation-bearing — never
                    // rotate it, or the edge piece's "this side
                    // faces floor" cue stops matching the layout.
                    (sprites.tileset.wall(slot), false)
                }
            };
            // The variant pool picks a piece deterministically from
            // `(x, y)` — single-piece pools just return their lone
            // piece; multi-piece pools shuffle stably across the map.
            tileset::draw_tile(variants, x, y, px, py, tile, warm, rotate);

            if Some((x, y)) == map.entrance {
                draw_texture_ex(&sprites.entrance, px, py, warm, params(tile));
            }

            // Hazard visuals — overlay / glow / prop — come from a
            // single template lookup. Adding a hazard or retuning
            // its look is a data edit in `hazards.rs`.
            //
            // ControlPanel isn't a hazard template (it doesn't
            // damage), so its overlay stays inline here.
            let template = hazards::hazard_template(t);

            if let Some(c) = template.as_ref().and_then(|h| h.overlay) {
                draw_rectangle(px, py, tile, tile, c);
            } else if matches!(t, Tile::ControlPanel) {
                draw_rectangle(px, py, tile, tile, Color::new(1.00, 0.85, 0.30, 0.50));
            }

            // Radial glow from template; ControlPanel reuses the same
            // glow system with its amber tone.
            let glow_color = template.as_ref().and_then(|h| h.glow)
                .or(if matches!(t, Tile::ControlPanel) {
                    Some(Color::new(1.00, 0.85, 0.30, 0.55))
                } else { None });
            if let Some(c) = glow_color {
                let glow_size = tile * 2.5;
                draw_texture_ex(
                    &sprites.hazard_glow,
                    px + (tile - glow_size) * 0.5,
                    py + (tile - glow_size) * 0.5,
                    c,
                    DrawTextureParams {
                        dest_size: Some(vec2(glow_size, glow_size)),
                        ..Default::default()
                    },
                );
            }

            // Prop sprite, centered at 80% tile. The sprite handle is
            // selected from Sprites by the template's HazardProp key.
            if let Some(prop) = template.as_ref().and_then(|h| h.prop) {
                let texture = match prop {
                    hazards::HazardProp::RadBarrel => &sprites.rad_barrel,
                };
                let prop_size = tile * 0.8;
                draw_texture_ex(
                    texture,
                    px + (tile - prop_size) * 0.5,
                    py + (tile - prop_size) * 0.5,
                    warm,
                    DrawTextureParams {
                        dest_size: Some(vec2(prop_size, prop_size)),
                        ..Default::default()
                    },
                );
            }
        }
    }

    // 1b. Bulkhead doors — render on top of the floor, before
    // monsters / items / tall props. Canonical art is "north wall"
    // (room is south of door) at zero rotation; rotate clockwise per
    // `room_dir` to land doors on the other three room sides. Drawn
    // before the FOV mask so doors fade with distance.
    {
        use crate::dungeon::Dir;
        let pi = std::f32::consts::PI;
        for door in doors {
            let (dx, dy) = door.pos;
            if dx >= map.width || dy >= map.height { continue; }
            if brightness[dy * map.width + dx] <= 0.0 { continue; }
            // Map "direction toward room" → canonical sprite rotation.
            // The default sprite is authored as a north-wall door (room
            // sits south of the door), so a south-pointing `room_dir`
            // gets zero rotation.
            let rotation = match door.room_dir {
                Dir::S => 0.0,
                Dir::W => pi * 0.5,
                Dir::N => pi,
                Dir::E => pi * 1.5,
                // Diagonals shouldn't happen (detect_doors only
                // emits cardinals); fall back to zero rotation so a
                // future bug stays visible rather than panicking.
                _      => 0.0,
            };
            // The door sprites are layered: `door_open` is the
            // frame (always drawn), and the per-kind closed sprites
            // are the door panel that sits inside that frame when
            // shut. A regular "open" door is just the frame on its
            // own. Zone doors are an exception — they don't open
            // onto a real room beyond, so showing only the frame
            // looks like a hole; we always paint the closed panel
            // even when the door is functionally open and walkable.
            let px = ox + dx as f32 * tile;
            let py = oy + dy as f32 * tile;
            draw_texture_ex(&sprites.door_open, px, py, warm, DrawTextureParams {
                dest_size: Some(vec2(tile, tile)),
                rotation,
                ..Default::default()
            });
            let always_show_closed = matches!(door.kind, crate::dungeon::DoorKind::Zone);
            if !door.open || always_show_closed {
                let panel = match door.kind {
                    crate::dungeon::DoorKind::Bulkhead => &sprites.door_closed,
                    crate::dungeon::DoorKind::Janitor  => &sprites.door_janitor_closed,
                    crate::dungeon::DoorKind::Zone     => &sprites.door_zone_closed,
                };
                draw_texture_ex(panel, px, py, warm, DrawTextureParams {
                    dest_size: Some(vec2(tile, tile)),
                    rotation,
                    ..Default::default()
                });
            }
        }
    }

    // 2b. Monsters — drawn before the light mask so they dim with
    // distance like map tiles. Each monster's sprite pulls from its
    // per-creature loaded animations (see `LoadedCreature`). Missing
    // art falls back to a colored placeholder so the game stays
    // playable while sprites are being authored.
    const MONSTER_FPS: f64 = 3.0;
    for m in monsters {
        let (mx, my) = m.pos;
        if mx >= map.width || my >= map.height { continue; }
        // Any lit tile within the footprint makes the monster visible.
        let (tw, th) = m.tile_size;
        let mut anywhere_lit = false;
        for dy in 0..th {
            for dx in 0..tw {
                let tx = mx + dx as usize;
                let ty = my + dy as usize;
                if tx < map.width && ty < map.height
                    && brightness[ty * map.width + tx] > 0.0
                {
                    anywhere_lit = true;
                    break;
                }
            }
            if anywhere_lit { break; }
        }
        if !anywhere_lit { continue; }

        // Quadrant offsets — clockwise from upper-left, matching the
        // authoring order of multi-tile frame labels (UL, UR, LR, LL
        // for 2×2). Single-tile creatures collapse to one quadrant.
        let base_offsets: &[(u32, u32)] = match (tw, th) {
            (1, 1) => &[(0, 0)],
            (2, 2) => &[(0, 0), (1, 0), (1, 1), (0, 1)],
            _ => &[(0, 0)],
        };
        let tiles_per_frame = base_offsets.len();
        // Mirror the x-offsets when facing right so the quadrants
        // swap columns before flip_x mirrors each quadrant's pixels.
        // Result: the whole creature flips as one cohesive sprite.
        let offsets: Vec<(u32, u32)> = if m.facing_right {
            base_offsets.iter().map(|&(dx, dy)| (tw - 1 - dx, dy)).collect()
        } else {
            base_offsets.to_vec()
        };

        // Render each quadrant at its own tile. `render_scale` shrinks
        // each quadrant individually and centers it in its tile.
        let scale = m.render_scale.clamp(0.1, 1.0);
        let size = tile * scale;
        let offset = (tile - size) * 0.5;

        let loaded = sprites.creatures.get(m.sprite_idx);
        let anim = loaded.and_then(|c| pick_creature_anim(c, m.anim_state));
        match anim {
            Some(a) if a.frames.len() >= tiles_per_frame => {
                let num_frames = a.frames.len() / tiles_per_frame;
                let frame_i = (get_time() * MONSTER_FPS) as usize
                    % num_frames.max(1);
                let base = frame_i * tiles_per_frame;
                for (qi, &(dx, dy)) in offsets.iter().enumerate() {
                    let tex_i = base + qi;
                    let px = ox + (mx as u32 + dx) as f32 * tile + offset;
                    let py = oy + (my as u32 + dy) as f32 * tile + offset;
                    draw_texture_ex(
                        &a.frames[tex_i], px, py, warm,
                        DrawTextureParams {
                            dest_size: Some(vec2(size, size)),
                            flip_x: m.facing_right,
                            ..Default::default()
                        },
                    );
                    if m.flash > 0.0 {
                        if let Some(w) = a.frames_white.get(tex_i) {
                            draw_texture_ex(
                                w, px, py,
                                Color::new(1.0, 1.0, 1.0, m.flash.min(1.0)),
                                DrawTextureParams {
                                    dest_size: Some(vec2(size, size)),
                                    flip_x: m.facing_right,
                                    ..Default::default()
                                },
                            );
                        }
                    }
                }
            }
            _ => {
                // Placeholder: one warn-pink square per quadrant with
                // the first letter of the creature's name stamped on
                // the upper-left tile.
                let ph = Color::from_rgba(200, 60, 130, 220);
                for (qi, &(dx, dy)) in offsets.iter().enumerate() {
                    let px = ox + (mx as u32 + dx) as f32 * tile + offset;
                    let py = oy + (my as u32 + dy) as f32 * tile + offset;
                    draw_rectangle(px, py, size, size, ph);
                    if qi == 0 {
                        let label = placeholder_glyph(m.sprite_idx);
                        let txt_size = size * 0.7;
                        let td = measure_text(&label, None, txt_size as u16, 1.0);
                        let tx = px + (size - td.width) * 0.5;
                        let ty = py + size * 0.78;
                        draw_text(&label, tx, ty, txt_size, WHITE);
                    }
                    if m.flash > 0.0 {
                        let mut flash_c = WHITE;
                        flash_c.a = m.flash.min(1.0);
                        draw_rectangle(px, py, size, size, flash_c);
                    }
                }
            }
        }
    }

    // 2c. Items on the floor — same layer as monsters so they dim with
    // distance. Items preserve their native pixel size relative to the
    // player (1 native px = tile / PLAYER_FRAME_H screen px), so an 8×8
    // asset reads as smaller than a 16×16 one and nothing gets blown up
    // to fill a full tile. Centred within the tile's footprint.
    for item in items {
        let (cx, cy) = item.pos;
        if cx >= map.width || cy >= map.height { continue; }
        if brightness[cy * map.width + cx] <= 0.0 { continue; }
        let size = tile * item.render_scale.clamp(0.1, 1.0);
        let px = ox + cx as f32 * tile + (tile - size) * 0.5;
        let py = oy + cy as f32 * tile + (tile - size) * 0.5;
        draw_item_icon(sprites, item.sprite, px, py, size, warm);
    }

    // 2c-bis. Stationary props. A 1×N footprint sprite is drawn at
    // the screen rect that covers all of its tile cells, regardless
    // of which of those cells is the anchor. Visibility keys off the
    // *anchor* tile's brightness — tall props that overhang into a
    // wall stay readable when the floor underneath is lit even if
    // the wall above isn't part of the FOV. The whole sprite is
    // tinted by the anchor's brightness so a partially-lit room
    // doesn't pop the prop to full warm.
    for prop in props {
        let (ax, ay) = prop.pos;
        if ax >= map.width || ay >= map.height { continue; }
        let lit = brightness[ay * map.width + ax];
        if lit <= 0.0 { continue; }
        let (fw, fh) = prop.footprint;
        if fw == 0 || fh == 0 { continue; }
        // Convert anchor position to top-left of the sprite's
        // bounding box. `Bottom` means `pos` is the bottom row, so
        // the sprite extends `fh - 1` tiles upward.
        let top_y = match prop.anchor {
            crate::props::PropAnchor::Bottom =>
                (ay as i32) - (fh as i32 - 1),
            crate::props::PropAnchor::TopLeft =>
                ay as i32,
        };
        let left_x = ax as i32;
        let px = ox + left_x as f32 * tile;
        let py = oy + top_y as f32 * tile;
        let w = fw as f32 * tile;
        let h = fh as f32 * tile;
        let tex = match sprites.props.files.get(prop.sprite_path) {
            Some(t) => t,
            None => continue,
        };
        // Tint towards black as visibility falls off — same trick the
        // light mask uses, but applied per-prop because the sprite
        // can extend over tiles with their own brightness values.
        let tint = Color::new(warm.r, warm.g, warm.b, 1.0);
        // Source rect: full texture for static props, the current
        // frame's column for sprite-strip props. Strip cells are
        // `tex_w / frames` pixels wide, full sprite height tall.
        let source = match prop.animation {
            crate::props::PropAnimation::Static => None,
            crate::props::PropAnimation::Strip { frames, frame_seconds } => {
                let frames = frames.max(1);
                let frame_seconds = frame_seconds.max(0.001);
                let cell_w = tex.width() / frames as f32;
                let cell_h = tex.height();
                let frame = ((get_time() as f32 / frame_seconds) as u32) % frames;
                Some(Rect::new(frame as f32 * cell_w, 0.0, cell_w, cell_h))
            }
        };
        draw_texture_ex(tex, px, py, tint, DrawTextureParams {
            dest_size: Some(vec2(w, h)),
            source,
            ..Default::default()
        });
    }

    // (The legacy green ">" stairs chevron has been retired —
    // descent now happens by stepping onto the eastern zone door,
    // which is its own visual signpost.)
    let _ = stairs_down;

    // 3. Radial darkness mask. Drawn one tile wider in each direction than
    // `dim_radius` so even the far-side pixels of edge-visible tiles land
    // inside the mask's square and get properly darkened. Past the opaque
    // rim everything is solid black, matching the cleared background past
    // the un-drawn tiles.
    let player_cx = ox + (player.0 as f32 + 0.5) * tile;
    let player_cy = oy + (player.1 as f32 + 0.5) * tile;
    let mask_size = 2.0 * (dim_radius + 1) as f32 * tile;
    draw_texture_ex(
        &sprites.light_mask,
        player_cx - mask_size * 0.5,
        player_cy - mask_size * 0.5,
        WHITE,
        DrawTextureParams {
            dest_size: Some(vec2(mask_size, mask_size)),
            ..Default::default()
        },
    );

    // 4. Player last — always fully lit, drawn on top of the mask.
    //
    // Paper-doll stack: base sprite first, then equipment layers in
    // slot order (Body → Hands), each at the same screen position
    // and size as the base. Each layer flashes white in place when
    // hurt, so the topmost-visible pixel always carries the flash.
    let base_sheet = if player_moving { &sprites.player.run }
                     else              { &sprites.player.idle };
    let frame = (get_time() * base_sheet.fps) as usize
        % base_sheet.frame_count.max(1);
    let src = Rect {
        x: frame as f32 * base_sheet.frame_w,
        y: 0.0,
        w: base_sheet.frame_w,
        h: base_sheet.frame_h,
    };
    // Preserve aspect ratio: the sprite's height fills one tile, and
    // width scales by the sheet's aspect. Lets sheets of different
    // pixel dimensions coexist without stretching.
    let dest_h = tile;
    let dest_w = tile * (base_sheet.frame_w / base_sheet.frame_h);
    let ppx = ox + (player.0 as f32 + 0.5) * tile - dest_w * 0.5;
    let ppy = oy + player.1 as f32 * tile;

    // Hurt flash: alpha fades from full → 0 over HURT_DURATION.
    // Same trick the creature renderer uses for kill flashes.
    let flash_alpha = hurt_progress
        .filter(|t| *t >= 0.0 && *t < HURT_DURATION)
        .map(|t| 1.0 - (t / HURT_DURATION) as f32)
        .unwrap_or(0.0);

    // Helper: draw one paper-doll layer plus its hurt flash. The
    // layer's `faces_right` is consulted independently so layers
    // authored in different orientations still composite right.
    let draw_layer = |sheet: &PlayerSheet| {
        let flip = facing_right != sheet.faces_right;
        draw_texture_ex(
            &sheet.texture,
            ppx, ppy, warm,
            DrawTextureParams {
                dest_size: Some(vec2(dest_w, dest_h)),
                source: Some(src),
                flip_x: flip,
                ..Default::default()
            },
        );
        if flash_alpha > 0.0 {
            draw_texture_ex(
                &sheet.texture_white,
                ppx, ppy,
                Color::new(1.0, 1.0, 1.0, flash_alpha),
                DrawTextureParams {
                    dest_size: Some(vec2(dest_w, dest_h)),
                    source: Some(src),
                    flip_x: flip,
                    ..Default::default()
                },
            );
        }
    };

    // Layer order (bottom → top):
    //   base → Clothing (jumpsuit) → Body (chest plate) → off-hand
    //   (lamp) → right-hand (weapon).
    // When more slots come online (Head, Back, Feet…) insert their
    // draws here in the same bottom-up order.
    use crate::items::weapons::WeaponKind;
    draw_layer(base_sheet);
    if jumpsuit_equipped    { draw_layer(&sprites.player.body_jumpsuit); }
    if chest_plate_equipped { draw_layer(&sprites.player.body_chest_plate); }
    if lamp_equipped        { draw_layer(&sprites.player.hands_lamp); }
    let weapon_can_fire = right_hand_weapon
        .map(|k| k.template().ranged.is_some())
        .unwrap_or(false);
    match right_hand_weapon {
        Some(WeaponKind::Wrench) => draw_layer(&sprites.player.hands_wrench),
        Some(_)                  => draw_layer(&sprites.player.hands_gun),
        None                     => {}
    }
    let hurt_active = flash_alpha > 0.0;

    // Muzzle flash anchored on the `survivor_gun` paper-doll layer's
    // barrel. Only fires for ranged weapons — melee weapons can't
    // discharge a flash, so we gate on `weapon_can_fire`.
    let _ = aim_cursor;
    if weapon_can_fire && fire_flash > 0.0 && !hurt_active {
        let gun = &sprites.player.hands_gun;
        let flip = facing_right != gun.faces_right;
        // Barrel tip on the native (left-facing) sprite. When the
        // sheet flips for a right-facing pose, mirror across the
        // frame's horizontal midline so the flash tracks the barrel.
        const GUN_BARREL_X: f32 = 5.5;
        const GUN_BARREL_Y: f32 = 13.5;
        let barrel_native_x = if flip { gun.frame_w - GUN_BARREL_X } else { GUN_BARREL_X };
        let scale_x = dest_w / gun.frame_w;
        let scale_y = dest_h / gun.frame_h;
        let bx = ppx + barrel_native_x * scale_x;
        let by = ppy + GUN_BARREL_Y * scale_y;
        let flash_size = tile * 2.5;
        draw_texture_ex(
            &sprites.muzzle_flash,
            bx - flash_size * 0.5,
            by - flash_size * 0.5,
            Color::new(1.0, 1.0, 1.0, fire_flash.min(1.0) * 0.33),
            DrawTextureParams {
                dest_size: Some(vec2(flash_size, flash_size)),
                ..Default::default()
            },
        );
    }
    let _ = hurt_active;
}

/// Paint an item icon at `(x, y)` sized `size × size`, modulated by
/// `tint`. Handles every `ItemSprite` variant — atlas sub-rect,
/// pre-loaded standalone PNG, or one of the legacy hardcoded
/// textures. Used by both the floor renderer and the inventory
/// panel so the look is consistent in either context.
pub fn draw_item_icon(
    sprites: &Sprites,
    sprite: crate::items::ItemSprite,
    x: f32,
    y: f32,
    size: f32,
    tint: Color,
) {
    use crate::items::ItemSprite;
    match sprite {
        ItemSprite::Atlas(src) => {
            draw_texture_ex(&sprites.atlas, x, y, tint, DrawTextureParams {
                dest_size: Some(vec2(size, size)),
                source: Some(src),
                ..Default::default()
            });
        }
        ItemSprite::File(path) => {
            if let Some(tex) = sprites.items.files.get(path) {
                draw_texture_ex(tex, x, y, tint, DrawTextureParams {
                    dest_size: Some(vec2(size, size)),
                    ..Default::default()
                });
            }
        }
        ItemSprite::Glyph { letter, color } => {
            // Placeholder block: a flat coloured square with the
            // glyph centred on it. Multiplies through `tint` so the
            // FOV mask still fades the icon with distance the same
            // way real sprites do.
            let bg = Color::new(
                color.0 as f32 / 255.0 * tint.r,
                color.1 as f32 / 255.0 * tint.g,
                color.2 as f32 / 255.0 * tint.b,
                tint.a,
            );
            draw_rectangle(x, y, size, size, bg);
            draw_rectangle_lines(x, y, size, size, (size * 0.05).max(1.0),
                Color::new(0.0, 0.0, 0.0, tint.a));
            // Glyph in a contrasting near-white.
            let glyph = letter.to_string();
            let font_size = size * 0.78;
            let dim = measure_text(&glyph, None, font_size as u16, 1.0);
            draw_text(
                &glyph,
                x + (size - dim.width) * 0.5,
                y + size * 0.78,
                font_size,
                Color::new(0.95 * tint.r, 0.95 * tint.g, 0.95 * tint.b, tint.a),
            );
        }
    }
}

/// Printable placeholder for a creature whose sprites haven't been
/// authored yet. Uses the creature's `ALL` index as a glyph so
/// different kinds are distinguishable on the missing-art pink block.
fn placeholder_glyph(sprite_idx: usize) -> String {
    if sprite_idx < CreatureKind::ALL.len() {
        // First letter of the creature's name, uppercase.
        CreatureKind::ALL[sprite_idx].name()
            .chars().next().unwrap_or('?').to_uppercase().to_string()
    } else {
        "?".to_string()
    }
}

