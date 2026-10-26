# ------------------------------------------------------------------ 9 Pxygen and Xater (numbers from the bakes)
import json, subprocess
NUM=json.loads(subprocess.run(['node','--input-type=module','-e','import { MOLECULES } from "'+ATOM+'js/molecules.js"; import { TABLE } from "'+ATOM+'js/table.js"; console.log(JSON.stringify({ M: MOLECULES, px: TABLE[4][9].ion, o: TABLE[3][7].ion }));'],capture_output=True,text=True,check=True).stdout)
M=NUM['M']; EV=27.2114; KC=627.51
w,y=M['3']['big'],M['4']['big']; D3,D4=M['3']['dimer'],M['4']['dimer']
f=lambda v,k: f'{v:.{k}f}'
hund=f((y['atom']['closed']-y['atom']['hund'])*EV,1)
xater=f'''<section id="pxygen">
  <h3>Pxygen, element 10</h3>
  <p>4D's second row holds ten electrons: two in 2s, then eight in 2p, which has four orbitals here. Element 10, <b>Pxygen</b>, has six of the eight: 1s² 2s² 2p⁶, two short of the noble gas at 12, as our oxygen is two short of neon. Like oxygen it keeps its spare electrons apart, four spinning one way and two the other (Hund's rule), {hund} eV below pairing them all off.</p>
  <p>It holds its outermost electron with {f(NUM['px']*EV,1)} eV (the <a href="table.html">solver's</a> figure; for our oxygen it gives {f(NUM['o']*EV,1)}, measured 13.6). What matters more is its partner. In our world hydrogen holds its electron with 13.6 eV, just as hard as oxygen, but <b>4D hydrogen holds on with only 6.05</b>. So in a bond between them Pxygen takes more than its share. Its bonds to hydrogen are lopsided, with the hydrogen at the positive end, far more so than ours.</p>
  <p>Counting: the outer shell has five orbitals (2s and four 2p) and eight electrons. Two orbitals are half full and make bonds, and three are full. <b>Pxygen makes two bonds and keeps three lone pairs.</b> Darbon's geometry would put the two bonds 104.48° apart, almost exactly our water's 104.5°. The computation below says otherwise.</p>
</section>
<section id="method">
  <h3>Molecules, computed</h3>
  <p>The <a href="table.html">atom solver</a> can't do molecules: it averages each atom into a sphere. So ATOM⁴ has a second solver, <b>Hartree–Fock</b> on Gaussian functions, written once for any number of dimensions. Every integral a molecule needs comes down to one function. In 3D that's Boys's F_n(T). In d dimensions it becomes <b>G_n(T) = ∫₀¹ u²ⁿ (1 − u²)^((d−3)/2) e^(−Tu²) du</b>, which obeys the same rules, so the rest of the textbook method carries over unchanged.</p>
  <p>The checks. Hydrogen comes out exact in both worlds, 4D's 2p level too. Helium reaches the method's known limit in 3D. In 4D it equals the atom solver's helium to a millionth: for two electrons the two solvers are the same theory, computed differently. A 4D molecule's energy doesn't change when it points another way. Then our water, with the same recipe of basis functions as Xater:</p>
  <div class="shells" id="molCheck"></div>
  <p>The solver lands where Hartree–Fock is known to land, and misses what Hartree–Fock is known to miss: about a third of the energy holding water together, which is <b>correlation</b>. It gets shapes and dipoles well and underestimates bond energies, the same way in both worlds. So <b>compare Xater with our water as computed, not as measured.</b></p>
</section>
<section id="xater">
  <h3>Xater, H₂Px</h3>
  <div class="tiles" id="xaterTiles"></div>
  <p><b>Xater is bent at {f(y['theta'],0)}°</b>, wider than our water (computed {f(w['theta'],1)}°) and than the 104.48° the counting suggested. A bigger basis moves it by under a degree. Its bonds are {f(y['R'],2)} bohr long, {f(y['R']/w['R'],2)}× ours, because 4D's atoms are bigger. And it's <b>soft</b>: straightening it costs {f(y['linear']*EV,2)} eV, against water's {f(w['linear']*EV,2)}. That's still about {f(y['linear']*EV/0.0257,0)} times room temperature's 0.026 eV, so it stays bent, but it flexes far more than water does. Its bonds hold less: pulling Xater apart into atoms takes {f(y['De']*EV,1)} eV, against water's {f(w['De']*EV,1)} by the same method, because 4D hydrogen has less of a hold to share.</p>
  <p><b>Its dipole moment is {f(y['dipole'],2)} au, {f(y['dipole']/w['dipole'],1)}× our water's</b> computed the same way: that's the lopsided bond. A dipole's field here is the same as in our world, because the potential is 1/r. So two Xaters pull on each other as μ²/R³ just as two waters do, but {f((y['dipole']/w['dipole'])**2,1)} times harder.</p>
  <p><b>Its lone pairs make a ring.</b> The top orbital is two-fold: two 2p orbitals at right angles to the molecule's plane, equal in energy. In 3D the directions at right angles to a plane form a line, and water's lone pair there is one orbital with two lobes. In 4D they form a whole plane, and a turn within that plane moves nothing in the molecule. So Xater's charge sits in a ring around it, and a neighbour can come in from anywhere around that ring.</p>
  <div class="shells" id="xaterTab"></div>
  <p class="read" id="rXater"></p>
</section>
<section id="hbond">
  <h3>The hydrogen bond</h3>
  <p>A hydrogen of one Xater points at the Pxygen of another, coming in from the ring's side. Computed with the pair's shape found by minimizing (and corrected for each molecule borrowing the other's basis functions): the two Pxygens sit {f(D4['RXX'],1)} bohr apart, and <b>the bond is worth {f(-D4['E']*KC,1)} kcal/mol, {f(D4['E']/D3['E'],1)}× water's {f(-D3['E']*KC,1)}</b> by the same method. At this basis Hartree–Fock gets water's bond about {f((-D3['E']*KC/3.6-1)*100,0)}% too strong and misses its correlation, so read the ratio and not the number: <b>Xater's hydrogen bond is about three times as strong as water's.</b></p>
  <p>It's short, too. The shared hydrogen is {f((D4['RXX']-D4['r'])/D4['r'],1)} times as far from its neighbour's Pxygen as from its own; in water's pair, {f((D3['RXX']-D3['r'])/D3['r'],1)} times. Xater's hydrogen bonds are halfway to being shared, like the strongest hydrogen bonds in our world (the F–H–F of salts), not like water's.</p>
</section>
<section id="liquid">
  <h3>What kind of liquid</h3>
  <p>Each Xater has two hydrogens to give and a ring to take them, so it can link into a network as water does, two hydrogen bonds per molecule. With each bond about three times water's, pulling a Xater out of its liquid should cost two to three times as much, which makes it a liquid far past our water's boiling point. That's an estimate from the bond, not a computation of the liquid.</p>
  <p>Open: correlation, the third the method misses. The liquid itself: its structure and boiling point need a simulation. How many hydrogens the ring will take: it has room for more than two, and three or more molecules have to be computed to know. And the refractive index, which the <a href="light.html">rainbow</a> needs. Whether Xater is 4D's water at all is the <a href="census.html">next chapter</a>'s question.</p>
</section>
'''
