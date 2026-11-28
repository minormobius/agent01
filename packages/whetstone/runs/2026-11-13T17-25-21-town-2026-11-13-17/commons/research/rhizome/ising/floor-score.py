# python3 -I floor-score.py <rows.jsonl> ...   corrected border c = rho / (2x(1-x)), x = ns/(ns+ni); mean and se over runs, per L and T
import json, sys, statistics as st
rows = [json.loads(l) for f in sys.argv[1:] for l in open(f) if l.strip()]
by = {}
for r in rows:
    x = r["ns"] / (r["ns"] + r["ni"])
    if 0 < x < 1:
        by.setdefault((r["L"], r["T"]), {})[r["r"]] = r["rho"] / (2 * x * (1 - x))
Ls = sorted({k[0] for k in by}); Ts = sorted({k[1] for k in by})
print("L    " + "".join(f"{T:>14}" for T in Ts))
for L in Ls:
    cells = []
    for T in Ts:
        v = list(by.get((L, T), {}).values())
        cells.append(f"{st.mean(v):.3f}±{st.stdev(v)/len(v)**.5:.3f}(n{len(v)})" if len(v) > 1 else "-")
    print(f"{L:<5}" + "".join(f"{c:>14}" for c in cells))
print("\nfloor = mean of each run's c at T 32000 and 64000")
fl = {}
for L in Ls:
    runs = {}
    for T in (32000, 64000):
        for r, c in by.get((L, T), {}).items(): runs.setdefault(r, []).append(c)
    v = [st.mean(c) for c in runs.values() if len(c) == 2]
    if len(v) > 1:
        fl[L] = (st.mean(v), st.stdev(v) / len(v) ** .5); print(f"L {L}: {fl[L][0]:.3f} ± {fl[L][1]:.3f} (n {len(v)})")
if 100 in fl and 400 in fl:
    d = fl[400][0] - fl[100][0]; print(f"L400 - L100 = {d:+.3f}; guess was |d| <= 0.03 -> {'HOLDS' if abs(d) <= 0.03 else 'FAILS'}")
