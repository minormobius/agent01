"""The wire in a sheared stream between two mirror planes: the first edge-effect computation.

A wire hung across a 4D pipe sees a stream that is fastest at the pipe's axis and falls to nothing at the wall. Here
that is modelled without the wall itself: the stream past the wire is
    U(w) = 1 - s (1 - cos(beta0 w)) / 2,        beta0 = 2 / R,
which near the centre is the pipe's parabola 1 - (w/R)^2 for a pipe of radius R wire diameters (s = 1), is zero with
zero slope at w = pi R / 2, and is one harmonic of the cosine series nl4.py already uses along the wire. The planes
w = 0 and w = pi R / 2 are mirrors (slip), not walls, and the stream does not fall off across the wire as a pipe's
does: this is a wire in a sheared slab, the first step toward the pipe. A body force nu beta0^2 s cos(beta0 w) / 2
holds the profile up far from the wire, so the far field is an exact solution. Re is on the centre speed.
The state is (uniform-stream base flow B at Re) + q, as in nl4.py; q carries the far-field values -s/2 (k = 0) and
+s/2 (k = 1) on the outer boundary and starts as B scaled by the local stream, which is divergence-free.
Still the family symmetric round the flow axis, and even about the pipe's axis (w = 0).
    python shear4.py Re R [T=300] [dt=0.04] [K=14] [Nr=50] [Nt=40] [s=1] [tag]  ->  data/shear-<tag>.npz, .json
    (RESUME=1 continues a saved run)
"""
import os, sys, json, time
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spl
from wake4 import Wake

Re = float(sys.argv[1]); Rp = float(sys.argv[2]); beta0 = 2.0 / Rp; T = float(sys.argv[3]) if len(sys.argv) > 3 else 300.0
dt = float(sys.argv[4]) if len(sys.argv) > 4 else 0.04; K = int(sys.argv[5]) if len(sys.argv) > 5 else 14
Nr = int(sys.argv[6]) if len(sys.argv) > 6 else 50; Nt = int(sys.argv[7]) if len(sys.argv) > 7 else 40
sh = float(sys.argv[8]) if len(sys.argv) > 8 else 1.0; tag = sys.argv[9] if len(sys.argv) > 9 else f"{Re:.0f}-R{Rp:g}"
W = Wake(Nr=Nr, Nt=Nt); n2, n1 = W.n2, W.n1; g = None
for R in sorted(set([1, 10, 40, 100, 150, 200, 283, 400, 566, 800, 1131, 1600, Re])):
    if R <= Re: g = W.base(R, g)
U0, V0, P0 = g

# quadrature-point machinery: nodal values -> values and gradients at quadrature points, and back as load vectors
b2 = W.b2; nel, nq = b2.dx.shape; rows = np.arange(nel * nq).reshape(nel, nq)
def interp(which):
    I, J, D = [], [], []
    for i in range(b2.Nbfun):
        phi = b2.basis[i][0]; val = phi.value if which == 0 else phi.grad[which - 1]
        I.append(rows.ravel()); J.append(np.repeat(b2.element_dofs[i], nq)); D.append(np.broadcast_to(val, (nel, nq)).ravel())
    return sp.csr_matrix((np.concatenate(D), (np.concatenate(I), np.concatenate(J))), shape=(nel * nq, n2))
Iv, Ix, Ir = interp(0), interp(1), interp(2)
rq = b2.global_coordinates().value[1].ravel()
Pld = (Iv.T @ sp.diags(b2.dx.ravel() * rq)).tocsr()          # load vector of  int f phi r

# the linear operators, one per harmonic, factorised once
wall, ax = np.union1d(W.d_sph, W.d_far), W.d_axis
nu = 1.0 / Re; C, Ux, Ur, Vx, Vr, Vor = W.conv(U0, V0)
def system(k):
    beta = k * beta0; D = nu * (W.K + beta * beta * W.M); Auu, Avv = C + Ux + D, C + Vr + D + nu * W.M_r2
    if k == 0:
        L = sp.bmat([[Auu, Ur, W.Gx], [Vx, Avv, W.Gr], [W.Gx.T, W.Gr.T, None]], format='csc')
        B = sp.block_diag([W.M, W.M, sp.csc_matrix((n1, n1))], format='csc'); fixed = np.concatenate([wall, n2 + np.union1d(wall, ax)]); N = 2 * n2 + n1
    else:
        Gb = beta * W.Gm
        L = sp.bmat([[Auu, Ur, None, W.Gx], [Vx, Avv, None, W.Gr], [None, None, C + D, Gb], [W.Gx.T, W.Gr.T, Gb.T, None]], format='csc')
        B = sp.block_diag([W.M, W.M, W.M, sp.csc_matrix((n1, n1))], format='csc'); fixed = np.concatenate([wall, n2 + np.union1d(wall, ax), 2 * n2 + wall]); N = 3 * n2 + n1
    free = np.setdiff1d(np.arange(N), fixed)
    g = np.zeros(N); lift = np.zeros(len(free)); frc = np.zeros(len(free))
    if k <= 1 and sh:
        g[W.d_far] = -sh / 2 if k == 0 else sh / 2; lift = -(L[free] @ g)       # the outer boundary's values; constant in time, so no mass term
        if k == 1: F = np.zeros(N); F[:n2] = nu * beta0 ** 2 * sh / 2 * (Pld @ np.ones(Pld.shape[1])); frc = F[free]
    return dict(free=free, N=N, g=g, add=lift + frc, B=B[free][:, free].tocsr(), lu=spl.splu((1.5 / dt * B + L)[free][:, free].tocsc()))
S = [system(k) for k in range(K + 1)]

Nw = 2 * K + 4; th = (np.arange(Nw) + 0.5) * np.pi / Nw; kk = np.arange(K + 1)
Cw, Sw = np.cos(np.outer(kk, th)), np.sin(np.outer(kk, th))           # (K+1, Nw)
norm = np.where(kk == 0, 1.0, 2.0)[:, None] / Nw

def nonlinear(q):
    """q[k] = (u, v, b) nodal arrays -> load vectors of -(q.grad q) per harmonic, in the unknowns' ordering."""
    u = np.array([q[k][0] for k in kk]); v = np.array([q[k][1] for k in kk]); b = np.array([q[k][2] for k in kk])
    def phys(F, trig, op=Iv): return (op @ F.T) @ trig                 # (nq_total, Nw)
    uu, ux, ur = phys(u, Cw), phys(u, Cw, Ix), phys(u, Cw, Ir); vv, vx, vr = phys(v, Cw), phys(v, Cw, Ix), phys(v, Cw, Ir)
    bb, bx, br = -phys(b, Sw), -phys(b, Sw, Ix), -phys(b, Sw, Ir)       # physical b = - sum b_k sin
    kb = (kk * beta0)[:, None]
    uw, vw, bw = -phys(u * kb, Sw), -phys(v * kb, Sw), -phys(b * kb, Cw)
    Nu_, Nv_, Nb_ = uu * ux + vv * ur + bb * uw, uu * vx + vv * vr + bb * vw, uu * bx + vv * br + bb * bw
    Fu = Pld @ (Nu_ @ (Cw * norm).T); Fv = Pld @ (Nv_ @ (Cw * norm).T); Fb = Pld @ (-(Nb_ @ (Sw * norm).T))   # stored b = - sin coefficient
    return [-np.concatenate([Fu[:, k], Fv[:, k]] + ([Fb[:, k]] if k else []) + [np.zeros(n1)]) for k in kk]

def split(k, x): return (x[:n2], x[n2:2 * n2], x[2 * n2:3 * n2] if k else np.zeros(n2))
x = [np.zeros(S[k]['N']) for k in kk]
X, Rr = b2.doflocs
if sh: x[0][:n2] = -sh / 2 * U0; x[0][n2:2 * n2] = -sh / 2 * V0; x[1][:n2] = sh / 2 * U0; x[1][n2:2 * n2] = sh / 2 * V0      # B times the local stream
else: seed = 1e-3 * np.exp(-((X - 1.2) ** 2 + (Rr - 0.35) ** 2) / 0.15); seed[np.union1d(wall, ax)] = 0; x[1][n2:2 * n2] = seed
xm = [a.copy() for a in x]; Nm = None; hist = []; t0 = time.time(); steps = int(round(T / dt))
n0 = 0
if os.environ.get("RESUME") and os.path.exists(f"data/shear-{tag}.npz"):   # pick up a run a lost container cut short (the first step back is first order)
    z = np.load(f"data/shear-{tag}.npz"); old = json.load(open(f"data/shear-{tag}.json"))
    if old["dt"] == dt and old["K"] == K and old["Nr"] == Nr and old["Nt"] == Nt and old["hist"]:
        x = [z[f"x{k}"] for k in kk]; xm = [a.copy() for a in x]; hist = old["hist"]; n0 = int(round(hist.pop()["t"] / dt)); print("resumed at t", n0 * dt, flush=True)
axo = np.argsort(X[ax]); axd = ax[axo]; xa = X[axd]
ws = np.linspace(0, np.pi / beta0, 65)                      # stations along the wire, pipe axis to the mirror plane
def bubble(w):
    ut = U0[axd] + sum(np.cos(k * beta0 * w) * x[k][:n2][axd] for k in kk); i = np.where((xa > 0.5 + 1e-9) & (ut < 0))[0]
    if not len(i) or i.max() + 1 >= len(xa): return 0.0
    j = i.max(); return float(xa[j] + (xa[j + 1] - xa[j]) * (-ut[j]) / (ut[j + 1] - ut[j]) - 0.5)
for n in range(n0, steps + 1):
    if n % 20 == 0:
        E = [float(0.5 * sum(c @ (W.M @ c) for c in split(k, x[k]))) for k in kk]
        rate = float(np.sqrt(sum(((x[k] - xm[k])[:n2] / dt) @ (W.M @ ((x[k] - xm[k])[:n2] / dt)) for k in kk)))      # |du/dt|: zero at a steady state
        hist.append(dict(t=n * dt, E=E, rate=rate, bub=[round(bubble(w), 4) for w in ws[::4]]))
        if n % 400 == 0: print(f"t {n * dt:7.1f}  rate {rate:.3e}  E {' '.join('%.1e' % e for e in E[:8])}  bubble at 0: {hist[-1]['bub'][0]:.3f}  {time.time() - t0:.0f}s", flush=True)
        if not np.isfinite(E[1]) or E[1] > 1e3: print("blew up"); break
    if n % 500 == 0 or n == steps:
        np.savez_compressed(f"data/shear-{tag}.npz", U0=U0, V0=V0, **{f"x{k}": x[k] for k in kk})
        json.dump(dict(Re=Re, R=Rp, s=sh, beta0=beta0, dt=dt, K=K, Nr=Nr, Nt=Nt, ws=list(ws), bub=[bubble(w) for w in ws], hist=hist), open(f"data/shear-{tag}.json", "w"))
    Nn = nonlinear([split(k, x[k]) for k in kk]); Ne = Nn if Nm is None else [2 * a - b for a, b in zip(Nn, Nm)]
    new = []
    for k in kk:
        s = S[k]; f = s['free']; rhs = s['B'] @ ((4 * x[k][f] - xm[k][f]) / (2 * dt)) + Ne[k][f] + s['add']; y = s['g'].copy(); y[f] = s['lu'].solve(rhs); new.append(y)
    xm, x, Nm = x, new, Nn
print("done", f"{time.time() - t0:.0f}s")
