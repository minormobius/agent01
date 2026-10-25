# CHOICE research piece 1: who holds the rotation keys? (Morphyx, 2026-10-07, first desk)

Asked for by the person on 2026-10-07 ("finish that measurement yourself"). Charter wording: the fraction of DIDs that hold a
rotation key their PDS operator doesn't hold, by month since 2022, with binomial intervals.

## What the log can and can't say

The PLC log records **keys, never who holds them**. So the charter question can't be read off it directly. What it does show
is **sharing**. A multi-user PDS signs every genesis it makes with its own rotation key, so that key turns up in many DIDs.
A key held by one person, or minted for one DID, turns up in one.

- **shared key**: held by 2 or more distinct DIDs in any op we fetched (key-dids.json gives the count for every key our sample holds).
- **operator-made**: the genesis op includes a shared key.
- **self-minted**: no shared key at genesis. That means a self-hoster, or a bulk minting run.
- **took a key**: an operator-made DID whose *current* rotation keys include an unshared key that wasn't in its genesis. This
  is the user-held recovery key the charter meant.

## Sample (seeded, re-drawable)

`node shelf/rk-sample.mjs research/rotation-keys 50 4 20261007` (needs the net)
- For each month from 2022-11 to 2026-09, 4 start times drawn with mulberry32(20261007). For each start, one
  `/export?count=1000&after=<t>` page. From each page we take the first 50 genesis ops created in that month.
- For each pick we fetch `/<did>/log/audit`. The current state is the last non-nullified op. Legacy `create` ops are
  normalised to [recoveryKey, signingKey].
- That gives 8,992 DIDs and 9,180 fetches in all, on 2026-10-07 around 20:05Z. 2022-11, 2022-12, 2023-01 and 2023-03 have
  fewer than 200 picks, because their pages overlap and hold fewer creations.
- **Archive:** we keep compact extracts, not raw bytes. 9k audit logs are megabytes. That's the fallback CHOICE names.
  - `sample-YYYY-MM.json`: each row is the DID, created, keys at genesis and now, endpoint, op and nullified counts,
    the times keys changed, plus the fetch time, sha256 and byte count of its raw audit log.
  - `manifest.jsonl`: every export page, with its URL, time, sha256 and bytes.
  - `key-dids.json`: for each key our sample holds, how many distinct DIDs held it across all the fetched pages and logs.

## Figure (net off)

`node shelf/rk-figure.mjs research/rotation-keys research/rotation-keys/figure.svg` prints the monthly table and the yearly
cohorts, and draws figure.svg.

| creation cohort | operator-made DIDs that took a key | 95% Wilson |
|---|---|---|
| 2022 (Nov–Dec) | 4 / 78 | 2.0–12.5% |
| 2023 | 11 / 2,314 | 0.27–0.85% |
| 2024 | 1 / 2,388 | 0.01–0.24% |
| 2025 | 1 / 1,732 | 0.01–0.33% |
| 2026 (to Sep) | 0 / 481 | 0–0.79% |

**Self-minted** DIDs: 0 before 2024-05. Then a few a month, which looks like self-hosters. **From 2025-04, 10–90% of each
month's sample.** 2026-04 to 2026-09 runs at 66–89%. Two hosts account for most of them:
- 464 point at `*.bsky.network`, with two per-DID P-256 keys. Bluesky's PDS signs with secp256k1, so Bluesky didn't make
  these. They carry filler handles (e.g. clarissa_magnam.bsky.social) and alsoKnownAs stuffed with ~400-char random strings.
- 1,503 point at `pds.trump.com`, which doesn't resolve. Each has four per-DID P-256 keys and impersonating handles.

## Limits (read before quoting)

- **The sample is clustered.** It's 4 runs of 50 consecutive genesis ops, and minting comes in bursts. So the Wilson
  intervals are too narrow, most of all for the self-minted share. Treat it as ordinal: none, a few, most.
- A user who reuses one recovery key across two of their own DIDs counts as "shared". A PDS that gives each account its own
  key counts as "self-minted" or "took a key". We found neither among operator-made DIDs, but a small PDS could do either.
- Tombstones: 0 in the sample. Deleted Bluesky accounts mostly don't tombstone their PLC entry.
- "Spam" is our reading of the handles and alsoKnownAs. 4 /data checks were done by hand and not archived. It isn't a computed figure.

## Second desk wanted

The two-desk rule (CHOICE) applies. Before the reply carrying these numbers gets a yes, another part re-runs
rk-figure.mjs with the net off, checks the table above against its output, and spot-checks a few DIDs on plc.directory.

## Correction after second and third desk (2026-10-07)

"Took a key" as defined above (17 / 6,993) is **wrong as a recovery-key count**. 16 of the 17 left Bluesky's PDS and lost every
genesis key (Mozzie). Reading the *order* of current rotationKeys (Modulo, verified live for 4 DIDs by Morphyx):
- 11 hold a per-DID key **ranked above** a shared host key (eurosky u,S,S ×7; blacksky u,S ×2; northsky u,S; bsky mmyj7mk7 u,S,S).
  Hosts' own natives in the sample hold only S keys. This is the recovery-key pattern: **11 / 6,993, about 1 in 640.**
  9 added it in the migration op, 1 (tft77e5q) three days later, 1 without moving. 10 of 11 added it in 2026.
- 6 are self-hosted (dholms, quimian, robocracy, commonscomputer, shreyanjain, numergent): the user is the operator; excluded.
- The figure's bottom panel and the cohort table use the old definition and group by creation month, which hides when keys
  were added. Don't quote them; a redrawn figure is still to come. Self-minted share: quote "2026-04 to 2026-09, 66–89%", not "most since 2025-04".

## Town census, 2026-10-09 (town-2026-10-09.jsonl)

Every repo on pds.delve.town (sync.listRepos, 261 repos, 258 active), each looked up at
plc.directory/<did>/data around 13:27Z. Each line keeps the URL, fetch time, HTTP status (all 200),
byte count, sha256 of the body, and rotationKeys. Recount it with code; don't trust this paragraph.

- 260 of 261 have the same two rotation keys, zQ3shwMx… and zQ3shgJU…, which are also on our own bot's DID.
- The 1 that differs, did:plc:ulokgboxyrskgvjsbhuyvuma, is deactivated on the PDS.
- So all 258 active accounts: 258 of 258. The "18 of 19" from 10-07 was a sample, and it was never archived.
  The 19 are not reconstructable from what we kept.
- Not shown here: that those two keys are held by the PDS operator. That's an inference from 260 identical pairs, not a reading.
