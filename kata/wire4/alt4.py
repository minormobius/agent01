"""The headline again, on a different discretisation (README section 3; the paper's section 10).

wake4.py: Taylor-Hood P2/P1 on a structured O-mesh, outer boundary a curve 12 to 25 diameters out.
Here: P3/P2 (or the MINI element, P1 + bubble / P1) on an unstructured gmsh mesh of a rectangle, x from -Lu to Ld,
r to H, with the inflow and the side held and the outflow free. Same equations (the operators are wake4.py's
methods, which do not care what the basis is); different elements, mesh topology, domain shape and size.
    python alt4.py [elem=P3|MINI] [h0=0.05] [Lu=25] [Ld=50] [H=25] [Re,Re,...] [beta=2.5]
prints, at each Re, C_D, the bubble, and the growth of the fastest m = 0 mode at beta; with Re 212 in the list also
the sphere's own m = 1, beta = 0 mode there. Appends to data/alt.json.
"""
import sys, json, os, time
import numpy as np
from skfem import MeshTri, Basis, ElementTriP3, ElementTriP2, ElementTriP1, ElementTriMini, BilinearForm
from wake4 import Wake

def rect_mesh(Lu, Ld, H, h0):
    import gmsh
    gmsh.initialize(); gmsh.option.setNumber("General.Terminal", 0); occ = gmsh.model.occ
    occ.cut([(2, occ.addRectangle(-Lu, 0, 0, Lu + Ld, H))], [(2, occ.addDisk(0, 0, 0, 0.5, 0.5))]); occ.synchronize()
    f = gmsh.model.mesh.field; i = f.add("MathEval")
    f.setString(i, "F", f"Min({max(1.0, H / 14)}, Min({h0} + 0.16*Fabs(Sqrt(x*x+y*y)-0.5), {2.2 * h0} + 0.25*Max(0,y-1.2) + 0.05*Max(0,x-5.0) + 0.6*Max(0,-x-0.5)))"); f.setAsBackgroundMesh(i)
    for k in ("MeshSizeExtendFromBoundary", "MeshSizeFromPoints", "MeshSizeFromCurvature"): gmsh.option.setNumber("Mesh." + k, 0)
    gmsh.model.mesh.generate(2); tags, xyz, _ = gmsh.model.mesh.getNodes(); et, _, en = gmsh.model.mesh.getElements(2); gmsh.finalize()
    idx = np.zeros(int(tags.max()) + 1, dtype=np.int64); idx[tags.astype(np.int64)] = np.arange(len(tags))
    return MeshTri(np.ascontiguousarray(xyz.reshape(-1, 3).T[:2]), np.ascontiguousarray(idx[en[0].astype(np.int64)].reshape(-1, 3).T))

class Alt(Wake):
    def __init__(self, elem="P3", h0=0.05, Lu=25.0, Ld=50.0, H=25.0):
        self.m = m = rect_mesh(Lu, Ld, H, h0); ev, ep = (ElementTriP3(), ElementTriP2()) if elem == "P3" else (ElementTriMini(), ElementTriP1())
        self.b2 = Basis(m, ev, intorder=8); self.b1 = Basis(m, ep, intorder=8); self.n2, self.n1 = self.b2.N, self.b1.N
        bf = m.boundary_facets(); mid = m.p[:, m.facets[:, bf]].mean(axis=1); e = 1e-6; d = lambda s: self.b2.get_dofs(bf[s]).all()
        body = np.hypot(mid[0], mid[1]) < 0.5 + 1e-3; axis = (mid[1] < e) & ~body; out = mid[0] > Ld - e; far = (mid[0] < -Lu + e) | (mid[1] > H - e)
        assert not (~(body | axis | out | far)).any()
        self.d_axis, self.d_sph, self.d_far = d(axis), d(body), d(far & ~out)
        r = lambda w: w.x[1]
        self.M = BilinearForm(lambda u, v, w: u * v * r(w)).assemble(self.b2)
        self.K = BilinearForm(lambda u, v, w: (u.grad[0] * v.grad[0] + u.grad[1] * v.grad[1]) * r(w)).assemble(self.b2)
        self.M_r2 = BilinearForm(lambda u, v, w: u * v / r(w)).assemble(self.b2)
        self.Gx = BilinearForm(lambda p, v, w: -p * v.grad[0] * r(w)).assemble(self.b1, self.b2)
        self.Gr = BilinearForm(lambda p, v, w: -p * (v.grad[1] * r(w) + v)).assemble(self.b1, self.b2)
        self.G0 = BilinearForm(lambda p, v, w: p * v).assemble(self.b1, self.b2); self.Gm = BilinearForm(lambda p, v, w: p * v * r(w)).assemble(self.b1, self.b2)
    def bubble(self, U):                       # the axis by probing: an unstructured mesh's axis nodes are not a P3 line
        x = np.arange(0.52, 4.0, 0.01); u = self.b2.probes(np.vstack([x, np.full_like(x, 1e-9)])) @ U; k = np.where(u < 0)[0]
        if not len(k): return 0.0
        i = k.max(); return float(x[i] + 0.01 * (-u[i]) / (u[i + 1] - u[i]) - 0.5)

if __name__ == "__main__":
    a = sys.argv[1:]; elem = a[0] if a else "P3"; h0 = float(a[1]) if len(a) > 1 else 0.05; Lu = float(a[2]) if len(a) > 2 else 25.0; Ld = float(a[3]) if len(a) > 3 else 50.0; H = float(a[4]) if len(a) > 4 else 25.0
    Res = [float(v) for v in a[5].split(",")] if len(a) > 5 else [188, 190, 192, 194, 200]; beta = float(a[6]) if len(a) > 6 else 2.5; t0 = time.time()
    W = Alt(elem, h0, Lu, Ld, H); print(f"{elem} h0 {h0} domain [-{Lu:g}, {Ld:g}] x [0, {H:g}]: {W.m.t.shape[1]} triangles, {W.n2} nodes a component, {W.n1} pressure  {time.time() - t0:.0f}s", flush=True)
    g = None; rows = []
    for Re in sorted(set([1, 10, 40, 100, 150] + Res)):
        g = W.base(Re, g)
        if Re not in Res: continue
        e = W.eig(g[0], g[1], Re, 0, beta, shift=0.03, k=3); e = e[np.argsort(-e.real)][0]; row = dict(elem=elem, h0=h0, Lu=Lu, Ld=Ld, H=H, n2=int(W.n2), Re=Re, beta=beta, cd=float(W.drag(*g, Re)), bubble=W.bubble(g[0]), growth=float(e.real), imag=float(e.imag))
        if Re == 212: e1 = W.eig(g[0], g[1], Re, 1, 0.0, shift=0.05, k=4); row["m1_beta0"] = float(e1[np.argsort(-e1.real)][0].real)
        rows.append(row); print(f"Re {Re:g}  C_D {row['cd']:.4f}  bubble {row['bubble']:.3f}  m=0 beta={beta:g}: {e.real:+.5f} {e.imag:+.1e}i" + (f"   m=1 beta=0: {row['m1_beta0']:+.5f}" if "m1_beta0" in row else "") + f"  {time.time() - t0:.0f}s", flush=True)
    os.makedirs("data", exist_ok=True); f = "data/alt.json"; J = json.load(open(f)) if os.path.exists(f) else []; json.dump(J + rows, open(f, "w"))
