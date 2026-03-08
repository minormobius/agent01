#!/usr/bin/env python3
# v4 — use action API prop=pageviews in dedicated query (REST API too slow for 6800 articles)
"""
Score Wikipedia Featured Articles by the deep-Wikipedia triangulation:
    high quality (FA/GA) × low pageviews × high citations × low translations

Fetches all Featured Articles (~6,800) via categorymembers, then batches
metadata queries to score each article. Outputs a ranked JSON file and
optionally regenerates the card pool.

The "deep score" formula:
    deep = (extlinks * sqrt(length)) / max(1, avg_pageviews * langlinks)

High extlinks (well-sourced) and high length (deeply written), divided by
pageviews (fame) and langlinks (global reach). The result: articles that
Wikipedia editors perfected but nobody reads.

Usage:
    # Full run — score all Featured Articles
    python3 scripts/score-deep-wikipedia.py

    # Include Good Articles too (slower, ~43K articles)
    python3 scripts/score-deep-wikipedia.py --include-ga

    # Limit to N articles for testing
    python3 scripts/score-deep-wikipedia.py --limit 100

    # Custom output path
    python3 scripts/score-deep-wikipedia.py -o cards/data/deep-wikipedia.json
"""

import argparse
import json
import math
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

WIKI_API = "https://en.wikipedia.org/w/api.php"
BATCH_SIZE = 50  # max titles per query for pageviews
RATE_DELAY = 0.2  # seconds between API calls (be polite)

# Map WikiProject names → our 18-bin Wikinatomy categories
WIKIPROJECT_MAP = {
    # Life Sciences
    "biology": "LIFE_SCI", "animals": "LIFE_SCI", "plants": "LIFE_SCI",
    "ecology": "LIFE_SCI", "genetics": "LIFE_SCI", "insects": "LIFE_SCI",
    "birds": "LIFE_SCI", "mammals": "LIFE_SCI", "amphibians and reptiles": "LIFE_SCI",
    "fishes": "LIFE_SCI", "marine life": "LIFE_SCI", "fungi": "LIFE_SCI",
    "microbiology": "LIFE_SCI", "molecular biology": "LIFE_SCI",
    "palaeontology": "LIFE_SCI", "zoology": "LIFE_SCI", "botany": "LIFE_SCI",
    "dinosaurs": "LIFE_SCI", "dogs": "LIFE_SCI", "cats": "LIFE_SCI",
    "spiders": "LIFE_SCI", "tree of life": "LIFE_SCI",
    # Medicine
    "medicine": "MEDICINE", "pharmacology": "MEDICINE", "anatomy": "MEDICINE",
    "dentistry": "MEDICINE", "nursing": "MEDICINE", "neuroscience": "MEDICINE",
    "psychology": "MEDICINE", "toxicology": "MEDICINE", "veterinary medicine": "MEDICINE",
    "diseases": "MEDICINE", "death": "MEDICINE",
    # Physical Sciences
    "physics": "PHYS_SCI", "chemistry": "PHYS_SCI", "elements": "PHYS_SCI",
    "materials": "PHYS_SCI", "particle physics": "PHYS_SCI",
    # Earth & Environment
    "geology": "EARTH", "meteorology": "EARTH", "climate change": "EARTH",
    "environment": "EARTH", "rivers": "EARTH", "lakes": "EARTH",
    "volcanoes": "EARTH", "earthquakes": "EARTH", "mountains": "EARTH",
    # Space
    "astronomy": "COSMOS", "spaceflight": "COSMOS", "solar system": "COSMOS",
    "mars": "COSMOS", "jupiter": "COSMOS", "saturn": "COSMOS",
    "astronomical objects": "COSMOS", "cosmology": "COSMOS",
    # Math
    "mathematics": "MATH", "statistics": "MATH", "cryptography": "MATH",
    # Technology
    "technology": "TECH", "computing": "TECH", "software": "TECH",
    "electronics": "TECH", "engineering": "TECH", "robotics": "TECH",
    "telecommunications": "TECH", "internet": "TECH", "aviation": "TECH",
    "automobiles": "TECH", "trains": "TECH", "ships": "TECH",
    "bridges": "TECH", "nuclear technology": "TECH", "energy": "TECH",
    "computer science": "TECH",
    # Geography
    "geography": "GEO", "countries": "GEO", "cities": "GEO",
    "islands": "GEO", "protected areas": "GEO", "parks": "GEO",
    "australia": "GEO", "canada": "GEO", "india": "GEO", "china": "GEO",
    "japan": "GEO", "united kingdom": "GEO", "united states": "GEO",
    "africa": "GEO", "europe": "GEO", "asia": "GEO",
    # History
    "history": "HISTORY", "archaeology": "HISTORY",
    "ancient egypt": "HISTORY", "ancient rome": "HISTORY",
    "ancient greece": "HISTORY", "medieval": "HISTORY",
    "british history": "HISTORY", "american history": "HISTORY",
    "biography": "HISTORY",
    # Military
    "military history": "MILITARY", "warships": "MILITARY",
    "weaponry": "MILITARY", "world war i": "MILITARY",
    "world war ii": "MILITARY", "aviation/military": "MILITARY",
    # Society
    "politics": "SOCIETY", "law": "SOCIETY", "economics": "SOCIETY",
    "business": "SOCIETY", "education": "SOCIETY", "sociology": "SOCIETY",
    "feminism": "SOCIETY", "human rights": "SOCIETY", "crime": "SOCIETY",
    "government": "SOCIETY", "organizations": "SOCIETY",
    # Philosophy
    "philosophy": "PHILOSOPHY", "religion": "PHILOSOPHY",
    "christianity": "PHILOSOPHY", "islam": "PHILOSOPHY",
    "buddhism": "PHILOSOPHY", "hinduism": "PHILOSOPHY",
    "judaism": "PHILOSOPHY", "mythology": "PHILOSOPHY",
    # Literature
    "literature": "LITERATURE", "novels": "LITERATURE", "poetry": "LITERATURE",
    "comics": "LITERATURE", "writing systems": "LITERATURE",
    "languages": "LITERATURE", "linguistics": "LITERATURE",
    # Visual Arts
    "visual arts": "VISUAL_ARTS", "painting": "VISUAL_ARTS",
    "sculpture": "VISUAL_ARTS", "architecture": "VISUAL_ARTS",
    "art": "VISUAL_ARTS", "photography": "VISUAL_ARTS",
    # Music
    "music": "MUSIC", "opera": "MUSIC", "hip hop": "MUSIC",
    "rock music": "MUSIC", "classical music": "MUSIC",
    "jazz": "MUSIC", "electronic music": "MUSIC",
    "songs": "MUSIC", "albums": "MUSIC", "musicians": "MUSIC",
    "musical instruments": "MUSIC", "dance": "MUSIC",
    # Film
    "film": "FILM", "television": "FILM", "animation": "FILM",
    "disney": "FILM", "broadcasting": "FILM", "media": "FILM",
    # Sports
    "sports": "SPORTS", "football": "SPORTS", "baseball": "SPORTS",
    "basketball": "SPORTS", "cricket": "SPORTS", "rugby": "SPORTS",
    "olympics": "SPORTS", "tennis": "SPORTS", "chess": "SPORTS",
    "athletics": "SPORTS", "martial arts": "SPORTS", "swimming": "SPORTS",
    "cycling": "SPORTS", "motorsport": "SPORTS", "golf": "SPORTS",
    "games": "SPORTS", "board and table games": "SPORTS",
    "association football": "SPORTS", "ice hockey": "SPORTS",
    "american football": "SPORTS",
    # Everyday
    "food and drink": "EVERYDAY", "fashion": "EVERYDAY",
    "textiles": "EVERYDAY", "agriculture": "EVERYDAY",
    "gardening": "EVERYDAY", "wine": "EVERYDAY", "beer": "EVERYDAY",
    "cooking": "EVERYDAY", "toys": "EVERYDAY",
}

# Fallback: map Wikipedia categories to bins
CATEGORY_KEYWORDS = {
    "LIFE_SCI": ["animal", "plant", "species", "organism", "biological", "genus", "family ("],
    "MEDICINE": ["disease", "medical", "drug", "syndrome", "virus", "pathology"],
    "PHYS_SCI": ["physics", "chemical", "element", "particle", "quantum"],
    "EARTH": ["geological", "weather", "climate", "volcano", "earthquake", "river"],
    "COSMOS": ["star", "planet", "galaxy", "asteroid", "comet", "nebula", "constellation"],
    "MATH": ["mathematical", "theorem", "equation", "number theory"],
    "TECH": ["technology", "computer", "software", "engineering", "aircraft", "ship class"],
    "GEO": ["country", "city", "state", "province", "island", "mountain", "region"],
    "HISTORY": ["century", "dynasty", "empire", "ancient", "medieval", "archaeological"],
    "MILITARY": ["battle", "war", "military", "campaign", "siege", "naval"],
    "SOCIETY": ["political", "election", "government", "organization", "protest"],
    "PHILOSOPHY": ["philosophy", "religion", "theological", "spiritual"],
    "LITERATURE": ["novel", "poem", "book", "literary", "language"],
    "VISUAL_ARTS": ["painting", "sculpture", "architecture", "art movement"],
    "MUSIC": ["album", "song", "musician", "band", "composer", "symphony", "opera"],
    "FILM": ["film", "television", "tv series", "movie", "animated"],
    "SPORTS": ["football", "baseball", "basketball", "cricket", "rugby", "olympic", "championship"],
    "EVERYDAY": ["food", "drink", "clothing", "cooking", "cuisine"],
}


def wiki_get(params, retries=3):
    """GET request to Wikipedia API with retry."""
    params.update({"format": "json", "origin": "*"})
    url = f"{WIKI_API}?{urlencode(params)}"
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "DeepWikipediaScorer/1.0 (minomobi.com)"})
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except (HTTPError, OSError) as e:
            if attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"  Retry {attempt+1}/{retries} after {wait}s: {e}", file=sys.stderr)
                time.sleep(wait)
            else:
                raise
    return {}


def fetch_category_members(category, cmtype="page", limit=500):
    """Fetch all members of a Wikipedia category, handling continuation."""
    members = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": category,
        "cmtype": cmtype,
        "cmlimit": str(limit),
    }

    while True:
        data = wiki_get(params)
        batch = data.get("query", {}).get("categorymembers", [])
        members.extend(batch)
        print(f"  ... {len(members)} members so far", file=sys.stderr)

        cont = data.get("continue")
        if cont:
            params.update(cont)
            time.sleep(RATE_DELAY)
        else:
            break

    return members



def fetch_metadata_batch(titles):
    """Fetch extlinks, langlinks, info, categories for a batch of titles.

    Split into focused queries to avoid Wikipedia API truncation when too many
    props are requested together.
    """
    if not titles:
        return {}

    # Query 1: info + categories + pageimages + extracts (light props)
    data1 = wiki_get({
        "action": "query",
        "titles": "|".join(titles),
        "prop": "info|categories|pageimages|extracts",
        "inprop": "length",
        "cllimit": "500",
        "clshow": "!hidden",
        "piprop": "thumbnail",
        "pithumbsize": "400",
        "exintro": "1",
        "explaintext": "1",
        "exsentences": "3",
    })

    # Query 2: langlinks (separate to avoid truncation)
    data2 = wiki_get({
        "action": "query",
        "titles": "|".join(titles),
        "prop": "langlinks",
        "lllimit": "500",
    })

    # Query 3: extlinks
    data3 = wiki_get({
        "action": "query",
        "titles": "|".join(titles),
        "prop": "extlinks",
        "ellimit": "500",
    })

    # Query 4: links (for ATK stat)
    data4 = wiki_get({
        "action": "query",
        "titles": "|".join(titles),
        "prop": "links",
        "pllimit": "500",
    })

    # Query 5: pageviews (dedicated query — PageViewInfo extension)
    data5 = wiki_get({
        "action": "query",
        "titles": "|".join(titles),
        "prop": "pageviews",
        "pvipdays": "30",
    })

    pages = data1.get("query", {}).get("pages", {})
    pages2 = data2.get("query", {}).get("pages", {})
    pages3 = data3.get("query", {}).get("pages", {})
    pages4 = data4.get("query", {}).get("pages", {})
    pages5 = data5.get("query", {}).get("pages", {})

    # Merge langlinks, extlinks, links, and pageviews into pages
    for pid, pdata in pages2.items():
        if pid in pages:
            pages[pid]["langlinks"] = pdata.get("langlinks", [])
    for pid, pdata in pages3.items():
        if pid in pages:
            pages[pid]["extlinks"] = pdata.get("extlinks", [])
    for pid, pdata in pages4.items():
        if pid in pages:
            pages[pid]["links"] = pdata.get("links", [])
    for pid, pdata in pages5.items():
        if pid in pages:
            pages[pid]["pageviews"] = pdata.get("pageviews", {})

    return pages


def classify_article(page):
    """Classify an article into one of the 18 Wikinatomy bins."""
    categories = page.get("categories", [])
    cat_titles = [c.get("title", "").replace("Category:", "").lower() for c in categories]

    # Try WikiProject-style categories first
    for cat in cat_titles:
        for project_key, bin_key in WIKIPROJECT_MAP.items():
            if project_key in cat:
                return bin_key

    # Fallback: keyword matching on category names
    cat_text = " ".join(cat_titles)
    best_bin = "HISTORY"  # default
    best_score = 0
    for bin_key, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in cat_text)
        if score > best_score:
            best_score = score
            best_bin = bin_key

    return best_bin


def compute_deep_score(article):
    """Compute the deep-Wikipedia score for an article."""
    extlinks = article["extlinks_count"]
    length = article["length"]
    pageviews = article["avg_pageviews"]
    langlinks = article["langlinks_count"]

    # Numerator: well-sourced × deeply written
    numerator = extlinks * math.sqrt(length)

    # Denominator: fame × global reach (with floors to avoid division by zero)
    denominator = max(10, pageviews) * max(1, langlinks)

    return numerator / denominator


def compute_card_stats(article):
    """Derive card stats from article metadata (same formula as app.js)."""
    length = article["length"]
    langlinks = article["langlinks_count"]
    links = article["links_count"]

    link_density = links / max(1, length / 1000)
    atk = min(99, max(20, round(link_density * 8 + 30)))
    defense = min(99, max(20, round(langlinks * 0.5 + 25)))
    hp = min(999, max(100, round(length / 80)))

    power = atk + defense + hp / 10
    if power >= 160:
        rarity = "legendary"
    elif power >= 130:
        rarity = "rare"
    elif power >= 100:
        rarity = "uncommon"
    else:
        rarity = "common"

    return {"atk": atk, "def": defense, "hp": hp, "rarity": rarity}


def main():
    parser = argparse.ArgumentParser(description="Score Wikipedia Featured Articles for deep-Wikipedia triangulation")
    parser.add_argument("--include-ga", action="store_true", help="Also score Good Articles (~43K, much slower)")
    parser.add_argument("--limit", type=int, default=0, help="Limit to N articles (for testing)")
    parser.add_argument("-o", "--output", default="cards/data/deep-wikipedia.json", help="Output JSON path")
    parser.add_argument("--pool-output", default="cards/data/deep-pool.json", help="Output pool JSON (top articles per bin)")
    parser.add_argument("--per-bin", type=int, default=30, help="Top articles per bin for pool output")
    parser.add_argument("--dry-run", action="store_true", help="Fetch categories only, don't score")
    args = parser.parse_args()

    # Step 1: Fetch all Featured Article titles
    print("Fetching Featured Articles...", file=sys.stderr)
    fa_members = fetch_category_members("Category:Featured articles")
    # Filter to article namespace (ns=0)
    fa_titles = [m["title"] for m in fa_members if m.get("ns", 0) == 0]
    print(f"Found {len(fa_titles)} Featured Articles", file=sys.stderr)

    if args.include_ga:
        print("Fetching Good Articles...", file=sys.stderr)
        ga_members = fetch_category_members("Category:Good articles")
        ga_titles = [m["title"] for m in ga_members if m.get("ns", 0) == 0]
        print(f"Found {len(ga_titles)} Good Articles", file=sys.stderr)
        all_titles = list(dict.fromkeys(fa_titles + ga_titles))  # dedupe, preserve order
        fa_set = set(fa_titles)
    else:
        all_titles = fa_titles
        fa_set = set(fa_titles)

    if args.limit:
        all_titles = all_titles[:args.limit]
        print(f"Limited to {len(all_titles)} articles", file=sys.stderr)

    if args.dry_run:
        print(f"Dry run: would score {len(all_titles)} articles", file=sys.stderr)
        for t in all_titles[:20]:
            print(f"  {t}")
        if len(all_titles) > 20:
            print(f"  ... and {len(all_titles) - 20} more")
        return

    # Step 2: Batch fetch metadata (pageviews included via dedicated prop=pageviews query)
    print(f"Fetching metadata for {len(all_titles)} articles in batches of {BATCH_SIZE}...", file=sys.stderr)
    raw_pages = {}  # title → page data
    for i in range(0, len(all_titles), BATCH_SIZE):
        batch = all_titles[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = math.ceil(len(all_titles) / BATCH_SIZE)
        print(f"  Batch {batch_num}/{total_batches} ({len(batch)} articles)", file=sys.stderr)

        try:
            pages = fetch_metadata_batch(batch)
        except Exception as e:
            print(f"  ERROR in batch {batch_num}: {e}", file=sys.stderr)
            continue

        for pid, page in pages.items():
            if page.get("pageid"):
                raw_pages[page.get("title", "")] = page

        # Debug: show first batch's pageview data
        if batch_num == 1:
            for pid, page in pages.items():
                pv = page.get("pageviews", {})
                ll = page.get("langlinks", [])
                el = page.get("extlinks", [])
                lk = page.get("links", [])
                t = page.get("title", "?")[:40]
                print(f"    SAMPLE {t}: pv_keys={len(pv)} ll={len(ll)} el={len(el)} lk={len(lk)}", file=sys.stderr)
                if pv:
                    sample_vals = list(pv.values())[:3]
                    print(f"      pv_sample={sample_vals}", file=sys.stderr)
                break  # just one sample

        time.sleep(RATE_DELAY * 3)  # extra politeness between batches

    # Step 2b: Extract pageviews from batched metadata
    pv_nonzero = 0
    for title, page in raw_pages.items():
        pv_dict = page.get("pageviews", {})
        # pageviews prop returns {date: count_or_null, ...} for the last N days
        daily = [v for v in pv_dict.values() if v is not None]
        avg = round(sum(daily) / max(1, len(daily)), 1) if daily else 0
        page["_avg_pageviews"] = avg
        if avg > 0:
            pv_nonzero += 1
    print(f"  Pageviews: {len(raw_pages)} total, {pv_nonzero} nonzero", file=sys.stderr)

    # Step 2c: Assemble article records
    articles = []
    for title, page in raw_pages.items():
        article = {
            "title": title,
            "pageid": page["pageid"],
            "length": page.get("length", 0),
            "langlinks_count": len(page.get("langlinks", [])),
            "extlinks_count": len(page.get("extlinks", [])),
            "links_count": len(page.get("links", [])),
            "avg_pageviews": page.get("_avg_pageviews", 0),
            "quality": "FA" if title in fa_set else "GA",
            "extract": page.get("extract", ""),
            "thumbnail": page.get("thumbnail", {}).get("source"),
            "categories": [c.get("title", "").replace("Category:", "")
                           for c in page.get("categories", [])],
        }

        article["bin"] = classify_article(page)
        article["deep_score"] = round(compute_deep_score(article), 4)
        article["stats"] = compute_card_stats(article)

        articles.append(article)

    # Step 3: Sort by deep score
    articles.sort(key=lambda a: a["deep_score"], reverse=True)

    # Step 4: Write full scored output
    output = {
        "meta": {
            "total_scored": len(articles),
            "source": "Wikipedia Featured Articles" + (" + Good Articles" if args.include_ga else ""),
            "formula": "deep = (extlinks * sqrt(length)) / max(10, avg_pageviews) * max(1, langlinks)",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "articles": articles,
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(articles)} scored articles to {args.output}", file=sys.stderr)

    # Step 5: Generate per-bin pool (top N per category)
    bins = {}
    for a in articles:
        b = a["bin"]
        if b not in bins:
            bins[b] = []
        if len(bins[b]) < args.per_bin:
            bins[b].append({
                "title": a["title"],
                "deep_score": a["deep_score"],
                "quality": a["quality"],
                "avg_pageviews": a["avg_pageviews"],
                "extlinks_count": a["extlinks_count"],
                "stats": a["stats"],
                "extract": a["extract"][:200] if a.get("extract") else "",
                "thumbnail": a["thumbnail"],
            })

    pool_output = {
        "meta": output["meta"],
        "per_bin": args.per_bin,
        "bins": bins,
    }

    with open(args.pool_output, "w") as f:
        json.dump(pool_output, f, indent=2, ensure_ascii=False)
    print(f"Wrote top-{args.per_bin}-per-bin pool to {args.pool_output}", file=sys.stderr)

    # Summary
    print("\n=== DEEP WIKIPEDIA: TOP 20 ===", file=sys.stderr)
    for i, a in enumerate(articles[:20]):
        print(
            f"  {i+1:2d}. [{a['bin']:12s}] {a['title'][:50]:50s} "
            f"deep={a['deep_score']:8.2f}  pv={a['avg_pageviews']:7.1f}  "
            f"ext={a['extlinks_count']:3d}  lang={a['langlinks_count']:3d}  "
            f"len={a['length']:6d}",
            file=sys.stderr
        )

    print(f"\n=== BIN COVERAGE ===", file=sys.stderr)
    for b, items in sorted(bins.items()):
        print(f"  {b:12s}: {len(items)} articles", file=sys.stderr)


if __name__ == "__main__":
    main()
