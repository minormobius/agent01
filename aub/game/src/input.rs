//! Named input actions + bindings.
//!
//! Game code never calls `is_key_pressed(KeyCode::X)` directly.
//! Every keyboard check goes through one of the helpers here, keyed
//! off a named `Action`. Rebinding becomes a one-place edit; the
//! pause menu's currently-stubbed Keybindings entry can later let
//! the player swap underlying `KeyCode`s without touching gameplay.
//!
//! ## Why this is here
//!
//! Direct key checks scattered through code make remapping,
//! gamepad support, and accessibility options expensive to add
//! later. Routing through actions decouples the *intent*
//! ("attack", "interact") from the *input device* (keyboard,
//! mouse, future gamepad). When a `KeyCode` reference shows up
//! anywhere outside this module, the action layer was bypassed
//! and the ergonomic story breaks.
//!
//! ## What lives here vs. what doesn't
//!
//! - **Keyboard actions:** all of them. If a key has gameplay
//!   semantics (movement, attack, menu nav, confirm, etc.) it's an
//!   `Action` variant.
//! - **Mouse:** still handled directly via `macroquad::input` in
//!   call sites — this module is keyboard-only for now. A future
//!   pass can broaden `Action` to mouse buttons too.
//! - **Letter selection** (a-z mapped to inventory / category
//!   slots): exposed via `letter_pressed(idx)` so call sites don't
//!   poke `KeyCode::A` etc. directly.
//! - **Char input** during the save-name prompt: still uses
//!   macroquad's `get_char_pressed` — chars aren't actions, they
//!   *are* the data being typed.
//!
//! ## Adding a new action
//!
//! 1. Add a variant to [`Action`].
//! 2. Bind it in [`Bindings::default_keyboard`] to one or more
//!    `KeyCode`s.
//! 3. Call `bindings.pressed(Action::Whatever)` at the use site.
//!
//! Bindings are a `Vec<KeyCode>` per action, so multiple keys can
//! all trigger the same action (arrows + WASD + numpad).

use std::collections::HashMap;

use macroquad::input::{is_key_down, is_key_pressed, KeyCode};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Action {
    // ── Movement & menu navigation ──────────────────────────
    // The same keys serve both — context (overlay open vs not)
    // determines which interpretation fires. Splitting into
    // separate actions later (e.g. "WASD only for movement,
    // arrows only for menus") is a one-binding-table edit.
    Up,
    Down,
    Left,
    Right,

    // ── Turn-spending actions ───────────────────────────────
    /// Pass / wait one turn without moving or attacking.
    Wait,
    /// Bump-action interaction with the prop / door in front.
    Interact,
    /// Stomp / kick the adjacent enemy.
    Kick,
    /// Class signature ability — currently Security's combat stims.
    /// Other classes route their signature here too once authored.
    SignatureAbility,
    /// Swap the right-hand weapon with whatever's stashed in the
    /// `ReadyWeapon` slot. Costs one player turn; lets the player
    /// flip between a wielded melee and a stashed ranged (or vice
    /// versa) cheaply.
    SwapWeapon,
    /// Enter keyboard aiming mode for the equipped ranged weapon.
    /// Released-fire: a second F (or Enter) commits the shot;
    /// arrows / Tab move the cursor; Esc cancels without a turn cost.
    FireAim,
    /// Enter keyboard aiming mode for the assigned `Throwable` slot.
    /// Same control surface as FireAim, but resolves to a thrown-item
    /// action whose impact radius and range are item-driven.
    ThrowAim,
    /// Cycle through valid targets while in an aiming overlay.
    /// Outside aim mode the key is free — see `CycleTarget`'s binding
    /// in `Bindings::default_keyboard` and the aim-frame input
    /// handler in `main.rs`.
    CycleTarget,

    // ── UI overlay toggles ──────────────────────────────────
    ToggleInventory,
    ToggleEquipment,
    ToggleCrafting,

    // ── Confirm / cancel ────────────────────────────────────
    Confirm,
    Cancel,

    // ── In-overlay actions ──────────────────────────────────
    /// Use / activate / consume the focused inventory entry.
    Use,
    /// Equip the focused entry (or, in the loot screen, equip the
    /// item being taken).
    Equip,
    /// Stash a weapon into the `ReadyWeapon` slot directly from
    /// the inventory's item-action prompt. Routes to the same
    /// `equip_from_inventory_into` helper as the equipment-screen
    /// belt-pouch flow, just targeting `EquipSlot::ReadyWeapon`.
    Ready,
    /// Drain every item from a container into inventory at once.
    TakeAll,
    /// Re-roll the stats block on the rollstats screen.
    Reroll,
    /// Focus / commit the highlighted recipe in the crafting screen.
    Focus,

    // ── Text entry ──────────────────────────────────────────
    /// Backspace in the save-name prompt.
    DeleteChar,
}

/// Action → keys lookup. A `Vec<KeyCode>` per action lets one
/// action accept several physical keys (e.g. arrow + WASD + numpad
/// all pointing at `Action::Up`). Two different actions sharing a
/// key is fine and intentional — `Reroll` and `TakeAll` both bind
/// `R` because they live in different overlays and the contextually-
/// open overlay decides which one fires.
pub struct Bindings {
    map: HashMap<Action, Vec<KeyCode>>,
}

impl Bindings {
    /// Vanilla keyboard layout. Tweak here to retune defaults; the
    /// pause-menu Keybindings entry will eventually let the player
    /// override per-action without recompiling.
    pub fn default_keyboard() -> Self {
        use Action::*;
        let mut m: HashMap<Action, Vec<KeyCode>> = HashMap::new();
        // Movement / navigation share keys. WASD and numpad both
        // mirror the arrow keys so roguelike + first-person muscle
        // memory both work.
        m.insert(Up,    vec![KeyCode::Up,    KeyCode::W, KeyCode::Kp8]);
        m.insert(Down,  vec![KeyCode::Down,  KeyCode::S, KeyCode::Kp2]);
        m.insert(Left,  vec![KeyCode::Left,  KeyCode::A, KeyCode::Kp4]);
        m.insert(Right, vec![KeyCode::Right, KeyCode::D, KeyCode::Kp6]);
        // Turn-spending. Period + Space + Kp5 all rest in place;
        // Space is a comfortable thumb key on a standard keyboard
        // and Kp5 matches the roguelike numpad-rest convention.
        m.insert(Wait,             vec![KeyCode::Period, KeyCode::Space, KeyCode::Kp5]);
        m.insert(Interact,         vec![KeyCode::E]);
        m.insert(Kick,             vec![KeyCode::K]);
        // Z was the Combat-Stims (Security signature) key; moved to
        // X so Z can carry the more frequently-used SwapWeapon
        // action for all classes. Stims still gate on player class
        // at the use site.
        m.insert(SignatureAbility, vec![KeyCode::X]);
        m.insert(SwapWeapon,       vec![KeyCode::Z]);
        // Keyboard-aimed combat. F enters fire mode for ranged
        // weapons; T enters throw mode for the assigned Throwable.
        // Both keys do double duty — F is also `Focus` inside the
        // crafting screen, T is `TakeAll` inside the loot screen.
        // Those overlays gate their handlers behind their own
        // `show_*` flags, so the same physical key drives different
        // actions in different contexts without collision.
        m.insert(FireAim,          vec![KeyCode::F]);
        m.insert(ThrowAim,         vec![KeyCode::T]);
        m.insert(CycleTarget,      vec![KeyCode::Tab]);
        // UI toggles.
        m.insert(ToggleInventory,  vec![KeyCode::I]);
        m.insert(ToggleEquipment,  vec![KeyCode::Tab]);
        m.insert(ToggleCrafting,   vec![KeyCode::C]);
        // Menu primitives.
        m.insert(Confirm,          vec![KeyCode::Enter]);
        m.insert(Cancel,           vec![KeyCode::Escape]);
        // In-overlay actions.
        m.insert(Use,              vec![KeyCode::U]);
        m.insert(Equip,            vec![KeyCode::Q]);
        m.insert(Ready,            vec![KeyCode::R]);
        m.insert(TakeAll,          vec![KeyCode::R, KeyCode::T]);
        m.insert(Reroll,           vec![KeyCode::R, KeyCode::Space]);
        m.insert(Focus,            vec![KeyCode::F]);
        // Text entry.
        m.insert(DeleteChar,       vec![KeyCode::Backspace]);
        Self { map: m }
    }

    /// Keys currently bound to `action`. Empty slice if nothing's
    /// bound — actions without bindings are silently inactive
    /// rather than panicking, so a future "unbind" path doesn't
    /// have to guard against missing keys at every call site.
    pub fn keys(&self, action: Action) -> &[KeyCode] {
        self.map.get(&action).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// True if any key bound to `action` was pressed *this frame*
    /// (rising edge). The standard "did the player just hit the
    /// button" check.
    pub fn pressed(&self, action: Action) -> bool {
        self.keys(action).iter().any(|&k| is_key_pressed(k))
    }

    /// True if any key bound to `action` is currently held down.
    /// Doesn't account for the input-suppression list; for
    /// gameplay-movement gating use [`down_active`] instead.
    pub fn down(&self, action: Action) -> bool {
        self.keys(action).iter().any(|&k| is_key_down(k))
    }

    /// Held-state with suppression. A key in `suppressed` is treated
    /// as if it weren't held — used by the "released-since-overlay-
    /// closed" gate so a movement key still down from before an
    /// overlay closed doesn't immediately trigger movement.
    pub fn down_active(&self, action: Action, suppressed: &[KeyCode]) -> bool {
        self.keys(action).iter()
            .any(|&k| is_key_down(k) && !suppressed.contains(&k))
    }

    /// Every distinct key bound to any of the four cardinal
    /// movement actions. Used by the overlay-close path to latch
    /// movement keys into the suppression list so a held key
    /// doesn't bleed into a step the moment a menu closes.
    pub fn movement_keys(&self) -> Vec<KeyCode> {
        let mut out = Vec::new();
        for a in [Action::Up, Action::Down, Action::Left, Action::Right] {
            for &k in self.keys(a) {
                if !out.contains(&k) { out.push(k); }
            }
        }
        out
    }
}

/// Did the player press a number-row digit key for index `idx`
/// (0 = `1`, 1 = `2`, ..., 8 = `9`)? Used by the inventory's
/// category-collapse hotkeys. Same role as [`letter_pressed`] but
/// for the digit row.
pub fn digit_pressed(idx: usize) -> bool {
    const KEYS: [KeyCode; 9] = [
        KeyCode::Key1, KeyCode::Key2, KeyCode::Key3,
        KeyCode::Key4, KeyCode::Key5, KeyCode::Key6,
        KeyCode::Key7, KeyCode::Key8, KeyCode::Key9,
    ];
    KEYS.get(idx).is_some_and(|&kc| is_key_pressed(kc))
}

/// Did the player press the inventory-letter key for index `idx`
/// (0 = `a`, 1 = `b`, ..., 25 = `z`)? Routes through `is_key_pressed`
/// the same way action lookups do, so the rest of the code never
/// types `KeyCode::A` etc. directly.
pub fn letter_pressed(idx: usize) -> bool {
    const KEYS: [KeyCode; 26] = [
        KeyCode::A, KeyCode::B, KeyCode::C, KeyCode::D, KeyCode::E,
        KeyCode::F, KeyCode::G, KeyCode::H, KeyCode::I, KeyCode::J,
        KeyCode::K, KeyCode::L, KeyCode::M, KeyCode::N, KeyCode::O,
        KeyCode::P, KeyCode::Q, KeyCode::R, KeyCode::S, KeyCode::T,
        KeyCode::U, KeyCode::V, KeyCode::W, KeyCode::X, KeyCode::Y,
        KeyCode::Z,
    ];
    KEYS.get(idx).is_some_and(|&kc| is_key_pressed(kc))
}

/// Resolve a one-shot cardinal direction press from any of the
/// movement actions. Returns the unit vector for the first action
/// whose key was pressed this frame, or `None` if no direction key
/// fired. Used by the multi-direction interact prompt — the player
/// taps a direction, we resolve it once, and dismiss.
pub fn direction_pressed(bindings: &Bindings) -> Option<(i32, i32)> {
    if bindings.pressed(Action::Up)    { return Some((0, -1)); }
    if bindings.pressed(Action::Down)  { return Some((0,  1)); }
    if bindings.pressed(Action::Left)  { return Some((-1, 0)); }
    if bindings.pressed(Action::Right) { return Some(( 1, 0)); }
    None
}

/// Like [`direction_pressed`] but also accepts the wait keys
/// (`.` / Space / Kp5) as `(0, 0)` — "this tile". Used by the
/// interact-direction prompt to let the player select a prop they
/// share a tile with (e.g. a crate they're standing on) when
/// adjacent interactables would otherwise win the prompt.
pub fn direction_or_self_pressed(bindings: &Bindings) -> Option<(i32, i32)> {
    if let Some(d) = direction_pressed(bindings) { return Some(d); }
    if bindings.pressed(Action::Wait) { return Some((0, 0)); }
    None
}
