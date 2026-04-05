#!/usr/bin/env python3
"""
Build flavor compound embeddings for the Yum food pool.

Source: FooDB (foodb.ca) — CC BY-NC 4.0
  Download the JSON dump (~87MB), extract food→compound mappings,
  build sparse compound vectors, PCA reduce to dense embeddings.

Pipeline:
  1. Download FooDB JSON dump (cached if already present)
  2. Parse food and content tables to build food→compound mappings
  3. Match our 780 food pool titles to FooDB food entries
  4. Build sparse binary vectors over flavor/aroma compounds
  5. PCA reduce to 64d dense embeddings
  6. Category-neighbor proxy for unmatched foods (same PCA space)
  7. Output: yum-embeddings.json + yum-embeddings.bin + yum-compounds.json

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
import zipfile
import io

import requests
import numpy as np


FOODB_JSON_URL = "https://foodb.ca/public/system/downloads/foodb_2020_04_07_json.zip"
FOODB_CSV_URL = "https://foodb.ca/public/system/downloads/foodb_2020_4_7_csv.tar.gz"


def parse_pool_js(path):
    """Extract food titles and categories from yum-pool.js."""
    with open(path) as f:
        content = f.read()
    pattern = r'f\("([^"]+)",\s*"([^"]+)"\)'
    matches = re.findall(pattern, content)
    print(f"Parsed {len(matches)} foods from {path}", file=sys.stderr)
    return matches


def normalize_name(title):
    """Clean food title for matching."""
    name = re.sub(r'\s*\([^)]*\)', '', title)  # remove disambiguation
    return name.strip().lower()


# ── FooDB data loading ───────────────────────────────────────

def download_foodb_csv(cache_dir):
    """Download and extract FooDB CSV dump. Returns path to extracted dir."""
    archive_path = os.path.join(cache_dir, "foodb_csv.tar.gz")
    extract_dir = os.path.join(cache_dir, "foodb_csv")

    if os.path.isdir(extract_dir) and os.listdir(extract_dir):
        print(f"Using cached FooDB CSV at {extract_dir}", file=sys.stderr)
        return extract_dir

    os.makedirs(cache_dir, exist_ok=True)

    if not os.path.exists(archive_path):
        print(f"Downloading FooDB CSV dump (~953MB)...", file=sys.stderr)
        resp = requests.get(FOODB_CSV_URL, stream=True, timeout=300)
        resp.raise_for_status()
        total = int(resp.headers.get('content-length', 0))
        downloaded = 0
        with open(archive_path, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    print(f"\r  {downloaded // (1024*1024)}MB / {total // (1024*1024)}MB ({pct}%)",
                          end="", file=sys.stderr)
        print(file=sys.stderr)
    else:
        print(f"Using cached archive at {archive_path}", file=sys.stderr)

    print("Extracting...", file=sys.stderr)
    os.makedirs(extract_dir, exist_ok=True)

    # Try extraction with subprocess first (handles macOS resource forks better)
    import subprocess
    try:
        result = subprocess.run(
            ["tar", "xzf", archive_path, "-C", extract_dir,
             "--exclude", "._*", "--exclude", ".*"],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode != 0:
            # Some tar versions don't support --exclude, try without
            print(f"  tar with --exclude failed, retrying plain...", file=sys.stderr)
            subprocess.run(
                ["tar", "xzf", archive_path, "-C", extract_dir],
                capture_output=True, text=True, timeout=300, check=True
            )
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"  subprocess tar failed ({e}), trying Python tarfile...", file=sys.stderr)
        import tarfile
        # Try auto-detect mode
        with tarfile.open(archive_path, "r:*") as tar:
            members = [m for m in tar.getmembers()
                       if not os.path.basename(m.name).startswith('._')]
            tar.extractall(extract_dir, members=members)

    # List what we got
    for root, dirs, files in os.walk(extract_dir):
        csv_files = [f for f in files if f.endswith('.csv')]
        if csv_files:
            print(f"  Found {len(csv_files)} CSV files in {root}", file=sys.stderr)
            for cf in sorted(csv_files)[:10]:
                size = os.path.getsize(os.path.join(root, cf)) // 1024
                print(f"    {cf} ({size}KB)", file=sys.stderr)
            break

    print(f"Extracted to {extract_dir}", file=sys.stderr)
    return extract_dir


def load_foodb_foods(csv_dir):
    """Load food entries from FooDB CSV. Returns dict of id → food info."""
    import csv

    # Find the Food.csv file (may be in a subdirectory)
    food_csv = None
    for root, dirs, files in os.walk(csv_dir):
        for f in files:
            if f.lower() == 'food.csv':
                food_csv = os.path.join(root, f)
                break

    if not food_csv:
        print(f"ERROR: Food.csv not found in {csv_dir}", file=sys.stderr)
        # List what's there
        for root, dirs, files in os.walk(csv_dir):
            for f in files[:20]:
                print(f"  Found: {os.path.join(root, f)}", file=sys.stderr)
        return {}

    print(f"Loading {food_csv}...", file=sys.stderr)
    foods = {}
    with open(food_csv, encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            fid = (row.get('id') or row.get('food_id') or '').strip()
            if fid:
                name = (row.get('name') or row.get('food_name') or
                        row.get('name_scientific') or '').strip()
                foods[fid] = {
                    'id': fid,
                    'name': name,
                    'name_lower': name.lower(),
                    'group': row.get('food_group', ''),
                    'subgroup': row.get('food_subgroup', ''),
                    'description': row.get('description', ''),
                }
    print(f"  Loaded {len(foods)} foods", file=sys.stderr)
    return foods


def load_foodb_compounds(csv_dir):
    """Load compound entries from FooDB CSV."""
    import csv

    compound_csv = None
    for root, dirs, files in os.walk(csv_dir):
        for f in files:
            if f.lower() == 'compound.csv':
                compound_csv = os.path.join(root, f)
                break

    if not compound_csv:
        print(f"ERROR: Compound.csv not found", file=sys.stderr)
        return {}

    print(f"Loading {compound_csv}...", file=sys.stderr)
    compounds = {}
    with open(compound_csv, encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = row.get('id') or row.get('compound_id')
            if cid:
                compounds[cid] = {
                    'id': cid,
                    'name': (row.get('name') or row.get('compound_name') or '').strip(),
                    'flavor': row.get('flavor', ''),
                    'aroma': row.get('aroma', ''),
                }
    print(f"  Loaded {len(compounds)} compounds", file=sys.stderr)
    return compounds


def load_foodb_contents(csv_dir, food_ids=None):
    """Load food→compound content mappings from FooDB CSV.
    Returns dict: food_id → set of compound_ids."""
    import csv

    content_csv = None
    for root, dirs, files in os.walk(csv_dir):
        for f in files:
            if f.lower() == 'content.csv':
                content_csv = os.path.join(root, f)
                break

    if not content_csv:
        print(f"ERROR: Content.csv not found", file=sys.stderr)
        return {}

    print(f"Loading {content_csv} (this may take a moment)...", file=sys.stderr)
    food_compounds = {}
    rows_read = 0
    with open(content_csv, encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        # Log actual column names for debugging
        first_row = next(reader, None)
        if first_row:
            print(f"  Content.csv columns: {list(first_row.keys())[:15]}",
                  file=sys.stderr)
        else:
            print("  Content.csv is empty!", file=sys.stderr)
            return {}
        # Process first row + rest
        from itertools import chain
        for row in chain([first_row], reader):
            rows_read += 1
            # The Content table links foods to compounds
            # Try different column name patterns
            if 'food_id' in row and 'source_id' in row:
                fid = row['food_id'].strip()
                cid = row['source_id'].strip()
            elif 'food_id' in row and 'compound_id' in row:
                fid = row['food_id'].strip()
                cid = row['compound_id'].strip()
            else:
                fid = (row.get('food_id') or row.get('source_id') or '').strip()
                cid = (row.get('source_id') or '').strip()

            if fid and cid:
                if food_ids is None or fid in food_ids:
                    if fid not in food_compounds:
                        food_compounds[fid] = set()
                    food_compounds[fid].add(cid)

            if rows_read % 500000 == 0:
                print(f"  ...{rows_read} content rows processed", file=sys.stderr)

    print(f"  {rows_read} total rows, {len(food_compounds)} foods with compound data",
          file=sys.stderr)
    return food_compounds


# ── Matching ─────────────────────────────────────────────────

def match_food_to_foodb(food_name, foodb_by_name):
    """Match a food pool title to a FooDB food entry.

    Conservative matching to avoid false positives like:
      "pepperoni" → "pepper", "corned beef" → "corn",
      "rose water" → "water", "goose" → "gooseberry"
    """
    name = normalize_name(food_name)

    # Exact
    if name in foodb_by_name:
        return foodb_by_name[name]

    # Singular/plural
    for variant in [name + 's', name + 'es', name.rstrip('s'), name.rstrip('es'),
                    name.rstrip('ies') + 'y']:
        if variant in foodb_by_name:
            return foodb_by_name[variant]

    # FooDB comma convention: "butter, salted" → match "butter" as prefix before comma
    for foodb_name, entry in foodb_by_name.items():
        foodb_base = foodb_name.split(',')[0].strip()
        if foodb_base == name:
            return entry

    # "Common X" / "X (Y)" convention: "common wheat" matches "wheat"
    for foodb_name, entry in foodb_by_name.items():
        foodb_base = foodb_name.split(',')[0].strip()
        # "common wheat" → "wheat"
        if foodb_base.startswith('common ') and foodb_base[7:] == name:
            return entry

    # Multi-word our side: "bell pepper" → check "bell pepper" as FooDB comma-prefix
    # But NOT individual words — "rose water" should NOT match "water"
    words = name.split()
    if len(words) > 1:
        # Try the full multi-word name as a comma-prefix in FooDB
        for foodb_name, entry in foodb_by_name.items():
            foodb_base = foodb_name.split(',')[0].strip()
            if foodb_base == name:
                return entry

        # Try "X cheese" → "X" in FooDB (e.g., "gouda cheese" → "gouda")
        # Only if the qualifier is a generic category word
        generic_qualifiers = {'cheese', 'sauce', 'oil', 'seed', 'seeds',
                              'leaf', 'leaves', 'root', 'powder', 'flour',
                              'milk', 'cream', 'butter', 'paste', 'syrup',
                              'water', 'juice', 'vinegar', 'noodles', 'bread'}
        if words[-1] in generic_qualifiers and len(words) >= 2:
            base = ' '.join(words[:-1])
            if base in foodb_by_name:
                return foodb_by_name[base]
            # Also check comma-prefix
            for foodb_name, entry in foodb_by_name.items():
                if foodb_name.split(',')[0].strip() == base:
                    return entry

        # Try "adjective X" → "X" in FooDB (e.g., "black pepper" → "pepper")
        # But be careful: "corned beef" should NOT match "beef" wait yes it should
        # The adjective patterns that are safe to strip:
        color_adj = {'black', 'white', 'red', 'green', 'yellow', 'brown',
                     'dark', 'light', 'wild', 'dried', 'smoked', 'roasted',
                     'fresh', 'raw', 'cooked', 'pickled', 'fermented',
                     'candied', 'crystallized', 'toasted', 'ground'}
        if words[0] in color_adj and len(words) >= 2:
            rest = ' '.join(words[1:])
            if rest in foodb_by_name:
                return foodb_by_name[rest]
            for foodb_name, entry in foodb_by_name.items():
                if foodb_name.split(',')[0].strip() == rest:
                    return entry

    # NO substring matching — it causes too many false positives
    # ("corn" in "cornmeal", "rice" in "licorice", "pepper" in "pepperoni")

    return None


# ── Embedding computation ────────────────────────────────────

def build_compound_vectors(foods, food_compound_ids, all_compound_ids):
    """Build TF-IDF weighted vectors from compound profiles.

    Binary vectors fail because FooDB coverage is wildly bimodal: garlic has
    6,147 compounds, butter has 148. After PCA, all low-compound foods collapse
    together. TF-IDF fixes this by:
      - TF: 1/sqrt(n_compounds) for the food — normalizes for coverage depth
      - IDF: log(N/df) — downweights ubiquitous compounds (common metabolites),
        upweights rare distinctive ones (flavor/aroma molecules)
    """
    compound_to_idx = {c: i for i, c in enumerate(all_compound_ids)}
    n = len(all_compound_ids)

    # First pass: compute document frequency (how many foods have each compound)
    doc_freq = np.zeros(n, dtype=np.float32)
    matched = 0
    food_cid_lists = []
    for i, (title, _cat) in enumerate(foods):
        cids = food_compound_ids.get(title, set())
        food_cid_lists.append(cids)
        if cids:
            matched += 1
            for cid in cids:
                j = compound_to_idx.get(cid)
                if j is not None:
                    doc_freq[j] += 1

    # IDF: log(N_matched / df), clipped to avoid log(0)
    n_matched = max(matched, 1)
    idf = np.log(n_matched / np.maximum(doc_freq, 1))

    # Second pass: build TF-IDF vectors
    vectors = np.zeros((len(foods), n), dtype=np.float32)
    for i, cids in enumerate(food_cid_lists):
        if cids:
            tf = 1.0 / max(np.sqrt(len(cids)), 1)  # normalize for coverage depth
            for cid in cids:
                j = compound_to_idx.get(cid)
                if j is not None:
                    vectors[i, j] = tf * idf[j]

    print(f"  Built TF-IDF vectors: {matched}/{len(foods)} foods, {n} compound dims",
          file=sys.stderr)
    return vectors


def reduce_dimensions(vectors, target_dim=64):
    """PCA reduce sparse compound vectors to dense embeddings."""
    from sklearn.decomposition import PCA

    has_data = vectors.sum(axis=1) > 0
    n_with_data = has_data.sum()
    print(f"  {n_with_data} foods with compound data for PCA fitting", file=sys.stderr)

    if n_with_data < target_dim:
        target_dim = max(2, int(n_with_data) - 1)
        print(f"  Reducing target dim to {target_dim}", file=sys.stderr)

    if n_with_data < 2:
        print("  Not enough data for PCA", file=sys.stderr)
        return np.zeros((len(vectors), target_dim), dtype=np.float32)

    pca = PCA(n_components=target_dim)
    pca.fit(vectors[has_data])

    reduced = pca.transform(vectors)
    norms = np.linalg.norm(reduced, axis=1, keepdims=True)
    norms[norms == 0] = 1
    reduced = reduced / norms

    explained = pca.explained_variance_ratio_.sum()
    print(f"  PCA: {vectors.shape[1]} → {target_dim}d, "
          f"{explained:.1%} variance explained", file=sys.stderr)
    return reduced


def category_neighbor_fallback(foods, matched_titles, embeddings, k=5):
    """For unmatched foods, average the embeddings of nearest matched neighbors in same category.

    This keeps all vectors in one coherent compound-PCA space instead of
    stitching in a separate text-embedding space.  For each unmatched food:
      1. Find all FooDB-matched foods in the same category
      2. Take the centroid of those compound embeddings
      3. If no same-category matches exist, use the global matched centroid
    Add jitter (scaled noise) so foods aren't perfectly identical.
    """
    dim = embeddings.shape[1]
    title_to_idx = {title: i for i, (title, _) in enumerate(foods)}

    # Group matched foods by category
    cat_matched = {}  # category → list of indices
    for title in matched_titles:
        idx = title_to_idx.get(title)
        if idx is None:
            continue
        cat = foods[idx][1]
        cat_matched.setdefault(cat, []).append(idx)

    # Global matched centroid as final fallback
    matched_indices = [title_to_idx[t] for t in matched_titles if t in title_to_idx]
    if not matched_indices:
        return {}
    global_centroid = embeddings[matched_indices].mean(axis=0)

    rng = np.random.RandomState(42)
    result = {}

    for i, (title, cat) in enumerate(foods):
        if title in matched_titles:
            continue  # already has compound embedding

        # Same-category matched neighbors
        neighbors = cat_matched.get(cat, [])
        if neighbors:
            centroid = embeddings[neighbors].mean(axis=0)
        else:
            centroid = global_centroid.copy()

        # Add small jitter so items aren't identical — scale relative to
        # the typical spread within this category
        if len(neighbors) > 1:
            spread = embeddings[neighbors].std(axis=0).mean()
        else:
            spread = 0.1
        jitter = rng.randn(dim) * spread * 0.3
        vec = centroid + jitter

        # L2 normalize
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        result[i] = vec

    return result


# ── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Build flavor embeddings from FooDB")
    parser.add_argument("--pool-js", default="cards/js/yum-pool.js")
    parser.add_argument("--output-dir", default="cards/data/")
    parser.add_argument("--compounds-dir", default="data/",
                        help="Directory for large yum-compounds.json (keep out of deploy path)")
    parser.add_argument("--cache-dir", default="/tmp/foodb_cache")
    parser.add_argument("--dim", type=int, default=64)
    parser.add_argument("--skip-text-fallback", action="store_true")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    os.makedirs(args.compounds_dir, exist_ok=True)

    # 1. Parse food pool
    foods = parse_pool_js(args.pool_js)
    titles = [f[0] for f in foods]
    categories = [f[1] for f in foods]

    # 2. Download and load FooDB
    csv_dir = download_foodb_csv(args.cache_dir)

    foodb_foods = load_foodb_foods(csv_dir)
    foodb_compounds = load_foodb_compounds(csv_dir)
    foodb_contents = load_foodb_contents(csv_dir)

    # Build name→food index
    foodb_by_name = {}
    for fid, food in foodb_foods.items():
        name = food['name_lower']
        if name:
            foodb_by_name[name] = food

    print(f"\nFooDB index: {len(foodb_by_name)} food names", file=sys.stderr)

    # 3. Match our foods to FooDB
    matched_titles = {}  # our title → set of compound IDs
    all_compound_ids = set()
    match_count = 0

    # Normalize content keys to stripped strings for reliable lookup
    foodb_contents_norm = {str(k).strip(): v for k, v in foodb_contents.items()}

    name_matched_no_compounds = []
    for title, cat in foods:
        foodb_entry = match_food_to_foodb(title, foodb_by_name)
        if foodb_entry:
            fid = str(foodb_entry['id']).strip()
            cids = foodb_contents_norm.get(fid, set())
            if len(cids) >= 10:  # skip entries with too few compounds (useless data)
                matched_titles[title] = cids
                all_compound_ids.update(cids)
                match_count += 1
            elif cids:
                name_matched_no_compounds.append(
                    (title, foodb_entry['name'], fid,
                     f"only {len(cids)} compounds"))
                continue
            else:
                name_matched_no_compounds.append(
                    (title, foodb_entry['name'], fid))

    print(f"\nMatched: {match_count}/{len(foods)} foods, "
          f"{len(all_compound_ids)} unique compounds", file=sys.stderr)
    if name_matched_no_compounds:
        print(f"  ⚠ {len(name_matched_no_compounds)} foods matched FooDB name "
              f"but had no compounds in Content table:", file=sys.stderr)
        # Show a sample of content keys for debugging
        sample_content_keys = list(foodb_contents.keys())[:3]
        if sample_content_keys and name_matched_no_compounds:
            sample_fid = name_matched_no_compounds[0][2]
            print(f"    Content key type: {type(sample_content_keys[0])}, "
                  f"Food ID type: {type(sample_fid)}, "
                  f"sample content key: {sample_content_keys[0]!r}, "
                  f"sample food id: {sample_fid!r}", file=sys.stderr)
        for title, foodb_name, fid in name_matched_no_compounds[:20]:
            print(f"    {title} → FooDB '{foodb_name}' (id={fid})", file=sys.stderr)
        if len(name_matched_no_compounds) > 20:
            print(f"    ... and {len(name_matched_no_compounds) - 20} more",
                  file=sys.stderr)

    # Build name map for compound IDs → names (for output)
    compound_names = {}
    for cid in all_compound_ids:
        if cid in foodb_compounds:
            compound_names[cid] = foodb_compounds[cid]['name']

    # Save raw compound data
    raw_path = os.path.join(args.compounds_dir, "yum-compounds.json")
    foods_export = {}
    for title, cids in matched_titles.items():
        foods_export[title] = [compound_names.get(c, c) for c in sorted(cids)]

    with open(raw_path, "w") as f:
        json.dump({
            "source": "FooDB (foodb.ca) CC BY-NC 4.0",
            "matched": match_count,
            "total": len(foods),
            "unique_compounds": len(all_compound_ids),
            "foods": foods_export,
        }, f, indent=2, ensure_ascii=False)
    size_kb = os.path.getsize(raw_path) // 1024
    print(f"Wrote {raw_path} ({size_kb}KB)", file=sys.stderr)

    # 4. Build compound vectors and reduce
    all_cid_list = sorted(all_compound_ids)
    if all_cid_list:
        # Map title → compound IDs for vector building
        food_cid_map = {}
        for title, cids in matched_titles.items():
            food_cid_map[title] = cids

        vectors = build_compound_vectors(foods, food_cid_map, all_cid_list)
        embeddings = reduce_dimensions(vectors, target_dim=args.dim)
    else:
        print("No compound data — falling back entirely to text", file=sys.stderr)
        embeddings = np.zeros((len(foods), args.dim), dtype=np.float32)

    # 5. Category-neighbor fallback for unmatched (stays in compound space)
    if not args.skip_text_fallback:
        fallback = category_neighbor_fallback(foods, matched_titles, embeddings)
        if fallback:
            for idx, emb in fallback.items():
                embeddings[idx] = emb
            print(f"  Filled {len(fallback)} foods with category-neighbor proxy", file=sys.stderr)

    # 6. Write outputs
    dim = embeddings.shape[1]
    bin_path = os.path.join(args.output_dir, "yum-embeddings.bin")
    with open(bin_path, "wb") as fout:
        for vec in embeddings:
            fout.write(struct.pack(f"{dim}f", *vec.tolist()))
    size_kb = os.path.getsize(bin_path) // 1024
    print(f"\nWrote {bin_path} ({size_kb}KB)", file=sys.stderr)

    # Per-food source flag: "compound" or "proxy"
    sources = ["compound" if t in matched_titles else "proxy" for t in titles]

    index_path = os.path.join(args.output_dir, "yum-embeddings.json")
    index = {
        "dim": dim,
        "count": len(titles),
        "source": "foodb-compounds+category-proxy",
        "foodb_matched": match_count,
        "compounds_count": len(all_compound_ids),
        "titles": titles,
        "categories": categories,
        "sources": sources,
    }
    with open(index_path, "w") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)
    size_kb = os.path.getsize(index_path) // 1024
    print(f"Wrote {index_path} ({size_kb}KB)", file=sys.stderr)

    # 7. Sanity checks
    print("\n── Flavor similarity sanity check ──", file=sys.stderr)
    title_to_idx = {t: i for i, t in enumerate(titles)}
    test_pairs = [
        ("Garlic", "Onion"),
        ("Chocolate", "Vanilla"),
        ("Soy sauce", "Miso"),
        ("Lemon", "Lime (fruit)"),
        ("Salmon", "Cinnamon"),
        ("Basil", "Oregano"),
        ("Coffee", "Tea"),
        ("Butter", "Ghee"),
        ("Cheddar cheese", "Brie"),
        ("Apple", "Pear"),
    ]
    for a, b in test_pairs:
        if a in title_to_idx and b in title_to_idx:
            ai, bi = title_to_idx[a], title_to_idx[b]
            sim = float(np.dot(embeddings[ai], embeddings[bi]))
            marker = "COMPOUND" if (a in matched_titles and b in matched_titles) else "proxy"
            print(f"  {a} ~ {b}: {sim:.3f}  [{marker}]", file=sys.stderr)

    # Most similar pair
    dots = embeddings @ embeddings.T
    np.fill_diagonal(dots, -1)
    best = np.unravel_index(dots.argmax(), dots.shape)
    print(f"\n  Most similar: '{titles[best[0]]}' ~ '{titles[best[1]]}' "
          f"({dots[best]:.3f})", file=sys.stderr)

    # Category-level stats
    print(f"\n── Match rates by category ──", file=sys.stderr)
    cat_stats = {}
    for title, cat in foods:
        if cat not in cat_stats:
            cat_stats[cat] = {"total": 0, "matched": 0}
        cat_stats[cat]["total"] += 1
        if title in matched_titles:
            cat_stats[cat]["matched"] += 1
    for cat, s in sorted(cat_stats.items()):
        pct = s["matched"] * 100 // s["total"] if s["total"] else 0
        print(f"  {cat:12s}: {s['matched']:3d}/{s['total']:3d} ({pct}%)", file=sys.stderr)

    print(f"\nDone! {len(titles)} food embeddings in {dim}d "
          f"({match_count} compound-based, {len(titles) - match_count} category-proxy)",
          file=sys.stderr)


if __name__ == "__main__":
    main()
