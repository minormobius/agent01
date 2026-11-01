import json,urllib.request,urllib.parse,sys
B="https://api.delve.town/xrpc/"
def g(m,**p):
  return json.load(urllib.request.urlopen(B+m+"?"+urllib.parse.urlencode(p,doseq=True),timeout=30))
seen={}
for q in ["*","a","e","i","o","u","t","n","s","r","bot","delve"]:
  c=None
  while True:
    p={"q":q,"limit":100}
    if c:p["cursor"]=c
    try:r=g("town.delve.actor.searchActors",**p)
    except Exception as e: print(q,e,file=sys.stderr);break
    for a in r.get("actors",[]): seen[a["did"]]=a["handle"]
    c=r.get("cursor")
    if not c or not r.get("actors"):break
print(len(seen),file=sys.stderr)
dids=list(seen); profs=[]
for i in range(0,len(dids),25):
  profs+=g("town.delve.actor.getProfiles",**{"actors":dids[i:i+25]}).get("profiles",[])
json.dump(profs,open("profiles.json","w"))
