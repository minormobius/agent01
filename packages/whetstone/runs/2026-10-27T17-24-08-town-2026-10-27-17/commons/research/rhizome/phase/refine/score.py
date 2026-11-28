# Morphyx 2026-10-15. Scores PREDICTION.md from cells.json and rows-*.jsonl (t=8000). python3 -I score.py <dir>
import json,sys,glob,collections
d=sys.argv[1]; cells=json.load(open(d+'/cells.json'))
rows=[json.loads(l) for f in glob.glob(d+'/rows-*.jsonl') for l in open(f) if l.strip()]
g=collections.defaultdict(list)
for r in rows: g[(r['s'],r['p'],r['h'])].append(r)
def state(rs):
  c=collections.Counter()
  for r in rs:
    o=r['ck'][-1]; c['D' if o['S']+o['I']==0 else 'I' if o['S']==0 else 'S' if o['I']==0 else 'B']+=1
  m=max(c.values()); w=[k for k in c if c[k]==m]; return w[0] if len(w)==1 else 'T'
done=[]
for c in cells:
  ks=[(c['s'],round(c['p']+dp,3),round(c['h']+dh,3)) for dp in(-.025,.025) for dh in(-.025,.025)]
  if all(len(g[k])==5 for k in ks): done.append((c,[state(g[k]) for k in ks],ks))
print(f'parents complete: {len(done)} of {len(cells)}; runs: {len(rows)}')
B=[x for x in done if x[0]['state']=='B']; nb=sum(s.count('B') for _,s,_ in B)
print(f'G1 children of B parents that are B: {nb} of {4*len(B)} (guess: at least half)')
IS=[x for x in done if {x[0]['state']}|set(x[0]['nb'])>={'I','S'} and 'B' not in x[0]['nb'] and x[0]['state']!='B']
print(f'G2 I|S-front parents with no B neighbour having any B child: {sum("B" in s for _,s,_ in IS)} of {len(IS)} (guess: fewer than half)')
same=sum(s.count(x[0]['state']) for x in done for s in [x[1]])
print(f'G3 children sharing parent state: {same} of {4*len(done)} (guess: at least 60%)')
print('by parent state -> children states')
t=collections.defaultdict(collections.Counter)
for c,s,_ in done:
  for v in s: t[c['state']][v]+=1
for k in sorted(t): print(' ',k,dict(t[k]))
newB=[(c,s) for c,s,_ in done if c['state']!='B' and 'B' in s]
print('B children under non-B parents:',sum(s.count('B') for _,s in newB),'in',len(newB),'parents')
for c,s in newB: print('   s',c['s'],'p',c['p'],'h',c['h'],c['state'],'nb',c['nb'],'kids(ll,lr? order: p-h-,p-h+,p+h-,p+h+)',''.join(s))
