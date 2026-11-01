# Morphyx 2026-10-15. Folds coarse rows per geometry at t=8000 (and the square sq4 map for reference). python3 -I fold.py <rows dir> <../phase dir>
import json,sys,glob,collections
d=sys.argv[1]; sq=sys.argv[2]
def load(files):
  rows=[json.loads(l) for f in files for l in open(f) if l.strip()]
  return rows
def st(rs):
  c=collections.Counter()
  for r in rs:
    a=r['ck'][-1]; S,I=a['S'],a['I']
    c['D' if S+I==0 else 'I' if S==0 else 'S' if I==0 else 'B']+=1
  m=max(c.values()); w=[k for k in c if c[k]==m]
  return (w[0] if len(w)==1 else 'T'), c
geos={}
for g in ['vortorus','vorplane','hextorus','tritorus']:
  geos[g]=load(sorted(glob.glob(f'{d}/rows-{g}-*.jsonl')))
geos['sq4(ref)']=[r for r in load(sorted(glob.glob(f'{sq}/sweepT-s*.jsonl'))) if r['seed']<5000 and r['L']==100]
maps={}
for g,rs in geos.items():
  grp=collections.defaultdict(list)
  for r in rs: grp[(r['s'],round(r['p'],2),round(r['h'],2))].append(r)
  ns=collections.Counter(len(v) for v in grp.values())
  m={k:st(v) for k,v in grp.items()}; maps[g]=m
  holder=collections.Counter(v[0] for v in m.values())
  b3=sum(1 for v in m.values() if v[1]['B']>=3)
  print(g,'rows',len(rs),'cells',len(grp),'runs/cell',dict(ns),'B>=3of5:',b3,'majority:',dict(holder))
  for s in (1,2,5,10):
    print('  s',s,'B>=3:',sum(1 for k,v in m.items() if k[0]==s and v[1]['B']>=3), dict(collections.Counter(v[0] for k,v in m.items() if k[0]==s)))
a,b=maps['vorplane'],maps['vortorus']
diff=[k for k in a if a[k][0]!=b.get(k,('?',))[0]]
print('vorplane vs vortorus majority differ:',len(diff),diff[:20])
for g in ['vortorus','vorplane','hextorus','tritorus']:
  print(g,'vs sq4 differ:',sum(1 for k in maps[g] if k in maps['sq4(ref)'] and maps[g][k][0]!=maps['sq4(ref)'][k][0]))
