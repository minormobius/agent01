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
# Each recipe: (dish_name, wikipedia_slug, [ingredients])
# Ingredients must match our pool exactly. Wikipedia slug is for fetching dish data.

# Each recipe: (dish_name, wikipedia_title, [ingredients])
# wikipedia_title is the Wikipedia article name for the dish

RECIPES = [
    # ── Italian ──
    ("Marinara sauce", "Marinara_sauce", ["Tomato", "Garlic", "Basil", "Olive oil", "Parmesan cheese"]),
    ("Caprese salad", "Caprese_salad", ["Tomato", "Mozzarella", "Basil", "Olive oil"]),
    ("Aglio e olio", "Aglio_e_olio", ["Garlic", "Olive oil", "Chili pepper", "Parsley"]),
    ("Carbonara", "Carbonara", ["Pancetta", "Chicken egg", "Parmesan cheese", "Black pepper"]),
    ("Bolognese", "Bolognese_sauce", ["Tomato", "Onion", "Carrot", "Celery", "Beef", "Red wine"]),
    ("Parmigiana", "Parmigiana", ["Eggplant", "Tomato", "Garlic", "Basil", "Olive oil", "Parmesan cheese"]),
    ("Ratatouille", "Ratatouille", ["Zucchini", "Tomato", "Garlic", "Basil"]),
    ("Prosciutto e melone", "Prosciutto_e_melone", ["Prosciutto", "Cantaloupe"]),
    ("Ricotta-spinach filling", "Ravioli", ["Ricotta", "Spinach", "Nutmeg", "Parmesan cheese"]),
    ("Pesto genovese", "Pesto", ["Pesto", "Pine nut", "Garlic", "Basil", "Parmesan cheese", "Olive oil"]),
    ("Puttanesca", "Pasta_puttanesca", ["Anchovy", "Tomato", "Olive oil", "Garlic", "Chili pepper"]),
    ("Linguine alle vongole", "Linguine_alle_vongole", ["Clam", "Garlic", "White wine", "Parsley", "Chili pepper"]),

    # ── French ──
    ("Garlic butter", "Compound_butter", ["Butter", "Garlic", "Parsley", "Lemon"]),
    ("French onion soup", "French_onion_soup", ["Onion", "Beef", "Gruyère cheese", "Butter", "Thyme"]),
    ("Béarnaise sauce", "Béarnaise_sauce", ["Butter", "Chicken egg", "Lemon", "Tarragon"]),
    ("Coq au vin", "Coq_au_vin", ["Chicken (food)", "Shiitake", "Heavy cream", "White wine", "Thyme"]),
    ("Duck à l'orange", "Duck_à_l%27orange", ["Duck (food)", "Orange", "Honey"]),
    ("Vichyssoise", "Vichyssoise", ["Leek", "Potato", "Butter", "Heavy cream"]),
    ("Pâte sablée", "Shortcrust_pastry", ["Butter", "Chicken egg", "Sugar", "Vanilla", "All-purpose flour"]),
    ("Red wine reduction", "Reduction_(cooking)", ["Shallot", "Red wine", "Butter", "Thyme"]),
    ("Gravlax sauce", "Gravlax", ["Salmon", "Dill", "Lemon", "Heavy cream"]),
    ("Roast lamb", "Roast_lamb", ["Lamb and mutton", "Rosemary", "Garlic", "Thyme"]),

    # ── Japanese ──
    ("Salmon sushi", "Sushi", ["Salmon", "Rice", "Nori", "Rice vinegar"]),
    ("Tuna sashimi", "Sashimi", ["Tuna", "Soy sauce", "Wasabi", "Ginger"]),
    ("Miso soup", "Miso_soup", ["Miso", "Tofu", "Scallion", "Wakame"]),
    ("Yakitori", "Yakitori", ["Chicken (food)", "Soy sauce", "Mirin", "Ginger", "Scallion"]),
    ("Shogayaki", "Shōgayaki", ["Pork", "Ginger", "Soy sauce", "Scallion", "Garlic"]),
    ("Tempura", "Tempura", ["Shrimp (food)", "All-purpose flour", "Chicken egg"]),
    ("Sunomono", "Sunomono", ["Cucumber", "Rice vinegar", "Sesame seed", "Soy sauce"]),
    ("Edamame", "Edamame", ["Edamame", "Salt"]),
    ("Saba misoni", "Saba_misoni", ["Mackerel", "Miso", "Ginger"]),

    # ── Chinese ──
    ("Twice-cooked pork", "Twice_cooked_pork", ["Pork", "Ginger", "Garlic", "Soy sauce", "Scallion", "Chili pepper"]),
    ("Kung pao chicken", "Kung_Pao_chicken", ["Chicken (food)", "Peanut", "Chili pepper", "Soy sauce", "Ginger", "Garlic"]),
    ("Mapo tofu", "Mapo_tofu", ["Tofu", "Pork", "Chili pepper", "Szechuan pepper", "Garlic"]),
    ("Beef and broccoli", "Beef_and_broccoli", ["Beef", "Broccoli", "Soy sauce", "Garlic", "Ginger"]),
    ("Peking duck", "Peking_duck", ["Duck (food)", "Scallion", "Cucumber", "Hoisin sauce"]),
    ("Egg fried rice", "Fried_rice", ["Chicken egg", "Scallion", "Soy sauce", "Sesame oil"]),
    ("Jiaozi filling", "Jiaozi", ["Pork", "Cabbage", "Ginger", "Soy sauce", "Sesame oil"]),
    ("Chili garlic shrimp", "Chili_pepper", ["Shrimp (food)", "Garlic", "Chili pepper", "Scallion"]),
    ("Yu xiang eggplant", "Yu_xiang", ["Eggplant", "Garlic", "Soy sauce", "Chili pepper"]),

    # ── Indian ──
    ("Chicken tikka masala", "Chicken_tikka_masala", ["Chicken (food)", "Yogurt", "Cumin", "Coriander", "Turmeric", "Chili pepper", "Garlic", "Ginger"]),
    ("Dal", "Dal", ["Lentil", "Turmeric", "Cumin", "Onion", "Tomato", "Garlic"]),
    ("Chana masala", "Chana_masala", ["Chickpea", "Tomato", "Onion", "Cumin", "Coriander", "Turmeric"]),
    ("Aloo gobi", "Aloo_gobi", ["Potato", "Cauliflower", "Turmeric", "Cumin", "Ginger"]),
    ("Palak paneer", "Palak_paneer", ["Spinach", "Paneer", "Garlic", "Ginger", "Cumin"]),
    ("Rogan josh", "Rogan_josh", ["Lamb and mutton", "Yogurt", "Cardamom", "Cinnamon", "Clove", "Onion"]),
    ("Coconut shrimp curry", "Fish_curry", ["Coconut", "Shrimp (food)", "Turmeric", "Chili pepper", "Curry leaf"]),
    ("Biryani", "Biryani", ["Rice", "Cardamom", "Cinnamon", "Clove", "Saffron", "Onion"]),
    ("Aam ras", "Aam_ras", ["Mango", "Sugar", "Cardamom"]),
    ("Rasam", "Rasam", ["Tamarind", "Tomato", "Chili pepper", "Cumin"]),

    # ── Thai ──
    ("Tom kha gai", "Tom_kha_kai", ["Coconut", "Chicken (food)", "Galangal", "Lemongrass", "Lime (fruit)", "Chili pepper"]),
    ("Tom yum goong", "Tom_yum", ["Shrimp (food)", "Lemongrass", "Galangal", "Lime (fruit)", "Chili pepper", "Fish sauce"]),
    ("Pad krapow", "Pad_kra_pao", ["Beef", "Basil", "Chili pepper", "Garlic", "Fish sauce"]),
    ("Som tam", "Som_tam", ["Papaya", "Chili pepper", "Lime (fruit)", "Fish sauce", "Peanut"]),
    ("Massaman curry", "Massaman_curry", ["Pork", "Coconut", "Peanut", "Turmeric"]),
    ("Mango sticky rice", "Mango_sticky_rice", ["Mango", "Coconut", "Rice"]),

    # ── Mexican ──
    ("Guacamole", "Guacamole", ["Avocado", "Lime (fruit)", "Onion", "Chili pepper", "Cilantro", "Tomato"]),
    ("Pico de gallo", "Pico_de_gallo", ["Tomato", "Onion", "Chili pepper", "Cilantro", "Lime (fruit)"]),
    ("Al pastor", "Al_pastor", ["Pork", "Chili pepper", "Onion", "Garlic", "Cumin", "Orange"]),
    ("Pollo asado", "Pollo_asado", ["Chicken (food)", "Lime (fruit)", "Cumin", "Chili pepper", "Onion"]),
    ("Frijoles negros", "Frijoles_negros", ["Black bean", "Onion", "Garlic", "Cumin", "Chili pepper"]),
    ("Mole", "Mole_(sauce)", ["Chocolate", "Chili pepper", "Cinnamon", "Cumin"]),
    ("Elote", "Elote", ["Corn", "Lime (fruit)", "Chili pepper", "Mayonnaise", "Cotija cheese"]),

    # ── Korean ──
    ("Jeyuk bokkeum", "Jeyuk_bokkeum", ["Pork", "Gochujang", "Garlic", "Ginger", "Sesame oil", "Scallion"]),
    ("Bulgogi", "Bulgogi", ["Beef", "Soy sauce", "Pear", "Garlic", "Sesame oil", "Scallion"]),
    ("Sundubu-jjigae", "Sundubu-jjigae", ["Tofu", "Gochujang", "Scallion", "Chicken egg"]),
    ("Kimchi", "Kimchi", ["Cabbage", "Chili pepper", "Garlic", "Ginger", "Fish sauce", "Scallion"]),
    ("Bibimbap", "Bibimbap", ["Rice", "Chicken egg", "Beef", "Spinach", "Carrot", "Sesame oil", "Gochujang"]),

    # ── Middle Eastern ──
    ("Hummus", "Hummus", ["Chickpea", "Tahini", "Lemon", "Garlic", "Olive oil"]),
    ("Baba ghanoush", "Baba_ghanoush", ["Eggplant", "Tahini", "Lemon", "Garlic"]),
    ("Musakhan", "Musakhan", ["Lamb and mutton", "Sumac", "Onion", "Pine nut", "Parsley"]),
    ("Falafel", "Falafel", ["Chickpea", "Parsley", "Onion", "Cumin", "Coriander"]),
    ("Tabbouleh", "Tabbouleh", ["Bulgur", "Tomato", "Parsley", "Onion", "Lemon", "Olive oil"]),
    ("Tzatziki", "Tzatziki", ["Yogurt", "Cucumber", "Garlic", "Mint", "Olive oil"]),
    ("Fesenjan", "Fesenjān", ["Pomegranate", "Walnut", "Chicken (food)"]),

    # ── Mediterranean ──
    ("Ladolemono", "Ladolemono", ["Olive oil", "Lemon", "Garlic", "Oregano"]),
    ("Greek salad", "Greek_salad", ["Feta", "Tomato", "Cucumber", "Onion", "Olive oil", "Oregano"]),
    ("Kleftiko", "Kleftiko", ["Lamb and mutton", "Oregano", "Lemon", "Garlic", "Olive oil"]),
    ("Grilled octopus", "Octopus", ["Octopus", "Olive oil", "Lemon", "Oregano"]),
    ("Fagioli all'uccelletto", "Fagioli_all%27uccelletto", ["Navy bean", "Tomato", "Garlic", "Rosemary", "Olive oil"]),

    # ── Southeast Asian ──
    ("Bumbu spice paste", "Bumbu_(seasoning)", ["Lemongrass", "Ginger", "Garlic", "Chili pepper", "Turmeric"]),
    ("Satay sauce", "Satay", ["Peanut", "Coconut", "Lime (fruit)", "Chili pepper", "Soy sauce"]),
    ("Pad thai sauce", "Pad_thai", ["Shrimp (food)", "Tamarind", "Peanut", "Chili pepper", "Fish sauce"]),
    ("Vietnamese caramel pork", "Thịt_kho", ["Pork", "Lemongrass", "Fish sauce", "Chili pepper", "Sugar"]),

    # ── American ──
    ("Hamburger", "Hamburger", ["Beef", "Lettuce", "Tomato", "Onion", "Ketchup", "Mustard (condiment)"]),
    ("BBQ pulled pork", "Pulled_pork", ["Pork", "Mustard (condiment)", "Apple cider vinegar", "Brown sugar", "Chili pepper"]),
    ("Buttered corn", "Corn_on_the_cob", ["Corn", "Butter", "Salt"]),
    ("Mashed potatoes", "Mashed_potato", ["Potato", "Heavy cream", "Butter", "Chive"]),
    ("Buffalo wings", "Buffalo_wing", ["Chicken (food)", "Hot sauce", "Butter", "Celery"]),
    ("BLT", "BLT", ["Bacon", "Lettuce", "Tomato", "Mayonnaise"]),
    ("Apple pie", "Apple_pie", ["Apple", "Cinnamon", "Sugar", "Butter", "Lemon"]),
    ("Pumpkin spice", "Pumpkin_pie_spice", ["Pumpkin", "Cinnamon", "Nutmeg", "Ginger", "Clove", "Sugar"]),
    ("Pecan pie", "Pecan_pie", ["Pecan", "Brown sugar", "Butter", "Vanilla"]),

    # ── Classic pairings ──
    ("Strawberries and cream", "Strawberries_and_cream", ["Strawberry", "Heavy cream", "Sugar"]),
    ("Chocolate ganache", "Ganache", ["Chocolate", "Vanilla", "Heavy cream"]),
    ("Chocolate raspberry", "Chocolate", ["Chocolate", "Raspberry"]),
    ("Chocolate orange", "Terry%27s_Chocolate_Orange", ["Chocolate", "Orange"]),
    ("Gianduja", "Gianduja_(chocolate)", ["Chocolate", "Hazelnut"]),
    ("Mocha", "Caffè_mocha", ["Chocolate", "Coffee"]),
    ("Blueberry lemon", "Lemon_curd", ["Lemon", "Blueberry", "Sugar"]),
    ("Apple and cheddar", "Apple", ["Apple", "Cheddar cheese"]),
    ("Fig and goat cheese", "Fig", ["Fig", "Goat cheese", "Honey", "Walnut"]),
    ("Pear and blue cheese", "Pear", ["Pear", "Blue cheese", "Walnut", "Honey"]),
    ("Watermelon feta", "Watermelon", ["Watermelon", "Feta", "Mint"]),
    ("Peach caprese", "Caprese_salad", ["Peach", "Basil", "Mozzarella"]),
    ("Beet and goat cheese", "Beetroot", ["Beetroot", "Goat cheese", "Walnut"]),
    ("Carrot ginger soup", "Carrot_soup", ["Carrot", "Ginger", "Orange"]),
    ("Roasted cauliflower", "Cauliflower", ["Cauliflower", "Cumin", "Turmeric"]),
    ("Mushrooms on toast", "Mushroom", ["Shiitake", "Thyme", "Garlic", "Butter"]),
    ("Asparagus parm", "Asparagus", ["Asparagus", "Lemon", "Parmesan cheese"]),
    ("Truffle eggs", "Truffle", ["Truffle", "Chicken egg", "Parmesan cheese"]),
    ("Fennel orange salad", "Fennel", ["Fennel", "Orange", "Olive oil"]),
    ("Ants on a log", "Ants_on_a_log", ["Celery", "Peanut butter"]),

    # ── Breakfast ──
    ("Bacon and eggs", "Full_breakfast", ["Chicken egg", "Bacon", "Bread"]),
    ("Overnight oats", "Overnight_oats", ["Oat", "Banana", "Honey", "Cinnamon"]),
    ("Yogurt parfait", "Parfait", ["Yogurt", "Blueberry", "Oat", "Honey"]),
    ("Blueberry pancakes", "Pancake", ["All-purpose flour", "Maple syrup", "Butter", "Blueberry"]),
    ("Avocado toast", "Avocado_toast", ["Avocado", "Chicken egg", "Chili pepper", "Lemon"]),
    ("Smoked salmon bagel", "Lox", ["Smoked salmon", "Cream cheese", "Dill", "Lemon"]),

    # ── Seafood combos ──
    ("Lobster with butter", "Lobster", ["Lobster", "Butter", "Lemon"]),
    ("Oysters mignonette", "Mignonette_sauce", ["Oyster", "Lemon", "Shallot", "Red wine vinegar"]),
    ("Crab boil", "Crab_boil", ["Crab", "Lemon", "Butter", "Old Bay seasoning"]),
    ("Seared scallops", "Scallop", ["Scallop", "Butter", "Lemon", "Garlic"]),
    ("Tuna crudo", "Crudo", ["Tuna", "Olive oil", "Lemon", "Caper"]),
    ("Cod meunière", "Meunière_sauce", ["Cod", "Lemon", "Dill", "Butter"]),
    ("Sardines on toast", "Sardine", ["Sardine", "Lemon", "Olive oil", "Parsley"]),
    ("Moules marinières", "Moules-frites", ["Mussel", "White wine", "Garlic", "Shallot", "Parsley"]),
    ("Shrimp scampi", "Shrimp_scampi", ["Shrimp (food)", "Garlic", "Butter", "Lemon", "Parsley"]),
    ("Calamari", "Calamari", ["Squid (food)", "Lemon", "Garlic", "Olive oil", "Parsley"]),

    # ── Spice combos ──
    ("Curry powder", "Curry_powder", ["Cumin", "Coriander", "Turmeric", "Chili pepper"]),
    ("Pumpkin pie spice", "Pumpkin_pie_spice", ["Cinnamon", "Cardamom", "Clove", "Nutmeg"]),
    ("Five-spice powder", "Five-spice_powder", ["Star anise", "Cinnamon", "Clove", "Szechuan pepper", "Fennel"]),
    ("Italian herbs", "Herbes_de_Provence", ["Basil", "Oregano", "Thyme", "Rosemary"]),
    ("Chinese aromatics", "Mirepoix_(cuisine)", ["Garlic", "Ginger", "Scallion"]),
    ("Ras el hanout base", "Ras_el_hanout", ["Cumin", "Paprika", "Coriander", "Chili pepper"]),
    ("Thai aromatics", "Thai_cuisine", ["Lemongrass", "Galangal", "Kaffir lime leaf"]),

    # ── Salad combos ──
    ("Arugula parmesan salad", "Arugula", ["Arugula", "Parmesan cheese", "Lemon", "Olive oil"]),
    ("Kale caesar", "Caesar_salad", ["Kale", "Lemon", "Olive oil", "Garlic", "Parmesan cheese"]),
    ("Spinach strawberry salad", "Spinach_salad", ["Spinach", "Strawberry", "Walnut", "Goat cheese"]),
    ("Coleslaw", "Coleslaw", ["Cabbage", "Carrot", "Mayonnaise", "Apple cider vinegar"]),
    ("Insalata caprese", "Caprese_salad", ["Tomato", "Basil", "Mozzarella", "Olive oil", "Balsamic vinegar"]),
    ("Tzatziki dip", "Tzatziki", ["Cucumber", "Dill", "Yogurt", "Garlic"]),

    # ── Grain bowls ──
    ("Quinoa black bean bowl", "Quinoa", ["Quinoa", "Avocado", "Black bean", "Lime (fruit)", "Cilantro"]),
    ("Coconut rice", "Coconut_rice", ["Rice", "Coconut", "Mango"]),
    ("Farro beet salad", "Farro", ["Farro", "Beetroot", "Goat cheese", "Walnut"]),
    ("Couscous salad", "Couscous", ["Couscous", "Chickpea", "Lemon", "Parsley", "Olive oil"]),

    # ── Beverage pairings ──
    ("Coffee with cream", "Coffee", ["Coffee", "Heavy cream", "Sugar"]),
    ("Lemon tea", "Tea", ["Tea", "Lemon", "Honey"]),
    ("Matcha latte", "Matcha", ["Matcha", "Coconut"]),
    ("Ginger tea", "Ginger_tea", ["Ginger", "Lemon", "Honey"]),

    # ── Dessert combos ──
    ("Crème anglaise", "Crème_anglaise", ["Vanilla", "Sugar", "Heavy cream", "Chicken egg"]),
    ("Lemon curd", "Lemon_curd", ["Lemon", "Sugar", "Butter", "Chicken egg"]),
    ("Coconut lime", "Key_lime_pie", ["Coconut", "Lime (fruit)", "Sugar"]),
    ("Almond rose", "Turkish_delight", ["Almond", "Honey", "Rose water"]),
    ("Pistachio kulfi", "Kulfi", ["Pistachio", "Cardamom", "Rose water"]),
    ("Banana split", "Banana_split", ["Banana", "Chocolate", "Peanut butter"]),
    ("Mango chili", "Chamoyada", ["Mango", "Lime (fruit)", "Chili pepper"]),
    ("Bounty bar", "Bounty_(chocolate_bar)", ["Coconut", "Chocolate", "Almond"]),

    # ── Fermentation/umami combos ──
    ("Japanese dashi base", "Dashi", ["Soy sauce", "Miso", "Sake", "Mirin"]),
    ("Nuoc cham", "Nước_chấm", ["Fish sauce", "Lime (fruit)", "Chili pepper", "Sugar"]),
    ("Worcestershire marinade", "Worcestershire_sauce", ["Worcestershire sauce", "Mustard (condiment)", "Garlic"]),
    ("Balsamic dressing", "Balsamic_vinegar", ["Balsamic vinegar", "Olive oil", "Garlic"]),
    ("Kimchi jjigae base", "Kimchi-jjigae", ["Kimchi", "Pork", "Tofu", "Scallion"]),
    ("Miso dressing", "Miso", ["Miso", "Ginger", "Garlic", "Sesame oil"]),

    # ── African ──
    ("Groundnut stew", "Groundnut_soup", ["Peanut", "Tomato", "Onion", "Chili pepper", "Chicken (food)"]),
    ("Berbere base", "Berbere", ["Berbere", "Onion", "Garlic", "Ginger"]),
    ("Shiro", "Shiro_(food)", ["Chickpea", "Tomato", "Berbere", "Onion"]),

    # ── South American ──
    ("Black beans and rice", "Gallo_pinto", ["Black bean", "Rice", "Garlic", "Onion"]),
    ("Chimichurri steak", "Chimichurri", ["Beef", "Chimichurri", "Garlic", "Parsley"]),
    ("Guasacaca", "Guasacaca", ["Avocado", "Tomato", "Onion", "Lime (fruit)"]),
    ("Tostones", "Tostones", ["Plantain", "Black bean", "Garlic"]),

    # ── More classic combos ──
    ("Rosemary potatoes", "Roast_potato", ["Potato", "Rosemary", "Garlic", "Olive oil"]),
    ("Candied sweet potato", "Candied_sweet_potato", ["Sweet potato", "Cinnamon", "Butter", "Brown sugar"]),
    ("Roasted Brussels sprouts", "Brussels_sprout", ["Brussels sprout", "Bacon", "Balsamic vinegar"]),
    ("Green beans amandine", "Green_bean_casserole", ["Green bean", "Almond", "Lemon", "Butter"]),
    ("Beet orange salad", "Beetroot", ["Beetroot", "Orange", "Walnut"]),
    ("Carrot cumin soup", "Carrot_soup", ["Carrot", "Cumin", "Lemon", "Olive oil"]),
    ("Pea and mint", "Pea_soup", ["Garden pea", "Mint", "Lemon"]),
    ("Mexican street corn", "Esquites", ["Corn", "Chili pepper", "Lime (fruit)", "Butter"]),
    ("Artichoke dip", "Artichoke_dip", ["Artichoke", "Lemon", "Garlic", "Olive oil"]),
    ("Leek gratin", "Gratin", ["Leek", "Gruyère cheese", "Butter"]),
    ("Turnip apple mash", "Neeps_and_tatties", ["Turnip", "Apple", "Butter"]),
    ("Honey parsnips", "Parsnip", ["Parsnip", "Honey", "Thyme"]),
    ("Radish with butter", "Radish", ["Radish", "Butter", "Salt"]),

    # ── Nut/seed pairings ──
    ("Spiced cashews", "Cashew", ["Cashew", "Coconut", "Chili pepper", "Lime (fruit)"]),
    ("Chocolate almond bark", "Chocolate_bar", ["Almond", "Chocolate", "Orange"]),
    ("Blue cheese walnuts", "Stilton_cheese", ["Walnut", "Honey", "Blue cheese"]),
    ("Pistachio salad", "Pistachio", ["Pistachio", "Lemon", "Olive oil"]),
    ("Sesame dipping sauce", "Sesame", ["Sesame seed", "Soy sauce", "Ginger"]),
    ("Pepitas", "Pepita_(food)", ["Pumpkin seed", "Chili pepper", "Lime (fruit)"]),

    # ── Cheese pairings ──
    ("Brie board", "Brie", ["Brie", "Apple", "Honey", "Walnut"]),
    ("Gruyère soufflé", "Soufflé", ["Gruyère cheese", "Onion", "Nutmeg"]),
    ("Truffle butter pasta", "Truffle_butter", ["Parmesan cheese", "Truffle", "Butter"]),
    ("Gouda apple", "Gouda_cheese", ["Gouda cheese", "Apple", "Mustard (condiment)"]),
    ("Manchego membrillo", "Manchego", ["Manchego cheese", "Quince", "Almond"]),
    ("Stilton and pear", "Stilton_cheese", ["Stilton cheese", "Pear", "Walnut", "Honey"]),
    ("Halloumi watermelon", "Halloumi", ["Halloumi", "Watermelon", "Mint"]),
]

# ── PMI computation ─────────────────────────────────────────────────

def compute_pmi(recipes, all_ingredients):
    """Compute pointwise mutual information for ingredient pairs"""
    title_set = set(all_ingredients)
    title_to_idx = {t: i for i, t in enumerate(all_ingredients)}
    
    # Filter recipes to only include known ingredients
    clean_recipes = []
    unknown = set()
    for entry in recipes:
        name, wiki, ingredients = entry
        clean = [ing for ing in ingredients if ing in title_set]
        missed = [ing for ing in ingredients if ing not in title_set]
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
    
    # Build dish list with ingredient indices
    title_to_idx = {t: i for i, t in enumerate(ingredients)}
    title_set = set(ingredients)
    dishes = []
    for name, wiki, ings in RECIPES:
        matched = [i for i in ings if i in title_set]
        if len(matched) < 2:
            continue
        dishes.append({
            "name": name,
            "wiki": wiki,
            "ingredients": [title_to_idx[i] for i in matched if i in title_to_idx],
        })

    # Output
    output = {
        "version": 2,
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
        "dishes": dishes,  # [{name, wiki, ingredients: [idx...]}]
    }
    
    out_path = os.path.join(ROOT, "cards", "data", "yum-complementarity.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    
    size_kb = os.path.getsize(out_path) / 1024
    print(f"\nWrote {out_path} ({size_kb:.1f} KB)")
    print(f"  {len(sparse_pmi)} PMI pairs, {sum(1 for c in cluster_map.values() if c >= 0)} clustered ingredients")

if __name__ == "__main__":
    main()
