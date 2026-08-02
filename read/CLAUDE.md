# read — read.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Adaptive speed reader for Project Gutenberg texts and poetry. Bionic formatting, memorize mode, and eye-tracking pacing.

## Facts

| | |
|---|---|
| Surface | `read` |
| Dir | `read/` |
| Endpoint | `read.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/portrait-artist-mythograph-pi5umf` |
| Deploy | `.github/workflows/deploy-read.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "read"`.

## Read — the deep-read apparatus

**Live at**: `read.mino.mobi/<tale>/` and `read.mino.mobi/pendragon/`
**Stack**: Pure static HTML/JS (vanilla, no build step) + Cloudflare Workers for assets
**Deploy**: `.github/workflows/deploy-read.yml` — a push to the owning branch (`claude/portrait-artist-mythograph-pi5umf`) touching `read/**` deploys automatically. `main` does not deploy anything; see the repo-root `CLAUDE.md`.

A family of deep-reading sub-sites for medieval tales — currently Welsh and Middle English. Nine annotated tales (`gawain/`, `culhwch/`, `orfeo/`, `pwyll/`, `branwen/`, `manawydan/`, `math/`, `owain/`, `vitamerlini/`) and a comparative hub (`pendragon/`). The pattern is intentionally rigid: each annotated tale carries the same seven layers and exposes the same shape of data, so the cross-tale layer at Pendragon can read across all of them without coupling.

**There is now also a modernist branch: `portrait/`.** It is the same apparatus with four of the seven layers replaced, because they do not survive contact with a novel. It does not plug into Pendragon (Joyce is not Arthurian) and it does not use the illustration pipeline. Read [its own section below](#the-modernist-branch--portrait) before assuming anything about it from the medieval tales.

## The seven-layer apparatus (per tale)

Every annotated tale has its own sub-directory at `read/<slug>/` with these files. New tales follow the same skeleton.

| File | Role | What it contains |
|---|---|---|
| `index.html` | The reader's frame | Topbar nav (one tab per layer: Read, Storybook, Characters, Character web, Story graph, Motifs, Mythograph), `<section>` per view, footer with manuscript provenance + crossref to `/pendragon/` |
| `styles.css` | Shared visual language | Earthy palette, `--gold`, `--gold-soft`, `--ink`, serif body / sans nav. The four annotated tales share styling conventions; minor variations OK. |
| `tale.js` | Layer 1 + 2: source text + translation | `window.<TALE> = { tale: { meta, sources, roadmap, passages: [...] } }`. Each passage has `title`, `segments[]`, each segment has `w` (Welsh / source), `e` (English), optional `n` (footnote). |
| `characters.js` | Layer 3: cast cards + web | `window.<TALE>.characters = { intro, roles: [{id,label,color}], cast: [{id,name,role,blurb,appears:[1..N],rel:[{to,label}]}] }`. The Character web view force-lays this graph; principals get larger nodes. |
| `analysis.js` | Layer 4: Propp story graph | `window.<TALE>.propp = { intro, acts: [{id,label,color}], moves: [{sym,name,act,passage,gloss,realized}], absent: {note, groups, verdict} }`. |
| `motifs.js` | Layer 5: motif index | `window.<TALE>.motifs = { intro, taletypes: [...], classes, classOrder, list: [{code,name,cls,conf,gloss,passages}] }`. `conf` ∈ {high, med, spec} → well-attested / interpretive / speculative. |
| `storybook.js` | Layer 7: paged retelling | `window.<TALE>.book = { meta: {kicker, note}, spreads: [{title, sub?, text, illus}] }`. `illus` is a free-text art brief for the illustration pipeline. |
| `app.js` | The renderer | View-switching, parallel-text renderer, character grid, character web (Fruchterman-Reingold), Propp spine + cards, motif rows, mythograph (force sim with movement spine), storybook (paged spreads with dropcap, prev/next, image plate). Layer 6 (Mythograph) is computed from layers 1–5 in `buildMythograph()`. |
| `img/spread-NN.png` | Storybook artwork | Generated and committed by the illustration workflow (see below). Never hand-committed. |

The `window.<TALE>` global namespace lets each tale's files load independently. `<TALE>` matches the tale slug uppercased: `window.GAWAIN`, `window.CULHWCH`, `window.ORFEO`, `window.PWYLL`.

## The illustration pipeline (data-driven, one registry)

| File | Role |
|---|---|
| `scripts/illustrate/tales.mjs` | The registry. One entry per tale: `{ bookGlobal, storyFile, imgDir, house, pins, triggers }`. `pins` is a dictionary of character/setting descriptions; `triggers` is `[[regex, key], …]` matched against the spread's `illus` brief — every regex match contributes its pin to the final prompt. |
| `scripts/illustrate.mjs` | The runner. CLI: `--tale <slug> --spreads "missing"\|"all"\|"0,5,12" --quality low\|medium\|high --model gpt-image-1\|dall-e-3 --dry --list`. PNG existence is the idempotency sentinel: re-running is a no-op once every spread is on disk. Falls back from gpt-image-1 to dall-e-3 if the org isn't verified. |
| `.github/workflows/illustrate.yml` | Matrix over every registered tale. Auto-fires when any `read/*/storybook.js`, the runner, the registry, or this workflow changes (and on `workflow_dispatch`). Each matrix leg generates only that tale's missing spreads, commits them, self-deploys `read/`. The push step pull-rebases on contention because sibling legs may push concurrently. |

Adding a new tale to the illustration pipeline is one new entry in `tales.mjs` and one new slug in the matrix `tale: [...]` list. No new script, no new workflow.

## The Pendragon comparative hub (`read/pendragon/`)

The cross-tale comparative layer. Pure-data reader over each tale's annotation files plus its own historiography content.

| File | Role |
|---|---|
| `data.js` | Timeline (40 entries), in-world chronology, evolutionary tree edges, wiki entries, fae sections, papers list. |
| `crosswalk.js` | The four-tales-side-by-side data: which Propp functions and Thompson motifs each tale realises. Add a fifth tale by extending the per-row columns here. |
| `app.js` | Renders Method, Timeline, In-world, Constantine III theory, Evolutionary tree (SVG phylogeny), Wiki (search + cat filters), Fae, Papers, plus the home-page crosswalk. |

The Method page (`#method`) is the documentation of this whole apparatus — read it before adding a new tale or refactoring the per-tale layers. It also explains the vision for why each layer is shaped the way it is. **If you change the per-tale apparatus shape, update the Method page to match.**

## The modernist branch — `portrait/`

`read/portrait/` is *A Portrait of the Artist as a Young Man* (Joyce, 1916) under this
surface's apparatus. It exists because the folklorists' instruments turn out to be
load-bearing in a way that is invisible until you point them at a novel: **four of the
seven layers return nothing at all.** What replaced them, and why:

| Medieval layer | Fails because | Modernist replacement |
|---|---|---|
| source + translation | the book is in English | **voice attribution** — the facing column names *whose idiom the narration is wearing*, per Kenner's Uncle Charles Principle (`tale.js`, field `e`) |
| Propp's 31 functions | Propp is a morphology of *events* and the novel has almost none | **Genette's `Narrative Discourse` (1972)** — order, duration, frequency, mood, voice (`analysis.js` → `window.PORTRAIT.discourse`) |
| Thompson Motif-Index | a Thompson motif is meaningful because it is *shared*; a leitmotif because it is *local*. There is nothing to look up | **measured lexicons** (`motifs.js` + `stylometry.js`) |
| oral type-scene | no formulaic scenes | **the epiphany**, Joyce's own unit, plus Kenner's chapter-join ladder (`analysis.js` → `epiphanies`) |
| Greimas actants | bends but mis-describes: no Object that is a thing, no Opponent who is a person | kept, **plus Girard's mediator** (`analysis.js` → `desire.mediator`) |
| cast / web / mythograph | — | carried over unchanged; the mythograph gains a `register` node type |

And one layer the medieval tales cannot have: **the style curve**. In an oral tale the
style is a constant by design, so measuring it tells you nothing. In *Portrait* the style
is the plot.

### Rules for `portrait/`

- **`stylometry.js` is generated. Never hand-edit it.** `node read/portrait/measure/measure.mjs --write`
  rebuilds it; the same command without `--write` fails if it is stale. Every number on the
  Style curve and every density in the Leitmotif index comes from there.
- **Movement boundaries are anchored by opening phrase, not by offset.** The Gutenberg
  plain text does not preserve the printed section breaks, so `ANCHORS` in `measure.mjs`
  locates each of the nineteen movements by searching for its first words (whitespace-
  insensitive, uniqueness-checked). If Gutenberg re-releases #4217 the script throws
  rather than silently measuring the wrong spans.
- **Quotations in `tale.js` were extracted mechanically, not retyped** — the Read layer and
  the Style curve must be looking at the same spans for the epiphany-ladder argument to hold.
  If you add a segment, pull it from `source/portrait-gutenberg-4217.txt`.
- **Choose a lexicon before you look at its counts, and print it on the page.** The
  `flight` list originally contained `air`, which supplied 85 of its 174 hits on its own
  (mostly "the evening air" and "an air" meaning a tune). It was dropped and the reason is
  recorded in `measure.mjs`. Every list is rendered with per-term counts so a reader can
  discount it.
- **No storybook, and it is not in the illustration pipeline.** A middle-grade illustrated
  retelling of *Portrait* would be a category error, and `portrait` is deliberately absent
  from `scripts/illustrate/tales.mjs` and from `illustrate.yml`'s matrix. Adding a
  `read/portrait/storybook.js` would make the workflow fire; don't.
- **It does not appear in Pendragon's crosswalk.** `crosswalk.js` compares Propp coverage
  and Thompson motifs across the Arthurian/Brittonic corpus, and Portrait realises neither.
  The comparative claims it *can* make are cross-referenced inline in `motifs.js` (`cross:`).
- **The Method page (`#method`) is the argument.** It records what broke, what replaced it,
  and — importantly — what the apparatus cannot do (it cannot detect irony, and this is a
  book made of irony). Update it if you change a layer.

Adding a second modernist text: copy `portrait/`, put a public-domain source in `source/`,
re-anchor `measure.mjs`, and write the voice column *first* — it is the layer that tells
you what the other layers are for.

## Conventions and pitfalls

- **Branch naming.** Read work has historically lived on `claude/arthurian-legend-history-*` (the medieval tales) or `claude/eye-tracking-exploration-*` (older work), and most recently on `claude/alchemist-garden-sources-9JYpE`. **The surface is now owned by `claude/portrait-artist-mythograph-pi5umf`** — one surface, exactly one owning branch, and the registry is the authority. Don't hand-edit `deploy-read.yml`'s `branches:` list; change `deploy-registry.json` and run `node scripts/gen-deploy-triggers.mjs --write`.
- **The drop-cap regex.** `app.js`'s `dropCap` is `/^((?:<[^>]+>)*\s*[“"'(]?\s*)(\S)/` — the `(?:<[^>]+>)*` prefix is **load-bearing**: it skips over leading `<em>` / `<strong>` tags so the drop-cap lands on the first letter, not the `<`. The earlier version (without the tag-skip) silently corrupts any spread whose text begins with markup. Sister tales (`gawain`, `culhwch`, `orfeo`) currently have the older regex; they happen not to trigger the bug because none of their spreads start with `<em>`. Bring them into line if you touch their `app.js`.
- **No PNGs by hand.** Storybook images come from the illustration pipeline. Pushing a `read/<slug>/storybook.js` change with new spreads (or deleting a PNG) causes the workflow to generate the missing image(s). Don't commit hand-drawn or manually downloaded PNGs into `img/` unless you also delete them from the workflow's purview.
- **Edit `tale.js` movement by movement.** Each commit per movement deploys; each push gives you a live URL to proof against. Resist the urge to dump all of a translation in one commit — the proofing loop is part of the quality.
- **Cross-tale references.** When you add a motif to `motifs.js`, check whether it appears in sister tales and add a `cross` note pointing at them (search existing motifs for `cross:` to see the pattern). The motif index is the spine of cross-tale comparison.
- **Mythograph is computed.** Don't add a separate `mythograph.js` data file — the Mythograph view is built from `tale.js` + `characters.js` + `analysis.js` + `motifs.js` in `buildMythograph()` inside `app.js`. If a node type is missing, add it to those source files, not to a new data file.
- **`window.PENDRAGON.crosswalk` is the only data file at `/pendragon/` that needs touching when a tale is added.** Add the tale's motif and Propp coverage rows; the SVG layout falls out of the data.

## Adding a fifth tale — the canonical recipe

1. Pick a tale; find a CC-BY-SA or public-domain reading text in the original. Document the manuscript line.
2. `cp -r read/pwyll/ read/<newslug>/` (Pwyll is the most recent, follows the current conventions). Then strip the data files to skeletons.
3. Translate movement by movement. Each commit deploys; review on the live URL.
4. Write `characters.js`, then `analysis.js`, then `motifs.js`. The Mythograph view picks them up for free.
5. Write `storybook.js` — spreads with `illus` art briefs.
6. Register the new tale in `scripts/illustrate/tales.mjs` (`bookGlobal`, paths, house style, pins, regex triggers). Add the slug to `.github/workflows/illustrate.yml`'s matrix.
7. Add a `<a class="tale-card">` to `read/pendragon/index.html` home, extend `read/pendragon/crosswalk.js` with the new column. The Method page's "How to add a fifth tale" section is the user-facing version of this list — update it too.

## Required secrets

- `OPENAI_API_KEY` — for the illustration pipeline (Workers Action secret).
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — for `deploy-read.yml` and the self-deploy step in `illustrate.yml`.

## Cost notes

- Image generation: gpt-image-1 medium quality ≈ $0.04 / spread; a 31-spread tale ≈ $1.25 total, one-time. Re-running with no new spreads costs nothing (the missing-PNG sentinel exits early).
- Hosting: well under Cloudflare free tier.

---


## Deploying

Pushes to `claude/portrait-artist-mythograph-pi5umf` that touch this surface's paths trigger [`.github/workflows/deploy-read.yml`](../.github/workflows/deploy-read.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
