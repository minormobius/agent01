"""One pair of our molecules by an independent code in a standard basis, for tools/pairref.mjs (which installs PySCF and
runs this on the runner): counterpoise-corrected Hartree-Fock and frozen-core MP2 (density-fitted) of molecule A with B,
from a placement file written by tools/molpair.mjs (A and B as atom positions, bohr, heavy atom first).
    python3 -I pairref.py <placement.json> <out.json> <basis> <symbols, e.g. O,F,F>
Our world only: the standard bases exist only for ours."""
import json, sys, time
from pyscf import gto, scf
from pyscf.mp import dfmp2
src, out, basis, syms = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(",")
r = json.load(open(src)); A, B = r["A"], r["B"]
atoms = [(syms[i], x) for i, x in enumerate(A)] + [(syms[i], x) for i, x in enumerate(B)]
def run(real):
    lab = lambda i, s: (s + str(i)) if real[i] else ("ghost-" + s + str(i))
    spec = [[lab(i, s), x] for i, (s, x) in enumerate(atoms)]
    bas = {lab(i, s): gto.basis.load(basis, s) for i, (s, x) in enumerate(atoms)}
    mol = gto.M(atom=spec, basis=bas, unit="Bohr", verbose=0, max_memory=3000)
    mf = scf.RHF(mol); mf.conv_tol = 1e-10; mf.kernel()
    pt = dfmp2.DFMP2(mf, frozen=sum(1 for i in range(len(atoms)) if real[i])); pt.kernel()
    return mol.nao, mf.e_tot, pt.e_corr, mf.converged
t0 = time.time(); n = len(A)
nAB, hAB, cAB, okAB = run([True] * (2 * n)); _, hA, cA, okA = run([True] * n + [False] * n); _, hB, cB, okB = run([False] * n + [True] * n)
json.dump({"k": r["k"], "basis": basis, "n": nAB, "hf": hAB - hA - hB, "mp2": hAB + cAB - hA - cA - hB - cB, "ok": bool(okAB and okA and okB), "A": A, "B": B, "s": round(time.time() - t0)}, open(out, "w"))
