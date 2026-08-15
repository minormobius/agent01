#!/usr/bin/env python3
"""Scrape the Cairn 2e bestiary (CC BY-SA 4.0, Yochai Gal) into JSON for the oracle.

  python3 table/cairn/tools/scrape-monsters.py > table/cairn/monsters.js

Every entry on that page is one <h2> name, one <p> stat line, and a <ul> of
notes. The stat line is the part the simulator needs, and it has variants:

  4 HP, 1 Armor, 8 STR, 11 DEX, 14 WIL, ceremonial dagger (d6)
  6 HP, 13 STR, 12 DEX, 15 WIL, bite (d8)                        <- no armour
  4 HP, 1 Armor, 12 STR, 12 DEX, 9 WIL, short sword (d6) or short bow (d6)
  9 HP, 2 Armor, 16 STR, 12 DEX, 14 WIL, claws (d8+d8), bite (d10, blast)

so armour is optional, attacks are a list, and a single attack may roll two
dice (keep highest) or carry the blast quality. Anything the parser cannot read
is reported on stderr rather than silently dropped — a monster missing its
damage die would quietly make every encounter look survivable.
"""
import json, re, html, subprocess, sys

URL = "https://cairnrpg.com/second-edition/wardens-guide/bestiary/"


def get(url):
    return subprocess.run(["curl", "-sSL", url], capture_output=True, text=True, check=True).stdout


def inline(s):
    s = re.sub(r'(?s)<(strong|b)>(.*?)</\1>', r'**\2**', s)
    s = re.sub(r'(?s)<(em|i)>(.*?)</\1>', r'*\2*', s)
    s = re.sub(r'(?s)<a [^>]*>(.*?)</a>', r'\1', s)
    s = re.sub(r'<[^>]+>', '', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def parse_attacks(text):
    """'short sword (d6) or short bow (d6)' -> [{name, dice:[6], blast, note}]"""
    out = []
    # split on ' or ' / ', ' only where a parenthetical follows, so descriptive
    # commas inside a parenthetical stay put
    for m in re.finditer(r'([^,()]+?)\s*\(([^)]*)\)', text):
        name, quals = m.group(1).strip(' ,'), m.group(2)
        name = re.sub(r'^(?:or|and)\s+', '', name, flags=re.I).strip()
        dice = [int(d) for d in re.findall(r'd(\d+)', quals)]
        if not dice:
            continue
        out.append({
            "name": name,
            "dice": dice,                                   # >1 die: roll all, keep highest
            "blast": bool(re.search(r'\bblast\b', quals, re.I)),
            "note": quals,
        })
    return out


doc = get(URL)
i, j = doc.find('<h1'), doc.find('Back to top')
doc = doc[i:j if j > 0 else len(doc)]

# ------------------------------------------------------------ categories --
categories = {}
cat_table = re.search(r'(?s)<table>(.*?)</table>', doc)
if cat_table:
    for tr in re.findall(r'(?s)<tr>(.*?)</tr>', cat_table.group(1)):
        cells = [inline(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', tr)]
        if len(cells) == 3 and cells[0].replace('*', '').strip().isdigit():
            group = cells[1]
            for name in cells[2].split(','):
                categories[name.strip().lower()] = group

# -------------------------------------------------------------- monsters --
monsters, problems = [], []
for m in re.finditer(r'(?s)<h2 id="([^"]+)">(.*?)</h2>(.*?)(?=<h2|\Z)', doc):
    slug, name, chunk = m.group(1), inline(m.group(2)), m.group(3)
    stat_p = re.search(r'(?s)<p>(.*?)</p>', chunk)
    if not stat_p:
        continue
    stat = inline(stat_p.group(1))
    hp = re.search(r'(\d+)\s*HP', stat)
    if not hp:
        continue                                   # a prose paragraph, not a monster

    armor = re.search(r'(\d+)\s*Armou?r', stat)
    attrs = {k: re.search(r'(\d+)\s*' + k, stat) for k in ('STR', 'DEX', 'WIL')}
    # everything after WIL is the attack list
    tail = re.split(r'\d+\s*WIL\s*,?', stat, maxsplit=1)
    attacks = parse_attacks(tail[1]) if len(tail) > 1 else []
    notes = [inline(li) for li in re.findall(r'(?s)<li>(.*?)</li>', chunk)]

    # Which creatures do things the simulator cannot: force a save, cast a
    # spell, or inflict a critical-damage effect with real mechanics behind it
    # (dice or attribute loss) rather than a description of dying. Roughly half
    # the bestiary, so the oracle has to say so rather than imply its verdict
    # covers the whole creature.
    note_text = ' '.join(notes)
    unmodelled = bool(
        re.search(r'\*\*[^*]+\*\*\s*:', note_text)                      # a named ability, "**Gaze**:"
        or re.search(r'\b(STR|DEX|WIL) save\b', note_text)
        or re.search(r'spellbook|\bcasts?\b', note_text, re.I)
        or re.search(r'\*(impaired|enhanced|deprived|blast)\*', note_text, re.I)
        or re.search(r'(?i)\b(immune|regenerat\w*|petrif\w*|paralys\w*|invisibl\w*|'
                     r'teleport\w*|swallow\w*|drain\w*|poison\w*|disease\w*|curse\w*)\b', note_text)
        or re.search(r'(?i)critical damage.{0,120}?(\bd\d+\b|\b(STR|DEX|WIL)\b)', note_text)
    )

    entry = {
        "id": slug,
        "name": name,
        "group": categories.get(name.lower()),
        "unmodelled": unmodelled,
        "hp": int(hp.group(1)),
        "armor": int(armor.group(1)) if armor else 0,
        "STR": int(attrs['STR'].group(1)) if attrs['STR'] else 10,
        "DEX": int(attrs['DEX'].group(1)) if attrs['DEX'] else 10,
        "WIL": int(attrs['WIL'].group(1)) if attrs['WIL'] else 10,
        "attacks": attacks,
        # "Groups of four or more are a detachment" — the bestiary says so in prose
        "detachment": bool(re.search(r'\bdetachment\b', ' '.join(notes), re.I)),
        "stat": stat,
        "notes": notes,
    }
    if not attacks:
        problems.append(f"{name}: no attack parsed from {stat!r}")
    if not all(attrs.values()):
        problems.append(f"{name}: missing an attribute in {stat!r}")
    monsters.append(entry)

HEADER = """// table/cairn/monsters.js — the Cairn 2e bestiary, as the encounter oracle needs it.
//
// GENERATED by tools/scrape-monsters.py from
// https://cairnrpg.com/second-edition/wardens-guide/bestiary/:
//   python3 table/cairn/tools/scrape-monsters.py > table/cairn/monsters.js
// Do not hand-edit — re-run the scraper.
//
// Cairn Second Edition is by Yochai Gal, licensed CC BY-SA 4.0. This file is an
// adaptation of that text and is shared under the same licence. Full
// attribution: ./LICENSE.md
export const BESTIARY = """

print(HEADER + json.dumps(monsters, ensure_ascii=False, indent=1) + ";")

print(f"{len(monsters)} monsters, {len(set(c for c in categories.values()))} groups, "
      f"{sum(len(m['attacks']) for m in monsters)} attacks", file=sys.stderr)
for p in problems:
    print("  ! " + p, file=sys.stderr)
