"""Sample a computed wake on a regular (x, r) grid for the page.
    python export4.py mode <Re> [beta=2.5]   the steady base flow and its most unstable m = 0 mode   -> data/mode-<Re>.bin/.json
    python export4.py nl <tag>               the last state of a nonlinear run (nl4.py)              -> data/flow-<tag>.bin/.json
    python export4.py pulse <tag> [frames=36] [wmax=7] [whole]   one cycle (whole: the whole record, for a pulse that does not repeat) of a pulsing sheared-stream run (shear4.py with FRAMES=n)  -> data/pulse-<tag>.bin/.json
        Int8: per frame, u then b on the slice (x, w) through the flow's axis, w from 0 to wmax; u in 1/100, b in 1/200
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

if kind == "pulse":
    import glob
    tag = sys.argv[2]; NF = int(sys.argv[3]) if len(sys.argv) > 3 else 36; wmax = float(sys.argv[4]) if len(sys.argv) > 4 else 7.0; h = 0.05
    J = json.load(open(f"data/shear-{tag}.json")); Z = np.load(f"data/shear-{tag}.npz"); W = Wake(Nr=J["Nr"], Nt=J["Nt"]); beta0 = J["beta0"]
    files = sorted(glob.glob(f"data/frames-{tag}/*.npy")); steps = np.array([int(f.split("/")[-1][:-4]) for f in files])
    xs = np.arange(X0, X1 + 1e-9, h); ws = np.arange(0, wmax + 1e-9, h); okx = np.abs(xs) > 0.5 + 1e-6
    Pm = W.b2.probes(np.vstack([xs[okx], np.zeros(okx.sum())])); ub = Pm @ Z["U0"]; kk = np.arange(J["K"] + 1)
    Cw, Sw = np.cos(np.outer(ws, kk * beta0)), np.sin(np.outer(ws, kk * beta0))
    def slice_(f):                                           # (2, nw, nx): u and b on the plane through the axis
        q = np.load(f); out = np.zeros((2, len(ws), len(xs)), dtype=np.float32)
        out[0][:, okx] = ub + Cw @ (q[:, 0] @ Pm.T); out[1][:, okx] = -Sw @ (q[:, 1] @ Pm.T); return out
    A = np.array([slice_(f) for f in files]); n = len(A)
    # the loop: the frame, at least 60% of the record along, that looks most like the first
    d = [np.abs(A[i][0] - A[0][0]).mean() for i in range(n)]; lo = int(0.6 * n); N = n - 1 if 'whole' in sys.argv else lo + int(np.argmin(d[lo:]))
    def bub(u):
        i = np.where((xs > 0.5) & (u < 0))[0]
        if not len(i) or i.max() + 1 >= len(xs): return 0.0
        j = i.max(); return float(xs[j] + h * (-u[j]) / (u[j + 1] - u[j]) - 0.5)
    out = []; bubs = []
    for i in range(NF):
        f = i * N / NF; a = int(f); t = f - a; fr = (1 - t) * A[a] + t * A[min(a + 1, n - 1)]; bubs.append(round(bub(fr[0][0]), 3))
        out += [np.clip(np.round(fr[0] * 100), -127, 127), np.clip(np.round(fr[1] * 200), -127, 127)]
    np.concatenate([o.ravel() for o in out]).astype(np.int8).tofile(f"data/pulse-{tag}.bin")
    period = float((steps[N] - steps[0]) * J["dt"])
    json.dump(dict(kind="pulse", Re=J["Re"], R=J["R"], nx=len(xs), nw=len(ws), x0=X0, h=h, nf=NF, period=period, loop='whole' not in sys.argv, bub=bubs, us=100, bs=200, seam=float(d[N]), drift=float(max(d))),
              open(f"data/pulse-{tag}.json", "w"))
    print("pulse", tag, n, "saved frames, loop of", N, "period", period, "seam", d[N], "largest difference", max(d), "bubble", min(bubs), max(bubs)); sys.exit()
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
