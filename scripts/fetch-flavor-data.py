#!/usr/bin/env python3
"""
Fetch flavor compound data for the Yum food pool.

Sources:
  1. FlavorDB API (cosylab.iiitd.edu.in/flavordb) — ~930 ingredients with
     flavor compound profiles
  2. FooDB CSV exports (foodb.ca) — broader coverage, downloadable

Pipeline:
  1. Read our food pool titles from yum-pool.js (parse the f("Title", "CAT") calls)
  2. Search FlavorDB for each food by name
  3. Extract compound lists per ingredient
  4. Build sparse compound vectors, then reduce to dense embeddings via PCA
  5. For prepared dishes (no direct match), attempt ingredient decomposition
  6. Output: yum-embeddings.json (index) + yum-embeddings.bin (float32 vectors)

Usage:
    pip install requests numpy scikit-learn
    python3 scripts/fetch-flavor-data.py

    # Custom paths
    python3 scripts/fetch-flavor-data.py \
        --pool-js cards/js/yum-pool.js \
        --output-dir cards/data/ \
        --dim 64
"""

import argparse
import json
import os
import re
import struct
import sys
import time

import requests
import numpy as np


FLAVORDB_API = "https://cosylab.iiitd.edu.in/flavordb/api"
FLAVORDB_SEARCH = "https://cosylab.iiitd.edu.in/flavordb"

# Rate-limit: be polite to FlavorDB
REQUEST_DELAY = 0.5  # seconds between requests


def parse_pool_js(path):
    """Extract food titles and categories from yum-pool.js."""
    with open(path) as f:
        content = f.read()
    # Match f("Title", "CATEGORY") patterns
    pattern = r'f\("([^"]+)",\s*"([^"]+)"\)'
    matches = re.findall(pattern, content)
    print(f"Parsed {len(matches)} foods from {path}", file=sys.stderr)
    return matches  # [(title, category), ...]


def normalize_food_name(title):
    """Clean food title for FlavorDB search."""
    # Remove Wikipedia disambiguation suffixes
    name = re.sub(r'\s*\([^)]*\)', '', title)
    # Remove common prefixes/qualifiers that FlavorDB won't know
    name = name.strip()
    return name


# ── FlavorDB fetching ────────────────────────────────────────

def search_flavordb_entity(name, session):
    """Search FlavorDB for an ingredient by name. Returns entity_id or None."""
    try:
        # Try the search/autocomplete endpoint
        url = f"{FLAVORDB_API}/entities?name={requests.utils.quote(name.lower())}"
        resp = session.get(url, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                return data[0]
            elif isinstance(data, dict) and data.get('entity_id'):
                return data
    except Exception as e:
        print(f"  Search error for '{name}': {e}", file=sys.stderr)
    return None


def get_entity_molecules(entity_id, session):
    """Get flavor molecules for a FlavorDB entity."""
    try:
        url = f"{FLAVORDB_API}/entities/{entity_id}/molecules"
        resp = session.get(url, timeout=15)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"  Molecule fetch error for entity {entity_id}: {e}", file=sys.stderr)
    return []


def fetch_all_entities(session):
    """Fetch the full FlavorDB entity list for local matching."""
    print("Fetching FlavorDB entity catalog...", file=sys.stderr)
    entities = []
    try:
        # Try paginated entity list
        page = 0
        while True:
            url = f"{FLAVORDB_API}/entities?page={page}&limit=100"
            resp = session.get(url, timeout=30)
            if resp.status_code != 200:
                break
            data = resp.json()
            if not data or (isinstance(data, list) and len(data) == 0):
                break
            if isinstance(data, list):
                entities.extend(data)
            else:
                break
            page += 1
            time.sleep(REQUEST_DELAY)
            if page > 20:  # safety limit
                break
    except Exception as e:
        print(f"  Catalog fetch error: {e}", file=sys.stderr)

    # Fallback: try fetching all at once
    if not entities:
        try:
            url = f"{FLAVORDB_API}/entities"
            resp = session.get(url, timeout=60)
            if resp.status_code == 200:
                entities = resp.json()
        except Exception as e:
            print(f"  Fallback catalog fetch error: {e}", file=sys.stderr)

    print(f"  Got {len(entities)} FlavorDB entities", file=sys.stderr)
    return entities


def match_food_to_entity(food_name, entities_by_name):
    """Fuzzy match a food name to a FlavorDB entity."""
    name = normalize_food_name(food_name).lower()

    # Exact match
    if name in entities_by_name:
        return entities_by_name[name]

    # Try singular/plural variants
    for variant in [name + 's', name + 'es', name.rstrip('s'), name.rstrip('es')]:
        if variant in entities_by_name:
            return entities_by_name[variant]

    # Try first word (e.g., "cheddar cheese" -> "cheddar")
    first_word = name.split()[0] if ' ' in name else None
    if first_word and first_word in entities_by_name:
        return entities_by_name[first_word]

    # Try last word (e.g., "bell pepper" -> "pepper")
    last_word = name.split()[-1] if ' ' in name else None
    if last_word and last_word in entities_by_name:
        return entities_by_name[last_word]

    # Substring match
    for entity_name, entity in entities_by_name.items():
        if name in entity_name or entity_name in name:
            return entity

    return None


# ── Fallback: Wikipedia text embeddings ──────────────────────

def fetch_wikipedia_extracts(titles, batch_size=20):
    """Fetch Wikipedia extracts for foods that have no FlavorDB match."""
    extracts = {}
    for i in range(0, len(titles), batch_size):
        batch = titles[i:i + batch_size]
        titles_param = "|".join(batch)
        url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "titles": titles_param,
            "prop": "extracts",
            "exintro": True,
            "explaintext": True,
            "format": "json",
            "origin": "*",
        }
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 200:
                pages = resp.json().get("query", {}).get("pages", {})
                for p in pages.values():
                    if p.get("extract"):
                        extracts[p["title"]] = p["extract"]
        except Exception as e:
            print(f"  Wikipedia fetch error: {e}", file=sys.stderr)
        time.sleep(REQUEST_DELAY)
    return extracts


# ── Embedding computation ────────────────────────────────────

def build_compound_vectors(foods, food_molecules, all_compounds):
    """Build sparse binary vectors from compound profiles."""
    compound_to_idx = {c: i for i, c in enumerate(all_compounds)}
    n_compounds = len(all_compounds)
    vectors = np.zeros((len(foods), n_compounds), dtype=np.float32)

    matched = 0
    for i, (title, _cat) in enumerate(foods):
        molecules = food_molecules.get(title, [])
        if molecules:
            matched += 1
            for mol in molecules:
                mol_name = mol if isinstance(mol, str) else mol.get('common_name', mol.get('name', ''))
                if mol_name in compound_to_idx:
                    vectors[i, compound_to_idx[mol_name]] = 1.0

    print(f"  {matched}/{len(foods)} foods have compound data", file=sys.stderr)
    return vectors


def reduce_dimensions(vectors, target_dim=64):
    """PCA reduction of sparse compound vectors to dense embeddings."""
    from sklearn.decomposition import PCA

    # Only use rows with data for fitting
    has_data = vectors.sum(axis=1) > 0
    if has_data.sum() < target_dim:
        print(f"  Warning: only {has_data.sum()} foods with compound data, "
              f"reducing target dim to {has_data.sum()}", file=sys.stderr)
        target_dim = max(2, int(has_data.sum()))

    pca = PCA(n_components=target_dim)
    pca.fit(vectors[has_data])

    reduced = pca.transform(vectors)
    # L2 normalize
    norms = np.linalg.norm(reduced, axis=1, keepdims=True)
    norms[norms == 0] = 1
    reduced = reduced / norms

    explained = pca.explained_variance_ratio_.sum()
    print(f"  PCA: {vectors.shape[1]} → {target_dim} dims, "
          f"{explained:.1%} variance explained", file=sys.stderr)
    return reduced


def text_fallback_embeddings(foods, food_molecules, extracts, dim=64):
    """For foods without compound data, use text embeddings as fallback."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("  sentence-transformers not available, skipping text fallback", file=sys.stderr)
        return None

    unmatched = [(i, title) for i, (title, _) in enumerate(foods)
                 if title not in food_molecules or not food_molecules[title]]

    if not unmatched:
        return None

    print(f"  Computing text embeddings for {len(unmatched)} unmatched foods...", file=sys.stderr)
    model = SentenceTransformer("all-MiniLM-L6-v2")

    texts = []
    for _, title in unmatched:
        extract = extracts.get(title, "")
        texts.append(f"{title}: {extract}" if extract else title)

    embeddings = model.encode(texts, batch_size=32, normalize_embeddings=True)

    # PCA down to match compound embedding dim
    if embeddings.shape[1] > dim:
        from sklearn.decomposition import PCA
        pca = PCA(n_components=dim)
        embeddings = pca.fit_transform(embeddings)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1
        embeddings = embeddings / norms

    return {idx: emb for (idx, _), emb in zip(unmatched, embeddings)}


# ── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch flavor compound data for Yum")
    parser.add_argument("--pool-js", default="cards/js/yum-pool.js", help="Yum pool JS file")
    parser.add_argument("--output-dir", default="cards/data/", help="Output directory")
    parser.add_argument("--dim", type=int, default=64, help="Embedding dimensions")
    parser.add_argument("--skip-wikipedia", action="store_true",
                        help="Skip Wikipedia extract fetching for unmatched foods")
    parser.add_argument("--skip-text-fallback", action="store_true",
                        help="Skip text embedding fallback for unmatched foods")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # 1. Parse food pool
    foods = parse_pool_js(args.pool_js)
    titles = [f[0] for f in foods]
    categories = [f[1] for f in foods]

    # 2. Fetch FlavorDB data
    session = requests.Session()
    session.headers.update({
        "User-Agent": "YumCards/1.0 (https://cards.mino.mobi/yum; educational project)"
    })

    # Get entity catalog for matching
    entities = fetch_all_entities(session)
    entities_by_name = {}
    for e in entities:
        name = (e.get('entity_alias_readable') or e.get('entity_alias') or
                e.get('alias') or e.get('name', '')).lower().strip()
        if name:
            entities_by_name[name] = e
        # Also index by common_name if different
        common = (e.get('common_name') or '').lower().strip()
        if common and common != name:
            entities_by_name[common] = e

    print(f"FlavorDB index: {len(entities_by_name)} searchable names", file=sys.stderr)

    # 3. Match foods to entities and fetch molecules
    food_molecules = {}
    all_compounds = set()
    matched_count = 0

    for i, (title, cat) in enumerate(foods):
        entity = match_food_to_entity(title, entities_by_name)
        if entity:
            entity_id = entity.get('entity_id') or entity.get('id')
            if entity_id:
                molecules = get_entity_molecules(entity_id, session)
                if molecules:
                    mol_names = []
                    for m in molecules:
                        name = m.get('common_name') or m.get('name') or str(m)
                        mol_names.append(name)
                        all_compounds.add(name)
                    food_molecules[title] = mol_names
                    matched_count += 1
                time.sleep(REQUEST_DELAY)

        if (i + 1) % 50 == 0:
            print(f"  Progress: {i + 1}/{len(foods)} foods processed, "
                  f"{matched_count} matched", file=sys.stderr)

    print(f"\nFlavorDB matching: {matched_count}/{len(foods)} foods, "
          f"{len(all_compounds)} unique compounds", file=sys.stderr)

    # Save raw compound data
    raw_path = os.path.join(args.output_dir, "yum-compounds.json")
    with open(raw_path, "w") as f:
        json.dump({
            "matched": matched_count,
            "total": len(foods),
            "compounds_count": len(all_compounds),
            "compounds": sorted(all_compounds),
            "foods": {title: mols for title, mols in food_molecules.items()},
        }, f, indent=2, ensure_ascii=False)
    print(f"Wrote {raw_path}", file=sys.stderr)

    # 4. Build compound vectors
    all_compounds_list = sorted(all_compounds)
    if all_compounds_list:
        vectors = build_compound_vectors(foods, food_molecules, all_compounds_list)
        embeddings = reduce_dimensions(vectors, target_dim=args.dim)
    else:
        print("No compound data available, falling back entirely to text", file=sys.stderr)
        embeddings = np.zeros((len(foods), args.dim), dtype=np.float32)

    # 5. Text fallback for unmatched foods
    if not args.skip_text_fallback:
        unmatched_titles = [t for t in titles if t not in food_molecules]
        if unmatched_titles:
            extracts = {}
            if not args.skip_wikipedia:
                print(f"\nFetching Wikipedia extracts for {len(unmatched_titles)} "
                      f"unmatched foods...", file=sys.stderr)
                extracts = fetch_wikipedia_extracts(unmatched_titles)
                print(f"  Got {len(extracts)} extracts", file=sys.stderr)

            fallback = text_fallback_embeddings(foods, food_molecules, extracts, dim=args.dim)
            if fallback:
                for idx, emb in fallback.items():
                    embeddings[idx] = emb
                print(f"  Filled {len(fallback)} foods with text embeddings", file=sys.stderr)

    # 6. Write outputs
    # Binary embeddings file
    dim = embeddings.shape[1]
    bin_path = os.path.join(args.output_dir, "yum-embeddings.bin")
    with open(bin_path, "wb") as f:
        for vec in embeddings:
            f.write(struct.pack(f"{dim}f", *vec.tolist()))
    size_kb = round(os.path.getsize(bin_path) / 1024)
    print(f"\nWrote {bin_path} ({size_kb}KB)", file=sys.stderr)

    # Index JSON
    index_path = os.path.join(args.output_dir, "yum-embeddings.json")
    index = {
        "dim": dim,
        "count": len(titles),
        "source": "flavordb+text-fallback",
        "flavordb_matched": matched_count,
        "compounds_count": len(all_compounds),
        "titles": titles,
        "categories": categories,
    }
    with open(index_path, "w") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)
    size_kb = round(os.path.getsize(index_path) / 1024)
    print(f"Wrote {index_path} ({size_kb}KB)", file=sys.stderr)

    # 7. Sanity check
    print("\n── Flavor similarity sanity check ──", file=sys.stderr)
    test_pairs = [
        ("Garlic", "Onion"),
        ("Chocolate", "Vanilla"),
        ("Soy sauce", "Miso"),
        ("Lemon", "Lime (fruit)"),
        ("Salmon", "Cinnamon"),
    ]
    title_to_idx = {t: i for i, t in enumerate(titles)}
    for a, b in test_pairs:
        if a in title_to_idx and b in title_to_idx:
            ai, bi = title_to_idx[a], title_to_idx[b]
            sim = float(np.dot(embeddings[ai], embeddings[bi]))
            print(f"  {a} ~ {b}: {sim:.3f}", file=sys.stderr)

    # Find most similar pair overall
    dots = embeddings @ embeddings.T
    np.fill_diagonal(dots, -1)
    best = np.unravel_index(dots.argmax(), dots.shape)
    print(f"\n  Most similar pair: '{titles[best[0]]}' ~ '{titles[best[1]]}' "
          f"({dots[best]:.3f})", file=sys.stderr)

    print(f"\nDone! {len(titles)} food embeddings in {dim}d", file=sys.stderr)


if __name__ == "__main__":
    main()
