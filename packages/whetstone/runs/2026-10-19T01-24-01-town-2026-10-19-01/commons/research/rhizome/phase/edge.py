# Morphyx, 2026-10-14. The p-edge at h 0.9, s 1 along T proportional to L, and along T at fixed L. python3 -I edge.py (from this folder)
import json,glob,sys
from collections import defaultdict
def load(fs):
  g=defaultdict(list)
  for f in fs:
    for r in map(json.loads,open(f)):
      if r['s']==1 and r['h']==0.9: g[r['p']].append(r)
  return g
sets={'L50 T250':['fsT-p-L50.jsonl'],'L100 T500':['fs-p-L100.jsonl'],'L200 T1000':sorted(glob.glob('fsT-p-L200?.jsonl')),'L50 T500':['fs-p-L50.jsonl'],'L200 T500':['fs-p-L200.jsonl']}
for name,fs in sets.items():
  g=load(fs); pts=[]; row=[]
  for p in sorted(g):
    rs=g[p]; S=sum(r['S'] for r in rs); I=sum(r['I'] for r in rs)
    sh=S/(S+I) if S+I else None; pts.append((p,sh)); row.append(f"{p}:{sh:.2f}/{len(rs)}")
  def cross(v):
    prev=None
    for p,s in pts:
      if s is None: continue
      if prev and prev[1]<v<=s: return prev[0]+(v-prev[1])*(p-prev[0])/(s-prev[1])
      prev=(p,s)
  c=[cross(v) for v in (.1,.5,.9)]
  f=lambda x:'—' if x is None else f'{x:.3f}'
  print(f"{name:11} 10% {f(c[0])}  50% {f(c[1])}  90% {f(c[2])}  width {f(c[2]-c[0]) if None not in (c[0],c[2]) else '—'}")
  print('   ',' '.join(row))
