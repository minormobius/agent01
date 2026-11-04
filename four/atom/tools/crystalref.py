# Periodic DFT (PySCF, PBE, GTH pseudopotentials, DZVP) on a known compound's candidate structures: the independent
# ranking the ionic model (tools/ionic.mjs) must reproduce. Each cell is reduced to its primitive one and scaled
# isotropically (internal coordinates held), so a structure at the model's geometry isn't penalized for the model's
# volume. Usage (via tools/crystalref.mjs on the runner):
#   python3 crystalref.py <structures.json> <name> <scale> <out.json> [xc] [pseudo]   (default pbe, gth-pbe)
import sys, json, time, numpy as np
from pyscf.pbc import gto, dft
src, name, scale, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
xc = sys.argv[5] if len(sys.argv) > 5 else "pbe"; pp = sys.argv[6] if len(sys.argv) > 6 else "gth-pbe"
st = json.load(open(src))[name]; H = np.array(st["H"]); P = np.array(st["P"]); Hp = P @ H
X = np.array(st["s"]) @ H; F = X @ np.linalg.inv(Hp); F -= np.floor(F + 1e-9); keep = []
for f, k in zip(F, st["kinds"]):
    if not any(kk == k and np.allclose(((f - g + 0.5) % 1) - 0.5, 0, atol=1e-4) for g, kk in keep): keep.append((f, k))
nf = len(keep) / 5; Hs = Hp * scale
cell = gto.Cell(); cell.a = Hs; cell.unit = "Bohr"; cell.atom = [["Al" if k == 0 else "O", list(f @ Hs)] for f, k in keep]
cell.basis = "gth-dzvp-molopt-sr"; cell.pseudo = pp; cell.verbose = 0; cell.build()
kmesh = [max(1, int(np.ceil(18 / np.linalg.norm(h)))) for h in Hs]
t0 = time.time(); mf = dft.KRKS(cell, cell.make_kpts(kmesh)).density_fit(); mf.xc = xc; mf.conv_tol = 1e-8; e = mf.kernel()
# the band gap on the SCF's own k-mesh (Γ-centred, so it includes Γ): valence top and conduction bottom over every k
nocc = cell.nelectron // 2; mo = [np.asarray(m) for m in mf.mo_energy]
homo = max(m[nocc - 1] for m in mo); lumo = min(m[nocc] for m in mo); g0 = mo[0][nocc] - mo[0][nocc - 1]
res = {"name": name, "scale": scale, "xc": xc, "pseudo": pp, "atoms": len(keep), "nf": nf, "kmesh": kmesh, "E": e, "perFormula_eV": e / nf * 27.211386, "converged": bool(mf.converged), "gap_eV": (lumo - homo) * 27.211386, "gapGamma_eV": g0 * 27.211386,
       "volume_per_formula_bohr3": abs(np.linalg.det(Hs)) / nf, "seconds": time.time() - t0}
json.dump(res, open(out, "w")); print(json.dumps(res), flush=True)
