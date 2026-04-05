#!/usr/bin/env python3
"""
Build flavor complementarity data from curated recipes + compound embeddings.

Pipeline:
1. Load ingredient pool (from yum-pool.js titles)
2. Load curated recipe database (inline)
3. Compute co-occurrence matrix
4. Compute PMI (pointwise mutual information) for each ingredient pair
5. Run k-means clustering on 64d compound embeddings
6. Output: cards/data/yum-complementarity.json

PMI = log2(P(a,b) / (P(a) * P(b)))
  Positive PMI → ingredients appear together more than chance → complementary
  Negative PMI → ingredients avoid each other
  Zero PMI → independent
"""

import json
import struct
import math
import os
import sys
import re
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)

# ── Load ingredient pool ────────────────────────────────────────────

def load_ingredients():
    """Extract ingredient titles from yum-pool.js"""
    pool_path = os.path.join(ROOT, "cards", "js", "yum-pool.js")
    with open(pool_path, "r") as f:
        content = f.read()
    titles = re.findall(r'f\("([^"]+)"', content)
    print(f"Loaded {len(titles)} ingredients from pool")
    return titles

# ── Load embeddings ─────────────────────────────────────────────────

def load_embeddings():
    """Load 64d embeddings from binary + JSON index"""
    json_path = os.path.join(ROOT, "cards", "data", "yum-embeddings.json")
    bin_path = os.path.join(ROOT, "cards", "data", "yum-embeddings.bin")
    
    with open(json_path) as f:
        idx = json.load(f)
    
    with open(bin_path, "rb") as f:
        raw = f.read()
    
    dim = idx["dim"]
    count = idx["count"]
    emb = struct.unpack(f"<{count * dim}f", raw)
    
    # Build title → vector lookup
    vectors = {}
    for i, title in enumerate(idx["titles"]):
        vectors[title] = list(emb[i * dim : (i + 1) * dim])
    
    print(f"Loaded {count} embeddings (dim={dim})")
    return vectors, dim

# ── K-means clustering ──────────────────────────────────────────────

def kmeans(vectors, titles, k=24, max_iter=100):
    """Simple k-means on embedding vectors"""
    import random
    
    dim = len(next(iter(vectors.values())))
    # L2 normalize vectors for better k-means (cosine distance)
    raw_data = [vectors.get(t) for t in titles if t in vectors]
    valid_titles = [t for t in titles if t in vectors]
    data = []
    for v in raw_data:
        norm = math.sqrt(sum(x*x for x in v)) or 1.0
        data.append([x / norm for x in v])
    n = len(data)
    
    if n == 0:
        return {}, []
    
    # Init: k-means++ 
    centers = [list(data[random.randint(0, n-1)])]
    for _ in range(k - 1):
        dists = []
        for v in data:
            min_d = min(sum((a-b)**2 for a,b in zip(v, c)) for c in centers)
            dists.append(min_d)
        total = sum(dists)
        if total == 0:
            centers.append(list(data[random.randint(0, n-1)]))
            continue
        r = random.random() * total
        cum = 0
        for i, d in enumerate(dists):
            cum += d
            if cum >= r:
                centers.append(list(data[i]))
                break
    
    assignments = [0] * n
    
    for iteration in range(max_iter):
        # Assign
        changed = 0
        for i, v in enumerate(data):
            best_c, best_d = 0, float('inf')
            for c_idx, center in enumerate(centers):
                d = sum((a-b)**2 for a,b in zip(v, center))
                if d < best_d:
                    best_d = d
                    best_c = c_idx
            if assignments[i] != best_c:
                changed += 1
                assignments[i] = best_c
        
        if changed == 0:
            break
        
        # Update centers
        for c_idx in range(k):
            members = [data[i] for i in range(n) if assignments[i] == c_idx]
            if members:
                centers[c_idx] = [sum(v[d] for v in members) / len(members) for d in range(dim)]
    
    # Build result
    cluster_map = {}
    for i, t in enumerate(valid_titles):
        cluster_map[t] = assignments[i]
    
    # Name clusters by most common category or most central member
    cluster_members = defaultdict(list)
    for i, t in enumerate(valid_titles):
        cluster_members[assignments[i]].append(t)
    
    cluster_info = []
    for c_idx in range(k):
        members = cluster_members.get(c_idx, [])
        if not members:
            cluster_info.append({"id": c_idx, "size": 0, "exemplars": []})
            continue
        
        # Find most central member
        center = centers[c_idx]
        best_t, best_d = None, float('inf')
        for t in members:
            v = vectors[t]
            d = sum((a-b)**2 for a,b in zip(v, center))
            if d < best_d:
                best_d = d
                best_t = t
        
        cluster_info.append({
            "id": c_idx,
            "size": len(members),
            "exemplars": [best_t] + [m for m in members[:4] if m != best_t][:3],
        })
    
    print(f"K-means: {k} clusters, {iteration+1} iterations")
    for ci in sorted(cluster_info, key=lambda x: -x["size"]):
        if ci["size"] > 0:
            print(f"  Cluster {ci['id']}: {ci['size']} members — {', '.join(ci['exemplars'][:3])}")
    
    return cluster_map, cluster_info

# ── Curated Recipe Database ─────────────────────────────────────────
# Each recipe is a list of ingredient names matching our pool.
# These are classic, well-known recipes that represent good flavor combos.
# We only include ingredients from our 725 pool — technique/process words omitted.

RECIPES = [
    # ── Italian ──
    ["Tomato", "Garlic", "Basil", "Olive oil", "Parmesan cheese"],
    ["Tomato", "Mozzarella", "Basil", "Olive oil"],
    ["Garlic", "Olive oil", "Chili pepper", "Parsley"],
    ["Pancetta", "Chicken egg", "Parmesan cheese", "Black pepper"],
    ["Tomato", "Onion", "Carrot", "Celery", "Beef", "Red wine"],
    ["Eggplant", "Tomato", "Garlic", "Basil", "Olive oil", "Parmesan cheese"],
    ["Zucchini", "Tomato", "Garlic", "Basil"],
    ["Prosciutto", "Cantaloupe"],
    ["Ricotta", "Spinach", "Nutmeg", "Parmesan cheese"],
    ["Pesto", "Pine nut", "Garlic", "Basil", "Parmesan cheese", "Olive oil"],
    ["Anchovy", "Tomato", "Olive oil", "Garlic", "Chili pepper"],
    ["Clam", "Garlic", "White wine", "Parsley", "Chili pepper"],
    
    # ── French ──
    ["Butter", "Garlic", "Parsley", "Lemon"],
    ["Onion", "Beef", "Gruyère cheese", "Butter", "Thyme"],
    ["Butter", "Chicken egg", "Lemon", "Tarragon"],
    ["Chicken (food)", "Shiitake", "Heavy cream", "White wine", "Thyme"],
    ["Duck (food)", "Orange", "Honey"],
    ["Leek", "Potato", "Butter", "Heavy cream"],
    ["Butter", "Chicken egg", "Sugar", "Vanilla", "All-purpose flour"],
    ["Shallot", "Red wine", "Butter", "Thyme"],
    ["Salmon", "Dill", "Lemon", "Heavy cream"],
    ["Lamb and mutton", "Rosemary", "Garlic", "Thyme"],
    
    # ── Japanese ──
    ["Salmon", "Rice", "Nori", "Rice vinegar"],
    ["Tuna", "Soy sauce", "Wasabi", "Ginger"],
    ["Miso", "Tofu", "Scallion", "Wakame"],
    ["Chicken (food)", "Soy sauce", "Mirin", "Ginger", "Scallion"],
    ["Pork", "Ginger", "Soy sauce", "Scallion", "Garlic"],
    ["Shrimp (food)", "All-purpose flour", "Chicken egg"],
    ["Cucumber", "Rice vinegar", "Sesame seed", "Soy sauce"],
    ["Edamame", "Salt"],
    ["Mackerel", "Miso", "Ginger"],
    
    # ── Chinese ──
    ["Pork", "Ginger", "Garlic", "Soy sauce", "Scallion", "Chili pepper"],
    ["Chicken (food)", "Peanut", "Chili pepper", "Soy sauce", "Ginger", "Garlic"],
    ["Tofu", "Pork", "Chili pepper", "Szechuan pepper", "Garlic"],
    ["Beef", "Broccoli", "Soy sauce", "Garlic", "Ginger"],
    ["Duck (food)", "Scallion", "Cucumber", "Hoisin sauce"],
    ["Chicken egg", "Scallion", "Soy sauce", "Sesame oil"],
    ["Pork", "Cabbage", "Ginger", "Soy sauce", "Sesame oil"],
    ["Shrimp (food)", "Garlic", "Chili pepper", "Scallion"],
    ["Eggplant", "Garlic", "Soy sauce", "Chili pepper"],
    
    # ── Indian ──
    ["Chicken (food)", "Yogurt", "Cumin", "Coriander", "Turmeric", "Chili pepper", "Garlic", "Ginger"],
    ["Lentil", "Turmeric", "Cumin", "Onion", "Tomato", "Garlic"],
    ["Chickpea", "Tomato", "Onion", "Cumin", "Coriander", "Turmeric"],
    ["Potato", "Cauliflower", "Turmeric", "Cumin", "Ginger"],
    ["Spinach", "Paneer", "Garlic", "Ginger", "Cumin"],
    ["Lamb and mutton", "Yogurt", "Cardamom", "Cinnamon", "Clove", "Onion"],
    ["Coconut", "Shrimp (food)", "Turmeric", "Chili pepper", "Curry leaf"],
    ["Rice", "Cardamom", "Cinnamon", "Clove", "Saffron", "Onion"],
    ["Mango", "Sugar", "Cardamom"],
    ["Tamarind", "Tomato", "Chili pepper", "Cumin"],
    
    # ── Thai ──
    ["Coconut", "Chicken (food)", "Galangal", "Lemongrass", "Lime (fruit)", "Chili pepper"],
    ["Shrimp (food)", "Lemongrass", "Galangal", "Lime (fruit)", "Chili pepper", "Fish sauce"],
    ["Beef", "Basil", "Chili pepper", "Garlic", "Fish sauce"],
    ["Papaya", "Chili pepper", "Lime (fruit)", "Fish sauce", "Peanut"],
    ["Pork", "Coconut", "Peanut", "Turmeric"],
    ["Mango", "Coconut", "Rice"],
    
    # ── Mexican ──
    ["Avocado", "Lime (fruit)", "Onion", "Chili pepper", "Cilantro", "Tomato"],
    ["Tomato", "Onion", "Chili pepper", "Cilantro", "Lime (fruit)"],
    ["Pork", "Chili pepper", "Onion", "Garlic", "Cumin", "Orange"],
    ["Chicken (food)", "Lime (fruit)", "Cumin", "Chili pepper", "Onion"],
    ["Black bean", "Onion", "Garlic", "Cumin", "Chili pepper"],
    ["Chocolate", "Chili pepper", "Cinnamon", "Cumin"],
    ["Corn", "Lime (fruit)", "Chili pepper", "Mayonnaise", "Cotija cheese"],
    
    # ── Korean ──
    ["Pork", "Gochujang", "Garlic", "Ginger", "Sesame oil", "Scallion"],
    ["Beef", "Soy sauce", "Pear", "Garlic", "Sesame oil", "Scallion"],
    ["Tofu", "Gochujang", "Scallion", "Chicken egg"],
    ["Cabbage", "Chili pepper", "Garlic", "Ginger", "Fish sauce", "Scallion"],
    ["Rice", "Chicken egg", "Beef", "Spinach", "Carrot", "Sesame oil", "Gochujang"],
    
    # ── Middle Eastern ──
    ["Chickpea", "Tahini", "Lemon", "Garlic", "Olive oil"],
    ["Eggplant", "Tahini", "Lemon", "Garlic"],
    ["Lamb and mutton", "Sumac", "Onion", "Pine nut", "Parsley"],
    ["Chickpea", "Parsley", "Onion", "Cumin", "Coriander"],
    ["Bulgur", "Tomato", "Parsley", "Onion", "Lemon", "Olive oil"],
    ["Yogurt", "Cucumber", "Garlic", "Mint", "Olive oil"],
    ["Pomegranate", "Walnut", "Chicken (food)"],
    
    # ── Mediterranean ──
    ["Olive oil", "Lemon", "Garlic", "Oregano"],
    ["Feta", "Tomato", "Cucumber", "Onion", "Olive oil", "Oregano"],
    ["Lamb and mutton", "Oregano", "Lemon", "Garlic", "Olive oil"],
    ["Octopus", "Olive oil", "Lemon", "Oregano"],
    ["Navy bean", "Tomato", "Garlic", "Rosemary", "Olive oil"],
    
    # ── Southeast Asian ──
    ["Lemongrass", "Ginger", "Garlic", "Chili pepper", "Turmeric"],
    ["Peanut", "Coconut", "Lime (fruit)", "Chili pepper", "Soy sauce"],
    ["Shrimp (food)", "Tamarind", "Peanut", "Chili pepper", "Fish sauce"],
    ["Pork", "Lemongrass", "Fish sauce", "Chili pepper", "Sugar"],
    
    # ── American ──
    ["Beef", "Lettuce", "Tomato", "Onion", "Ketchup", "Mustard (condiment)"],
    ["Pork", "Mustard (condiment)", "Apple cider vinegar", "Brown sugar", "Chili pepper"],
    ["Corn", "Butter", "Salt"],
    ["Potato", "Heavy cream", "Butter", "Chive"],
    ["Chicken (food)", "Hot sauce", "Butter", "Celery"],
    ["Bacon", "Lettuce", "Tomato", "Mayonnaise"],
    ["Apple", "Cinnamon", "Sugar", "Butter", "Lemon"],
    ["Pumpkin", "Cinnamon", "Nutmeg", "Ginger", "Clove", "Sugar"],
    ["Pecan", "Brown sugar", "Butter", "Vanilla"],
    
    # ── Classic pairings ──
    ["Strawberry", "Heavy cream", "Sugar"],
    ["Chocolate", "Vanilla", "Heavy cream"],
    ["Chocolate", "Raspberry"],
    ["Chocolate", "Orange"],
    ["Chocolate", "Hazelnut"],
    ["Chocolate", "Coffee"],
    ["Lemon", "Blueberry", "Sugar"],
    ["Apple", "Cheddar cheese"],
    ["Fig", "Goat cheese", "Honey", "Walnut"],
    ["Pear", "Blue cheese", "Walnut", "Honey"],
    ["Watermelon", "Feta", "Mint"],
    ["Peach", "Basil", "Mozzarella"],
    ["Beetroot", "Goat cheese", "Walnut"],
    ["Carrot", "Ginger", "Orange"],
    ["Cauliflower", "Cumin", "Turmeric"],
    ["Shiitake", "Thyme", "Garlic", "Butter"],
    ["Asparagus", "Lemon", "Parmesan cheese"],
    ["Truffle", "Chicken egg", "Parmesan cheese"],
    ["Fennel", "Orange", "Olive oil"],
    ["Celery", "Peanut butter"],
    
    # ── Breakfast ──
    ["Chicken egg", "Bacon", "Bread"],
    ["Oat", "Banana", "Honey", "Cinnamon"],
    ["Yogurt", "Blueberry", "Oat", "Honey"],
    ["All-purpose flour", "Maple syrup", "Butter", "Blueberry"],
    ["Avocado", "Chicken egg", "Chili pepper", "Lemon"],
    ["Smoked salmon", "Cream cheese", "Dill", "Lemon"],
    
    # ── Seafood combos ──
    ["Lobster", "Butter", "Lemon"],
    ["Oyster", "Lemon", "Shallot", "Red wine vinegar"],
    ["Crab", "Lemon", "Butter", "Old Bay seasoning"],
    ["Scallop", "Butter", "Lemon", "Garlic"],
    ["Tuna", "Olive oil", "Lemon", "Caper"],
    ["Cod", "Lemon", "Dill", "Butter"],
    ["Sardine", "Lemon", "Olive oil", "Parsley"],
    ["Mussel", "White wine", "Garlic", "Shallot", "Parsley"],
    ["Shrimp (food)", "Garlic", "Butter", "Lemon", "Parsley"],
    ["Squid (food)", "Lemon", "Garlic", "Olive oil", "Parsley"],
    
    # ── Spice combos ──
    ["Cumin", "Coriander", "Turmeric", "Chili pepper"],
    ["Cinnamon", "Cardamom", "Clove", "Nutmeg"],
    ["Star anise", "Cinnamon", "Clove", "Szechuan pepper", "Fennel"],
    ["Basil", "Oregano", "Thyme", "Rosemary"],
    ["Garlic", "Ginger", "Scallion"],
    ["Cumin", "Paprika", "Coriander", "Chili pepper"],
    ["Lemongrass", "Galangal", "Kaffir lime leaf"],
    
    # ── Salad combos ──
    ["Arugula", "Parmesan cheese", "Lemon", "Olive oil"],
    ["Kale", "Lemon", "Olive oil", "Garlic", "Parmesan cheese"],
    ["Spinach", "Strawberry", "Walnut", "Goat cheese"],
    ["Cabbage", "Carrot", "Mayonnaise", "Apple cider vinegar"],
    ["Tomato", "Basil", "Mozzarella", "Olive oil", "Balsamic vinegar"],
    ["Cucumber", "Dill", "Yogurt", "Garlic"],
    
    # ── Grain bowls ──
    ["Quinoa", "Avocado", "Black bean", "Lime (fruit)", "Cilantro"],
    ["Rice", "Coconut", "Mango"],
    ["Farro", "Beetroot", "Goat cheese", "Walnut"],
    ["Couscous", "Chickpea", "Lemon", "Parsley", "Olive oil"],
    
    # ── Beverage pairings ──
    ["Coffee", "Heavy cream", "Sugar"],
    ["Tea", "Lemon", "Honey"],
    ["Matcha", "Coconut"],
    ["Ginger", "Lemon", "Honey"],
    
    # ── Dessert combos ──
    ["Vanilla", "Sugar", "Heavy cream", "Chicken egg"],
    ["Lemon", "Sugar", "Butter", "Chicken egg"],
    ["Coconut", "Lime (fruit)", "Sugar"],
    ["Almond", "Honey", "Rose water"],
    ["Pistachio", "Cardamom", "Rose water"],
    ["Banana", "Chocolate", "Peanut butter"],
    ["Mango", "Lime (fruit)", "Chili pepper"],
    ["Coconut", "Chocolate", "Almond"],
    
    # ── Fermentation/umami combos ──
    ["Soy sauce", "Miso", "Sake", "Mirin"],
    ["Fish sauce", "Lime (fruit)", "Chili pepper", "Sugar"],
    ["Worcestershire sauce", "Mustard (condiment)", "Garlic"],
    ["Balsamic vinegar", "Olive oil", "Garlic"],
    ["Kimchi", "Pork", "Tofu", "Scallion"],
    ["Miso", "Ginger", "Garlic", "Sesame oil"],
    
    # ── African ──
    ["Peanut", "Tomato", "Onion", "Chili pepper", "Chicken (food)"],
    ["Berbere", "Onion", "Garlic", "Ginger"],
    ["Chickpea", "Tomato", "Berbere", "Onion"],
    
    # ── South American ──
    ["Black bean", "Rice", "Garlic", "Onion"],
    ["Beef", "Chimichurri", "Garlic", "Parsley"],
    ["Avocado", "Tomato", "Onion", "Lime (fruit)"],
    ["Plantain", "Black bean", "Garlic"],
    
    # ── More classic combos ──
    ["Potato", "Rosemary", "Garlic", "Olive oil"],
    ["Sweet potato", "Cinnamon", "Butter", "Brown sugar"],
    ["Brussels sprout", "Bacon", "Balsamic vinegar"],
    ["Green bean", "Almond", "Lemon", "Butter"],
    ["Beetroot", "Orange", "Walnut"],
    ["Carrot", "Cumin", "Lemon", "Olive oil"],
    ["Garden pea", "Mint", "Lemon"],
    ["Corn", "Chili pepper", "Lime (fruit)", "Butter"],
    ["Artichoke", "Lemon", "Garlic", "Olive oil"],
    ["Leek", "Gruyère cheese", "Butter"],
    ["Turnip", "Apple", "Butter"],
    ["Parsnip", "Honey", "Thyme"],
    ["Radish", "Butter", "Salt"],
    
    # ── Nut/seed pairings ──
    ["Cashew", "Coconut", "Chili pepper", "Lime (fruit)"],
    ["Almond", "Chocolate", "Orange"],
    ["Walnut", "Honey", "Blue cheese"],
    ["Pistachio", "Lemon", "Olive oil"],
    ["Sesame seed", "Soy sauce", "Ginger"],
    ["Pumpkin seed", "Chili pepper", "Lime (fruit)"],
    
    # ── Cheese pairings ──
    ["Brie", "Apple", "Honey", "Walnut"],
    ["Gruyère cheese", "Onion", "Nutmeg"],
    ["Parmesan cheese", "Truffle", "Butter"],
    ["Gouda cheese", "Apple", "Mustard (condiment)"],
    ["Manchego cheese", "Quince", "Almond"],
    ["Stilton cheese", "Pear", "Walnut", "Honey"],
    ["Halloumi", "Watermelon", "Mint"],
]

# ── PMI computation ─────────────────────────────────────────────────

def compute_pmi(recipes, all_ingredients):
    """Compute pointwise mutual information for ingredient pairs"""
    title_set = set(all_ingredients)
    title_to_idx = {t: i for i, t in enumerate(all_ingredients)}
    
    # Filter recipes to only include known ingredients
    clean_recipes = []
    unknown = set()
    for recipe in recipes:
        clean = [ing for ing in recipe if ing in title_set]
        missed = [ing for ing in recipe if ing not in title_set]
        for m in missed:
            unknown.add(m)
        if len(clean) >= 2:
            clean_recipes.append(clean)
    
    if unknown:
        print(f"Warning: {len(unknown)} unknown ingredients in recipes:")
        for u in sorted(unknown):
            print(f"  - {u}")
    
    N = len(clean_recipes)
    print(f"Using {N} recipes (from {len(recipes)} input)")
    
    # Count occurrences
    occurrence = defaultdict(int)  # ingredient → recipe count
    co_occurrence = defaultdict(int)  # (i,j) sorted pair → recipe count
    
    for recipe in clean_recipes:
        seen = set(recipe)
        for ing in seen:
            occurrence[ing] += 1
        ings = sorted(seen)
        for i in range(len(ings)):
            for j in range(i+1, len(ings)):
                co_occurrence[(ings[i], ings[j])] += 1
    
    # Compute PMI
    pmi_scores = {}
    for (a, b), count in co_occurrence.items():
        p_ab = count / N
        p_a = occurrence[a] / N
        p_b = occurrence[b] / N
        
        if p_a > 0 and p_b > 0 and p_ab > 0:
            pmi = math.log2(p_ab / (p_a * p_b))
            # PPMI (positive PMI) — clamp at 0 to focus on positive associations
            # But we keep negative too for "clash" detection
            pmi_scores[(a, b)] = round(pmi, 3)
    
    print(f"Computed PMI for {len(pmi_scores)} ingredient pairs")
    
    # Top complementary pairs
    top_pairs = sorted(pmi_scores.items(), key=lambda x: -x[1])[:20]
    print("\nTop 20 complementary pairs (highest PMI):")
    for (a, b), pmi in top_pairs:
        print(f"  {pmi:+.2f}  {a} + {b}  (co-occur {co_occurrence[(a,b)]}/{N})")
    
    return pmi_scores, occurrence, co_occurrence, N

# ── Build output ────────────────────────────────────────────────────

def build_sparse_pmi(pmi_scores, all_ingredients):
    """Convert PMI dict to sparse array format for JSON"""
    title_to_idx = {t: i for i, t in enumerate(all_ingredients)}
    
    # Only store pairs with |PMI| > 0.5 and co-occurrence >= 2
    sparse = []
    for (a, b), pmi in pmi_scores.items():
        if abs(pmi) < 0.3:
            continue
        ia, ib = title_to_idx.get(a, -1), title_to_idx.get(b, -1)
        if ia >= 0 and ib >= 0:
            sparse.append([ia, ib, round(pmi, 2)])
    
    # Sort by PMI descending
    sparse.sort(key=lambda x: -x[2])
    return sparse

def main():
    ingredients = load_ingredients()
    vectors, dim = load_embeddings()
    
    # K-means clustering
    cluster_map, cluster_info = kmeans(vectors, ingredients, k=24)
    
    # PMI from recipes
    pmi_scores, occurrence, co_occurrence, n_recipes = compute_pmi(RECIPES, ingredients)
    
    # Build sparse PMI matrix
    sparse_pmi = build_sparse_pmi(pmi_scores, ingredients)
    
    # Build ingredient frequency (how many recipes each appears in)
    freq = {}
    for ing, count in occurrence.items():
        freq[ing] = count
    
    # Output
    output = {
        "version": 1,
        "n_recipes": n_recipes,
        "n_ingredients": len(ingredients),
        "n_pairs": len(sparse_pmi),
        "clusters": {
            "k": 24,
            "assignments": [cluster_map.get(t, -1) for t in ingredients],
            "info": cluster_info,
        },
        "pmi": sparse_pmi,  # [[idx_a, idx_b, pmi_score], ...]
        "freq": {ing: count for ing, count in sorted(occurrence.items(), key=lambda x: -x[1])[:200]},
    }
    
    out_path = os.path.join(ROOT, "cards", "data", "yum-complementarity.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    
    size_kb = os.path.getsize(out_path) / 1024
    print(f"\nWrote {out_path} ({size_kb:.1f} KB)")
    print(f"  {len(sparse_pmi)} PMI pairs, {sum(1 for c in cluster_map.values() if c >= 0)} clustered ingredients")

if __name__ == "__main__":
    main()
