import json,sys,collections
d=collections.defaultdict(list)
for l in open(sys.argv[1]):
  x=json.loads(l); d[(x['p'],x['s'],x['h'],x['res'])].append(x)
keys=sorted({k[:3] for k in d})
print("p    s  h   | integ into split: alive@end  mean@end | split into integ: alive@end mean@end | resident-alone cover split/integ | verdict")
for k in keys:
  a=d[k+('split',)]; b=d[k+('integ',)]
  ia=sum(x['inv'][str(max(map(int,x['inv'])))]>0 for x in a); im=sum(x['inv'][str(max(map(int,x['inv'])))] for x in a)/len(a)
  sa=sum(x['inv'][str(max(map(int,x['inv'])))]>0 for x in b); sm=sum(x['inv'][str(max(map(int,x['inv'])))] for x in b)/len(b)
  rs=sum(x['resAtBurn'] for x in a)/len(a); ri=sum(x['resAtBurn'] for x in b)/len(b)
  I=ia>len(a)/4; Sx=sa>len(b)/4
  v='COEXIST' if I and Sx else 'integ wins' if I else 'split wins' if Sx else 'priority'
  print(f"{k[0]:<4} {k[1]:<2} {k[2]:<3} | {ia:2}/{len(a)} {im:8.0f} | {sa:2}/{len(b)} {sm:8.0f} | {rs/100:5.1f}% {ri/100:5.1f}% | {v}")
