"""The wire in a tube: the symmetric family in the true geometry, time-stepped on a 3D mesh.

Coordinates (x, rho, w): x along the flow, w along the wire, rho = sqrt(y^2 + z^2) the distance from the (x, w)
plane. Rotations in (y, z) leave the wire, the tube wall and the stream alone, so the 4D flow that keeps that
symmetry is a 3D problem with weight rho (no swirl). The half w >= 0 is kept (mirror at w = 0).

  geom = tube: wall rho^2 + w^2 = R^2 no-slip, inflow 1 - (rho^2 + w^2)/R^2, the wire meets the wall.
  geom = ribbon: the tube again, the body a cylinder whose axis lies along rho: a ribbon spanning a disc of the pipe
          (README section 13). The mirror plane w = 0 is then the ribbon's own plane, so no vortex street can form.
  geom = slab: mirror planes at w = 0 and pi R / 2, slip lid at rho = H, stream (1 + cos(2 w / R))/2 held by a
               body force: section 8's problem (shear4.py), for checking this solver against that one.

Taylor-Hood P2/P1 on tetrahedra, BDF2, convection extrapolated, incremental pressure correction in rotational form
(Guermond, Minev and Shen 2006, the form that keeps only the unprojected velocity). Velocity solves by conjugate
gradients, the pressure Poisson matrix factorised once.

python tube4.py Re R [T=100] [dt=0.01] [geom=tube] [h0=0.06] [tag]     (WIRE=0: no wire, the pipe check)
Writes data/tube-<tag>.npz/.json (the mesh is saved with the state; heat4.py reads both). Needs gmsh, whose wheel
wants the system library libGLU (apt-get install libglu1-mesa). About 2.5 GB and 0.7 s a step at 62 000 tetrahedra.
"""
import sys, os, time, json
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spl
from skfem import Basis, ElementTetP2, ElementTetP1, BilinearForm, LinearForm
import tmesh

Re = float(sys.argv[1]); R = float(sys.argv[2]); T = float(sys.argv[3]) if len(sys.argv) > 3 else 100.0
dt = float(sys.argv[4]) if len(sys.argv) > 4 else 0.01; geom = sys.argv[5] if len(sys.argv) > 5 else "tube"
h0 = float(sys.argv[6]) if len(sys.argv) > 6 else 0.06
tag = sys.argv[7] if len(sys.argv) > 7 else ("" if geom == "tube" else geom + "-") + f"{Re:.0f}-R{R:g}"
WIRE = os.environ.get("WIRE", "1") != "0"; H = 8.0; Lu, Ld = 8.0, 20.0
RIB = geom == "ribbon"; TUBE = geom in ("tube", "ribbon")
nu = 1.0 / Re; beta0 = 2.0 / R; wmax = R if TUBE else np.pi * R / 2
t0 = time.time()
m = tmesh.build(geom, R=R, Lu=Lu, Ld=Ld, h0=h0, H=H, wire=WIRE, hw=2.5 * h0)
b2 = Basis(m, ElementTetP2(), intorder=5); b1 = Basis(m, ElementTetP1(), intorder=5)
n2, n1 = b2.N, b1.N
print(f"{geom} Re {Re:g} R {R:g}: {m.t.shape[1]} tets, {n2} velocity nodes, {n1} pressure nodes, mesh {time.time()-t0:.0f}s", flush=True)

# ---- boundaries, by facet midpoint
bf = m.boundary_facets(); mid = m.p[:, m.facets[:, bf]].mean(axis=1); e = 1e-6
is_in = mid[0] < -Lu + e; is_out = mid[0] > Ld - e
is_ax = mid[1] < e; is_w0 = mid[2] < e
is_wire = (np.hypot(mid[0], mid[2 if RIB else 1]) < 0.5 + 1e-3) & ~is_ax & ~is_w0
if TUBE:
    is_wall = (np.hypot(mid[1], mid[2]) > R - 0.05 * R) & ~is_in & ~is_out & ~is_ax & ~is_w0 & ~is_wire
    is_lid = np.zeros_like(is_wall); is_w1 = np.zeros_like(is_wall)
else:
    is_wall = np.zeros_like(is_in); is_lid = mid[1] > H - e; is_w1 = mid[2] > wmax - e
left = ~(is_in | is_out | is_ax | is_w0 | is_wire | is_wall | is_lid | is_w1)
assert not left.any(), f"{left.sum()} boundary facets unclassified"
d2 = lambda s: b2.get_dofs(bf[s]).all() if s.any() else np.zeros(0, dtype=np.int64)
D = {k: d2(s) for k, s in dict(inl=is_in, out=is_out, ax=is_ax, w0=is_w0, wire=is_wire, wall=is_wall, lid=is_lid, w1=is_w1).items()}
X = b2.doflocs
stream = (lambda x: 1 - (x[1] ** 2 + x[2] ** 2) / R ** 2) if TUBE else (lambda x: (1 + np.cos(beta0 * x[2])) / 2)
UNI = geom == "slab" and os.environ.get("UNIFORM") == "1"      # a uniform stream between the mirror planes: the sphere problem, for checking heat4.py
if UNI: stream = lambda x: 1.0 + 0 * x[0]
solid = np.union1d(D["wire"], D["wall"])
fix = [np.union1d(solid, D["inl"]),                                   # u_x
       np.unique(np.concatenate([solid, D["inl"], D["ax"], D["lid"]])),  # u_rho
       np.unique(np.concatenate([solid, D["inl"], D["w0"], D["w1"]]))]   # u_w
gval = np.zeros((3, n2)); gval[0, D["inl"]] = stream(X[:, D["inl"]]); gval[0, solid] = 0.0
pfix = b1.get_dofs(bf[is_out]).all()

# ---- matrices (weight rho)
rho = lambda w: w.x[1]
M = BilinearForm(lambda u, v, w: u * v * rho(w)).assemble(b2)
K = BilinearForm(lambda u, v, w: (u.grad[0] * v.grad[0] + u.grad[1] * v.grad[1] + u.grad[2] * v.grad[2]) * rho(w)).assemble(b2)
Mr2 = BilinearForm(lambda u, v, w: u * v / rho(w)).assemble(Basis(m, ElementTetP2(), intorder=4))   # order 4: no points on rho = 0
G = [BilinearForm(lambda p, v, w: -p * v.grad[0] * rho(w)).assemble(b1, b2),
     BilinearForm(lambda p, v, w: -p * (v.grad[1] * rho(w) + v)).assemble(b1, b2),
     BilinearForm(lambda p, v, w: -p * v.grad[2] * rho(w)).assemble(b1, b2)]
GT = [g.T.tocsr() for g in G]
L1 = BilinearForm(lambda u, v, w: (u.grad[0] * v.grad[0] + u.grad[1] * v.grad[1] + u.grad[2] * v.grad[2]) * rho(w)).assemble(b1)
M1 = BilinearForm(lambda u, v, w: u * v * rho(w)).assemble(b1)
pfree = np.setdiff1d(np.arange(n1), pfix)
Llu = spl.splu(L1[pfree][:, pfree].tocsc()); M1lu = spl.splu(M1.tocsc())
Fbody = np.zeros(n2)
if geom == "slab" and not UNI:
    Fbody = LinearForm(lambda v, w: nu * beta0 ** 2 * np.cos(beta0 * w.x[2]) / 2 * v * rho(w)).assemble(b2)

# ---- convection through quadrature-point matrices:  N_c = Phi^T W ((Phi u)(Dx c) + (Phi v)(Dy c) + (Phi w)(Dz c))
def qp_matrices():
    bq = b2
    nt = m.t.shape[1]; nq = bq.dx.shape[1]; nb = bq.Nbfun
    indptr = np.arange(0, nt * nq * nb + 1, nb, dtype=np.int32)
    indices = np.repeat(bq.element_dofs.T.astype(np.int32)[:, None, :], nq, axis=1).ravel()
    out = []
    for k in range(4):
        v = np.empty((nt, nq, nb))
        for i in range(nb):
            f = bq.basis[i][0]; v[:, :, i] = np.broadcast_to(f.value if k == 0 else f.grad[k - 1], (nt, nq))
        out.append(sp.csr_matrix((v.ravel(), indices, indptr), shape=(nt * nq, n2)))
    Wq = (bq.dx * bq.global_coordinates().value[1]).ravel()
    return out, Wq
(Phi, Dx, Dy, Dz), Wq = qp_matrices(); PhiT = Phi.T.tocsr()
def conv(u):
    q = [Phi @ u[c] for c in range(3)]
    return [PhiT @ (Wq * (q[0] * (Dx @ u[c]) + q[1] * (Dy @ u[c]) + q[2] * (Dz @ u[c]))) for c in range(3)]

# ---- velocity systems
a0 = 1.5 / dt
A = [(a0 * M + nu * K).tocsr(), (a0 * M + nu * (K + Mr2)).tocsr(), None]; A[2] = A[0]
free = [np.setdiff1d(np.arange(n2), f) for f in fix]
Aff = [A[c][free[c]][:, free[c]].tocsr() for c in range(3)]
lift = [-(A[c][free[c]] @ gval[c]) for c in range(3)]
Pre = [sp.diags(1.0 / a.diagonal()) for a in Aff]

# ---- probes for the bubble along the wire
ws = np.linspace(0, wmax, 41)[:-1] if TUBE else np.linspace(0, wmax, 41)
xs = np.arange(0.52, 6.0, 0.02)
def probe_matrix():
    if not WIRE: return None
    P = np.array([[x, max(w, 1e-6), 1e-6] if RIB else [x, 1e-6, min(w, wmax - 1e-6) + (1e-6 if w == 0 else 0)] for w in ws for x in xs]).T   # ribbon: stations along rho
    try:
        return b2.probes(P)
    except Exception as ex:
        print("probes failed:", ex); return None
ws = ws[ws < wmax - 0.3] if TUBE else ws
PM = probe_matrix()
def bubble(ux):
    if PM is None: return []
    v = (PM @ ux).reshape(len(ws), len(xs)); out = []
    for row in v:
        neg = row < 0
        if not neg[0]: out.append(0.0); continue
        i = np.argmax(~neg)
        if i == 0: out.append(float(xs[-1])); continue
        out.append(float(xs[i - 1] + (xs[i] - xs[i - 1]) * row[i - 1] / (row[i - 1] - row[i]) - 0.5))
    return out

# ---- initial state: the stream, zero on the solids
u = np.zeros((3, n2)); u[0] = stream(X)
for c in range(3): u[c, fix[c]] = gval[c, fix[c]]
um = u.copy(); p = np.zeros(n1); phi = np.zeros(n1); phim = np.zeros(n1)
if TUBE:                                  # the pipe's own pressure, -6 nu x / R^2 from the outlet
    p = -6 * nu / R ** 2 * (b1.doflocs[0] - Ld)
hist = []; nsteps = int(round(T / dt)); every = max(1, int(round(1.0 / dt)))
os.makedirs("data", exist_ok=True)
def save():
    np.savez_compressed(f"data/tube-{tag}.npz", u=u, um=um, p=p, phi=phi, phim=phim, P=m.p, t=m.t)
    json.dump(dict(Re=Re, R=R, geom=geom, dt=dt, h0=h0, ntets=int(m.t.shape[1]), n2=int(n2), ws=list(map(float, ws)),
                   bub=hist[-1]["bub"] if hist else [], hist=hist), open(f"data/tube-{tag}.json", "w"))
print(f"setup {time.time()-t0:.0f}s", flush=True)
its = 0
for n in range(nsteps + 1):
    if n % every == 0:
        div = M1lu.solve(-(GT[0] @ u[0] + GT[1] @ u[1] + GT[2] @ u[2]))
        rate = float(np.sqrt(sum((u[c] - um[c]) @ (M @ (u[c] - um[c])) for c in range(3))) / dt) if n else 0.0
        b = bubble(u[0])
        hist.append(dict(t=n * dt, rate=rate, div=float(np.sqrt(div @ (M1 @ div))), bub=b))
        print(f"t {n*dt:7.2f} rate {rate:.3e} div {hist[-1]['div']:.2e} cg {its}  bubble " +
              " ".join(f"{x:.3f}" for x in b[::8]) + f"  {time.time()-t0:.0f}s", flush=True)
        if not np.isfinite(rate) or rate > 1e3: print("blew up"); break
        if n % (20 * every) == 0 and n: save()
    if n == nsteps: break
    ue = 2 * u - um if n else u
    N = conv(ue); ps = p + (4 * phi - phim) / 3
    un = np.zeros_like(u); its = 0
    for c in range(3):
        rhs = M @ ((4 * u[c] - um[c]) / (2 * dt)) - N[c] - G[c] @ ps + (Fbody if c == 0 else 0)
        f = free[c]; cnt = [0]
        x, info = spl.cg(Aff[c], rhs[f] + lift[c], x0=ue[c][f], M=Pre[c], rtol=1e-9, atol=0, maxiter=400,
                         callback=lambda _: cnt.__setitem__(0, cnt[0] + 1))
        its += cnt[0]
        un[c] = gval[c]; un[c][f] = x
    r = a0 * (GT[0] @ un[0] + GT[1] @ un[1] + GT[2] @ un[2])
    phin = np.zeros(n1); phin[pfree] = Llu.solve(r[pfree])
    div = M1lu.solve(-(GT[0] @ un[0] + GT[1] @ un[1] + GT[2] @ un[2]))
    p = p + phin - nu * div
    phim, phi = phi, phin; um, u = u, un
save(); print(f"done {time.time()-t0:.0f}s")
