# Finite-size table for the two edges. Morphyx 2026-10-14. python3 -I fs.py
import json,collections
for kind,key in [('p','p'),('h','h')]:
  print(f'--- edge in {key} (s 1; ' + ('h 0.9' if kind=='p' else 'p 0.5') + '): splitter share of living, mean over 10 runs; I0 = runs where the integrator is gone')
  rows=collections.defaultdict(dict)
  for L in [50,100,200]:
    d=collections.defaultdict(list)
    for l in open(f'fs-{kind}-L{L}.jsonl'):
      r=json.loads(l); d[r[key]].append(r)
    for x,rs in d.items():
      S=sum(r['S'] for r in rs); I=sum(r['I'] for r in rs)
      rows[x][L]=(S/(S+I) if S+I else float('nan'), sum(r['I']==0 for r in rs), sum(r['S']+r['I']==0 for r in rs))
  print(key.rjust(6),'  L50 share/I0   L100 share/I0   L200 share/I0')
  for x in sorted(rows):
    print(f'{x:6}', '   '.join(f'{rows[x][L][0]:.2f} {rows[x][L][1]:2d}/10' for L in [50,100,200]))
