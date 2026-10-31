# Modulo 2026-10-17. python3 -I fold.py <coarse rows dir> <this dir>. Folds orig (coarse vortorus), perm, seed at t=8000.
import json,sys,glob,collections
d,me=sys.argv[1],sys.argv[2]
def st(rs):
  c=collections.Counter()
  for S,I in rs: c['D' if S+I==0 else 'I' if S==0 else 'S' if I==0 else 'B']+=1
  m=max(c.values()); w=[k for k in c if c[k]==m]
  return (w[0] if len(w)==1 else 'T'), c['B']
def grp(rows):
  g=collections.defaultdict(list)
  for k,S,I in rows: g[k].append((S,I))
  return g
orig=[]
for f in sorted(glob.glob(f'{d}/rows-vortorus-*.jsonl')):
  for l in open(f):
    if l.strip():
      r=json.loads(l)
      if r['s']>1: a=r['ck'][-1]; orig.append(((r['s'],round(r['p'],1),round(r['h'],1)),a['S'],a['I']))
arms={'orig':grp(orig)}
for a in ('perm','seed'):
  rs=[json.loads(l) for f in sorted(glob.glob(f'{me}/rows-{a}-*.jsonl')) for l in open(f) if l.strip()]
  arms[a]=grp([((r['s'],r['p'],r['h']),r['S'],r['I']) for r in rs])
  cv=[r['sizes']['cv'] for r in rs if r['s']==10]
  if cv: print(a,'s10 block size cv: mean %.3f min %.3f max %.3f'%(sum(cv)/len(cv),min(cv),max(cv)))
M={a:{k:st(v) for k,v in g.items() if len(v)==5} for a,g in arms.items()}
o=M['orig']
def rim(k):
  s,p,h=k; out=[]
  for dp,dh in ((.1,0),(-.1,0),(0,.1),(0,-.1)):
    n=(s,round(p+dp,1),round(h+dh,1))
    if n in o: out.append(o[n][0]!=o[k][0])
  return any(out)
print('orig cells',len(o),'B>=3of5',sum(1 for v in o.values() if v[1]>=3),'rim cells',sum(1 for k in o if rim(k)))
for a in ('perm','seed'):
  m=M[a]; ks=[k for k in m if k in o]
  fl=[k for k in ks if m[k][0]!=o[k][0]]
  into=sum(1 for k in fl if m[k][0]=='B'); outb=sum(1 for k in fl if o[k][0]=='B')
  b3=sum(1 for k in ks if m[k][1]>=3); b3o=sum(1 for k in ks if o[k][1]>=3)
  b3f=sum(1 for k in ks if (m[k][1]>=3)!=(o[k][1]>=3))
  print(f'{a}: cells {len(ks)} flips {len(fl)} into B {into} out of B {outb} on rim {sum(map(rim,fl))}/{len(fl)} | B>=3 {b3} (orig {b3o}), B>=3 cells changed {b3f}')
  for s in (2,5,10): print('   s',s,'flips',sum(1 for k in fl if k[0]==s),'of',sum(1 for k in ks if k[0]==s))
  print('   ',sorted(f'{k[0]}/{k[1]}/{k[2]}:{o[k][0]}>{m[k][0]}' for k in fl))
if all(k in M['perm'] for k in M['seed']):
  ks=[k for k in M['seed'] if k in M['perm']]
  print('seed vs perm flips',sum(1 for k in ks if M['seed'][k][0]!=M['perm'][k][0]),'of',len(ks))
