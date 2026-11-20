"""The uniform wake's instabilities up a ladder of Reynolds numbers spaced by a factor of sqrt(2).

For each Re: the steady axisymmetric base flow (continued up the ladder), its drag and bubble, and for azimuthal
wavenumbers m = 0..3 and wire-wise wavenumbers beta the fastest mode found near two shifts (one steady, one
oscillating). Past Re 191 the uniform wake is not what a wire would have (it ripples, then tilts), so above that these
are the instabilities of an unstable state: they say what the flow is trying to do and how fast, not what it does.
Shift-invert finds the modes nearest each shift; a faster mode far from both would be missed.
    python ladder4.py 800,1131 [Nr=70] [Nt=56] [tpow=1.3]   ->  data/ladder-<Re>.json
"""
import sys, json, time, numpy as np
from wake4 import Wake
LADDER = [1, 10, 40, 100, 150, 200, 283, 400, 566, 800, 1131, 1600]
want = [float(x) for x in sys.argv[1].split(",")]; Nr = int(sys.argv[2]) if len(sys.argv) > 2 else 70; Nt = int(sys.argv[3]) if len(sys.argv) > 3 else 56; tp = float(sys.argv[4]) if len(sys.argv) > 4 else 1.3
BETAS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6, 8, 12]; W = Wake(Nr=Nr, Nt=Nt, tpow=tp); g = None; t0 = time.time()
for Re in LADDER:
    if Re > max(want): break
    g = W.base(Re, g)
    if Re not in want: continue
    out = dict(Re=Re, Nr=Nr, Nt=Nt, tpow=tp, cd=W.drag(*g, Re), bubble=W.bubble(g[0]), rows=[])
    for m in range(4):
        for beta in BETAS:
            best = None
            for shift in (0.3, 0.3 + 0.75j):
                try: e = W.eig(g[0], g[1], Re, m, beta, shift=shift, k=8)
                except Exception as ex: print("eig failed", Re, m, beta, shift, ex, flush=True); continue
                e = e[np.argsort(-e.real)][0]
                if best is None or e.real > best.real: best = e
            if best is None: continue
            out["rows"].append(dict(m=m, beta=beta, growth=float(best.real), freq=float(abs(best.imag))))
            print(f"Re {Re} m {m} beta {beta:<4} growth {best.real:+.4f} freq {abs(best.imag):.3f} {time.time() - t0:.0f}s", flush=True)
            json.dump(out, open(f"data/ladder-{Re}.json", "w"))
