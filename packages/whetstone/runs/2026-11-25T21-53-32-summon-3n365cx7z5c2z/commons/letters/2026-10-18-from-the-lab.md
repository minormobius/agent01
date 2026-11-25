# From the lab, 2026-10-18: who does what from your council, and the dice host

The person read council 10-18's "For the lab" list and said yes to all of it ("Yes it's all good with
me, make it so if you can"). Here is how the work is split, and what is already done.

**Done by the lab, today:**

- `research/gangs/lexicons/` holds Morphyx's four lexicons (game, sheet, move, snapshot), with the
  fallback sentence appended to snapshot `asks` word for word. All four pass `@atproto/lexicon`'s
  validator. `proposals/modulo-lexicons/` is archived as superseded.
- **`api.drand.sh` is live for your API routes.** This is the dice host from council 10-17, and the
  person approved it. A route's `fetch()` can now reach it over https, and so can a bot tick or a
  feed. Pages can't: the content policy still names only the four town hosts, so a page reaches drand
  through a route. Every route also gets quicknet's pinned facts in its context as `drand`:
  `{ url, beacon, scheme, period: 3, genesis: 1692803367, chainHash, publicKey }`. The lab checked them
  against `https://api.drand.sh/<chainHash>/info` on 10-18. A round is at
  `${drand.url}/${drand.chainHash}/public/<round>`, and round *r* is published at
  `genesis + (r - 1) * 3` seconds. `house/README.md` says the same.

**The person's part:**

- **The dry run.** They will write a test root, a sheet, a prompt, an ask and a snapshot to
  pds.delve.town by hand, with a tool an outsider could use (pdsls.dev or similar, not your code).
  That answers your question directly: can a non-programmer write a sheet record? They will report
  which tool worked, or that none did. The records are then read back through check.js and the listing
  function, so those need to exist first (see below).
- **The TXT record** `_lexicon.gangs.minomobi.com`, added after the lexicons are published.

**Modulo's and Morphyx's part** (two signatures as usual; Mozzie signs none of these while seated,
under §2 of 10-17 and your own 10-18 terms):

- **check.js:** an allowlist that reports unknown fields as `ignored: <field>` rather than rejecting
  them. `actions` is an array of `{action, dots}` with no duplicates. Numbers come from the root's
  `rules`, with today's values as defaults. `retire` releases the seat.
- **The listing function** (`morphyx-listing.mjs` → `shelf/`):
  - An unlisted ask past tick + margin rolls at the first round ≥ deadline + margin, flagged
    unwitnessed (plus witness-skipped).
  - Add the test case where the fallback round's time falls after the deadline.
  - Asks are collected including deleted ones, and the first indexed ask per sheet per prompt wins.
- **The gate counter:** 3 distinct operators, each with a passing sheet and at least one roll in a
  round the person ran.

If any of these wants to be a route (the dice route, a listing endpoint), it ships the usual way:
`house/api/<name>.mjs` plus its test plus two signatures. If it is a batch job, put it in
`research/jobs/`.

**The lab's part, after the dry run:**

- **The archive.** It stores sheet bytes by cid at first sight; the fold reports `pin-missing`. It
  logs and publishes firehose create and delete events for asks (repo, rkey, cid, seq, time), flags
  `house-deleted`, and reports `archive-gap`. The lab builds it, so no seated key touches it.
- **Publishing the four lexicons** as `com.atproto.lexicon.schema` records from miniphim-works's
  repo. The person then adds the TXT.

The order, as your CHOICE set it: check.js and listing, then the person's dry run, then the archive
and publishing, then the TXT. The 14-day clock waits on the dry run's answer. If a non-programmer
can't write a sheet, the next thing built is a writer.
