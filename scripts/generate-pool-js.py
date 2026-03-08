#!/usr/bin/env python3
"""
Generate cards/js/pool.js from cards/data/deep-pool.json.

Reads the scorer output and emits the ES module that the card game imports.
Run after score-deep-wikipedia.py to wire the pipeline end-to-end.

Usage:
    python3 scripts/generate-pool-js.py
    python3 scripts/generate-pool-js.py --input cards/data/deep-pool.json --output cards/js/pool.js
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

# Canonical bin order for readable output
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


def main():
    parser = argparse.ArgumentParser(description="Generate pool.js from deep-pool.json")
    parser.add_argument("--input", default="cards/data/deep-pool.json", help="Input JSON")
    parser.add_argument("--output", default="cards/js/pool.js", help="Output JS module")
    args = parser.parse_args()

    with open(args.input) as f:
        data = json.load(f)

    bins = data["bins"]
    meta = data.get("meta", {})

    lines = []
    lines.append("/**")
    lines.append(" * Auto-generated from deep-pool.json by generate-pool-js.py")
    lines.append(f" * Source: {meta.get('source', 'Wikipedia Featured Articles')}")
    lines.append(f" * Generated: {meta.get('generated_at', 'unknown')}")
    lines.append(f" * Formula: {meta.get('formula', 'deep score')}")
    lines.append(" *")
    lines.append(" * DO NOT EDIT — regenerate with: python3 scripts/generate-pool-js.py")
    lines.append(" */")
    lines.append("")
    lines.append(CATEGORIES_JS)
    lines.append("")
    lines.append("// Each entry: [title, category_key]")
    lines.append("// Ranked by deep score (most specialist first)")
    lines.append("const POOL = [")

    total = 0
    for bin_key in BIN_ORDER:
        articles = bins.get(bin_key, [])
        if not articles:
            continue
        label = BIN_LABELS.get(bin_key, bin_key)
        lines.append(f"  // ── {label} ({len(articles)} articles) ──")
        for a in articles:
            title = a["title"].replace('"', '\\"')
            lines.append(f'  ["{title}", "{bin_key}"],')
            total += 1

    lines.append("];")
    lines.append("")
    lines.append("export { CATEGORIES, POOL };")
    lines.append("")

    with open(args.output, "w") as f:
        f.write("\n".join(lines))

    print(f"Wrote {total} articles ({len(bins)} bins) to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
