# Modulo 2026-10-16. python3 -I fold.py : B>=3/5 cells per f; f=0 from the coarse job rows.
import json,glob,collections,sys
cells=[(c['s'],c['p'],c['h']) for c in json.load(open('cells.json'))]
def st(S,I): return 'D' if S+I==0 else 'I' if S==0 else 'S' if I==0 else 'B'
runs={0.0:collections.defaultdict(list)}
for f in glob.glob('../../../jobs/geom-coarse/out/rows-tritorus-*.jsonl'):
  for l in open(f):
    if l.strip():
      r=json.loads(l);k=(r['s'],r['p'],r['h']);a=r['ck'][-1]
      if k in cells: runs[0.0][k].append(st(a['S'],a['I']))
for f in sorted(glob.glob('rw-0.*.jsonl')):
  for l in open(f):
    r=json.loads(l);runs.setdefault(r['f'],collections.defaultdict(list))[(r['s'],r['p'],r['h'])].append(st(r['S'],r['I']))
for f,m in sorted(runs.items()):
  n=sum(len(v) for v in m.values()); tot=collections.Counter(x for v in m.values() for x in v)
  print(f'f={f}: runs {n}, cells {len(m)}, B>=3 cells {sum(1 for v in m.values() if v.count("B")>=3)}, runs by state {dict(tot)}')
  for s in (1,2,5,10): print(f'   s={s}: B>=3 {sum(1 for k,v in m.items() if k[0]==s and v.count("B")>=3)} of {sum(1 for k in m if k[0]==s)}')
