import math
# ------------------------------------------------------------------ 13 stars (exec'd by genpages.py)
# numbers from js/starsdata.js (tools/stars.mjs, from js/stars.js)
ST=json.loads(subprocess.run(['node','--input-type=module','-e','import { STARS } from "'+ATOM+'js/starsdata.js"; console.log(JSON.stringify(STARS));'],capture_output=True,text=True,check=True).stdout)
SM,SL=ST['models'],ST['lighting']
OR=json.loads(subprocess.run(['node','--input-type=module','-e','import { ORBITS } from "'+ATOM+'js/orbitsdata.js"; console.log(JSON.stringify(ORBITS));'],capture_output=True,text=True,check=True).stdout)
def PL(a2,th): return next(q for q in OR['planets'] if abs(q['a2']-a2)<1e-9 and q['thDeg']==th)
PRE=OR['precession']; PREerr=max(abs(q['measured']/q['formula']-1) for q in PRE)
def arcsec(rad): return rad*206264.8
EARTH=-(3*math.pi/4)*OR['star']['r2']/215**2; MERC=-(3*math.pi/4)*OR['star']['r2']/83**2
TURN=OR['turning']
# the stability map (tools/stability.mjs on the runner, stability-1): two planets for 100,000 orbits, per mass and tilt
STB=json.loads(subprocess.run(['node','--input-type=module','-e','import { STABILITY, RATIOS, ANGLES } from "'+ATOM+'js/stabilitydata.js"; console.log(JSON.stringify({ sets: STABILITY, ratios: RATIOS, angles: ANGLES }));'],capture_output=True,text=True,check=True).stdout)
SRAT,SANG=STB['ratios'],STB['angles']; SORB=STB['sets'][0]['orbits']
def SR(mp,kind,a2,th): return next(r for s in STB['sets'] if abs(s['mp']-mp)<1e-12 and s['kind']==kind for r in s['runs'] if abs(r['a2']-a2)<1e-9 and r['th']==th)
def skept(mp,kind,a2,th): return SR(mp,kind,a2,th)['lost'] is None
def iso_safe(mp): return min(th for th in SANG if th>0 and all(skept(mp,'iso',a2,t) for t in SANG if t>=th for a2 in SRAT))
def iso_emax(mp,th0): return max(SR(mp,'iso',a2,t)['emax'] for t in SANG if t>=th0 for a2 in SRAT)
def line_out(mp):
    ok=[th for th in SANG if th>0 and all(not skept(mp,'line',a2,t) for t in SANG if t>=th for a2 in SRAT)]
    return min(ok) if ok else None
def line_emax(mp,th0): return max(SR(mp,'line',a2,t)['emax'] for t in SANG if t>=th0 for a2 in SRAT if skept(mp,'line',a2,t))
def gladman(mp): c=math.sqrt(3)*(2*mp/3)**(1/3); return (1+c)/(1-c)   # Hill stability, Gladman 1993: Δ > 2√3 mutual Hill radii
def cop_lost(mp): return max(a2 for a2 in SRAT if a2>1 and not skept(mp,'iso',a2,0))
SMASS=[(1e-4,'a tenth of Jupiter'),(1e-3,'Jupiter'),(1e-2,'ten Jupiters')]
assert line_out(1e-2)==SANG[1], "the text says every tilted pair at ten Jupiters was thrown out"
def scell(mp,kind,a2,th):
    r=SR(mp,kind,a2,th); lab=f"radii 1 : {a2:g}, planes {th}° apart: "
    if r['lost'] is not None: return f'<i class="out" title="{lab}thrown out on orbit {r["lost"]:,}">✕</i>'
    a=0.1+0.85*min(1,r['emax']/0.8)
    return f'<i style="background:rgba(111,224,255,{a:.2f})" title="{lab}kept; eccentricity up to {r["emax"]:.2f}, closest {r["dmin"]:.2f}"></i>'
def smap(mp,kind):
    head='<b>a₂</b>'+''.join(f'<b>{th}°</b>' for th in SANG)
    rows=''.join(f'<b>{a2:g}</b>'+''.join(scell(mp,kind,a2,th) for th in SANG) for a2 in SRAT)
    return f'<div class="g">{head}{rows}</div>'
SMAPS='<div class="smaps">'+''.join(f'<div class="smap"><h5>{name}, {"sharing a line (ours)" if kind=="line" else "turned equally (4D)"}</h5>{smap(mp,kind)}</div>' for mp,name in SMASS for kind in ('line','iso'))+'</div>'
SMAPS+='<div class="smapkey"><span><i style="background:rgba(111,224,255,0.10)"></i>circular</span><span><i style="background:rgba(111,224,255,0.53)"></i>eccentricity 0.4</span><span><i style="background:rgba(111,224,255,0.95)"></i>0.8 or more</span><span><i class="out">✕</i>thrown out</span></div>'
TSUN, R_EARTH = 5772, 215 # our Sun's surface temperature, and Earth's distance in Sun radii
LT=json.loads(subprocess.run(['node','--input-type=module','-e','import * as O from "'+ATOM+'js/orbits.js"; console.log(JSON.stringify({ a4: O.absorbShare(4), t3: O.planetT(3, 5772, 215), t4: O.planetT(4, 5772, 215), r4: O.radiusFor(4, 5772, O.planetT(3, 5772, 215)), b3: (373 / 273) ** (-1 / O.tempPower(3)), b4: (373 / 273) ** (-1 / O.tempPower(4)) }));'],capture_output=True,text=True,check=True).stdout)
ABS4, T3E, T4E, R4WARM, BAND3, BAND4 = LT['a4'], LT['t3'], LT['t4'], LT['r4'], LT['b3'], LT['b4']
# the nebulae (js/nebuladata.js, tools/nebula.mjs on the runner) and how a random spin's two rates compare (js/nebula.js)
NB=json.loads(subprocess.run(['node','--input-type=module','-e','import { NEBULA } from "'+ATOM+'js/nebuladata.js"; import { randomSpinRatios } from "'+ATOM+'js/nebula.js"; const q = randomSpinRatios(100000); console.log(JSON.stringify({ runs: NEBULA.map(({ snap, ...r }) => r), med: q[q.length >> 1], q1: q[q.length >> 2], q3: q[(3 * q.length) >> 2], above9: q.filter((x) => x > 0.9).length / q.length }));'],capture_output=True,text=True,check=True).stdout)
def NR(name): return next(r for r in NB['runs'] if r['name']==name)
def NFLAT(name): return NR(name)['series'][-1][1]
def NAT(name,t): return min(NR(name)['series'],key=lambda q:abs(q[0]-t))[1]
# the slow alignment's end: each long two-rate run's "minus" (series[3]) at its end and at t = 150, against the cloud's
# own right-to-left ratio (1 − q)/(1 + q)
def NMIN(name,t=None): sr=NR(name)['series']; return (sr[-1] if t is None else min(sr,key=lambda q:abs(q[0]-t)))[3]
NMQ=[(q,[NMIN(f'd4_a1_{q}_n10000_T500_s{k}') for k in ((1,2) if q=='0.5' else (1,))]) for q in ('0.25','0.5','0.75')]
NMDRIFT=max(abs(NMIN(f'd4_a1_{q}_n10000_T500_s1')-NMIN(f'd4_a1_{q}_n10000_T500_s1',150)) for q in ('0.25','0.5','0.75'))
NQ=[(q, NFLAT(f'd4_a1_{q}_n30000_T40_s1')) for q in ('0.25','0.5','0.75','0.9')]
NP=sum(math.log(f)*math.log(float(q)) for q,f in NQ)/sum(math.log(float(q))**2 for q,_ in NQ) # flatness ≈ ratio^p, least squares through 1
NHALF=[NFLAT(n) for n in ('d4_a1_0.5_n30000_T40_s1','d4_a1_0.5_n30000_T40_s2','d4_a1_0.5_n30000_T40_s1_e1','d4_a1_0.5_n30000_T40_s1_e0.5_g0.3')]+[NAT('d4_a1_0.5_n60000_T40_s1',NR('d4_a1_0.5_n60000_T40_s1')['t'])]
def EW(d,gam,k): return 1-k/(d*(gam-1))
def frac(x):
    for den in (1,2,3,4,6,8):
        if abs(x*den-round(x*den))<1e-9: return str(round(x*den)) if den==1 else f"{round(x*den)}/{den}"
    return f"{x:.3f}"
def ewcell(v): return '<b>bound</b>, E = '+frac(v)+' W' if v>1e-9 else ('<b>marginal</b>, E = 0' if abs(v)<1e-9 else '<b>flies apart</b>')
rowsEW=''.join(f'<tr><td class="d{d}">{name}</td><td>{frac(1+k/d)}</td><td>{ewcell(EW(d,(d+2)/d,k))}</td><td>{ewcell(EW(d,(d+1)/d,k))}</td></tr>' for name,d,k in [("ours (Newton, 1/r)",3,1),("4D, Gauss's law (1/r²)",4,2),("4D, pinned at 1/r",4,1)])
PO=dict(SM['pinned']['outer'])
def outerAt(x): return min(SM['pinned']['outer'],key=lambda q:abs(q[0]-x))[1]
PPR=[m['ratio'] for m in SL['match']['pp']]
DEF=[m['deficit'] for m in SL['match']['pp']]
gravity=f'''<section id="gravity">
  <h3>Gravity's routes</h3>
  <p><a href="force.html">Chapter 1</a> pinned the force between charges at 1/r and left gravity open. Gravity hardly matters to atoms, but it makes the stars and holds the planets. Its problem is the same as charge's. A field obeying Gauss's law in four dimensions falls as 1/r², and for 1/r we need a propagator of 1/k³. So the same forks appear (<a href="force.html#maxwell">charge's, for comparison</a>), with gravity's own twists. Gravity pulls on everything alike, it's nonlinear in our world already, and it has waves and black holes of its own.</p>
  <div class="routes">
    <div class="route"><h5>1 · Keep 4D gravity as it is: Gauss's law, 1/r²</h5><p>The four-dimensional version of Einstein's gravity, whose slow, weak limit is 1/r². It keeps everything: locality, relativity, the equivalence principle, waves at c.</p><p class="cost">costs: no stable orbit (below), and a star of gas is exactly marginal (<a href="stars.html#hold">chapter 15</a>). Stiff bodies like rock could hold themselves together, but nothing would orbit anything. No solar systems.</p></div>
    <div class="route"><h5>2 · Keep relativity, give up locality: a graviton with □^(3/2)</h5><p>As for charge, a fractional power of the wave operator gives 1/r statics and keeps relativity.</p><p class="cost">costs: negative probabilities, by the same unitarity bound as charge's route 2.</p></div>
    <div class="route"><h5>3 · A dispersive vacuum for gravity</h5><p>Give gravity's vacuum a response that grows with wavenumber, as charge's route 3 does.</p><p class="cost">costs: gravitational waves disperse with no speed limit. Long waves outrun short ones without bound.</p></div>
    <div class="route"><h5>4 · Give up superposition: a nonlinear law</h5><p>Make gravity's Gauss law nonlinear, ∇·(|g|^(1/2) g) ∝ ρ in 4D, the kind of law Bekenstein and Milgrom wrote for our galaxies. A point mass then pulls as 1/r. Gravity is already nonlinear in our world, though not in its weak, everyday limit. This law keeps locality, and in our world such laws have been given relativistic completions.</p><p class="cost">costs: masses don't add. A body's pull grows as its mass to the 2/3 power, so two stars together pull less than twice one, and a planet's motion feels the galaxy it sits in. In exchange the divergence theorem still holds: <b>the shell theorem survives</b>. A round star acts as a point, its outer layers don't press inward, and orbits round it are exactly Kepler's.</p></div>
    <div class="route"><h5>5 · A small fourth dimension, for gravity only</h5><p>Let gravity see three dimensions while matter sees four.</p><p class="cost">costs: coherence. Gravity pulls on all energy, including motion along w, so it can't ignore a dimension that matter moves in. This route breaks the premise.</p></div>
    <div class="route chosen"><h5>6 · The lens, as for charge (assumed from here on)</h5><p>Gravity's static pull seen through the same kind of lens, a 1/k³ kernel, so 1/r between masses. Everything still falls alike, and masses add. Gravity's waves can stay as 4D Einstein's.</p><p class="cost">we'd pay: relativity for gravity's pull, an absolute "now" for gravity as for charge, and no black holes as Einstein's are defined. No shell theorem either: a star's outer layers press inward, and orbits round a star slowly precess.</p></div>
  </div>
  <p><b>Routes 4 and 6 are the real choice, and they predict different skies.</b> Under the lens, orbits round a star precess and masses add. Under the nonlinear law, orbits close exactly but a cluster of stars pulls less than its parts. Both give bound stars, because both make a star's gravitational energy scale as 1/R. The book assumes the lens from here on, for its symmetry with charge, and marks where route 4 would differ. The choice is open.</p>
</section>
<section id="kepler">
  <h3>Orbits under each law <span class="tag computed">computed</span></h3>
  <p>What the choice does to orbits decides whether there are planets at all. <b>Under the pinned 1/r, two bodies orbit as Kepler said</b>. A central pull keeps an orbit in one plane, even in 4D, and a 1/r pull closes it into an ellipse in any number of dimensions (<a href="motion.html">chapter 3</a>). Under Gauss's 1/r² no orbit is stable. Give a circular orbit 1% more speed and it runs away:</p>
  <canvas class="chart" id="cOrbitNudge"></canvas>
  <p class="read" id="kOrbitNudge"></p>
</section>
'''
stars=f'''<section id="hold">
  <h3>Does a star hold together?</h3>
  <p>A star is a ball of gas holding itself up against its own weight. Two things decide whether it can. First, it must be <b>bound</b>: its total energy negative. Second, it must be stable: squeezed, its pressure must rise faster than its weight. Both come from the virial theorem. For gravity falling as 1/r^k in d dimensions, a gas with heat-capacity ratio γ has total energy</p>
  <p class="eq">E = W (1 − k / d(γ − 1)),&nbsp; W the gravitational energy (negative)</p>
  <p>so a star is bound only if <b>γ &gt; 1 + k/d</b>. A bound star does something essential: losing energy makes it <i>hotter</i>, since it contracts and its gas speeds up. That's how a cloud heats itself to ignition, and how a burning star regulates itself. A monatomic gas has γ = (d + 2)/d (5/3 ours, 3/2 in 4D, from <a href="gas.html">chapter 12</a>). A gas of light has γ = (d + 1)/d.</p>
  <table class="verdict"><tr><th>gravity</th><th>γ must exceed</th><th>a star of gas</th><th>a star of light</th></tr>{rowsEW}</table>
  <p><b>Under Gauss's law a 4D star is exactly marginal, as the atom was.</b> Its gas's γ = 3/2 is the critical value: squeezing costs just what gravity pays, at every size. <b>Pinned at 1/r, a 4D star of gas is bound with E = W/2, exactly as ours is.</b> It clears its threshold (5/4) by the same factor of two that ours clears 4/3. And in every dimension, under a 1/r pull, a star made of light is exactly marginal. So, as for us, the heaviest stars, held up by their own radiation, live on the edge. 4D would have a maximum stellar mass as we do.</p>
</section>
<section id="solved">
  <h3>A star, solved</h3>
  <p>Those are energies. To see a star, solve it: the gas's pressure must balance its weight at every radius, with the weight computed from all of the star. Here that's done by the self-consistent field: guess the density, compute gravity from it, set the density the gas would have in that gravity, repeat. Each star is the simplest kind, its gas on one adiabat (a polytrope), radius 1 and central density 1. The checks are ours: the solver reproduces the textbook Lane–Emden stars, the n = 1 star's sin(πr)/πr profile and the central-to-mean densities of 5.99 and 54.18. The virial theorem holds to {max(abs(m['virial']) for m in SM.values()):.0e} or better.</p>
  <canvas class="chart tall" id="cStarProfile"></canvas>
  <p class="read" id="kStarProfile"></p>
  <p>Our monatomic star is {SM['ours']['centralOverMean']:.1f} times as dense at its centre as on average. The 4D one, pinned, is <b>{SM['pinned']['centralOverMean']:.1f}</b> times. A 4D star is more centrally concentrated, partly because 4D's volume crowds out toward the surface (as r³) and partly for the next reason. Under Gauss's law the same star is {SM['gauss']['centralOverMean']:.0f} times as dense at its centre, but that one is the marginal star, with E = 0.</p>
  <h4>No shell theorem: the outer layers press inward</h4>
  <p>In our world the mass outside any radius pulls on nothing inside it (Newton's shell theorem), so a layer feels only the mass beneath it. Under the pinned 1/r there's no shell theorem (<a href="../fields/#neutral">the same reason a neutral atom isn't invisible</a>). Inside a shell, gravity points toward the centre. So the outer layers add to the squeeze:</p>
  <canvas class="chart" id="cStarOuter"></canvas>
  <p class="read" id="kStarOuter"></p>
  <p>At a quarter of the way out, <b>{outerAt(0.244)*100:.0f}% of the inward pull comes from the mass outside</b>. Halfway out, {outerAt(0.484)*100:.0f}%. In ours, exactly none at any radius. 4D stars are squeezed from both sides. Outside, a star isn't quite a point mass either: a small correction, falling as 1/r³, makes planets' orbits slowly precess. They stay stable: the main pull is still 1/r, whose orbits are Kepler's closed ellipses (<a href="motion.html">chapter 3</a>).</p>
</section>
<section id="light">
  <h3>Lighting it</h3>
  <p>A star burns when its nuclei tunnel through their mutual repulsion and fuse. Inside a star everything is ionized, and between two bare nuclei the pinned force is exactly ours: the same 1/r barrier. What 4D changes is subtler. In four dimensions even a head-on (s-wave) meeting carries a built-in centrifugal barrier, 3/4 · ħ²/2μr², because there's more room to miss. Near the nucleus it's large: at 2 fm it's about ten times the electric barrier between two protons. Tunnelling through both, in the WKB approximation with Langer's correction (the integral checked against the textbook Gamow factor), at equal nuclear physics:</p>
  <canvas class="chart" id="cStarLight"></canvas>
  <p class="read" id="kStarLight"></p>
  <p><b>At the same temperature, 4D nuclei tunnel through {min(DEF):.0f} to {max(DEF):.0f} times less often</b> than ours (protons, nuclei 1 to 4 fm across), and {SL['match']['ddDeficit']:.0f} times less often for deuterium. A star makes up a shortfall the way ours do, by contracting until its core burns fast enough: hotter, denser, or both. If temperature alone made it up, the core would run {min(PPR):.1f} to {max(PPR):.1f} times hotter, around 30 million kelvin, which is the dotted line. That's an upper end, not a prediction. A 4D rate per pair of nuclei carries one more length in its units than ours, so "as fast as ours" only means something once a 4D star's density is known, and that needs gravity's strength and 4D's nuclear physics. The barrier deficit is the robust number.</p>
  <p class="read"><b>Is 4D just hotter because there's another direction to put energy into?</b> No. Each direction of motion holds the same kT/2 at a given temperature, so a 4D nucleus moves faster than ours at the same temperature, not slower. More of them are fast, too: the energy spread carries an extra √E. But the 4D cross-section's geometry cancels that weight exactly, in every dimension. What's left is the barrier, and the deficit above is all barrier.</p>
</section>
<section id="masses">
  <h3>How big, how small</h3>
  <p>A contracting ball heats until its electrons, squeezed, resist by Pauli's principle alone. That caps its temperature, so the smallest star that lights holds about α_G^(−4/3) (kT_burn / m_e c²)^(2/3) protons in 4D, where α_G = G m_p²/ħc measures gravity's strength (pinned, it's again a pure number: about 6 × 10⁻³⁹ in ours). The largest is where light's pressure takes over, about α_G^(−4/3) protons. The dead remnant's limit, where relativistic electrons can no longer hold it up (Chandrasekhar's), lands at the same scale. In ours both carry α_G^(−3/2). So <b>the window of star masses, largest over smallest, is about (m_e c²/kT_burn)^(2/3) in 4D (the power 3/4 in ours), whatever gravity's strength</b>: roughly 30 in 4D with its hotter cores, against roughly 100 in ours by the same rough count (the real one, with all the factors, is 0.08 to 150 solar masses). These are scaling estimates, not solved stars.</p>
</section>
<section id="fuel">
  <h3>The fuel: the weak force, added</h3>
  <p>Our Sun burns hydrogen, and its first step turns a proton into a neutron. That takes the <b>weak force</b>, which chemistry never needs. Without it a star could burn only fuel left from the universe's first minutes (deuterium and other light nuclei, which fuse by the strong force alone), then shine by contracting, for millions of years rather than billions. <b>So the weak force is added to <a href="force.html#contents">the universe's list</a></b>, with its neutrino. It's the first ingredient added for astronomy rather than chemistry. Stars burn hydrogen as ours do, and live long enough for planets to have time.</p>
</section>
<section id="starsnext">
  <h3>What's computed and what's open</h3>
  <p class="read"><span id="orbits"></span><span id="formation"></span>Orbits round a real star, planets, moons and how a nebula flattens are <a href="planets.html">chapter 16</a>; gravity's routes are <a href="gravity.html">chapter 5</a>.</p>
  <p>Computed and checked: the virial bookkeeping for each law, the polytropes (against Lane–Emden), the outer layers' pull, tunnelling through the 4D barrier (against Gamow), and the lighting. Argued from scaling: the mass window. Chosen: the weak force, added. Open: gravity's route (the lens is assumed here; the nonlinear law is the alternative). Open: nuclear physics in 4D (which nuclei exist, their fusion energies and sizes); light's escape from a 4D star (opacity through the lens, and the T⁵ Planck law at its surface), which sets its colour; and stars that age, burn in shells and die.</p>
</section>
'''
planets=f'''<section id="orbits">
  <h3>Orbits round a real star</h3>
  <p>Two point masses under the pinned 1/r orbit as Kepler said (<a href="gravity.html#kepler">chapter 5</a>). A real star is not a point, and real planets are not alone, and in 4D both matter more than in ours.</p>
  <h4>Orbits round a real star precess</h4>
  <p>Without a shell theorem, a round star doesn't pull exactly like a point. Outside it, its pull carries a small correction, −1/r + ⟨r²⟩/8r³, where ⟨r²⟩ is the mean square of where its mass sits ({OR['star']['r2']:.2f} R² for the 4D star solved above). That turns an orbit's closest point backwards by</p>
  <p class="eq">Δϖ = −(3π/4) ⟨r²⟩ / p² per orbit</p>
  <p>(p the orbit's semi-latus rectum, from Landau's formula for a 1/r³ perturbation). Checked by integrating orbits in the solved star's own pull, it agrees to {abs(PRE[0]['measured']/PRE[0]['formula']-1)*100:.1f}% three star radii out, where the next, smaller correction still shows, and to {abs(PRE[-1]['measured']/PRE[-1]['formula']-1)*100:.2f}% at twelve. For a star the Sun's size, an orbit at Earth's distance would turn back {abs(arcsec(EARTH)):.1f} arcseconds per orbit, and one at Mercury's {abs(arcsec(MERC)):.0f}. Mercury's own, from relativity, is about 0.1. It's slow, but an astronomer would find it, and it tells the routes apart: under <a href="#gravity">route 4</a>'s nonlinear law the shell theorem holds and this precession is zero.</p>
  <h4>Planets in different planes barely notice each other</h4>
  <p>In 4D two orbits can lie in completely orthogonal planes, xy and zw, which meet only at the star. Then the two planets' positions are always at right angles, so their distance is √(r₁² + r₂²). For circular orbits that never changes, and neither can tug the other along its orbit. Run with Jupiter-mass planets for 3,000 orbits:</p>
  <table class="verdict"><tr><th>orbit radii</th><th>in the same plane</th><th>in orthogonal planes</th></tr>
    {''.join(f"<tr><td>1 and {a2}</td><td>{('<b>thrown out</b> after '+str(PL(a2,0)['lost'])+' orbits') if PL(a2,0)['lost'] is not None else 'stable, eccentricity up to '+format(PL(a2,0)['emax'],'.3f')}</td><td>{('thrown out after '+str(PL(a2,90)['lost'])) if PL(a2,90)['lost'] is not None else 'stable, eccentricity up to '+format(PL(a2,90)['emax'],'.3f')}</td></tr>" for a2 in (1.7,1.3,1.2,1.1))}
    <tr><td>1 and 1, the same orbit size</td><td>only as trojans, 60° apart (not run)</td><td>{'stable, never closer than '+format(PL(1.0,90)['dmin'],'.2f')+' (√2)' if PL(1.0,90)['lost'] is None else 'thrown out'}</td></tr>
  </table>
  <p>Equal radii is the strangest case. The two planets share a period, so their tugs on each other add up orbit after orbit, and each plane turns all the way round: in the run, planet 1's orbit swung completely into the plane planet 2 had started in, and back, in about 1,500 orbits. The two planes stayed at right angles throughout, and the planets never came closer than √2.</p>
  <p><b>A 4D planetary system can pack its planets far tighter than ours</b>, at nearly the same distance from the star, in different planes. Planes partly turned apart lie in between: at 30°, two planets 5% apart in radius came within {PL(1.05,30)['dmin']:.2f} of each other and still survived 3,000 orbits.</p>
  <p>The planes don't sit still. The planets' pulls turn their planes through 4D, by as much as {PL(1.05,60)['wander']*100:.0f}% of planet 1's orbit swinging out of where it began. But the angle between the two planes holds, the 4D version of how our planets' tilts to one another keep while their nodes slide round:</p>
  <canvas class="chart" id="cOrbitTurn"></canvas>
  <p class="read" id="kOrbitTurn"></p>
  <h4>Days with two rates</h4>
  <p>A planet spins too, and a 4D spin is a turning in a plane, or in two planes at once at two rates (<a href="motion.html">chapter 3</a>). A planet spinning both ways would have a sky that cycles on two clocks, its sunrises returning only when the two line up. Which way real planets spin depends on how they formed and how tides wear them, and that's open.</p>
  <p class="read">Checked here: Kepler's closed orbits in 4D, the precession formula against integration, and the two-planet runs above, 3,000 orbits each. The map below runs {SORB:,}.</p>
  <h4>Which pairs last <span class="tag computed">computed</span></h4>
  <p>3,000 orbits is short against a planetary system's life. So, on the compute runner: two planets on circular orbits, the outer's radius 1 to {SRAT[-1]} times the inner's, their planes turned apart by every angle from 0 to 90°, at three masses, each pair run for {SORB:,} orbits of the inner one. In 4D there are two ways to turn one plane from another. One is the only tilt our planets can have: the planes share a line and tilt about it. The other is 4D's own: the planes turned by the same angle both ways, which at 90° makes them completely orthogonal.</p>
  {SMAPS}
  <p class="read">Each cell is a pair of planets: across, the angle between their planes; down, a₂, the outer orbit's radius over the inner's. Brighter: the more either orbit was stretched (its largest eccentricity, dark for circular). ✕: a planet thrown out. Hover a cell for its numbers.</p>
  <p><b>4D's own tilt keeps planets apart; ours throws them out.</b> Turned equally both ways by {iso_safe(1e-3)}° or more, Jupiter-mass planets stayed nearly circular (eccentricity at most {iso_emax(1e-3,iso_safe(1e-3)):.2f}) at every spacing, even sharing an orbit's size. Ten Jupiters need {iso_safe(1e-2)}°, and completely orthogonal planes kept every pair at every mass (eccentricity at most {max(iso_emax(m,90) for m,_ in SMASS):.2f}). Tilted our way, about a shared line, the same planets fare worse than in one plane: at Jupiter's mass every pair tilted {line_out(1e-3)}° or more was thrown out, at ten Jupiters every tilted pair was, and even at a tenth of Jupiter's the tilt is traded into stretched orbits, eccentricity up to {line_emax(1e-4,30):.2f}.</p>
  <p>In one plane the problem is exactly ours, since the pinned pull is Newton's within a plane, and the runs agree with our world's answer. Hill's criterion, in Gladman's form, guarantees two planets never meet beyond radii in the ratio {gladman(1e-4):.2f}, {gladman(1e-3):.2f} and {gladman(1e-2):.2f} for the three masses. No pair beyond it was lost; the losses stop at {cop_lost(1e-4):g}, {cop_lost(1e-3):g} and {cop_lost(1e-2):g}, inside the guarantee, where (as in ours) a pair can still last a long time.</p>
  <p><b>So a 4D planetary system packs its planets with their planes turned equally both ways</b>, and can pack them far tighter than ours: tilted our way, they'd be thrown out.</p>
</section>
<section id="moons">
  <h3>Moons: one plane is safe <span class="tag computed">computed</span></h3>
  <p>A moon circles its planet while both circle the star. The star's pull is a little stronger on the moon's near side than its far side, and over many orbits that uneven tug can stretch a moon's orbit until it's thrown off. In our world it does this to steeply tilted moons (Kozai's effect): a moon on a polar orbit doesn't last. In 4D there's one plane where the star can't tug at all. The star always lies in the planet's orbital plane, and that plane has exactly one completely orthogonal partner. A moon there is always at right angles to the star, so its distance to the star is √(R² + r²), the same all the way round its orbit: the star pulls it evenly and can't drag its plane.</p>
  <table class="verdict"><tr><th>a moon at a third of its planet's reach, its plane</th><th>its largest eccentricity</th><th>over {150} of the planet's orbits</th></tr>
    <tr><td>the planet's own orbital plane</td><td>{OR['moons']['same']['emax']}</td><td>kept</td></tr>
    <tr><td>sharing a line with it, tilted 60°</td><td>{OR['moons']['line60']['emax']}</td><td>kept, barely</td></tr>
    <tr><td>sharing a line, tilted 90°: our polar moon</td><td>{OR['moons']['line90']['emax']}</td><td><b>lost on orbit {OR['moons']['line90']['lost']}</b></td></tr>
    <tr><td>tilted 45° in both angles</td><td>{OR['moons']['iso45']['emax']}</td><td>kept, its plane swinging right round</td></tr>
    <tr><td><b>completely orthogonal</b></td><td><b>{OR['moons']['ortho']['emax']}</b></td><td><b>kept, its plane never moving</b></td></tr></table>
  <p><b>Every 4D planet has one plane where its moons are safest</b>, the one completely orthogonal to its own orbit, and moons there sit the quietest of all. A planet's moons make an orrery of their own, and its natural plane is the one its planet's orbit leaves free. <a href="../orrery/">The orrery</a> puts these results together: a system whose planes come from the nebula below, spaced by the stability map, its moons in their safe planes, run live.</p>
</section>
<section id="sunlight">
  <h3>Starlight on a planet <span class="tag follows">follows</span></h3>
  <p>Light from a star thins as 1/r³ (<a href="geometry.html#room">chapter 1</a>). A planet catches it over its shadow, which in 4D is a solid ball, and glows it away from its whole surface, a 3-sphere, as T⁵ (<a href="light.html">chapter 3</a>). So a planet's temperature falls as <b>r<sup>−3/5</sup></b> (ours as r<sup>−1/2</sup>), and the share of its surface's worth of light it catches is 2/(3π) = {ABS4:.3f} (ours 1/4).</p>
  <p>For a star as hot at its surface as our Sun ({TSUN} K), a black planet at Earth's distance in star radii ({R_EARTH}) would sit at {T3E:.0f} K in ours and <b>{T4E:.0f} K in 4D</b>; to be as warm as ours it would orbit at {R4WARM:.0f} star radii, less than half as far. And a band of temperatures is narrower in 4D: a liquid that stays liquid over temperatures in the ratio of our water's (373 : 273 K) has orbits in the ratio {BAND3:.2f} in ours and {BAND4:.2f} in 4D. But in 4D more planets can share a band: they can orbit at nearly the same distance in planes turned apart (above). A 4D star's surface temperature isn't known yet: it depends on how light escapes a 4D star, which is open.</p>
</section>
<section id="formation">
  <h3>Does a nebula flatten? <span class="tag computed">computed</span></h3>
  <p>Our planets lie nearly in one plane because the cloud they formed from flattened into a disk. The <a href="geometry.html#combing">geometry chapter</a> gave the reason: gas circling a star covers a sphere, a sphere can't be combed, so the streams cross, collide and settle into one plane. A 3-sphere can be combed, so a 4D cloud needn't flatten. Whether it does is a question for simulation.</p>
  <p>A cloud's spin in 4D is a turning, and a turning can go in two planes at once at two rates (<a href="motion.html">chapter 4</a>). We let rotating clouds of gas fall onto a star and collide: tens of thousands of particles, pulled as 1/r², which is Newton in 3D and the pinned law in 4D, so only the dimension differs. Particles that come close while approaching lose part of their approach speed. That keeps momentum and spin exactly and only takes energy away, which is all a disk needs to form. The same code in 3D is the control.</p>
  <canvas class="chart tall" id="cNebula"></canvas>
  <p class="read" id="kNebula"></p>
  <p class="read">Flatness is the cloud's two smallest extents over its two largest: 1 round, 0 a flat disk. Time in orbits of the cloud's edge over 2π.</p>
  <table class="verdict"><tr><th>the cloud's spin</th><th>how flat it ends</th></tr>
    <tr><td>3D, ours</td><td><b>a disk</b>: {NFLAT('d3_a1_0_n10000_T150_s1'):.2f}</td></tr>
    <tr><td>4D, one plane only</td><td><b>a disk</b>, more slowly: {NFLAT('d4_a1_0_n10000_T150_s1'):.2f}</td></tr>
    {''.join(f"<tr><td>4D, the second plane at {q} of the first's rate</td><td>stops at {f:.2f}</td></tr>" for q,f in NQ)}
    <tr><td>4D, equal rates</td><td><b>stays round</b>: {NFLAT('d4_a1_1_n30000_T40_s1'):.2f}</td></tr></table>
  <p><b>A 4D nebula flattens to a disk only if it spins in one plane.</b> Spinning in both, it thins and then stops, the thicker the closer its two rates: its flatness ends near the ratio of the rates to the power {NP:.2f}. At equal rates it doesn't flatten at all, and every orbit in it runs round one of Hopf's circles. The stop is real, not slowness: run nearly four times longer, the half-rate cloud ends at {NFLAT('d4_a1_0.5_n10000_T150_s1'):.2f}, against {NAT('d4_a1_0.5_n10000_T150_s1',40):.2f} at the shorter runs' end. And it holds up: with a second seed, collisions twice as hard, a start three times hotter and twice the particles (that run stopped two thirds of the way), the half-rate cloud ends between {min(NHALF):.2f} and {max(NHALF):.2f}.</p>
  <p>Which clouds are typical? If a cloud's spin is the sum of many random eddies, its two rates differ: the slower is typically a fifth of the faster (half of all clouds fall between {NB['q1']:.2f} and {NB['q3']:.2f}), and equal rates are rare ({NB['above9']*100:.1f}% within a tenth of equal). <b>So the typical 4D nebula ends neither a disk nor a ball, but a thick lens</b>, about {100*float(NB['med'])**NP:.0f}% as thick as it is wide, and its planets would form in planes spread round one of Hopf's families rather than in one.</p>
  <div class="tiles" id="nebulaTiles"></div>
  <p class="read">Each run's end, 500 of its particles, orbiting the star live. Turn it through w to see a 4D cloud's thickness.</p>
  <p class="read">The gas here has no pressure and no gravity of its own, and the time it takes depends on the collision model, which is why the shapes matter and the times don't. Half or more of the gas ends on the star. Next: how planets grow in a thick nebula.</p>
  <p><b>Where the orbits' second alignment stops</b> <span class="tag computed">computed</span>. After the shape has stopped, the orbits' planes went on lining up in the other half of their turning (the right half, where the cloud turns slower), which no flattening shows. Run to 500 orbits, that stops too: by 150 it has settled, moving under {NMDRIFT:.3f} after. It ends just below the cloud's own ratio of right-half to left-half turning, (1 − q)/(1 + q) for a second plane at q of the first's rate: {', '.join(f"{'/'.join(f'{v:.3f}' for v in vs)} against {(1-float(q))/(1+float(q)):.3f} at q = {q}" for q,vs in NMQ)}. A cloud spinning in one plane only (q = 0) lines up both halves completely ({NMIN('d4_a1_0_n10000_T500_s1'):.3f}), as a flat disk must. So each orbit ends up with nearly the cloud's own mix of left and right turning, a little short of it, and the orbits' planes stay spread round Hopf's family by that much.</p>
</section>
<section id="planetsnext">
  <h3>What's computed and what's open</h3>
  <p>Computed and checked: orbits' precession round a real star (against Landau's formula), two planets in one plane and in planes turned apart, the planes turning while their angle holds, moons in five planes, nebulae against our world's, and the stability map (two planets for 100,000 orbits, over spacings, tilts of both kinds and masses). Follows: starlight on a planet. Open: a 4D star's brightness and colour; how planets grow in a thick nebula; tides; and systems of many planets.</p>
</section>
'''
