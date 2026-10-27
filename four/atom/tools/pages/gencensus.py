# ------------------------------------------------------------------ 10 the census (numbers from js/census.js)
CEN=json.loads(subprocess.run(['node','--input-type=module','-e','import { CENSUS } from "'+ATOM+'js/census.js"; console.log(JSON.stringify(CENSUS));'],capture_output=True,text=True,check=True).stdout)
C3={m['Z']:m for m in CEN['3']}; C4={m['Z']:m for m in CEN['4']}
PM=json.loads(subprocess.run(['node','--input-type=module','-e','import { PAIRMIN } from "'+ATOM+'js/pairmin.js"; console.log(JSON.stringify(PAIRMIN));'],capture_output=True,text=True,check=True).stdout)
import math
def bend(r):  # the X–H···X angle of each hydrogen in a short contact with the other molecule's X, the smallest H···X first
    A,B=r['best']['A'],r['best']['B']; out=[]
    for M,N in ((A,B),(B,A)):
        for h in M[1:]:
            u=[a-b for a,b in zip(M[0],h)]; w=[a-b for a,b in zip(N[0],h)]; dh=math.dist(h,N[0])
            out.append((dh, math.degrees(math.acos(sum(x*y for x,y in zip(u,w))/(math.hypot(*u)*math.hypot(*w))))))
    return sorted(out)[0]
PW,PX,P9=PM['3'],PM['4'],PM['4.9']
def pull(m):
    dm=m.get('dimer') or {}
    return None if 'E' not in dm else min(m['bonds'],m['lp'])*(-dm['E']*KC)
net3={Z:pull(m) for Z,m in C3.items()}; net4={Z:pull(m) for Z,m in C4.items() if pull(m) is not None}
top=sorted(net4,key=lambda Z:-net4[Z]); a,b=top[0],top[1]
tie=abs(net4[a]-net4[b])/net4[a]<0.1
name={10:'Xater',9:"element 9's XH₃",11:"element 11's HX",8:"element 8's XH₄",19:"element 19's XH₃",20:"element 20's H₂X",21:"element 21's HX"}
census=f'''<section id="question">
  <h3>Two reasons, and the one we can check</h3>
  <p>In our world water is <i>the</i> water for two reasons. It's the best at the chemistry: polar, holding itself together in a network of hydrogen bonds, and liquid where life can be. And it's the commonest: hydrogen is the commonest element and oxygen the third. <a href="xater.html">Chapter 9</a> showed that Xater exists and holds together hard. This chapter puts the first question to every hydride 4D's lighter rows can make. The second, which elements are common, needs nuclear physics and stars, and stays open.</p>
</section>
<section id="polarity">
  <h3>Who holds the electron</h3>
  <p>A hydride's hydrogen ends up positive when its partner holds electrons harder than hydrogen does. In our world hydrogen holds its electron with 13.6 eV, far more than lithium (5.4) or sodium (5.1), and about as hard as carbon, nitrogen and oxygen. In 4D hydrogen holds on with only 6.05 eV, while partial screening lifts every heavier atom (the <a href="table.html">table</a>). So <b>almost every 4D hydride has positive hydrogen</b>. The exceptions are the first atoms of each row: mithium (element 3, 3.5 eV) and todium (element 13, 4.85 eV). The census finds mithium hydride the other way round, Mi⁺H⁻, as our LiH is Li⁺H⁻.</p>
</section>
<section id="census">
  <h3>Every hydride, computed</h3>
  <p>Counting says how each atom bonds: its outer shell has five orbitals, so an atom with v outer electrons makes v bonds up to five, and past that 10 − v bonds with v − 5 lone pairs. Each hydride was given the symmetric shape that implies and its size and angles were minimized, by the solver of <a href="xater.html#method">chapter 9</a>, with our ammonia, water and HF computed alongside. Random nudges of every hydrogen then confirmed each one is a minimum.</p>
  <div class="shells" id="censusTab"></div>
  <p>The shapes come out as counting says, with one surprise. <b>Row 2's XH₄ (element 8) is flat</b>: its four hydrogens sit at the corners of a tetrahedron in a 3D slice through it, and its lone pair is a p orbital straight across that slice, a lobe on each side, so it has no dipole at all. Row 3's (element 18) bends into a pyramid, {f(C4[18]['param'],0)}° from its axis, and has a dipole of {f(C4[18]['dipole'],1)}. Element 9's XH₃ is a pyramid at {f(C4[9]['param'],0)}°.</p>
</section>
<section id="pairs">
  <h3>Hydrogen bonds, and the network</h3>
  <p>For each hydride with positive hydrogens and lone pairs, two of them were hydrogen-bonded and the pair's shape minimized, as for Xater. How hard a liquid holds together depends on how many such bonds each molecule can make in a network: each needs a hydrogen at one end and a lone pair at the other, so a molecule makes about as many as the smaller of the two counts. That's two for water, and one each for HF and ammonia. <b>The bond's strength times that count is the network's pull.</b> In our world it orders water ({f(net3[8],1)} kcal/mol) above HF ({f(net3[9],1)}) above ammonia ({f(net3[7],1)}), which is the order of their boiling points (373, 293 and 240 K).</p>
  <div class="shells" id="pairTab"></div>
  <p class="read" id="rPairs"></p>
</section>
<section id="fullsearch">
  <h3>The pairs, searched properly</h3>
  <p>The pairs above were found by sliding one molecule along a line and tilting it in one plane: two numbers, searched inside one family of arrangements, the linear hydrogen bond our water makes. But a 4D molecule can sit against another in ten ways, four to move and six to turn. Searching all ten, first on a force field fitted to Hartree–Fock pairs and then with Hartree–Fock itself, finds what the narrow search missed:</p>
  <div class="shells" id="pairFull"></div>
  <p><b>Both 4D candidates bind about twice as hard as the census found, and not in a line.</b> Their best pairs are compact and antiparallel: each molecule lends a hydrogen to the other, and the two strong dipoles lie side by side, head to tail. Xater's X–H···X angle is {f(bend(PX)[1],0)}°, where our water's is near straight. Searched the same way, our water finds nothing deeper than its familiar linear bond, which is the check. <b>The tie stands</b>: element 9's XH₃ binds a pair at {f(-P9['best']['E']*KC,1)} kcal/mol and Xater at {f(-PX['best']['E']*KC,1)}, about {f(P9['best']['E']/PW['best']['E'],0)} times our water's {f(-PW['best']['E']*KC,2)}.</p>
  <p>It also changes what the network count above can say. In pairs like these, hydrogens and lone pairs are shared around rings, so "the smaller of the two counts" no longer tells how a liquid holds together. That is the liquid simulation's question, and it's under way.</p>
</section>
<section id="verdict">
  <h3>So which is the water</h3>
  <p><b>{"On chemistry, two tie: " + name[a] + " and " + name[b] if tie else "On chemistry, " + name[a] + " comes first, then " + name[b]}.</b> Searched over every arrangement, each binds a pair about {f(P9['best']['E']/PW['best']['E'],0)} times as hard as our water does, computed the same way. Each makes two hydrogen bonds per molecule, but Xater has a lone pair to spare and element 9's XH₃ a hydrogen. So in a mixture of the two every hydrogen and every lone pair could find a partner, which has no counterpart in our water.</p>
  <p>Which one makes the oceans comes down to which element is commoner, Pxygen or element 9, and that's the abundance question. There's one hint. If the nuclear force carries over, nuclei fill shells the way atoms do, but in a harmonic well: counting its states in 4D gives closed shells at 2, 10, 30 and 70 protons (or neutrons), where ours are at 2, 8, 20, 40. Ten protons and ten neutrons would be doubly closed, as our oxygen-16 is. That nucleus is Pxygen's. It's a count, not a computation, and making elements takes stars, which take gravity, still open.</p>
  <p>Open: correlation, which Hartree–Fock leaves out in both worlds. The mixture itself, and the liquids, which need a simulation. And abundance. Element 18's pair, too large for the sandbox, was run on a bigger machine: by the census's method it binds at {f(-C4[18]['dimer']['E']*KC,1)} kcal/mol, weaker than either candidate's {f(-C4[9]['dimer']['E']*KC,1)} and {f(-C4[10]['dimer']['E']*KC,1)}, and it makes one bond per molecule in a network. It doesn't change the tie.</p>
</section>
'''
