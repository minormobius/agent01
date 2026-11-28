# Morphyx 2026-10-15. plan.py's rule (../phase/refine/plan.py) applied to each geometry's coarse rows at t=8000.
import json,sys,glob,collections
d=sys.argv[1]; out=[]
for g in ['vortorus','vorplane','hextorus','tritorus']:
  grp=collections.defaultdict(list)
  for f in sorted(glob.glob(f'{d}/rows-{g}-*.jsonl')):
    for l in open(f):
      if l.strip(): r=json.loads(l); grp[(r['s'],round(r['p'],2),round(r['h'],2))].append(r)
  st={}
  for k,rs in grp.items():
    c=collections.Counter()
    for r in rs:
      a=r['ck'][-1]; S,I=a['S'],a['I']; c['D' if S+I==0 else 'I' if S==0 else 'S' if I==0 else 'B']+=1
    m=max(c.values()); w=[x for x in c if c[x]==m]; st[k]=w[0] if len(w)==1 else 'T'
  ps=sorted({k[1] for k in st}); hs=sorted({k[2] for k in st})
  for (s,p,h),v in st.items():
    i,j=ps.index(p),hs.index(h)
    nb=[st[(s,ps[i+a],hs[j+b])] for a,b in((1,0),(-1,0),(0,1),(0,-1)) if 0<=i+a<len(ps) and 0<=j+b<len(hs)]
    diff={n for n in nb if n!=v}
    if not diff: continue
    pri=0 if ({v}|diff)&{'B','I','T'} else 1
    out.append({'geo':g,'s':s,'p':p,'h':h,'state':v,'nb':''.join(sorted(diff)),'pri':pri})
out.sort(key=lambda c:(c['pri'],c['geo'],c['s'],c['h'],c['p']))
print(json.dumps(out))
