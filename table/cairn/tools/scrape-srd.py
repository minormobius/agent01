#!/usr/bin/env python3
"""Scrape the Cairn 2e SRD (CC BY-SA 4.0, Yochai Gal) into JSON for the roller."""
import json, re, html, subprocess, sys

BG = ["aurifex","barber-surgeon","beast-handler","bonekeeper","cutpurse","fieldwarden",
      "fletchwind","foundling","fungal-forager","greenwise","half-witch","hexenbane",
      "jongleur","kettlewright","marchguard","mountebank","outrider","prowler",
      "rill-runner","scrivener"]

def get(url):
    return subprocess.run(["curl","-sSL",url],capture_output=True,text=True,check=True).stdout

def inline(s):
    """HTML fragment -> light markdown, preserving bold/italic."""
    s = re.sub(r'(?s)<(strong|b)>(.*?)</\1>', r'**\2**', s)
    s = re.sub(r'(?s)<(em|i)>(.*?)</\1>', r'*\2*', s)
    s = re.sub(r'(?s)<a [^>]*>(.*?)</a>', r'\1', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()

def body(doc):
    i = doc.find('<h1')
    j = doc.find('Back to top', i)
    return doc[i:j if j > 0 else len(doc)]

def num(cell):
    """Cell -> int if it is purely a number (ignoring bold markers), else None."""
    c = cell.replace('*', '').strip()
    return int(c) if re.fullmatch(r'\d+', c) else None


def rows(table_html):
    """[[cell,...],...] from a <table> fragment, tbody rows only."""
    tb = re.search(r'(?s)<tbody>(.*?)</tbody>', table_html)
    src = tb.group(1) if tb else table_html
    out = []
    for tr in re.findall(r'(?s)<tr>(.*?)</tr>', src):
        cells = [inline(c) for c in re.findall(r'(?s)<t[dh][^>]*>(.*?)</t[dh]>', tr)]
        if any(cells):
            out.append(cells)
    return out

def clean_heading(h):
    t = re.sub(r'\s*Roll\s+1?d\d+:?\s*$', '', inline(h)).strip()
    return re.sub(r'\s+([?!.,;:])', r'\1', t)  # the SRD's markup leaves stray spaces before punctuation

# ---------------------------------------------------------------- backgrounds
backgrounds = []
for slug in BG:
    doc = body(get(f"https://cairnrpg.com/second-edition/backgrounds/{slug}/"))
    name = inline(re.search(r'(?s)<h1[^>]*>(.*?)</h1>', doc).group(1))
    blurb = inline(re.search(r'(?s)<blockquote>\s*<p>(.*?)</p>', doc).group(1))
    names = [n.strip() for n in inline(
        re.search(r'(?s)id="names".*?</h2>\s*<p>(.*?)</p>', doc).group(1)).split(',')]
    gear_ul = re.search(r'(?s)id="starting-gear".*?</h2>\s*<ul>(.*?)</ul>', doc).group(1)
    gear = [inline(li) for li in re.findall(r'(?s)<li>(.*?)</li>', gear_ul)]

    tables = []
    # every <h2> that is followed by a table, after starting-gear
    tail = doc[doc.find('id="starting-gear"'):]
    for m in re.finditer(r'(?s)<h2[^>]*>(.*?)</h2>(.*?)(?=<h2|\Z)', tail):
        head, chunk = m.group(1), m.group(2)
        t = re.search(r'(?s)<table>(.*?)</table>', chunk)
        if not t:
            continue
        r = rows(t.group(1))
        die = int(re.search(r'd(\d+)', inline(head)).group(1)) if re.search(r'd(\d+)', inline(head)) else len(r)
        entries = []
        for cells in r:
            n = num(cells[0]) or 0
            if len(cells) >= 3 and cells[2]:
                entries.append({"n": n, "title": cells[1], "text": cells[2]})
            else:
                entries.append({"n": n, "text": cells[1]})
        tables.append({"prompt": clean_heading(head), "die": die, "entries": entries})
    backgrounds.append({"id": slug, "name": name, "blurb": blurb,
                        "names": names, "gear": gear, "tables": tables})
    print(f"  {name}: {len(names)} names, {len(gear)} gear, "
          f"{[len(t['entries']) for t in tables]}", file=sys.stderr)

# ------------------------------------------------- traits / bonds / omens
cc = body(get("https://cairnrpg.com/second-edition/players-guide/character-creation/"))
traits, bonds, omens = {}, [], []
for m in re.finditer(r'(?s)<h[23][^>]*>(.*?)</h[23]>(.*?)(?=<h[123]|\Z)', cc):
    head, chunk = inline(m.group(1)), m.group(2)
    t = re.search(r'(?s)<table>(.*?)</table>', chunk)
    if not t:
        continue
    r = rows(t.group(1))
    key = head.lower()
    if key in ("physique","skin","hair","face","speech","clothing","virtue","vice"):
        # 4-column layout: n | value | n | value
        vals = {}
        for cells in r:
            for i in range(0, len(cells) - 1, 2):
                if num(cells[i]) is not None:
                    vals[num(cells[i])] = cells[i + 1]
        traits[key] = [vals[i] for i in sorted(vals)]
    elif key == "bonds":
        bonds = [{"n": num(c[0]), "text": c[1]} for c in r if num(c[0]) is not None]
    elif key == "omens":
        omens = [{"n": num(c[0]), "text": c[1]} for c in r if num(c[0]) is not None]

# ------------------------------------------------------------------- scars
core = body(get("https://cairnrpg.com/second-edition/players-guide/core-rules/"))
scars = []
for m in re.finditer(r'(?s)<h[23][^>]*>(.*?)</h[23]>(.*?)(?=<h[123]|\Z)', core):
    if 'scars table' in inline(m.group(1)).lower():
        t = re.search(r'(?s)<table>(.*?)</table>', m.group(2))
        scars = [{"n": num(c[0]), "text": c[1]}
                 for c in rows(t.group(1)) if num(c[0]) is not None]

data = {"backgrounds": backgrounds, "traits": traits,
        "bonds": bonds, "omens": omens, "scars": scars}

HEADER = """// table/cairn/data.js — the Cairn Second Edition tables this roller draws from.
//
// GENERATED by tools/scrape-srd.py from https://cairnrpg.com/second-edition/:
//   python3 table/cairn/tools/scrape-srd.py > table/cairn/data.js
// Do not hand-edit — re-run the scraper, so the data stays traceable to the SRD
// it came from. Prose keeps light markdown: **item** and *quality*.
//
// Cairn Second Edition is by Yochai Gal, licensed CC BY-SA 4.0. This file is an
// adaptation of that text and is shared under the same licence. Full
// attribution: ./LICENSE.md
export const CAIRN2E = """

print(HEADER + json.dumps(data, ensure_ascii=False, indent=1) + ";")
print(f"traits={ {k: len(v) for k,v in traits.items()} } bonds={len(bonds)} "
      f"omens={len(omens)} scars={len(scars)} backgrounds={len(backgrounds)}", file=sys.stderr)
