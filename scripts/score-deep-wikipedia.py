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
WIKIMEDIA_REST = "https://en.wikipedia.org/api/rest_v1"
BATCH_SIZE = 50  # max titles per query
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



def wiki_query_props(params):
    """Query Wikipedia API with full continuation handling.

    The API limits like lllimit=500 are TOTAL across all pages in the batch,
    not per-page. Without following 'continue' tokens, most pages get empty
    results. This function follows all continue tokens and merges results.
    """
    merged_pages = {}
    query_params = dict(params)

    while True:
        data = wiki_get(query_params)
        batch_pages = data.get("query", {}).get("pages", {})

        for pid, pdata in batch_pages.items():
            if pid not in merged_pages:
                merged_pages[pid] = dict(pdata)
            else:
                # Append list-type props
                for key in ("langlinks", "extlinks", "links", "categories",
                            "linkshere", "revisions"):
                    if key in pdata:
                        existing = merged_pages[pid].get(key, [])
                        merged_pages[pid][key] = existing + pdata[key]
                # Dict-type props (pageviews) — merge keys
                for key in ("pageviews",):
                    if key in pdata:
                        existing = merged_pages[pid].get(key, {})
                        existing.update(pdata[key])
                        merged_pages[pid][key] = existing
                # Scalar props — overwrite (info, extract, thumbnail)
                for key in ("length", "extract", "thumbnail", "pageid", "title", "ns"):
                    if key in pdata:
                        merged_pages[pid][key] = pdata[key]

        cont = data.get("continue")
        if not cont:
            break
        # Add continue params for next request
        query_params = dict(params)
        query_params.update(cont)
        time.sleep(RATE_DELAY)

    return merged_pages


def fetch_pageviews_rest(title, days=30):
    """Fetch average daily pageviews via Wikimedia REST API.

    More reliable than prop=pageviews for individual articles.
    Returns average daily views over the last N days.
    """
    from urllib.parse import quote
    import datetime

    end = datetime.date.today()
    start = end - datetime.timedelta(days=days)
    # REST API wants YYYYMMDD00 format
    start_str = start.strftime("%Y%m%d00")
    end_str = end.strftime("%Y%m%d00")
    encoded = quote(title.replace(" ", "_"), safe="")

    url = (f"{WIKIMEDIA_REST}/metrics/pageviews/per-article/"
           f"en.wikipedia/all-access/all-agents/{encoded}/daily/{start_str}/{end_str}")

    try:
        req = Request(url, headers={"User-Agent": "DeepWikipediaScorer/1.0 (minomobi.com)"})
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        items = data.get("items", [])
        if not items:
            return 0
        total = sum(item.get("views", 0) for item in items)
        return round(total / max(1, len(items)), 1)
    except Exception:
        return 0


def fetch_metadata_batch(titles):
    """Fetch light props (info, categories, images, extracts, langlinks) for a batch.

    Only scalar/light props here — list props (links, extlinks, linkshere,
    revisions) are fetched in smaller heavy batches to avoid starvation.
    """
    if not titles:
        return {}

    titles_str = "|".join(titles)

    # Query 1: info + categories + pageimages + extracts (light props)
    pages = wiki_query_props({
        "action": "query",
        "titles": titles_str,
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

    # Query 2: langlinks (with continuation)
    pages2 = wiki_query_props({
        "action": "query",
        "titles": titles_str,
        "prop": "langlinks",
        "lllimit": "500",
    })

    # Merge langlinks into pages dict
    for pid, pdata in pages2.items():
        if pid in pages:
            pages[pid]["langlinks"] = pdata.get("langlinks", [])

    return pages


# Smaller batch size for heavy props — 500 items shared across N titles,
# so fewer titles = more items per title = fewer zeros
HEAVY_BATCH = 10


def fetch_heavy_prop_batch(titles, prop, prop_key, extra_params=None):
    """Fetch a single heavy list prop for a small batch of titles.

    Heavy props (links, extlinks, linkshere, revisions) share their 500-item
    limit across all titles in the batch. Smaller batches = more items per title.
    """
    params = {
        "action": "query",
        "titles": "|".join(titles),
        "prop": prop,
    }
    if extra_params:
        params.update(extra_params)
    pages = wiki_query_props(params)
    return {pid: p.get(prop_key, []) for pid, p in pages.items()}


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


def compute_percentile_stats(articles):
    """Compute card stats using percentile normalization.

    Instead of absolute log2 values (which cluster for Featured Articles),
    rank each stat within the pool and map to 1-99. This guarantees full
    spread regardless of the underlying distribution.

    Also assigns rarity by power percentile:
      Common:    bottom 45%
      Uncommon:  next 30%
      Rare:      next 15%
      Legendary: top 10%
    """
    stat_fields = [
        ("links_count", "atk"),
        ("linkshere_count", "def"),
        ("extlinks_count", "spc"),
        ("revisions_count", "spd"),
    ]

    # Step 1: For each stat, rank articles and assign 1-99
    for raw_key, stat_key in stat_fields:
        values = [(i, a.get(raw_key, 0)) for i, a in enumerate(articles)]
        values.sort(key=lambda x: x[1])
        n = len(values)
        for rank, (idx, _) in enumerate(values):
            percentile = max(1, round((rank + 1) / n * 99))
            if "stats" not in articles[idx]:
                articles[idx]["stats"] = {}
            articles[idx]["stats"][stat_key] = percentile

    # HP: percentile on article length
    lengths = [(i, a.get("length", 0)) for i, a in enumerate(articles)]
    lengths.sort(key=lambda x: x[1])
    n = len(lengths)
    for rank, (idx, _) in enumerate(lengths):
        # HP scales 100-999 based on percentile
        pct = (rank + 1) / n
        articles[idx]["stats"]["hp"] = max(100, round(pct * 999))

    # Step 2: Compute power and assign rarity by percentile
    for a in articles:
        s = a["stats"]
        s["power"] = s["atk"] + s["def"] + s["spc"] + s["spd"] + s["hp"] / 10

    # Sort by power, assign rarity by rank
    by_power = sorted(range(len(articles)), key=lambda i: articles[i]["stats"]["power"])
    n = len(by_power)
    for rank, idx in enumerate(by_power):
        pct = (rank + 1) / n
        if pct <= 0.45:
            rarity = "common"
        elif pct <= 0.75:
            rarity = "uncommon"
        elif pct <= 0.90:
            rarity = "rare"
        else:
            rarity = "legendary"
        articles[idx]["stats"]["rarity"] = rarity

    return articles


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

        time.sleep(RATE_DELAY * 3)  # extra politeness between batches

    # Step 2b: Extract pageviews from batched metadata
    pv_nonzero = 0
    for title, page in raw_pages.items():
        pv_dict = page.get("pageviews", {})
        daily = [v for v in pv_dict.values() if v is not None]
        avg = round(sum(daily) / max(1, len(daily)), 1) if daily else 0
        page["_avg_pageviews"] = avg
        if avg > 0:
            pv_nonzero += 1
    print(f"  Pageviews: {len(raw_pages)} total, {pv_nonzero} nonzero", file=sys.stderr)

    # Step 2c: Fetch ALL heavy list props in smaller batches
    # 500-item limit is shared across all titles in a batch, so fewer titles
    # = more items per title = fewer zeros from starvation
    all_page_titles = list(raw_pages.keys())
    heavy_total = math.ceil(len(all_page_titles) / HEAVY_BATCH)

    # Build pageid → title lookup for merging
    pid_to_title = {}
    for title, page in raw_pages.items():
        pid_to_title[str(page["pageid"])] = title

    one_year_ago = time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                 time.gmtime(time.time() - 365 * 86400))
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    heavy_props = [
        ("links", "links", {"pllimit": "500"}),
        ("extlinks", "extlinks", {"ellimit": "500"}),
        ("linkshere", "linkshere", {"lhlimit": "500", "lhnamespace": "0"}),
        ("revisions", "revisions", {"rvlimit": "500", "rvprop": "ids",
                                     "rvstart": now_iso, "rvend": one_year_ago}),
    ]

    print(f"\nFetching {len(heavy_props)} heavy props in batches of {HEAVY_BATCH} "
          f"({heavy_total} batches × {len(heavy_props)} props)...", file=sys.stderr)

    for i in range(0, len(all_page_titles), HEAVY_BATCH):
        hbatch = all_page_titles[i:i + HEAVY_BATCH]
        hnum = i // HEAVY_BATCH + 1
        if hnum % 50 == 1 or hnum == heavy_total:
            print(f"  Heavy batch {hnum}/{heavy_total}", file=sys.stderr)

        for prop_name, prop_key, extra in heavy_props:
            try:
                data = fetch_heavy_prop_batch(hbatch, prop_name, prop_key, extra)
                for pid, items in data.items():
                    t = pid_to_title.get(pid)
                    if t and t in raw_pages:
                        raw_pages[t][prop_key] = items
            except Exception as e:
                print(f"  ERROR {prop_name} batch {hnum}: {e}", file=sys.stderr)

        time.sleep(RATE_DELAY * 2)

    # Debug: sample articles' metadata
    for title, page in list(raw_pages.items())[:3]:
        print(f"  SAMPLE {title[:40]}: "
              f"pv={page.get('_avg_pageviews', 0)} "
              f"ll={len(page.get('langlinks', []))} "
              f"el={len(page.get('extlinks', []))} "
              f"lk={len(page.get('links', []))} "
              f"lh={len(page.get('linkshere', []))} "
              f"rv={len(page.get('revisions', []))}", file=sys.stderr)

    # Step 2e: Assemble article records
    articles = []
    for title, page in raw_pages.items():
        article = {
            "title": title,
            "pageid": page["pageid"],
            "length": page.get("length", 0),
            "langlinks_count": len(page.get("langlinks", [])),
            "extlinks_count": len(page.get("extlinks", [])),
            "links_count": len(page.get("links", [])),
            "linkshere_count": len(page.get("linkshere", [])),
            "revisions_count": len(page.get("revisions", [])),
            "avg_pageviews": page.get("_avg_pageviews", 0),
            "quality": "FA" if title in fa_set else "GA",
            "extract": page.get("extract", ""),
            "thumbnail": page.get("thumbnail", {}).get("source"),
            "categories": [c.get("title", "").replace("Category:", "")
                           for c in page.get("categories", [])],
        }

        article["bin"] = classify_article(page)
        article["deep_score"] = round(compute_deep_score(article), 4)

        articles.append(article)

    # Step 3: Percentile normalization for card stats
    # Rank each stat within the full article population → 1-99 range
    # Rarity assigned by power percentile: 45% common, 30% uncommon, 15% rare, 10% legendary
    print(f"\nComputing percentile stats for {len(articles)} articles...", file=sys.stderr)
    articles = compute_percentile_stats(articles)

    # Log stat distribution
    for stat_key in ("atk", "def", "spc", "spd"):
        vals = [a["stats"][stat_key] for a in articles]
        print(f"  {stat_key.upper():3s}: min={min(vals):2d} max={max(vals):2d} "
              f"mean={sum(vals)/len(vals):.1f} median={sorted(vals)[len(vals)//2]}",
              file=sys.stderr)
    rarity_counts = {}
    for a in articles:
        r = a["stats"]["rarity"]
        rarity_counts[r] = rarity_counts.get(r, 0) + 1
    for r in ("common", "uncommon", "rare", "legendary"):
        print(f"  {r:12s}: {rarity_counts.get(r, 0):5d} "
              f"({100*rarity_counts.get(r,0)/len(articles):.1f}%)", file=sys.stderr)

    # Step 3b: Sort by deep score
    articles.sort(key=lambda a: a["deep_score"], reverse=True)

    # Step 3c: Two-pass pageviews — fetch REST API views for top candidates only
    candidates_per_bin = args.per_bin * 3  # 3× oversampling
    bin_counts = {}
    candidate_titles = set()
    for a in articles:
        b = a["bin"]
        bin_counts[b] = bin_counts.get(b, 0) + 1
        if bin_counts[b] <= candidates_per_bin:
            candidate_titles.add(a["title"])

    pv_total = len(candidate_titles)
    print(f"\nFetching REST API pageviews for {pv_total} top candidates...", file=sys.stderr)
    pv_fetched = 0
    pv_nonzero_rest = 0
    for a in articles:
        if a["title"] not in candidate_titles:
            continue
        pv_fetched += 1
        if pv_fetched % 100 == 1 or pv_fetched == pv_total:
            print(f"  Pageviews {pv_fetched}/{pv_total}...", file=sys.stderr)
        avg_pv = fetch_pageviews_rest(a["title"])
        if avg_pv > 0:
            a["avg_pageviews"] = avg_pv
            a["deep_score"] = round(compute_deep_score(a), 4)
            pv_nonzero_rest += 1
        time.sleep(0.05)  # light rate limit for REST API

    print(f"  REST pageviews: {pv_nonzero_rest}/{pv_fetched} nonzero", file=sys.stderr)

    # Re-sort after pageview-adjusted scores
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

    # Step 6: Generate full pool (ALL articles, compact format for Lucky mode)
    # Only title + bin + stats — no extract/thumbnail (fetched live from Wikipedia)
    full_pool = []
    for a in articles:
        s = a.get("stats", {})
        full_pool.append([
            a["title"],
            a["bin"],
            {
                "atk": s.get("atk", 50),
                "def": s.get("def", 50),
                "spc": s.get("spc", 50),
                "spd": s.get("spd", 50),
                "hp": s.get("hp", 500),
                "rarity": s.get("rarity", "common"),
            }
        ])

    full_pool_path = args.pool_output.replace("deep-pool", "full-pool")
    full_pool_output = {
        "meta": {
            "total": len(full_pool),
            "source": output["meta"]["source"],
            "generated_at": output["meta"]["generated_at"],
        },
        "pool": full_pool,
    }
    with open(full_pool_path, "w") as f:
        json.dump(full_pool_output, f, separators=(",", ":"), ensure_ascii=False)
    size_kb = round(len(json.dumps(full_pool_output, separators=(",", ":"), ensure_ascii=False)) / 1024)
    print(f"Wrote {len(full_pool)} articles to {full_pool_path} ({size_kb}KB)", file=sys.stderr)

    # Summary
    print("\n=== DEEP WIKIPEDIA: TOP 20 ===", file=sys.stderr)
    for i, a in enumerate(articles[:20]):
        s = a.get("stats", {})
        print(
            f"  {i+1:2d}. [{a['bin']:12s}] {a['title'][:45]:45s} "
            f"deep={a['deep_score']:8.2f}  "
            f"ATK={s.get('atk',0):2d} DEF={s.get('def',0):2d} "
            f"SPC={s.get('spc',0):2d} SPD={s.get('spd',0):2d} HP={s.get('hp',0):3d}  "
            f"{s.get('rarity','?')}",
            file=sys.stderr
        )

    print(f"\n=== BIN COVERAGE ===", file=sys.stderr)
    for b, items in sorted(bins.items()):
        print(f"  {b:12s}: {len(items)} articles", file=sys.stderr)


if __name__ == "__main__":
    main()
