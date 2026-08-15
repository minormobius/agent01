# sci — sci.mino.mobi (proposed; NOT YET A SURFACE)

Scientific instruments, taken apart. One page per instrument, each a detailed
technical explainer built around **games, graphics and diagrams that show the
real mechanism** — not analogies that fall apart when you push on them.

First target: **`/mri`**.

> **Status: research only.** This directory currently contains a literature
> scan and nothing else. There is no `wrangler.jsonc`, no deploy workflow, no
> registry entry, and no page. Nothing here deploys. See *Wiring* below for
> what remains, and do not assume any of it has been done.

## The rule this wing runs on

Borrowed from [`neuro/`](../neuro/CLAUDE.md), which requires every resident
model to be checked against a published number from its own paper. Here:

**Every mechanism claim on a page traces to a primary source, and the source is
on the page.** If the only justification for a picture is that it is the
picture everyone draws, it does not ship. The MRI page exists precisely because
the usual pictures ("radio waves go in, radio waves come out") are wrong.

## Research

| File | What |
|---|---|
| [`research/mri-sources.md`](research/mri-sources.md) | canonical literature for `/mri` — ~50 sources across eleven sections, each annotated with what it gives the page, and with verification status recorded per entry |

The short version of the finding that prompted the page: **the sensor is a
tuned coil of wire.** An LC resonator picking up a Faraday-induced EMF from the
precessing magnetisation, in the near field — no radiation involved. It has no
spatial resolution at all; every bit of position information comes from the
gradients. Its dominant noise source is the patient's own body. Full treatment,
with citations, in §0 of the research file.

## Wiring — what it takes to make this a real surface

Per the repo's *Adding a surface* checklist in [`../CLAUDE.md`](../CLAUDE.md).
None of this is done.

1. **`sci.mino.mobi` does not resolve.** Checked 2026-08-15: `ENOTFOUND`, no A
   record. So this is a *new* hostname, not a takeover — the DNS record and the
   custom-domain attach are dashboard work
   ([`../docs/DEPLOYS.md`](../docs/DEPLOYS.md) §7) and cannot be done from a
   sandbox. Establish the owning worker before writing `wrangler.jsonc`, or the
   golden rule bites: a green deploy that updates a stray `workers.dev` worker
   and changes nothing live.
2. `sci/wrangler.jsonc` — `name` = the worker that owns the domain,
   `routes: [{ pattern: "sci.mino.mobi", custom_domain: true }]`.
3. `.github/workflows/deploy-sci.yml` — copy the closest static-worker deploy
   (Tier 2; no build step is wanted here — this should stay hand-written HTML
   plus inline SVG/canvas, per [`../docs/NO-BUILD.md`](../docs/NO-BUILD.md)).
4. `deploy-registry.json` → `surfaces[]`: `dir`, `endpoint`, `type: frontend`,
   `branch`, `paths`. The branch is the deploy trigger; add it here, never to
   the YAML.
5. `index.html` `var P` entry + curated `<li>`, and a family in
   `spec/curated.js`.
6. `node scripts/preflight.mjs --fix`, then rewrite this file properly.
7. Push, and confirm the run log binds `sci.mino.mobi (custom domain)`.

## Shape, once it exists

```
sci/
  index.html          the landing page — the instrument index
  mri/index.html      the first breakdown
  research/           source scans, one per instrument (not served content)
```

Interactives should reuse [`packages/dataviz/`](../packages/dataviz/) rather
than reimplementing charts, and any Bloch-equation integration belongs in a
small shared module once a second page needs it — not before.
