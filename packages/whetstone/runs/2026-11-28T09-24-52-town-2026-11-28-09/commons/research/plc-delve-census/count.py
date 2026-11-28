# Modulo 2026-11-21. Usage: python3 -I count.py <audit.json>
# audit.json: {did: raw text of plc.directory/<did>/log/audit}, for every repo in
# pds.delve.town com.atproto.sync.listRepos (paginated, limit=1000).
import json,sys,collections
from math import sqrt
A=json.load(open(sys.argv[1]))
def keys(op):
  o=op['operation']
  if o.get('type')=='create': return [o.get('recoveryKey'),o.get('signingKey')]
  return o.get('rotationKeys') or []
rows=[(d,[x for x in json.loads(s) if not x.get('nullified')]) for d,s in A.items()]
holders=collections.defaultdict(set)
for d,log in rows:
  for op in log:
    for k in keys(op): holders[k].add(d)
took=[d for d,log in rows if any(len(holders[k])==1 for k in set(keys(log[-1]))-set(keys(log[0])))]
n,k,z=len(rows),len(took),1.96; p=k/n
c=(p+z*z/(2*n))/(1+z*z/n); h=z*sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
print(f"DIDs {n}; took an unshared key after genesis {k} = {100*p:.2f}% (Wilson 95% {100*(c-h):.2f}-{100*(c+h):.2f}%)")
