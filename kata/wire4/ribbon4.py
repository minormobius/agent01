"""The ribbon as an instrument: a hot sheet spanning a disc of the 4D pipe (README section 13).

A ribbon is long in two directions (z, w) and round in the other two (x along the flow, y). In the pipe it spans the
disc s = sqrt(z^2 + w^2) <= R and meets the wall along a circle. At a station s it sits in the plane (x, y), where
the pipe's wall is at y = +-H(s), H = sqrt(R^2 - s^2), and the undisturbed stream is
    u = (1 - s^2/R^2) (1 - y^2/H^2):
plane Poiseuille flow of half-height H and centre speed 1 - s^2/R^2. So the strip picture for a ribbon is a cylinder
on the centreline of a plane channel with cold walls. Unlike the wire's sphere it cannot leave the wall out: a
cylinder's conduction has no steady answer in an unbounded fluid, and the wall is what closes it.
  Chan: that 2D problem (gmsh mesh, steady, symmetric about y = 0), returning the local Nusselt number.
  balance: the sheet's energy balance, uniform Joule heating per area (an assumption: the current's path in a disc
  is not modelled), conduction in the sheet to the cold rim,
      Lam (1/s)(s theta')' + P (1 + theta) - pi Nu(s) theta = 0,   theta(R) = 0,   Lam = (k_ribbon/k_fluid) pi/4.
    python ribbon4.py strip R Re[,Re...]      local Nusselt numbers at stations -> data/ribbon-strip-R<R>.json
    python ribbon4.py cal R [Lam=3000] [overheat=0.5]     the calibration from that file
    python ribbon4.py check [Lam,...]         strip against the 3D tube runs (data/heat-ribbon-*.json), R = 5
Re is on the ribbon's thickness and the pipe's centreline speed.
"""
import sys, json, os
import numpy as np
from scipy.linalg import solve_banded
from scipy.optimize import brentq
from scipy.special import jn_zeros, j0, j1

def chan_mesh(H, Lu, Ld, h0=0.035):
    import gmsh
    from skfem import MeshTri
    gmsh.initialize(); gmsh.option.setNumber("General.Terminal", 0); occ = gmsh.model.occ
    dom, _ = occ.cut([(2, occ.addRectangle(-Lu, 0, 0, Lu + Ld, H))], [(2, occ.addDisk(0, 0, 0, 0.5, 0.5))]); occ.synchronize()
    f = gmsh.model.mesh.field; i = f.add("MathEval")
    f.setString(i, "F", f"Min({max(0.6, H / 10)}, Min({h0} + 0.14*Fabs(Sqrt(x*x+y*y)-0.5), 0.12 + 0.25*Max(0,y-1.0) + 0.06*Max(0,x-4.0) + 0.5*Max(0,-x)), 0.08 + 0.2*Fabs({H}-y) + 0.02*Fabs(x))"); f.setAsBackgroundMesh(i)
    for k in ("MeshSizeExtendFromBoundary", "MeshSizeFromPoints", "MeshSizeFromCurvature"): gmsh.option.setNumber("Mesh." + k, 0)
    gmsh.model.mesh.generate(2); tags, xyz, _ = gmsh.model.mesh.getNodes(); et, _, en = gmsh.model.mesh.getElements(2); gmsh.finalize()
    idx = np.zeros(int(tags.max()) + 1, dtype=np.int64); idx[tags.astype(np.int64)] = np.arange(len(tags))
    return MeshTri(np.ascontiguousarray(xyz.reshape(-1, 3).T[:2]), np.ascontiguousarray(idx[en[0].astype(np.int64)].reshape(-1, 3).T))

def chan(H, U0=1.0, wall=True):
    """A cylinder of diameter 1 on the centreline of a plane channel of half-height H; inflow U0 (1 - y^2/H^2).
    wall=False: a uniform stream with a slip lid at H (for comparing with cyl4.py's unbounded one)."""
    from skfem import Basis, ElementTriP2, ElementTriP1, BilinearForm
    from cyl4 import Cyl
    Lu = min(2 * H, 40) + 8; Ld = min(4 * H, 150) + 20; m = chan_mesh(H, Lu, Ld); C = Cyl.__new__(Cyl); C.m = m
    C.b2 = Basis(m, ElementTriP2(), intorder=6); C.b1 = Basis(m, ElementTriP1(), intorder=6); C.n2, C.n1 = C.b2.N, C.b1.N
    bf = m.boundary_facets(); mid = m.p[:, m.facets[:, bf]].mean(axis=1); e = 1e-6; d = lambda s: C.b2.get_dofs(bf[s]).all()
    body = np.hypot(mid[0], mid[1]) < 0.5 + 1e-3; inl = mid[0] < -Lu + e; top = mid[1] > H - e; out = mid[0] > Ld - e; axis = (mid[1] < e) & ~body
    assert not (~(body | inl | top | out | axis)).any()
    C.d_body = d(body); C.d_axis = d(axis)
    if wall: C.d_far = np.union1d(d(inl), d(top)); y = C.b2.doflocs[1, C.d_far]; C.uin = U0 * (1 - (y / H) ** 2)
    else: C.d_far = d(inl); C.uin = U0; C.d_axis = np.union1d(C.d_axis, d(top))          # slip lid: v = 0 there, like the axis
    C.K = BilinearForm(lambda u, v, w: u.grad[0] * v.grad[0] + u.grad[1] * v.grad[1]).assemble(C.b2)
    C.Gx = BilinearForm(lambda p, v, w: -p * v.grad[0]).assemble(C.b1, C.b2); C.Gy = BilinearForm(lambda p, v, w: -p * v.grad[1]).assemble(C.b1, C.b2)
    C.T0 = np.union1d(d(inl), d(top)) if wall else d(inl)                                 # where the fluid is held cold
    return C

def local_nu(H, U0, Re, Pr=0.7, guess=None):
    """Nusselt number (on the ribbon's own excess) of the station whose channel is H and centre speed U0."""
    import scipy.sparse.linalg as spl
    C = chan(H, U0); g = None
    for r in [x for x in (1.0, 5.0, 15.0) if x < Re] + [Re]: g = C.base(r, g)
    kap = 1.0 / (Re * Pr); A = (C.conv(g[0], g[1])[0] + kap * C.K).tocsr(); fix = np.union1d(C.d_body, C.T0); free = np.setdiff1d(np.arange(C.n2), fix)
    th = np.zeros(C.n2); th[C.d_body] = 1.0; th[free] = spl.spsolve(A[free][:, free].tocsc(), -(A[free][:, fix] @ th[fix]))
    return float((A[C.d_body] @ th).sum() / kap * 2 / np.pi), C.n2

def stations(R): return np.array([s for s in R * np.sqrt(1 - np.array([1.0, 0.97, 0.9, 0.8, 0.65, 0.5, 0.36, 0.25, 0.16, 0.09, 0.04, 0.0225, 0.01]) ** 2 if True else 0) if np.sqrt(R * R - s * s) >= 1.0]) if R > 12 else np.array([s for s in np.linspace(0, R, 11) if np.sqrt(R * R - s * s) >= 1.0])

def balance(R, Lam, s_tab, nu_tab, tau=0.5, N=2000):
    s = np.linspace(0, R, N + 1); ds = s[1] - s[0]; h = np.pi * np.interp(s, s_tab, nu_tab); n = N
    lo = np.zeros(n); up = np.zeros(n); di = np.zeros(n)
    up[0] = -4 * Lam / ds ** 2; di[0] = 4 * Lam / ds ** 2
    i = np.arange(1, n); lo[i] = -Lam * (s[i] - ds / 2) / (s[i] * ds ** 2); up[i] = -Lam * (s[i] + ds / 2) / (s[i] * ds ** 2); di[i] = -(lo[i] + up[i])
    wgt = 2 * s * ds / R ** 2; wgt[0] = ds * ds / 4 / R ** 2; wgt[-1] = s[-1] * ds / R ** 2
    def solve(P):
        ab = np.zeros((3, n)); ab[0, 1:] = up[:-1]; ab[1] = di + h[:n] - P; ab[2, :-1] = lo[1:]
        th = np.append(solve_banded((1, 1), ab, np.full(n, P)), 0.0); return th, float(wgt @ th)
    def ok(P):
        th, m = solve(P); return th.min() > -1e-9 and np.isfinite(m)
    a, b = 0.0, 1.0
    while ok(b) and solve(b)[1] < tau and b < 1e7: a, b = b, 2 * b
    for _ in range(60):
        c = 0.5 * (a + b)
        if ok(c) and solve(c)[1] < tau: a = c
        else: b = c
    th, _ = solve(a); stream = float(wgt @ (h * th)) / (a * (1 + tau))
    return dict(P=a, stream=stream, rim=1 - stream, axis=float(th[0]), peak=float(th.max()))

def galerkin(d, Lam, tau=0.5):
    """The same balance on a 3D tube run's heat matrix (heat4.py, geom=ribbon): theta = sum c_j J0(j_j s / R)."""
    H = np.array(d["H"]); J = len(H); R = d["R"]; z = jn_zeros(0, J); M = np.pi * R ** 2 * j1(z) ** 2; b = 2 * np.pi * R ** 2 * j1(z) / z
    K = Lam * np.diag((z / R) ** 2 * M) + H; st = np.array(d["stations"]); Q = np.array(d["Q"]); Qt = np.array([np.trapezoid(q * 2 * np.pi * st, st) for q in Q])
    def solve(P):
        c = np.linalg.solve(K - P * np.diag(M), P * b); return c, float(c @ b / (np.pi * R ** 2))
    Pmax = float(np.min(np.linalg.eigvals(np.linalg.solve(np.diag(M), K)).real)); P = brentq(lambda P: solve(P)[1] - tau, 1e-9, Pmax * (1 - 1e-9)); c, _ = solve(P)
    return dict(P=P, stream=float(c @ Qt) / (P * np.pi * R ** 2 * (1 + tau)), nu_axis=float(Q[0][0] / np.pi))

if __name__ == "__main__":
    a = sys.argv[1:]; mode = a[0] if a else "cal"
    if mode == "strip":
        R = float(a[1]); Res = [float(v) for v in a[2].split(",")]; f = f"data/ribbon-strip-R{R:g}.json"
        J = json.load(open(f)) if os.path.exists(f) else dict(R=R, Pr=0.7, rows={})
        for Re in Res:
            st = stations(R); nus = []
            for s in st:
                H = float(np.sqrt(R * R - s * s)); nu, n2 = local_nu(H, 1 - (s / R) ** 2, Re); nus.append(nu); print(f"R {R:g} Re {Re:g}  s {s:7.3f}  H {H:7.3f}  U0 {1 - (s / R) ** 2:.4f}  Nu {nu:.4f}  ({n2} nodes)", flush=True)
            J["rows"][f"{Re:g}"] = dict(s=st.tolist(), Nu=nus); json.dump(J, open(f, "w"))
    elif mode == "cal":
        R = float(a[1]); Lam = float(a[2]) if len(a) > 2 else 3000.0; tau = float(a[3]) if len(a) > 3 else 0.5; J = json.load(open(f"data/ribbon-strip-R{R:g}.json")); prev = None
        print(f"ribbon spanning a pipe of radius {R:g} thicknesses, Lam {Lam:g}, mean overheat {tau:g}\n  Re      P        n     to the stream   Nu on the axis")
        for k in sorted(J["rows"], key=float):
            r = J["rows"][k]; s = np.array(r["s"]); nu = np.array(r["Nu"]); o = np.argsort(s); s, nu = s[o], nu[o]
            s2 = np.append(s, R); nu2 = np.append(nu, nu[-1]); b = balance(R, Lam, s2, nu2, tau); Re = float(k); n = np.log(b["P"] / prev[1]) / np.log(Re / prev[0]) if prev else np.nan
            print(f"  {Re:5g}  {b['P']:8.4f}  {n:6.3f}     {b['stream']:.3f}         {nu[0]:.4f}"); prev = (Re, b["P"])
    elif mode == "check":
        Lams = [float(v) for v in a[1].split(",")] if len(a) > 1 else [30.0, 300.0, 3000.0]; J = json.load(open("data/ribbon-strip-R5.json"))
        print("strip (cylinder between the pipe's walls, station by station) against the 3D tube run, R = 5, overheat 0.5")
        for k in sorted(J["rows"], key=float):
            f = f"data/heat-ribbon-{float(k):.0f}-R5.json"
            if not os.path.exists(f): continue
            d = json.load(open(f)); r = J["rows"][k]; s = np.array(r["s"]); nu = np.array(r["Nu"]); st = np.array(d["stations"]); q3 = np.array(d["Q"])[0] / np.pi / j0(jn_zeros(0, 1)[0] * st / 5)
            print(f" Re {k}: Nu per local excess, 3D first shape / strip, at s = 0, 1, 2, 3, 4:  " + "  ".join(f"{np.interp(x, st, q3):.3f}/{np.interp(x, s, nu):.3f}" for x in (0, 1, 2, 3, 4)))
            for Lam in Lams:
                g = galerkin(d, Lam); b = balance(5.0, Lam, np.append(s, 5.0), np.append(nu, nu[-1]))
                print(f"   Lam {Lam:6g}   P strip {b['P']:9.4f} / 3D {g['P']:9.4f} = {b['P'] / g['P']:.4f}    to the stream {b['stream']:.3f} / {g['stream']:.3f}")
