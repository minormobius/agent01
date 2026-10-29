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
# correlation: the best pairs re-scored by MP2 (js/correlation.js, tools/correlation.mjs), by basis, with our pairs' references
CORR=json.loads(subprocess.run(['node','--input-type=module','-e','import { CORRELATION } from "'+ATOM+'js/correlation.js"; console.log(JSON.stringify(CORRELATION));'],capture_output=True,text=True,check=True).stdout)
BSEQ=[('book',"the book's"),('d','+ a second d'),('Ddp','+ diffuse s, p; hydrogen’s second p'),('Ddpf','+ an f'),('DdpfF','+ a second f'),('Ddpfg','an f and a g'),('DdpfFg','two f and a g')]
B4=[(b,t) for b,t in BSEQ if b in CORR['4']['bases'] and b in CORR['4.9']['bases']]
def kcs(x): return f'{x*KC:+.2f}'.replace('-','−')
def mp2of(k,b): r=CORR[k]['bases'][b]; return r['hf']+r['E2']
def row4(b,t):
    X,Y=CORR['4']['bases'][b],CORR['4.9']['bases'][b]
    return f'<tr><td>{t}</td><td>{X["n"]} / {Y["n"]}</td><td>{kcs(X["hf"])}</td><td>{kcs(X["E2"])}</td><td><b>{kcs(X["hf"]+X["E2"])}</b></td><td>{kcs(Y["hf"])}</td><td>{kcs(Y["E2"])}</td><td><b>{kcs(Y["hf"]+Y["E2"])}</b></td><td>{(mp2of("4",b)-mp2of("4.9",b))*KC:.2f}</td></tr>'
ROWS4=''.join(row4(b,t) for b,t in B4)
TOPB=B4[-1][0]; LEAD=(mp2of('4',TOPB)-mp2of('4.9',TOPB))*KC; LEADS=[(mp2of('4',b)-mp2of('4.9',b))*KC for b,_ in B4]
HFGAP=(CORR['4']['bases'][TOPB]['hf']-CORR['4.9']['bases'][TOPB]['hf'])*KC
NM3={'3':'water','3.9':'hydrogen fluoride','3.7':'ammonia'}
REFB=[('aug-cc-pvtz','aug-cc-pVTZ'),('aug-cc-pvqz','aug-cc-pVQZ')]
def cell(r): return f'<td>{kcs(r["hf"])}</td><td>{kcs(r["E2"])}</td>' if r else '<td>–</td><td>–</td>'
def row3(k):
    c=CORR[k]; ref=c.get('ref',{}); bb=c['bases']
    return f'<tr><td>{NM3[k]}</td>{cell(bb.get("book"))}{cell(bb.get(TOPB3))}'+''.join(cell(ref.get(b)) for b,_ in REFB)+'</tr>'
TOPB3=[b for b,_ in BSEQ if all(b in CORR[k]['bases'] for k in NM3)][-1]
ROWS3=''.join(row3(k) for k in NM3)
_m=[(CORR[k]['bases'][TOPB3]['E2']-CORR[k]['ref']['aug-cc-pvqz']['E2'])*KC for k in NM3]; assert all(x>0 for x in _m); MISS=(min(_m),max(_m))
BOOKREF=max(abs(CORR[k]['ref']['book']['E2']-CORR[k]['bases']['book']['E2']) for k in NM3 if 'ref' in CORR[k] and 'book' in CORR[k]['ref'])
def scanfit(k):  # the parabola through the three points along the X–X line: where MP2 is lowest, and what it gains there
    sc=CORR[k]['scan']['d']; e0=mp2of(k,'d'); em=sc['-0.3']['hf']+sc['-0.3']['E2']; ep=sc['0.3']['hf']+sc['0.3']['E2']
    a=(em+ep-2*e0)/(2*0.09); g=(ep-em)/0.6; return -g/(2*a), g*g/(4*a)*KC
SCX,SC9=scanfit('4'),scanfit('4.9')
# the last basis steps' cost to the lead, and a d on hydrogen (h) beside the f steps, in both worlds
# the lead's two parts per basis: Hartree–Fock's and correlation's (kcal/mol, positive: XH₃ ahead)
HFL=[(CORR['4']['bases'][b]['hf']-CORR['4.9']['bases'][b]['hf'])*KC for b,_ in B4]; E2L=[(CORR['4']['bases'][b]['E2']-CORR['4.9']['bases'][b]['E2'])*KC for b,_ in B4]
def e2kc(k,b): return CORR[k]['bases'][b]['E2']*KC
def mp2kc(k,b): return mp2of(k,b)*KC
HX=mp2kc('4','Ddpfh')-mp2kc('4','Ddpf') if 'Ddpfh' in CORR['4']['bases'] else None   # Xater: a d on hydrogen, on top of an f
FX,F9=mp2kc('4','DdpfF')-mp2kc('4','Ddpf'),mp2kc('4.9','DdpfF')-mp2kc('4.9','Ddpf')   # the second f, each 4D pair
GX,G9=mp2kc('4','Ddpfg')-mp2kc('4','Ddpf'),mp2kc('4.9','Ddpfg')-mp2kc('4.9','Ddpf')   # a g instead
F3=[e2kc(k,'DdpfF')-e2kc(k,'Ddpf') for k in NM3]; H3=[e2kc(k,'Ddpfh')-e2kc(k,'Ddpf') for k in NM3 if 'Ddpfh' in CORR[k]['bases']]
SHARE=[CORR[k]['bases'][TOPB3]['E2']/CORR[k]['ref']['aug-cc-pvqz']['E2'] for k in NM3]
G3=[e2kc(k,'Ddpfg')-e2kc(k,'Ddpf') for k in NM3]   # a g on the heavy atom, our three
assert BOOKREF*KC<1e-4, 'the book MP2 and PySCF disagree'
SHORT={9:'XH₃',10:'Xater'}
WIN=name[9] if LEAD>0.5 else (name[10] if LEAD<-0.5 else None)
def e2range(k):
    v=sorted(abs(CORR[k]['bases'][b]['E2'])*KC for b,_ in B4); q=2 if v[0]<0.1 else 1
    return f'{v[0]:.{q}f} to {v[-1]:.1f}'
def leadrange():
    lo,hi=f'{min(LEADS):.1f}',f'{max(LEADS):.1f}'
    return (lo if lo==hi else lo+' to '+hi)+' kcal/mol'+(' in each' if lo==hi else '')
def verdict_line():
    if WIN: return "On chemistry, " + WIN + " comes first, then " + (name[10] if WIN==name[9] else name[9])
    return "On chemistry, two tie: " + name[a] + " and " + name[b]
def verdict_why():
    if not WIN: return "Counting correlation (above) doesn't separate them."
    return f"At Hartree–Fock the two tie; counting correlation, a pair of {SHORT[9] if WIN==name[9] else SHORT[10]} binds {abs(LEAD):.1f} kcal/mol harder in the largest basis, about {100*abs(LEAD)/(-mp2of('4',TOPB)*KC):.0f}%, and {min(LEADS):.1f} to {max(LEADS):.1f} in every basis tried; correlation's share of the lead holds steady. <b>We take that as settled at this level: XH₃ ahead by {(min(LEADS)+max(LEADS))/2:.1f} ± {(max(LEADS)-min(LEADS))/2:.1f} kcal/mol</b> over {len(LEADS)} bases, the largest {B4[-1][1]} ({CORR['4']['bases'][TOPB]['n']} and {CORR['4.9']['bases'][TOPB]['n']} functions). What could still move it is past MP2, not more basis."
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
  <p><b>Both 4D candidates bind about twice as hard as the census found, and not in a line.</b> Their best pairs are compact and antiparallel: each molecule lends a hydrogen to the other, and the two strong dipoles lie side by side, head to tail. Xater's X–H···X angle is {f(bend(PX)[1],0)}°, where our water's is near straight. Searched the same way, our water finds nothing deeper than its familiar linear bond, which is the check. <b>At Hartree–Fock the tie stands</b>: element 9's XH₃ binds a pair at {f(-P9['best']['E']*KC,1)} kcal/mol and Xater at {f(-PX['best']['E']*KC,1)}, about {f(P9['best']['E']/PW['best']['E'],0)} times our water's {f(-PW['best']['E']*KC,2)}.</p>
  <p>It also changes what the network count above can say. In pairs like these, hydrogens and lone pairs are shared around rings, so "the smaller of the two counts" no longer tells how a liquid holds together. That is the liquid simulation's question, and it's under way.</p>
</section>
<section id="correlation">
  <h3>Correlation breaks the tie</h3>
  <p>Every pair energy so far is Hartree–Fock, which lets each electron feel the others only as an average cloud. What it leaves out, the way electrons dodge one another, is called correlation. The two best pairs differ by a fraction of a kcal/mol, far less than correlation is worth, so the tie can't be read off Hartree–Fock. The pairs were re-scored with it by MP2, second-order perturbation theory, the standard first step past Hartree–Fock (<a href="methods.html#m-mp2">methods</a>), at the best arrangements the search found.</p>
  <p><b>The check, in our world.</b> The book's MP2 gives the same numbers as PySCF, an independent code, to better than a ten-thousandth of a kcal/mol in the same basis. The real question is the basis. The book's is small, and in our world it can be measured against the standard large ones (kcal/mol; negative binds; the correlation column is what MP2 adds to Hartree–Fock):</p>
  <div class="shells"><table class="verdict"><tr><th>our pair</th><th>book: HF</th><th>book: corr.</th><th>grown: HF</th><th>grown: corr.</th>{"".join(f"<th>{t}: HF</th><th>{t}: corr.</th>" for _,t in REFB)}</tr>{ROWS3}</table></div>
  <p>The book's basis overbinds at Hartree–Fock by about half a kcal/mol and catches only a fraction of the correlation; for hydrogen fluoride it even gets its sign wrong. Grown by the same recipe in either world (a second d on the heavy atom does most of the work, then diffuse functions, a second p on hydrogen, two f and a g), it comes within about a tenth of a kcal/mol of the large bases at Hartree–Fock and gets the correlation's sign right, but it still misses {MISS[0]:.2f} to {MISS[1]:.2f} kcal/mol of it against aug-cc-pVQZ, the same way (too little binding) for each pair.</p>
  <p><b>In four dimensions</b> there are no standard bases, so the recipe is grown step by step and the answer watched (kcal/mol; the functions for Xater's pair and XH₃'s):</p>
  <div class="shells"><table class="verdict"><tr><th>basis</th><th>functions</th><th>Xater: HF</th><th>corr.</th><th>MP2</th><th>XH₃: HF</th><th>corr.</th><th>MP2</th><th>XH₃ ahead by</th></tr>{ROWS4}</table></div>
  <p><b>Correlation strengthens XH₃'s pair by {e2range('4.9')} kcal/mol, more as the basis grows. Xater's it barely touches</b>: it weakens it by {e2kc('4','book'):.2f} in the book's basis and strengthens it by {-e2kc('4',TOPB):.2f} in the largest. So XH₃ comes out ahead in every basis, by {leadrange()} ({LEAD:.2f} in the largest, about {100*LEAD/(-mp2of('4',TOPB)*KC):.0f}%). The lead has two parts, and they behave differently. <b>Correlation's part holds steady</b>, {min(E2L):.2f} to {max(E2L):.2f} kcal/mol, growing a little as the basis grows; that's what decides it. Hartree–Fock's part wobbles by a few tenths with the basis ({kcs(min(HFL)/KC)} to {kcs(max(HFL)/KC)}): an f takes some off the lead and a g puts some back, which is all that moved the total. The 4D pairs are further from a finished basis than ours: a second f adds {abs(FX):.2f} and {abs(F9):.2f} kcal/mol to the two pairs' binding and a g {abs(GX):.2f} and {abs(G9):.2f}, where in our world either adds under a tenth of a kcal/mol of correlation ({min(abs(x) for x in F3+G3):.2f} to {max(abs(x) for x in F3+G3):.2f}). With two f and a g our pairs come within {MISS[0]:.2f} to {MISS[1]:.2f} kcal/mol of aug-cc-pVQZ ({min(SHARE)*100:.0f} to {max(SHARE)*100:.0f}% of its correlation caught). A d on hydrogen adds little in either world{f" ({abs(HX):.2f} kcal/mol to Xater's pair)" if HX is not None else ""}. XH₃'s largest pair was computed with its integrals in single precision, which changes these energies by under a hundred-thousandth of a kcal/mol (checked in the book's basis). Why the two differ isn't computed here. The usual reading, from our world: correlation shrinks the dipoles Hartree–Fock overstates, which weakens a pair held by its dipoles, and adds dispersion, which strengthens every pair. Of our three, hydrogen fluoride, the most dipole-bound, gains least from it.</p>
  <p><b>The arrangements are Hartree–Fock's.</b> Moving the second molecule along the line between the heavy atoms (0.3 bohr either way), MP2's best is {abs(SCX[0]):.2f} bohr from Hartree–Fock's for Xater and {abs(SC9[0]):.2f} for XH₃, and gains {SCX[1]:.2f} and {SC9[1]:.2f} kcal/mol there. A full relaxation under MP2 is still to do, but along the bond, where the pull is, it would change nothing that matters.</p>
</section>
<section id="verdict">
  <h3>So which is the water</h3>
  <p><b>{verdict_line()}.</b> {verdict_why()} Searched over every arrangement, each binds a pair about {f(P9['best']['E']/PW['best']['E'],0)} times as hard as our water does, computed the same way. Each makes two hydrogen bonds per molecule, but Xater has a lone pair to spare and element 9's XH₃ a hydrogen. So in a mixture of the two every hydrogen and every lone pair could find a partner, which has no counterpart in our water.</p>
  <p>Which one makes the oceans comes down to which element is commoner, Pxygen or element 9, and that's the abundance question. There's one hint. If the nuclear force carries over, nuclei fill shells the way atoms do, but in a harmonic well: counting its states in 4D gives closed shells at 2, 10, 30 and 70 protons (or neutrons), where ours are at 2, 8, 20, 40. Ten protons and ten neutrons would be doubly closed, as our oxygen-16 is. That nucleus is Pxygen's, so the hint leans to Xater where the chemistry leans to XH₃. It's a count, not a computation, and making elements takes stars, which take gravity, still open.</p>
  <p>Open: correlation past second order (in our world MP2 is usually within a few tenths of a kcal/mol of the best methods for hydrogen-bonded pairs; in 4D that's untested), and the pairs relaxed under it. The mixture itself, and the liquids, which need a simulation. And abundance. Element 18's pair, too large for the sandbox, was run on a bigger machine: by the census's method it binds at {f(-C4[18]['dimer']['E']*KC,1)} kcal/mol, weaker than either candidate's {f(-C4[9]['dimer']['E']*KC,1)} and {f(-C4[10]['dimer']['E']*KC,1)}, and it makes one bond per molecule in a network. It doesn't change the order.</p>
</section>
'''
