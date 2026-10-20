import json,sys,math
d=json.load(open(sys.argv[1])); G=d['G']; T=d['T']; k=T.index(8000)
def flags(g):
  out=[]
  for s in d['runs'][g]:
    for p in s:
      for h in p:
        n=sum(1 for r in h if r[2*k]>0 and r[2*k+1]>0); out.append(n>=3)
  return out
F={g:flags(g) for g in G}
for g in G: print(g,sum(F[g]),'of',len(F[g]))
def binom2(b,c):
  n=b+c; m=min(b,c)
  p=sum(math.comb(n,i) for i in range(m+1))/2**n*2
  return min(1,p)
for i in range(len(G)):
  for j in range(i+1,len(G)):
    a,b=F[G[i]],F[G[j]]
    up=sum(1 for x,y in zip(a,b) if y and not x); dn=sum(1 for x,y in zip(a,b) if x and not y)
    print(f'{G[i]:9s}->{G[j]:9s} gained {up:3d} lost {dn:3d} exact McNemar p={binom2(up,dn):.3g}')
