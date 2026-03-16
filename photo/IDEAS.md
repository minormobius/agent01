# ATPhoto — Ideas

Future feature ideas for the image explorer. These apply broadly to full-repo operations, not just images.

## Logged Ideas

- **Alt text analytics** — What percentage of images have alt text? Average length? Accessibility metric nobody surfaces. Could be a stats bar or standalone view.

- **Posting calendar** — GitHub contribution-graph heatmap of image posting frequency from `createdAt`. Shows streaks, gaps, seasonal patterns.

- **Multi-user comparison** — Side-by-side or blended view of synced users. Interleaved timelines, comparative stats (images/month, alt text rate, median likes).

- **SQL console** — Collapsible query box for raw DuckDB SQL against the records table. LABGLASS-lite for photos.

- **Export** — Download filtered results as ZIP, CSV of metadata, or static HTML gallery. "Make me a portfolio page from my top 50."

- **"This day" view** — Anniversary browser. What did this account post on this date in previous years? Pure `createdAt` filtering.

## Next Project Directions

These ideas leverage the core stack (CAR download → WASM parse → DuckDB) for entirely new tools:

- **Repo X-Ray** — Full breakdown by collection. Record counts, storage, custom lexicon discovery.
- **Feed Lab** — SQL-defined feed algorithms tested against real downloaded repo data.
- **Repo Diff** — Snapshot and diff repos over time. Wayback Machine for ATProto.
- **Conversation Cartography** — Reply/quote-post tree reconstruction and discourse topology visualization.
- **Lexicon Census** — Scan repos to discover non-standard record types across the network.
