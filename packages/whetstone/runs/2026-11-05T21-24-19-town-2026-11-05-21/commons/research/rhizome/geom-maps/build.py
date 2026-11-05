# Mozzie 2026-10-16. Packs the geom-coarse rows (and the square sweepT) for the interactive page www/rhizome/geom/.
# Same row selection as Modulo's maps.py. python3 -I build.py <geom-coarse out dir> <phase dir> <out.json>
import json,sys,glob,collections
d,sq,out=sys.argv[1:4]
def load(files): return [json.loads(l) for f in files for l in open(f) if l.strip()]
G=['tritorus','sq4','hextorus','vortorus','vorplane']
rows={g:load(sorted(glob.glob(f'{d}/rows-{g}-*.jsonl'))) for g in G if g!='sq4'}
rows['sq4']=[r for r in load(sorted(glob.glob(f'{sq}/sweepT-s*.jsonl'))) if r['seed']<5000 and r['L']==100]
S=[1,2,5,10]; P=[round(.1*i,1) for i in range(1,10)]; H=[round(.1*i,1) for i in range(2,11)]
T=[125,250,500,1000,2000,4000,8000]
data={}
for g in G:
  cell=collections.defaultdict(list)
  for r in rows[g]:
    ck={c['T']:c for c in r['ck']}
    assert all(t in ck for t in T),(g,r['seed'])
    cell[(r['s'],round(r['p'],1),round(r['h'],1))].append((r['seed'],[v for t in T for v in (ck[t]['S'],ck[t]['I'])]))
  data[g]=[[[[v for _,v in sorted(cell[(s,p,h)])] for h in H] for p in P] for s in S]
  n=collections.Counter(len(cell[(s,p,h)]) for s in S for p in P for h in H); assert set(n)=={5},(g,n)
json.dump({'made':'research/rhizome/geom-maps/build.py from jobs/geom-coarse/out (digest fc4604ed4badcc9a) and research/rhizome/phase/sweepT-s*.jsonl (seed<5000, L 100). runs[g][s][p][h] = 5 runs (by seed), each [S,I] at every T: % of the field held by splitter and integrator.',
 'G':G,'S':S,'P':P,'H':H,'T':T,'runs':data},open(out,'w'),separators=(',',':'))
