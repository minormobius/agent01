# ------------------------------------------------------------------ 12 gases (exec'd by genpages.py)
# numbers from js/gas.js on the computed noble-gas pairs, through tools/gasnumbers.mjs
GN=json.loads(subprocess.run(['node',ATOM+'tools/gasnumbers.mjs'],capture_output=True,text=True,check=True).stdout)
def gr(d,Z): return next(r for r in GN['rows'] if r['d']==d and r['Z']==Z)
def K(x): return f"{round(x,-1):,.0f}" if x<1000 else f"{round(x,-2):,.0f}" if x<10000 else f"{round(x,-3):,.0f}"
def KR(a,b=None):
    if b is None: a,b=a
    return f"{K(a)} to {K(b)}"
AR,KR_,NE,IE,OE,BG=gr(3,18),gr(3,36),gr(3,10),gr(4,2),gr(4,12),gr(4,22)
ARG=GN['argon']
IONS=json.loads(subprocess.run(['node',ATOM+'tools/ions.mjs'],capture_output=True,text=True,check=True).stdout)
# how little vapour: e^(−cohesion/kT) at 300 K, element 12's crystal hold at both ends of its range, beside our water's
# (latent heat 44 kJ/mol at 25 °C: 5,290 K a molecule)
VAP=[OE['crystal']*e/300 for e in OE['eps']]
# which crystal (tools/crystals.mjs) and a salt (tools/salt.mjs), computed
CRY={c['name']:c for c in json.loads(subprocess.run(['node',ATOM+'tools/crystals.mjs'],capture_output=True,text=True,check=True).stdout)}
SALT=json.loads(subprocess.run(['node',ATOM+'tools/salt.mjs'],capture_output=True,text=True,check=True).stdout)
def top(n,k=0): return CRY[n]['rows'][k]
def lead(n): r=CRY[n]['rows']; return 100*(r[1]['E']-r[0]['E'])/abs(r[0]['E'])
NAF,TOG=SALT['NaF'],SALT['ToG']
TC3=[gr(3,Z) for Z in (10,18,36)]
# the crowd's estimate of a critical point: the span of the Boyle and crystal rules
def crowd(r): return min(r['tcBoyle'][0],r['tcCrystal'][0]),max(r['tcBoyle'][1],r['tcCrystal'][1])
OEC,BGC,IEC=crowd(OE),crowd(BG),crowd(IE)
FAC=(OEC[0]/OE['tcWell'][0],OEC[1]/OE['tcWell'][1])
# simulated (tools/coexist.mjs on the runner, js/coexist.js): each system's critical point in ε/k, with the dimension's own
# exponent and the other one; in kelvin over the forces chapter's range (the pull ÷1.8 up to as computed)
CX=json.loads(subprocess.run(['node','--input-type=module','-e','import { COEXIST } from "'+ATOM+'js/coexist.js"; console.log(JSON.stringify(COEXIST));'],capture_output=True,text=True,check=True).stdout)
def TCR(k): c=CX[k]; return min(c['Tc'],c['TcOther']),max(c['Tc'],c['TcOther'])
def SIM(k): lo,hi=TCR(k); return lo*CX[k]['epsK']/1.8, hi*CX[k]['epsK']
def ER(k,n=2): lo,hi=TCR(k); return f"{lo:.{n}f} to {hi:.{n}f}"
OES,IES,ARS=SIM('oe'),SIM('ie'),SIM('ar')
SZ=CX['oe']['sizes'][0]['runs']; SZD=100*max(abs(SZ[0]['l']/SZ[1]['l']-1),abs(SZ[0]['v']/SZ[1]['v']-1))
# what a throttle does near room temperature, at the same crowding: the 4D gases, measured against their own wells
gas=f'''<section id="ideal">
  <h3>The ideal gas, in any dimension</h3>
  <p>A gas is atoms flying about and hitting the walls. Pressure is the momentum they carry into a wall each second, per unit of wall, and in 4D a wall is a 3D surface. Count it and you get <b>PV = NkT in any number of dimensions</b>. The <a href="../start/#s11">front page's boxes</a> count it live. What changes with d is where the energy goes: each direction of motion holds kT/2, so a 4D atom carries <b>2kT</b>, not 3/2 kT. Its heat capacities are C_v = d/2 and C_p = d/2 + 1 (in k per atom), and their ratio is <b>γ = (d + 2)/d: 3/2 in 4D</b>, against our 5/3.</p>
  <p>The speeds spread as Maxwell's distribution, with the 3-sphere's area 2π²v³ where ours has 4πv²:</p>
  <canvas class="chart" id="cGasSpeeds"></canvas>
  <p class="read" id="rSpeeds"></p>
  <p>Squeeze a gas without letting heat out and it warms, holding TV^(γ − 1) fixed. Halve the volume and a 4D gas warms by √2 = 1.41, ours by 2^(2/3) = 1.59. To double the temperature takes a 4× squeeze in 4D and 2.8× in ours: <b>a 4D gas is harder to heat by squeezing</b>, because its energy is spread over one more direction. Every engine and every refrigerator runs on that exchange, so 4D's run a little softer. It follows from counting, with no physics of 4D's own.</p>
  <p class="read"><b>Is 4D just hotter?</b> Temperatures in this chapter run high, but not by bookkeeping. At a given temperature each direction of motion holds the same kT/2, so a 4D atom moves faster than ours at the same temperature (rms √(4kT/m) against √(3kT/m)). For the same speed a 4D gas is cooler, by 3/4. And whether two atoms stick is set by e^(−u/kT) for the pair, the same in any dimension. The high temperatures below come from deeper binding: more neighbours, and the far pull.</p>
</section>
<section id="real">
  <h3>A real gas: the second virial coefficient</h3>
  <p>Real atoms pull on each other and can't overlap. The first correction to PV = NkT, at low density n, is P/nkT = 1 + B₂(T) n, where</p>
  <p class="eq">B₂(T) = −½ ∫ (e^(−u(r)/kT) − 1) dV, &nbsp; dV = 2π² r³ dr in 4D (4πr² dr in ours)</p>
  <p>and u(r) is the pair's energy: <a href="forces.html#pair">computed, for the noble gases</a>, from the solver's own atoms. Negative B₂ means the pull wins and the gas is denser than ideal. Positive means the atoms' size wins. The <b>Boyle temperature</b> is where it changes sign.</p>
  <p><b>The checks.</b> The integral is exact against hard spheres and square wells in 2 to 5 dimensions. For Lennard-Jones atoms it gives the Boyle temperature at {GN['lj']['boyle']:.4f} ε/k and the inversion (below) at {GN['lj']['inversion']:.3f} ε/k, the published values. Run on our computed argon pair, it puts argon's Boyle temperature at {KR(AR['boyle'])} K. Measured, it's about {ARG['boyle']} K (sources give 392 to 411), inside the range. At room temperature it gives B₂ = {AR['b298'][0]:.0f} to {AR['b298'][1]:.0f} cm³/mol, around the measured −16. The method carries the forces chapter's 1.4 to 1.8 times overbinding, and that's what the ranges are.</p>
  <p>Here it is for each gas, with temperature counted in its own well depth ε:</p>
  <canvas class="chart tall" id="cGasB2"></canvas>
  <p class="read" id="kGasB2"></p>
  <p><b>Our gases cross zero at about 2.8 ε/k. 4D's cross at about 28.</b> Measured against its own well, a 4D noble gas behaves as if it were ten times stickier than its well is deep. Element 12's Boyle temperature is {KR(OE['boyle'])} K, and element 22's {KR(BG['boyle'])} K.</p>
</section>
<section id="far">
  <h3>Held from a distance</h3>
  <p>The well isn't where 4D's pull is. Two neutral 4D atoms attract as −B/R⁵ out to any distance (<a href="forces.html#permanent">the permanent pull</a>), and the space around an atom at distance r grows as r³. Their product falls only as 1/r², so the far shells add up. Ours fall as R⁻⁶ and the space as r², a product falling as 1/r⁴, so our gases feel almost nothing past the first neighbours. Here's how much of the pull in B₂ comes from within each distance, at three times the well depth:</p>
  <canvas class="chart" id="cGasFar"></canvas>
  <p class="read" id="kGasFar"></p>
  <p>And the same question for a crystal: each atom's hold, counted out shell by shell over the densest lattice (our face-centred cubic, and 4D's lattice of 24-cells, with 24 nearest neighbours), at the pair's own spacing:</p>
  <canvas class="chart" id="cGasCrystal"></canvas>
  <p class="read" id="kGasCrystal"></p>
  <p class="read" id="rFar"></p>
  <p><b>Our noble gases are held by their neighbours. 4D's are held by the crowd.</b> Argon's twelve nearest give {AR['firstShell']*100:.0f}% of its crystal's hold. Element 12's twenty-four give {OE['firstShell']*100:.0f}%, and the whole crowd holds each atom with {OE['crystal']:.0f} times its pair's well depth, where argon's holds with {AR['crystal']:.1f}. Summed pair by pair, element 12's crystal pulls itself tighter than the pair's spacing, onto the repulsive wall where the pair model is least sure. These numbers are at the pair's spacing, which is the cautious choice.</p>
</section>
<section id="fridge">
  <h3>The refrigerator</h3>
  <p>A refrigerator's cold comes from a valve. Push a gas through a narrow opening from high pressure to low (Joule and Thomson's throttle) and it cools, because the atoms climb out of each other's pull as they spread apart. But only below the gas's <b>inversion temperature</b>. Above it, the atoms' collisions win and the gas warms instead. At low pressure the change is</p>
  <p class="eq">ΔT/T ≈ n (T dB₂/dT − B₂) / C_p</p>
  <p>so the sign of T B₂′ − B₂ decides it. The chart gives the cooling per throttle at the same crowding n (taking the pair's own size as the unit of volume), so ours and 4D's can be compared. Solid is the computed pair, and dashed is it divided by 1.8.</p>
  <canvas class="chart tall" id="cGasFridge"></canvas>
  <p class="read" id="kGasFridge"></p>
  <p class="read" id="rFridge"></p>
  <p><b>Every 4D noble gas cools in a throttle up to tens of thousands of kelvin.</b> Element 12 cools below {KR(OE['inversion'])} K. Ours stop far lower: argon's computed inversion is {KR(AR['inversion'])} K, around the measured {ARG['inversion']}. Even element 2, 4D's helium, cools below {KR(IE['inversion'])} K. Our helium, at room temperature, warms in a throttle, and has to be cooled below 40 to 50 K (sources differ) before a valve will cool it at all, and our hydrogen below about 200 K. <b>A 4D throttle at room temperature cools every noble gas it could hold</b>, element 2 included. No 4D noble gas needs precooling. At three times its well depth, at the same crowding, element 12 cools by {OE['jt3']/AR['jt3']:.0f} times as much per throttle as argon.</p>
  <p><b>Yet in its own terms the 4D gas is ours, rescaled.</b> The inversion comes at {AR['inversionOverBoyle']:.2f} times the Boyle temperature for argon and {OE['inversionOverBoyle']:.2f} for element 12 (and {GN['lj']['inversion']/GN['lj']['boyle']:.2f} for Lennard-Jones). Measured against the whole pull, B₂'s integral, rather than the well, the low-density gas is the same gas in both worlds. In 4D the well is simply the wrong yardstick.</p>
  <p class="read">Element 2 is the least sure. The same method overbinds our helium about four times, and the forces chapter leaves our helium out for that reason. Divide element 2's pull by four and it still cools below about {K(IE['inversion'][1]/4.4)} K, well above room temperature. Light atoms also need quantum corrections to B₂ at low temperature, which this classical integral leaves out.</p>
</section>
<section id="boil">
  <h3>When does it condense? Estimated, then simulated</h3>
  <p>The <a href="forces.html#pair">forces chapter</a> estimated boiling points the way ours go: our noble gases boil at about 0.7 of their well depth, and condense below a critical point at about 1.26. That rule counts only the well, and the far pull just shown says it can't be right in 4D. Here are three corresponding-states rules, each read off our argon: from the well, from the Boyle temperature (between mean field's 8/27 of it and argon's 0.37), and from the crystal's hold. The last column is the simulation, below.</p>
  <div class="shells" id="gasTab" style="overflow-x: auto"></div>
  <p><b>In our world the three rules agree</b>, and each range holds the measured critical point: neon {TC3[0]['tcWell'][0]:.0f}–{TC3[0]['tcWell'][1]:.0f} K from the well against 44.4 measured, argon {TC3[1]['tcWell'][0]:.0f}–{TC3[1]['tcWell'][1]:.0f} against 150.9, krypton {TC3[2]['tcWell'][0]:.0f}–{TC3[2]['tcWell'][1]:.0f} against 209.4. They agree because our noble gases' potentials all have the same shape. <b>In 4D they split, by a factor of {FAC[0]:.0f} to {FAC[1]:.0f}.</b> From the well, element 12's critical point is {KR(OE['tcWell'])} K. From its Boyle temperature it's {KR(OE['tcBoyle'])} K, and from its crystal {KR(OE['tcCrystal'])} K.</p>
  <h4>Simulated</h4>
  <p>So we simulated it. Liquid and vapour sit side by side in two boxes that trade atoms and volume until they agree (Gibbs-ensemble Monte Carlo), at a ladder of temperatures, on the compute runner. Below the critical point one box ends up liquid and the other vapour. Above it they can't be told apart. The gap between them closes as (T_c − T)^β, with β = 0.326 in 3D and, in 4D, the upper critical dimension, mean field's ½. Both exponents are fitted, and the spread is part of each answer.</p>
  <p><b>The checks.</b> Lennard-Jones atoms in our world condense below <b>{ER('lj3')}</b> ε/k: the published value is 1.31. Our argon's computed pair condenses below <b>{KR(ARS)} K</b>, holding the measured 150.9. Doubling element 12's boxes moves its densities by {SZD:.1f}%.</p>
  <canvas class="chart tall" id="cCoexist"></canvas>
  <p class="read" id="kCoexist"></p>
  <p><b>Element 12 condenses below {KR(OES)} K, simulated.</b> The crowd's rules said {KR(OEC)} K, and the well's said {KR(OE['tcWell'])}. <b>The crowd was right, and the well-depth rule was off by a factor of {OES[0]/OE['tcWell'][0]:.0f}.</b> Dimension alone does part of it. Lennard-Jones atoms, whose pull is short, condense below {ER('lj4',1)} ε/k in 4D, against {ER('lj3')} in ours, since each atom has more neighbours (that 4D value is extrapolated from {CX['lj4']['lastSplit']} ε/k down). Element 12's far pull takes it to {ER('oe',1)} ε/k. Element 22, by the crowd's rules, would condense below about {KR(BGC)} K.</p>
  <p><b>Element 2, 4D's helium, condenses below {KR(IES)} K</b> on the same range. But the method overbinds our helium about four times. If it does the same here, element 2 condenses below roughly {K(IES[0]/4.4)} to {K(IES[1]/4.4)} K, under room temperature. <b>It is the one 4D noble gas that might be a gas at room temperature</b>, and the uncertainty is in its pull, not in the simulation. Which other gases 4D has is open: 4D hydrogen's molecule hasn't been computed.</p>
  <p class="read">No "boiling point at one atmosphere" can be given, because 4D has no atmosphere to set one. Pressure in 4D is an energy per 4-volume, and which pressure is natural waits on a planet, which waits on gravity. The critical point is the number that can be compared. The simulations add the pull pair by pair, with each box's far tail as a smooth average. Element 12's densest liquid sits near a crystal's density, where the pair model is least sure.</p>
</section>
<section id="liquids">
  <h3>A world of liquids? A hypothesis</h3>
  <p>Put this chapter beside the last and a picture forms. It's a hypothesis, from three arguments, and it's being tested.</p>
  <p><b>Few gases at room temperature.</b> Below its critical point a substance is a gas only up to its vapour pressure, which falls as e^(−cohesion/kT). Element 12's crystal holds each atom by {K(OE['crystal']*OE['eps'][0])} to {K(OE['crystal']*OE['eps'][1])} K (an energy, counted in kelvin). At room temperature that's e^(−{VAP[0]:.0f}) to e^(−{VAP[1]:.0f}), against our water's e^(−18): nothing to speak of. The one noble gas that might stay a gas is element 2. 4D hydrogen's molecule hasn't been computed, and the far pull reaches it too (every neutral thing has it), so it may be no better.</p>
  <p><b>Wide liquid ranges.</b> In our world, how long a liquid lasts depends on how far its atoms' pull reaches. Colloids whose pull is short lose the liquid altogether: they go straight from gas to crystal. 4D's noble gases are the opposite extreme. The far pull raises the critical point, as above. Freezing is set more by how the nearest neighbours pack, which the far pull barely changes.</p>
  <p><b>Crystals are harder to make.</b> Even hard spheres crystallize less readily as the dimension rises: the barrier to forming a crystal is higher in 4D than in 3D, though 4D's densest lattice is unusually good (its nearest neighbours make a 24-cell). For molecules, <a href="search.html">chapter 11</a> counted far more ways for them to sit. A liquid that won't crystallize doesn't stay liquid as it cools. It becomes a glass.</p>
  <p>So the hypothesis: <b>in 4D, gas belongs to furnaces, liquids last over a very wide range, and cold matter is glass more often than crystal.</b> <b>The first half has been tested and holds</b>: simulated, element 12 condenses below {KR(OES)} K, where the crowd's rules put it, {OES[0]/OE['tcWell'][0]:.0f} times the well-depth rule. The far pull lifts boiling a lot. Whether it lifts freezing less, and whether the liquid crystallizes at all, is the next run: crystals melted and liquids cooled, side by side, for argon and for element 12.</p>
  <h4>Which crystal?</h4>
  <p>To say a crystal is hard to make, first find the crystal. Summed over every candidate lattice, each at its best spacing, our noble gases choose right: argon's pull picks <b>face-centred cubic</b>, {lead('argon'):.0f}% ahead of body-centred, as real argon does. In 4D the Lennard-Jones atom, whose pull is short, picks <b>D₄</b> by {lead('Lennard-Jones 4D'):.0f}%: the densest packing, each atom's 24 neighbours at a 24-cell's corners. Element 12's long pull nearly erases that lead. D₄ comes first by only {lead('element 12'):.1f}%, over A₄* (each atom with 10 neighbours). For element 22 the order flips: {top('element 22')['lattice'].replace('4','₄')} leads by {lead('element 22'):.1f}%. And every 4D noble crystal pulls itself inside its own pair's distance ({top('element 12')['aOverR']:.2f} of it for element 12), onto the repulsive wall, where a model summed pair by pair is least to be trusted. So <b>which crystal 4D's noble gases make isn't settled</b>. Two lattices nearly tying is itself a reason a liquid might hesitate to freeze.</p>
  <h4>The exception: salts</h4>
  <p>Salts are held by their charges, at 1/r, and a crystal of alternating charges orders itself in a way a crowd of neutral atoms doesn't. So we computed one, end to end, with our own as the check: two closed-shell ions from the table's solver, their meeting by the same electron-gas model as the noble gases' (on charged clouds), and the crystal's energy summed over the lattice. <b>Our sodium fluoride</b> comes out {NAF['a']:.2f} bohr between neighbours (measured, 4.38) and holds together with {NAF['U']:.2f} eV per ion pair (measured, about 9.6). <b>4D's todium gluoride, To⁺G⁻</b>, both ions with oeon's twelve electrons, on 4D's alternating lattice: <b>{TOG['a']:.2f} bohr, and {TOG['U']:.1f} eV</b>, {TOG['U']/NAF['U']:.1f} times ours. Counted from the neutral atoms, {TOG['cohesive']:.1f} eV against {NAF['cohesive']:.1f} by the same method. <b>4D salts hold together harder than ours.</b> One 4D effect needed care: an ion's cloud leaks a field (the shell theorem's failure again), which each neighbour's charge feels as R⁻³. It alternates in sign across the crystal, and its exact form, derived from the clouds' moments, matches the computed pairs to within 4% where they meet. The lattice is the one the molecular-dynamics code is checked on (8 opposite neighbours along the axes), assumed rather than searched.</p>
  <p>Then the salt that started this, <b>bluminium pxide, Bl₂Px₃</b>, aluminium oxide's counterpart (our sapphire). Stripping bluminium to Bl³⁺ costs <b>{sum(IONS['Bl']):.1f} eV</b> (aluminium {sum(IONS['Al']):.1f} by the same method, {sum(IONS['measured']['Al']):.1f} measured), and pxygen takes its first extra electron for <b>{IONS['Px']:.1f} eV</b> (oxygen {IONS['O']:.1f}, measured {IONS['measured']['O']:.2f}). Both steps come out easier than ours, and 4D's crystals of charges hold harder. Its structure is a real search, five ions to a formula and no known answer to start from, so it waits until the simple salt's model is trusted. If it holds, Bl₂Px₃ is a 4D sapphire. A ruby is sapphire with a little chromium in it, and it made the first laser. Whether 4D has a ruby is the question after that.</p>
</section>
<section id="gasnext">
  <h3>What's computed and what's open</h3>
  <p>Computed: the ideal gas in any dimension; B₂, the Boyle and inversion temperatures, and the throttle's cooling, for the noble gases of both worlds, from their computed pairs; how much of each gas's pull comes from afar; the crystal's hold. Checked: hard spheres, square wells, Lennard-Jones, and our argon's measured Boyle temperature, room-temperature B₂ and inversion. Simulated: the critical points of Lennard-Jones atoms in both worlds, our argon, and 4D's elements 2 and 12. Estimated, by rules taken from argon: the rest. Open: melting and freezing, molecular gases (iydrogen, Xater's vapour), the third virial coefficient (where three-body forces enter), and quantum corrections for the light ones.</p>
</section>
'''
# the forces chapter's boiling statement, corrected where it's made
_old='<b>4D\'s second noble gas, element 12, would boil somewhere between 400 and 730 K</b>, so it\'s a liquid or a solid at room temperature. Element 22 would boil between 1200 and 2200 K. The heavy ones bind like weak chemical bonds. These are noble gases only in having full shells. Only element 2, 4D\'s helium, stays a gas, though one that boils far above our helium.'
assert _old in forces
forces=forces.replace(_old,f'By the rule our noble gases follow, boiling at 0.7 of the well depth, <b>4D\'s second noble gas, element 12, would boil somewhere between 400 and 730 K</b>, so it\'s a liquid or a solid at room temperature. <b>That rule undercounts, though.</b> In 4D most of a noble gas\'s hold comes from beyond its nearest neighbours, which the well depth leaves out. Simulated (<a href="gas.html#boil">chapter 12</a>), element 12 condenses below {KR(OES)} K, and by the same reckoning element 22 below about {KR(BGC)} K. These are noble gases only in having full shells. Element 2, 4D\'s helium, is the one that might stay a gas at room temperature.')
