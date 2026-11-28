# judgment — judge.mino.mobi (plain route)

<!-- HAND-OWNED. Instruction set for THIS surface. Repo-wide rules live in
     ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

**The dir is `judgment/`, not `judge/`.** `judge/` is an older, unrelated Bluesky
posting-profile tool bundled into the root at `mino.mobi/judge/`. Don't confuse them.

A research programme and curriculum: *The Economics and Cultivation of Judgment in the
Agentic Age*. The topic is sustainable leverage: scaling what agents produce without losing
meaningful agency over it, and cultivating the judgment that responsibility demands.

## Facts

| | |
|---|---|
| Surface | `judgment` |
| Dir | `judgment/` |
| Endpoint | `judge.mino.mobi` (plain route, no custom-domain slot) |
| Worker | `judgment` (assets only, no script, no bindings) |
| Deploy | `.github/workflows/deploy-judgment.yml`, on push to the owning branch in `deploy-registry.json` |
| Family | reading |

## Pages

| Path | What | Source |
|---|---|---|
| `/` | hub: thesis, abstract, the eleven branches | `index.html` (hand-written) |
| `/sources/` | the annotated bibliography, filterable | **generated** from `sources/library.json` |
| `/sources/library.csv`, `.bib` | the same list as a spreadsheet and as BibTeX | **generated** |
| `/sources/library.json` | the source of truth, also public | hand-edited |

## Editing the sources

1. Edit `sources/library.json`. Each work has `rank`, `tier` (S/A/B/C), `branch`, `authors`,
   `title`, `year`, `relevance`, `links[]` (`{url, kind: full|publisher|catalog, label}`),
   `status` (verified|corrected|unverified|not_found) and `note`.
2. `node judgment/sources/build.mjs` rewrites `index.html`, `library.csv` and `library.bib`.
   `--check` exits 1 if they are stale.
3. Never hand-edit the three outputs.

Link kinds are a promise to the reader:

- `full` is a **legal** free full text: author or institution copies, open access, public
  domain (Wikisource, Gutenberg, New Advent, Econlib, psychclassics).
- `publisher` is a DOI or the publisher's page.
- `catalog` is an Open Library record, used for in-copyright books.

Never link pirate mirrors. Open Library and some DOIs answer bots with a challenge page
or a 403. Verify those through their APIs (`openlibrary.org/works/<id>.json`,
`api.crossref.org/works/<doi>`), not with a plain curl.

## Accessibility (the brief)

- The page is complete without JavaScript. Every entry is in the static HTML. JS only adds
  the filter form and the "I've read this" ticks, and both stay `hidden` until the script
  runs.
- No meaning rides on colour alone. Link kinds are spelled out in the link text, and every
  link carries the work title for screen readers.
- Results are announced through a `role=status` region. Touch targets are at least 44px.
- Dark mode, `prefers-contrast`, `prefers-reduced-motion`, and a print stylesheet that
  prints the URLs.
- Read ticks live only in `localStorage` (`judge.sources.read`), wrapped in try/catch.
