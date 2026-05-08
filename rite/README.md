# rite — sentence editing drill

Live at `rite.mino.mobi`.

A drill: you're shown a verbose, hard-to-read sentence (Victorian, bureaucratic, academic, legal). You rewrite it to be concise and clear, as fast as possible. You're scored on fidelity, brevity, clarity, and speed.

This directory also hosts **fodder** at `rite.mino.mobi/fodder/` — a Tinder-style swipe interface that crowdsources new sentences into this drill's corpus.

## Architecture

```
Cloudflare Worker (worker.js)
  ├── ASSETS binding → static (index.html, fodder/index.html, corpus.json)
  ├── AI binding     → Workers AI
  │     • @cf/baai/bge-base-en-v1.5     (drill: grading)
  │     • @cf/meta/llama-3.1-8b-instruct (fodder: rewrite generation)
  └── DB binding     → D1 atpolls-db (fodder candidates + votes)

Cron (every 6h): Project Gutenberg → read.mino.mobi/gutenberg-proxy →
                 verbose-sentence harvest → Llama rewrites → D1 'pending'
```

| File | Purpose |
|------|---------|
| `worker.js` | All routes — drill API, fodder API, cron mining handler |
| `index.html` | Drill UI |
| `fodder/index.html` | Swipe UI (vanilla JS, pointer events, no build) |
| `corpus.json` | 45 hand-curated sentences (each with multiple reference rewrites) |
| `migrations/0001_fodder.sql` | D1 schema for `fodder_candidates`, `fodder_votes`, `fodder_state` |
| `wrangler.jsonc` | Worker + ASSETS + AI + D1 + cron |

## Grading (drill)

Score is a weighted combination:

| Component | Weight | How |
|-----------|-------:|-----|
| Fidelity  | 50% | Maximum cosine similarity (BGE embeddings) between the user's edit and any of the reference rewrites. Falls back to Jaccard token overlap if AI is unavailable. |
| Brevity   | 30% | Peaks when user word-count ≈ median reference word-count. Capped near zero if the user didn't shorten the original. |
| Clarity   | 20% | Flesch reading-ease delta vs. the original. |
| Speed     | × multiplier | 1.0 at ≤10 s, decaying to 0.5 at 60 s. |

Final score: `(0.5·fidelity + 0.3·brevity + 0.2·clarity) · speed_bonus · 100`, rounded.

## Fodder pipeline

1. Cron picks the next book in the curated `GUTENBERG_BOOKS` list (round-robin via `fodder_state.book_cursor`).
2. Fetches the text through the existing `read.mino.mobi/gutenberg-proxy` (which has its own cache layer).
3. Strips Gutenberg header/footer, splits into sentences, keeps those with ≥40 words and Flesch ≤ 35.
4. Asks Llama 3.1 8B for `{literal, idiomatic, alternative}` rewrites in JSON.
5. Inserts up to 5 fresh candidates as `pending`.
6. Users at `/fodder/` swipe yes/no/skip. A candidate flips to `approved` at **yes ≥ 5** and **yes / (yes + no) ≥ 0.7**, or to `rejected` at **no ≥ 8** and **no / (yes + no) ≥ 0.7**.

The **`refsLookBroken()`** filter catches obviously-bad LLM output (rewrite shorter than 3 words, equal to the original, or not actually shorter). Crowd voting handles the subtler cases.

## Pulling approvals back into the drill corpus

From the repo root:

```bash
node scripts/sync-fodder-to-rite.mjs --dry    # preview
node scripts/sync-fodder-to-rite.mjs          # write
git diff rite/corpus.json                     # review
git add rite/corpus.json && git commit -m "rite: sync N approved sentences"
```

Idempotent — fodder IDs (`f-2833-abc1234`) live in a different namespace from hand-curated rite IDs (`v001`), so re-running adds only new approvals.

## Cost on $5 Cloudflare Workers Paid

| What | Per-event | Daily |
|------|-----------|-------|
| Drill grade (BGE embedding, batched) | ~1 neuron | ~5,000 free grades |
| Fodder mining (Llama 3.1 8B, 5 cands × 4 runs) | ~11 neurons | ~220 neurons |
| Fodder voting | 0 neurons (pure D1) | 0 |

10,000 free neurons/day, so the whole stack lives comfortably inside the free tier.

## Local dev

```bash
cd rite
npx wrangler dev
```

The cron does not fire under `wrangler dev`. To exercise the mining path, hit `POST /api/fodder/admin/mine` with `X-Admin-Key: <ADMIN_KEY>`.

## Deploy

```bash
cd rite
npx wrangler deploy
npx wrangler d1 execute atpolls-db --file=migrations/0001_fodder.sql --remote   # first time only
npx wrangler secret put ADMIN_KEY                                               # for /api/fodder/admin/mine
```

Custom domain `rite.mino.mobi` is declared in `wrangler.jsonc`. Cloudflare provisions the route on first deploy as long as the `mino.mobi` zone is on your account.

After the first cron fires (or you hit `/api/fodder/admin/mine` manually), candidates show up in the swipe deck at `/fodder/`.

## Adding sentences directly (no fodder)

Edit `corpus.json`. Each entry:

```json
{
  "id": "v046",
  "style": "academic",
  "original": "The verbose original sentence…",
  "references": [
    "A literal rewrite.",
    "An idiomatic rewrite.",
    "A punchier alternative."
  ]
}
```

Three references per entry is the convention — graders take the max similarity, so idiom-friendly rewrites score as well as literal ones.

## Future

- Per-reference voting on fodder cards (rate the literal vs. idiomatic separately).
- Difficulty tiers in the drill (easy/medium/hard by original word count or Flesch).
- Daily mode: same sentence for everyone, leaderboard.
- Sourcing beyond Gutenberg: SEC EDGAR (corporate verbosity), Federal Register (bureaucratic), arXiv abstracts (academic).
- Optional Claude Haiku reference generation via AI Gateway for higher-quality rewrites at ~$0.001/sentence.
