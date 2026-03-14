# Plan: Stat Shaping, Rarity Distribution & Crafting System

## Problem Summary

### Current State
- **Stats are broken**: 4 of 5 stats suffer from API starvation (50 titles sharing 500-item limit)
  - ATK (links): 97.5% stuck at 30
  - DEF (linkshere): 78% stuck at 25
  - SPC (extlinks): 100% zeros
  - SPD (revisions): 100% zeros
  - HP (length): only working stat — scalar, no starvation
- **Rarity is lopsided**: 56% Rare, 16% Legendary, 6% Common (computed from one working stat)
- **Even with fixed data**, Featured Articles cluster — they're all well-sourced, heavily linked. Raw log2 values will compress into a narrow band (50–80 for most stats)

## Phase 1: Fix Data Pipeline (immediate)

### 1a. Move ALL list props to heavy-batch fetching
`fetch_metadata_batch` currently fetches links, extlinks at batch=50. Move them to HEAVY_BATCH=10 alongside linkshere/revisions. Only keep scalar/light props (info, categories, pageimages, extracts, langlinks) in the main batch.

Files: `scripts/score-deep-wikipedia.py`

### 1b. Percentile normalization
Instead of absolute log2 values, rank each stat within the pool and map to 1–99.

Algorithm:
1. Score all articles, collect raw counts: `{links: 347, linkshere: 89, extlinks: 212, revisions: 45, length: 87400}`
2. For each stat, rank all articles (1 = lowest, N = highest)
3. Map: `stat_value = max(1, round(rank / N * 99))`

This guarantees:
- Full 1–99 range for every stat
- Even spread regardless of the underlying distribution
- Natural rarity variation (articles high in MULTIPLE stats are genuinely rare)

Apply in `compute_card_stats()` — needs the full article list passed in so percentiles can be computed.

### 1c. Explicit rarity targets
Set percentage bands on the power distribution, not fixed thresholds:
- Common: bottom 45%
- Uncommon: next 30%
- Rare: next 15%
- Legendary: top 10%

Compute power for all articles, sort, assign rarity by percentile rank.

Files: `scripts/score-deep-wikipedia.py`, `scripts/generate-pool-js.py`

### 1d. Client-side alignment
The JS viewer (`cards/js/app.js`) also derives stats from live Wikipedia data. Two options:
- **Option A**: Ship pre-computed stats in pool.js as `[title, category, {atk, def, spc, spd, hp, rarity}]` — stats are authoritative from the scorer, not re-derived live. Live fetch only for extract/image.
- **Option B**: Keep live fetching but replicate percentile normalization client-side (requires shipping the full pool's raw values for context — ugly).

**Recommend Option A.** The scorer has better data (smaller batches, REST pageviews). The client just renders it.

## Phase 2: Crafting System (the stretch)

### Concept
Two cards combine to produce a third card that's semantically "between" them. Not assigned — discovered through embedding space.

```
Apollo 11 + Russian Romanticism → ?
(space exploration) + (cultural movement) → Perestroika
(a political transformation catalyzed by the space race's end and cultural awakening)
```

### Architecture

#### 2a. Embedding pre-computation
- Compute embeddings for all ~6,800 Featured Articles using their extracts
- Use a lightweight model (e.g., `text-embedding-3-small` via OpenAI, or `sentence-transformers` locally)
- Store as a compact binary file: `cards/data/embeddings.bin` (title index + float16 vectors)
- Run as a GitHub Action step after scoring

#### 2b. Combination matrix (pre-computed)
For the pool articles (~540), pre-compute all pairwise combinations:
- For each pair (A, B): centroid = (embed_A + embed_B) / 2
- Find nearest neighbor to centroid from ALL articles (including non-pool)
- Store as: `cards/data/crafting.json` → `{"Apollo 11 + Russian Romanticism": "Perestroika", ...}`
- Only store combinations where the result is NOT already in the pool (crafting produces new cards)

Pool size math: 540 articles → 540×539/2 = 145,530 pairs. At ~1KB per entry, ~145MB for the full matrix. Too large.

**Alternative**: only pre-compute combinations for articles that produce "interesting" results:
- Result must be a Featured/Good Article (quality filter)
- Result must NOT be in the current pool (novelty filter)
- Cosine similarity of centroid to result must be > 0.7 (relevance filter)
- Store only the ~5,000-10,000 best combinations

#### 2c. Crafting reserve
- Tag some pool articles as "craftable only" — they don't appear in daily packs or Lucky draws
- These are the reward for experimentation
- The crafting.json file defines which combinations unlock which articles
- UI: drag two cards together → loading animation → reveal the crafted card

#### 2d. Client-side crafting (future)
- Ship a lightweight WASM embedding model to the client
- Users can try ANY combination, not just pre-computed ones
- The client computes the centroid and finds the nearest article from the full index
- This enables true discovery — finding combinations nobody planned for

### Data flow
```
score-deep-wikipedia.py → deep-pool.json (scored articles)
                        → deep-wikipedia.json (all 6,800 scored)
compute-embeddings.py   → embeddings.bin (all article vectors)
compute-crafting.py     → crafting.json (valid pair → result mappings)
generate-pool-js.py     → pool.js (pack articles + crafting reserve flag)
```

### Collection model
- **Pack articles**: appear in daily packs and Lucky draws
- **Craft-only articles**: only obtainable through crafting
- **Collection progress**: tracked in localStorage
- **Craft hints**: after opening N packs, show hints like "Try combining a Space card with a Literature card..."

## Phase 3: Future considerations

- **Seasonal rotation**: re-run the scorer monthly, top articles shift as pageviews/edits change
- **Trading**: users share crafting discoveries (shareable URLs encoding the combination)
- **Deck building**: select 5 cards from your collection, compare total power against other users' decks
- **Embedding visualization**: show the "semantic map" of your collection — clusters of knowledge you've explored
