# cards — cards.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Wiki Cards. A deep Wikipedia card game—Lucky, Transmute, Nexus, and Library modes built on neural embeddings.

## Facts

| | |
|---|---|
| Surface | `cards` |
| Dir | `cards/` |
| Endpoint | `cards.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-page-merge-candidate-8sp0fv` |
| Deploy | `.github/workflows/deploy-cards.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "cards"`.

## Deploying

Pushes to `claude/landing-page-merge-candidate-8sp0fv` (the registry owner since 2026-09-23; `main` deploys nothing) that touch this surface's paths trigger [`.github/workflows/deploy-cards.yml`](../.github/workflows/deploy-cards.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.

## Polity Spiral (`polity/`)

`cards.mino.mobi/polity/` — every elected American officeholder since 1789 as one
WebGL2 point cloud. **One dot = one officeholder in one two-year cycle** (a cycle is
a Congress: 1789, 1791, …). Hover/tap a dot for its Wikipedia summary; click opens the
article (Wikidata when there is no enwiki article).

| File | |
|---|---|
| `polity/index.html` | markup + CSS, no build |
| `polity/polity.js` | the viewer: layouts (spiral, 3D state helix, timeline, chambers, tile map), WebGL2 renderer, GPU picking into a 1-px scissor, tooltip + Wikipedia REST summaries, URL-hash state |
| `polity/data/polity.json` | **generated** — columnar terms + people + party families |
| `polity/build/` | the pipeline that makes it (node + python3, needs network) |

Rebuild the data:

```bash
cd cards/polity/build
python3 congress.py        # unitedstates/congress-legislators → raw/congress.json (House+Senate, complete)
node wikidata.mjs          # Wikidata P39 holders of every position in positions.json (cached in raw/; --force refetches, ~15 min)
node build.mjs             # → ../data/polity.json, prints party-family counts and unmapped labels
```

`raw/` is gitignored. Coverage facts worth knowing before reading the picture:

- **Congress is complete** (congress-legislators). Presidents, VPs, governors and the
  50 state legislatures come from **Wikidata**, so they are exactly as complete as
  Wikidata is: state legislatures are patchy, especially before ~1950, and many
  members carry no party ("Party not recorded", drawn dark grey).
- Wikidata statements with no dates fall back to their electoral-term qualifier
  (`P2937`): its dates, or the year range in its label ("1975–1976 Massachusetts
  legislature"). Statements with neither are dropped; `build.mjs` prints the count.
- Parties are folded into ~16 **families** in `build.mjs` (`FAM`), ordered left→right
  for the pie/hemicycle sort. Unmapped labels land in "Independent & other"; the build
  prints the top ones — extend the regexes rather than hand-editing data.
- To add a body (local offices, say): add positions to `build/positions.json` with a
  new body code, then a lane in `LANES` in `polity.js`.
