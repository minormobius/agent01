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
| `lib/activity.js` | each member's replies, quotes, mentions (posts), reposts and likes in a 7–60 day window, from their own repo, newest-first so a window costs only its pages; likes capped at 15 pages/person (reported). Scores reply/quote 3, mention/repost 2, like 1; `convo` keeps only reply/quote/mention |
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

## Tie modes, and what they measured (2026-11-13)

`mutual` · `any` (one-way ½) · `talk` (all interactions) · `convo` (replies,
quotes, mentions) · `talk2` (reciprocated) · `active` (mutual follow ∩
interacted). Interaction weight is log2(1 + a→b + b→a).

On the principal's 182-person "All Clusters" list (built to be interwoven),
excess Q over the rewired null, best first:

| ties | Q vs null | groups | agreement |
|---|---|---|---|
| mutual follows | 0.17 vs 0.07 (+0.10) | 3 | 0.84 |
| active mutuals, 14 d | 0.17 vs 0.09 (+0.08) | 4 | 0.77 |
| two-way, 14 d | 0.16 vs 0.10 (+0.06) | 4 | 0.73 |
| conversation, 30 d | 0.15 vs 0.10 (+0.05) | 4 | 0.69 |
| all interactions, 14 d | 0.10 vs 0.06 (+0.04) | 3 | 0.75 |

**Interactions did not separate it better than follows.** Likes were 51,589 of
61,311 interactions and are spread over everyone; conversation is sparser, so
its own null rises with it. The interaction modes find *different* groups
(more of them, with higher lift), not sharper ones. Do not re-sell them as
the fix for a hairball: the islands map is.

## The map

Two layouts. **Islands** (default): one disc per community, area ∝ size,
ordered round a ring so strongly-linked groups sit together; inside each disc
a golden-angle spiral ranked by internal tie weight (centre = most connected
inside). Faces at ≤ 450 people, ringed in the community colour. **One force
layout** (`?map=ties`): honest about interweaving, unreadable when dense.

## Ideas not built

- When ties formed: follow records carry `createdAt`, so the matrix could be
  replayed over time to show whether and when groups merged.
- Publish a community back as a list (cluster's publish code + the list scope
  in `workers/auth`).
