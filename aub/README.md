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

The only source change vs. `aubrika/ecdysium` is one block in `game/Cargo.toml`:

```toml
[target.'cfg(target_arch = "wasm32")'.dependencies]
getrandom = { version = "0.2", features = ["js"] }
```

`rand` pulls in `getrandom`, which won't compile for `wasm32-unknown-unknown`
without its `js` backend. Everything else builds unmodified — assets load
through macroquad's async fetch pipeline (web-native), and CLI args / the
window icon degrade gracefully when absent.

**Known limitation**: save/load (`src/save.rs`) writes JSON to disk via
`std::fs`. In the browser there is no filesystem, so saving is a no-op (errors
are handled, nothing crashes — runs just don't persist across reloads).
Migrating saves to `localStorage`/`quad-storage` is a future nicety, not a
blocker for play.

## Re-syncing from upstream

```bash
# from a scratch dir
curl -sSL https://github.com/aubrika/ecdysium/archive/refs/heads/main.tar.gz | tar xz
rsync -a --delete ecdysium-main/src/   aub/game/src/
rsync -a --delete ecdysium-main/assets/ aub/game/assets/
cp ecdysium-main/Cargo.lock aub/game/Cargo.lock
# then re-apply the getrandom block to aub/game/Cargo.toml (see above)
```

Pushing any change under `aub/**` on the owning branch redeploys.

## Credit

Game by [@aubrika](https://github.com/aubrika). Hand-drawn sprites in the repo
are the author's own (made in Pixelorama). Hosted here with permission.
