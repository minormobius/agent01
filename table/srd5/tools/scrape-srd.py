#!/usr/bin/env python3
"""Turn the SRD 5.2.1 PDF into the data modules this surface reads.

    python3 table/srd5/tools/scrape-srd.py            # fetches the PDF, writes ../monsters.js and ../data.js
    python3 table/srd5/tools/scrape-srd.py --pdf X    # use a local copy

The SRD is CC BY 4.0; see ../LICENSE.md for the attribution this obliges, and
do not add any other credit to it.

WHY A PDF PARSER AND NOT A SCRAPER. Cairn publishes its SRD as HTML with real
table markup, so table/cairn/tools/ reads structure directly. Wizards publishes
one 364-page PDF, so everything here is recovered from *typeset* text: two
justified columns, hyphens inserted at line breaks, and headers on every page.
That means the parse can go subtly wrong in ways that still look like English,
which is why nothing in this file is trusted without a cross-check in
../srd5.selftest.mjs — most importantly the XP-against-CR check, which grades
our parse against a table we did not parse.
"""
import argparse, json, os, re, subprocess, sys

PDF_URL = "https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, ".."))

SIZES = ("Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan")

# ------------------------------------------------------------------ the text

def fetch(path):
    if not os.path.exists(path):
        print(f"fetching {PDF_URL}", file=sys.stderr)
        subprocess.run(["curl", "-sSL", "-o", path, PDF_URL], check=True)
    return path


def pdf_pages(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("needs pypdf:  python3 -m venv .venv && .venv/bin/pip install pypdf")
    return [(p.extract_text() or "") for p in PdfReader(path).pages]


def clean(page):
    """One page of typeset text -> text we can parse.

    Every substitution here fixes damage done by the typesetting, not by the
    rules. They are listed in the order they must run.
    """
    s = page
    # Page furniture ONLY. The running head repeats the document title and the
    # folio on every page, and lands mid-block when a stat block spans one.
    # Everything else has to wait until the pages are joined — see mend().
    s = re.sub(r"^\s*System Reference Document 5\.2\.1\s*$", "", s, flags=re.M)
    s = re.sub(r"^\s*\d{1,3}\s*$", "", s, flags=re.M)
    s = re.sub(r"[ \t]+\n", "\n", s)
    return s


def _join_thousands(m):
    """"11,70 0" -> "11,700", but leave "1,000 1,400" alone.

    A well-formed thousands group has exactly three digits. So a comma group
    that is short, followed by loose digits that would complete it, is one
    number the justifier split — and a comma group that is already complete is
    two numbers that merely sit next to each other.
    """
    head, tail = m.group(1), m.group(2)
    return m.group(0) if len(head) + len(tail) != 3 else f",{head}{tail}"


def mend(text):
    """Repair typesetting damage across the WHOLE document.

    This cannot run per page. A word hyphenated across a *page* break has its
    two halves in different pages, so a per-page pass leaves "5-foot- wide"
    behind — which is how the artefact sweep in the selftest found this.
    """
    # 1. Hyphens inserted at a line break: "suc-\nceed" -> "succeed". Only when
    #    the next line starts lowercase, so real hyphens ("5-foot Emanation",
    #    "Two-Weapon Fighting") and em-dash constructions survive.
    text = re.sub(r"(\w)\s*-\s*\n\s*([a-z])", r"\1\2", text)
    # 2. Digits split by the justifier: "7 ,200", "10 –11", "11,70 0".
    text = re.sub(r"(\d)\s+,(\d)", r"\1,\2", text)
    text = re.sub(r"(\d)\s+([–—])\s*(\d)", r"\1\2\3", text)
    text = re.sub(r",(\d{1,3})\s+(\d{1,2})(?!\d)", _join_thousands, text)
    # 3. The PDF's minus sign is U+2212; make every signed number ASCII so a
    #    reader can do arithmetic on it without knowing that.
    text = text.replace("−", "-")
    # 4. Curly punctuation, so string comparisons in the tests are predictable.
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"')
    return text


def document(path):
    """(pages, whole) — both already mended, and mended the same way.

    The pages are mended individually *after* the join-wide repair so that the
    two views cannot disagree; anything that needs cross-page context (the
    hyphens) is already fixed in `whole`, which is what the section parsers use.
    """
    raw = [clean(p) for p in pdf_pages(path)]
    whole = mend("\f".join(raw))
    return whole.split("\f"), whole.replace("\f", "\n")


# -------------------------------------------------------------- stat blocks

# The line that opens every stat block's identity. Four shapes occur, and the
# type has to be "everything up to the comma" to catch the fourth:
#   Large Aberration, Lawful Evil
#   Medium or Small Humanoid, Neutral
#   Gargantuan Dragon (Chromatic), Chaotic Evil
#   Large Swarm of Tiny Beasts, Unaligned      <- lowercase words inside the type
# Matching only a single capitalised word silently welded all seven swarms onto
# whichever creature preceded them, which the AC-line reconciliation caught.
META = re.compile(
    r"^(?P<size>(?:%s)(?:\s+or\s+(?:%s))?)\s+(?P<type>[A-Z][^,\n]*?)"
    r"\s*,\s*(?P<align>[^\n]+)$" % ("|".join(SIZES), "|".join(SIZES)),
    re.M,
)

AC = re.compile(r"^AC\s+(\d+)", re.M)


def find_blocks(text):
    """[(name, body)] for every stat block in the monster section.

    A block is recognised by its meta line followed within a couple of lines by
    an `AC n` line; the name is the last non-empty line above the meta line.
    Anchoring on two lines rather than one keeps prose that happens to start
    with a size word from being mistaken for a creature.
    """
    starts = []
    for m in META.finditer(text):
        tail = text[m.end():m.end() + 120]
        if not AC.search(tail):
            continue
        head = text[:m.start()].rstrip("\n").split("\n")
        name = next((l.strip() for l in reversed(head) if l.strip()), "")
        starts.append((m.start() - len(name) - 1, name, m))
    out = []
    for i, (pos, name, m) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(text)
        out.append((name, text[m.start():end]))
    return out


# ------------------------------------------------------------------- fields

ABILS = ("Str", "Dex", "Con", "Int", "Wis", "Cha")

# "Str 21 +5 +5 Dex 9 -1 +3 Con 15 +2 +6" — score, modifier, save bonus, three
# to a line. Two allowances for the source: it is inconsistent about case
# ("WIS" appears), and exactly one save in the whole document is printed
# without its plus sign (Young White Dragon's Int, "Int 6 -2 2"), so the sign
# is optional. Requiring it dropped that creature's entire ability block.
ABIL_TRIPLE = re.compile(
    r"\b(%s)\s+(\d+)\s+([+-]\d+)\s+([+-]?\d+)" % "|".join(ABILS), re.I)

# The CR line comes in TWO forms in the published SRD, and the rarer one is
# rare enough to look like an absence rather than a variant:
#   CR 10 (XP 5,900, or 7,200 in lair; PB +4)   <- 326 blocks
#   CR 3 (700 XP; PB +2)                        <- 4 blocks, all dragons
# Missing the second cost four wyrmlings their CR and XP, which the
# XP-against-CR cross-check would then have had nothing to grade.
CR_LINE = re.compile(
    r"^CR\s+(?P<cr>[\d/]+)\s*\(\s*(?:XP\s+(?P<xp1>[\d,]+)|(?P<xp2>[\d,]+)\s+XP)"
    r"(?:[^;)]*)?(?:;\s*PB\s*(?P<pb>[+-]\d+))?", re.M)

SECTIONS = ("Traits", "Actions", "Bonus Actions", "Reactions",
            "Legendary Actions", "Utility Spells")


def sections(body):
    """Split a stat block's prose into its named sections, in order."""
    heads = [(m.start(), m.group(1)) for m in
             re.finditer(r"^(%s)\s*$" % "|".join(re.escape(s) for s in SECTIONS),
                         body, re.M)]
    out = {}
    for i, (pos, name) in enumerate(heads):
        end = heads[i + 1][0] if i + 1 < len(heads) else len(body)
        out[name] = body[pos + len(name):end].strip()
    return out


def entries(chunk):
    """A section's prose -> [(name, text)].

    Each entry starts flush-left with a bolded name ending in a period, e.g.
    "Multiattack." or "Dominate Mind (2/Day).". Boldness does not survive text
    extraction, so the shape of the name is all we have to go on — and shape
    alone is not enough.

    THE TRAP. Damage clauses wrap. "Hit: 6 (1d8 + 2)" ends a line and
    "Piercing damage." starts the next, which is a capitalised phrase at the
    start of a line ending in a period: indistinguishable, by shape, from an
    entry name. Splitting there truncated the action just before its damage
    and handed the leftovers to a phantom action called "Piercing damage" —
    which silently cost 80 of the bestiary's 423 attacks their numbers, and
    looked completely fine on the page.

    THE FIX. A real entry can only begin where the previous one *finished* its
    sentence. So a candidate is accepted only if the text before it ends in
    terminal punctuation; a candidate that follows "(1d8 + 2)" is a wrapped
    line, not a new action.
    """
    if not chunk:
        return []
    pat = re.compile(r"(?m)^(?P<name>[A-Z][A-Za-z'’/ -]{1,44}?"
                     r"(?:\s*\([^)]{1,40}\))?)\.\s")
    hits = []
    for h in pat.finditer(chunk):
        before = chunk[:h.start()].rstrip()
        if before and before[-1] not in ".!?":
            continue                       # a wrapped line, not a new entry
        hits.append(h)
    out = []
    for i, h in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(chunk)
        text = re.sub(r"\s+", " ", chunk[h.end():end]).strip()
        out.append((h.group("name").strip(), text))
    return out


# The 2024 action grammar. This is the reason a simulator is possible at all:
# attack bonus, reach or range, damage dice and damage type are all in fixed
# positions rather than buried in prose the way the 2014 format had them.
ATTACK = re.compile(
    # "Melee or Ranged" must lead the alternation or "Melee" wins and the rest
    # of the line no longer lines up.
    r"(?P<kind>Melee or Ranged|Melee|Ranged)\s+Attack\s+Roll:\s*(?P<bonus>[+-]\d+)"
    # Three optional pieces the document uses inconsistently: "+17 to hit",
    # a parenthetical rider ("(with Advantage if the target is Grappled)"),
    # and a stray space before the comma ("+7 , reach 5 ft.").
    r"(?:\s+to\s+hit)?(?:\s*\([^)]*\))?\s*,\s*"
    # Everything up to "Hit:" is the distance clause. Reading only as far as
    # the first full stop truncated "reach 10 ft. or range 30/120 ft."
    r"(?P<range>.{0,110}?)\s*"
    # Damage is usually "12 (2d6 + 5) Piercing" but is sometimes a flat number
    # with no dice at all — "Hit: 1 Slashing damage" — so the dice are optional.
    # The dice may use an EN DASH as its minus: the Jackal's bite is printed
    # "1 (1d4–1) Piercing damage". Accepted here and normalised below, rather
    # than replaced document-wide, which would also rewrite "Recharge 5–6".
    r"Hit:\s*(?P<avg>\d+)\s*(?:\((?P<dice>[\dd +\-–—]+)\)\s*)?"
    r"(?P<type>[A-Z][a-z]+)\s+damage", re.S)

# Some attacks deal no damage at all — the Roper's tentacle only grapples and
# poisons. Its bonus and its 60-foot reach are still numbers the map needs, so
# it is parsed as an attack without a damage clause rather than thrown away.
ATTACK_NO_DAMAGE = re.compile(
    r"(?P<kind>Melee or Ranged|Melee|Ranged)\s+Attack\s+Roll:\s*(?P<bonus>[+-]\d+)"
    r"(?:\s+to\s+hit)?(?:\s*\([^)]*\))?\s*,\s*(?P<range>.{0,110}?)\s*Hit:", re.S)

SAVE = re.compile(
    r"(?P<abil>Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)"
    r"\s+Saving\s+Throw:\s*DC\s*(?P<dc>\d+)", re.S)

# "reach 15 ft." / "range 120/480 ft." / "reach 5 ft. or range 20/60 ft."
REACH = re.compile(r"reach\s+(\d+)\s*ft", re.I)
RANGE = re.compile(r"range\s+(\d+)(?:/(\d+))?\s*ft", re.I)


def parse_action(name, text):
    """One action entry -> the numbers a simulator needs, plus its prose."""
    a = {"name": name, "text": text}
    m = ATTACK.search(text) or ATTACK_NO_DAMAGE.search(text)
    if m:
        damaging = "avg" in m.groupdict() and m.group("avg") is not None
        a["attack"] = {
            "kind": m.group("kind"),
            "bonus": int(m.group("bonus")),
            "avg": int(m.group("avg")) if damaging else None,
            # null where the SRD prints fixed damage with no dice, e.g. the
            # Awakened Shrub's "Hit: 1 Slashing damage". Not a parse failure —
            # a real thing the game does, and the simulator must handle it.
            "dice": (re.sub(r"[\s]", "", m.group("dice")).replace("–", "-").replace("—", "-")
                     if damaging and m.group("dice") else None),
            "damageType": m.group("type") if damaging else None,
        }
        rng = m.group("range")
        r = REACH.search(rng)
        g = RANGE.search(rng)
        if r:
            a["attack"]["reach"] = int(r.group(1))
        if g:
            a["attack"]["range"] = int(g.group(1))
            if g.group(2):
                a["attack"]["long"] = int(g.group(2))
    s = SAVE.search(text)
    if s:
        a["save"] = {"ability": s.group("abil")[:3], "dc": int(s.group("dc"))}
    if re.search(r"\bEmanation\b", text):
        a["area"] = "emanation"
    for shape in ("Cone", "Line", "Sphere", "Cube", "Cylinder"):
        if re.search(r"\b%s\b" % shape, text):
            a["area"] = shape.lower()
    return a


def parse_block(name, body):
    """One stat block -> a record. Returns (record, [complaints])."""
    bad = []
    meta = META.search(body)
    ac = AC.search(body)
    hp = re.search(r"^HP\s+(\d+)(?:\s*\(([^)]*)\))?", body, re.M)
    speed = re.search(r"^Speed\s+([^\n]+)", body, re.M)
    cr = CR_LINE.search(body)

    rec = {"name": name}
    if meta:
        rec["size"] = meta.group("size")
        rec["type"] = meta.group("type")
        rec["alignment"] = meta.group("align").strip()
    else:
        bad.append("no meta line")
    if ac:
        rec["ac"] = int(ac.group(1))
    else:
        bad.append("no AC")
    if hp:
        rec["hp"] = int(hp.group(1))
        if hp.group(2):
            rec["hitDice"] = re.sub(r"\s+", "", hp.group(2))
    else:
        bad.append("no HP")
    if speed:
        rec["speed"] = re.sub(r"\s+", " ", speed.group(1)).strip().rstrip(".")
        walk = re.match(r"(\d+)\s*ft", rec["speed"])
        rec["walk"] = int(walk.group(1)) if walk else 0
    else:
        bad.append("no Speed")

    abil = {}
    for mm in ABIL_TRIPLE.finditer(body):
        key = mm.group(1).title()
        if key not in abil:
            abil[key] = {"score": int(mm.group(2)),
                         "mod": int(mm.group(3)),
                         "save": int(mm.group(4))}
    if len(abil) == 6:
        rec["abilities"] = abil
    else:
        bad.append(f"{len(abil)}/6 abilities")

    if cr:
        rec["cr"] = cr.group("cr")
        rec["xp"] = int((cr.group("xp1") or cr.group("xp2")).replace(",", ""))
        if cr.group("pb"):
            rec["pb"] = int(cr.group("pb"))
    else:
        bad.append("no CR line")

    for label, key in (("Skills", "skills"), ("Senses", "senses"),
                       ("Languages", "languages"), ("Immunities", "immunities"),
                       ("Resistances", "resistances"),
                       ("Vulnerabilities", "vulnerabilities"), ("Gear", "gear")):
        mm = re.search(r"^%s\s+([^\n]+)" % label, body, re.M)
        if mm:
            rec[key] = re.sub(r"\s+", " ", mm.group(1)).strip()

    secs = sections(body)
    for label, key in (("Traits", "traits"), ("Actions", "actions"),
                       ("Bonus Actions", "bonusActions"), ("Reactions", "reactions"),
                       ("Legendary Actions", "legendaryActions")):
        got = [parse_action(n, t) for n, t in entries(secs.get(label, ""))]
        if got:
            rec[key] = got
    # A creature with no Actions is not necessarily a bad parse: the Shrieker
    # Fungus really does nothing but react. Complain only when a block offers
    # no way to affect anything at all.
    if not any(rec.get(k) for k in ("actions", "bonusActions", "reactions",
                                    "legendaryActions")):
        bad.append("nothing it can do")
    return rec, bad


# ------------------------------------------------------- the rest of the book

def xp_budget(text):
    """The XP Budget per Character table, which is the point of this build.

    Rows are "<level> <low> <moderate> <high>" with thousands separators, run
    together by the extractor. Levels must come out 1..20 in order or we have
    mis-sliced the table, so the caller checks that.
    """
    i = text.find("XP Budget per Character")
    if i < 0:
        return {}
    chunk = re.sub(r"\s+", " ", text[i:i + 1400])
    nums = re.findall(r"\d[\d,]*", chunk)
    vals = [int(n.replace(",", "")) for n in nums]
    out, k = {}, 0
    for lvl in range(1, 21):
        # each row is level, low, moderate, high — find the row whose first
        # number is the level we expect, so a stray number cannot shift us
        while k < len(vals) and vals[k] != lvl:
            k += 1
        if k + 3 >= len(vals):
            break
        out[lvl] = {"low": vals[k + 1], "moderate": vals[k + 2], "high": vals[k + 3]}
        k += 4
    return out


def feats(text):
    """[{name, category, prerequisite, text}] — the SRD's whole feat list."""
    out = []
    pat = re.compile(r"\n(?P<name>[A-Z][A-Za-z' -]{2,34})\s*\n\s*"
                     r"(?P<cat>Origin|General|Fighting Style|Epic Boon) Feat\b")
    hits = list(pat.finditer(text))
    for i, h in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else h.end() + 2600
        body = text[h.end():end]
        pre = re.search(r"Prerequisite:\s*([^\n]+)", body)
        out.append({
            "name": h.group("name").strip(),
            "category": h.group("cat"),
            "prerequisite": re.sub(r"\s+", " ", pre.group(1)).strip() if pre else None,
            "text": re.sub(r"\s+", " ", body[:1400]).strip(),
        })
    return out


CLASSES = ("Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk",
           "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard")


def classes(pages):
    """Per class: its core traits, its level-by-level features, and its subclass.

    Only the level->features mapping is parsed structurally; the feature prose
    is kept whole. The features table's extra columns (Rages, Sneak Attack,
    spell slots) differ per class and are captured as raw trailing values, in
    order, rather than guessed at.
    """
    text = "\n".join(pages)
    out = {}
    for name in CLASSES:
        m = re.search(r"^Core %s Traits\s*$" % name, text, re.M)
        if not m:
            continue
        nxt = min([p for p in
                   [text.find("\nCore %s Traits" % o, m.end()) for o in CLASSES]
                   if p > 0] or [len(text)])
        body = text[m.start():nxt]
        rec = {"name": name}
        for label, key in (("Primary Ability", "primary"),
                           ("Hit Point Die", "hitDie"),
                           ("Saving Throw", "saves"),
                           ("Weapon Proficiencies", "weapons"),
                           ("Armor Training", "armor")):
            mm = re.search(r"^%s\s*\n?\s*([^\n]+)" % re.escape(label), body, re.M)
            if mm:
                rec[key] = re.sub(r"\s+", " ", mm.group(1)).strip()
        hd = re.search(r"D(\d+) per %s level" % name, body)
        if hd:
            rec["hitDie"] = int(hd.group(1))
        # "Level 3: Subclass" style feature headings
        feats_by_level = {}
        for mm in re.finditer(r"^Level (\d+):\s*([^\n]+)$", body, re.M):
            feats_by_level.setdefault(int(mm.group(1)), []).append(mm.group(2).strip())
        rec["features"] = {str(k): v for k, v in sorted(feats_by_level.items())}
        out[name] = rec
    return out


# ------------------------------------------------------------------- output

# The attribution CC BY 4.0 obliges. It is reproduced verbatim in every file
# this script writes, because every one of them contains SRD material and the
# licence requires the statement to travel with it. Do not reword it, and do
# not add any other credit alongside it — the SRD's own legal page forbids that.
ATTRIBUTION = """// This work includes material from the System Reference Document 5.2.1
// ("SRD 5.2.1") by Wizards of the Coast LLC, available at
// https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
// Commons Attribution 4.0 International License, available at
// https://creativecommons.org/licenses/by/4.0/legalcode."""


def module(path, blurb, exports):
    head = (f"// table/srd5/{os.path.basename(path)} — {blurb}\n//\n"
            "// GENERATED by tools/scrape-srd.py from the SRD 5.2.1 PDF:\n"
            "//   python3 table/srd5/tools/scrape-srd.py\n"
            "// Do not hand-edit — re-run the scraper.\n//\n"
            f"{ATTRIBUTION}\n\n")
    body = "".join(
        f"export const {name} = {json.dumps(value, indent=1, ensure_ascii=False)};\n\n"
        for name, value in exports)
    with open(path, "w") as f:
        f.write(head + body)


def write_modules(out, data):
    os.makedirs(out, exist_ok=True)
    module(os.path.join(out, "monsters.js"),
           "the SRD bestiary, parsed into numbers a simulator can use",
           [("BESTIARY", data["monsters"])])
    module(os.path.join(out, "data.js"),
           "classes, feats and the official encounter maths",
           [("XP_BUDGET", data["xpBudget"]),
            ("FEATS", data["feats"]),
            ("CLASSES", data["classes"])])


# ------------------------------------------------------------------- driver

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", default=os.path.join(HERE, "SRD_CC_v5.2.1.pdf"))
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    pages, text = document(fetch(args.pdf))

    # The monster section starts at "Monsters A-Z"; everything after it, to the
    # end of the document, is stat blocks (the Animals appendix included).
    start = next((i for i, p in enumerate(pages)
                  if re.search(r"^\s*Monsters A[–—-]Z\s*$", p, re.M)), None)
    if start is None:
        sys.exit("could not find the 'Monsters A-Z' heading")
    mon_text = "\n".join(pages[start - 2:])

    monsters, complaints = [], []
    for name, body in find_blocks(mon_text):
        rec, bad = parse_block(name, body)
        monsters.append(rec)
        if bad:
            complaints.append((name, bad))

    ac_lines = len(re.findall(r"^AC\s+\d+", mon_text, re.M))
    data = {
        "source": "System Reference Document 5.2.1",
        "license": "CC BY 4.0",
        "monsters": monsters,
        "xpBudget": xp_budget(text),
        "feats": feats(text),
        "classes": classes(pages),
    }

    write_modules(args.out, data)

    print(f"monsters      {len(monsters)} (AC lines in section: {ac_lines})")
    print(f"xp budget     {len(data['xpBudget'])} levels")
    print(f"feats         {len(data['feats'])}")
    print(f"classes       {len(data['classes'])}")
    if complaints:
        print(f"\nincomplete    {len(complaints)}")
        for n, bad in complaints[:25]:
            print(f"  {n:34} {', '.join(bad)}")
    else:
        print("\nevery block parsed complete")


if __name__ == "__main__":
    main()
