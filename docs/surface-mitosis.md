# Surface mitosis — when and how a deploy surface divides

A *surface* is a unit of deployment: one directory (or coherent set), one
endpoint, one owning branch in `deploy-registry.json`. The deploy invariant is
**one surface → one branch** (a branch may own many; a surface owned by two
branches, or any wildcard, is forbidden).

Surfaces grow. A growing surface eventually can't be held by one branch without
contention — two people want to work different parts, the dir becomes a junk
drawer, the deploy ships unrelated things together. At that point the surface
should **divide**, the way a cell does: along a clean cleavage plane, into two
daughters that can each live alone, each getting its own branch. This restores
the invariant's health (one surface, one branch, low contention).

There are two complementary operations. The detector is
`scripts/surface-mitosis.mjs`; the registry is the source of truth for the
result.

---

## Operation 1 — Mitosis (an over-grown surface divides)

### When (the signals the detector measures)

| Signal | Meaning | Threshold |
|--------|---------|-----------|
| **members** | independent sub-units (immediate subdirs holding a page) | ≥ 8 → syncytium |
| **code mass** | bytes of code (assets excluded — committed PNG/wasm/fonts don't count) | ≥ 250 KB |
| **files** | raw file count | ≥ 25 (with ≥2 members) |
| **biggest file** | largest single-file LOC | > 2500 → see "not mitosis" |

A surface is a **division candidate** when it is massive/many-membered **and**
divisible (≥ 2 members, so a cleavage plane exists).

### Syncytium vs. organ — the load-bearing distinction

Size alone does not justify division. What matters is **coupling between
members**:

- **Syncytium** — many independent nuclei, little shared cytoplasm. Members are
  self-contained (each its own subdir, sharing at most a thin `lib/`). These
  divide freely. *Example: `clock` — 23 canvas toys, each standalone.*
- **Organ** — specialized cells around a shared structure. Members depend on a
  common core or feed a cross-cutting integration layer. Dividing kills the
  thing. Tag these `"cohesion": "integrated"` in the registry and the detector
  spares them. *Examples: `read` (every tale feeds the Pendragon cross-hub;
  shared per-tale renderers) and `rite` (nine sub-apps over one shared
  `rite/lib/atproto/` pipeline).*

So: **divide a syncytium, refactor an organ, never amputate an organ.**

### Not mitosis

- **A monster file** (one file > 2500 LOC, e.g. `cards/js/pools/pool.js`) is a
  *refactor* smell, not a division — splitting the surface won't help. The
  detector flags it separately (`⟳ REFACTOR`).
- **Asset bloat** (`read` at 300+ MB of storybook PNGs) is not mass — the
  detector counts code bytes only.

---

## Operation 2 — Encapsulation (scattered cells get a membrane)

The inverse problem: coherent functionality scattered as free-floating
top-level dirs under the root assets worker, with no membrane of its own. These
aren't too big — they're *unbounded*, sharing the root surface's single branch.
Draw a membrane around a coherent group: give it a name, an endpoint, a branch.

*Examples:* the **geometry pack** (the `geometry/` hub + ~10 explainer dirs
`erdos, hadwiger, viazovska…` + `elements/`, today defined only by the hub's
outbound `mino.mobi/<x>/` links) → one `geometry` surface. The **canvas games**
(`draw, curve, paint, mmo`) → one `canvas` surface.

**Caveat:** scattered members often cross-link by *absolute* URL
(`https://mino.mobi/erdos/`). Encapsulating onto a new subdomain breaks those
links unless you (a) keep them on the root domain via Worker routes, or
(b) rewrite the links. Decide per group during anaphase.

---

## The phases (this is the staged execution — "verify each")

| Phase | What happens |
|-------|--------------|
| **Interphase** | healthy single surface; one branch; grows normally |
| **Prophase** | detector trips a threshold; identify the cleavage plane (which members → which daughter). Rebucket the detector's size-balanced guess **thematically** — balance is a starting point, theme is the real seam |
| **Metaphase** | daughters lined up in `deploy-registry.json`: each gets a name, dir(s)/paths, endpoint, owning branch (`status: needs-workflow`) |
| **Anaphase** | physically separate, **one daughter at a time, verify each deploy**: new `wrangler.jsonc` + `deploy-<daughter>.yml`, cross-links rewritten, parent `paths:` carved so the parent stops shipping the moved members |
| **Telophase** | two independent surfaces, each its own branch; `lint-deploy-registry.mjs` green; parent retired or slimmed to a hub |

---

## Current candidates (from the detector)

- **`clock`** — syncytium, 23 members, ~1.1 MB code. **Divide.** Cleavage plane
  is thematic (proposed families: the `*pac` maze/topology set —
  `pac, inpac, knotpac, torpac, toruschess`; the sim set — `mol, mole, emsim`;
  the spatial/optics set — `globe, helix, ship, scape, scope, lattice, …`; the
  organic set — `garden, syllis, corn, hand`). *Note:* `clock/fluoddity/`
  duplicates the top-level `fluoddity` surface — reconcile during the split.
- **`geometry` pack** — encapsulate (Operation 2).
- **`canvas`** (`draw/curve/paint/mmo`) — encapsulate (Operation 2).
- **`fluoddity`, `splice`** — soft candidates: heavy with a few members. Read
  the coupling before dividing; may be organs.
- **`cards`** — not a split: refactor `js/pools/pool.js` (5278 LOC).
- **`read`, `rite`** — organs. Do **not** divide.
