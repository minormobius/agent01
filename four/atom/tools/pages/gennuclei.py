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
  <p>At the calibrated λ it binds everywhere, so probably no gap at mass 5 either, which would open the universe's first minutes to heavier nuclei than ours made; cut λ by a fifth and it fails in {sum(1 for x in NU_NUC_ALL if x is None or x>=-0.01)} of the {len(NU_NUC_ALL)} cases, at the window's lower end. <span class="tag follows">rough</span> Where binding peaks: a liquid drop built on the computed matter, its surface borrowed from ours, puts the most bound nucleus, where the model holds, at mass {min(p["A"] for p in NU_PEAKS) if NU_PEAKS else 0} to {max(p["A"] for p in NU_PEAKS) if NU_PEAKS else 0} (element {min(p["Z"] for p in NU_PEAKS) if NU_PEAKS else 0} to {max(p["Z"] for p in NU_PEAKS) if NU_PEAKS else 0}). Rough, with a surface term borrowed from ours, but far past iron's 56 every way: past the 78 elements solved here, yet within where an atom can still hold its electrons (below).</p>
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
  <p>Each rung needs {min(NU_RG_RATIO):.2f} to {max(NU_RG_RATIO):.2f} times our temperature, rising with charge. This is a barrier-only estimate, not a prediction of what stars make: it assumes every rung sheds its energy as readily as our carbon does. Our stars build to iron because, past it, binding falls and burning stops paying. A 4D star's ladder keeps paying far past iron's charge, so what ends it is how fast each capture runs against how hot and how long a star burns. That needs the captures' rates, which start below with the first one.</p>
</section>
<section id="tableend">
  <h3>How far a table can go</h3>
  <p><span class="tag computed">computed</span> A heavy nucleus pulls its innermost electron so hard that, relativistically, the electron's level sinks into the sea of negative energies: past that charge, an atom can't be neutral. Dirac's equation in four dimensions has our radial form with the spin–orbit number moved by the extra direction, and its non-relativistic limit is 4D hydrogen (<a href="hydrogen.html">chapter 6</a>). Round a point nucleus the innermost level fails at Zα = 3/2, element 205 (ours: Zα = 1, element 137). With a nucleus of its real size, solved: <b>ours dives near element {NU_DZ["3"]:.0f}</b> (the literature: 170–173), <b>4D's near element {NU_DZ["4"]:.0f}</b>. So a 4D table could run to about {NU_DZ["4"]:.0f}, and the 78 solved here are not its end: 4D's nuclei, held by the crowd, hold together far past that, and it's the electrons that stop the table.</p>
</section>
<section id="nucnext">
  <h3>What's computed and what's open</h3>
  <p>Computed and checked on ours: the strength window (both forces), helium-4 (exact, both forces), nuclear matter (the deuteron exactly; ours saturating with one fitted strength), helium-4 clusters (one factor calibrated on beryllium-8, near its natural value), the helium-4 ladder (two-body, every sign right on ours), Dirac's limit. Chosen: the force's strength (the window's requirement) and the three-nucleon force's range (the uncertainty band). Rough: where binding peaks, and each rung's burning temperature. <span class="tag open">open</span> <b>Which element is commonest, this world's iron.</b> The ladder settles that the climb is energetically open, every capture downhill. Whether it runs needs each capture's rate, starting with the first: two helium-4s can't make beryllium-8 by the simplest light, so how fast they do it by the next is the first number wanted. Then how hot and how long 4D stars burn, stage by stage. The universe's first minutes are open too: they start at the deuteron, whose binding the window sets as ours at its centre, so 4D keeps our deuterium bottleneck, and they need a 4D expansion history, which waits on gravity's law. Which element 10 or 9 is commoner, and so which water fills the oceans, follows from the same burning. Element 10, pxygen, is on the ladder, five helium-4s; element 9 is off it, made only by side reactions, as our fluorine is, thousands of times rarer than oxygen. That leans toward Xater <span class="tag follows">by analogy</span>, not yet computed. Also open: how neutron-rich 4D nuclei can be (4D neutron matter sits at the edge of binding, so the price of extra neutrons is lower than ours), and nuclei past helium solved properly, not as clusters.</p>
</section>
'''
