"""The 4D wire's wake past its first instability: a nonlinear run.

The first unstable mode (wake4.py) is symmetric round the flow axis, so the flow near onset depends on three
coordinates: x (downstream), r (distance from the flow axis) and w (along the wire). This steps the full equations in
that subspace: no swirl, and even in w about a cell boundary, so
    u, v, p = sum_k (.)_k cos(k beta0 w),      b = - sum_k b_k sin(k beta0 w)        k = 0 .. K
with beta0 the wavenumber of the wire-wise period. The state is the steady axisymmetric base flow plus a disturbance
q; the linear part (wake4's operator at beta = k beta0) is implicit (BDF2), the quadratic term q.grad q is explicit
(extrapolated) and evaluated at Nw points along w, which is exact for the products kept.
Modes that break the symmetry round the flow axis (m = 1 and up) are NOT in this run; above Re about 207 one of them is
linearly unstable on the base flow, so there this is a solution of the equations that may itself be unstable.
    python nl4.py Re [beta0=2.5] [T=400] [dt=0.05] [K=6] [Nr=50] [Nt=40]  ->  data/nl-<Re>.npz, data/nl-<Re>.json
"""
import sys, json, time
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spl
from wake4 import Wake

Re = float(sys.argv[1]); beta0 = float(sys.argv[2]) if len(sys.argv) > 2 else 2.5; T = float(sys.argv[3]) if len(sys.argv) > 3 else 400.0
dt = float(sys.argv[4]) if len(sys.argv) > 4 else 0.05; K = int(sys.argv[5]) if len(sys.argv) > 5 else 6
Nr = int(sys.argv[6]) if len(sys.argv) > 6 else 50; Nt = int(sys.argv[7]) if len(sys.argv) > 7 else 40
tag = sys.argv[8] if len(sys.argv) > 8 else f"{Re:.0f}"
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
    return dict(free=free, N=N, B=B[free][:, free].tocsr(), lu=spl.splu((1.5 / dt * B + L)[free][:, free].tocsc()))
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
X, Rr = b2.doflocs; seed = 1e-3 * np.exp(-((X - 1.2) ** 2 + (Rr - 0.35) ** 2) / 0.15); seed[np.union1d(wall, ax)] = 0
x[1][n2:2 * n2] = seed
xm = [a.copy() for a in x]; Nm = None; hist = []; t0 = time.time(); steps = int(round(T / dt))
axo = np.argsort(X[ax]); axd = ax[axo]; xa = X[axd]
def bubble(sign):
    ut = U0[axd] + sum((sign ** k) * x[k][:n2][axd] for k in kk); i = np.where((xa > 0.5 + 1e-9) & (ut < 0))[0]
    if not len(i) or i.max() + 1 >= len(xa): return 0.0
    j = i.max(); return float(xa[j] + (xa[j + 1] - xa[j]) * (-ut[j]) / (ut[j + 1] - ut[j]) - 0.5)
for n in range(steps + 1):
    if n % 20 == 0:
        E = [float(0.5 * sum(c @ (W.M @ c) for c in split(k, x[k]))) for k in kk]
        hist.append(dict(t=n * dt, E=E, bub0=bubble(1), bubpi=bubble(-1)))
        if n % 400 == 0: print(f"t {n * dt:7.1f}  E1 {E[1]:.3e} E0 {E[0]:.3e} E2 {E[2]:.3e}  bubble {hist[-1]['bub0']:.3f} / {hist[-1]['bubpi']:.3f}  {time.time() - t0:.0f}s", flush=True)
        if not np.isfinite(E[1]) or E[1] > 1e3: print("blew up"); break
    if n % 2000 == 0 or n == steps:
        np.savez_compressed(f"data/nl-{tag}.npz", U0=U0, V0=V0, **{f"x{k}": x[k] for k in kk})
        json.dump(dict(Re=Re, beta0=beta0, dt=dt, K=K, Nr=Nr, Nt=Nt, hist=hist), open(f"data/nl-{tag}.json", "w"))
    Nn = nonlinear([split(k, x[k]) for k in kk]); Ne = Nn if Nm is None else [2 * a - b for a, b in zip(Nn, Nm)]
    new = []
    for k in kk:
        s = S[k]; f = s['free']; rhs = s['B'] @ ((4 * x[k][f] - xm[k][f]) / (2 * dt)) + Ne[k][f]; y = np.zeros(s['N']); y[f] = s['lu'].solve(rhs); new.append(y)
    xm, x, Nm = x, new, Nn
print("done", f"{time.time() - t0:.0f}s")
