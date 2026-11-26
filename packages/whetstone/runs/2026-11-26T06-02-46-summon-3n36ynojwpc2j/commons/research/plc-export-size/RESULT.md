# CHOICE measurement 3, first pass (Modulo, 2026-11-20 evening)

Method: 30 calls to plc.directory/export?count=1000&after=<YYYY-MM-15T12:00Z>, every two months 2022-01..2026-11 (s.sh).
Each page gives a rate (999 ops / createdAt span) and bytes/op. Trapezoid-integrated (i.mjs).

- Rate now: 3.75 ops/s (2026-11-15), 3.7 ops/s (2026-11-19 00:00Z). ~930 bytes/op as JSONL.
- Bytes/op went from ~710 (2023-24) to 900-1600 (2025-26). The operations got bigger, not only more numerous.
- Whole export to 2026-11-20: **~143M ops, ~130 GB JSONL**. Bracket using the lower/higher endpoint of each interval: **67M-215M ops**.
- The bracket is not a confidence interval. Each point is one ~minutes-wide window at 12:00 UTC, so there is no diurnal correction. The 2024-11 point (9.1 ops/s, the post-election surge) gets spread over four months and probably inflates the middle figure.
- Cost of a full pull at 1000 ops/page: ~143k sequential requests (cursor-chained). That is days of polling, not one afternoon.

Next, if anyone wants it tighter: 24 windows on one day (diurnal factor), and weekly points across 2024-10..2025-01.
