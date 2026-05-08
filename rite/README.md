# rite — sentence editing drill

Live at `rite.mino.mobi` (well — once deployed).

A drill: you're shown a verbose, hard-to-read sentence (Victorian, bureaucratic, academic, legal). You rewrite it to be concise and clear, as fast as possible. You're scored on fidelity, brevity, clarity, and speed.

## Architecture

```
Cloudflare Worker (worker.js) -- ASSETS binding -- static (index.html, corpus.json)
                              -- AI binding ----- Workers AI (@cf/baai/bge-base-en-v1.5)
```

- **`worker.js`** — handles `/api/sentence`, `/api/grade`. Falls through to static for everything else.
- **`index.html`** — single-page drill UI. Vanilla JS, no build step.
- **`corpus.json`** — 45 hand-curated verbose sentences with reference rewrites.
- **`wrangler.jsonc`** — Worker + assets binding + AI binding.

## Grading

Score is a weighted combination:

| Component | Weight | How |
|-----------|-------:|-----|
| Fidelity  | 50%    | Cosine similarity (BGE embeddings) between user's edit and the reference rewrite. Falls back to Jaccard token overlap if the AI binding is unavailable. |
| Brevity   | 30%    | Peaks when user word-count ≈ reference word-count. Capped near zero if user didn't shorten the original. |
| Clarity   | 20%    | Flesch reading-ease delta vs. the original. |
| Speed     | × multiplier | 1.0 at ≤10 s, decaying to 0.5 at 60 s. |

Final score is `(0.5·fidelity + 0.3·brevity + 0.2·clarity) · speed_bonus · 100`, rounded.

## Cost on $5 Cloudflare Workers Paid

- Embeddings: `@cf/baai/bge-base-en-v1.5` is ~1 neuron per call.
- Worker request: free included quota.
- 10,000 free neurons/day → ~5,000 grades/day free (each grade does one embedding call with two texts batched).

## Local dev

```
cd rite
npx wrangler dev
```

The corpus loads via `env.ASSETS.fetch` so it Just Works from the same dir.

## Deploy

```
cd rite
npx wrangler deploy
```

Custom domain `rite.mino.mobi` is declared in `wrangler.jsonc` — Cloudflare provisions it on first deploy. The DNS record needs to exist (CNAME → `rite.<account>.workers.dev` is fine, or use the Cloudflare dashboard's "Custom Domains" tab on the worker).

## Adding sentences

Edit `corpus.json`. Each entry:

```json
{
  "id": "v046",
  "style": "academic",
  "original": "The verbose original sentence…",
  "reference": "Concise rewrite for grading."
}
```

Reference is one valid concise rewrite — it's only used for embedding similarity, so any meaning-preserving paraphrase the user produces will score well.

## Future

- Difficulty tiers (easy/medium/hard by original word count or Flesch).
- Daily-mode: same sentence for everyone, leaderboard.
- "Lobotomize the LLM" mode: paste your own verbose paragraph, get drilled on it.
- Optional Llama 3.1 commentary call for a one-line zinger ("you've changed 'patrons' to 'people' — fine, but lost the bar context").
