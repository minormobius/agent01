#!/usr/bin/env python3
"""
Generate lightweight TF-IDF embeddings for the card pool.

No ML dependencies — uses bag-of-words with TF-IDF weighting on
article titles + category names. Produces the same output format
as compute-embeddings.py (embeddings.json + embeddings.bin) so
the Alchemy tab works without sentence-transformers.

The embeddings are less semantically rich than neural embeddings,
but they capture keyword overlap — "DNA" + "Evolution" will find
articles related to genetics rather than random noise.
"""

import json
import math
import os
import struct
import sys
import re
from collections import Counter

# Category full names for enriching title text
BIN_NAMES = {
    "LIFE_SCI": "life sciences biology organisms ecology genetics",
    "MEDICINE": "medicine health disease treatment pharmacology anatomy",
    "PHYS_SCI": "physics chemistry elements materials quantum",
    "EARTH": "earth geology environment climate rivers mountains",
    "COSMOS": "space astronomy cosmos planets stars galaxies",
    "MATH": "mathematics statistics logic theorem equations",
    "TECH": "technology engineering computing software hardware",
    "GEO": "geography countries cities regions places",
    "HISTORY": "history ancient medieval civilization empire dynasty",
    "MILITARY": "military war battle conflict weapons naval",
    "SOCIETY": "society politics government law economics social",
    "PHILOSOPHY": "philosophy religion theology ethics spiritual",
    "LITERATURE": "literature novels poetry books writing language",
    "VISUAL_ARTS": "visual arts painting sculpture architecture design",
    "MUSIC": "music performance composers songs albums instruments",
    "FILM": "film cinema television movies animation media",
    "SPORTS": "sports games athletics competition championship",
    "EVERYDAY": "everyday food drink clothing tools customs",
}


def tokenize(text):
    """Simple word tokenizer."""
    return re.findall(r'[a-z]{2,}', text.lower())


def main():
    pool_path = "cards/data/deep-pool.json"
    output_dir = "cards/data"

    # Load pool from deep-pool.json (what we have locally)
    print(f"Loading {pool_path}...", file=sys.stderr)
    with open(pool_path) as f:
        data = json.load(f)

    # Collect articles
    titles = []
    bins = []
    texts = []

    bin_order = [
        "LIFE_SCI", "MEDICINE", "PHYS_SCI", "EARTH", "COSMOS", "MATH",
        "TECH", "GEO", "HISTORY", "MILITARY", "SOCIETY", "PHILOSOPHY",
        "LITERATURE", "VISUAL_ARTS", "MUSIC", "FILM", "SPORTS", "EVERYDAY",
    ]

    for bin_key in bin_order:
        articles = data.get("bins", {}).get(bin_key, [])
        for a in articles:
            title = a["title"]
            extract = a.get("extract", "")
            # Build text: title + extract + bin context
            bin_context = BIN_NAMES.get(bin_key, "")
            text = f"{title} {title} {extract} {bin_context}"
            titles.append(title)
            bins.append(bin_key)
            texts.append(text)

    n = len(titles)
    print(f"  {n} articles", file=sys.stderr)

    # Tokenize
    docs = [tokenize(t) for t in texts]

    # Build vocabulary from all tokens
    df = Counter()  # document frequency
    for doc in docs:
        for word in set(doc):
            df[word] += 1

    # Filter: keep words appearing in 2+ docs but less than 80% of docs
    min_df = 2
    max_df = int(n * 0.8)
    vocab = sorted(w for w, c in df.items() if min_df <= c <= max_df)
    word_to_idx = {w: i for i, w in enumerate(vocab)}
    dim = len(vocab)
    print(f"  Vocabulary: {dim} terms (from {len(df)} total)", file=sys.stderr)

    # Reduce dimensionality via random projection (Achlioptas method)
    # Project from vocab-space to target_dim using sparse random matrix
    import random
    random.seed(42)
    target_dim = min(128, dim)
    print(f"  Projecting to {target_dim}d via random projection", file=sys.stderr)

    # Build sparse projection matrix: each entry is +1, 0, or -1 with prob 1/6, 4/6, 1/6
    # Only store non-zero entries
    proj = []  # list of (from_idx, to_idx, sign)
    for j in range(target_dim):
        for i in range(dim):
            r = random.random()
            if r < 1/6:
                proj.append((i, j, 1.0))
            elif r > 5/6:
                proj.append((i, j, -1.0))

    # Compute TF-IDF vectors and project
    idf = {}
    for w in vocab:
        idf[w] = math.log(n / df[w])

    embeddings = []
    for doc in docs:
        # TF
        tf = Counter(doc)
        max_tf = max(tf.values()) if tf else 1

        # TF-IDF sparse vector
        tfidf = {}
        for w, count in tf.items():
            if w in word_to_idx:
                tfidf[word_to_idx[w]] = (count / max_tf) * idf.get(w, 0)

        # Project to target_dim
        vec = [0.0] * target_dim
        for from_idx, to_idx, sign in proj:
            if from_idx in tfidf:
                vec[to_idx] += sign * tfidf[from_idx]

        # L2 normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]

        embeddings.append(vec)

    # Write binary file
    os.makedirs(output_dir, exist_ok=True)
    bin_path = os.path.join(output_dir, "embeddings.bin")
    with open(bin_path, "wb") as f:
        for vec in embeddings:
            f.write(struct.pack(f"{target_dim}f", *vec))
    size_kb = round(os.path.getsize(bin_path) / 1024)
    print(f"  Wrote {bin_path} ({size_kb}KB)", file=sys.stderr)

    # Write index JSON
    index_path = os.path.join(output_dir, "embeddings.json")
    index = {
        "dim": target_dim,
        "count": n,
        "model": "tfidf-random-projection",
        "titles": titles,
        "bins": bins,
    }
    with open(index_path, "w") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)
    size_kb = round(os.path.getsize(index_path) / 1024)
    print(f"  Wrote {index_path} ({size_kb}KB)", file=sys.stderr)

    # Sanity check
    print(f"\nSanity checks:", file=sys.stderr)
    sample = embeddings[0]
    best_sim = -1
    best_idx = -1
    for i in range(1, n):
        dot = sum(a * b for a, b in zip(sample, embeddings[i]))
        if dot > best_sim:
            best_sim = dot
            best_idx = i
    print(f"  Nearest to '{titles[0]}': '{titles[best_idx]}' (sim={best_sim:.3f})", file=sys.stderr)

    # Alchemy test
    import random as rng
    rng.seed(7)
    for _ in range(5):
        a, b = rng.sample(range(n), 2)
        # Centroid
        cent = [embeddings[a][d] + embeddings[b][d] for d in range(target_dim)]
        cnorm = math.sqrt(sum(v * v for v in cent))
        if cnorm > 0:
            cent = [v / cnorm for v in cent]
        best_sim = -1
        best_idx = -1
        for i in range(n):
            if i == a or i == b:
                continue
            dot = sum(c * e for c, e in zip(cent, embeddings[i]))
            if dot > best_sim:
                best_sim = dot
                best_idx = i
        print(f"  '{titles[a]}' + '{titles[b]}' → '{titles[best_idx]}' (sim={best_sim:.3f})",
              file=sys.stderr)


if __name__ == "__main__":
    main()
