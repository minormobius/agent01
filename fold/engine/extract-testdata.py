#!/usr/bin/env python3
"""Provenance for proteins.json and engine/testdata.txt.

Pulls each PDB entry from RCSB, takes MODEL 1 and the first protein chain,
extracts C-alpha coordinates, assigns secondary structure by the P-SEA C-alpha
distance rules, centres the trace on its centroid, and writes both files.

To add a protein: add a row to META, run this, then run ../fold.selftest.mjs —
it checks every trace for ~3.8 A C-alpha spacing, which is what catches a
mis-parsed chain. Stdlib only, no dependencies.

    python3 engine/extract-testdata.py
"""

import json, math, os, urllib.request

AA3 = {'ALA':'A','ARG':'R','ASN':'N','ASP':'D','CYS':'C','GLN':'Q','GLU':'E','GLY':'G',
       'HIS':'H','ILE':'I','LEU':'L','LYS':'K','MET':'M','PHE':'F','PRO':'P','SER':'S',
       'THR':'T','TRP':'W','TYR':'Y','VAL':'V','MSE':'M','NLE':'L','HIP':'H','HIE':'H'}

def parse(path):
    """MODEL 1, first protein chain, CA atoms, altloc A/blank."""
    ca, seq, chain = [], [], None
    seen = set()
    in_model = True
    for line in open(path):
        rec = line[:6]
        if rec == 'MODEL ':
            in_model = int(line[10:14]) == 1
        elif rec == 'ENDMDL':
            in_model = False
        elif rec in ('ATOM  ', 'HETATM') and in_model:
            if line[12:16].strip() != 'CA': continue
            alt = line[16]
            if alt not in (' ', 'A'): continue
            res3 = line[17:20].strip()
            if res3 not in AA3: continue
            ch = line[21]
            if chain is None: chain = ch
            if ch != chain: continue
            key = (line[22:27])          # resSeq + iCode
            if key in seen: continue
            seen.add(key)
            ca.append((float(line[30:38]), float(line[38:46]), float(line[46:54])))
            seq.append(AA3[res3])
    return ca, ''.join(seq)

def d(a, b):
    return math.dist(a, b)

def secondary(ca):
    """Ca-only secondary structure, P-SEA distance criteria (Labesse et al. 1997)."""
    n = len(ca)
    ss = ['-'] * n
    def ok(i, j, lo, hi):
        return i + j < n and lo <= d(ca[i], ca[i+j]) <= hi
    for i in range(n):
        if ok(i,2,5.0,6.1) and ok(i,3,4.8,5.8) and ok(i,4,5.8,7.0):
            for k in range(i, min(i+5, n)): ss[k] = 'H'
    for i in range(n):
        if ss[i] != '-': continue
        if ok(i,2,6.1,7.3) and ok(i,3,9.0,10.8) and ok(i,4,11.3,13.5):
            for k in range(i, min(i+5, n)):
                if ss[k] == '-': ss[k] = 'E'
    return ''.join(ss)

def centre(ca):
    cx = sum(p[0] for p in ca)/len(ca); cy = sum(p[1] for p in ca)/len(ca); cz = sum(p[2] for p in ca)/len(ca)
    return [[round(p[0]-cx,2), round(p[1]-cy,2), round(p[2]-cz,2)] for p in ca]

META = [
  ('1UAO','Chignolin','GLY–TYR–ASP–PRO–GLU–THR–GLY–THR–TRP–GLY','A designed 10-residue beta hairpin — the smallest thing that deserves to be called a fold. Folds essentially instantly.'),
  ('1L2Y','Trp-cage','TC5b miniprotein','20 residues, designed by the Andersen lab. One short helix packing a tryptophan into a proline cage. The standard proving ground for folding methods.'),
  ('2F4K','Villin HP-35','Chicken villin headpiece subdomain','35 residues, three helices. The classic ultrafast folder — ~4 microseconds in reality, which is why all-atom simulation of it was a landmark and not a Tuesday.'),
  ('1E0L','FBP28 WW domain','Three-stranded antiparallel sheet','A 37-residue all-beta domain. Folding beta sheets is slower and more frustrated than folding helices — you can see the difference here.'),
  ('1AJJ','LDLR module LA5','Ligand-binding repeat 5, calcium-coordinating','The receptor module family from the paper this site came out of. 40 residues held together by three disulfides and a buried calcium ion — which is exactly why a physics model that knows about neither will misbehave. Watch it and see.'),
  ('2GB1','Protein G B1','Immunoglobulin-binding domain','56 residues: a four-stranded sheet packed against one helix. The most-studied small protein in the folding literature.'),
  ('1SHG','SH3 domain','alpha-spectrin SH3','A 57-residue all-beta sandwich. Famous for folding through a well-defined nucleus.'),
  ('1UBQ','Ubiquitin','The beta-grasp fold','76 residues. Big enough that you watch it search, and that the frame budget starts to bite.'),
  ('1SVB','TBEV envelope protein E','Tick-borne encephalitis virus glycoprotein','395 residues — the molecule at the centre of the paper. Included to be looked at, not folded: at this size a structure-based model is minutes per trajectory, and an all-atom one is years. This is where the browser stops.'),
]

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.pdb-cache')

def fetch(pid):
    """Download the entry once and keep it; the cache is gitignored scratch."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, pid + '.pdb')
    if not os.path.exists(path):
        url = f'https://files.rcsb.org/download/{pid}.pdb'
        print('fetching', url)
        with urllib.request.urlopen(url) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path

out = []
for pid, name, sub, blurb in META:
    ca, seq = parse(fetch(pid))
    if not ca:
        print('!! no CA for', pid); continue
    ss = secondary(ca)
    out.append({'id': pid, 'name': name, 'sub': sub, 'blurb': blurb,
                'n': len(ca), 'seq': seq, 'ss': ss,
                'ca': [c for p in centre(ca) for c in p]})
    print(f'{pid:6} n={len(ca):4}  {seq[:50]}')
    print(f'       ss={ss[:50]}')

site = os.path.join(HERE, '..', 'proteins.json')
json.dump(out, open(site, 'w'), separators=(',', ':'))
print('proteins.json:', os.path.getsize(site), 'bytes')

# the native validator (engine/src/check.rs) reads a flat text form
with open(os.path.join(HERE, 'testdata.txt'), 'w') as f:
    for p in out:
        f.write(p['id'] + ' ' + str(p['n']) + ' ' + ' '.join(str(c) for c in p['ca']) + '\n')
print('testdata.txt written')
