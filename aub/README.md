# aub — Ecdysium on the web

**Live at**: `aub.mino.mobi`
**Stack**: Rust + [macroquad](https://macroquad.rs) → WebAssembly, served as static assets by a Cloudflare Worker.
**Deploy**: `.github/workflows/deploy-aub.yml`

[Ecdysium](https://github.com/aubrika/ecdysium) is a turn-based sci-fi horror
roguelike (inspired by Caves of Qud / Infra Arcana). This surface ports it to
the browser: the game compiles to `wasm32-unknown-unknown`, and macroquad's JS
bundle drives it against a full-window canvas. No server, no build step on the
client — just static files on the edge.

## Layout

```
aub/
  wrangler.jsonc        # assets-only worker `aub`, custom domain aub.mino.mobi
  web/
    index.html          # canvas + loader shell
    mq_js_bundle.js     # macroquad's web loader (vendored, pinned)
  game/                 # vendored upstream source (aubrika/ecdysium @ main)
    Cargo.toml          # + getrandom `js` feature for the wasm target
    Cargo.lock
    src/ assets/
  dist/                 # (gitignored) assembled at deploy time
```

The deploy workflow builds `game/` to wasm, then assembles `dist/` from
`web/* + game/assets + ecdysium.wasm` and runs `wrangler deploy`.

## What changed from upstream (and why)

Two small web-build accommodations vs. `aubrika/ecdysium`, both isolated:

1. **getrandom on wasm** (`game/Cargo.toml` + a shim in `game/src/main.rs`).
   `rand` pulls in `getrandom`, which won't compile for
   `wasm32-unknown-unknown` without a backend. We use its **`custom`** backend
   (NOT `js`) and register a tiny xorshift fallback in `main.rs`:

   ```toml
   [target.'cfg(target_arch = "wasm32")'.dependencies]
   getrandom = { version = "0.2", features = ["custom"] }
   ```

   Why not the `js` backend? `js` drags **wasm-bindgen** into the module, and
   macroquad's `mq_js_bundle.js` is a *raw* wasm loader — it can't satisfy
   wasm-bindgen imports, so the module fails to instantiate
   (`Import "__wbindgen_placeholder__"… is not an object`). The game seeds its
   `StdRng` from explicit u64 seeds and never calls `thread_rng`/`OsRng`, so
   getrandom is effectively never hit at runtime; the shim is just a correct,
   dependency-free fallback. After this change the wasm imports **only `env`**
   (macroquad's host functions), which is exactly what the bundle provides.

2. **wasm linker flag** (`game/.cargo/config.toml`): `--import-undefined`, so
   macroquad/miniquad's JS-host symbols are emitted as wasm imports instead of
   erroring at link time on some toolchains.

3. **skip audio fetches on web** (`game/src/audio.rs`): the upstream repo ships
   no sound files, and miniquad's web loader fetches assets serially — so ~30
   missing `load_sound` calls become ~30 sequential 404 round-trips on a cold
   load. On wasm, `AudioBank::load` now returns empty (silent) banks without
   fetching. `play()` is already a no-op for empty banks, so this is pure
   speedup. Remove the `#[cfg(target_arch = "wasm32")]` guard once audio is
   committed upstream.

The browser shell (`web/mq_js_bundle.js`) is macroquad's loader **pinned to the
crate version (v0.4.14)** — not `master`, whose bundle has a strict-mode bug
(`register_plugin is not defined`).

Everything else builds unmodified — assets load through macroquad's async fetch
pipeline (web-native), and CLI args / the window icon degrade gracefully when
absent. A handful of textures (a third-party SciFi tileset, a few creature
sprites) are genuinely absent from the upstream repo; the game draws its own
magenta "missing art" stand-in for those (intentional — they flag art TODOs).

## Saves (web)

Native, `save.rs` writes JSON files under `saves/` via `std::fs`. The browser
has no filesystem, so on wasm the four IO functions in `save.rs`
(`slot_path`, `list_save_slots`, `save_to_path`, `load_from_path`) are
cfg-swapped onto **one `localStorage` slot** (key `ecdysium/save/v1`) — a
single autosave. The in-game Save/Load menus work unchanged and persist across
reloads.

The bridge is a small **miniquad plugin** in `web/index.html` (`aub_storage`)
exposing three `env` imports the wasm calls; it reads/writes the wasm's linear
memory directly (no `sapp-jsutils`, no extra crate). The wasm only ever speaks
`localStorage` — it never touches auth or the network.

### Phase 2 — sync to your ATProto repo (the `hoop` pattern)

A guarded, additive JS layer in `web/index.html` (+ the vendored
`web/auth.js` = `packages/oauth-client/auth.js`) syncs that one `localStorage`
blob ⇄ the player's PDS as a `com.minomobi.ecdysium.save` record (rkey `self`,
lexicon in `lexicons/ecdysium.save.json`), mirroring `hoop`'s `story.save`:

- A "Sign in with Bluesky" overlay (top-right) drives the shared auth worker
  (`auth.mino.mobi`) — SSO, so a session minted on any `*.mino.mobi` site is
  picked up here.
- On login it **pulls** the remote save into `localStorage` when it's newer
  (last-write-wins by `updatedAt` vs a local `mtime` stamp).
- The storage plugin fires `window.__aubOnSave` on every in-game save, which
  **pushes** the blob to the PDS (debounced 1.5 s).
- If `auth.mino.mobi` is down or the player never signs in, nothing changes —
  the game and its `localStorage` saves work exactly as in phase 1.

**Deploy dependency (one-time):** the write needs `com.minomobi.ecdysium.save`
in the consent ceiling. It's been added to `WRITE_COLLECTIONS` in
`workers/auth/src/oauth/scope.ts` (and `aub.mino.mobi` to `ALLOWED_ORIGINS` in
`workers/auth/src/index.ts`), but those live on the **auth surface** — the auth
worker must be redeployed (`deploy-auth.yml`) for the new scope to enter
`UNIFIED_SCOPE`/`METADATA_SCOPE`. Until then, sign-in works but `putRecord` to
the collection is denied (insufficient scope); local saves still persist.
CORS already works via the worker's `*.mino.mobi` wildcard.

## Re-syncing from upstream

```bash
# from a scratch dir
curl -sSL https://github.com/aubrika/ecdysium/archive/refs/heads/main.tar.gz | tar xz
rsync -a --delete ecdysium-main/src/   aub/game/src/
rsync -a --delete ecdysium-main/assets/ aub/game/assets/
cp ecdysium-main/Cargo.lock aub/game/Cargo.lock
# then re-apply, in aub/game/, the three web accommodations above:
#   1. the getrandom `custom` block + main.rs shim
#   2. .cargo/config.toml (--import-undefined)   (untouched by the rsync)
#   3. the wasm audio-skip guard in src/audio.rs
```

Pushing any change under `aub/**` on the owning branch redeploys.

## Credit

Game by [@aubrika](https://github.com/aubrika). Hand-drawn sprites in the repo
are the author's own (made in Pixelorama). Hosted here with permission.
