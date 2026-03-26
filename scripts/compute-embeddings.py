#!/usr/bin/env python3
"""
Compute article embeddings for the Alchemy tab.

Reads full-pool.json (titles + bins + stats) and the scored articles
(for extracts), computes embeddings using sentence-transformers, and
outputs a compact binary file + JSON index.

Output format:
  embeddings.json: {"titles": [...], "dim": 384, "bins": [...]}
  embeddings.bin:  float32 array, shape (N, 384), row-major

The client loads both files, then for any two articles A and B:
  centroid = normalize(embed[A] + embed[B])
  result = argmax(cosine_similarity(centroid, embed[*]))

Usage:
    pip install sentence-transformers
    python3 scripts/compute-embeddings.py

    # Custom input/output
    python3 scripts/compute-embeddings.py \
        --pool cards/data/full-pool.json \
        --articles cards/data/deep-wikipedia.json \
        --output-dir cards/data/
"""

import argparse
import json
import struct
import sys
import os


def main():
    parser = argparse.ArgumentParser(description="Compute article embeddings for Alchemy")
    parser.add_argument("--pool", default="cards/data/full-pool.json", help="Full pool JSON")
    parser.add_argument("--articles", default="cards/data/deep-wikipedia.json",
                        help="Scored articles with extracts")
    parser.add_argument("--output-dir", default="cards/data/", help="Output directory")
    parser.add_argument("--model", default="all-MiniLM-L6-v2",
                        help="Sentence-transformers model name")
    parser.add_argument("--batch-size", type=int, default=64, help="Encoding batch size")
    args = parser.parse_args()

    # Import here so --help works without sentence-transformers installed
    from sentence_transformers import SentenceTransformer

    # Load pool (titles + bins)
    print("Loading pool...", file=sys.stderr)
    with open(args.pool) as f:
        pool_data = json.load(f)
    pool = pool_data["pool"]  # [[title, bin, {stats}], ...]
    titles = [p[0] for p in pool]
    bins = [p[1] for p in pool]
    print(f"  {len(titles)} articles in pool", file=sys.stderr)

    # Load extracts from scored articles
    print("Loading extracts...", file=sys.stderr)
    extract_map = {}
    if os.path.exists(args.articles):
        with open(args.articles) as f:
            articles_data = json.load(f)
        for a in articles_data.get("articles", []):
            extract_map[a["title"]] = a.get("extract", "")
        print(f"  {len(extract_map)} extracts loaded", file=sys.stderr)
    else:
        print(f"  WARNING: {args.articles} not found, using titles as text", file=sys.stderr)

    # Build text for embedding: title + extract (or just title if no extract)
    texts = []
    for title in titles:
        extract = extract_map.get(title, "")
        if extract:
            texts.append(f"{title}: {extract}")
        else:
            texts.append(title)

    # Load model and encode
    print(f"Loading model '{args.model}'...", file=sys.stderr)
    model = SentenceTransformer(args.model)
    dim = model.get_sentence_embedding_dimension()
    print(f"  Embedding dimension: {dim}", file=sys.stderr)

    print(f"Encoding {len(texts)} articles (batch_size={args.batch_size})...", file=sys.stderr)
    embeddings = model.encode(
        texts,
        batch_size=args.batch_size,
        show_progress_bar=True,
        normalize_embeddings=True,  # L2 normalize for cosine similarity via dot product
    )

    # Write binary file (float32, row-major)
    bin_path = os.path.join(args.output_dir, "embeddings.bin")
    with open(bin_path, "wb") as f:
        for vec in embeddings:
            f.write(struct.pack(f"{dim}f", *vec.tolist()))
    size_mb = round(os.path.getsize(bin_path) / 1024 / 1024, 1)
    print(f"Wrote {bin_path} ({size_mb}MB)", file=sys.stderr)

    # Write index JSON
    index_path = os.path.join(args.output_dir, "embeddings.json")
    index = {
        "dim": dim,
        "count": len(titles),
        "model": args.model,
        "titles": titles,
        "bins": bins,
    }
    with open(index_path, "w") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)
    size_kb = round(os.path.getsize(index_path) / 1024)
    print(f"Wrote {index_path} ({size_kb}KB)", file=sys.stderr)

    # Sanity check: find nearest neighbor for a sample query
    import numpy as np
    sample_idx = 0
    sample_vec = embeddings[sample_idx]
    dots = embeddings @ sample_vec
    dots[sample_idx] = -1  # exclude self
    nearest_idx = dots.argmax()
    print(f"\nSanity check: nearest to '{titles[sample_idx]}' → "
          f"'{titles[nearest_idx]}' (similarity={dots[nearest_idx]:.3f})", file=sys.stderr)

    # Test alchemy: pick two random articles, find the centroid's nearest neighbor
    import random
    for _ in range(3):
        a, b = random.sample(range(len(titles)), 2)
        centroid = embeddings[a] + embeddings[b]
        centroid = centroid / np.linalg.norm(centroid)
        dots = embeddings @ centroid
        dots[a] = -1
        dots[b] = -1
        result_idx = dots.argmax()
        print(f"  Alchemy: '{titles[a]}' + '{titles[b]}' → "
              f"'{titles[result_idx]}' (sim={dots[result_idx]:.3f})", file=sys.stderr)


if __name__ == "__main__":
    main()
