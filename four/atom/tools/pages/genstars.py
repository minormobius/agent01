# ------------------------------------------------------------------ 13 stars (exec'd by genpages.py)
# numbers from js/starsdata.js (tools/stars.mjs, from js/stars.js)
ST=json.loads(subprocess.run(['node','--input-type=module','-e','import { STARS } from "'+ATOM+'js/starsdata.js"; console.log(JSON.stringify(STARS));'],capture_output=True,text=True,check=True).stdout)
SM,SL=ST['models'],ST['lighting']
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
stars=f'''<section id="choice">
  <h3>Gravity is still a choice</h3>
  <p>Chapter 1 pinned the force between charges at 1/r and left gravity open. Gravity matters little to atoms. Stars are made by it. Under Gauss's law in 4D gravity would fall as 1/r², and no orbit would be stable. The obvious move is the one already made for charge: <b>gravity through the same kind of lens, pinned at 1/r</b>. That's the assumption of this chapter, set beside Gauss's law throughout. It costs what the lens cost before: gravity would act across space at once, with an absolute "now". There'd be no general relativity, so no black holes as ours are defined, and nothing here leans on them.</p>
</section>
<section id="hold">
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
  <p><b>A 4D core must be about {min(PPR):.1f} to {max(PPR):.1f} times as hot to burn hydrogen as fast as ours at 15 million kelvin</b>, depending on the nuclei's size (1 to 4 fm), and {SL['match']['dd']:.1f} times as hot for deuterium. That's hotter, but not a different regime. Stars contract until they're hot enough, so 4D stars would simply run hotter cores, around 30 million kelvin. It assumes 4D nuclear physics is like ours, which nobody can compute without the strong force in 4D.</p>
</section>
<section id="masses">
  <h3>How big, how small</h3>
  <p>A contracting ball heats until its electrons, squeezed, resist by Pauli's principle alone. That caps its temperature, so the smallest star that lights holds about α_G^(−4/3) (kT_burn / m_e c²)^(2/3) protons in 4D, where α_G = G m_p²/ħc measures gravity's strength (pinned, it's again a pure number: about 6 × 10⁻³⁹ in ours). The largest is where light's pressure takes over, about α_G^(−4/3) protons. The dead remnant's limit, where relativistic electrons can no longer hold it up (Chandrasekhar's), lands at the same scale. In ours both carry α_G^(−3/2). So <b>the window of star masses, largest over smallest, is about (m_e c²/kT_burn)^(2/3) in 4D (the power 3/4 in ours), whatever gravity's strength</b>: roughly 30 in 4D with its hotter cores, against roughly 100 in ours by the same rough count (the real one, with all the factors, is 0.08 to 150 solar masses). These are scaling estimates, not solved stars.</p>
</section>
<section id="fuel">
  <h3>The fuel: a second choice</h3>
  <p>Our Sun burns hydrogen, and its first step turns a proton into a neutron. That takes the <b>weak force</b>, which <a href="force.html#contents">the universe's list</a> leaves out because chemistry never needs it. Without it, a star can't burn bare hydrogen. Two ways forward, and the choice is open:</p>
  <ul>
    <li><b>Add the weak force to the list.</b> Then stars burn hydrogen as ours do, slowly and for billions of years, and the 4D numbers above apply.</li>
    <li><b>Leave it out.</b> Then stars burn only fuel left from the universe's first minutes (deuterium and other light nuclei, which fuse by the strong force alone) and shine by contracting once it's gone. That's millions of years, not billions.</li>
  </ul>
  <p>Long-lived stars, and so planets with time for anything, need the weak force. It would be the first ingredient added for astronomy rather than chemistry.</p>
</section>
<section id="starsnext">
  <h3>What's computed and what's open</h3>
  <p>Computed and checked: the virial bookkeeping for each law, the polytropes (against Lane–Emden), the outer layers' pull, and tunnelling through the 4D barrier (against Gamow). Argued from scaling: the mass window. Choices: gravity's pin, and the weak force. Open: nuclear physics in 4D (which nuclei exist, their fusion energies and sizes); light's escape from a 4D star (opacity through the lens, and the T⁵ Planck law at its surface), which sets its colour; and stars that age, burn in shells and die.</p>
</section>
'''
