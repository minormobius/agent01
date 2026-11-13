# kith — community detection over a Bluesky crowd

`mino.mobi/kith/` — served by the **root** surface (no worker of its own; root's
`paths` include `kith/**`). Sibling to `cluster/`, whose publish confirmation
links here with `?list=<at-uri>`.

## What it is

Input is a Bluesky list (`?list=at://…` or a pasted bsky.app list link) or a
handle (`?u=`, which offers that account's curate lists, or all its mutuals).
It reads every member's follow records and partitions the crowd into
communities, then measures each one and shows how it splits at finer resolution.

`cluster` answers "who is the tightest group" (max clique + shells); kith answers
"what groups are there". cluster's silver is just the biggest clique once gold's
core is removed, so in a merged network gold and silver shells coincide (133 +
120 people for 193 distinct, 2026-11-13). That observation is why kith exists.

## Files

| file | holds |
|---|---|
| `community.js` | **all the maths, pure.** Louvain with resolution γ, connected-component split (the Leiden guarantee), multi-seed consensus (best Q, ARI agreement, per-person stability), degree-preserving rewired null, per-community density / lift / cohesion / conductance / k-core / clustering, Guimerà–Amaral roles, Brandes betweenness, the γ sweep with lineage, a deterministic force layout |
| `kith.selftest.mjs` | gates it: Zachary karate (Q 0.4198, 4 communities, betweenness 0.4376, transitivity 0.2557), a planted partition (ARI > 0.95), an Erdős–Rényi graph whose Q must sit at its null, rewiring preserves degrees, hand-computed Q/conductance/participation |
| `worker.js` | runs community.js off the main thread (≈6 s analysis + 2 s layout at 1,300 people) |
| `app.js` | input, crawl, and the four views: map, matrix, community cards, sweep; people table |
| `lib/graph.js` | **a copy of `b/lib/graph.js`** (listRecords, not getFollows: faster and ~12% more complete; see `b/CLAUDE.md` § knot). Only the IndexedDB name differs. Re-copy deliberately |

## Rules that matter

- **Never report Q without the null.** Louvain finds "communities" in a random
  graph. The verdict is driven by `excessQ = Q − Q_random`, and an ER graph must
  land at excess ≈ 0 (the selftest enforces it).
- **Unread rows are dropped, not kept as isolates.** A tie to an unread account
  is known from one side only. Stopping a crawl early analyses the read subset
  and says so.
- **The list owner is excluded by default.** An ego is tied to everyone and
  blurs every boundary.
- **Colour:** the dataviz reference palette's eight categorical slots in fixed
  order (light and dark steps), a ninth community and beyond is grey "other",
  and every community carries a direct label (C1…) on the map and cards.
  Communities under three people are "loose ends", never a colour.

## Ideas not built

- When ties formed: follow records carry `createdAt`, so the matrix could be
  replayed over time to show whether and when groups merged.
- Publish a community back as a list (cluster's publish code + the list scope
  in `workers/auth`).
