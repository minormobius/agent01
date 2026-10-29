# ------------------------------------------------------------------ 11 ten ways to meet (the search, and the miss)
AUD=json.loads(subprocess.run(['node','--input-type=module','-e','import { PROBES } from "'+ATOM+'js/audit.js"; import { PAIRMIN } from "'+ATOM+'js/pairmin.js"; console.log(JSON.stringify({ PROBES, PAIRMIN }));'],capture_output=True,text=True,check=True).stdout)
PR,PM=AUD['PROBES'],AUD['PAIRMIN']
# Xater's best pair as the census re-bake left it (audit-2), before the rebuilt descent took it lower: history, kept by hand
XFUNNEL,XFUNNEL_DXX=26.938,4.883
# (binding energies, kcal/mol, positive as kc() gives them)
# the 4D placements' relaxations, the four deepest of each pair after two rounds of 5.5 h (audit-3, audit-4; a cut run
# writes nothing, so these are from the logs on atom4-data, runs/audit-4/deepen-*/0.log): the deepest each reached
# (kcal/mol, bound), the last step's fall, and whether it ended (no lower point)
DEEPEN={'4':[(27.351,0.003,False),(26.957,0.036,False),(26.330,0.066,False),(25.454,0.117,False)],
        '4.9':[(27.543,0.001,True),(27.541,0.005,False),(27.524,0.002,False),(25.631,0.448,False)]}
def _deep(k):
    b=kc(PM[k]['best']['E']); at=[x for x in DEEPEN[k] if b-x[0]<0.05]; off=[x for x in DEEPEN[k] if b-x[0]>=0.05]
    return b,at,off
def _deeptxt():
    WORDS={1:'one',2:'two',3:'three',4:'four'}; NM={'4':'Xater','4.9':'XH₃'}; parts=[]; rest=[]
    for k in ('4.9','4'):
        b,at,off=_deep(k); ended=[x for x in at if x[2]]; near=[x for x in at if not x[2]]
        bits=[]
        if ended: bits.append(f"{WORDS[len(ended)]} ended in the best pair ({f(b,2)} kcal/mol)")
        if near: bits.append(f"{WORDS[len(near)]} {'more are' if ended and len(near)>1 else 'more is' if ended else 'is' if len(near)==1 else 'are'} within {f(max(b-x[0] for x in near)+0.005,2)} of {'it' if ended else 'its best ('+f(b,2)+')'}, the gradient almost gone")
        if bits: parts.append(f"of {NM[k]}'s, " + " and ".join(bits))
        rest+= [(NM[k],x) for x in off]
    lo=min(b-x[0] for k in DEEPEN for b,_,o in [_deep(k)] for x in o); hi=max(b-x[0] for k in DEEPEN for b,_,o in [_deep(k)] for x in o)
    fl=[x[1] for _,x in rest]
    by=" and ".join(f"{n}'s at {', '.join(f(x[0],2) for m,x in rest if m==n)}" for n in dict.fromkeys(m for m,_ in rest))
    t="; ".join(parts); t=t[0].upper()+t[1:]
    return f"{t}. The other {WORDS[len(rest)]} are still crossing flat ground off saddles, {f(lo,1)} to {f(hi,1)} kcal/mol above the best pair and falling by {f(min(fl),2)} to {f(max(fl),2)} a step ({by}); their energies are cached, so another round would pick up where they stopped."
def kc(x): return -x*KC
BOHR_A=0.529177
# the first audit's miss, kept as history (audit-1, on the compute runner, 2026-10-27): the straight
# F–H···F–H chain the old relaxation stopped on. No bake carries it any more, since the fixed descent replaced it
HF_LINE=-3.774
def _hfgeom(b):
    import math
    A,B=b['A'],b['B']; d=lambda p,q: math.dist(p,q)
    Dn,Ac=(A,B) if d(A[1],B[0])<d(B[1],A[0]) else (B,A)
    def ang(p,q,r):
        u=[a-c for a,c in zip(p,q)]; v=[a-c for a,c in zip(r,q)]; return math.degrees(math.acos(sum(x*y for x,y in zip(u,v))/math.hypot(*u)/math.hypot(*v)))
    return {'donor':ang(Dn[0],Dn[1],Ac[0]),'acceptor':ang(Dn[0],Ac[0],Ac[1]),'FF':d(Dn[0],Ac[0])*0.529177}
HFG=_hfgeom(PM['3.9']['best'])
CLU=json.loads(subprocess.run(['node','--input-type=module','-e','import { CLUSTERS } from "'+ATOM+'js/clusters.js"; console.log(JSON.stringify(CLUSTERS));'],capture_output=True,text=True,check=True).stdout)
def cl(k,n): return CLU[k][str(n)]
WORD={3:'three',4:'four',5:'five',6:'six',7:'seven'}
NS=sorted(int(n) for n in CLU['3'])
def rng_(n): a,b=min(cl(k,n)['starts'] for k in CLU),max(cl(k,n)['starts'] for k in CLU); return f"{a}" if a==b else f"{a} to {b}"
EQ=[n for n in NS if len({cl(k,n)['starts'] for k in CLU})==1 and cl('3',n)['starts']>1000]   # the sizes searched at equal effort
def CLR(_): return ("with " + " and ".join(f"{cl('3',n)['starts']} starts for {WORD[n]}" for n in EQ) + ", the same in every world"
                    + "; " + ", ".join(WORD[n] for n in NS if n not in EQ) + " had the first count's " + f"{min(cl(k,n)['starts'] for k in CLU for n in NS if n not in EQ)} to {max(cl(k,n)['starts'] for k in CLU for n in NS if n not in EQ)}")
def rg(k,n): r=cl(k,n); return f"{r['floor']}–{r['minima']}" if r['floor']<r['minima'] else str(r['minima'])
def seq(k): return ", ".join(['1']+[rg(k,n) for n in NS])
hit=lambda k,n: 100*cl(k,n)['best'][0]['hits']/cl(k,n)['starts']
# from how many molecules on even 4D's floors are above our water's ceiling (computed, not asserted)
FROM=next((n for n in NS if all(cl(k,m)['floor']>cl('3',m)['minima'] for k in ('4','4.9') for m in NS if m>=n)),None)
CLV="Both worlds' minima multiply, and 4D's much faster." if FROM else "The counts of minima grow in both worlds."
n7=max(NS)
CLW=(f"From two molecules to {WORD[n7]}, our water's minima go {seq('3')}; Xater's go {seq('4')}, and element 9's XH₃'s {seq('4.9')}. Where two numbers are given, the true count lies between them. The larger tells apart arrangements of the same energy by their shape, which can split one soft minimum in two. The smaller merges any two within a test three times looser, which can merge two different ones. "
     + (f"From {WORD[FROM]} molecules on, even 4D's smaller counts are above our water's larger ones. " if FROM else "")
     + f"The best arrangement gets harder to find as well. Of the starts for six molecules, {hit('3',6):.0f}% found our water's best, {hit('4',6):.0f}% Xater's and {hit('4.9',6):.0f}% XH₃'s; for {WORD[n7]}, {hit('3',n7):.0f}%, {hit('4',n7):.1f}% and "
     + (f"one start in {cl('4.9',n7)['starts']}." if cl('4.9',n7)['best'][0]['hits']==1 else f"{hit('4.9',n7):.1f}%."))
CLX=(f"None of this is the whole count. Only our water's six has nearly settled: the second half of its starts added {cl('3',6)['late']} new minima. Everywhere else the discovery curve is still climbing. For {WORD[n7]} molecules the second half of the starts added {cl('3',n7)['late']} new minima for our water, {cl('4',n7)['late']} for Xater and {cl('4.9',n7)['late']} for XH₃, where {cl('4.9',n7)['seenOnce']} of its {cl('4.9',n7)['minima']} minima were seen just once. "
     + ("There the best one found, seen only once, is not shown to be the best there is. " if cl('4.9',n7)['best'][0]['hits']==1 else "")
     + f"The clusters also hold together far harder in 4D: the best of {WORD[n7]} binds at {-cl('3',n7)['best'][0]['E']*KC/n7:.1f} kcal/mol per molecule for our water and {-cl('4',n7)['best'][0]['E']*KC/n7:.1f} for Xater. These are the force field's energies, not Hartree–Fock's, and the force field has no three-body forces.")
def dof(d): return d, d*(d-1)//2
rows=''.join(f'<tr><td class="d{d if d in (3,4) else ""}">{d}D</td><td>{dof(d)[0]}</td><td>{dof(d)[1]}</td><td><b>{sum(dof(d))}</b></td><td>{sum(dof(d))*99}</td></tr>' for d in (2,3,4,5,6))
DEEPTXT=_deeptxt()
search=f'''<section id="miss">
  <h3>The miss</h3>
  <p><a href="census.html">Chapter 10</a> first reported that a pair of Xater molecules binds at {f(-PX['census']*KC,1)} kcal/mol. A liquid run on a force field fitted to Hartree–Fock pairs then held pairs together harder than that. Searched properly, the pair binds at {f(-PX['best']['E']*KC,1)}: twice as hard, and in a different shape. Nothing was wrong with the arithmetic. The census had only looked in one place. It slid one molecule along a line and tilted it in one plane, two numbers, inside the family of arrangements our water's hydrogen bond makes. That family was our world's intuition, carried into a world where it doesn't hold.</p>
  <p>This chapter is about that miss, because it holds a finding. Molecules have many more ways to meet in four dimensions than in three. Any search that stops looking early can miss the answer, and in 4D there is far more room to miss it in.</p>
</section>
<section id="counting">
  <h3>Counting the ways</h3>
  <p>To place one rigid molecule against another you move it, one number for each direction, and turn it, one number for each <i>plane</i> of turning (<a href="motion.html">chapter 3</a>). In d dimensions that's d moves and d(d − 1)/2 turns. Moving grows like d and turning like d², so as dimensions are added, turning takes over:</p>
  <div class="shells"><table><tr><th>space</th><th>moves</th><th>turns</th><th>a pair: numbers to search</th><th>100 molecules</th></tr>{rows}</table></div>
  <p class="read">A rigid molecule's pose in d dimensions takes d(d + 1)/2 numbers; a pair's relative pose takes the same, and N molecules take N − 1 times as many. Bendable molecules add their own shapes on top.</p>
  <p>Our water pair has six numbers to get right. Xater's has ten, and six of those are turns. A search that checks ten values along each number checks a million arrangements in our world and ten billion in 4D. Nobody searches that way; a descent from a random start follows the slope instead. But it shows how thin a two-number slice is: the census looked at a sheet through a ten-dimensional space.</p>
</section>
<section id="watch">
  <h3>Watch it search</h3>
  <p>Two molecules from a random start, sliding down the force field's slope to the nearest minimum, every number at once (BFGS: each step learns how the slope curves). The line under each pair is that descent's energy, and the dashed line is where the census's pair sits. When a descent ends, the molecule takes its basin's colour: arrangements within 0.3 kcal/mol and 0.15 bohr are one basin. A descent that runs out of steps before the slope has gone is counted as <i>unfinished</i>, not as a basin. Turn the 4D view through w to see the turns you can't see in a slice. <b>race</b> runs whole descents without showing them.</p>
  <div class="liquidCtl" id="searchMode"><span>pace</span><button data-m="watch" class="on">watch</button><button data-m="race">race</button></div>
  <div class="tiles" data-all id="searchTiles"></div>
  <p class="read" id="searchBasins3"></p>
  <p class="read" id="searchBasins4"></p>
  <canvas id="searchCurve" class="chart"></canvas>
  <p class="read">The curve counts the basins found as starts accumulate. If it keeps rising, the search isn't done. Energies are the force field's; where Hartree–Fock has scored a basin (<a href="census.html#fullsearch">chapter 10</a>) its number is shown beside it.</p>
</section>
<section id="funnel">
  <h3>One pair: a funnel</h3>
  <p><b>For a single pair, the landscape is kind.</b> Of 400 random starts on Xater's force field, all 400 slid into the same arrangement, the compact antiparallel pair of <a href="census.html#fullsearch">chapter 10</a>. Of 400 for our water, 378 found its one linear hydrogen bond, and the rest drifted apart or ran out of steps. Each pair's landscape is a funnel: one minimum, with every slope leading to it. For our water that's the known answer. Of the ten stationary points mapped on the water pair's surface, only the linear pair is a minimum; the others are passes between copies of it.</p>
  <p>So the miss wasn't the landscape being hard. Any descent over all ten numbers, started almost anywhere, would have found the deeper pair. The miss was choosing the slice. Our first full search made a related mistake, and it is worth saying plainly. It counted descents that stalled before the bottom as separate minima. At a turn wound past many radians, the numbers describing it get badly conditioned and the descent crawls. Six "minima" for Xater were one minimum reached six times, not quite all the way. The descent now re-centres its turn as it goes and stops only when the slope is gone. <a href="census.html">Chapter 10</a>'s energies stand, because each was rescored and relaxed by Hartree–Fock itself.</p>
</section>
<section id="crowds">
  <h3>Many molecules: a maze</h3>
  <p>A pair is the easy case. Add molecules and the minima multiply. Quench a liquid's arrangement to its nearest minimum, the trick behind settling every start above, and the number of distinct minima grows <i>exponentially</i> with the number of molecules. That is the inherent-structure picture of liquids and glasses. Three molecules already have 12 numbers in our world and 20 in 4D; seven have 36 and 60.</p>
  <p>So we counted. Clusters of three to {WORD[n7]} molecules were searched from random starts on each world's force field, {CLR(3)}. Every start descended until its slope was gone, and the distinct minima were tallied.</p>
  <canvas id="clusterChart" class="chart"></canvas>
  <div class="shells" id="clusterTab"></div>
  <p class="read">Solid lines: minima found, where two are the same if their energies agree within 0.1 kcal/mol and their heavy atoms' distances within 0.1 bohr. The bar under each point runs down to the count when minima within 0.3 kcal/mol and 0.5 bohr are merged. Dashed: the Chao1 estimate of how many there are, from how many were found only once or twice, drawn only where fewer than half were seen just once (beyond that it's a guess bigger than anything measured, and the table says "still climbing"). The force field is fitted to pairs and adds them up; it has no three-body forces.</p>
  <p><b>{CLV}</b> {CLW}</p>
  <p>{CLX}</p>
  <h4>Watch five at once</h4>
  <p>Here five molecules do it live, on the same force field. Each start drops them at random in a ball and lets them slide downhill together until nothing pushes any more; then the next start. Start s here is the runner's start s, with the same seed and the same descent, so where it ends can be named from the runner's list. Five waters search {(5-1)*6} numbers and five Xaters {(5-1)*10}. Of the runner's {CLU['3']['5']['starts']} starts with five waters, {CLU['3']['5']['best'][0]['hits']*100//CLU['3']['5']['starts']}% found the best arrangement; of its {CLU['4']['5']['starts']} with five Xaters, {CLU['4']['5']['best'][0]['hits']*100//CLU['4']['5']['starts']}%.</p>
  <div class="tiles" id="clusterTiles"></div>
  <p class="read">Each molecule's heavy atom has its own colour, so you can follow it. "watch" runs a descent at an easy pace; "race" runs as fast as your device allows. Energies are the force field's, for the whole cluster, in kcal/mol. A tab that isn't showing pauses.</p>
  <p>For a liquid this hardly matters: a liquid visits a great many minima, and the simulation samples them rather than finding one. It matters for the solid. Which crystal a 4D water freezes into is a search for one best arrangement among very many, and on this evidence 4D's search space is far larger than ours. That's where the extra turns will bite.</p>
  <p>It may also shape the freezing itself. A liquid with more minima to visit has more entropy, and a crystal freezes where its energy gain pays for that entropy (T = ΔH/ΔS), so more minima push the freezing point down, and many nearly equal crystals make freezing slow, grainy and glassy. But 4D's clusters bind several times harder, which pushes it up. The prediction, for the liquid simulation to test: a freezing point low <i>for its cohesion</i>, and a liquid that would rather be a glass.</p>
</section>
<section id="promise">
  <h3>What a search can promise</h3>
  <p>A search gives one guarantee. The energy it finds is one that some arrangement really has, so the true best can only be lower. <b>Every binding energy in these chapters is a floor: more searching can only make it stronger.</b> Doubling Xater's pair didn't break the census's conclusion that element 9's XH₃ and Xater tie as the water. It made both stronger.</p>
  <p>What a search can't promise is that it's finished. That has to be argued separately, by these checks:</p>
  <ul>
    <li><b>Known answers.</b> The same search, run on our world's pairs whose best arrangements are published (water, hydrogen fluoride, ammonia), must find them.</li>
    <li><b>The discovery curve.</b> Starts are added until new basins stop appearing, and the count of basins found only once estimates how many remain unseen.</li>
    <li><b>The force field's blind spots.</b> The force field is a smooth fit, and it can blur two of Hartree–Fock's minima into one. So Hartree–Fock itself is relaxed from random placements, without the force field's guidance.</li>
    <li><b>The other searches in this position.</b> The census's shapes were built symmetric and then nudged, which shows each is <i>a</i> minimum, not <i>the</i> minimum. The table's electron configurations were chosen among candidates. Each gets the same audit.</li>
  </ul>
  <h4>The audit, run</h4>
  <p>On a bigger machine (the compute runner), the first three checks were run.</p>
  <p><b>Known answers: all three found, the third only after a fix.</b> For our ammonia pair the full search finds the best arrangement the census's scan had, {f(kc(PM['3.7']['best']['E']),2)} kcal/mol with the nitrogens {f(PM['3.7']['best']['dXX']*BOHR_A,2)} Å apart. (The real ammonia pair is famously floppy, its hydrogen bond barely holding a shape. Hartree–Fock on a small basis gives a definite one.) For our water it finds the linear hydrogen bond at {f(kc(PM['3']['search']),2)} kcal/mol, level with the census's carefully relaxed pair ({f(kc(PM['3']['census']),2)}).</p>
  <div class="box"><p><b>How we got it wrong: hydrogen fluoride.</b> The first audit failed here. The force field's best arrangement is a straight chain, F–H···F–H, and the relaxation then used, small turns along one pose number at a time, never left the line: it stopped at {f(-HF_LINE,2)} kcal/mol, short of the census's bent pair ({f(kc(PM['3.9']['census']),2)}) and of the measured structure, which is bent. The straight chain isn't a minimum but a saddle. The way down bends the chain while swinging the partner round, a combination of pose numbers, none of them downhill alone, and so gentle that its curvature sits near Hartree–Fock's own noise.</p>
  <p>So the relaxation was rebuilt: it measures the whole curvature, steps off a saddle along its downhill direction, and at an apparent bottom probes up to 1.5 radians along every principal direction. From the straight chain it now walks off in six steps and down to <b>{f(kc(PM['3.9']['best']['E']),2)} kcal/mol, bent</b>: the donor's F–H···F nearly straight ({HFG['donor']:.0f}°), the acceptor's F···F–H at {HFG['acceptor']:.0f}°, the fluorines {HFG['FF']:.2f} Å apart (measured: about 170°, 117° and 2.72 Å; Hartree–Fock runs a little long and open here). The census's own pair, relaxed the same way, lands on the same minimum. A search goes where its descent can take it, so the descent is part of what has to be checked.</p></div>
  <p><b>Hartree–Fock without the force field: nothing deeper.</b> Two molecules were placed at random in close contact and scored by Hartree–Fock itself: {PR['3']['placements']} placements for our water, {PR['4']['placements']:,} for Xater, {PR['4.9']['placements']:,} for XH₃. None came out deeper than the best pair. The deepest reached {f(kc(PR['3']['deepest']),1)} of water's {f(kc(PR['3']['best']),1)} kcal/mol, {f(kc(PR['4']['deepest']),1)} of Xater's {f(kc(PR['4']['best']),1)}, and {f(kc(PR['4.9']['deepest']),1)} of XH₃'s {f(kc(PR['4.9']['best']),1)}. On the attractive placements the force field is off by {f(PR['3']['rms']*KC,1)} kcal/mol (rms) for our water and {f(PR['4']['rms']*KC,1)} and {f(PR['4.9']['rms']*KC,1)} for the 4D pair. On single placements it misses up to {f(PR['4.9']['shallowest']*KC,0)} kcal/mol of the pull, so it does have blind spots in 4D. None hid a deeper pair among these placements.</p>
  <p><b>The census re-baked with the corrected descent: it stands.</b> The best pairs come out at {f(XFUNNEL,2)} and {f(kc(PM['4.9']['best']['E']),2)} kcal/mol, as before. The force field's six "distinct" minima per molecule, which the faulty descent had reported, collapse to one each: the funnel.</p>
  <p><b>The new descent, run on all three.</b> For our water and XH₃ it confirms the best pairs ({f(kc(PM['3']['best']['E']),2)} and {f(kc(PM['4.9']['best']['E']),2)} kcal/mol). For Xater it set off from the {f(XFUNNEL,2)} pair and, over two runs' time, relaxed it to <b>{f(kc(PM['4']['best']['E']),2)} kcal/mol</b>, where it converged: the same arrangement, the two Xs moved from {f(XFUNNEL_DXX*BOHR_A,2)} to {f(PM['4']['best']['dXX']*BOHR_A,2)} Å apart. <b>The tie holds and narrows</b>: XH₃ is ahead by {f(kc(PM['4.9']['best']['E']-PM['4']['best']['E']),2)} kcal/mol, where it led by {f(kc(PM['4.9']['best']['E'])-XFUNNEL,2)}. Both gaps are far smaller than what Hartree–Fock leaves out (correlation), so on chemistry the two still tie.</p>
  <p><b>The deepest random placements, relaxed.</b> Water's four deepest ended in the best pair or in shallower minima, never deeper. For the 4D pairs each step of the descent costs over half an hour of Hartree–Fock; their four deepest each ran two rounds of five and a half hours. {DEEPTXT} None has gone deeper than the best pair.</p>
  <p>So far no check has found a different, deeper arrangement than the 4D best pairs, and hydrogen fluoride is found. But the lesson stands: random placements are thin in ten dimensions, and a search goes where its force field and its descent lead. Still open: the 4D relaxations above, longer cluster searches where the counts haven't settled, giving the force field the lone pairs' directions, and the other searches in this position.</p>
</section>
'''
