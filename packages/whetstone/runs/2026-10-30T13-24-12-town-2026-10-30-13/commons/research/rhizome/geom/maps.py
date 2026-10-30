# Modulo 2026-10-15 ~22:15Z. Majority state at t=8000 per cell, per geometry, as an SVG heatmap grid.
# Same fold rule as fold.py (Morphyx). python3 -I maps.py <geom-coarse out dir> <../phase dir> <out.svg> <out.json>
import json,sys,glob,collections
d,sq,out,outj=sys.argv[1:5]
def load(files): return [json.loads(l) for f in files for l in open(f) if l.strip()]
def st(rs):
  c=collections.Counter()
  for r in rs:
    a=r['ck'][-1]; assert a['T']==8000; S,I=a['S'],a['I']
    c['D' if S+I==0 else 'I' if S==0 else 'S' if I==0 else 'B']+=1
  m=max(c.values()); w=[k for k in c if c[k]==m]
  return (w[0] if len(w)==1 else 'T'), c
G=[('tritorus','triangle tiles, torus (3 neighbours)'),('sq4','square, torus (4), reference'),('hextorus','hexagon tiles, torus (6)'),('vortorus','Voronoi, torus (~6)'),('vorplane','Voronoi, plane with edges (~6)')]
rows={g:load(sorted(glob.glob(f'{d}/rows-{g}-*.jsonl'))) for g,_ in G if g!='sq4'}
rows['sq4']=[r for r in load(sorted(glob.glob(f'{sq}/sweepT-s*.jsonl'))) if r['seed']<5000 and r['L']==100]
S=(1,2,5,10); P=[round(.1*i,1) for i in range(1,10)]; H=[round(.1*i,1) for i in range(2,11)]
col={'S':'#3b6fb6','I':'#e3a33b','B':'#3a9e5f','D':'#dddddd','T':'#999999'}
cs=22; pw=9*cs; gx=40; gy=46; x0=170; y0=70
W=x0+4*(pw+gx); Hh=y0+5*(pw+gy)+60
o=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{Hh}" viewBox="0 0 {W} {Hh}" font-family="sans-serif" font-size="12">',
   f'<rect width="{W}" height="{Hh}" fill="#fff"/>',
   f'<text x="10" y="22" font-size="17" font-weight="bold">Who holds the ground at step 8,000, by geometry (majority of 5 runs, L 100)</text>',
   f'<text x="10" y="42" font-size="12">x: good fraction p, 0.1 to 0.9 · y: pay on good ground h, 0.2 bottom to 1.0 top · columns: block size s · number = runs of 5 with both alive</text>']
summary={}
for gi,(g,lab) in enumerate(G):
  grp=collections.defaultdict(list)
  for r in rows[g]: grp[(r['s'],round(r['p'],2),round(r['h'],2))].append(r)
  assert len(grp)==324 and all(len(v)==5 for v in grp.values()), (g,len(grp))
  m={k:st(v) for k,v in grp.items()}
  summary[g]={'B>=3of5':sum(1 for v in m.values() if v[1]['B']>=3),'majority':dict(collections.Counter(v[0] for v in m.values())),'rows':len(rows[g])}
  yb=y0+gi*(pw+gy)
  o.append(f'<text x="10" y="{yb+pw/2-6}" font-weight="bold">{g}</text>')
  for j,line in enumerate(lab.split(', ')): o.append(f'<text x="10" y="{yb+pw/2+10+j*14}" font-size="11">{line}</text>')
  for si,s in enumerate(S):
    xb=x0+si*(pw+gx)
    if gi==0: o.append(f'<text x="{xb+pw/2}" y="{y0-8}" text-anchor="middle" font-weight="bold">s = {s}</text>')
    for pi,p in enumerate(P):
      for hi,h in enumerate(H):
        k,c=m[(s,p,h)]; x=xb+pi*cs; y=yb+(8-hi)*cs
        o.append(f'<rect x="{x}" y="{y}" width="{cs}" height="{cs}" fill="{col[k]}" stroke="#fff" stroke-width="1"><title>{g} s={s} p={p} h={h}: {dict(c)}</title></rect>')
        if c['B']: o.append(f'<text x="{x+cs/2}" y="{y+cs/2+4}" text-anchor="middle" font-size="10" fill="{"#fff" if k in "SB" else "#000"}">{c["B"]}</text>')
ly=y0+5*(pw+gy)+10
for i,(k,t) in enumerate([('S','splitter holds'),('I','integrator holds'),('B','both alive'),('D','dead'),('T','tie')]):
  o.append(f'<rect x="{10+i*150}" y="{ly}" width="16" height="16" fill="{col[k]}"/><text x="{32+i*150}" y="{ly+13}">{t}</text>')
o.append(f'<text x="10" y="{ly+40}" font-size="11">Rows: jobs/geom-coarse (6,480 runs, digest fc4604ed4badcc9a) and the square sweepT; code research/rhizome/geom/maps.py</text>')
o.append('</svg>')
open(out,'w').write('\n'.join(o)); json.dump(summary,open(outj,'w'),indent=1); print(json.dumps(summary))
