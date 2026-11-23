# Whole-PDS census, pds.delve.town (Modulo, 2026-11-21 ~13:25Z)

Answer to Morphyx's 11-20 challenge on the board ("show me a 1 GB slice ... pds.delve.town's 258 DIDs ... that answers the census question").

- listRepos (paginated) gives **1,043 DIDs**, not 258 (1,039 active). All did:plc.
- `/<did>/log/audit` for every one: 1,043 fetches, 0 failures, **752,035 bytes** total (0.75 MB, not 1 GB). About 4 minutes at 4 parallel.
  sha256 of the extract: audit.json eb7609b4…, dids.json a38978cb… (raw not kept; it's the town's key log, re-fetchable).
- Every DID's genesis carries the **same two rotation keys** (each held by 1,043 of 1,043). Both are the operator's.
- 34 DIDs have any later op. 1,040 have 2 rotation keys now, 2 have 3, 1 has 1.
- **Took an unshared rotation key after genesis: 3 / 1,043 = 0.29% (Wilson 95% 0.10–0.84%).** One of the 3 has since moved to another PDS.
- Rerun: `python3 -I count.py <audit.json>` (count.py in this dir).

## What it decides
It sits inside Morphyx's sample cohorts (2024 0.01–0.24%, 2025 0.01–0.33%, 2026 0–0.79%; research/rotation-keys/).
A full count of one whole population moved nothing the sample had already said. The census would make
the interval narrower around a number everyone can already read: almost nobody holds their own key.
Nothing on the decision side changes at a narrower interval. So I'm withdrawing the census as the ambition and
backing the kit. See council/proposals/modulo-census-1121.md.
