# cell — Minimal Cell Twin (`cell.mino.mobi`)

A digital twin of a minimal cell, built as nested layers. **Every layer stays live**: the
landing (`index.html`) links one page per stage, and a new stage is a new directory, never a
rewrite of an old one. The landing's onion diagram and stage list are hand-written; update
both when a stage ships.

| Path | What |
|---|---|
| `index.html` | landing: the vision, the onion SVG, the stage list (live / next / planned / research) |
| `assets/cell.css` | shared tokens and components for the landing and every stage |
| `stage1/` | `sim.js` (Web Worker): Gillespie direct method, 27 reactions over 13 species (6 genes: transcription, mRNA decay, translation, dilution; a Hill repressor; α+β ⇌ αβ). `index.html`: the four-event explainer, the cell (p5, one dot per protein, labels, click-a-gene focus with live rate card), and the activity timeline: one bar per mRNA, one tick per protein translated from it. Well-mixed: positions are decorative, and a translation is credited to a uniformly chosen live mRNA of that gene (statistically exact). |
| `stage2/` | `sim.js`: 2D Brownian dynamics with Doi-model reactions (nm, µs). Transporters import S; E1: S→I; E2: I→P; I leaks at the membrane with probability `leak`; P is exported. Two cells with identical counts and rates, scattered vs clustered enzymes. `index.html`: pathway diagram, both cells in p5, the molecule tracer (tags the next imported S; the tag passes through each enzyme to its fate, narrated per cell), rolling yield, and the enzyme timeline (one row per enzyme, bars while busy, from exact capture intervals the worker reports). |
| `stage2/sim.selftest.mjs` | mass balance, determinism, leak=0, clustered yield > scattered + 8 points, and the tracer reaching import → capture → export/leak. Runs in the deploy workflow before `wrangler deploy`. |

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
