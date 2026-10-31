# ------------------------------------------------------------------ nuclei (exec'd by genpages.py)
# numbers from js/nucleidata.js (tools/nuclei.mjs, from js/nuclear.js and js/dirac.js)
NU=json.loads(subprocess.run(['node','--input-type=module','-e','import { NUCLEI } from "'+ATOM+'js/nucleidata.js"; console.log(JSON.stringify(NUCLEI));'],capture_output=True,text=True,check=True).stdout)
NU_NF=NU['forces']; NU_FN={'MT':'Malfliet–Tjon','MN':'Minnesota'}
NU_S4={'MT':[1.2292,1.2986,1.4993],'MN':[1.4002,1.5152,1.8909]}
def NU_WIN(f,d): return NU_NF[f]['window'][str(d)]
def NU_HE(f,d,s,b='none',A=4):
    return next((h for h in NU_NF[f]['he'] if h['d']==d and abs(h['s']-s)<1e-9 and str(h['b'])==str(b) and h['A']==A),None)
def NU_PN(f,d,s,b='none'): h=NU_HE(f,d,s,b); return -h['E']/4 if h else None
def NU_DR(f,s): return [x for x in NU_NF[f]['drops'] if abs(x['s']-s)<1e-9]
def NU_AV(f,s): r=NU_DR(f,s); return (min(x['av'] for x in r), max(x['av'] for x in r)) if r else (None,None)
def NU_CL(f): return NU_NF[f].get('cluster')
def NU_CLR(f,s,fac): c=NU_CL(f); return next((r for r in c['rows'] if abs(r['s']-s)<1e-9 and r['f']==fac),None) if c else None
NU_HE_OURS=28.296/4  # our helium-4's binding per nucleon, measured
def NU_f1(x): return '—' if x is None else f'{x:.1f}'
def NU_f0(x): return '—' if x is None else f'{x:.0f}'
def NU_winrow(f):
    w3,w4=NU_WIN(f,3),NU_WIN(f,4)
    return f'<tr><td>{NU_FN[f]}</td><td>{w3["deuteron"]:.2f}–{w3["diproton"]:.2f}</td><td>{w4["deuteron"]:.2f}–{w4["diproton"]:.2f}</td><td>{w4["ours"]:.2f}</td></tr>'
def NU_herow(f):
    cells=''.join(f'<td>{NU_f1(NU_PN(f,4,s))}</td>' for s in NU_S4[f])
    return f'<tr><td>{NU_FN[f]}</td><td>{NU_f1(NU_PN(f,3,1))}</td>{cells}</tr>'
def NU_herow3(f):
    def rng(s): v=[NU_PN(f,4,s,b) for b in ('0.7','1.0','1.4')]; v=[x for x in v if x is not None]; return f'{min(v):.0f}–{max(v):.0f}' if v else '—'
    v3=[NU_PN(f,3,1,b) for b in ('0.7','1.0','1.4')]; v3=[x for x in v3 if x is not None]
    return f'<tr><td>{NU_FN[f]}, with the three-nucleon force</td><td>{(f"{min(v3):.1f}–{max(v3):.1f}") if v3 else "—"}</td>'+''.join(f'<td>{rng(s)}</td>' for s in NU_S4[f])+'</tr>'
def NU_matrow(f):
    fit=NU_NF[f]['fit']
    return f'<tr><td>{NU_FN[f]}</td><td>{fit["rho0"]:.3f}</td>'+''.join(f'<td>{NU_f0(NU_AV(f,s)[0])}–{NU_f0(NU_AV(f,s)[1])}</td>' for s in NU_S4[f])+'</tr>'
def NU_clrow(f,kind):
    c=NU_CL(f)
    if not c: return ''
    def cell(s):
        out=[]
        for fac in (0.8,1,1.25):
            r=NU_CLR(f,s,fac); v=r and (r['pair'] if kind=='pair' else r['nucleon'])
            out.append('unbound' if (v is None or v>=-0.01) else f'{-v:.1f}')
        return f'<td>{out[1]} <span class="dim">({out[0]} to {out[2]})</span></td>'
    lam=c['lamPair'] if kind=='pair' else c['lamN']
    return f'<tr><td>{NU_FN[f]} (λ = {lam:.2f})</td>'+''.join(cell(s) for s in NU_S4[f])+'</tr>'
# headline numbers
NU_HE4_OURS_STRENGTH=[NU_PN(f,4,NU_S4[f][1]) for f in NU_NF if NU_PN(f,4,NU_S4[f][1])]
NU_PAIR_OURS=[(-NU_CLR(f,NU_S4[f][1],1)['pair']) for f in NU_NF if NU_CLR(f,NU_S4[f][1],1)]
NU_PAIR_ALL=[r['pair'] for f in NU_NF if NU_CL(f) for r in NU_CL(f)['rows']]
NU_NUC_ALL=[r['nucleon'] for f in NU_NF if NU_CL(f) for r in NU_CL(f)['rows']]
NU_AV_ALL=[x['av'] for f in NU_NF for x in NU_NF[f]['drops']]
NU_PEAKS=[x['peak'] for f in NU_NF for x in NU_NF[f]['drops'] if x.get('peak') and x['well']['trusted']]
NU_DZ=NU['dirac']
# the well's bottom: ours, and the 4D cases worth showing; which are inside the model's domain
def NU_W(f,s,b): return next((x['well'] for x in NU_NF[f]['drops'] if abs(x['s']-s)<1e-9 and x['b']==b),None)
def NU_wr(lab,w,dd=4): return f"<tr><td>{lab}</td><td>{w['rho0']:.3f}</td><td>{w['spacing']:.2f}</td><td>−{-w['E']:.0f}</td><td>{w['T']:.0f}</td><td>−{-w['V']:.0f}</td><td>{w['K']:,.0f}</td><td>{w['cs']:.2f} c</td><td>{w['bind']:.2f}</td></tr>"
NU_wellrows=''.join(NU_wr(f"ours, {NU_FN[f]}",NU_NF[f]['oursWell']) for f in NU_NF)+''.join(NU_wr(f"4D {NU_FN[f]}, {'bottom' if s==NU_S4[f][0] else 'as ours'}, {b} fm"+('' if NU_W(f,s,b)['trusted'] else ' <span class="dim">(past the model)</span>'),NU_W(f,s,b)) for f in NU_NF for s in NU_S4[f][:2] for b in (1.4,1.0))
NU_TRUSTED=[x['well'] for f in NU_NF for x in NU_NF[f]['drops'] if x['well']['trusted']]
NU_NTRUST=len(NU_TRUSTED); NU_TRUST_LO=min(-w['E'] for w in NU_TRUSTED); NU_TRUST_HI=max(-w['E'] for w in NU_TRUSTED)
NU_SPACING_LO=min(w['spacing'] for w in NU_TRUSTED); NU_SPACING_HI=max(w['spacing'] for w in NU_TRUSTED)
# the shallowest trusted well against helium-4 at the same force, strength and range
NU_TR=[(f,x) for f in NU_NF for x in NU_NF[f]['drops'] if x['well']['trusted']]
NU_STIFF=sum(w['K']/-w['E'] for w in NU_TRUSTED)/len(NU_TRUSTED); NU_STIFF3=sum(NU_NF[f]['oursWell']['K']/-NU_NF[f]['oursWell']['E'] for f in NU_NF)/len(NU_NF)
NU_RATIO=min((-x['well']['E'])/NU_PN(f,4,x['s'],str(x['b'])) for f,x in NU_TR if NU_PN(f,4,x['s'],str(x['b'])))

# the helium-4 ladder: N helium-4s by Monte Carlo on the supersymmetric pair potential
NU_LADM={2:(7.062,-0.092,'beryllium-8'),3:(7.680,7.367,'carbon-12'),4:(7.976,7.162,'oxygen-16'),5:(8.032,4.730,'neon-20'),6:(8.261,9.316,'magnesium-24')}  # measured: binding per nucleon, helium-4 capture energy
def NU_LAD(f,d,s): return {x['N']:x['E'] for x in NU_NF[f].get('ladder') or [] if x['d']==d and abs(x['s']-s)<1e-9}
def NU_Q(f,d,s): L=NU_LAD(f,d,s); return {N:(L[N-1] if N>2 else 0)-L[N] for N in L if N==2 or N-1 in L}
def NU_BA(f,d,s): L=NU_LAD(f,d,s); B=-NU_HE(f,d,s)['E']; return {N:(N*B-L[N])/(4*N) for N in L}
def NU_q(x,bold=False): return '—' if x is None else (f'<b>{x:.0f}</b>' if bold else (f'{x:.1f}' if abs(x)<10 else f'{x:.0f}'))
def NU_ladours():
  out=f"<tr><td>measured</td>{''.join(f'<td>{NU_LADM[N][1]:.1f}</td>' for N in range(2,7))}</tr>"
  for f in NU_NF: q=NU_Q(f,3,1); out+=f"<tr><td>{NU_FN[f]}</td>{''.join(f'<td>{NU_q(q.get(N))}</td>' for N in range(2,7))}</tr>"
  return out
NU_LBL=['bottom','as ours','top']
def NU_lad4(f):
  out=''
  for i,s in enumerate(NU_S4[f]):
    q=NU_Q(f,4,s); B=-NU_HE(f,4,s)['E']; ba=NU_BA(f,4,s); top=max(ba) if ba else None
    tw=[x['well'] for x in NU_DR(f,s) if x['well']['trusted']]; bulk=f"{min(-w['E'] for w in tw):.0f}" + (f"–{max(-w['E'] for w in tw):.0f}" if len(tw)>1 else '') if tw else '—'
    out+=f"<tr><td>{NU_FN[f]}, {NU_LBL[i]}</td><td>{B:.0f}</td>{''.join(f'<td>{NU_q(q.get(N),q.get(N,0)>B)}</td>' for N in range(2,9))}<td>{'—' if top is None else f'{ba[top]:.0f} (mass {4*top})'}</td><td>{bulk}</td></tr>"
  return out
NU_Q4=[q for f in NU_NF for s in NU_S4[f] for q in NU_Q(f,4,s).values()]
NU_Q4_ASOURS=[NU_Q(f,4,NU_S4[f][1]) for f in NU_NF]
# the first rung (counting from beryllium-8) at which a capture releases more than a helium-4's own binding
def NU_DISSOLVE(f,s): B=-NU_HE(f,4,s)['E']; q=NU_Q(f,4,s); return next((N for N in sorted(q) if q[N]>B),None)
NU_DIS=[NU_DISSOLVE(f,s) for f in NU_NF for s in NU_S4[f]]
NU_RG=NU.get('rungs') or []
def NU_ORD(n): return {1:'first',2:'second',3:'third',4:'fourth',5:'fifth',6:'sixth',7:'seventh',8:'eighth'}.get(n,f'{n}th')
def NU_rungrow(r): return f"<tr><td>{r['Z']} → {r['Z']+2}</td><td>{r['ours']/1e9:.2f}</td><td>{r['d4']/1e9:.2f}</td><td>{r['d4']/r['ours']:.2f}</td></tr>"
NU_RG_SHOW=[r for r in NU_RG if r['Z'] in (2,4,6,8,10,14,18,22,26)]
NU_RG_RATIO=[r['d4']/r['ours'] for r in NU_RG if r['Z']<=26]

# the first capture: two helium-4s → beryllium-8 + an E2 photon (nuclei.mjs capture)
def NU_CAP(f): return NU_NF[f].get('capture')
def NU_capstates(r):
  pr=r['pts'][0]['parts']; g=min((p['Ef'] for p in pr if p['to']==0),default=None); t=min((p['Ef'] for p in pr if p['to']==2),default=None); return g,t
def NU_caprow(f):
  c=NU_CAP(f); out=''
  if not c: return out
  for i,r in enumerate(c['rows']):
    g,t=NU_capstates(r); out+=f"<tr><td>{NU_FN[f]}, {NU_LBL[i]}</td><td>−{-g:.0f}</td><td>−{-t:.1f}</td><td>{NU_sig2(r['ratio'][1])}–{NU_sig2(r['ratio'][0])}</td><td>{NU_rng(min(r['T'])/1e9,max(r['T'])/1e9)}</td></tr>"
  return out
def NU_rng(a,b): x,y=f'{a:.3f}',f'{b:.3f}'; return x if x==y else f'{x}–{y}'
def NU_sig2(x): from math import log10,floor; e=floor(log10(x))-1; return f'{round(x,-e):,.0f}' if x>=10 else f'{x:.1f}'
NU_CAPROWS=[r for f in NU_NF if NU_CAP(f) for r in NU_CAP(f)['rows']]
NU_CAP_T=[t for r in NU_CAPROWS for t in r['T']]; NU_CAP_R=[x for r in NU_CAPROWS for x in r['ratio']]
NU_CAP_BAR=NU_CAP('MT')['barrierT'] if NU_CAP('MT') else None
NU_2PLUS=[-NU_capstates(r)[1] for r in NU_CAPROWS]; NU_2GAP=[NU_capstates(r)[1]-NU_capstates(r)[0] for r in NU_CAPROWS]
NU_PP=[0.015*x for x in PPR] if 'PPR' in globals() else []

# the same clusters microscopically (js/brink.js; nuclei.mjs brink): Brink's antisymmetrized helium-4s, Minnesota + the
# three-nucleon force of range b, u set on our ⁸Be
NU_BKL=NU.get('brink') or []
def NU_m(x,f='.1f'): return (f'{x:{f}}').replace('-','−')
def NU_mp(x): return NU_m(x,'+.1f')
def NU_m0(x): return NU_m(x,'.0f')
def NU_BK(d,s,b,N):
  x=next((e for e in NU_BKL if e['d']==d and abs(e['s']-s)<1e-9 and abs(e['b']-b)<1e-9 and e['N']==N),None)
  if not x: return None
  return x['E0'] if N==2 else (x['E'].get('480') if x['E'].get('480') is not None else x['E'].get('240'))
def NU_BK2(d,s,b): x=next((e for e in NU_BKL if e['d']==d and abs(e['s']-s)<1e-9 and abs(e['b']-b)<1e-9 and e['N']==2),None); return x['E2'] if x else None
def NU_BKQ(d,s,b): E={N:NU_BK(d,s,b,N) for N in range(2,6)}; return {N:(E[N-1] if N>2 else 0)-E[N] for N in E if E[N] is not None and (N==2 or E.get(N-1) is not None)}
NU_BMEAS={2:0.092,3:-7.275,4:-14.437,5:-19.167}
def NU_bkours():
  out=f"<tr><td>measured</td>{''.join(f'<td>{NU_mp(NU_BMEAS[N])}</td>' for N in range(2,6))}</tr>"
  L=NU_LAD('MN',3,1); out+=f"<tr><td>cluster ladder (Minnesota)</td>{''.join(f'<td>{NU_mp(L[N])}</td>' if N in L else '<td>—</td>' for N in range(2,6))}</tr>"
  for b in (0.7,1.0,1.4): out+=f"<tr><td>Brink, three-nucleon range {b} fm</td>{''.join('<td>—</td>' if NU_BK(3,1,b,N) is None else f'<td>{NU_mp(NU_BK(3,1,b,N))}</td>' for N in range(2,6))}</tr>"
  return out
def NU_bk4(i,s):
  out=''
  for b in (0.7,1.0,1.4):
    q=NU_BKQ(4,s,b); t=NU_BK2(4,s,b)
    out+=f"<tr><td>{NU_LBL[i]}, {b} fm</td>{''.join(f'<td>{q[N]:.0f}</td>' if N in q else '<td>—</td>' for N in range(2,6))}<td>{'—' if t is None else NU_m(t)}</td></tr>"
  ql=NU_Q('MN',4,s); out+=f"<tr><td>{NU_LBL[i]}, cluster ladder</td>{''.join(f'<td>{ql[N]:.0f}</td>' if N in ql else '<td>—</td>' for N in range(2,6))}<td>—</td></tr>"
  return out
NU_BKQ4=[q for s in NU_S4['MN'] for b in (0.7,1.0,1.4) for q in NU_BKQ(4,s,b).values()]
NU_BK2P=[NU_BK2(4,s,b) for s in NU_S4['MN'] for b in (0.7,1.0,1.4) if NU_BK2(4,s,b) is not None]
NU_BK12=[NU_BK(3,1,b,3) for b in (0.7,1.0,1.4) if NU_BK(3,1,b,3) is not None]; NU_BK16=[NU_BK(3,1,b,4) for b in (0.7,1.0,1.4) if NU_BK(3,1,b,4) is not None]
NU_BKU=sorted({round(e['u'],3) for e in NU_BKL})
NU_BKCONV=max((abs(e['E']['480']-e['E']['240'])/abs(e['E']['480']) for e in NU_BKL if e['N']>2 and e['E'].get('480')),default=0)
NU_BKNE=[NU_BK(3,1,b,4)-NU_BK(3,1,b,5) for b in (0.7,1.0,1.4) if NU_BK(3,1,b,5) is not None and NU_BK(3,1,b,4) is not None]

# the first minutes (js/bbn.js; the bake's grid over η and the clock t₁)
NU_BB=NU.get('bbn') or {}
def NU_BBG(f,s,eta,t1): return next((g for g in NU_BB.get('grid',[]) if g['force']==f and abs(g['s']-s)<1e-9 and abs(g['eta']-eta)/eta<1e-6 and abs(g['t1']-t1)<1e-9),None)
NU_BBCOLS=[(6.1e-10,0.01),(6.1e-10,1.32),(1e-8,0.01),(1e-8,1.32)]
def NU_bbrow(f,i,s):
  g0=NU_BBG(f,s,6.1e-10,1.32)
  if not g0: return ''
  if not (g0['TD']>0) or g0['Y']<1e-3: return f"<tr><td>{NU_FN[f]}, {NU_LBL[i]}</td><td>{g0['B']:.1f}</td><td colspan=4>no deuterium survives: hydrogen only</td></tr>"
  cells=''.join((lambda g: f"<td>{g['Yleft']:.2f} / {g['X5']:.2f}</td>")(NU_BBG(f,s,e,t)) for e,t in NU_BBCOLS)
  return f"<tr><td>{NU_FN[f]}, {NU_LBL[i]}</td><td>{g0['B']:.1f}</td>{cells}</tr>"
NU_BBX8=max((g['X8'] for g in NU_BB.get('grid',[])),default=0); NU_BBX8M=max((g['X8'] for g in NU_BB.get('grid',[]) if abs(g['B']-2.2246)<0.05 and g['eta']<=1.01e-8),default=0)
NU_BBTD=[g['TD'] for g in NU_BB.get('grid',[]) if g['TD']>0 and abs(g['B']-2.2246)<0.05]; NU_BBTT=[g['TD'] for g in NU_BB.get('grid',[]) if g['B']>5]
NU_BBO=NU_BB.get('ours',{})

# mass 5 microscopically (nuclei.mjs mass5)
NU_M5L=NU.get('mass5') or []
def NU_M5(d,s,b,key): x=next((e for e in NU_M5L if e['d']==d and abs(e['s']-s)<1e-9 and abs(e['b']-b)<1e-9),None); return x['states'].get(key) if x else None
def NU_m5cell(v): return '—' if v is None else (f'bound, {NU_m(v)}' if v<0 else 'unbound')
def NU_m5row(lab,d,s):
  vals=[(NU_M5(d,s,b,'1n'),NU_M5(d,s,b,'1p')) for b in (0.7,1.0,1.4)]; vn=[v for v,_ in vals if v is not None]; vp=[v for _,v in vals if v is not None]
  def rng(v): return '—' if not v else ('unbound' if min(v)>=0 else f'bound by {-max(v):.1f}–{-min(v):.1f}')
  allpos=[NU_M5(d,s,b,k) for b in (0.7,1.0,1.4) for k in ('0n','0p','2n','2p')]
  return f"<tr><td>{lab}</td><td>{rng(vn)}</td><td>{rng(vp)}</td><td>{'unbound' if all(x is not None and x>=0 for x in allpos) else 'bound'}</td></tr>"
NU_M5TOP=[NU_M5(4,NU_S4['MN'][2],b,k) for b in (0.7,1.0,1.4) for k in ('1n','1p') if NU_M5(4,NU_S4['MN'][2],b,k) is not None]

# how far stars build (js/burning.js; nuclei.mjs burning): the smallest core, × the Chandrasekhar mass for helium-like
# matter (two nucleons per electron), that lights each stage. Hydrogen's is the whole star's, at 1.17 nucleons per
# electron, converted: M_Ch goes as μe^(−(d+1)/(d−1))
NU_BU=NU.get('burning') or {}
def NU_hconv(d): return (2/1.17)**((d+1)/(d-1))
def NU_burnrows():
  st=NU_BU.get('stages',[]); out=''
  if not st: return out
  nm={'H':'hydrogen (a whole star)','He':'helium: two helium-4s → beryllium-8 (computed)'}
  for x in st:
    lab=nm.get(x['stage']) or f"helium-4 onto element {x['Zfrom']} → {x['Zfrom']+2}"
    f=NU_hconv(4) if x['stage']=='H' else 1
    ms=[min(1,v*f) for v in x['m']]; T=x['T']
    mm=('≈ M_Ch' if min(ms)>0.995 else (f"{ms[0]:.2f}" if abs(ms[0]-ms[1])<0.005 else f"{min(ms):.2f}–{max(ms):.2f}"))
    tt=f"{T[0]/1e9:.3f}" if abs(T[0]-T[1])/T[0]<1e-3 else f"{min(T)/1e9:.3f}–{max(T)/1e9:.3f}"
    out+=f"<tr><td>{lab}</td><td>{tt}</td><td>{mm}</td></tr>"
  return out
NU_BUO=NU_BU.get('ours',{})
NU_BUST={x['stage']:x for x in NU_BU.get('stages',[])}
def NU_bm(k,i=0,f=1): x=NU_BUST.get(k); return min(1,x['m'][i]*f) if x else 0
NU_BUCH=next((x['Zfrom'] for x in NU_BU.get('stages',[]) if x.get('Zfrom') and min(x['m'])>0.995),None)

nuclei=f'''<section id="declared">
  <h3>What was declared, and what it takes</h3>
  <p>The book began by declaring nuclei: heavy point charges, stable up to element 78 (<a href="force.html#contents">chapter 2</a>). That was enough for atoms, which see a nucleus only as its charge. It isn't enough for stars, which make nuclei, or for the question every chapter since has run into: <b>which elements are common?</b> Our world's answer, iron and oxygen and the rest, comes from nuclear physics: which nuclei hold together, and which ones stars can build. Here that physics is worked out for 4D, with every method first checked on our own nuclei.</p>
  <p>The one thing 4D changes is the one the stars chapter met: <b>a head-on meeting carries a barrier</b>, 3/4 · ħ²/2μr², because in four dimensions there's more room to miss. Inside a nucleus, where nucleons sit a femtometre or two apart, it's large. The force between nucleons is taken pinned, as the force between charges is: the same function of distance in both worlds. Two of them are used, of quite different shapes, to show the conclusions don't hang on one: Malfliet and Tjon's (Yukawa terms, a repulsive core that grows without limit) and the Minnesota force (soft Gaussians). Both are fitted to how our nucleons scatter, and both give our deuteron (2.2 MeV).</p>
</section>
<section id="window">
  <h3>The strong force has to be stronger</h3>
  <p><span class="tag computed">computed</span> With our force, <b>4D's deuteron isn't bound</b>: the barrier wins. A star can't start burning hydrogen without one (its first step makes a deuteron), and the universe's first minutes would make nothing at all. Scale the force's attraction by a factor s and ask where things change. Our world sits in a window: the deuteron binds, and the diproton (two protons) doesn't, which would let stars burn explosively fast. 4D has the same window, higher up:</p>
  <table class="sys"><tr><th>force</th><th>our window (s)</th><th>4D's window</th><th>4D's deuteron bound as ours</th></tr>{NU_winrow("MT")}{NU_winrow("MN")}</table>
  <p><b>The 4D strong force must be at least {100*(min(NU_WIN(f,4)["deuteron"] for f in NU_NF)-1):.0f}% stronger than ours</b>, and the two forces put the window in different places ({NU_WIN("MT",4)["deuteron"]:.2f}–{NU_WIN("MT",4)["diproton"]:.2f} and {NU_WIN("MN",4)["deuteron"]:.2f}–{NU_WIN("MN",4)["diproton"]:.2f}): how much stronger depends on the force's shape, and that it must be doesn't. It's a choice made by a requirement, as G is (<a href="stars.html#gscale">chapter 15</a>): that stars can burn.</p>
</section>
<section id="helium">
  <h3>Helium-4</h3>
  <p><span class="tag computed">computed</span> Four nucleons (two protons, two neutrons, spins paired) fill the lowest shell in any dimension, so helium-4 needs no sign changes in its wavefunction, and diffusion Monte Carlo solves it exactly for a given force. The checks: our helium-4, {NU_f1(-NU_HE("MT",3,1)["E"] if NU_HE("MT",3,1) else None)} MeV under Malfliet–Tjon (the published value for it is 31.36) and {NU_f1(-NU_HE("MN",3,1)["E"] if NU_HE("MN",3,1) else None)} under Minnesota (measured: 28.30). Per nucleon, at the bottom of 4D's window, where its deuteron binds as ours, and at the top:</p>
  <table class="sys"><tr><th>MeV per nucleon</th><th>ours</th><th>4D, bottom</th><th>as ours</th><th>top</th></tr>{NU_herow("MT")}{NU_herow("MN")}{NU_herow3("MT")}{NU_herow3("MN")}</table>
  <p class="read">The three-nucleon force is introduced below; its range (0.7 to 1.4 fm) gives the spread. Ours, measured: {NU_HE_OURS:.2f}.</p>
  <p><b>4D's helium-4 holds {min(NU_HE4_OURS_STRENGTH):.0f}–{max(NU_HE4_OURS_STRENGTH):.0f} MeV per nucleon</b> at the strength that binds its deuteron as ours, {min(NU_HE4_OURS_STRENGTH)/NU_HE_OURS:.1f}–{max(NU_HE4_OURS_STRENGTH)/NU_HE_OURS:.1f} times ours, and the two forces agree within about a quarter. Hydrogen burning in a 4D star releases that much more per helium made.</p>
</section>
<section id="crowd">
  <h3>Held by the crowd</h3>
  <p>A nucleus far bigger than helium is mostly inside, where each nucleon is surrounded. Its binding per nucleon tends to that of <b>nuclear matter</b>, an endless uniform sea of nucleons, which can be computed: Brueckner's method, which follows each pair through all its collisions inside the sea, written here for any dimension. <span class="tag computed">computed</span> Its two-nucleon machinery reproduces the deuteron exactly in both worlds. On our world it shows the known flaw of such forces: nuclear matter binds harder the denser it gets, never settling. What settles it in ours is partly three nucleons together. So a three-nucleon repulsion is added, the same function of distance in both worlds, with one strength fitted to our nuclear matter's binding (16 MeV per nucleon). That puts our saturation at {NU_NF["MT"]["fit"]["rho0"]:.3f} and {NU_NF["MN"]["fit"]["rho0"]:.3f} nucleons per fm³ (measured 0.16), and moves our helium-4 by about a MeV. <span class="tag choice">a choice</span> Its range (0.7 to 1.4 fm) isn't fixed by our world, and sets how it carries into 4D: it's the uncertainty below.</p>
  <table class="sys"><tr><th>MeV per nucleon</th><th>ours saturates at (fm⁻³)</th><th>4D, bottom</th><th>as ours</th><th>top</th></tr>{NU_matrow("MT")}{NU_matrow("MN")}</table>
  <p>Read as it stands, 4D nuclear matter binds {min(NU_AV_ALL):.0f} to {max(NU_AV_ALL):.0f} MeV per nucleon, against our 16. <b>Most of that range is past what this model can be trusted with.</b> It treats nucleons as slow particles meeting through a fixed force, which needs them slow, their binding small against their own mass, and the matter's sound slower than light. The well's bottom, with ours as the check:</p>
  <table class="sys"><tr><th></th><th>density (fm⁻ᵈ)</th><th>spacing (fm)</th><th>MeV per nucleon</th><th>kinetic</th><th>potential</th><th>bulk modulus (MeV)</th><th>sound</th><th>binding ÷ mass</th></tr>{NU_wellrows}</table>
  <p class="read">Ours, the check: the bulk modulus comes out {NU_NF["MT"]["oursWell"]["K"]:.0f} and {NU_NF["MN"]["oursWell"]["K"]:.0f} MeV, measured 230 ± 30, though nothing was fitted to it. Sound is √(K/d²m). Shown for 4D: each force at its window's bottom and where its deuteron binds as ours, three-nucleon force of range 1.4 and 1.0 fm. Of the 18 wells, {NU_NTRUST} have sound slower than c/2 and a minimum the scan resolves; the rest reach 0.55–1.2 c.</p>
  <p><span class="tag computed">computed</span> <b>Where the model holds, 4D nuclear matter binds {NU_TRUST_LO:.0f} to {NU_TRUST_HI:.0f} MeV per nucleon</b>, four to six times ours: a coherent liquid, about twice as stiff for its binding as ours (bulk modulus over binding {NU_STIFF:.0f}, ours {NU_STIFF3:.0f}), its nucleons {NU_SPACING_LO:.1f}–{NU_SPACING_HI:.1f} fm apart, moving at four tenths of light. Deeper wells, with the shorter-ranged three-nucleon force or the stronger nuclear force, need relativistic nuclear theory, which binds less at high density, so read them as upper bounds. It's the gases chapter's discovery again (<a href="gas.html#far">chapter 13</a>): in four dimensions more neighbours fit within reach of the force, so <b>matter is held by the crowd</b>. Helium-4 has only four nucleons, and can't use it. Even the shallowest trusted well beats helium-4 at the same strength and range by {NU_RATIO:.1f} times per nucleon (ours: 16 against 7).</p>
</section>
<section id="past">
  <h3>Past helium</h3>
  <p>That says the valley is deep. It doesn't say stars can reach it: the first steps past helium could be uphill. Ours are. Nothing of mass 5 or 8 holds together in our world, and our stars cross that gap only by the triple-alpha reaction, three helium nuclei meeting almost at once and caught by a lucky level in carbon-12.</p>
  <p><span class="tag open">tried, failed</span> Monte Carlo past helium needs a guess at where the wavefunction changes sign, and with these forces the guess fails on our own nuclei: helium-6, beryllium-8 and carbon-12 come out at 22, 31 and 0 MeV against the measured 29, 56 and 92. Nothing 4D is claimed from it.</p>
  <p><span class="tag computed">computed</span> <span class="tag choice">one calibration</span> What works is to treat light nuclei as what they are, clusters of helium-4s. Two helium-4s meet through the nucleon force spread over both, and the Pauli principle keeps their relative motion out of the states that would crowd a fifth nucleon into the lowest shell (Saito's orthogonality; the count is the same in any dimension). One factor λ on that folding is set so that our beryllium-8 sits where it does, just unbound. It comes out 1.9 under either force: almost exactly 2, which is what the half of the force that exchanges nucleons should add. Carried to 4D, with each world's helium-4 at the size the Monte Carlo gives it, two helium-4s bind by (MeV; in brackets, λ cut by a fifth and raised by a quarter):</p>
  <table class="sys"><tr><th>two helium-4s</th><th>4D, bottom</th><th>as ours</th><th>top</th></tr>{NU_clrow("MT","pair")}{NU_clrow("MN","pair")}</table>
  <p><b>4D's beryllium-8 is bound</b>, in every case, by {(min(-x for x in NU_PAIR_ALL)) if NU_PAIR_ALL else 0:.1f} to {(max(-x for x in NU_PAIR_ALL)) if NU_PAIR_ALL else 0:.0f} MeV ({min(NU_PAIR_OURS) if NU_PAIR_OURS else 0:.0f}–{max(NU_PAIR_OURS) if NU_PAIR_OURS else 0:.0f} where the deuteron binds as ours). <b>There's no gap at mass 8</b>: two helium-4s can end bound, with no third needed and no lucky level. That opens the route; it doesn't say how fast it runs. Two identical spinless helium-4s can't shed their energy as the simplest kind of light (a dipole photon), so the capture has to go by a slower one, as our own helium-4 captures onto carbon and oxygen do (below). A nucleon on a helium-4 is the weaker result, because the same model needs λ of 4–5 to place our helium-5, standing in for a spin–orbit force it doesn't have:</p>
  <table class="sys"><tr><th>a neutron on helium-4</th><th>4D, bottom</th><th>as ours</th><th>top</th></tr>{NU_clrow("MT","nucleon")}{NU_clrow("MN","nucleon")}</table>
  <p>At the calibrated λ it binds everywhere, and cut by a fifth it fails in {sum(1 for x in NU_NUC_ALL if x is None or x>=-0.01)} of the {len(NU_NUC_ALL)} cases. But a λ of 4–5, twice the natural value, is a factor doing a missing force's work, and the microscopic calculation below overturns it: <b>mass 5 is unbound in 4D</b> except at the window's top, so 4D keeps that one of our two gaps. <span class="tag follows">rough</span> Where binding peaks: a liquid drop built on the computed matter, its surface borrowed from ours, puts the most bound nucleus, where the model holds, at mass {min(p["A"] for p in NU_PEAKS) if NU_PEAKS else 0} to {max(p["A"] for p in NU_PEAKS) if NU_PEAKS else 0} (element {min(p["Z"] for p in NU_PEAKS) if NU_PEAKS else 0} to {max(p["Z"] for p in NU_PEAKS) if NU_PEAKS else 0}). Rough, with a surface term borrowed from ours, but far past iron's 56 every way: past the 78 elements solved here, yet within where an atom can still hold its electrons (below).</p>
</section>
<section id="ladder">
  <h3>The ladder, helium-4 by helium-4</h3>
  <p><span class="tag computed">computed</span> <span class="tag choice">two-body only</span> With beryllium-8 bound, the next question is the whole ladder: carbon is three helium-4s, oxygen four, pxygen (element 10) five, on up. The two helium-4s' force above becomes a local one by removing the two states the Pauli principle forbids, with Baye's supersymmetric transformation (it keeps every other level exactly; checked to 0.05 MeV at each point used). Helium-4s are identical bosons, so for that force diffusion Monte Carlo is exact for any number of them, with no sign problem. What it leaves out is any force among three helium-4s at once. The check, each helium-4 capture's energy in our world (MeV; positive is downhill):</p>
  <table class="sys"><tr><th>capture</th>{''.join(f'<th>→ {NU_LADM[N][2]}</th>' for N in range(2,7))}</tr>{NU_ladours()}</table>
  <p class="read">Measured: the mass differences. Beryllium-8 is fitted to threshold (the one calibration); everything past it is predicted.</p>
  <p>On ours, two-body forces get every sign right, so every capture is downhill, as measured. They get the sizes small: carbon's capture comes out a few MeV short of its measured 7.4, and the nuclei two to three times underbound. A three-helium-4 attraction fitted to carbon overbinds oxygen threefold and neon sixfold, so none is used. Read the 4D ladder as a conservative test: the forces it leaves out bind ours more, not less. In 4D (capture energy in MeV, element 4 to element 16; bold where it exceeds a helium-4's own binding):</p>
  <table class="sys"><tr><th>force, strength</th><th>helium-4's binding</th><th>→ 4</th><th>→ 6</th><th>→ 8</th><th>→ 10</th><th>→ 12</th><th>→ 14</th><th>→ 16</th><th>per nucleon at the top rung</th><th>nuclear matter, where trusted</th></tr>{NU_lad4("MT")}{NU_lad4("MN")}</table>
  <p><b>Every 4D capture is downhill, in every case, by {min(NU_Q4):.0f} to {max(NU_Q4):.0f} MeV</b> ({min(min(q.values()) for q in NU_Q4_ASOURS):.0f}–{max(max(q.values()) for q in NU_Q4_ASOURS):.0f} where the deuteron binds as ours), against our measured 5 to 9. And each capture releases more than the last: the helium-4s pull harder the more of them there are, because in four dimensions more of them fit within reach. That's the crowd again, at the scale of a nucleus. It also says where the cluster picture ends. By the {NU_ORD(min(x for x in NU_DIS if x))} to {NU_ORD(max(x for x in NU_DIS if x))} helium-4 (counting beryllium-8's two), a capture releases more than a helium-4 is bound by, so the helium-4s can't stay whole inside it. Past carbon or oxygen, a 4D nucleus is a drop of nuclear matter, not a molecule of helium-4s, and the drop is what the crowd section computed. The two agree: at mass 28–32 the ladder's binding per nucleon is still climbing toward the trusted bulk value, below it in every case where both exist.</p>
  <p><b>There is no energy gap anywhere on 4D's ladder.</b> Ours has two, at mass 5 and 8, and stars cross them only by the triple-alpha's luck; 4D's has none to the top of what's computed, and the drop says none after. So <b>energy doesn't stop 4D stars building</b>. What decides how far they get is rates: the electric barrier, how readily each nucleus sheds its energy as light, the levels that make a reaction resonant, and which reactions win the race in the time a star has. Energetically open isn't the same as running.</p>
  <p><span class="tag follows">barrier only</span> One part of that, the barrier, can be estimated now: how hot each rung needs to be for the barrier alone: the temperature at which a helium-4 is captured onto charge Z as often as onto our carbon at 0.2 billion K (where our stars burn helium), with tunnelling through the electric barrier and 4D's centrifugal one (<a href="stars.html#light">chapter 15</a>):</p>
  <table class="sys"><tr><th>charge, before → after</th><th>ours (billion K)</th><th>4D</th><th>4D ÷ ours</th></tr>{''.join(NU_rungrow(r) for r in NU_RG_SHOW)}</table>
  <p class="read">Nuclear radii 1.2 A^(1/3) fm ours and 1.0 A^(1/4) fm 4D; the rate counts tunnelling only, not the levels that make our reactions resonant.</p>
  <p>Each rung needs {min(NU_RG_RATIO):.2f} to {max(NU_RG_RATIO):.2f} times our temperature, rising with charge. This is a barrier-only estimate, not a prediction of what stars make: it assumes every rung sheds its energy as readily as our carbon does. For the first rung that's now computed (next section), and it holds up. Our stars build to iron because, past it, binding falls and burning stops paying. A 4D star's ladder keeps paying far past iron's charge, so what ends it is how fast each capture runs against how hot and how long a star burns. That needs the captures' rates, rung by rung.</p>
</section>
<section id="brink">
  <h3>The same, with the Pauli principle exact</h3>
  <p>The ladder's helium-4s are points with a force between them, and the Pauli principle enters only as states they're forbidden to use. The direct test of that is to build the nuclei from nucleons. <span class="tag computed">computed</span> In Brink's model each helium-4 is four nucleons sharing one Gaussian orbital, and a nucleus is one determinant of all of them, antisymmetrized, so the Pauli principle is exact: nothing removed, no factor fitted per nucleus. Many placements of the helium-4s are superposed, as quantum mechanics allows, and beryllium-8's turning states come out by averaging over orientations. Every integral is a closed Gaussian one in any dimension. The force is Minnesota's, plus this chapter's three-nucleon force at each range (0.7, 1.0, 1.4 fm), with the one number Minnesota leaves free (u, how it acts in odd partial waves, which a lone helium-4 never feels) set to put our beryllium-8 where it is: u = {', '.join(f'{x:.2f}' for x in NU_BKU) if NU_BKU else '—'}. Our nuclei, against free helium-4s (MeV):</p>
  <table class="sys"><tr><th>ours</th><th>beryllium-8</th><th>carbon-12</th><th>oxygen-16</th><th>neon-20</th></tr>{NU_bkours()}</table>
  <p class="read">Measured: mass differences. Beryllium-8 is where u is set. The cluster ladder is the two-body Monte Carlo above.</p>
  <p>Carbon comes out at {NU_m(max(NU_BK12) if NU_BK12 else 0)} to {NU_m(min(NU_BK12) if NU_BK12 else 0)} against the measured −7.3: good. Oxygen comes out at {NU_m0(max(NU_BK16) if NU_BK16 else 0)} to {NU_m0(min(NU_BK16) if NU_BK16 else 0)}, overbound about two to three times. The reason is known: four nucleons in one orbital miss about 8 MeV of a helium-4's binding, which their correlations supply, while oxygen's closed shell suits the model well, so oxygen gains on its helium-4s. <b>The two methods err in opposite directions on ours</b>, the ladder underbinding oxygen and Brink overbinding it, and the measured values lie between them. One thing Brink gets wrong on ours follows from the same bias: oxygen comes out so deep that a fifth helium-4 on it looks {-max(NU_BKNE) if NU_BKNE else 0:.0f} to {-min(NU_BKNE) if NU_BKNE else 0:.0f} MeV uphill (measured: 4.7 downhill), a closed shell's pull overdone. The ladder gets that sign right. In 4D, each capture's energy (MeV), and beryllium-8's spin-2 state:</p>
  <table class="sys"><tr><th>Minnesota, range</th><th>→ 4</th><th>→ 6</th><th>→ 8</th><th>→ 10</th><th>⁸Be's spin-2 state</th></tr>{"".join(NU_bk4(i,s) for i,s in enumerate(NU_S4["MN"]))}</table>
  <p><b>Every 4D capture is downhill under both methods</b>, by {min(NU_BKQ4) if NU_BKQ4 else 0:.0f} to {max(NU_BKQ4) if NU_BKQ4 else 0:.0f} MeV in this one. Where the force is strongest the two agree within about ten percent; lower in the window Brink binds more, as it does ours. So the ladder's conclusion doesn't hang on how it handled the Pauli principle: between two methods that bracket our world, 4D's rungs are downhill all the way to element 10. Beryllium-8's spin-2 state is bound in every case, by {-max(NU_BK2P) if NU_BK2P else 0:.1f} to {-min(NU_BK2P) if NU_BK2P else 0:.0f} MeV, more deeply than the cluster model puts it where it's shallowest, so the first capture's slowest case (next section) is if anything pessimistic. <span class="tag follows">follows</span> Five helium-4s are where 4D's oscillator shells close (4, then 16 nucleons: d = 4 has four p orbitals), as four close ours at oxygen. Element 10, pxygen, is the nucleus that plays oxygen-16's part, so Brink's closed-shell bias would show only past it, where nothing here is computed.</p>
  <p class="read">The model's limits: the Gaussian helium-4 is the one Brink's model always uses, too small a basis to give a helium-4 its correlations; the placements are random, 240 and 480 of them, and the larger basis lowers the energies by a few percent, at most {100*NU_BKCONV:.0f}% in one case, so read the magnitudes to that. The signs don't move.</p>
</section>
<section id="mass5">
  <h3>Mass 5, microscopically</h3>
  <p><span class="tag computed">computed</span> The same method takes one nucleon outside a helium-4: five nucleons in one antisymmetrized determinant, the helium-4's four sharing an orbital and the fifth on its own, so the Pauli principle keeps it out of the helium-4's state without any rule imposed. Projected onto each relative turning (s, p, d waves), against a free nucleon and helium-4 in the same model, with Minnesota's force and nothing set on mass 5 itself (u is still the one beryllium-8 fixed). Bound means below zero (MeV), across the three-nucleon force's ranges:</p>
  <table class="sys"><tr><th>Minnesota</th><th>neutron, p-wave</th><th>proton, p-wave</th><th>s- and d-waves</th></tr>{NU_m5row("ours",3,1)}{"".join(NU_m5row(f"4D, {NU_LBL[i]}",4,s) for i,s in enumerate(NU_S4["MN"]))}</table>
  <p class="read">Unbound states show only as a box's discrete continuum, which falls as the box grows; there's no level below zero to report. No spin–orbit force: a p-state here is the centre of its doublet. In ours that force puts the favoured member about 0.4 MeV below the centre, far short of binding.</p>
  <p>The check: our helium-5 and lithium-5 come out unbound, as they are, though nothing was set on them. <b>4D's mass 5 is unbound too</b>, at the window's bottom and where its deuteron binds as ours, and bound only at the top, by {(-max(NU_M5TOP)) if NU_M5TOP else 0:.0f}–{(-min(NU_M5TOP)) if NU_M5TOP else 0:.0f} MeV. The cluster model's mass 5 (5 to 40 MeV) came from a factor fitted to put our helium-5 at threshold, which in 4D overshoots; reset to the microscopic binding at the top it comes out near 2.8, close to the natural 2 the helium-4 pair found. So 4D keeps one gap of ours, mass 5, and loses the other, mass 8. For stars that changes nothing (helium burns by two helium-4s meeting, above); for the first minutes it changes everything (next).</p>
</section>
<section id="capture">
  <h3>The first capture, and the light it needs</h3>
  <p>Two helium-4s that end bound have to get rid of the energy, and in a star that means light. The simplest light, a dipole photon, is closed to them: they're identical, so their centre of charge sits on their centre of mass and there's no dipole to radiate. Both are spinless, so meeting head-on and landing in beryllium-8's ground state would take a photon carrying no turning at all, which no photon can be. What's left is the next kind, a <b>quadrupole</b> photon. It can carry them from a head-on meeting into a spinning state of beryllium-8 (spin 2), or from a glancing meeting (a d-wave) into the ground state. Our own helium-4 captures onto carbon and oxygen are spinless meeting spinless too, and run partly on exactly this.</p>
  <p><span class="tag computed">computed</span> <b>4D's beryllium-8 has a bound spin-2 state in every case</b>, {min(NU_2PLUS):.1f} to {max(NU_2PLUS):.0f} MeV below two free helium-4s, in the cluster model above with its forbidden d-state removed. It sits {min(NU_2GAP):.0f}–{max(NU_2GAP):.0f} MeV above the ground state, the ground state's turning partner. Ours has one too, 3.0 MeV above threshold and unbound, which both forces put 1.3–1.8 MeV too low, so read the shallowest 4D one as maybe a MeV less bound.</p>
  <p><span class="tag computed">computed</span> How this universe's light carries a quadrupole away: in the lens vacuum (<a href="light.html">chapter 3</a>) a photon of frequency ω carries its energy at ε₀ℓω, and the pinned 1/r fixes the fine-structure constant at e²/(4π²ε₀ℓ), so <b>the lens length ℓ drops out</b> of every rate. A quadrupole radiates at (π/48) α ω⁵ Tr(QQ†), against our α ω⁵ Tr(QQ†)/10: the same power of the frequency and 0.65 of our strength. With the cluster model's states and scattering waves, the capture's nuclear factor S̃ (the cross-section with the electric and 4D barriers taken off, which the barrier-only table above takes to be the same as our carbon capture's), and the temperature at which it runs, per pair, as often as our carbon captures helium-4 at 0.2 billion K:</p>
  <table class="sys"><tr><th>force, strength</th><th>⁸Be ground (MeV)</th><th>its spin-2 state</th><th>nuclear factor ÷ our carbon capture's (E2)</th><th>runs as ours at (billion K)</th></tr>{NU_caprow("MT")}{NU_caprow("MN")}</table>
  <p class="read">Our yardstick, ¹²C(α,γ)¹⁶O at 300 keV: its quadrupole capture to the ground state, 45 keV b (deBoer et al. 2017) to 70 (Shen et al. 2020), for the nuclear factor; the whole reaction, 140 to 162 keV b, for the temperature, since that's what our stars' 0.2 billion K is. Not counted: emission of an electron–positron pair, which in ours adds a few percent to such transitions.</p>
  <p><b>The first capture runs.</b> Its nuclear factor is {NU_sig2(min(NU_CAP_R))} to about {NU_sig2(max(NU_CAP_R))} times our carbon capture's: about half ours where 4D's spin-2 state is barely bound, tens to thousands of times ours elsewhere, because 4D's photon carries tens of MeV and a quadrupole's rate grows as its fifth power. Since the barrier is exponential and this isn't, the temperature moves only a little: <b>{min(NU_CAP_T)/1e9:.3f} to {max(NU_CAP_T)/1e9:.3f} billion K</b>, against the barrier-only {NU_CAP_BAR/1e9:.3f}. <span class="tag follows">rough</span> That's where 4D stars burn hydrogen at all ({min(NU_PP):.3f}–{max(NU_PP):.3f} billion K by the same matching, <a href="stars.html#light">chapter 16</a>). So <b>a 4D star likely burns helium as it makes it</b>, with no separate, hotter helium-burning stage as ours have. That's a per-pair rate set against ours, not a star: how fast a 4D core actually runs each step needs its densities and a 4D stellar model, and the rungs past beryllium-8 need the same calculation each.</p>
</section>
<section id="minutes">
  <h3>The first minutes</h3>
  <p>Before any star, the hot young universe cools through nuclear temperatures for a few minutes, and what it makes then is what the first stars start from. Ours made hydrogen and a quarter helium, and almost nothing else: mass 5 and mass 8 don't hold together, and by the time helium exists the universe is too cool and thin to go round them. 4D has neither gap. <span class="tag computed">computed</span> <span class="tag choice">three choices open</span> The standard first estimate, written for any dimension: photons and baryons in the hot bath, neutrons frozen out and decaying, the deuterium bottleneck (deuterons survive the photons only below a temperature set by their binding, Saha's equation), every neutron left then ending in helium-4, and then the captures computed above, protons onto helium-4 and helium-4 onto helium-4, as the universe cools, using helium up; mass 5's binding from the microscopic calculation above (the folded potential reset to it where it binds). Three things the book hasn't fixed enter as choices: the weak force, taken as ours (neutrons freeze out at 0.8 MeV and live 879 s); η, the baryons per photon (ours 6.1 × 10⁻¹⁰); and the clock, how fast the universe cools, which gravity's law would set. Expanding as ours does, with the rate following radiation's energy density (T⁵ in 4D), the time goes as T^(−5/2), and its scale t₁ (the age at 1 MeV, ours 1.32 s) is left free. The check, ours: the bottleneck breaks at {NU_BBO.get('TD',0):.3f} MeV and leaves {NU_BBO.get('Y',0):.3f} helium by mass (measured 0.245).</p>
  <p>4D at each strength: the deuteron's binding (MeV), then the helium-4 left and the mass-5 nuclei made (mass fractions) for our η and sixteen times it, each with a fast clock (t₁ = 0.01 s) and ours (1.32 s):</p>
  <table class="sys"><tr><th>force, strength</th><th>deuteron</th><th>η ours, fast</th><th>η ours, our clock</th><th>η ×16, fast</th><th>η ×16, our clock</th></tr>{"".join(NU_bbrow(f,i,s) for f in NU_NF for i,s in enumerate(NU_S4[f]))}</table>
  <p class="read">The rest is hydrogen. The window's bottom is where the deuteron starts to bind, so there it holds by almost nothing, and the bottleneck never breaks before the neutrons decay. Helium-4 + helium-4 → beryllium-8 makes at most {100*NU_BBX8M:.2f}% where the deuteron binds as ours and η is within sixteen times ours; only with η about 1,600 times ours (10⁻⁶) does it reach {100*NU_BBX8:.0f}%.</p>
  <p><b>Where the deuteron binds as ours, 4D's first minutes stop at helium, as ours did.</b> The bottleneck breaks at {min(NU_BBTD) if NU_BBTD else 0:.3f}–{max(NU_BBTD) if NU_BBTD else 0:.3f} MeV, much as ours does, every neutron left goes into helium-4, and then nothing more: mass 5 is unbound, so protons can't capture onto it, and two helium-4s meet too rarely in the thinning bath to make more than a trace of beryllium-8. The helium left depends on the clock: a third by mass if the universe cools fast, a few percent if it cools as slowly as ours, because 4D's steeper cooling law gives the neutrons longer to decay. <b>At the window's top it goes past helium</b>: the bottleneck breaks at {min(NU_BBTT) if NU_BBTT else 0:.1f}–{max(NU_BBTT) if NU_BBTT else 0:.1f} MeV, almost as soon as the neutrons freeze out, and with mass 5 bound by 6–8 MeV the protons, three of every four baryons, take much of the helium into it (all of it unless the universe cools fast). At the bottom, hydrogen alone. So 4D's first stars start from hydrogen and helium, as ours, unless its strong force sits near the window's top. <span class="tag open">open</span> What mass 5 does next isn't in this network; the clock waits on gravity's law; and mass 5 is computed without a spin–orbit force.</p>
</section>
<section id="build">
  <h3>How far stars build</h3>
  <p>A star's core runs only as hot as its mass lets it. As it burns out a fuel it contracts and heats, as the virial theorem has it, until its electrons are packed so tightly that their degeneracy holds it up; then it cools. So each core mass has a highest temperature, and a stage whose temperature is above it never lights. Above the Chandrasekhar mass degeneracy can't hold at any density, and the core heats until burning stops paying. <span class="tag computed">computed</span> <span class="tag follows">rough</span> The estimate, in any dimension: the core is the gas polytrope (stars chapter), its centre's pressure balanced by the ions as a hot gas and the electrons as they are at that temperature, relativistic and partly degenerate; its hottest point found over every radius. With masses in units of the Chandrasekhar mass, gravity's strength drops out, which matters here, since G is fixed only by the planets. The check, ours (cores of matter with two nucleons per electron; known values in brackets): hydrogen lights in stars from {NU_BUO.get('H',0)*NU_hconv(3):.2f} of it (0.08 M☉ of 1.44: 0.056), helium in cores from {NU_BUO.get('He',0):.2f} (a helium star lights from about 0.3 M☉: 0.22), carbon from {NU_BUO.get('C',0):.2f} (1.06 M☉: 0.74). Good to about forty percent in mass.</p>
  <p>4D, each stage at its temperature (the first capture computed, the rungs above it barrier-only) and the smallest core that lights it:</p>
  <table class="sys"><tr><th>stage</th><th>billion K</th><th>smallest core (× M_Ch)</th></tr>{NU_burnrows()}</table>
  <p class="read">Malfliet–Tjon and Minnesota together where they differ. A rung's temperature is the barrier-only estimate above, so read the rungs past beryllium-8 as that.</p>
  <p><b>4D stars build in steps by mass, as ours do, but with helium lit almost from the start.</b> Hydrogen lights in stars from {NU_bm('H',0,NU_hconv(4)):.2f}–{NU_bm('H',1,NU_hconv(4)):.2f} of the Chandrasekhar mass, and helium in cores from {NU_bm('He',0):.2f}–{NU_bm('He',1):.2f}: a core about as heavy as the lightest star that burns hydrogen at all, where ours needs one four times as heavy. 4D's helium needs only four to seven times hydrogen's temperature, ours about thirty (two helium-4s meeting, against our triple-alpha's three). So ours has a long band of stars, the red dwarfs, that burn hydrogen for ever and never helium; in 4D that band is narrow, perhaps empty: a star needs only to grow a helium core most of its own mass to light it. Then the ladder, a rung per step in mass: a core too light for carbon ends as beryllium-8, then carbon, oxygen, pxygen (element 10), and so on up, each rung needing a heavier core, until from element {NU_BUCH or '—'} on only cores at the Chandrasekhar mass or above take the next step. Those go further, because in 4D every capture keeps paying far past iron's charge: where they stop is where binding per nucleon peaks, which the liquid drop above puts past element 100 (rough), unless something else ends them first. <span class="tag open">open</span> Which of these get back out into the gas that makes planets, and in what proportion: that's the mass a star of each kind sheds and how it ends, and how many stars of each mass form. Ours return their carbon and nitrogen mostly from the winds of middling stars and their oxygen to iron from the explosions of massive ones.</p>
</section>
<section id="tableend">
  <h3>How far a table can go</h3>
  <p><span class="tag computed">computed</span> A heavy nucleus pulls its innermost electron so hard that, relativistically, the electron's level sinks into the sea of negative energies: past that charge, an atom can't be neutral. Dirac's equation in four dimensions has our radial form with the spin–orbit number moved by the extra direction, and its non-relativistic limit is 4D hydrogen (<a href="hydrogen.html">chapter 6</a>). Round a point nucleus the innermost level fails at Zα = 3/2, element 205 (ours: Zα = 1, element 137). With a nucleus of its real size, solved: <b>ours dives near element {NU_DZ["3"]:.0f}</b> (the literature: 170–173), <b>4D's near element {NU_DZ["4"]:.0f}</b>. So a 4D table could run to about {NU_DZ["4"]:.0f}, and the 78 solved here are not its end: 4D's nuclei, held by the crowd, hold together far past that, and it's the electrons that stop the table.</p>
</section>
<section id="nucnext">
  <h3>What's computed and what's open</h3>
  <p>Computed and checked on ours: the strength window (both forces), helium-4 (exact, both forces), nuclear matter (the deuteron exactly; ours saturating with one fitted strength), helium-4 clusters (one factor calibrated on beryllium-8, near its natural value), the helium-4 ladder (two-body, every sign right on ours), Dirac's limit. Chosen: the force's strength (the window's requirement) and the three-nucleon force's range (the uncertainty band). Rough: where binding peaks, and each rung's burning temperature. <span class="tag open">open</span> <b>Which element is commonest, this world's iron.</b> The ladder settles that the climb is energetically open, every capture downhill. The first capture is computed and runs, by quadrupole light, at the temperatures where 4D stars burn hydrogen, and how far each core mass can climb the ladder is estimated. Still needed: each rung's own capture rate past the first, and what stars of each mass give back to the gas (their winds, how they end, how many of each form), which is what sets the abundances planets are made from. The universe's first minutes are computed as a first estimate, with three choices left open (the weak force, η, the clock): they stop at helium as ours did, because mass 5 is unbound microscopically, except near the window's top. A spin–orbit force for mass 5, and the clock (gravity's law), are open. Which element 10 or 9 is commoner, and so which water fills the oceans, follows from the same burning. Element 10, pxygen, is on the ladder, five helium-4s; element 9 is off it, made only by side reactions, as our fluorine is, thousands of times rarer than oxygen. That leans toward Xater <span class="tag follows">by analogy</span>, not yet computed. Also open: how neutron-rich 4D nuclei can be (4D neutron matter sits at the edge of binding, so the price of extra neutrons is lower than ours), and nuclei past helium solved properly, not as clusters.</p>
</section>
'''
