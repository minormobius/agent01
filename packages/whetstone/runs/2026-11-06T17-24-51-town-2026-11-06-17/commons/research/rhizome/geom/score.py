# Morphyx 2026-10-16. Scores geom-refine (PLAN.md Stage 2) from cells.json and rsum-*.jsonl (final checkpoint, t=8000).
# python3 -I score.py <cells.json> <dir with rsum-*.jsonl>
import json,sys,glob,collections
cells=json.load(open(sys.argv[1])); bad=0; rows=[]
for f in sorted(glob.glob(sys.argv[2]+'/rsum-*.jsonl')):
  for l in open(f):
    if not l.strip(): continue
    try: rows.append(json.loads(l))
    except Exception: bad+=1
g=collections.defaultdict(list)
for r in rows: g[(r['geo'],r['s'],r['p'],r['h'])].append(r)
dups=sum(1 for k,v in g.items() if len({r['seed'] for r in v})<len(v))
def st(r): return 'D' if r['S']+r['I']==0 else 'I' if r['S']==0 else 'S' if r['I']==0 else 'B'
def state(rs):
  c=collections.Counter(st(r) for r in rs); m=max(c.values()); w=[k for k in c if c[k]==m]; return w[0] if len(w)==1 else 'T'
def nB(rs): return sum(st(r)=='B' for r in rs)
print(f'rows {len(rows)}, unparseable lines {bad}, keys with duplicate seeds {dups}, T!=8000: {sum(r["T"]!=8000 for r in rows)}')
for geo in sorted({c['geo'] for c in cells}):
  cs=[c for c in cells if c['geo']==geo]; done=[]; short=0
  for c in cs:
    ks=[(geo,c['s'],round(c['p']+dp,3),round(c['h']+dh,3)) for dp in(-.025,.025) for dh in(-.025,.025)]
    if all(len(g[k])==5 for k in ks): done.append((c,[state(g[k]) for k in ks],[nB(g[k]) for k in ks]))
    else: short+=1
  B=[x for x in done if x[0]['state']=='B']
  bq=sum(sum(n>=3 for n in ns) for _,_,ns in B)
  same=sum(s.count(c['state']) for c,s,_ in done)
  newB=[(c,ns) for c,s,ns in done if c['state']!='B' and any(n>=3 for n in ns)]
  nbB=sum(1 for c,_ in newB if 'B' in c['nb'])
  sdf=[x for x in done if x[0]['pri']==1]; sdh=sum(any(n>=3 for n in ns) for _,_,ns in sdf)
  print(f'{geo}: parents complete {len(done)}/{len(cs)}; B parents {len(B)}, quarters B>=3/5 {bq}/{4*len(B)} = {bq/max(1,4*len(B)):.0%}; '
        f'match parent {same}/{4*len(done)} = {same/max(1,4*len(done)):.0%}; new-B parents {len(newB)} ({nbB} beside a B parent); S|D fronts hiding B {sdh}/{len(sdf)}')
  t=collections.defaultdict(collections.Counter)
  for c,s,_ in done:
    for v in s: t[c['state']][v]+=1
  print('   parent -> quarters:', {k:dict(t[k]) for k in sorted(t)})
