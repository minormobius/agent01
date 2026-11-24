"""Heat from a sphere in a uniform stream: the check of this study's heat-loss numbers against our world's literature.

A uniformly hot 4D wire in a uniform stream loses heat, per length, exactly as a sphere does (README section 2), so
the sphere's Nusselt number is the one number here that others have computed and measured. Steady advection-diffusion
on wake4.py's axisymmetric base flow; theta = 1 on the sphere, 0 on the inflow and side boundary, natural at the
outflow; the heat from the consistent flux (the residual at the sphere's nodes), as heat4.py takes it.
    python nu4.py [Pr=0.7] [Nr=70] [Nt=60] [Re,Re,...]   ->  prints Re, C_D, Nu; writes data/nu-sphere.json
"""
import sys, json
import numpy as np
import scipy.sparse.linalg as spl
from wake4 import Wake

Pr = float(sys.argv[1]) if len(sys.argv) > 1 else 0.7; Nr = int(sys.argv[2]) if len(sys.argv) > 2 else 70; Nt = int(sys.argv[3]) if len(sys.argv) > 3 else 60
Res = [float(v) for v in sys.argv[4].split(",")] if len(sys.argv) > 4 else [1, 5, 10, 20, 25, 40, 50, 100, 150, 200, 250]
W = Wake(Nr=Nr, Nt=Nt); n2 = W.n2; g = None; rows = []
fix = np.union1d(W.d_sph, W.d_far); free = np.setdiff1d(np.arange(n2), fix)
for Re in sorted(set(Res)):
    g = W.base(Re, g); kap = 1.0 / (Re * Pr); A = (W.conv(g[0], g[1])[0] + kap * W.K).tocsr()
    th = np.zeros(n2); th[W.d_sph] = 1.0; th[free] = spl.spsolve(A[free][:, free].tocsc(), -(A[free][:, fix] @ th[fix]))
    Nu = float((A[W.d_sph] @ th).sum() / kap * 2 * np.pi / np.pi)        # heat / (pi D^2) * D / k
    rows.append(dict(Re=Re, Pr=Pr, Nu=Nu, cd=float(W.drag(*g, Re)), min=float(th.min()), max=float(th.max())))
    print(f"Re {Re:6g}  Pr {Pr:g}  C_D {rows[-1]['cd']:.4f}  Nu {Nu:.4f}   theta in [{th.min():.4f}, {th.max():.4f}]", flush=True)
if len(sys.argv) <= 2: json.dump(dict(Pr=Pr, Nr=Nr, Nt=Nt, rows=rows), open("data/nu-sphere.json", "w"))
