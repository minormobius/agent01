# tetro — a tetromino sandbox (guest piece)

Live at **https://fable.mino.mobi/tetro/**

An interactive tetromino sandbox: place, clone, rotate, flip, and *clumpify* blocks on a
board that tracks adjacency dependencies between pieces. Keyboard controls: `Q` clone, `Z`
delete, `R` / `Shift+R` rotate, `G` clumpify, `WASD` pan.

## Why it lives apart from the wings

The eight fable wings share one thesis — *games no one wrote*, each artifact rolled from a
seed and **certified by the oracle that made it**. This is the opposite: a **human-authored**
Claude artifact contributed by a friend. It is hosted in the fable cabinet as a **guest**, and
is intentionally *not* listed among the oracle-certified wings or in the worker's `wings[]`
health array (it appears under `guests[]` instead).

## Build (no toolchain at runtime)

The artifact is a single React component (`game.src.jsx`, one `react` import, default export
`TetrominoGame`, Tailwind utility classes, no other deps). It is pre-transpiled to a global
IIFE so production ships **no in-browser compiler**:

```bash
# react / react-dom resolve to window globals (UMD), classic JSX runtime
esbuild wrap.jsx --bundle --format=iife \
  --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment \
  --alias:react=./shim-react.js --alias:react-dom/client=./shim-reactdom.js \
  --minify --define:process.env.NODE_ENV='"production"' --outfile=game.js
```

`wrap.jsx` imports the component and exposes `window.__mountClump(el)`; `index.html` loads
React 18 + Tailwind from CDN, then calls it. To regenerate after editing `game.src.jsx`, redo
the bundle step and commit `game.js`.

## Files

| File | Role |
|------|------|
| `index.html` | Standalone page: CDN React + Tailwind, mounts the bundle |
| `game.js` | Pre-transpiled, minified IIFE (registers `window.__mountClump`) |
| `game.src.jsx` | Original artifact source, kept for provenance / rebuilds |
