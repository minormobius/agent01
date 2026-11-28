"""Is the rippled mode the FIRST to go? Just below its threshold, search every azimuthal wavenumber m = 0..3, a fine
grid of wavenumbers along the wire, and shifts for steady and for oscillating modes, and record the least stable
mode found at each (m, beta). The claim holds if nothing grows.
    python first4.py Re [Nr=50] [Nt=40]   ->  data/first-<Re>.json   (~20 min)
Rows near -0.13 to -0.17 that are the same for every m are the truncated domain's free-stream modes."""
import sys, json, time, numpy as np
from wake4 import Wake
Re = float(sys.argv[1]); Nr = int(sys.argv[2]) if len(sys.argv) > 2 else 50; Nt = int(sys.argv[3]) if len(sys.argv) > 3 else 40
BETAS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4, 5, 6, 8]; SHIFTS = [0.05, 0.05 + 0.35j, 0.05 + 0.7j, 0.05 + 1.2j, 0.05 + 2.0j]
W = Wake(Nr=Nr, Nt=Nt); g = None; rows = []; t0 = time.time()
for R in sorted(set([1, 10, 40, 100, 150, Re])): g = W.base(R, g)
for m in range(4):
    for beta in BETAS:
        best = None
        for sh in SHIFTS:
            try: e = W.eig(g[0], g[1], Re, m, beta, shift=sh, k=6)
            except Exception as ex: print("eig failed", m, beta, sh, ex); continue
            e = e[np.argsort(-e.real)][0]
            if best is None or e.real > best.real: best = e
        rows.append(dict(m=m, beta=beta, growth=float(best.real), freq=float(abs(best.imag)))); print(f"Re {Re:g} m {m} beta {beta:<5} growth {best.real:+.4f} freq {abs(best.imag):.3f}  {time.time() - t0:.0f}s", flush=True)
        json.dump(dict(Re=Re, Nr=Nr, Nt=Nt, betas=BETAS, shifts=[[s.real, s.imag] if isinstance(s, complex) else [s, 0] for s in SHIFTS], rows=rows), open(f"data/first-{Re:g}.json", "w"))
print("largest growth found:", max(r["growth"] for r in rows))
