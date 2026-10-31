# Modulo 2026-10-16. python3 -I fold.py  (run from this dir). Scores PREDICTION.md.
import json,glob,collections as C
def kind(S,I): return 'D' if S==0 and I==0 else ('S' if I==0 else ('I' if S==0 else 'B'))
def maj(v):
    t=C.Counter(v).most_common(); return 'T' if len(t)>1 and t[0][1]==t[1][1] else t[0][0]
ref=C.defaultdict(list)
for f in sorted(glob.glob('../../../jobs/geom-coarse/out/rows-hextorus-*.jsonl')):
    for l in open(f):
        if l.strip():
            r=json.loads(l)
            if r['s']==1: continue
            c=[c for c in r['ck'] if c['T']==8000][0]; ref[(r['s'],r['p'],r['h'])].append(kind(c['S'],c['I']))
def load(m):
    d=C.defaultdict(list); sz=C.defaultdict(list)
    for f in sorted(glob.glob(f'sb-{m}-*.jsonl')):
        for l in open(f):
            if l.strip():
                r=json.loads(l); d[(r['s'],r['p'],r['h'])].append(kind(r['S'],r['I']))
                if 'size' in r: sz[r['s']].append((r['size']['min'],r['size']['med'],r['size']['max']))
    return d,sz
print('ref cells',len(ref),'runs',sum(map(len,ref.values())))
for m in ['coord2','seed']:
    d,sz=load(m); ks=[k for k in ref if len(d.get(k,[]))==5]
    print(f'\n== {m}: complete cells {len(ks)} of {len(ref)}')
    fl=[k for k in ks if maj(ref[k])!=maj(d[k])]
    print('majority flips',len(fl),'of',len(ks))
    tr=C.Counter((maj(ref[k]),maj(d[k])) for k in fl); print('  from->to',dict(tr))
    for s in (2,5,10):
        kk=[k for k in ks if k[0]==s]; print(f'  s={s}: flips {sum(1 for k in fl if k[0]==s)} of {len(kk)}; B>=3 ref {sum(ref[k].count("B")>=3 for k in kk)} {m} {sum(d[k].count("B")>=3 for k in kk)}')
    rb=sum(ref[k].count('B')>=3 for k in ks); mb=sum(d[k].count('B')>=3 for k in ks)
    gain=sum(1 for k in ks if ref[k].count('B')<3<=d[k].count('B')); loss=sum(1 for k in ks if d[k].count('B')<3<=ref[k].count('B'))
    print(f'B>=3/5: ref {rb}, {m} {mb} (net {mb-rb:+d}; gained {gain}, lost {loss})')
    rr=C.Counter(x for k in ks for x in ref[k]); mm=C.Counter(x for k in ks for x in d[k]); print('runs B/S/I/D ref',[rr[x] for x in 'BSID'],m,[mm[x] for x in 'BSID'])
    for s,v in sorted(sz.items()):
        print(f'  block sizes s={s} (nominal {s*s}): min of mins {min(a for a,_,_ in v)}, median of medians {sorted(b for _,b,_ in v)[len(v)//2]}, max of maxes {max(c for _,_,c in v)}')
