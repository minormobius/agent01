import sys, json, time, numpy as np
from wake4 import Wake
kw = json.loads(sys.argv[1]); Res = [float(x) for x in sys.argv[2].split(",")]; betas = [float(x) for x in sys.argv[3].split(",")]; m = int(sys.argv[4]) if len(sys.argv) > 4 else 0
W = Wake(**kw); g = None; print(kw, "dofs", W.n2, flush=True)
for Re in sorted(set([1, 10, 40, 100, 150] + Res)):
    g = W.base(Re, g)
    if Re not in Res: continue
    row = []
    for b in betas:
        e = W.eig(g[0], g[1], Re, m, b, shift=0.03, k=3); e = e[np.argsort(-e.real)][0]; row.append(f"{e.real:+.4f}")
    print(f"Re {Re:.0f} m {m} C_D {W.drag(*g, Re):.4f} bubble {W.bubble(g[0]):.3f} | " + " ".join(row), flush=True)
