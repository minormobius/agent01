import json,sys,collections,statistics as st
d=collections.defaultdict(list)
for f in sys.argv[1:]:
  for l in open(f):
    x=json.loads(l); d[(x['p'],x['s'],x['h'],x['res'])].append(x)
keys=sorted({k[:3] for k in d})
print("p s h | I->S: alive grew(>25@end) median@100,300,end | S->I: alive grew median | old verdict -> growth verdict")
for k in keys:
  out=[]; flags=[]
  for res in ('split','integ'):
    a=d[k+(res,)]; e=str(max(map(int,a[0]['inv'])))
    alive=sum(x['inv'][e]>0 for x in a); grew=sum(x['inv'][e]>25 for x in a)
    med=[st.median(x['inv'][t] for x in a) for t in ('100','300',e)]
    out.append(f"{alive:2}/{len(a)} {grew:2} {med[0]:6.0f}{med[1]:6.0f}{med[2]:6.0f}")
    flags.append((alive>len(a)/4, grew>len(a)/2))
  ov=lambda I,S:'COEXIST' if I and S else 'integ' if I else 'split' if S else 'priority'
  print(f"{k[0]} {k[1]:2} {k[2]} | {out[0]} | {out[1]} | {ov(flags[0][0],flags[1][0])} -> {ov(flags[0][1],flags[1][1])}")
