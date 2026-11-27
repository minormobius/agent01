"""Heat leaving the wire, on a flow tube4.py has saved: forced convection, constant properties, so the temperature
is carried by the flow and does not change it. Steady advection-diffusion on the saved mesh, solved directly.

The wire is taken as isothermal across its section (a metal in a gas) but not along its length. Its temperature
excess is a sum of J shapes phi_j(w); one solve per shape gives the heat each shape loses, per length, at every
station, and the J x J matrix H_ij = int phi_i Q_j dw, which is all a wire energy balance needs (the current, the
wire's conductivity and its resistance law come in afterwards, with no more flow solves).
  tube: phi_j = cos((j + 1/2) pi w / R)   (zero at the wall, which is cold, like the inflow)
  slab: phi_j = cos(j pi w / wmax)        (j = 0 is the uniformly hot wire)
  ribbon (tube4.py geom=ribbon): phi_j = J0(j_j s / R), s the distance from the pipe's axis in the ribbon's sheet;
          Q is then heat per AREA of sheet (both faces), H_ij = int phi_i Q_j 2 pi s ds, and Nu = Q / pi as a cylinder's
Lengths in wire diameters, temperature in units of the excess, heat per length in units of k * excess:
Nu = Q / pi  (Nu = 2 is conduction alone to a fluid at rest).

python heat4.py tag [Pr=0.7] [J=4]   reads data/tube-<tag>.npz/.json, writes data/heat-<tag>.json
"""
import sys, json, time
import numpy as np
import scipy.sparse.linalg as spl
from scipy.special import jn_zeros, j0
from skfem import MeshTet, Basis, ElementTetP2, BilinearForm

tag = sys.argv[1]; Pr = float(sys.argv[2]) if len(sys.argv) > 2 else 0.7; J = int(sys.argv[3]) if len(sys.argv) > 3 else 4
d = np.load(f"data/tube-{tag}.npz"); meta = json.load(open(f"data/tube-{tag}.json"))
Re, R, geom = meta["Re"], meta["R"], meta["geom"]; kap = 1.0 / (Re * Pr)
RIB = geom == "ribbon"; TUBE = geom in ("tube", "ribbon")
wmax = R if TUBE else np.pi * R / 2
t0 = time.time()
m = MeshTet(d["P"], d["t"]); b2 = Basis(m, ElementTetP2(), intorder=5); n2 = b2.N; X = b2.doflocs
u = d["u"]
bf = m.boundary_facets(); mid = m.p[:, m.facets[:, bf]].mean(axis=1); e = 1e-6
is_in = mid[0] < m.p[0].min() + e; is_out = mid[0] > m.p[0].max() - e; is_ax = mid[1] < e; is_w0 = mid[2] < e
is_wire = (np.hypot(mid[0], mid[2 if RIB else 1]) < 0.5 + 1e-3) & ~is_ax & ~is_w0
is_wall = (np.hypot(mid[1], mid[2]) > 0.95 * R) & ~is_in & ~is_out & ~is_ax & ~is_w0 & ~is_wire if TUBE else np.zeros_like(is_in)
dof = lambda s: b2.get_dofs(bf[s]).all() if s.any() else np.zeros(0, dtype=np.int64)
dw, dfix0 = dof(is_wire), np.union1d(dof(is_in), dof(is_wall))
dfix0 = np.setdiff1d(dfix0, dw) if not TUBE else dfix0     # in the tube the junction is cold (phi = 0 there anyway)
fix = np.union1d(dw, dfix0); free = np.setdiff1d(np.arange(n2), fix)
rho = lambda w: w.x[1]
kw = dict(U=b2.interpolate(u[0]), V=b2.interpolate(u[1]), W=b2.interpolate(u[2]))
A = BilinearForm(lambda th, v, w: ((w["U"] * th.grad[0] + w["V"] * th.grad[1] + w["W"] * th.grad[2]) * v
                                   + kap * (th.grad[0] * v.grad[0] + th.grad[1] * v.grad[1] + th.grad[2] * v.grad[2])) * rho(w)).assemble(b2, **kw).tocsr()
lu = spl.splu(A[free][:, free].tocsc())
print(f"{tag}: Re {Re:g} Pr {Pr:g} {geom} R {R:g}, {n2} nodes, factorised {time.time()-t0:.0f}s", flush=True)
JZ = jn_zeros(0, max(J, 1))
shape = (lambda j, w: j0(JZ[j] * w / R)) if RIB else (lambda j, w: np.cos((j + 0.5) * np.pi * w / R)) if geom == "tube" else (lambda j, w: np.cos(j * np.pi * w / wmax))
ww = X[1 if RIB else 2, dw]            # the coordinate along the body
st = np.linspace(0, wmax, 41); hw = st[1] - st[0]
hat = np.clip(1 - np.abs(ww[None, :] - st[:, None]) / hw, 0, None)          # (stations, wire dofs)
width = np.full(len(st), hw); width[0] = width[-1] = hw / 2
if RIB:                                 # per area of sheet: the ring each station's hat covers, 2 pi int hat s ds, and both faces
    width = 2 * np.pi * st * hw; width[0] = np.pi * hw ** 2 / 3; width[-1] = 2 * np.pi * (R * hw / 2 - hw ** 2 / 6); width = width / 2
Q = np.zeros((J, len(st))); Hm = np.zeros((J, J)); th_all = []
for j in range(J):
    th = np.zeros(n2); th[dw] = shape(j, ww); th[dfix0] = 0.0 if TUBE else th[dfix0]
    th[free] = lu.solve(-(A[free][:, fix] @ th[fix]))
    r = (A[dw] @ th) / kap * 2 * np.pi          # heat leaving through each wire node's test function (all round the wire)
    Q[j] = hat @ r / width
    for i in range(J): Hm[i, j] = 2 * (shape(i, ww) @ r)       # both halves of the wire
    th_all.append(th)
    print(f"shape {j}: Nu at w = 0, wmax/4, wmax/2: " + " ".join(f"{Q[j][k]/np.pi:.3f}" for k in (0, 10, 20)) +
          f"   total heat (both halves) {2*r.sum():.3f}  min/max theta {th.min():.3f} {th.max():.3f}", flush=True)
json.dump(dict(tag=tag, Re=Re, Pr=Pr, R=R, geom=geom, J=J, stations=st.tolist(), Q=Q.tolist(), H=Hm.tolist()), open(f"data/heat-{tag}.json", "w"))
np.savez_compressed(f"data/heat-{tag}.npz", theta=np.array(th_all))
print(f"done {time.time()-t0:.0f}s")
