# cell — Minimal Cell Twin (`cell.mino.mobi`)

A digital twin of a minimal cell, built as nested layers. **Every layer stays live**: the
landing (`index.html`) links one page per stage, and a new stage is a new directory, never a
rewrite of an old one. The landing's onion diagram and stage list are hand-written; update
both when a stage ships.

| Path | What |
|---|---|
| `index.html` | landing: the vision, the onion SVG, the stage list (live / next / planned / research) |
| `assets/cell.css` | shared tokens and components for the landing and stage 2+ (stage 1 predates it and keeps its own inline styles) |
| `stage1/` | Gillespie direct method, 27 reactions over 13 species (6 genes: transcription, mRNA decay, translation, dilution; a Hill repressor; α+β ⇌ αβ). The sim runs in a blob Web Worker; p5.js draws one dot per protein. Well-mixed: positions are a decorative random walk. |
| `stage2/` | `sim.js`: 2D Brownian dynamics with Doi-model reactions (nm, µs). Transporters import S; E1: S→I; E2: I→P; I leaks at the membrane with probability `leak`; P is exported. Two cells with identical counts and rates, scattered vs clustered enzymes. `index.html` draws both with p5 and charts rolling yield. |
| `stage2/sim.selftest.mjs` | mass balance, determinism, leak=0, and clustered yield > scattered + 8 points. Runs in the deploy workflow before `wrangler deploy`. |

## Quirks

- `stage2/sim.js` is a **classic worker script** that also exports via `module.exports`; the
  selftest loads it in a `vm` sandbox. Keep it dependency-free and keep both entry points.
- p5.js 1.9.4 comes from cdnjs. Everything else is local.
- Stage 2 performance: ~0.8 ms of compute per µs of cell time for both cells at defaults
  (~1000 metabolites each). The worker time-boxes each frame to 14 ms, so "max" speed is
  whatever the machine manages; the page shows the real rate.
- Parameters are illustrative and stated on each page. Don't present them as fitted to an
  organism until stage 3 actually loads JCVI-syn3A data.

## Deploy

Plain route `cell.mino.mobi/*` (no custom-domain slot). Worker `cell`, owned by
`claude/cellular-digital-twin-research-o8k3vb`. `deploy-cell.yml`: selftest →
`route-dns.mjs --apply` → `wrangler deploy` → fails unless the host serves "Minimal Cell Twin".
`.assetsignore` keeps this file, the selftests and the wrangler install out of the upload.
