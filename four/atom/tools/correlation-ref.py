"""The reference for tools/correlation.mjs, on our world's pairs only: the same pair (js/pairmin.js's best geometry), the
same counterpoise-corrected Hartree-Fock and MP2 with the cores frozen, computed by an independent code (PySCF) in
the book's own basis (which must agree with js/gauss.js to ~1e-8) and in standard large bases. How much of the
correlation's binding the book's small basis catches is the gap. 3D only: the standard bases exist only for our world.
    pip install pyscf
    python3 four/atom/tools/correlation-ref.py <key> [basis ...]   # key 3, 3.7 or 3.9; default aug-cc-pvtz aug-cc-pvqz
merges into tools/correlation-ref.json, committed (the runner can't run PySCF): per key, per basis, functions n, hf, E2
(hartree). tools/correlation.mjs bake reads it."""
import json, os, subprocess, sys, time
from pyscf import gto, scf, mp

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "correlation-ref.json")
SYM = {1: "H", 7: "N", 8: "O", 9: "F"}
key, bases = sys.argv[1], sys.argv[2:] or ["aug-cc-pvtz", "aug-cc-pvqz"]
js = "import { PAIRMIN } from '%s/../js/pairmin.js'; import { WORLDS } from '%s/forcefield.mjs'; import { basisFor } from '%s/census.mjs';" \
     "const w = WORLDS['%s'], b = PAIRMIN['%s'].best; console.log(JSON.stringify({ Z: w.Z, A: b.A, B: b.B, book: { [w.Z]: basisFor(w.Z, 3), 1: basisFor(1, 3) } }));" % (HERE, HERE, HERE, key, key)
P = json.loads(subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True, check=True).stdout.strip().split("\n")[-1])
atoms = [(P["Z"] if i == 0 else 1, xyz) for i, xyz in enumerate(P["A"])] + [(P["Z"] if i == 0 else 1, xyz) for i, xyz in enumerate(P["B"])]
nA = len(P["A"])

def energies(basis, real):
    """HF and frozen-core MP2 for the atoms flagged real, every atom's functions present (ghosts carry no charge)"""
    spec, bas = [], {}
    for i, (Z, xyz) in enumerate(atoms):
        lab = SYM[Z] + str(i)
        b = [[l, [e, 1.0]] for l, exps in P["book"][str(Z)] for e in exps] if basis == "book" else gto.basis.load(basis, SYM[Z])
        if real[i]: spec.append([lab, xyz]); bas[lab] = b
        else: spec.append(["ghost-" + lab, xyz]); bas["ghost-" + lab] = b
    mol = gto.M(atom=spec, basis=bas, unit="Bohr", cart=(basis == "book"), verbose=0)
    mf = scf.RHF(mol); mf.conv_tol = 1e-11; mf.kernel()
    heavy = sum(1 for i, (Z, _) in enumerate(atoms) if real[i] and Z > 2)
    pt = mp.MP2(mf, frozen=heavy); pt.kernel()
    return mol.nao, mf.e_tot, pt.e_corr

out = {}
for basis in ["book"] + bases:
    t0 = time.time()
    n, hAB, cAB = energies(basis, [True] * len(atoms))
    _, hA, cA = energies(basis, [i < nA for i in range(len(atoms))])
    _, hB, cB = energies(basis, [i >= nA for i in range(len(atoms))])
    out[basis] = {"n": n, "hf": round(hAB - hA - hB, 9), "E2": round(cAB - cA - cB, 9)}
    print("%s %s: n %d, HF %.3f, correlation %.3f kcal/mol (%.0f s)" % (key, basis, n, out[basis]["hf"] * 627.509, out[basis]["E2"] * 627.509, time.time() - t0), flush=True)
allref = json.load(open(OUT)) if os.path.exists(OUT) else {}
allref[key] = {**allref.get(key, {}), **out}
json.dump(allref, open(OUT, "w"), indent=1, sort_keys=True); open(OUT, "a").write("\n")
