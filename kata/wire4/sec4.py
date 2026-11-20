"""Is the rippled wake stable to disturbances that break the symmetry round the flow axis?

Takes a steady rippled state from nl4.py (data/nl-<tag>.npz) and steps the equations LINEARISED about it for a
disturbance  exp(i phi) x [ u, v, a cos-series in w ; b sin-series ]  (azimuthal wavenumber 1, the same period along
the wire and the same mirror planes as the ripple). The coupling to the steady axisymmetric base flow is implicit
(wake4's operator at m = 1, beta = j beta0); the coupling to the ripple is explicit. After the transients the fastest
mode is all that is left, and its growth rate and frequency are read off a probe by a two-term linear recurrence
(which handles a real mode and an oscillating pair alike).
Not covered: disturbances with a different period along the wire, or odd about the ripple's mirror planes; m >= 2.
    python sec4.py <tag> [T=300] [dt=0.04] [J=6] [ripple=1]     ripple=0 switches the ripple off (validation:
                                                                it must return the m = 1 eigenvalue of wake4.py)
"""
import sys, json, time
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spl
from wake4 import Wake

tag = sys.argv[1]; T = float(sys.argv[2]) if len(sys.argv) > 2 else 300.0; dt = float(sys.argv[3]) if len(sys.argv) > 3 else 0.04
J = int(sys.argv[4]) if len(sys.argv) > 4 else 6; ripple = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
meta = json.load(open(f"data/nl-{tag}.json")); Z = np.load(f"data/nl-{tag}.npz"); Re, beta0, K = meta["Re"], meta["beta0"], meta["K"]
W = Wake(Nr=meta["Nr"], Nt=meta["Nt"]); n2, n1 = W.n2, W.n1; U0, V0 = Z["U0"], Z["V0"]
b2 = W.b2; nel, nq = b2.dx.shape; rows = np.arange(nel * nq).reshape(nel, nq)
def interp(which):
    I, Jc, D = [], [], []
    for i in range(b2.Nbfun):
        phi = b2.basis[i][0]; val = phi.value if which == 0 else phi.grad[which - 1]
        I.append(rows.ravel()); Jc.append(np.repeat(b2.element_dofs[i], nq)); D.append(np.broadcast_to(val, (nel, nq)).ravel())
    return sp.csr_matrix((np.concatenate(D), (np.concatenate(I), np.concatenate(Jc))), shape=(nel * nq, n2))
Iv, Ix, Ir = interp(0), interp(1), interp(2); rq = b2.global_coordinates().value[1].ravel(); Pld = (Iv.T @ sp.diags(b2.dx.ravel() * rq)).tocsr()

kk, jj = np.arange(K + 1), np.arange(J + 1); Nw = K + 2 * J + 4; th = (np.arange(Nw) + 0.5) * np.pi / Nw
Ck, Sk, Cj, Sj = np.cos(np.outer(kk, th)), np.sin(np.outer(kk, th)), np.cos(np.outer(jj, th)), np.sin(np.outer(jj, th))
norm = np.where(jj == 0, 1.0, 2.0)[:, None] / Nw
# the ripple, at the quadrature points and Nw places along the wire (it is steady: computed once)
qu = np.array([Z[f"x{k}"][:n2] for k in kk]) * ripple; qv = np.array([Z[f"x{k}"][n2:2 * n2] for k in kk]) * ripple
qb = np.array([Z[f"x{k}"][2 * n2:3 * n2] if k else np.zeros(n2) for k in kk]) * ripple; kb = (kk * beta0)[:, None]
ph = lambda F, trig, op=Iv: (op @ F.T) @ trig
Qu, Qux, Qur, Quw = ph(qu, Ck), ph(qu, Ck, Ix), ph(qu, Ck, Ir), -ph(qu * kb, Sk)
Qv, Qvx, Qvr, Qvw = ph(qv, Ck), ph(qv, Ck, Ix), ph(qv, Ck, Ir), -ph(qv * kb, Sk)
Qb, Qbx, Qbr, Qbw = -ph(qb, Sk), -ph(qb, Sk, Ix), -ph(qb, Sk, Ir), -ph(qb * kb, Ck)
Qvor = Qv / rq[:, None]

wall, ax = np.union1d(W.d_sph, W.d_far), W.d_axis; N = 4 * n2 + n1
B = sp.block_diag([W.M] * 4 + [sp.csc_matrix((n1, n1))], format='csc')
def system(j):
    fixed = [np.union1d(wall, ax), n2 + wall, 2 * n2 + wall, 3 * n2 + (np.arange(n2) if j == 0 else np.union1d(wall, ax))]
    free = np.setdiff1d(np.arange(N), np.concatenate(fixed)); L = W.operator(U0, V0, Re, 1, j * beta0)
    return dict(free=free, B=B[free][:, free].tocsr(), lu=spl.splu((1.5 / dt * B + L)[free][:, free].tocsc()))
S = [system(j) for j in jj]; jb = (jj * beta0)[:, None]

def coupling(x):
    u = np.array([x[j][:n2] for j in jj]); v = np.array([x[j][n2:2 * n2] for j in jj]); a = np.array([x[j][2 * n2:3 * n2] for j in jj]); b = np.array([x[j][3 * n2:4 * n2] for j in jj])
    uu, ux, ur, uw = ph(u, Cj), ph(u, Cj, Ix), ph(u, Cj, Ir), -ph(u * jb, Sj)
    vv, vx, vr, vw = ph(v, Cj), ph(v, Cj, Ix), ph(v, Cj, Ir), -ph(v * jb, Sj)
    aa, axx, ar, aw = ph(a, Cj), ph(a, Cj, Ix), ph(a, Cj, Ir), -ph(a * jb, Sj)
    bb, bx, br, bw = -ph(b, Sj), -ph(b, Sj, Ix), -ph(b, Sj, Ir), -ph(b * jb, Cj)
    Nu_ = Qu * ux + Qv * ur + Qb * uw + uu * Qux + vv * Qur + bb * Quw
    Nv_ = Qu * vx + Qv * vr + Qb * vw + uu * Qvx + vv * Qvr + bb * Qvw
    Na_ = Qu * axx + Qv * ar + Qb * aw + Qvor * aa
    Nb_ = Qu * bx + Qv * br + Qb * bw + uu * Qbx + vv * Qbr + bb * Qbw
    Fu, Fv, Fa, Fb = Pld @ (Nu_ @ (Cj * norm).T), Pld @ (Nv_ @ (Cj * norm).T), Pld @ (Na_ @ (Cj * norm).T), Pld @ (-(Nb_ @ (Sj * norm).T))
    return [-np.concatenate([Fu[:, j], Fv[:, j], Fa[:, j], Fb[:, j], np.zeros(n1)]) for j in jj]

X, Rr = b2.doflocs; rng = np.random.default_rng(1); x = [np.zeros(N) for _ in jj]
for j in jj:
    for c in (1, 2):
        s = np.exp(-((X - 1.5) ** 2 + (Rr - 0.4) ** 2) / 0.3) * rng.standard_normal(); s[wall] = 0; x[j][c * n2:(c + 1) * n2] = s
xm = [y.copy() for y in x]; Nm = None; t0 = time.time(); steps = int(round(T / dt)); logscale = 0.0
probe = np.argmin((X - 2.0) ** 2 + (Rr - 0.5) ** 2) + n2; sig = []; every = max(1, int(round(0.4 / dt)))
for n in range(steps + 1):
    if n % every == 0: sig.append((n * dt, logscale, sum(x[j][probe] for j in jj), x[0][probe]))
    if n % int(20 / dt) == 0:
        nrm = np.sqrt(sum(float(y[:4 * n2] @ (B[:4 * n2][:, :4 * n2] @ y[:4 * n2])) for y in x)); print(f"t {n * dt:6.1f}  log|q| {logscale + np.log(nrm):+.4f}  {time.time() - t0:.0f}s", flush=True)
        x = [y / nrm for y in x]; xm = [y / nrm for y in xm]; Nm = None if Nm is None else [y / nrm for y in Nm]; logscale += np.log(nrm)
    Nn = coupling(x) if ripple else [np.zeros(N) for _ in jj]; Ne = Nn if Nm is None else [2 * p - q for p, q in zip(Nn, Nm)]; new = []
    for j in jj:
        s = S[j]; f = s['free']; y = np.zeros(N); y[f] = s['lu'].solve(s['B'] @ ((4 * x[j][f] - xm[j][f]) / (2 * dt)) + Ne[j][f]); new.append(y)
    xm, x, Nm = x, new, Nn
# growth rate and frequency from the last 40% of the probe signal: y[n+1] = p y[n] - q y[n-1]
sig = np.array(sig); m = int(0.6 * len(sig)); tt = sig[m:, 0]; y = sig[m:, 2] * np.exp(sig[m:, 1] - sig[m, 1]); D = tt[1] - tt[0]
p, q = np.linalg.lstsq(np.vstack([y[1:-1], -y[:-2]]).T, y[2:], rcond=None)[0]; r = np.roots([1, -p, q]); lam = np.log(r.astype(complex)) / D; lam = lam[np.argmax(lam.real)]
out = dict(tag=tag, Re=Re, ripple=ripple, growth=float(lam.real), freq=float(abs(lam.imag)), T=T, dt=dt, J=J)
print("RESULT", json.dumps(out)); json.dump(out, open(f"data/sec-{tag}{'' if ripple else '-off'}.json", "w"))
