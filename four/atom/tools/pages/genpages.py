# ATOM⁴'s chapter pages and its landing, generated: python3 four/atom/tools/pages/genpages.py
# Each chapter's body is written here (or in the gen*.py beside it, exec'd below) with its numbers pulled from the
# baked js/*.js, so a re-bake followed by this script keeps every stated number current. old-index.html is the
# one-page version the first chapters were cut from. Run preflight --fix after, as usual.
import re, html, os, json, subprocess
SP=os.path.dirname(os.path.abspath(__file__))+'/'
OUT=os.path.abspath(os.path.join(SP,'../..'))+'/'
ATOM=OUT
# how many 4D elements answer to nothing of ours (js/names.js)
NEWN=int(subprocess.run(['node','--input-type=module','-e','import { TABLE } from "'+ATOM+'js/table.js"; import { names } from "'+ATOM+'js/names.js"; console.log([...names(TABLE, 4).values()].filter((e) => e.isNew).length);'],capture_output=True,text=True,check=True).stdout)
src=open(SP+'old-index.html').read()
def sec(i):
    a=src.index(f'<section id="{i}">'); b=src.index('</section>',a)+len('</section>'); return src[a:b]
def inner(i):
    s=sec(i); s=s[s.index('>')+1:s.rindex('</section>')]; s=re.sub(r'\s*<h3>.*?</h3>','',s,count=1); return s.strip('\n')

CH=[("geometry","Geometry","Four directions at right angles, counted: spheres that grow as r³ so everything spreading from a point thins as 1/r³, more room at right angles, planes that meet at a point, turning in planes, a 3-sphere that can be combed, and knots that untie."),
    ("force","The force","Why 1/r, what it takes to rewrite Maxwell for it, the vacuum we chose, and what breaks."),
    ("light","Light","Lumen⁴'s light survives the lens vacuum. What matter feels of it changes, and so does the sky."),
    ("motion","Motion and spin","F = ma, orbits, rotation in planes, tumbling bodies, electron spin with a handedness, and bonds that twist three ways."),
    ("gravity","Gravity","Gravity meets the same fork as charge: under Gauss's law in 4D no orbit is stable. Six routes, what each costs, the lens assumed for symmetry with charge, and orbits under each law."),
    ("hydrogen","Hydrogen","The one atom solved exactly: its levels, shells, spectrum and fine structure."),
    ("table","The periodic table","Every atom to element 78, solved, with our own table as the check, and what partial screening does."),
    ("shapes","The shapes","The six regular 4D polytopes, built and checked, to turn through w and slice."),
    ("darbon","Darbon","Element 7, the carbon of this world: five bonds, its handedness, and its diamond."),
    ("forces","Forces between molecules","A classical force field, term by term, worked out under the pinned 1/r: what carries over, what changes, and the new one."),
    ("xater","Pxygen and Xater","Element 10 and its water, computed by a molecular solver written for any dimension and checked on our own water: Xater's shape, its pull, and its hydrogen bond."),
    ("census","Which water","Every hydride of 4D's lighter rows, computed, with our ammonia, water and HF as the check: which way their bonds lean, their shapes, and which would make the strongest liquid."),
    ("search","Ten ways to meet","How the census first missed the strongest pairs, and what the miss shows: two molecules meet in six ways in our world and ten in 4D, and a crowd of them in far more. Watch the search, and see what it can and can't promise."),
    ("gas","Gases","PV = NkT in any dimension, the real gas's B₂ computed from the pairs, a refrigerator's throttle, and why 4D's noble gases are held by the crowd rather than their neighbours, so that they boil far hotter than their wells suggest."),
    ("stars","Stars","If gravity is pinned at 1/r like the force between charges, a 4D star holds together as ours does, solved and checked. Its outer layers press inward, its core must burn hotter, and long-lived stars need one more ingredient: the weak force."),
    ("planets","Planetary systems","Orbits round a real star, planets sharing an orbit's size in planes turned apart, moons and the one plane that keeps them safe, starlight on a planet, and whether a 4D nebula flattens into a disk: it does only if it spins in one plane.")]
def head(title, desc):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#07080c" />
<meta name="description" content="{html.escape(desc, quote=True)}" />
<title>{title} — four.mino.mobi</title>
<link rel="icon" href="data:," />
<link rel="stylesheet" href="css/atom4.css" />
</head>
<body>
'''
def nav(here):
    HERE=' class="here"'
    items=''.join(f'<a href="{k}.html"{HERE if k==here else ""}>{i+1} · {t.lower()}</a>' for i,(k,t,_) in enumerate(CH))
    hc=' here' if here=='index' else ''
    mc=' class="here"' if here=='methods' else ''
    return f'<nav class="chapters"><a href="./" class="home{hc}">ATOM⁴</a>{items}<a href="methods.html"{mc}>methods</a></nav>'
def foot(here):
    i=[k for k,_,_ in CH].index(here)
    prev=f'<a href="{CH[i-1][0]}.html">← {i} · {CH[i-1][1]}</a>' if i>0 else '<a href="./">← the position</a>'
    nxt=f'<a href="{CH[i+1][0]}.html">{i+2} · {CH[i+1][1]} →</a>' if i+1<len(CH) else '<a href="methods.html">methods →</a>'
    return f'''<footer class="pager">{prev}{nxt}</footer>
<p class="foot"><a href="./">ATOM⁴: the position</a> · <a href="./README.md">how it works</a> · <a href="../lumen/">Lumen⁴</a> · <a href="../iris/">IRIS⁴</a> · <a href="https://games.mino.mobi/katabasis/">KATABASIS</a> · <a href="../">Four</a> · <a href="https://games.mino.mobi/">the arcade</a></p>
<script type="module" src="js/main.js"></script>
</body>
</html>
'''
def chapter(key, body):
    i=[k for k,_,_ in CH].index(key); _,t,d=CH[i]
    return head(f'ATOM⁴ · {t}', f'ATOM⁴, chapter {i+1}: {t}. {d}')+f'''<header>
  {nav(key)}
  <h2>ATOM⁴ · chapter {i+1}</h2>
  <h1 class="ch">{t}</h1>
  <p class="lede">{d}</p>
</header>
{body}
'''+foot(key)
L='<a href="{}.html">{}</a>'
# ------------------------------------------------------------------ 1 force
pin=inner('pin').replace("That's the world of everything below. Section 7 asks what it costs.","Everything in ATOM⁴ lives in that world. The rest of this chapter asks what it costs.")
mx=inner('maxwell')
cut=mx.index('<h4>And it shows up in the chemistry</h4>'); cut2=mx.index('<h4>A small fourth dimension</h4>')
mx=mx[:cut]+mx[cut2:]
mx=mx.replace('There are five ways to get it, and each one costs something.</p>','There are five ways to get it, each with a cost, and a sixth, which is the one this universe takes.</p>')
a=mx.index('<h4>And light?</h4>'); mx=mx[:a]+'''<h4>The big problem</h4>
  <p><b>Coulomb's 1/r isn't a free choice.</b> In 3D, locality, linearity, relativity and positive probabilities together force it. In 4D the same four force 1/r², and then there are no atoms. To keep 4D atoms, something has to go. This universe gives up relativity for electromagnetism: the lens vacuum keeps light exactly as 4D Maxwell has it and keeps every field adding, but its pull reaches across space at once. That's an absolute "now", a preferred frame, set by one new length ℓ. What it does to light is the <a href="light.html">next chapter</a>. What it does to atoms, through the failed shell theorem, is in <a href="table.html#screen">the periodic table</a>.</p>'''
mx=mx.replace("This is in every atom in section 3","This is in every atom")
force=f'''<section id="contents">
  <h3>What this universe contains</h3>
  <p>Chemistry here needs very little of the Standard Model, and everything it does use is written down below. Nothing else can creep in: a particle we haven't listed isn't in this universe. Any new one (a light particle that pulls on electrons, say) would have to be added here first, because it would add a force.</p>
  <table class="verdict">
    <tr><th>ingredient</th><th>what we take, and why it matters</th></tr>
    <tr><td><b>electrons</b></td><td>charge −1, spin ½, and the smallest spinors: two states, so two to an orbital (<a href="motion.html#spin">motion and spin</a>). That they're <b>fermions</b> is essential: bulk matter is stable only because of it (below). It's <b>stated, not derived</b>. In our world it follows from relativity and spin together (the spin-statistics theorem), but this universe gives up relativity for the force, so it can't be borrowed from there.</td></tr>
    <tr><td><b>nuclei</b></td><td>point charges +Z, thousands of times heavier than electrons, and <b>stable for every Z the table uses</b>, up to 78. That's declared, not derived: nuclear physics would need the strong force in 4D. The heavy ones are the least sure. A 4D nucleus's radius grows as A^¼, so its protons' repulsion grows as Z²/A^¼, faster than our Z²/A^⅓.</td></tr>
    <tr><td><b>light</b></td><td>the lens vacuum's photon, three polarizations (<a href="light.html">light</a>). No other long-range field pulls on charges.</td></tr>
    <tr><td><b>two numbers</b></td><td>Atomic units absorb ħ, the electron's mass and the pinned force's strength. What's left is that strength over ħc, the <b>fine-structure constant</b>, taken <b>small, like our 1/137</b>. Every atom here is solved without relativity, which is right only if it's small. Near 1, heavy atoms would need Dirac's equation and pair creation. The lens length ℓ only sets how strongly light pushes charges.</td></tr>
    <tr><td><b>the weak force</b></td><td>added for the stars, not for chemistry: it turns a proton into a neutron, and with it comes the neutrino. A star's first step in burning hydrogen needs it, so without it stars would live millions of years rather than billions (<a href="stars.html#fuel">stars</a>). Chemistry never feels it: it reaches less than a nucleus's width.</td></tr>
    <tr><td><b>gravity</b></td><td>open: under Gauss's law no orbit is stable and a star is only marginal, so it has to be pinned too. <a href="gravity.html#gravity">Its routes</a> mirror charge's. The stars chapter assumes the same lens.</td></tr>
    <tr><td>not needed</td><td>quarks, gluons, the Higgs. They reach chemistry only through which nuclei exist (declared) and the electron's mass (a unit).</td></tr>
  </table>
  <h4>Is matter stable?</h4>
  <p>In our world it's a theorem (Dyson and Lenard, then Lieb and Thirring) that a lump of N atoms has energy proportional to N, so matter doesn't collapse. The proof leans on Newton's shell theorem, which fails here. So here is the evidence instead. <b>Atoms</b> don't collapse: the solver's total energies grow as a fixed power of Z, the 4D Thomas–Fermi law Z^(5/2), where ours grow as Z^(7/3). <b>Many atoms</b> don't either: every force between neutral atoms here (the permanent R⁻⁵, dispersion's R⁻⁶, salt's R⁻⁷) falls faster than R⁻⁴, so summed over 4D space each atom's share is finite. Matter condenses, but it doesn't run away. And it rests on Pauli. The same scaling that gives fermion matter an energy ∝ −N gives boson matter −N^(3/2), a collapse. Ours does the same, as −N^(7/5). This is argued from scaling, not proved.</p>
  <p class="read" id="rScaling"></p>
</section>
<section id="pin">
  <h3>Gauss's law leaves no atom</h3>
  {pin}
</section>
<section id="electron">
  <h3>Or change the electron instead?</h3>
  <p>Gauss's 1/r² fails because it matches the squeeze. Confining an electron to a size r gives it momentum about ħ/r, and its energy p²/2m costs 1/r². So there's a second way out: leave the force alone and change the electron. If an electron's energy grew faster with its momentum, as p³ or p⁴, squeezing would cost 1/r³ or 1/r⁴. That outgrows the 1/r² pull close in, so the electron settles at a size, and atoms come back at every strength of pull. With p³ it's the same trick this universe uses, moved: the operator |k|³ that the <a href="#maxwell">lens vacuum</a> puts into the field would go into the electron instead.</p>
  <p><b>What it would keep:</b> Gauss's law, so the shell theorem and the Faraday cage. A neutral atom would be invisible from outside, as ours is. There'd be no permanent R⁻⁵ pull, and noble gases would be gases. None of <a href="gas.html#liquids">chapter 12's world of liquids</a> would follow.</p>
  <p><b>What it would cost: relativity, for all matter rather than for one force.</b> E = p²/2m is what Galileo's relativity forces on anything slow (and Einstein's, in the slow limit): a moving lab and a still one see the same physics only if energy is quadratic in momentum. Any other power picks out a frame of absolute rest for every massive particle. Momentum would no longer be mass times velocity (v = dE/dp grows as p² or p³), so F = ma, Kepler's orbits and <a href="motion.html">chapter 3</a> would all change. A heavy body built of such particles wouldn't move like one particle with their summed mass. And |p|³ is nonlocal, like the lens. p⁴ is local, but it keeps every other cost.</p>
  <p>The lens vacuum also gives up relativity, but only for how charges push each other. Light, motion and the electron stay as they were. That's why this universe changes the force rather than the electron. It's a judgement, not a theorem: the electron route keeps our Faraday cages and our gases, and the lens keeps our mechanics. This section is argued from scaling, not computed.</p>
</section>
<section id="maxwell">
  <h3>Can we rewrite Maxwell?</h3>
  {mx}
</section>
'''
# ------------------------------------------------------------------ 2 light
light='''<section id="lens">
  <h3>The light is Lumen⁴'s</h3>
  <p><a href="../lumen/">Lumen⁴</a> worked out light from ordinary 4D Maxwell. The force chapter then put a different vacuum under it, to pin 1/r. Do Lumen⁴'s conclusions still hold? Almost all of them do, and exactly. In the lens vacuum, the fields D/ε₀ and μ₀H obey Maxwell's equations in empty 4D space, with the same charges and currents as sources. So the light that travels is Lumen⁴'s light. What's new is how matter feels it.</p>
  <p class="eq">light: <b>E′ = D/ε₀, B′ = μ₀H</b>, Maxwell's in 4D &nbsp;·&nbsp; what pushes a charge: <b>E = E′/ℓ|k|, B = B′/ℓ|k|</b></p>
  <p>The second line is a lens: at each instant it blurs the light across all of space with a 1/r³ kernel. A wave of one frequency ω has a single |k| = ω/c, so the lens is just one number for it, c/ℓω. Its pattern isn't changed at all, only its strength. A sudden flash has every k at once, and the lens smears it across space at once.</p>
  <table class="verdict">
    <tr><th>Lumen⁴ says</th><th>in this universe</th></tr>
    <tr><td>a point fades as 1/r³; a line as 1/r²</td><td><b>holds.</b> The light is Maxwell's, spreading over a 3-sphere.</td></tr>
    <tr><td>a laser is a line, a dot in your slice</td><td><b>holds.</b></td></tr>
    <tr><td>a flash leaves a negative wake</td><td><b>holds for the light.</b> Matter also feels a flash faintly <i>before</i> its front arrives, because the lens acts across space at once.</td></tr>
    <tr><td>a round hole's first dark ring at 1.43 λ/D</td><td><b>holds.</b> One wavelength goes through the lens as one number, so every pattern is unchanged.</td></tr>
    <tr><td>three polarizations; glare polarized in a plane</td><td><b>holds.</b></td></tr>
    <tr><td>hot bodies: ν⁴/(eˣ − 1), power as T⁵</td><td><b>holds.</b> A body in balance with its light fills every mode of it, and the lens doesn't change the modes.</td></tr>
    <tr><td>the rainbow, and its conic sections</td><td><b>holds as geometry.</b> The 42° is our water's, though. 4D water's refractive index is unknown.</td></tr>
    <tr><td>(not in Lumen⁴) how hard light pushes</td><td><b>new.</b> Long waves push charges harder, by c/ℓω. Small particles scatter as ω³, where 4D Maxwell gives ω⁵ and ours ω⁴.</td></tr>
  </table>
  <h4>The sky</h4>
  <p>Air scatters short waves more than long ones, which is why our sky is blue: scattering grows as ω⁴. With plain 4D Maxwell it would grow as ω⁵, and 4D sunlight (ν⁴) is bluer to begin with, so the sky would be deeper blue still. Through the lens, a particle both feels the wave and sends its scattered light at c/ℓω, against an incoming flux that carries c/ℓω once. That takes two powers of ω off: <b>ω³</b>. Here are the three skies at noon under a 5800 K sun, computed. Each assumes a polarizability that doesn't depend on frequency, as for our air.</p>
  <div class="pair swatches skies" id="skies"></div>
  <h4>What it costs, again</h4>
  <p>Light travels at c, and Lumen⁴'s relativistic wave optics stand. The force between charges doesn't wait for light: wiggle a charge and every other charge feels a little of it at once, through the lens. So there is an absolute now, and a preferred frame in which the lens is instantaneous. Electromagnetism isn't relativistic here, though its light is. One length, ℓ, sets how strong the pinned force is.</p>
  <p>So we <b>don't</b> rebuild Lumen⁴: we annotate it. Lumen⁴ and IRIS⁴ stand as the physics of this universe's light, and Lumen⁴'s page now points here for what matter makes of it.</p>
</section>
'''
# ------------------------------------------------------------------ 3 motion
motion='''<section id="points">
  <h3>Things that move</h3>
  <p><b>Points</b> move by F = ma, with four components where we have three, and momentum is kept. Under any central force a body never leaves the plane of its position and velocity, so a 4D orbit is a flat curve. The plane just leans in any of four directions. Under the pinned 1/r it's one of <b>Kepler's ellipses</b>, closed, because the Runge–Lenz vector, A = p²x − (x·p)p − x/r, is kept in any number of dimensions. Under Gauss's 1/r³ force there's <b>no stable orbit</b> (Ehrenfest, 1917): nudge a circle and the planet spirals off. Try both below.</p>
  <h3 id="turning">Turning happens in planes</h3>
  <p>In 3D you turn about an axis. In 4D a turn moves one plane and fixes the plane perpendicular to it, and there are <b>six</b> planes (xy, xz, xw, yz, yw, zw). So angular velocity and angular momentum have six components. They aren't arrows: they're one number per plane. A 4D body can turn in two perpendicular planes at once, at two rates: a <b>double rotation</b>. With equal rates (an <b>isoclinic</b> turn), nothing but the centre stands still, and every point moves round a great circle.</p>
  <p>The six planes split into two independent sets of three, which commute. Every 4D turn is a <b>left</b> isoclinic turn and a <b>right</b> one at once. That's SU(2) × SU(2): two copies of the group that turns spin in our world, where there's one.</p>
  <div class="tiles" id="turnTiles"></div>
  <h3 id="spin">Spin, with a handedness</h3>
  <p><b>Electrons still come in pairs.</b> The smallest spin-½ objects of 4D turning have two states, so each orbital holds two electrons, as in our world. That's what gives <a href="table.html">the periodic table</a> its shells of 2, 10, 28. It's also what a relativistic electron gives: in 4 + 1 dimensions the Dirac equation has four components. The direction of time's matrix there is the product of the four space ones, so a slow electron's two large components carry only one half of SU(2) × SU(2).</p>
  <p>That makes the spin <b>handed</b>. An electron's spin turns with the left half of any rotation and ignores the right half. A full turn in a single plane flips its sign, as ours does. A left-isoclinic turn spins it twice as fast. A right-isoclinic turn doesn't touch it at all: in the "turning" view the needle stops. Which half electrons belong to is a choice the universe makes once, and all matter shares it.</p>
  <p><b>Magnetism has the same split.</b> A magnetic field has six components, one per plane, and they too divide into halves. Only the left half can flip an electron's spin. A field made only of the right half bends electrons' paths but leaves their spin levels unsplit.</p>
  <p class="read">Assumed, not derived: that the electron is the smallest spinor (a four-state one, holding four to an orbital, is possible in principle), and that half-integer spin means it obeys Pauli's exclusion. The theorem behind that holds for local, relativistic theories, and the lens vacuum isn't fully one. We take both as part of the universe's definition.</p>
  <h3 id="bodies">Tumbling, and twisting</h3>
  <p><b>A rigid body</b> tumbles by Euler's equations in six components: in the body's frame dM/dt = [M, Ω], with M_ab = (j_a + j_b)Ω_ab. Energy, tr M² and the Pfaffian are kept. Manakov showed in 1976 that enough more is kept for the motion to be exactly solvable, as it is in 3D. A free 4D box never settles: the "tumbling" view tumbles one with nothing pushing it.</p>
  <p><b>A bond</b> fixes a line, and the turns that keep a line are the 3D turns of the space across it: <b>three</b> angles of twist about every single bond, where ours has one. Each darbon of D₂H₈ holds four hydrogens on a small tetrahedron across the bond, and the two tetrahedra turn against each other in any 3D way. 4D chains are far floppier than ours, which matters to anything long and folded: proteins, plastics.</p>
  <h4>For the molecular-dynamics view</h4>
  <p>Positions, velocities and the step-by-step update (velocity Verlet) carry over unchanged, and so do bond-stretch and bond-angle terms, at 104.48°. What's new is twist potentials in three angles, and six-component angular velocity for rigid parts. The pairwise forces are re-derived in <a href="forces.html">forces between molecules</a>.</p>
</section>
'''
# ------------------------------------------------------------------ 4 hydrogen
hyd=inner('hydrogen')+'''
  <h4 id="fine">Spin and fine structure</h4>
  <p>The (l + 1)² orbitals of each l are the harmonic polynomials of degree l in four variables. They are the pair of spins (l/2, l/2) under 4D turning's two halves. An electron's spin joins the left half only (<a href="motion.html#spin">motion and spin</a>). So the coupling between spin and orbit splits each level in two, as j = l ± ½ does ours: one part with spin added to the left half's l/2 and one with it taken away. The counts:</p>
  <div class="shells" id="fineTab"></div>
'''
# ------------------------------------------------------------------ 5 table
tab=inner('table').replace('(section 8)','(<a href="#trust">below</a>)')
tr=inner('trends').replace('(section 8)','(<a href="#trust">below</a>)').replace("Section 7 shows why: it's the shell theorem failing.","The <a href=\"#screen\">next section</a> shows why: it's the shell theorem failing.")
mxs=inner('maxwell'); a=mxs.index('<h4>And it shows up in the chemistry</h4>'); b=mxs.index('<h4>A small fourth dimension</h4>')
screen=mxs[a:b].replace('<h4>And it shows up in the chemistry</h4>','').replace("This is in every atom in section 3: the solver","The solver").replace("k(s/r)/r, at every radius","k(s/r)/r (<a href=\"force.html#maxwell\">the force</a>), at every radius")
trust=inner('trust').replace('and everything in section 7.','and everything in <a href="force.html">the force</a>.').replace("and spin's effects, and treat spin as two states per orbital, as in 3D.","and spin's effects (its handedness and fine structure are in <a href=\"motion.html#spin\">motion and spin</a>), counting spin as two states per orbital.")
trust=re.sub(r'\s*<p class="foot">.*?</p>','',trust,flags=re.S)
SOLVER_FIXES=[
 ("long where ours are 2, 8, 8, 18, 18: the same doubling, with 4D's bigger shells.","long where ours are 2, 8, 8, 18, 18: the same doubling, with 4D's bigger shells. Those lengths are what the generalized Madelung rule of Négadi and Kibler (1996) predicts for four dimensions, once each subshell holds 2(l + 1)². The solver confirms it by solving the atoms, which as far as we can find had been done before only in two dimensions (Pyykkö and Zhao, 1991). The sources are in <a href=\"LITERATURE.md\">the literature notes</a>."),
 ("so we iterate until they agree: <b>Hartree's self-consistent field</b>.","so we iterate until they agree: a <b>self-consistent field</b>. Each electron feels the averaged cloud (Hartree's part) and the <b>exchange</b> of the others, the push the Pauli principle gives electrons of the same spin. We use the local form, from the electron gas, with each electron's own share taken out, and spins filled by Hund's rule."),
 ("it gets <b>34 of our first 36 elements right</b>. The two it misses, chromium and copper, are the famous exceptions, which need an effect it leaves out (<a href=\"#trust\">below</a>).","it gets <b>32 of our first 36 elements right</b>, including the famous exceptions, chromium and copper, which half-fill and fill their 3d shell by borrowing a 4s electron. It misses titanium, vanadium, cobalt and nickel, moving one electron the same way when it shouldn't. Local exchange is known to lean that way, and nickel's two configurations really are within a few hundredths of an eV (<a href=\"#trust\">below</a>)."),
 ("the solver's 3D line has the right shape but sits <b>about a third too low</b>, because it leaves out exchange (<a href=\"#trust\">below</a>). Read the 4D numbers the same way.","the solver's 3D line follows them closely, <b>within a few percent</b> (median 0.97 of the measured value), dip from nitrogen to oxygen included."),
 ("<b>4D's hold them tighter</b>: element 12, 22, 50, 78 each harder to ionize than the last.","<b>4D's don't</b>: from element 12 to 78 they hold theirs tighter overall (18.4, 17.7, 20.9, 23.1 eV)."),
 ("What's approximate:</b> Hartree's method treats each electron as moving in the averaged cloud of the others. It leaves out <b>exchange</b> (the Pauli principle's push between electrons of the same spin), so it underbinds, and it averages every open shell into a sphere. That's why it misses chromium and copper, which half-fill and fill their 3d shell by taking an electron from 4s, an exchange effect. Helium's total energy comes out −2.8617 hartree, the exact Hartree–Fock value (the true one is −2.9037). Neon's is −126.4 to Hartree–Fock's −128.5. Ionization energies suffer most, about a third too low across the p block. In 4D the solver finds a few transition metals (elements 64 to 67) giving up their outer s electrons for the d shell, as palladium does in ours.","What's approximate:</b> each electron moves in the averaged cloud of the others, with exchange in its local form. Every open shell is averaged into a sphere, and <b>correlation</b> (electrons dodging one another beyond what exchange accounts for) is left out. Helium's total energy is −2.8617 hartree, the exact Hartree–Fock value (the true one is −2.9037). Neon's is −128.86 to Hartree–Fock's −128.55. Ionization energies come within a few percent of measured. The configuration misses are the transition metals above, which lean toward d. In 4D the solver finds the same leaning, more strongly: runs of transition metals with a single s electron, and elements 64 to 68 giving up their outer s electrons for the d shell entirely, as palladium does in ours."),
 ("A 4D table built with exchange might move a few transition metals' configurations. We expect the main-group skeleton, the period lengths and the noble gases, to stand.","An earlier version of this page left exchange out, and still found the same period lengths, noble gases and main groups. Exchange moved ionization energies by a third and a few transition metals' configurations. We expect the main-group skeleton to stand."),
]
def solverFix(t):
    for a,b in SOLVER_FIXES:
        assert a in t, a[:60]
        t=t.replace(a,b)
    return t
table=f'''<section id="table">
  <h3>The table</h3>
  {tab}
</section>
<section id="names">
  <h3>Names, and the new elements</h3>
  <p>An element that does what one of ours does takes our name, its first letter moved on: hydrogen becomes iydrogen, carbon darbon, oxygen pxygen. Which of ours it answers to is read off its place, the way our groups are. Before a block's half-full element, places count from the block's left edge. The half-full one answers to ours: darbon holds half of its 10-electron shell, as carbon holds half of 8. After it, places count back from the full shell: oitrogen is three short of a noble gas, as nitrogen is.</p>
  <p>Our carbon is the one element that is both fourth from the start and four short of the end. In 4D's longer rows those are two elements, 6 and 8, on either side of darbon, and nothing of ours answers to either. The same goes for the middle of 4D's d block, which holds 18 electrons to our 10. <b>{NEWN} of the 78 elements are new.</b> They're all in <a href="../table/">the big table</a>, beside ours.</p>
  <p>The big table also draws the filling diagram for both worlds. The subshells sit in a grid of n by l and fill along the diagonals of n + l. 4D fills along exactly our diagonals; only the boxes are bigger, 2(l + 1)² to ours' 2(2l + 1). Twenty of 4D's d-block atoms step off the plain filling, lending an s electron or two to d, as our chromium, copper and palladium do.</p>
</section>
<section id="trends">
  <h3>Periodic, with longer periods</h3>
  {tr}
</section>
<section id="screen">
  <h3>Inner electrons screen only partly</h3>
  {screen.strip()}
</section>
<section id="trust">
  <h3>How far to trust it</h3>
  {trust}
</section>
'''
# ------------------------------------------------------------------ 6 shapes, 7 darbon
shapes=f'''<section id="solids">
  <h3>Four dimensions' Platonic solids</h3>
  {inner('solids')}
</section>
'''
dar=inner('chem').replace("needs molecules, and molecules need 4D laws of motion. That comes next.","needs molecules: the <a href=\"motion.html\">motion chapter</a> has the laws of motion and the three twists about each bond, and the molecular-dynamics view is next.")
darbon=f'''<section id="chem">
  <h3>The carbon of this world</h3>
  {dar}
</section>
'''
forces='''<section id="field">
  <h3>The force field, term by term</h3>
  <p>A molecular-dynamics program moves atoms by a <b>force field</b>: springs for bonds, springs for the angles between them, a twist term for each bond, charges, and a pair force between atoms that aren't bonded. In our world that pair force is usually Lennard-Jones, 4ε[(σ/R)¹² − (σ/R)⁶]. Each term comes from somewhere in 3D physics. Here is each one worked out again with the force pinned at 1/r. All of it follows from one fact: the pinned potential is the Fourier transform of 4π²/|k|³ in 4D.</p>
  <table class="verdict">
    <tr><th>term</th><th>in this universe</th></tr>
    <tr><td>bond stretch, k(r − r₀)²</td><td><b>unchanged.</b> Near its length any bond is a spring.</td></tr>
    <tr><td>bond angle, k(θ − θ₀)²</td><td><b>unchanged in form.</b> An angle lies in a plane, in any dimension. θ₀ is 104.48° for darbon's sp⁴, where carbon's is 109.47°.</td></tr>
    <tr><td>twist about a bond, V(φ)</td><td><b>three freedoms, not one</b> (<a href="motion.html#bodies">motion</a>). A four-atom twist angle is still one number, but unsigned: across a 4D bond the space is 3D, and two directions there have no "which way round". Staggered means the far end's neighbours inverted through the bond.</td></tr>
    <tr><td>charges, q q′/r</td><td><b>unchanged</b>, by the pin. But a charged or neutral cloud doesn't act like a point (no shell theorem).</td></tr>
    <tr><td>neutral atoms, permanent</td><td><b>new: −3 S_A S_B / 64 R⁵</b>, attracting. Zero in our world.</td></tr>
    <tr><td>dispersion (London), −C₆/R⁶</td><td><b>still R⁻⁶</b>, with London's 3/2 becoming 7/4. <a href="#dispersion">Computed</a>: weaker than the permanent pull for every 4D noble gas but the first.</td></tr>
    <tr><td>repulsion (Lennard-Jones's R⁻¹²)</td><td><b>exponential, as ours really is</b>: A e^(−βR), β ≈ 2√(2I). The 12 was a convenience in our world too. <a href="#pair">Computed</a> for the noble gases.</td></tr>
    <tr><td>screening in salt water, e^(−κr)/r</td><td><b>a power law</b>: past a few screening lengths, −r⁻⁷, and of the opposite sign.</td></tr>
  </table>
  <p>So the pair force for the molecular-dynamics view is <b>V(R) = A e^(−βR) − B/R⁵ − C₆/R⁶</b>, plus charges where there are any.</p>
</section>
<section id="permanent">
  <h3>Neutral atoms attract, permanently</h3>
  <p>A neutral atom's charge, seen in Fourier space, starts at <b>S k²/8</b>, where S = Σ⟨r²⟩ over its electrons. Two such atoms meet through S_A S_B k⁴/64 times 4π²/|k|³, which is proportional to <b>|k|</b>, and |k| transforms in 4D to <b>−3/(4π² R⁵)</b>. So any two neutral atoms attract as <b>−3 S_A S_B / 64 R⁵</b>. Nothing fluctuates and nothing is polarized: it's the plain electrostatics of two spherical clouds, the shell theorem's failure again. In 3D the same step gives k⁴·4π/k², which has no reach at all. That's why our neutral spherical atoms don't feel each other until they touch.</p>
  <p>Checked against an exact calculation: two model atoms (a nucleus in a Gaussian cloud) whose 4D interaction is integrated directly come within 1.3% of the formula at twenty-four cloud-widths apart, closing in as they separate. Closer in, the exact pull is stronger than the formula (by 14% at eight cloud-widths), so the formula undersells it at contact.</p>
  <div class="shells" id="nobleForces"></div>
  <canvas class="chart tall" id="cPair"></canvas>
  <p>At the distances where our noble-gas atoms sit together, this permanent pull alone is <b>many times deeper</b> than their whole van der Waals well. The 4D noble gases would hardly be gases.</p>
  <p class="read" id="rPair"></p>
  <p>That assumes 4D atoms sit about where ours do. <a href="#pair">Computed</a>, they sit a little closer, 4.5 to 5.25 bohr apart.</p>
</section>
<section id="dispersion">
  <h3>Dispersion: still R⁻⁶, a little stronger, computed</h3>
  <p>Two atoms' electrons jiggle, and each jiggle polarizes the other: London's force. Two dipoles meet through ∂ᵢ∂ⱼ(1/R) = (3R̂ᵢR̂ⱼ − δᵢⱼ)/R³, which is the same in any dimension because the potential is 1/r. So dispersion stays <b>−C₆/R⁶</b>. Its strength comes from the sum of the squares of that tensor's parts: (−2)² along the line between the atoms plus 1 for each direction across it. That's 6 in our world and <b>7</b> in 4D, so London's 3/2 becomes <b>7/4</b>. Checked by solving two coupled 4D oscillators exactly: their zero-point energy drops by 7/4's prediction to one part in ten million.</p>
  <p><b>C₆ itself</b> comes from how easily each atom polarizes at every frequency, by Casimir and Polder: C₆ = (tr T²/2π) ∫ α_A(iω) α_B(iω) dω, which is 3/π in our world and <b>7/2π</b> here. We compute α(iω) by the <b>coupled response</b>. The field distorts each orbital, the distorted cloud pushes back on every electron, and the two are solved together, with each electron's push on itself taken out, as in the ground state. The checks: hydrogen comes out exact in both worlds (α = 4.5, and 34.805 in 4D, which the same closed form gives). At high frequency α → (number of electrons)/ω², as the Thomas–Reiche–Kuhn sum rule says. And helium gives 1.322, exactly time-dependent Hartree–Fock's value. Against our measured noble gases:</p>
  <div class="shells" id="dispCheck"></div>
  <p>α within 9% and C₆ within 11%, on both sides. So, in 4D:</p>
  <div class="shells" id="dispTab"></div>
  <p class="read" id="rDisp"></p>
</section>
<section id="pair">
  <h3>Two atoms, computed</h3>
  <p>To know where two atoms sit and how hard they hold on, the repulsion has to be computed, and that means two clouds overlapping. We use <b>Gordon and Kim's electron-gas model</b> on the solver's own atoms. Each atom keeps its cloud. Their electrostatics is computed exactly, nucleus and cloud, with the 4D pull at every point. The overlap costs the extra kinetic energy and gains the extra exchange energy of an electron gas at the summed density. Those need the free electron gas's formulas in four dimensions, which we derived: kinetic (4π/3)ρ^(3/2), exchange −16/(15√π) ρ^(5/4). They agree with the general-D formulas collected by Loos and Gill (2016). The same derivation in 3D gives Dirac's 0.7386. Dispersion is added from the computed C₆ (damped close in, as Tang and Toennies do). Correlation is left out.</p>
  <p><b>First, in our world</b>, end to end, every part computed, against the measured wells:</p>
  <div class="shells" id="wellCheck"></div>
  <p>It puts the wells within 5% of where they are, but makes them <b>too deep, by 1.4 to 1.8 times</b>. (Helium, a known weak spot of the method, is left out.) So below, each 4D well's depth is read as a range: the computed depth divided by 1.8, up to the computed depth.</p>
  <div class="shells" id="wellTab"></div>
  <canvas class="chart tall" id="cWells"></canvas>
  <p>The wells are deep, and what digs them is electrostatics. At the bottom of each, electrostatics alone pulls harder than the whole well is deep, and the overlap's repulsion holds the atoms apart. From element 12 on, dispersion adds a quarter to two-fifths more. <b>4D's second noble gas, element 12, would boil somewhere between 400 and 730 K</b>, so it's a liquid or a solid at room temperature. Element 22 would boil between 1200 and 2200 K. The heavy ones bind like weak chemical bonds. These are noble gases only in having full shells. Only element 2, 4D's helium, stays a gas, though one that boils far above our helium.</p>
  <p>The repulsion's steepness agrees with the rule β ≈ 2√(2I) to within 20%. The fitted A, β and B, with the computed C₆, give the molecular-dynamics view its formula.</p>
</section>
<section id="twist">
  <h3>Twisting</h3>
  <p>Across a bond, each end's other bonds point to the corners of a regular simplex of the space across it: a triangle in 3D, a tetrahedron in 4D. Over 200,000 random twists of the far end, the least energy is the far tetrahedron inverted through the bond (staggered) and the most is the two lined up (eclipsed).</p>
  <p class="read" id="rTwist"></p>
</section>
<section id="salt">
  <h3>Salt water screens by a power law</h3>
  <p>In salt water the ions crowd round any charge and cancel its field. In our world the cancelled field fades exponentially, e^(−κr)/r: two ions a few nanometres apart in seawater barely feel each other. That exponential needs the transform to be smooth in k², and 4π²/|k|³ isn't. Screening gives 1/(|k|³/4π² + λ) = 1/λ − |k|³/(4π²λ²) + …, and the |k|³ term leaves a <b>tail of −r⁻⁷</b>, of the opposite sign to the charge. In this universe a dissolved ion is overscreened: past a few screening lengths it looks faintly like its opposite, and the effect fades only as a power.</p>
  <p class="read" id="rSalt"></p>
  <p class="read">The tail comes from the Fourier asymptotics of a non-smooth transform, the same machinery that gives the R⁻⁵ above, which the exact two-atom calculation confirms. The salt case itself isn't integrated numerically: its tail is far too small to resolve beside the 1/r it cancels.</p>
</section>
<section id="next">
  <h3>What the molecular-dynamics view gets, and what's open</h3>
  <p>Ready: the bonded terms with 4D's angles and three-way twists, charges at 1/r, the permanent R⁻⁵ with S from the solver, and, for hydrogen and the noble gases, dispersion's C₆ and the repulsion's A and β, all computed. Open: open-shell atoms' polarizabilities (the response assumes closed shells; that's next, for Pxygen), pairs of unlike atoms and molecules (the same methods, more runs), correlation, and retardation (in our world dispersion turns to R⁻⁷ beyond a few hundred bohr; through the lens it hasn't been worked out). Hydrogen bonds are computed, for Xater, in the <a href="xater.html">next chapter</a>. Also open: the three-body forces that make our liquids non-additive.</p>
</section>
'''
exec(open(SP+'gengeometry.py').read())
exec(open(SP+'genmethods.py').read())
exec(open(SP+'genxater.py').read())
exec(open(SP+'gencensus.py').read())
exec(open(SP+'gensearch.py').read())
exec(open(SP+'gengas.py').read())
exec(open(SP+'genstars.py').read())
table=solverFix(table)
pages={"geometry":geometry,"force":force,"light":light,"motion":motion,"hydrogen":hyd and f'<section id="hydrogen">\n  <h3>Hydrogen, exactly</h3>\n  {hyd}\n</section>\n',"table":table,"shapes":shapes,"darbon":darbon,"forces":forces,"xater":xater,"census":census,"search":search,"gas":gas,"gravity":gravity,"stars":stars,"planets":planets}
# "chapter N" is always written as a link to the chapter's page, and its number is recomputed here from the link, so
# chapters can be added or reordered without hunting for numbers (the selftest checks none is left unlinked)
def chnum(k): return [c for c,_,_ in CH].index(k)+1
def refs(h): return re.sub(r'(<a href="(\w+)\.html(?:#[\w-]+)?">)([Cc])hapter \d+', lambda m: m.group(1)+f'{m.group(3)}hapter {chnum(m.group(2))}' if m.group(2) in [c for c,_,_ in CH] else m.group(0), h)
for k,body in pages.items(): open(OUT+k+'.html','w').write(refs(chapter(k,body)))

# the methods appendix: not a numbered chapter, after the last
_mf=foot(CH[-1][0]); _mf=f'<footer class="pager"><a href="{CH[-1][0]}.html">← {len(CH)} · {CH[-1][1]}</a><a href="./">the position →</a></footer>'+_mf.split('</footer>',1)[1]
open(OUT+'methods.html','w').write(refs(head('ATOM⁴ · methods','ATOM⁴, methods: how every number in the book is computed and checked, the free compute runner it runs on, and how to run it yourself.')+f'''<header>
  {nav("methods")}
  <h2>ATOM⁴ · methods</h2>
  <h1 class="ch">How it's computed</h1>
  <p class="lede">The solvers behind every chapter, what each was checked against, the compute they ran on, and how to run them yourself.</p>
</header>
{methods}
'''+_mf))
# ------------------------------------------------------------------ the landing: the position
P=[("geometry",["<b>Spheres grow faster.</b> A 4D sphere's surface grows as r³, so anything spreading from a point (light, a field, heat) thins as 1/r³: ten times farther, a thousandth as much. That one fact forces the next chapter's choice, dims 4D starlight, and gives every 4D atom a crowd of neighbours.",
  "<b>More room at right angles.</b> Random directions lean toward perpendicular, so aiming is harder: a 30° cone catches "+pc(GD['4']['within30'],1)+" of directions (ours "+pc(GD['3']['within30'],1)+"). 24 balls can touch one (ours 12), yet the densest packing fills "+pc(GD['4']['packing'])+" (ours "+pc(GD['3']['packing'])+").",
  "<b>Two planes meet at a point</b>, and can be completely at right angles: xy and zw share only the origin. <b>Turning happens in planes</b>, six of them, and a turn can leave no line in place.",
  "<b>Lost walkers stay lost</b>: a random walker comes home "+pc(GD['4']['returnChance'])+" of the time in 4D (ours "+pc(GD['3']['returnChance'])+"), so diffusing molecules meet again less often. And the ways to move fast grow as v³, which gives each atom 2kT and light its T⁵.",
  "<b>The 3-sphere can be combed</b>: Hopf's circles fill it without meeting. The hairy-ball theorem, a reason our nebulae flatten into disks, has no 4D version. A torus can be flat, knots untie, and a glove turns over through w."]),
 ("force",["Gauss's law in 4D gives a 1/r² potential, and under it no atom has a ground state. <b>We pin the potential at 1/r.</b>",
  "The universe holds electrons (fermions), stable nuclei, the lens vacuum's light, a small fine-structure constant, and the weak force (added for the stars), and nothing else. Matter is stable, by scaling, because electrons are fermions.",
  "Maxwell's 1/k² can't give 1/r in 4D: it needs 1/k³. Every way to get it costs one of locality, linearity, relativity, positive probabilities, or four large dimensions.",
  "<b>Our vacuum is the lens vacuum</b>, ε(k) = ε₀ℓk and μ(k) = μ₀/ℓk. Light stays Maxwell's, fields still add, energy stays positive. The cost is relativity for the force: there's an absolute now.",
  "1/r isn't harmonic in 4D, so there's no shell theorem and no Faraday cage. A charged shell's centre sits at 3π/8 of its wall's potential.",
  "The other way out is to change the electron: an energy growing as p³ or p⁴ makes squeezing cost more than Gauss's pull and gives atoms back, keeping the Faraday cage. It costs relativity for all matter (F = ma goes), where the lens costs it only for the force. Argued, not computed."]),
 ("light",["The light that travels is Lumen⁴'s, exactly: 1/r³, three polarizations, the wake, 1.43 λ/D, ν⁴ and T⁵, the rainbow's conics.",
  "Matter feels light through the lens, c/ℓω: long waves push harder, and a flash is felt faintly before it arrives.",
  "Small particles scatter as ω³, so the sky is blue, though less steeply than ours."]),
 ("motion",["F = ma. Orbits lie in a plane, and under 1/r they're Kepler's closed ellipses. Under Gauss's force none is stable.",
  "Turns happen in planes: six components, double rotations, left and right isoclinic halves (SU(2) × SU(2)).",
  "<b>Electrons pair up, two to an orbital, and their spin is handed:</b> it turns with the left half of every rotation and ignores the right. Only half of a magnetic field can flip it.",
  "Rigid bodies tumble by Euler's equations in six components, still exactly solvable. Every single bond twists in three angles."]),
 ("hydrogen",["E = −Z²/2(n + ½)²: bound by 6.05 eV, twice our size. Shells hold 2, 10, 28, 60.",
  "Its fall to n = 2 glows red to orange, ending at 570 nm. Fine structure splits each l into (l + 1)(l + 2) and l(l + 1)."]),
 ("table",["Rows of 2, 10, 10, 28, 28. Noble gases at 2, 12, 22, 50, 78. A ten-electron rule. That's what the generalized Madelung rule predicts for 4D, here confirmed by solving the atoms.",
  "Inner electrons screen only partly, so 4D's noble gases hold on about twice as hard as they would with the shell theorem, and a neutral atom still pulls from outside (−Σr²/8s³).",
  "The solver (with exchange) gets 32 of our first 36 elements right, chromium and copper included, and ionization within a few percent. 4D's transition metals lean hard toward d and are its least sure entries.",
  "<b>"+str(78-NEWN)+" of the 78 do what one of ours does</b> and take its name, a letter on: iydrogen, darbon, pxygen, oitrogen. <b>"+str(NEWN)+" are new</b>, among them elements 6 and 8 on either side of darbon. <a href=\"../table/\">The big table</a> has them all."]),
 ("shapes",["Six regular polytopes. The 24-cell has no cousin of ours. 4D can be tiled regularly three ways.",
  "4D crystals may turn by 5, 8, 10 and 12, not only 2, 3, 4, 6."]),
 ("darbon",["Element 7: five sp⁴ bonds at 104.48°, DH₅, and chains of 3n + 2 hydrogens.",
  "Our chiral molecules aren't chiral in 4D, since half a turn through w mirrors them. Darbon's are.",
  "Darbon's diamond is two A₄ lattices, five-fold, and can't sit on a hypercube."]),
 ("forces",["<b>Neutral atoms attract permanently, as −3 S_A S_B / 64 R⁵</b> (S = Σ⟨r²⟩). For element 12 at neon's spacing that's about 14 times neon's whole well.",
  "Dispersion stays −C₆/R⁶ (London's 3/2 becomes 7/4), computed by coupled response, within 11% on our noble gases. In 4D it's weaker than the permanent pull for every noble gas but the first.",
  "Computed end to end, 4D noble-gas pairs from element 12 on sit 4.5 to 5.25 bohr apart. Simulated, element 12 condenses below "+KR(OES)+" K: they would hardly be gases.",
  "Bond springs and angles carry over. A bond twists three ways, and staggered means inverted through the bond.",
  "Salt water screens by a power law: an ion is overscreened, with a −r⁻⁷ tail."]),
 ("xater",["Pxygen, element 10: 1s² 2s² 2p⁶, two short of a noble gas, so two bonds and three lone pairs. 4D hydrogen holds its electron with 6.05 eV, against Pxygen's "+f(NUM['px']*EV,1)+", so their bond is lopsided.",
  "<b>Xater, H₂Px, is bent at about "+f(y['theta'],0)+"°</b>, not water's 104.5°, and soft: straightening it costs "+f(y['linear']*EV,2)+" eV (water "+f(w['linear']*EV,2)+"). Its lone pairs make a ring around the molecule's plane.",
  "<b>Its dipole is "+f(y['dipole']/w['dipole'],1)+"× water's and its hydrogen bond "+f(D4['E']/D3['E'],1)+"× as strong</b>, by a Hartree–Fock solver written for any dimension and checked on our water. Its hydrogen bonds are short, halfway to shared, and its liquid should hold together far past our water's boiling point."]),
 ("census",["<b>Almost every 4D hydride has positive hydrogen</b>: iydrogen holds its electron with only 6.05 eV. Mithium and todium are the exceptions (Mi⁺H⁻, like our LiH).",
  "Every hydride of rows 2 and 3 computed: their shapes are what counting says, except that row 2's XH₄ comes out flat, with no dipole.",
  "<b>"+verdict_line()+"</b>, searched over every arrangement and counting correlation: at Hartree–Fock the two tie, each binding a pair at about "+f(-P9['best']['E']*KC,0)+" kcal/mol, "+f(P9['best']['E']/PW['best']['E'],0)+" times our water's, and correlation (MP2) puts "+(SHORT[9] if WIN==name[9] else SHORT[10])+" ahead by "+f(abs(LEAD),1)+" kcal/mol in the largest basis tried, a lead that shrinks as the basis grows. Their best pairs lie antiparallel, dipole to dipole. Which fills the oceans is the abundance question, still open."]),
 ("search",["<b>Two molecules meet in six ways in our world and ten in 4D</b>: d moves and d(d − 1)/2 turns. Turning grows as d², so in 4D most of the ways are turns.",
  "<a href=\"census.html\">Chapter 10</a> first searched two of Xater's ten numbers and missed its best pair by a factor of two. Searched over all ten, a pair's landscape is a funnel: every one of 400 random starts finds the same pair.",
  "<b>A search's energy is a floor</b>: more searching can only bind harder. Whether it's finished has to be argued separately, and the audit has run. Our ammonia's, water's and hydrogen fluoride's pairs are found, hydrogen fluoride's bent one only after the descent learned to step off saddles: the first stopped on a straight chain. "+f"{PR['3']['placements']+PR['4']['placements']+PR['4.9']['placements']:,}"+" random Hartree–Fock placements found nothing deeper than the best pairs, and <a href=\"census.html\">chapter 10</a> stands.",
  "<b>Crowds are a maze, and more so in 4D</b>: from two molecules to "+WORD[n7]+", our water's minima go "+seq('3')+", Xater's "+seq('4')+", and the 4D counts haven't stopped climbing. At "+WORD[n7]+", "+f(hit('3',n7),0)+"% of starts find our water's best and "+f(hit('4',n7),1)+"% Xater's. Which crystal a 4D water makes will be a hard search, and its freezing point is predicted low for its cohesion."]),
 ("gas",["PV = NkT holds in any dimension. A 4D atom carries 2kT, γ = 3/2, and sound runs at 0.61 of the rms speed (ours 0.75).",
  "<b>4D's noble gases are held by the crowd.</b> R⁻⁵ over r³ of space adds up far out: element 12's 24 nearest neighbours give "+f"{OE['firstShell']*100:.0f}"+"% of its crystal's hold, argon's 12 give "+f"{AR['firstShell']*100:.0f}"+"%. Its Boyle temperature is 28 times its well depth (ours 2.8).",
  "<b>A throttle cools them up to tens of thousands of kelvin</b>: element 12 below "+KR(OE['inversion'])+" K, against argon's 794 K. Even 4D's helium cools at room temperature, so a 4D liquefier needs no precooling. Counted by the whole pull, not the well, the gas is ours rescaled.",
  "<b>Element 12 condenses below "+KR(OES)+" K, simulated</b> (liquid and vapour side by side, checked on Lennard-Jones atoms and our argon). That's where the crowd's rules put it, "+f"{OES[0]/OE['tcWell'][0]:.0f}"+" times the well-depth rule. Element 2 is the one 4D noble gas that might be a gas at room temperature.",
  "<b>A hypothesis: a world of liquids.</b> Gas only when hot, wide liquid ranges, glass more often than crystal: element 12's two best crystals nearly tie. Salts are the exception. Computed end to end, 4D's todium gluoride holds together "+f"{TOG['U']/NAF['U']:.1f}"+" times as hard as our sodium fluoride, which the same method gets to 5%."]),
 ("gravity",["<b>Gravity meets charge's fork.</b> Under Gauss's law in 4D no orbit is stable (a circle given 1% more speed runs away) and a star of gas is exactly marginal. Pinned at 1/r, orbits are Kepler's closed ellipses again.",
  "<b>Gravity's routes mirror charge's</b>: Gauss (no orbits, marginal stars), a nonlocal or ghostly field, a dispersive vacuum, a nonlinear law (keeps the shell theorem, loses superposition: masses don't add), a small extra dimension, or the lens. The lens is assumed, for symmetry with charge. Not yet chosen."]),
 ("stars",["Pinned at 1/r through the lens, like charge, <b>a 4D star of gas is bound with E = W/2, exactly as ours is</b>, and a star of light is marginal in both worlds: a maximum stellar mass, as we have.",
  "Solved, a 4D star is "+f"{SM['pinned']['centralOverMean']:.0f}"+" times as dense at its centre as on average (ours "+f"{SM['ours']['centralOverMean']:.0f}"+"). With no shell theorem its outer layers press inward: a quarter of the way out, "+f"{outerAt(0.244)*100:.0f}"+"% of the pull is from the mass outside.",
  "A 4D head-on meeting carries a centrifugal barrier: <b>at the same temperature, nuclei tunnel "+f"{min(DEF):.0f} to {max(DEF):.0f}"+" times less often</b>. A core makes that up by running hotter or denser (up to about "+f"{max(PPR):.1f}"+"× hotter if by temperature alone). Not a different regime.",
  "<b>The weak force is added</b>, so stars can burn hydrogen and live billions of years. Without it they'd burn leftover deuterium and shine by contracting, for millions."]),
 ("planets",["<b>Planets orbit as Kepler said</b>, with one twist: a round 4D star doesn't pull like a point, so orbits slowly turn back (about "+f"{abs(arcsec(EARTH)):.0f}"+" arcseconds per orbit at Earth's distance; zero under the nonlinear law). <b>Two planets can share an orbit's size in orthogonal planes</b>, never closer than √2: in one plane, radii 1 and 1.2 throw one out within "+f"{PL(1.2,0)['lost']}"+" orbits. The planes turn through 4D, keeping their angle. <b>Over "+f"{SORB:,}"+" orbits, planes turned equally both ways keep planets safe; tilted our way, about a shared line, they're thrown out</b>: at Jupiter's mass every pair tilted "+f"{line_out(1e-3)}"+"° or more.",
  "<b>A 4D nebula flattens only if it spins in one plane</b>, simulated against our world's: spinning in two planes it stops part-way, at equal rates it stays round, and a typical cloud ends a thick lens, about "+f"{100*float(NB['med'])**NP:.0f}"+"% as thick as wide. Its planets would form in many planes, not one.",
  "<b>Every planet has one safe plane for moons</b>: the one completely orthogonal to its orbit, where the star can't tug. A polar moon, tilted about a shared line as ours can be, is thrown off within "+f"{OR['moons']['line90']['lost']:.0f}"+" orbits.",
  "A planet's temperature falls as r<sup>−3/5</sup> (ours r<sup>−1/2</sup>). Round a star as hot as our Sun, Earth-warm sits at about half Earth's distance in star radii, and a liquid's band of orbits is narrower, but more planets can share it in planes turned apart."])]
def card(i,k,t):
    lis=''.join('<li>'+c+'</li>' for c in dict(P)[k])
    return f'<a class="card" href="{k}.html"><h3>{i+1} · {t}</h3><ul>{lis}</ul><span class="go">read the chapter →</span></a>'
cards=''.join(card(i,k,t) for i,(k,t,_) in enumerate(CH))
landing=head('ATOM⁴ — the position','ATOM⁴ — the universe we are building, worked out: four dimensions of space with the force between charges pinned at 1/r. Its force, its light, how things move and spin, its atoms, its periodic table, its shapes, its carbon, the forces between molecules, its water, the census of its hydrides and the search behind it, each computed and checked.')+f'''<header id="position">
  {nav("index")}
  <h2>four.mino.mobi · the official position</h2>
  <h1>ATOM⁴</h1>
  <p class="lede">The universe we're building: <b>four dimensions of space</b>, and the force between charges <b>pinned at 1/r</b>. Its consequences, worked out from there and computed wherever they can be. A selftest checks every number. This page is the position. Each chapter shows the working. As in <a href="../lumen/">Lumen⁴</a>, <b class="d3">3D</b> is warm and <b class="d4">4D</b> is ice.</p>
  <p class="lede" style="font-size: 14px;">New here? <a href="../start/" style="color: var(--text)">Where we are</a> walks the argument in eleven steps, with toys, before the full working below.</p>
</header>
<section class="position">
  <p class="made"><b>What it's made of:</b> electrons (spin-½ fermions), nuclei (heavy point charges, declared stable up to Z = 78), the lens vacuum's light, a small fine-structure constant like ours, and the weak force with its neutrino, added so stars can burn hydrogen. Nothing else, and gravity is open. Bulk matter is stable for the same reason ours is, that electrons are fermions: argued from scaling, since the proof for our world leans on the shell theorem. <a href="force.html#contents">The full list</a>.</p>
  <div class="cards">{cards}</div>
  <p class="made"><b>How it's computed:</b> every solver, what it was checked against, the free compute it runs on, and how to run it yourself, in <a href="methods.html">the methods</a>.</p>
  <h3>Open questions</h3>
  <ul class="open">
    <li><b>Open-shell atoms' response.</b> Polarizabilities are computed for hydrogen and the noble gases. Pxygen, darbon and the rest have open shells, which the response doesn't handle yet. Also open: unlike pairs, retardation and three-body forces.</li>
    <li><b>Which nuclei exist.</b> Stability is declared for Z up to 78. Deriving it would take the strong force in 4D.</li>
    <li><b>Gravity.</b> Under Gauss's law no orbit is stable and a star is only marginal, so gravity has to be pinned too. Its routes mirror charge's (<a href="gravity.html#gravity">chapter 13</a>). Through the same lens, stars hold together as ours do. A nonlinear law would keep the shell theorem but make masses not add. Which to adopt is open.</li>
    <li><b>Correlation.</b> The atom solver has exchange but not correlation, and averages open shells into spheres. 4D's transition metals are the least sure. The molecular solver is Hartree–Fock, which misses about a third of a bond's energy, in both worlds.</li>
    <li><b>Spin and statistics.</b> Electrons pairing up is taken as part of the universe's definition. The theorem that would derive it assumes full relativity, which the lens vacuum gives up.</li>
    <li><b>A world of liquids?</b> 4D's noble gases are held by the crowd: element 12 condenses below 4,700 to 8,900 K, simulated (<a href="gas.html">chapter 12</a>), thousands of kelvin above what its well suggests. Still open: whether other liquids follow (wide liquid ranges, few gases at room temperature), whether cold matter crystallizes or freezes to glass, and the crystals of salts, the likely exception, such as bluminium pxide, Bl₂Px₃, which could be 4D's sapphire. A hypothesis, partly simulated.</li>
    <li><b>Which water fills the oceans.</b> On chemistry element 9's XH₃ leads Xater by about {100*LEAD/(-mp2of('4',TOPB)*KC):.0f}% once correlation is counted, a lead that shrinks as the basis grows. Which is commoner needs nuclear physics and stars (and so gravity). The liquids themselves (structure, boiling points, the mixture), and their refractive indices (the rainbow's 42° is our water's), wait on simulation.</li>
  </ul>
  <p class="foot"><a href="./README.md">how it works</a> · <a href="../lumen/">Lumen⁴: light in 4D</a> · <a href="../iris/">IRIS⁴: a rainbow you shape</a> · <a href="https://games.mino.mobi/katabasis/">KATABASIS</a> · <a href="https://games.mino.mobi/foam4/">Foam⁴</a> · <a href="../">Four</a> · <a href="https://games.mino.mobi/">the arcade</a></p>
</section>
<script type="module" src="js/main.js"></script>
</body>
</html>
'''
open(OUT+'index.html','w').write(refs(landing))
print("written")
