"""Sample a computed wake on a regular (x, r) grid for the page.
    python export4.py mode <Re> [beta=2.5]   the steady base flow and its most unstable m = 0 mode   -> data/mode-<Re>.bin/.json
    python export4.py nl <tag>               the last state of a nonlinear run (nl4.py)              -> data/flow-<tag>.bin/.json
One Float32 file: U0, V0, then for each harmonic k its u_k, v_k, b_k, where
    u = U0 + sum u_k cos(k beta w),  v = V0 + sum v_k cos(k beta w),  b = sum b_k sin(k beta w)      (b along the wire)
"""
import sys, json
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spl
from wake4 import Wake

X0, X1, R1, H = -1.5, 7.0, 2.5, 0.025
kind = sys.argv[1]
xs, rs = np.arange(X0, X1 + 1e-9, H), np.arange(0, R1 + 1e-9, H)
GX, GR = np.meshgrid(xs, rs); pts = np.vstack([GX.ravel(), GR.ravel()]); ok = np.hypot(pts[0], pts[1]) > 0.5 + 1e-6

def sample(W, fields):
    Pm = W.b2.probes(pts[:, ok]); out = []
    for f in fields:
        a = np.zeros(pts.shape[1], dtype=np.float32); a[ok] = Pm @ f; out.append(a)
    return out

if kind == "mode":
    Re = float(sys.argv[2]); beta = float(sys.argv[3]) if len(sys.argv) > 3 else 2.5
    W = Wake(Nr=50, Nt=40); n2, n1 = W.n2, W.n1; g = None
    for R in sorted(set([1, 10, 40, 100, 150, Re])): g = W.base(R, g)
    U0, V0, _ = g
    wall, ax = np.union1d(W.d_sph, W.d_far), W.d_axis
    fixed = np.concatenate([wall, n2 + np.union1d(wall, ax), 2 * n2 + np.union1d(wall, ax), 3 * n2 + wall]); N = 4 * n2 + n1; free = np.setdiff1d(np.arange(N), fixed)
    L = W.operator(U0, V0, Re, 0, beta)[free][:, free].tocsc(); B = sp.block_diag([W.M] * 4 + [sp.csc_matrix((n1, n1))], format='csc')[free][:, free].tocsc()
    lu = spl.splu((-L - 0.03 * B).tocsc()); vals, vecs = spl.eigs(spl.LinearOperator(L.shape, matvec=lambda x: lu.solve(B @ x)), k=3, which='LM')
    sig = 0.03 + 1 / vals; i = np.argmax(sig.real); q = np.zeros(N); q[free] = vecs[:, i].real
    u, v, bt = q[:n2], q[n2:2 * n2], q[3 * n2:4 * n2]; s = 1 / np.abs(u).max(); s *= np.sign(u[np.argmax(np.abs(u))])
    F = sample(W, [U0, V0, u * s, v * s, -bt * s])
    meta = dict(kind="mode", Re=Re, beta=beta, growth=float(sig[i].real), ks=[1], note="linear mode, scaled so that its largest streamwise velocity is 1; its size is not determined")
    name = f"mode-{Re:.0f}"
else:
    tag = sys.argv[2]; J = json.load(open(f"data/nl-{tag}.json")); Z = np.load(f"data/nl-{tag}.npz")
    W = Wake(Nr=J["Nr"], Nt=J["Nt"]); n2 = W.n2; fields = [Z["U0"] + Z["x0"][:n2], Z["V0"] + Z["x0"][n2:2 * n2]]; ks = []
    for k in range(1, J["K"] + 1):
        x = Z[f"x{k}"]
        if np.abs(x[:n2]).max() < 3e-3: continue      # harmonics too small to see
        ks.append(k); fields += [x[:n2], x[n2:2 * n2], -x[2 * n2:3 * n2]]
    F = sample(W, fields); h = J["hist"][-1]
    meta = dict(kind="flow", Re=J["Re"], beta=J["beta0"], ks=ks, t=h["t"], bubble=[h["bub0"], h["bubpi"]])
    name = f"flow-{tag}"
np.concatenate(F).astype("<f4").tofile(f"data/{name}.bin")
json.dump(dict(nx=len(xs), nr=len(rs), x0=X0, r0=0.0, h=H, **meta), open(f"data/{name}.json", "w"))
print(name, len(F), "fields", len(xs), "x", len(rs), meta.get("growth"))
