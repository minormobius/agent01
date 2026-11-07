# Modulo's independent fold of geom-refine (second desk), 2026-10-16. Parent state recomputed from coarse rows.
import json,sys,collections as C
W=sys.argv[1]
def kind(S,I): return 'D' if S==0 and I==0 else ('S' if I==0 else ('I' if S==0 else 'B'))
def maj(ks):
    c=C.Counter(ks); top=c.most_common(); 
    return 'T' if len(top)>1 and top[0][1]==top[1][1] else top[0][0]
cells=json.load(open(f"{W}/research/rhizome/geom/cells.json"))
coarse=C.defaultdict(list)
for g in ["tritorus","hextorus","vortorus","vorplane"]:
    for i in range(4):
        for l in open(f"{W}/jobs/geom-coarse/out/rows-{g}-{i}.jsonl"):
            if not l.strip(): continue
            r=json.loads(l); ck=[c for c in r["ck"] if c["T"]==8000][0]
            coarse[(g,r["s"],round(r["p"],3),round(r["h"],3))].append(kind(ck["S"],ck["I"]))
pstate={k:maj(v) for k,v in coarse.items()}
mism=sum(pstate[(c["geo"],c["s"],round(c["p"],3),round(c["h"],3))]!=c["state"] for c in cells)
print("cells.json parent state vs my recompute, mismatches:",mism,"of",len(cells))
q=C.defaultdict(list); n=0
for i in range(4):
    for l in open(f"{W}/jobs/geom-refine/out/rsum-{i}.jsonl"):
        if not l.strip(): continue
        r=json.loads(l); n+=1
        q[(r["geo"],r["s"],round(r["parent"][0],3),round(r["parent"][1],3))+((round(r["p"],3),round(r["h"],3)),)].append(kind(r["S"],r["I"]))
print("rows",n,"quarter keys",len(q),"sizes",C.Counter(len(v) for v in q.values()))
byp=C.defaultdict(dict)
for k,v in q.items(): byp[k[:4]][k[4]]=v
tot=C.Counter()
for g in ["tritorus","hextorus","vortorus","vorplane"]:
    ps=[k for k in byp if k[0]==g]
    Bp=[k for k in ps if pstate[k]=='B']
    bq=sum(sum(1 for v in byp[k].values() if v.count('B')>=3) for k in Bp)
    match=sum(sum(1 for v in byp[k].values() if maj(v)==pstate[k]) for k in ps)
    pri={(c["geo"],c["s"],round(c["p"],3),round(c["h"],3)):c for c in cells}
    sd=[k for k in ps if pri[k]["pri"]==1]
    sdh=sum(any(v.count('B')>=3 for v in byp[k].values()) for k in sd)
    # neighbours recomputed: same s, adjacent coarse grid step in p or h
    grid=sorted({k[2] for k in pstate if k[0]==g}); hg=sorted({k[3] for k in pstate if k[0]==g})
    def nbs(k):
        out=[]
        for dp,dh in((1,0),(-1,0),(0,1),(0,-1)):
            ip=grid.index(k[2])+dp; ih=hg.index(k[3])+dh
            if 0<=ip<len(grid) and 0<=ih<len(hg):
                kk=(g,k[1],grid[ip],hg[ih]); 
                if kk in pstate: out.append(pstate[kk])
        return out
    newB=[k for k in ps if pstate[k]!='B' and any(v.count('B')>=3 for v in byp[k].values())]
    besB=sum('B' in nbs(k) for k in newB)
    print(f"{g}: parents {len(ps)}, B parents {len(Bp)}, B quarters {bq}/{4*len(Bp)} = {bq/4/len(Bp):.1%}, match {match}/{4*len(ps)} = {match/4/len(ps):.1%}, S|D hiding B {sdh}/{len(sd)}, new-B {len(newB)} ({besB} beside B)")
    tot.update(dict(sd=len(sd),sdh=sdh,newB=len(newB),besB=besB))
print(dict(tot))
