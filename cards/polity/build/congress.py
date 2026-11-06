#!/usr/bin/env python3
"""Congress + every term since 1789, from unitedstates/congress-legislators.
Writes raw/congress.json: [{name, wiki, qid, bio, born, terms:[{b,st,d,p,s,e}]}]
Usage: python3 congress.py   (downloads into raw/, needs network)"""
import json, os, urllib.request, yaml
BASE = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/"
here = os.path.dirname(os.path.abspath(__file__))
raw = os.path.join(here, "raw"); os.makedirs(raw, exist_ok=True)
out = []
for f in ["legislators-historical.yaml", "legislators-current.yaml"]:
    p = os.path.join(raw, f)
    if not os.path.exists(p):
        urllib.request.urlretrieve(BASE + f, p)
    for L in yaml.load(open(p), Loader=yaml.CSafeLoader):
        n = L.get("name", {})
        name = n.get("official_full") or " ".join(x for x in [n.get("first"), n.get("middle"), n.get("last"), n.get("suffix")] if x)
        ids = L.get("id", {})
        terms = []
        for t in L.get("terms", []):
            terms.append({"b": "H" if t["type"] == "rep" else "S", "st": t["state"],
                          "d": t.get("district"), "p": t.get("party") or "Unknown",
                          "s": str(t["start"]), "e": str(t["end"])})
        out.append({"name": name, "wiki": ids.get("wikipedia"), "qid": ids.get("wikidata"),
                    "bio": ids.get("bioguide"), "born": str(L.get("bio", {}).get("birthday") or "")[:4],
                    "terms": terms})
json.dump(out, open(os.path.join(raw, "congress.json"), "w"))
print(len(out), "people", sum(len(x["terms"]) for x in out), "terms")
