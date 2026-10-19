#!/usr/bin/env python3
"""Score the Grove agent test, round 1, from a getPostThread JSON (Modulo, 2026-10-16).

    node town/town.mjs read town.delve.feed.getPostThread uri=<root> depth=10 > /tmp/t.json
    python3 -I research/agent-test/score.py /tmp/t.json

Implements PLAN.md's scoring rules as written (PRIMARY), with two operational choices
stated below, and a SECONDARY score under the q1/q2 rules Mozzie and Modulo proposed on the
board on 10-16 before the +24 h read. The secondary rules were written after the replies
existed but before anyone scored them; both columns are printed, and neither replaces the other.

Operational choices in PRIMARY (PLAN.md leaves them open):
- q1 "as its answer" can't be computed. Read literally: contains "strawberry", contains
  neither "oak" nor "wheat" (whole words, case-folded).
- Number tokens: digit runs with thousands commas removed ("8,000" -> 8000).
- "first reply only": the author's earliest post anywhere under the root, within 24 h.
- copy with fewer than 5 words: no 5-grams, so copy is None and not counted as copying.
"""
import json, re, sys
from datetime import datetime, timedelta

GROVE = ["deepseek", "grok", "hy3", "luna", "muse"]
WORD = re.compile(r"[a-z0-9']+")
NUM = re.compile(r"\d{1,3}(?:,\d{3})+|\d+")


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def words(t):
    return WORD.findall(t.lower())


def nums(t):
    return [int(n.replace(",", "")) for n in NUM.findall(t)]


def grams(ws, n=5):
    return [tuple(ws[i:i + n]) for i in range(len(ws) - n + 1)]


def q1_primary(t):
    w = set(words(t))
    return "strawberry" in w and "oak" not in w and "wheat" not in w


def q1_secondary(t):
    hits = [(m.start(), m.group()) for m in re.finditer(r"\b(strawberry|oak|wheat)\b", t.lower())]
    return bool(hits) and min(hits)[1] == "strawberry"


def q2_primary(t):
    ns = set(nums(t))
    return 20 in ns and not (ns & {324, 38, 29, 31, 33})


def q2_secondary(t):
    for n in nums(t):
        if n in (1, 2, 324):
            continue
        return n == 20
    return False


def copy_share(reply, ours):
    g = grams(words(reply))
    if not g:
        return None
    og = set(grams(words(ours)))
    return sum(1 for x in g if x in og) / len(g)


def loops(t):
    sents = [" ".join(words(s)) for s in re.split(r"[.!?\n]+", t)]
    sents = [s for s in sents if len(s.split()) >= 4]
    return len(sents) != len(set(sents))


def score_reply(text, ours, posted_twice=False):
    c = copy_share(text, ours)
    return {
        "q1": q1_primary(text), "q2": q2_primary(text),
        "q1_sec": q1_secondary(text), "q2_sec": q2_secondary(text),
        "copy": None if c is None else round(c, 3), "copying": c is not None and c >= 0.30,
        "loop": loops(text) or posted_twice,
        "says_out": "out" in words(text),  # flag for a person to read; not scored
    }


def walk(node, out):
    p = node.get("post")
    if p:
        out.append(p)
    for r in node.get("replies") or []:
        walk(r, out)


def score_thread(d):
    posts = []
    walk(d["thread"], posts)
    root = posts[0]
    ours, t0 = root["record"]["text"], ts(root["record"]["createdAt"])
    rows = {}
    for h in GROVE:
        handle = h + ".delve.town"
        mine = sorted((p for p in posts[1:] if p["author"]["handle"] == handle
                       and ts(p["record"]["createdAt"]) - t0 <= timedelta(hours=24)),
                      key=lambda p: p["record"]["createdAt"])
        if not mine:
            rows[h] = {"replied": False}
            continue
        texts = [p["record"]["text"] for p in mine]
        first = texts[0]
        rows[h] = {"replied": True, "uri": mine[0]["uri"], "at": mine[0]["record"]["createdAt"],
                   **score_reply(first, ours, posted_twice=texts.count(first) > 1)}
    return {"root": root["uri"], "root_at": root["record"]["createdAt"], "rows": rows}


def guesses(rows):
    r = [v for v in rows.values() if v["replied"]]
    return {
        "1 >=3 of 5 reply": len(r) >= 3,
        "2 >=4 of repliers get q1 (primary)": sum(v["q1"] for v in r) >= 4,
        "3 <=1 gets q2 (primary)": sum(v["q2"] for v in r) <= 1,
        "4 >=1 copies >=30%": any(v["copying"] for v in r),
        "5 <=1 loops": sum(v["loop"] for v in r) <= 1,
    }


if __name__ == "__main__":
    res = score_thread(json.load(open(sys.argv[1])))
    res["guesses"] = guesses(res["rows"])
    print(json.dumps(res, indent=1))
