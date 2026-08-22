# ken — ken.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs, now HAND-OWNED — edit directly.
     Repo-wide rules live in ../CLAUDE.md; the surface index is
     ../docs/SURFACES.md. -->

The study programme behind `loop` and `plant`, given its own surface: **the
measurement of unattended work, treated as a field.** Two standing documents —
a curriculum and a protocol — in journal dress.

## Facts

| | |
|---|---|
| Surface | `ken` |
| Dir | `ken/` |
| Endpoint | `ken.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/repo-study-fields-0ftd34` |
| Deploy | `.github/workflows/deploy-ken.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "ken"`.

## ⚠ The domain is not attached yet

`curl -sI https://ken.mino.mobi` returned **502** at the time this surface was
written — the hostname does not resolve to a worker. Attaching a custom domain
is **dashboard-only** ([`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §7).

**Attach `ken.mino.mobi` to worker `ken` before the first deploy.** If you
don't, the golden rule bites in its most annoying form: `wrangler deploy` runs
green, publishes to a stray `ken.workers.dev`, and the site never appears. The
deploy workflow's verify step says as much when it fails, but the log is the
proof — look for `ken.mino.mobi (custom domain)` in the wrangler output.

## Layout

| Path | What |
|---|---|
| `index.html` | masthead, aims and scope, and the editorial on the pilot run |
| `syllabus.html` | **Article I** — the six-unit curriculum. Served at `/syllabus`. |
| `protocol.html` | **Article II** — the Stage 1 registered-report skeleton. Served at `/protocol`. |
| `refs.js` | **the bibliography, as data** — 54 real works, keyed |
| `cite.js` | numbers citations in document order, renders the reference list |
| `journal.css` | the shared journal typography; prints to real Letter pages |
| `worker.js` | thin assets worker; maps `/syllabus` and `/protocol` to their `.html` |
| `ken.selftest.mjs` | the gate — **run it before touching anything here** |

`CLAUDE.md` and `ken.selftest.mjs` are `.assetsignore`d; everything else ships.

## The one rule for this surface

**Every work cited here is real, and every citation is machine-checked.**

Pages never hand-number citations. They write `<a class="cite"
data-ref="holmstrom1991"></a>` and leave an empty `<ol id="reflist">`; `cite.js`
numbers in document order and renders the list. Add a work to `refs.js`, cite it
by key, and the numbering takes care of itself.

```bash
node ken/ken.selftest.mjs     # ~1s, 407 checks
```

It asserts, across every page: every `data-ref` resolves; every entry in
`refs.js` is cited at least once (an uncited entry is dead weight, and usually a
sign a section was cut); every entry carries author, year, title and venue; no
duplicate keys; and every citing page loads both modules and has a `#reflist`.

**And then the check that actually matters.** The prose makes numerical claims
about the pilot run — 99 work orders, 89 recorded turns, 17 gate failures, 59 of
89 at the probe ceiling, **0 quality scores**, 1 of 3 signals ever fired. The
selftest recomputes every one of those from `.github/loop/turns.jsonl` and
`runs.jsonl` and fails if the prose has drifted from the ledger. If someone
re-enables the loop and runs more turns, **this surface goes red until the
editorial is rewritten**, which is the correct behaviour and the reason the
check exists.

`scripts/preflight.mjs` picks the selftest up automatically for changed dirs.

## Why it looks like a journal, and why that is not a joke

The register is borrowed from [`wormhole`](../wormhole/), which generates entire
fabricated literatures — plausible papers, plausible citations, plausible fields,
all invented, all deterministic from a seed. The two surfaces are a **matched
pair and should stay legible as one**: same paper-sheet-on-viewer-ground idiom,
same print-to-Letter behaviour, same booktabs tables.

The difference is the point. `wormhole` demonstrates how cheaply the apparatus
of scholarship can be counterfeited. `ken` therefore has to be able to *prove*
it is not counterfeit, and a machine-checked bibliography is the only form of
that proof worth anything. If you ever find yourself wanting to add a citation
you have not read, add it to `wormhole` instead — that is what it is for.

## What is deliberately unfinished

`protocol.html` publishes **six named blanks** (§4, B1–B6) rather than filling
them: a defined construct, an estimated reliability, a calibrated judge, a
powered sample size, a stopping rule, and an outside signal. Each is the
deliverable of a curriculum unit, and the protocol is not registrable until all
six close.

**Do not fill a blank with a plausible number.** Closing one means the unit was
done and the quantity was measured; anything else re-creates the exact failure
this surface exists to document. When a blank does close, update §4's table,
add the figure, and note the date.

## Things worth knowing before editing

- **The unit order in the syllabus is load-bearing.** Unit IV's shrinkage factor
  *is* Unit I's reliability — the same algebra from two ends — and Unit VI's
  results are anecdotes without Unit V's Bradley–Terry machinery. Reordering
  breaks the argument, not just the pacing.
- **The editorial's caveat paragraph is not padding.** The faint downward drift
  in `probes` and the near-doubling of gate failures are *not* evidence quality
  declined; the first is not significant and the second is confounded with task
  difficulty. Any rewrite that quietly upgrades those into findings is exactly
  the error the surface is about.
- **`worker.js` exists only for the two clean URLs.** If you add a third
  article, add it to the `clean` map or it will 404 without its `.html`.
- The stylesheet commits to a light paper sheet on a dark viewer ground, like
  its sibling. That is deliberate — a journal is paper — so don't bolt on a dark
  mode without deciding the pair should diverge.

## Deploying

Pushes to `claude/repo-study-fields-0ftd34` that touch `ken/**` trigger
[`.github/workflows/deploy-ken.yml`](../.github/workflows/deploy-ken.yml), which
runs the selftest as a gate and then `wrangler deploy`. The sandbox cannot reach
Cloudflare — **push to the trigger branch, don't `wrangler deploy` locally.**
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, and see the domain warning at
the top of this file.
