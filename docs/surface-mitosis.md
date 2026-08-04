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
`scripts/surface-mitosis.mjs`, the mover is **`scripts/rehome.mjs`**, and the
registry is the source of truth for the result.

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
| **Anaphase** | physically separate, **one daughter at a time, verify each deploy**: new `wrangler.jsonc` + `deploy-<daughter>.yml`, cross-links rewritten, parent `paths:` carved so the parent stops shipping the moved members. `scripts/rehome.mjs` does the mechanical half — see below |
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

---

## The mover — `scripts/rehome.mjs`

The detector stops at the diagnosis. This is the execution, and it is generic
because the shape of the job never changes, only the nouns.

```bash
node scripts/rehome.mjs <path…>                      # what is this tangled in?
node scripts/rehome.mjs <path…> --to <surface>       # plan the move
node scripts/rehome.mjs <path…> --to <surface> --apply
```

| Flag | For |
|---|---|
| `--into <subdir>` | land under `<dest>/<subdir>` rather than at its root |
| `--keep <path>` | shared with the parent: do not drag it along |
| `--url <path>` | the public path it was served at, for finding addresses in the wild |
| `--stub <url>` | leave a forwarding page where an `index.html` used to be |

**It plans by default and writes nothing without `--apply`,** because the two
outputs worth having are things you want to read *before* anything happens.

### The closure — what has to travel

Follow the relative imports out of what you named and you get the set that
actually has to move. This is the **cleavage plane made concrete**: if the
closure keeps widening until it is most of the surface, there is no plane, and
the answer is refactor rather than move. Better to learn that before the
`git mv` than after.

### The inbound edge — what points back

Three kinds, handled three different ways, because they deserve it:

* **Imports** are retargeted. A relative specifier is a computable statement
  about two paths, in both directions — a file that travels has to re-reach
  what stayed, and a file that stayed has to re-reach what travelled.
* **Files both sides want** are detected and named, without being asked. A file
  in the move set that something outside it still imports is shared by
  definition; moving it makes the parent import across a surface boundary,
  which no build here can satisfy. Those are `--keep` candidates, and the fix is
  vendoring (`scripts/sync-dataviz.mjs`), not moving.
* **URLs are reported, never rewritten.** `/sleuth` is a substring of somebody's
  prose. The first version of the matcher was a plain `includes` and returned 77
  hits, most of them `/threads/list` in an unrelated worker — a list that gets
  skimmed is the same as no list, so the path now has to be followed by
  something that ends it.

### What it refuses to do

Choosing the destination, inventing an endpoint (`curl -sI` it first — see the
repo `CLAUDE.md`, *Adding a surface*), writing a new surface's `wrangler.jsonc`,
and deciding that a bundled React route can be a page. It names each one under
**needs a human** instead of guessing. Run `node scripts/preflight.mjs --fix`
after applying and read the diff.

`scripts/rehome.selftest.mjs` covers the specifier arithmetic in all four
directions, the URL boundary rule against the exact false positives that
motivated it, path ownership (the root surface claims everything, so it must
lose to every other), and the forwarding stub's `canonical`/`og:`/`noindex`.
