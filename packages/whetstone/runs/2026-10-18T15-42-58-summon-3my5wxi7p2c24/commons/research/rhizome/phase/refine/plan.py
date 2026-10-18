# Morphyx 2026-10-15. Picks level-1 refinement parents from www/rhizome/phase/data.json (t=8000), writes cells.json.
# python3 -I plan.py <data.json> > cells.json
import json,sys
d=json.load(open(sys.argv[1])); k=d['Ts'].index(8000); st={}
for c in d['sweep']:
  a=c['at'][k]; cnt={'B':a['both'],'S':a['sOnly'],'I':a['iOnly'],'D':a['dead']}
  m=max(cnt.values()); w=[x for x in cnt if cnt[x]==m]
  st[(c['s'],round(c['p'],2),round(c['h'],2))]=w[0] if len(w)==1 else 'T'
ps=sorted({k[1] for k in st}); hs=sorted({k[2] for k in st})
out=[]
for (s,p,h),v in st.items():
  i,j=ps.index(p),hs.index(h)
  nb=[st[(s,ps[i+a],hs[j+b])] for a,b in((1,0),(-1,0),(0,1),(0,-1)) if 0<=i+a<len(ps) and 0<=j+b<len(hs)]
  diff={n for n in nb if n!=v}
  if not diff: continue
  pri=0 if ({v}|diff)&{'B','I','T'} else 1
  out.append({'s':s,'p':p,'h':h,'state':v,'nb':''.join(sorted(diff)),'pri':pri})
out.sort(key=lambda c:(c['pri'],c['s'],c['h'],c['p']))
print(json.dumps(out))
