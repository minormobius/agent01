# BRIEF — meta-todo

## This turn (2026-07-31, second turn)

Request: "add a max priority list item explaining that whoever comes along to
handle the todo items should set up instructions for all future agents to use
the general template as the base for their work and another high priority
list item for adding the pondertag to all existing pages."

Shipped: a `priority` field on every `ITEMS` entry (`max` / `high` / `normal`),
a sort in `render()` that floats `max` then `high` to the top while keeping
localStorage's done-map keyed to each item's *original* array index (not
display position, which now moves), and two new entries with no `site` field
since they're about the repo/process rather than one tenant's BRIEF:

- **max** — the standing-instruction gap `general-template/BRIEF.md` already
  named: point root `CLAUDE.md`'s "Adding a surface" checklist at the
  template. Text is explicit that this build agent can't make that edit
  itself (content gate walls the diff to this directory), so the item reads
  as "needs a human or a root-CLAUDE.md-scoped agent," not as a task this
  site can close by itself.
- **high** — add the `.pondertag` div (general-template's own convention) to
  the ~50 tenant sites that predate or skipped the template. Also flagged as
  something no single turn can finish at once, same gate reason.

Both link their `source` line to `general-template/`'s BRIEF.md or
index.html rather than a tenant BRIEF, since that's where the actual
definitions of "the template" and "the pondertag" live.

## What this is

The request was short and unusual for this tenant slot: not a user-facing
site, but "an internal document, a to-do list for internal agents at mobi
labs to keep track of planned refactors &c." No reference link, no further
detail.

The catch, which shaped everything else here: a lab tenant has no shared
backend. The only persistence a build agent has across turns is what's
committed to the repo, and the only persistence a *visitor* has is their own
ATProto repo (`com.minomobi.lab.doc`) — built for one person's save data, not
a board every future build agent reads and writes. Build agents also don't
browse pages at all; they read files (`CLAUDE.md`, `BRIEF.md`) directly. So a
literal "shared live to-do app for agents" is not buildable here — there is
no mechanism for one agent's checkbox to be visible to the next agent's file
read.

What shipped instead: a single static page that surfaces the "next turn"
items already sitting, unread by anyone but the next lucky agent, inside
other tenants' own `BRIEF.md` files — `mathematical-knot`, `wiremesh-solid`,
`arch-brainstorm`, `tube-stacker`, `read-this`. Each item links to its site
and its source `BRIEF.md`. It's an index into work that already exists in
the repo, not a new source of truth.

## Decisions

- **Rejected**: a "shared" board via `com.minomobi.lab.doc`. That collection
  lives in the *visitor's* repo, keyed by whoever signs in — there is no
  query that reads "everyone's" records, so it can't back a board multiple
  agents see the same copy of. Using it here would have looked functional
  and been silently per-person, which is worse than admitting the limit.
- **Rejected**: a JS "add item" box. Without shared storage it can only write
  to the visitor's own localStorage, which no other agent or visitor will
  ever see. Adding that control would imply the board is editable in a way
  it isn't. Real items get added by editing the `ITEMS` array in `index.html`
  by hand, in a commit — same as everything else about this tenant.
- **Kept**: per-browser checkboxes (localStorage only), explicitly labelled
  as local-only in both the on-page footer and the checkbox's `aria-label`.
  Useful for a human triaging the list without pretending to be a shared
  state store.
- Only pulled from 5 of the ~49 `BRIEF.md` files in `lab/www/` (grepped for
  "next turn"/"not yet"/etc., then hand-read the plan section of each match I
  had time for) — not all 36 files that matched the grep. Picked for spread
  across categories (math viz, 3D, two games, image processing) rather than
  completeness.

## The plan (next turn, in order)

1. **Read more BRIEF.md plan sections and extend ITEMS.** ~31 more tenant
   BRIEFs matched the "unfinished work" grep and were never opened
   (`work-together`, `which-song`, `which-one`, `which-enumerates`,
   `where-role`, `where-list`, `webpage-that`, `want-pairwise`,
   `tutelary-where`, `turn-venn`, `train-game`, `that-visualizes`,
   `static-demonstrating`, `site`, `same-thing`, `possible-enable`,
   `ping-user`, `ode-sonnet`, `hiiii-demo`, `gibson-jackpot`,
   `generate-some`, `fake-doordash`, `duolingo-but`, `croissanthology-why`,
   `create-vizualization`, `create-space`, `and-fuel`, `actually-let`, and a
   few more — rerun the grep in `lab/www/**/BRIEF.md` for
   `not built|next turn|left undone|would try next|not implemented|not yet`
   to reproduce the candidate list). Some will turn out already resolved by
   a later turn; drop those, don't just append blindly.
2. **Add a "last verified" date per item**, not just a build-wide one — right
   now staleness is only disclosed at the page level, but individual items
   will go stale at different rates as sites get worked on.
3. **Consider a coarser "repo-level" section** separate from per-site items —
   things like "D1 migration numbering has collided twice" or "OAuth scope
   allowlist needs a new collection" that live in root `docs/` rather than
   any one tenant's BRIEF. I didn't have time this turn to read
   `docs/DEPLOYS.md`/`docs/NO-BUILD.md` closely enough to pull real examples
   rather than guess at them, and a guessed item here would be worse than an
   absent one.

## Gotchas

- The page links straight to `../<site>/BRIEF.md`, which the root worker
  serves as raw text (whole repo root is `assets.directory: "."`) — it'll
  render as an unstyled text file in the browser, not markdown. That's fine
  for "source," not worth building a renderer for.
- Nothing here needed `kit.handleInput` or `kit.bskyGet` — this page has no
  Bluesky identity in it at all, which is unusual for this kit but correct
  for the ask: it's a document, not a tool that resolves handles.
