# ------------------------------------------------------------------ the methods appendix (exec'd by genpages.py)
# Each method cites the self-test's numbered checks by number; their titles are read from the test itself, so a citation
# of a check that doesn't exist stops the build. The compute ledger is js/ledger.js (tools/ledger.mjs).
LED=json.loads(subprocess.run(['node','--input-type=module','-e','import { LEDGER } from "'+ATOM+'js/ledger.js"; console.log(JSON.stringify(LEDGER));'],capture_output=True,text=True,check=True).stdout)
_st=open(ATOM+'test/atom4.selftest.mjs').read()
TESTS={int(n):t.strip() for n,t in re.findall(r'^/\* (\d+) · (.*?)(?: \(|:|\*/|$)',_st,flags=re.M)}
GH='https://github.com/minormobius/agent01/blob/claude/minesweeper-voronoi-mesh-4hc4ir/four/'
def code(*ps): return ', '.join(f'<a href="{GH}{p}"><code>{p.split("/")[-1]}</code></a>' for p in ps)
def tests(*ns):
    for n in ns: assert n in TESTS, f'methods cite self-test {n}, which does not exist'
    return '; '.join(f'<span class="tn">{n}</span> {html.escape(TESTS[n])}' for n in ns)
def chs(*ks): return ', '.join(f'<a href="{k}.html">chapter 0</a> ({dict((c,t) for c,t,_ in CH)[k].lower()})' for k in ks) # renumbered by refs()
# the queue's reasons were written under the book's earlier numbering; name the chapters instead
_OLD={1:'the force chapter',2:'the light chapter',3:'the motion chapter',4:'the hydrogen chapter',5:'the periodic-table chapter',6:'the shapes chapter',7:'the darbon chapter',8:'the forces chapter',9:'the Xater chapter',10:'the census chapter',11:'the search chapter',12:'the gases chapter',13:'the stars chapter'}
def why(t):
    t=re.sub(r'([Cc])hapter (\d+)',lambda m: (_OLD.get(int(m.group(2)),'a chapter')[0].upper()+_OLD.get(int(m.group(2)),'a chapter')[1:]) if m.group(1)=='C' else _OLD.get(int(m.group(2)),'a chapter'),t or '')
    return html.escape(t.split('. ')[0].rstrip('.')+'.') if t else ''
M=[
 ("atoms","Atoms: the self-consistent field","Every atom from hydrogen to element 78, in both worlds: its electron configuration, energies, sizes and ionization.",
  "The radial equation in d dimensions has the centrifugal term of l + (d − 3)/2, so one solver serves every dimension. It is solved by Numerov's method on a logarithmic grid, energies found by Sturm bisection on node counts. Many electrons are a self-consistent field: each feels the nucleus, the others' charge through the sphere-averaged kernel (1/max in 3D; k(min/max)/max in 4D, which has no shell theorem), and a local exchange term from the d-dimensional electron gas, with each electron's own share removed and Hund's rule for spins. The ground configuration is searched among candidates, and only converged fields count.",
  (1,2,3,4,5,6,7,8,16),("atom/js/atom.js","atom/tools/bake.mjs"),("hydrogen","table"),"about 6 minutes for both tables, in the sandbox","No correlation; open shells averaged into spheres; non-relativistic. Our world's check gets 32 of 36 configurations right."),
 ("response","Response and dispersion","How easily each atom's cloud is pushed (polarizability at imaginary frequency), and from it the dispersion pull C₆ between two atoms.",
  "The coupled response of the solved atom to a field at imaginary frequency, then Casimir and Polder's integral for C₆. Exact for hydrogen in both worlds; for helium it is time-dependent Hartree–Fock.",(18,),("atom/tools/response.mjs",),("forces",),"about a minute","Closed-shell atoms only so far."),
 ("pairs","Atom pairs from their clouds","The energy between two atoms at every distance, from their solved clouds.",
  "Gordon and Kim's method: the two frozen clouds overlap, and the energy is their electrostatics (summed shell by shell, so the large nuclear terms cancel exactly) plus the electron gas's kinetic and exchange energy at each point (correlation left out, as in the atoms). Dispersion is added from the response above.",(15,17),("atom/tools/pairs.mjs","atom/js/forces.js"),("forces","gas"),"about a minute","Frozen clouds don't relax as they meet."),
 ("hf","Hartree–Fock in any dimension","Molecules: their shapes, dipoles and hydrogen bonds, our water first as the check.",
  "Hartree–Fock on Gaussian functions, with McMurchie and Davidson's integrals rebuilt for d dimensions: the Boys function F_n is replaced by G_n(T) = ∫₀¹u²ⁿ(1 − u²)^((d−3)/2) e^(−Tu²) du, which is F_n at d = 3. Geometries are relaxed; pairs are scored by their binding energy.",(19,20),("atom/js/gauss.js","atom/tools/molecules.mjs","atom/tools/census.mjs"),("xater","census"),"half an hour for the molecules, four and a half hours for the census","Hartree–Fock misses correlation, about a third of a hydrogen bond's energy, in both worlds; small bases."),
 ("ff","Force fields fitted to Hartree–Fock","A cheap energy for two molecules, so they can be searched over every pose and simulated by the thousand.",
  "Charges on the nuclei, an exponential repulsion between every pair of sites and a damped dispersion between heavy atoms, fitted to hundreds of Hartree–Fock pair energies: random placements, scans along the hydrogen bond, and close contacts so the repulsion is seen.",(22,),("atom/tools/forcefield.mjs","atom/tools/fitff.mjs","atom/js/ffmodel.js"),("census","search"),"minutes per molecule","Pairwise: no three-body forces. Its blind spots are measured, not assumed away (the audit)."),
 ("search","Pose search, and its audit","The best way two molecules can sit together: 6 numbers to search in 3D, 10 in 4D.",
  "Many random starts, each descending on the force field by BFGS until its slope is gone (a stall isn't a minimum), turns re-anchored as they wind. Then Hartree–Fock scores the force field's minima and relaxes them by a quasi-Newton descent that measures the whole curvature, steps off saddles along their downhill direction, and probes up to 1.5 radians along every principal direction at an apparent bottom. The audit runs the same pipeline on our pairs with published answers, places thousands of pairs at random for Hartree–Fock alone, and relaxes the deepest.",(23,24),("atom/js/landscape.js","atom/tools/pairsearch.mjs","atom/tools/audit.mjs"),("census","search"),"hours per pair, on the runner","A search's energy is a floor, not a proof; the first descent missed hydrogen fluoride's bent pair (the search chapter)."),
 ("clusters","Cluster minima","How fast the minima multiply as molecules are added: two to seven, in both worlds.",
  "Thousands of random starts per cluster size, each descended to its minimum on the force field; minima told apart by energy and shape, counted, and their unseen number estimated by Chao1. Each start has its own seed, so a search splits across machines and the page can replay any start live.",(25,39),("atom/tools/clusters.mjs","atom/js/clusterlive.js"),("search",),"41 runner-hours for sizes six and seven","Pairwise force field; the 4D counts haven't settled."),
 ("md","Molecular dynamics and Ewald sums","Molecules moving in a box: liquids, at a temperature.",
  "Rigid molecules (RATTLE), a stochastic thermostat (Bussi's), and an Ewald sum for the pinned 1/r in any dimension, split as erfc and erf of 1/r itself, since a Gaussian cloud's own potential isn't short-ranged off 3D.",(21,),("atom/js/md.js","atom/js/liquid.js"),("forces","gas"),"seconds, live in the browser","Checked on the Madelung constants (ours, and 4D's 1.8393991) and NIST's SPC/E water reference."),
 ("coexist","Liquid and vapour, side by side","Where a gas condenses: its critical point.",
  "Gibbs-ensemble Monte Carlo: two boxes trade volume and atoms until one is liquid and one vapour, at one temperature per run; the critical point is fitted to the two densities across temperatures. The 4D pull reaches far, so the boxes are big and the tail is added for a uniform fluid.",(34,),("atom/tools/coexist.mjs",),("gas",),"19 runner-hours","Checked on Lennard-Jones (published critical point) and our argon's computed pair (measured)."),
 ("lattice","Crystals and salts","Which lattice a crystal takes, and how hard a salt holds together.",
  "Lattice sums over candidate lattices (fcc and the 24-cell's among them); salts from closed-shell ions solved above, with Gordon–Kim between charged clouds and Evjen's neutral cubes for the sum. In 4D the numerical tail would diverge over the r³ shells, so past 14 bohr the exact far field from the clouds' moments is used.",(29,30,31,32),("atom/js/gas.js","atom/tools/crystals.mjs","atom/tools/salt.mjs","atom/tools/ions.mjs"),("gas",),"minutes","Checked on our noble gases (fcc must win) and sodium fluoride."),
 ("stars","Stars","Whether a ball of gas holds itself together under each law of gravity, its structure, and how often its nuclei meet.",
  "The virial theorem in d dimensions for a 1/r^k pull; the self-consistent polytrope, iterated on each law's shell kernel (Hachisu's method); and WKB tunnelling with Langer's centrifugal term, the 4D head-on meeting's built-in barrier.",(35,),("atom/js/stars.js","atom/tools/stars.mjs"),("gravity","stars"),"seconds","Checked against Lane–Emden's polytropes and Gamow's factor. Opacity, and so a star's brightness, is open."),
 ("orbits","Orbits and planets","Kepler's orbits under each law, precession round a real star, planets in planes turned apart, moons, starlight on a planet, and the stability map.",
  "A leapfrog n-body integrator in any dimension (symplectic, so energy doesn't drift over hundreds of thousands of orbits), orbits' planes compared by their principal angles, a round star's outside potential summed from its shells.",(36,41),("atom/js/orbits.js","atom/tools/orbits.mjs","atom/tools/stability.mjs"),("gravity","planets"),"seconds to minutes; the stability map on the runner","Checked against Kepler's closed orbits and Landau's precession formula."),
 ("nebula","Nebulae","Whether a rotating cloud of gas falling onto a star flattens into a disk.",
  "Tens of thousands of particles pulled as 1/r² (Newton in 3D, the pinned law in 4D, so only the dimension differs), with pairwise collisions that remove part of each approach speed along the line between the pair: momentum and spin kept exactly, energy taken. The same code in 3D is the control.",(40,),("atom/js/nebula.js","atom/tools/nebula.mjs"),("planets",),"63 runner-hours","No pressure, no self-gravity; times depend on the collision model, so the shapes are the result."),
 ("geometry","Geometry","The counting the rest leans on: spheres, directions, packings, flats, turnings, random walks, slices, tori.",
  "Exact formulas where they exist, each checked against sampling or counting: random points in a ball, random directions, lattice vectors, random flats, walks, Hopf's circles.",(37,38),("atom/js/geometry.js",),("geometry",),"seconds",""),
 ("fields","Fields and the lens","The routes to a 1/r force, what each costs, and the lens vacuum adopted.",
  "Closed forms for each route's kernel and its costs, the unitarity bound, the lens vacuum's response, scattering, and Biot–Savart fields under each kernel.",(9,12,33),("atom/js/fields.js",),("force",),"seconds",""),
 ("turning","Turning and spin","Rotations in planes, handed spin, and tumbling bodies.",
  "so(4) = so(3) ⊕ so(3) by the Hodge star; the spinor representation from 4 + 1 gamma matrices; Euler's equations for a free 4D body in six components.",(13,),("atom/js/turning.js",),("motion",),"seconds",""),
 ("shapes","Shapes","The six regular 4D polytopes, hybrid bonds and diamond nets.",
  "Built from their vertices, with edges, faces and cells found from them and counted against their known numbers.",(10,11),("atom/js/polytopes.js",),("shapes","darbon"),"seconds",""),
]
def method(m):
    key,name,what,how,ts,cs,cks,cost,lim=m
    return f'''<div class="method" id="m-{key}"><h4>{name}</h4>
    <p>{what}</p><p class="how">{how}</p>
    <table class="mt"><tr><th>checked by</th><td>{tests(*ts)}</td></tr><tr><th>code</th><td>{code(*cs)}</td></tr><tr><th>used in</th><td>{chs(*cks)}</td></tr><tr><th>cost</th><td>{cost}</td></tr>{f'<tr><th>limits</th><td>{lim}</td></tr>' if lim else ''}</table></div>'''
def _lrow(r):
    res = "✓" if r["result"] == "success" else r["result"]
    if r["cut"]: res += f' ({r["cut"]} cut at the deadline)'
    return f'<tr><td><a href="{r["log"]}">{r["name"]}</a><br><small>{r["at"][:10]}</small></td><td>{why(r["why"])}</td><td>{r["cmds"]}</td><td>{r["cpuHours"]:.1f}</td><td>{res}</td></tr>'
ledrows=''.join(_lrow(r) for r in LED['runs'])
methods=f'''<section id="made">
  <h3>How this book is made</h3>
  <p>Everything in these chapters is computed by code anyone can read, and most of it can be re-run in a browser. Six rules make that hold:</p>
  <ol class="rules">
    <li><b>Our world is the control.</b> Every solver is written for any number of dimensions and run on ours first, against measured or published answers. Only then is it run in four.</li>
    <li><b>No dependencies.</b> Plain JavaScript modules, the same ones in a browser and in node. The live views on these pages run the same code that produced the numbers.</li>
    <li><b>Every number comes from the code.</b> The calculations write their results to data files, and the pages are generated from those files: nothing on a page is typed by hand.</li>
    <li><b>Everything stated is checked.</b> A self-test of {len(TESTS)} groups of checks, about a minute and a half, recomputes samples of every result and checks each method against known answers. It runs on every change.</li>
    <li><b>Long runs go to a free compute runner</b>, below, and every run is logged.</li>
    <li><b>Mistakes stay in the text.</b> When a check fails, the fix and the failure are both written up (<a href="search.html#promise">the search chapter's hydrogen fluoride</a>).</li>
  </ol>
</section>
<section id="runner">
  <h3>The compute runner</h3>
  <p>A calculation longer than a few minutes runs on GitHub's free runners: 4 cores, 16 GB and up to 6 hours each, up to 20 at once. A run is a short file listing commands, each a tool and plain words, grouped four to a runner. Pushing it starts the run. Each tool saves its progress every few seconds to a data branch, so a run cut at its deadline resumes where it stopped, and every run's logs are kept there with the commit it ran. The results come back as data files, and the pages are regenerated from them.</p>
  <div class="flow"><span>the queue<br><small>commands</small></span><b>→</b><span>runners<br><small>4 cores each, in parallel</small></span><b>→</b><span>the data branch<br><small>caches, logs</small></span><b>→</b><span>a bake<br><small>data files</small></span><b>→</b><span>these pages</span></div>
  <p><b>So far: {LED['total']['runs']} runs, {LED['total']['cmds']} commands, {LED['total']['cpuHours']:.0f} core-hours</b>, at no cost. Work in the sandbox and in readers' browsers isn't counted.</p>
  <div class="shells"><table class="verdict ledger"><tr><th>run</th><th>why</th><th>commands</th><th>core-hours</th><th>result</th></tr>{ledrows}</table></div>
</section>
<section id="methods">
  <h3>The methods</h3>
  <p>Each method: what it computes, how, what checks it (the self-test's numbered checks, by name), its code, where it's used, and its limits.</p>
  {"".join(method(m) for m in M)}
</section>
<section id="yourself">
  <h3>Run it yourself</h3>
  <p>The code is public. With node (version 20 or later) and git, and nothing else installed:</p>
  <pre class="eq">git clone https://github.com/minormobius/agent01
cd agent01
node four/atom/test/atom4.selftest.mjs        # every check, about 90 s
node four/atom/tools/orbits.mjs               # re-bake the orbits, 40 s
node four/atom/tools/clusters.mjs 4 5 100     # 100 starts of five Xaters</pre>
  <p>Each tool's first lines say what it does and how to run it. A fork's own GitHub Actions can run the compute queue (<code>.github/compute/atom4.json</code>) the same way. Packaging the solvers as a standalone library, free to use, is planned; until a licence is published the code is open to read but not yet licensed for reuse.</p>
</section>
'''
