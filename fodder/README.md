# fodder &mdash; crowdsource verbosity

Live at `fodder.mino.mobi`. Sibling site to [rite](../rite).

A Tinder-style swipe interface for triaging verbose-sentence candidates that get mined nightly from Project Gutenberg. Swipe right to feed the [rite](https://rite.mino.mobi) drill corpus.

## How it works

```
                                                            (every 6h cron)
  Project Gutenberg  ──>  read.mino.mobi/gutenberg-proxy  ──>  fodder worker
                                                                     │
                                                                     ▼
                                                          extract verbose sentences
                                                          (≥40 words, Flesch < 35)
                                                                     │
                                                                     ▼
                                                          Workers AI Llama 3.1 8B
                                                          generates 3 rewrites:
                                                          literal / idiomatic / alt
                                                                     │
                                                                     ▼
                                                          D1: status='pending'
                                                                     │
                                                                     ▼
                                                          users swipe → /api/vote
                                                                     │
                                                                     ▼
                                                          ≥5 yes & ratio ≥ 0.7
                                                          → status='approved'
                                                                     │
                                                                     ▼
                                                          /api/promoted (JSON export)
                                                                     │
                                                                     ▼
                                                          scripts/sync-fodder-to-rite.mjs
                                                          appends to rite/corpus.json
```

## Files

| File | Purpose |
|------|---------|
| `worker.js` | Routes, voting, mining cron, Llama reference generation |
| `index.html` | Swipe UI (vanilla JS, pointer events, no build step) |
| `wrangler.jsonc` | Worker + ASSETS + AI + D1 + cron |
| `migrations/0001_init.sql` | `fodder_candidates`, `fodder_votes`, `fodder_state` |

## D1 schema

Tables live in the shared `atpolls-db` database alongside poll/feed tables.

- `fodder_candidates` — one row per mined sentence; counters denormalized for cheap reads.
- `fodder_votes` — `(candidate_id, voter_id)` PK prevents double-votes per voter.
- `fodder_state` — tiny KV for the cron's round-robin book cursor.

Apply the migration once before deploying:

```bash
npx wrangler d1 execute atpolls-db --file=fodder/migrations/0001_init.sql --remote
```

## API

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/api/next` | GET | Returns up to 8 unvoted-by-this-voter pending candidates. Voter ID via `X-Voter-Id` header. |
| `/api/vote` | POST | Body `{ id, direction, voter_id }`. Direction is `yes`, `no`, or `skip`. |
| `/api/promoted` | GET | Approved candidates in rite corpus.json shape (for the sync script). |
| `/api/stats` | GET | Pending/approved/rejected counts, total votes, total voters. |
| `/api/admin/mine` | POST | Manual mining trigger. Requires `X-Admin-Key` header matching `ADMIN_KEY` secret. |

## Voter identity

A UUID generated client-side and stored in localStorage. Sent on every request as `X-Voter-Id`. Trivially gameable (clear cookies → fresh voter), but the threshold-based promotion is robust against single bad actors and this is a low-stakes corpus, not an election.

## Promotion rules

A candidate flips to `approved` when **yes ≥ 5** and **yes / (yes + no) ≥ 0.7**.

A candidate flips to `rejected` when **no ≥ 8** and **no / (yes + no) ≥ 0.7**. Rejected candidates stop appearing in `/api/next`.

Adjust the constants at the top of `worker.js` to taste.

## Mining (the cron)

Every 6 hours the worker:

1. Picks the next book from `GUTENBERG_BOOKS` (round-robin via `fodder_state.book_cursor`).
2. Fetches it through `read.mino.mobi/gutenberg-proxy` (which has its own cache layer).
3. Strips Gutenberg header/footer, splits into sentences.
4. Filters to verbose candidates (≥40 words, ≤90 words, Flesch ≤ 35).
5. Asks Llama 3.1 8B for `{literal, idiomatic, alternative}` rewrites in JSON.
6. Inserts up to 5 fresh candidates as `pending`.

Cost on the $5 Workers Paid plan: roughly **220 neurons/day** (5 candidates × 11 neurons × 4 runs). The 10,000-neuron daily allowance covers it about 45× over.

## Cost ceiling, in plain English

- **Mining**: ~220 neurons/day. Free.
- **Voting**: zero AI calls. D1 reads/writes only.
- **Voters**: even at thousands of swipes/day, no neuron cost.

The only way to break the budget is dialing up `MAX_PER_MINING_RUN` or running the cron more frequently. Don't.

## Local dev

```bash
cd fodder
npx wrangler dev
```

The cron does not fire in `wrangler dev`. To exercise the mining path locally, hit `POST /api/admin/mine` with the right `X-Admin-Key` header.

## Deploying

```bash
cd fodder
npx wrangler deploy
```

Custom domain `fodder.mino.mobi` is declared in `wrangler.jsonc`. The first deploy provisions it via Cloudflare's automatic certs, assuming the zone is on your Cloudflare account.

After deploy, set the admin secret:

```bash
npx wrangler secret put ADMIN_KEY
```

## Pulling approvals back into rite

From the repo root:

```bash
node scripts/sync-fodder-to-rite.mjs --dry    # see what would change
node scripts/sync-fodder-to-rite.mjs          # write the additions
git diff rite/corpus.json                     # eyeball the new entries
git add rite/corpus.json && git commit -m "rite: sync N new sentences from fodder"
```

The script is idempotent — re-running adds only newly-approved candidates. Hand-curated rite IDs (`v001`...) and fodder IDs (`f-2833-abc1234`) live in different namespaces, so they never collide.

## What about quality?

The biggest risk is the LLM generating a "rewrite" that drops a key clause. Two safeguards are in place:

1. **`refsLookBroken()`** rejects candidates where any rewrite is shorter than 3 words, equal to the original, or not actually shorter than the original.
2. **The crowd** is the real filter — humans see the verbose sentence + the three rewrites side-by-side and swipe accordingly. A candidate where the rewrites lose meaning gets a no.

If you find the LLM consistently mangling certain styles, tighten the prompt in `generateReferences()` or swap the model.

## Future

- An admin route to inspect/edit candidates before they land in rite.
- Per-reference voting (rate the literal vs. idiomatic separately).
- Optional Claude Haiku path via AI Gateway for higher-quality rewrites at ~$0.001/sentence.
- Sourcing beyond Gutenberg: SEC EDGAR filings (corporate verbosity), Federal Register (bureaucratic), arXiv abstracts (academic).
