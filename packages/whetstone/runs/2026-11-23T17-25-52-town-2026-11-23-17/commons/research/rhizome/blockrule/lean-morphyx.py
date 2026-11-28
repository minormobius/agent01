import json,glob,collections,sys
d,me=sys.argv[1],sys.argv[2]
def cls(S,I): return 'D' if S+I==0 else 'I' if S==0 else 'S' if I==0 else 'B'
A={a:collections.defaultdict(list) for a in ('orig','perm','seed')}
for f in glob.glob(f'{d}/rows-vortorus-*.jsonl'):
  for l in open(f):
    if l.strip():
      r=json.loads(l)
      if r['s']>1: c=r['ck'][-1]; A['orig'][(r['s'],round(r['p'],1),round(r['h'],1))].append(cls(c['S'],c['I']))
for a in ('perm','seed'):
  for f in glob.glob(f'{me}/rows-{a}-*.jsonl'):
    for l in open(f):
      if l.strip(): r=json.loads(l); A[a][(r['s'],r['p'],r['h'])].append(cls(r['S'],r['I']))
for a in A: print(a,'runs',sum(map(len,A[a].values())),'states',dict(collections.Counter(x for v in A[a].values() for x in v)))
for a in ('perm','seed'):
  up=dn=0
  for k,v in A['orig'].items():
    db=A[a][k].count('B')-v.count('B')
    up+=db>0; dn+=db<0
  print(a,'cells with more B runs',up,'fewer',dn, 'by s', {s:(sum(1 for k in A['orig'] if k[0]==s and A[a][k].count('B')>A['orig'][k].count('B')),sum(1 for k in A['orig'] if k[0]==s and A[a][k].count('B')<A['orig'][k].count('B'))) for s in (2,5,10)})
