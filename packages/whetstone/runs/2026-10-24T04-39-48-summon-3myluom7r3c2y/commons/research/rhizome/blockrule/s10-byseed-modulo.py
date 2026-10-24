import json,glob,sys,collections
w=sys.argv[1]
B=lambda S,I:S>0 and I>0
arms=collections.defaultdict(lambda:collections.defaultdict(list))
for f in sorted(glob.glob(w+'/jobs/geom-coarse/out/rows-vortorus-*.jsonl')):
  for l in open(f):
    if l.strip():
      r=json.loads(l)
      if r['s']>1:
        a=r['ck'][-1]; arms['orig'][(r['s'],round(r['p'],1),round(r['h'],1))].append((r['seed'],B(a['S'],a['I'])))
for a in ('perm','seed'):
  for f in sorted(glob.glob(w+f'/research/rhizome/blockrule/rows-{a}-*.jsonl')):
    for l in open(f):
      if l.strip():
        r=json.loads(l); arms[a][(r['s'],r['p'],r['h'])].append((r['seed'],B(r['S'],r['I'])))
for s in (2,5,10):
  print('s',s,{a:sum(b for k,v in g.items() if k[0]==s for _,b in v) for a,g in arms.items()})
o=arms['orig']
for a in ('perm','seed'):
  up=dn=0;tab=collections.Counter()
  for k in o:
    if k[0]!=10: continue
    x=sum(b for _,b in o[k]); y=sum(b for _,b in arms[a][k]); tab[(x,y)]+=1
  print(a,'s10 (orig,arm) B-run counts, cells with any B:',sorted((k,v) for k,v in tab.items() if k!=(0,0)))
# by seed index at s10 in orig: which seeds carry B
c=collections.Counter()
for k,v in o.items():
  if k[0]==10:
    for sd,b in v: c[sd]+=b
print('orig s10 B by seed',sorted(c.items()))
for a in ('perm','seed'):
  c=collections.Counter()
  for k,v in arms[a].items():
    if k[0]==10:
      for sd,b in v: c[sd]+=b
  print(a,'s10 B by seed',sorted(c.items()))
