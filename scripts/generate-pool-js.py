#!/usr/bin/env python3
"""
Generate cards/js/pool.js from cards/data/full-pool.json.

Reads the full scored catalog and emits the ES module that the card game imports.
All ~6,800 Featured Articles are included. Daily packs use category-balanced
picking (random bin first, then random article from that bin). Lucky mode
and Alchemy draw from the full flat pool.

Usage:
    python3 scripts/generate-pool-js.py
    python3 scripts/generate-pool-js.py --input cards/data/full-pool.json --output cards/js/pool.js
"""

import argparse
import json
import sys

# Category metadata — must stay in sync with the card game
CATEGORIES_JS = """\
const CATEGORIES = {
  LIFE_SCI:    { name: "Life Sciences",        color: "#16a34a", icon: "🧬" },
  MEDICINE:    { name: "Medicine & Health",     color: "#ef4444", icon: "⚕️" },
  PHYS_SCI:    { name: "Physical Sciences",     color: "#2563eb", icon: "⚛️" },
  EARTH:       { name: "Earth & Environment",   color: "#65a30d", icon: "🌏" },
  COSMOS:      { name: "Space & Cosmos",        color: "#1e3a5f", icon: "🌌" },
  MATH:        { name: "Mathematics",           color: "#7c3aed", icon: "∑"  },
  TECH:        { name: "Technology",            color: "#475569", icon: "⚙️" },
  GEO:         { name: "Geography & Places",    color: "#059669", icon: "🗺️" },
  HISTORY:     { name: "History",               color: "#d97706", icon: "🏛️" },
  MILITARY:    { name: "Military & Conflict",   color: "#b91c1c", icon: "⚔️" },
  SOCIETY:     { name: "Society & Politics",    color: "#0891b2", icon: "⚖️" },
  PHILOSOPHY:  { name: "Philosophy & Religion", color: "#a855f7", icon: "☯️" },
  LITERATURE:  { name: "Literature",            color: "#be185d", icon: "📜" },
  VISUAL_ARTS: { name: "Visual Arts",           color: "#e11d48", icon: "🎨" },
  MUSIC:       { name: "Music & Performance",   color: "#db2777", icon: "🎵" },
  FILM:        { name: "Film & Media",          color: "#f59e0b", icon: "🎬" },
  SPORTS:      { name: "Sports & Games",        color: "#ea580c", icon: "🏆" },
  EVERYDAY:    { name: "Everyday Life",         color: "#78716c", icon: "🍳" },
};\
"""

BIN_ORDER = [
    "LIFE_SCI", "MEDICINE", "PHYS_SCI", "EARTH", "COSMOS", "MATH",
    "TECH", "GEO", "HISTORY", "MILITARY", "SOCIETY", "PHILOSOPHY",
    "LITERATURE", "VISUAL_ARTS", "MUSIC", "FILM", "SPORTS", "EVERYDAY",
]

BIN_LABELS = {
    "LIFE_SCI": "Life Sciences", "MEDICINE": "Medicine & Health",
    "PHYS_SCI": "Physical Sciences", "EARTH": "Earth & Environment",
    "COSMOS": "Space & Cosmos", "MATH": "Mathematics",
    "TECH": "Technology", "GEO": "Geography & Places",
    "HISTORY": "History", "MILITARY": "Military & Conflict",
    "SOCIETY": "Society & Politics", "PHILOSOPHY": "Philosophy & Religion",
    "LITERATURE": "Literature", "VISUAL_ARTS": "Visual Arts",
    "MUSIC": "Music & Performance", "FILM": "Film & Media",
    "SPORTS": "Sports & Games", "EVERYDAY": "Everyday Life",
}


def format_entry(title, bin_key, stats):
    """Format a single pool entry as a JS array literal."""
    title_escaped = title.replace("\\", "\\\\").replace('"', '\\"')
    s = stats or {}
    atk = s.get("atk", 50)
    dfn = s.get("def", 50)
    spc = s.get("spc", 50)
    spd = s.get("spd", 50)
    hp = s.get("hp", 500)
    rarity = s.get("rarity", "common")
    return (f'["{title_escaped}","{bin_key}",'
            f'{{atk:{atk},def:{dfn},spc:{spc},spd:{spd},'
            f'hp:{hp},rarity:"{rarity}"}}]')


def main():
    parser = argparse.ArgumentParser(description="Generate pool.js from full-pool.json")
    parser.add_argument("--input", default="cards/data/full-pool.json", help="Input JSON")
    parser.add_argument("--output", default="cards/js/pool.js", help="Output JS module")
    args = parser.parse_args()

    with open(args.input) as f:
        data = json.load(f)

    # full-pool.json has {"meta": {...}, "pool": [[title, bin, {stats}], ...]}
    pool = data["pool"]
    meta = data.get("meta", {})

    # Group by bin for readable output
    by_bin = {}
    for entry in pool:
        title, bin_key, stats = entry[0], entry[1], entry[2] if len(entry) > 2 else {}
        if bin_key not in by_bin:
            by_bin[bin_key] = []
        by_bin[bin_key].append((title, stats))

    lines = []
    lines.append("/**")
    lines.append(f" * Auto-generated from full-pool.json — {meta.get('total', len(pool))} articles")
    lines.append(f" * Source: {meta.get('source', 'Wikipedia Featured Articles')}")
    lines.append(f" * Generated: {meta.get('generated_at', 'unknown')}")
    lines.append(" *")
    lines.append(" * DO NOT EDIT — regenerate with: python3 scripts/generate-pool-js.py")
    lines.append(" */")
    lines.append("")
    lines.append(CATEGORIES_JS)
    lines.append("")
    lines.append("// Each entry: [title, category_key, {atk, def, spc, spd, hp, rarity}]")
    lines.append("// Stats: percentile-normalized (1-99 for ATK/DEF/SPC/SPD, 100-999 for HP)")
    lines.append("// Rarity: 45% common, 30% uncommon, 15% rare, 10% legendary")
    lines.append("const POOL = [")

    total = 0
    rarity_counts = {}
    bin_counts = {}
    for bin_key in BIN_ORDER:
        articles = by_bin.get(bin_key, [])
        if not articles:
            continue
        label = BIN_LABELS.get(bin_key, bin_key)
        lines.append(f"  // ── {label} ({len(articles)}) ──")
        bin_counts[bin_key] = len(articles)
        for title, stats in articles:
            lines.append("  " + format_entry(title, bin_key, stats) + ",")
            r = (stats or {}).get("rarity", "common")
            rarity_counts[r] = rarity_counts.get(r, 0) + 1
            total += 1

    # Any bins not in BIN_ORDER (shouldn't happen, but just in case)
    for bin_key, articles in by_bin.items():
        if bin_key not in BIN_ORDER:
            lines.append(f"  // ── {bin_key} ({len(articles)}) ──")
            for title, stats in articles:
                lines.append("  " + format_entry(title, bin_key, stats) + ",")
                r = (stats or {}).get("rarity", "common")
                rarity_counts[r] = rarity_counts.get(r, 0) + 1
                total += 1

    lines.append("];")
    lines.append("")

    # Export a BINS index for category-balanced pack picking
    # BINS[key] = [startIndex, count] so the client can pick a random bin,
    # then a random article within that bin's range
    lines.append("// Bin index for category-balanced pack picking")
    lines.append("// BINS[key] = [startIndex, count]")
    lines.append("const BINS = {")
    offset = 0
    for bin_key in BIN_ORDER:
        count = bin_counts.get(bin_key, 0)
        if count > 0:
            lines.append(f'  {bin_key}: [{offset}, {count}],')
            offset += count
    lines.append("};")
    lines.append("")
    lines.append("export { CATEGORIES, POOL, BINS };")
    lines.append("")

    with open(args.output, "w") as f:
        f.write("\n".join(lines))

    size_kb = round(len("\n".join(lines).encode("utf-8")) / 1024)
    print(f"Wrote {total} articles ({len(bin_counts)} bins, {size_kb}KB) to {args.output}", file=sys.stderr)
    for r in ("common", "uncommon", "rare", "legendary"):
        n = rarity_counts.get(r, 0)
        pct = 100 * n / max(1, total)
        print(f"  {r:12s}: {n:4d} ({pct:.1f}%)", file=sys.stderr)
    for bin_key in BIN_ORDER:
        c = bin_counts.get(bin_key, 0)
        print(f"  {bin_key:12s}: {c:4d}", file=sys.stderr)


if __name__ == "__main__":
    main()
