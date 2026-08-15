#!/usr/bin/env python3
"""Scrape Cairn 2e's items (CC BY-SA 4.0, Yochai Gal) into JSON.

  python3 table/cairn/tools/scrape-items.py > table/cairn/items.js

Three sources, three shapes:

  MARKETPLACE  six tables of `name (qualities) | cost` — armour, weapons,
               transport, upkeep, hirelings, gear.
  RELIQUARY    one <h2> per relic whose HEADING carries the mechanics
               ("A Blade Called Hope (d6)", "Barbed Epaulets, +1 Armor",
               "Coin of the Father, 1 charge, petty") and a <ul> of effect and
               recharge condition.
  SPELLBOOKS   a d100 table of name and effect.

Everything is normalised to `Name (qualities)`, which is the exact form
roll.js's parseItem already reads, so items from a shop, a tomb and a
background all pack into the ten slots by one code path.
"""
import json, re, html, subprocess, sys

BASE = "https://cairnrpg.com/second-edition"


def get(url):
    return subprocess.run(["curl", "-sSL", url], capture_output=True, text=True, check=True).stdout


def inline(s):
    s = re.sub(r'(?s)<(strong|b)>(.*?)</\1>', r'**\2**', s)
    s = re.sub(r'(?s)<(em|i)>(.*?)</\1>', r'*\2*', s)
    s = re.sub(r'(?s)<a [^>]*>(.*?)</a>', r'\1', s)
    s = re.sub(r'<[^>]+>', '', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def body(doc):
    i, j = doc.find('<h1'), doc.find('Back to top')
    return doc[i:j if j > 0 else len(doc)]


def expand_list(text):
    """'Dagger, Cudgel, Staff, etc. (d6 damage)' -> one entry per weapon.

    The shop lists weapons and armour as families sharing a damage die. A loot
    table wants the names apart, so a character can find a Sickle rather than a
    'Dagger, Cudgel, Sickle, Staff, etc.'
    """
    m = re.match(r'^(.*?)\s*\(([^)]*)\)\s*$', text)
    if not m:
        return [text]
    names, quals = m.group(1), m.group(2)
    parts = [n.strip() for n in names.split(',')]
    parts = [n for n in parts if n and not n.lower().startswith('etc')]
    if len(parts) < 2:
        return [text]
    return [f"{n} ({quals})" for n in parts]


def split_qualities(heading):
    """A relic heading -> (clean name, all its mechanical qualities).

    Headings mix the two notations, sometimes both at once: 'A Blade Called
    Hope (d6)', 'Barbed Epaulets, +1 Armor', 'Last Breath (d6), 3 uses'. Take
    the parenthetical AND the comma tail, and leave the name clean of both.
    """
    quals = []
    paren = re.search(r'\(([^)]*)\)', heading)
    if paren:
        quals.append(paren.group(1).strip())
        heading = (heading[:paren.start()] + heading[paren.end():]).strip()
    if ',' in heading:
        heading, tail = heading.split(',', 1)
        quals.append(tail.strip())
    name = heading.strip().rstrip(',').strip()
    return name, ', '.join(q for q in quals if q)


def rows(table_html):
    out = []
    tb = re.search(r'(?s)<tbody>(.*?)</tbody>', table_html)
    for tr in re.findall(r'(?s)<tr>(.*?)</tr>', tb.group(1) if tb else table_html):
        cells = [inline(c) for c in re.findall(r'(?s)<t[dh][^>]*>(.*?)</t[dh]>', tr)]
        if any(cells):
            out.append(cells)
    return out


# ------------------------------------------------------------- marketplace --
market = {}
doc = body(get(f"{BASE}/players-guide/marketplace/"))
for m in re.finditer(r'(?s)<h2 id="([^"]+)">(.*?)</h2>(.*?)(?=<h2|\Z)', doc):
    section = inline(m.group(2)).lower().replace(' & ', ' and ').replace(' ', '-')
    table = re.search(r'(?s)<table>(.*?)</table>', m.group(3))
    if not table:
        continue
    entries = []
    for cells in rows(table.group(1)):
        if len(cells) < 2:
            continue
        name, cost = cells[0], re.sub(r'\D', '', cells[1])
        if not name or not cost:
            continue
        for one in (expand_list(name) if section in ('weapons', 'armor') else [name]):
            entries.append({"text": one, "cost": int(cost)})
    market[section] = entries

# --------------------------------------------------------------- reliquary --
relics = []
doc = body(get(f"{BASE}/wardens-guide/reliquary/"))
for m in re.finditer(r'(?s)<h2 id="([^"]+)">(.*?)</h2>(.*?)(?=<h2|\Z)', doc):
    slug, heading = m.group(1), inline(m.group(2))
    notes = [inline(li) for li in re.findall(r'(?s)<li>(.*?)</li>', m.group(3))]
    if not notes:
        continue
    name, quals = split_qualities(heading)
    recharge = next((n for n in notes if n.lower().startswith('recharge')), None)
    relics.append({
        "id": slug,
        "name": name,
        "text": f"{name} ({quals})" if quals else name,
        "quals": quals,
        "effect": notes[0],
        "recharge": recharge,
    })

# -------------------------------------------------------------- spellbooks --
spells = []
doc = body(get(f"{BASE}/wardens-guide/spellbooks/"))
table = re.search(r'(?s)<table>(.*?)</table>', doc)
for cells in rows(table.group(1)):
    if len(cells) < 3:
        continue
    n = cells[0].replace('*', '').strip()
    if not n.isdigit():
        continue
    spells.append({"n": int(n), "name": cells[1].replace('*', '').strip(), "effect": cells[2]})

HEADER = """// table/cairn/items.js — Cairn 2e's marketplace, reliquary and spellbooks.
//
// GENERATED by tools/scrape-items.py from https://cairnrpg.com/second-edition/:
//   python3 table/cairn/tools/scrape-items.py > table/cairn/items.js
// Do not hand-edit — re-run the scraper.
//
// Every entry's `text` is in the `Name (qualities)` form that roll.js's
// parseItem reads, so a relic out of a tomb and a sword out of a shop pack into
// the ten slots by the same code path.
//
// Cairn Second Edition is by Yochai Gal, licensed CC BY-SA 4.0. This file is an
// adaptation of that text and is shared under the same licence. Full
// attribution: ./LICENSE.md
export const ITEMS = """

print(HEADER + json.dumps({"market": market, "relics": relics, "spells": spells},
                          ensure_ascii=False, indent=1) + ";")

print(f"market: { {k: len(v) for k, v in market.items()} }", file=sys.stderr)
print(f"relics: {len(relics)}  spells: {len(spells)}", file=sys.stderr)
missing = [r['name'] for r in relics if not r['quals']]
print(f"relics with no mechanical qualities: {len(missing)}", file=sys.stderr)
