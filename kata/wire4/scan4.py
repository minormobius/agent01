import sys, json, time, numpy as np
from wake4 import Wake
Re_list = [float(x) for x in sys.argv[1].split(",")]; Nr, Nt = int(sys.argv[2]), int(sys.argv[3]); out = sys.argv[4]
BETAS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6] if len(sys.argv) < 6 else [float(x) for x in sys.argv[5].split(",")]
W = Wake(Nr=Nr, Nt=Nt); g = None; rows = []; t0 = time.time()
for Re in sorted(set([1, 10, 40, 100, 150, 200] + Re_list)):
    g = W.base(Re, g)
    if Re not in Re_list: continue
    for m in [0, 1, 2]:
        for beta in BETAS:
            best = None
            for shift in [0.05, 0.05 + 0.7j]:
                try: e = W.eig(g[0], g[1], Re, m, beta, shift=shift, k=5)
                except Exception as ex: print("eig failed", Re, m, beta, shift, ex); continue
                e = e[np.argsort(-e.real)][0]
                if best is None or e.real > best.real: best = e
            rows.append(dict(Re=Re, m=m, beta=beta, growth=best.real, freq=abs(best.imag)))
            print(f"Re {Re:.0f} m {m} beta {beta:<5} growth {best.real:+.4f} freq {abs(best.imag):.3f}  {time.time() - t0:.0f}s", flush=True)
            json.dump(dict(Nr=Nr, Nt=Nt, rows=rows), open(out, "w"))
