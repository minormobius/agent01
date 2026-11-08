"""Paper 1, scoping the Hartree–Fock bracket (2026-11-08): our 3d atoms' 4s→3d promotion energies by high-spin ROHF
(PySCF, cc-pVTZ, atomic SO3 symmetry so the configuration is held: each d component and the 4s occupied by hand),
against the local-exchange solver's (data/promotion3.json) and the measured ones (from memory, to verify).
Result: ROHF gets 8 of 9 ground configurations (Sc–Ni, Cr, Mn, Cu; misses V), the solver 5 (misses Ti, V, Co, Ni);
where the two agree they are right 5 times of 6 (V both wrong), where they disagree ROHF is right 3 of 3.
PySCF's AtomSphAverageRHF (fractional occupation) is NOT usable for this: its open-d energies are far off.
    pip install pyscf; python3 four/papers/p1/hf-scope.py"""
import json, warnings
from pyscf import gto, scf
warnings.filterwarnings("ignore"); HA=27.211386
P=json.load(open('/home/user/agent01/four/papers/p1/data/promotion3.json'))['promotion']
def E(sym, ns, nd, basis='cc-pvtz'):
    # high spin: d up first (5), then d down; s: up then down
    da, db = min(nd,5), max(0,nd-5); sa, sb = (1,1) if ns==2 else (1,0)
    na = 1+1+3+1+3+sa+da; nb = 1+1+3+1+3+sb+db  # 1s 2s 2p(3) 3s 3p(3) + valence
    mol=gto.M(atom=f'{sym} 0 0 0', basis=basis, spin=na-nb, symmetry='SO3', verbose=0)
    mf=scf.ROHF(mol); 
    irr={}
    # s irrep: 1s 2s 3s core (3 doubly) + 4s; p irreps: 2p 3p in each of 3 components
    irr['s+0']=(3+sa,3+sb)
    for m in ('p-1','p+0','p+1'): irr[m]=(2,2)
    dcomp=['d-2','d-1','d+0','d+1','d+2']
    for i,m in enumerate(dcomp): irr[m]=(1 if i<da else 0, 1 if i<db else 0)
    mf.irrep_nelec=irr; mf.max_cycle=300; mf.conv_tol=1e-9; mf.level_shift=0.3
    e=mf.kernel(); return e, mf.converged
for r in P:
    nd=int(r['from'].split()[0][2:]); sym=r['symbol']
    try:
        ea,ca=E(sym,2,nd); eb,cb=E(sym,1,nd+1)
        print(sym, r['from'],'->',r['to'], 'HF %.2f'%((eb-ea)*HA), 'ours', r.get('solver_eV'), 'measured', r['measured_eV'], ca and cb)
    except Exception as ex: print(sym, 'error', str(ex)[:120])
print('--- the lenders')
for sym,nd,meas in [('Cr',4,None),('Cu',9,None),('Mn',5,None)]:
    ea,ca=E(sym,2,nd); eb,cb=E(sym,1,nd+1); print(sym, f'3d{nd} 4s2 -> 3d{nd+1} 4s1', 'HF %.2f'%((eb-ea)*HA), ca and cb)
