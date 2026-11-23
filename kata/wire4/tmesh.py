"""Mesh for the wire in a tube (or in a slab with mirror planes): gmsh -> scikit-fem MeshTet.
Coordinates (x, rho, w): x along the flow, rho the distance from the (x, w) plane, w along the wire."""
import numpy as np, gmsh
from skfem import MeshTet

def build(geom="tube", R=5.0, Lu=8.0, Ld=20.0, h0=0.06, grow=0.25, hw=0.15, H1=0.6, H=8.0, wire=True, quiet=True):
    gmsh.initialize()
    if quiet: gmsh.option.setNumber("General.Terminal", 0)
    occ = gmsh.model.occ
    if geom == "tube":
        cyl = occ.addCylinder(-Lu, 0, 0, Lu + Ld, 0, 0, R)
        box = occ.addBox(-Lu, 0, 0, Lu + Ld, R, R)
        dom, _ = occ.intersect([(3, cyl)], [(3, box)])
    else:                                   # slab: rho in [0, H], w in [0, pi R / 2]
        dom = [(3, occ.addBox(-Lu, 0, 0, Lu + Ld, H, np.pi * R / 2))]
    if wire:
        wr = occ.addCylinder(0, 0, -1, 0, 0, 2 * R + 2, 0.5)
        dom, _ = occ.cut(dom, [(3, wr)])
    occ.synchronize()
    f = gmsh.model.mesh.field
    if wire:
        e = (f"Min({H1}, Min({h0} + {grow}*Fabs(Sqrt(x*x+y*y)-0.5), "
             f"{hw} + 0.3*Max(0,y-1.0) + 0.12*Max(0,x-4.0) + 0.6*Max(0,-x)))")
    else:
        e = f"{H1}"
    i = f.add("MathEval"); f.setString(i, "F", e); f.setAsBackgroundMesh(i)
    for k in ("MeshSizeExtendFromBoundary", "MeshSizeFromPoints", "MeshSizeFromCurvature"):
        gmsh.option.setNumber("Mesh." + k, 0)
    gmsh.option.setNumber("Mesh.Algorithm3D", 10)       # HXT
    gmsh.option.setNumber("General.NumThreads", 4)
    gmsh.model.mesh.generate(3)
    tags, xyz, _ = gmsh.model.mesh.getNodes()
    et, _, en = gmsh.model.mesh.getElements(3)
    gmsh.finalize()
    idx = np.zeros(int(tags.max()) + 1, dtype=np.int64); idx[tags.astype(np.int64)] = np.arange(len(tags))
    p = xyz.reshape(-1, 3).T
    t = idx[en[0].astype(np.int64)].reshape(-1, 4).T
    m = MeshTet(p, t)
    used = np.unique(t)
    if len(used) < p.shape[1]:
        m = m.remove_unused_nodes() if hasattr(m, "remove_unused_nodes") else m
    return m

if __name__ == "__main__":
    import sys, time
    t0 = time.time(); m = build(*(sys.argv[1:2] or ["tube"]))
    print(m, f"{time.time()-t0:.0f}s")
