# The ionic model's reference: linear Al3+ O2- Al3+, the oxide held by a Watson shell (point charges on a sphere of
# radius RW, +2 in all), by PySCF: Hartree-Fock and MP2 (counterpoise: every energy in the whole cluster's basis), and the
# frozen clouds (Heitler-London: each ion's occupied orbitals joined and orthogonalized, no relaxation), which is what
# Gordon and Kim's electron gas (tools/salt.mjs) stands in for. Per Al-O pair, everything but the point charges' -6/r
# (the cations' own meeting taken out). The field on the oxide cancels by symmetry, so there's no dipole induction;
# relaxation (HF minus frozen) is charge transfer, the quadrupole's induction and the clouds' squeezing.
#   python3 four/atom/tools/ionref.py [RW] [r ...]    → $TMPDIR/atom4-ionic/ionref-<RW>.json  (pip install pyscf)
import sys, os, json, numpy as np
from pyscf import gto, scf, qmmm, mp
RW = float(sys.argv[1]) if len(sys.argv) > 1 else 2.04
RS = [float(x) for x in sys.argv[2:]] or [3.0, 3.2, 3.4, 3.6, 3.8, 4.2]
NP = 302
i = np.arange(NP) + 0.5; th = np.arccos(1 - 2 * i / NP); ph = np.pi * (1 + 5 ** 0.5) * i
shell = RW * np.stack([np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph), np.cos(th)], 1); qs = np.full(NP, 2.0 / NP)
B = {"O": gto.basis.load("aug-cc-pvtz", "O"), "Al": gto.basis.load("cc-pcvtz", "Al")}; B["GHOST-O"] = B["O"]; B["GHOST-Al"] = B["Al"]
def mf_of(atoms, charge):
    mol = gto.M(atom=atoms, basis=B, charge=charge, unit="Bohr", verbose=0)
    mf = qmmm.mm_charge(scf.RHF(mol), shell, qs, unit="Bohr"); mf.conv_tol = 1e-10; mf.max_cycle = 200; return mf
def solve(mf):
    e = mf.kernel()
    if not mf.converged: mf = mf.newton(); e = mf.kernel()
    m = mp.MP2(mf); m.frozen = sum(1 for a in mf.mol._atom if not a[0].upper().startswith("GHOST")); m.kernel()  # each real ion's 1s
    return {"hf": e, "mp2": e + m.e_corr, "conv": bool(mf.converged), "mf": mf}
def frozen(parts, whole):  # Heitler-London on already-solved monomers
    C = np.hstack([p["mf"].mo_coeff[:, p["mf"].mo_occ > 0] for p in parts]); S = whole.get_ovlp()
    dm = 2 * C @ np.linalg.inv(C.T @ S @ C) @ C.T; return whole.energy_tot(dm=dm) - sum(p["hf"] for p in parts)
out = []
for r in RS:
    A1, A2 = f"0 0 {-r}", f"0 0 {r}"
    tri = solve(mf_of(f"O 0 0 0; Al {A1}; Al {A2}", 4)); O = solve(mf_of(f"O 0 0 0; GHOST-Al {A1}; GHOST-Al {A2}", -2))
    a1 = solve(mf_of(f"GHOST-O 0 0 0; Al {A1}; GHOST-Al {A2}", 3)); a2 = solve(mf_of(f"GHOST-O 0 0 0; GHOST-Al {A1}; Al {A2}", 3))
    aa = solve(mf_of(f"GHOST-O 0 0 0; Al {A1}; Al {A2}", 6)); aaw = mf_of(f"GHOST-O 0 0 0; Al {A1}; Al {A2}", 6); triw = mf_of(f"O 0 0 0; Al {A1}; Al {A2}", 4)
    res = {"r": r, "conv": all(x["conv"] for x in (tri, O, a1, a2, aa))}
    for k in ("hf", "mp2"): res[k] = ((tri[k] - O[k] - a1[k] - a2[k]) - (aa[k] - a1[k] - a2[k]) + 12 / r) / 2
    res["frozen"] = (frozen([O, a1, a2], triw) - frozen([a1, a2], aaw) + 12 / r) / 2
    out.append(res); print(json.dumps(res), flush=True)
d = os.path.join(os.environ.get("TMPDIR", "/tmp"), "atom4-ionic"); os.makedirs(d, exist_ok=True)
json.dump({"RW": RW, "pts": out}, open(os.path.join(d, f"ionref-{RW}.json"), "w"))
