# ------------------------------------------------------------------ 11 ten ways to meet (the search, and the miss)
CLU=json.loads(subprocess.run(['node','--input-type=module','-e','import { CLUSTERS } from "'+ATOM+'js/clusters.js"; console.log(JSON.stringify(CLUSTERS));'],capture_output=True,text=True,check=True).stdout)
def cl(k,n): return CLU[k][str(n)]
WORD={3:'three',4:'four',5:'five',6:'six'}
def rng_(n): a,b=min(cl(k,n)['starts'] for k in CLU),max(cl(k,n)['starts'] for k in CLU); return f"{a}" if a==b else f"{a} to {b}"
def CLR(_): return "with " + ", ".join(f"{rng_(n)} starts for {WORD[n]}" for n in (3,4,5,6)) + " (4D's clusters cost more, so where the numbers differ they got the fewer starts, which only makes their counts lower)"
def rg(k,n): r=cl(k,n); return f"{r['levels']}–{r['minima']}" if r['levels']<r['minima'] else str(r['minima'])
def seq(k): return ", ".join(['1']+[rg(k,n) for n in (3,4,5,6)])
hit=lambda k,n: 100*cl(k,n)['best'][0]['hits']/cl(k,n)['starts']
CLV=f"Both worlds' minima multiply, and 4D's much faster." if cl('4','6')['levels']>cl('3','6')['minima'] else "The counts of minima grow in both worlds."
CLW=(f"From two molecules to six, our water's minima go {seq('3')}; Xater's go {seq('4')}, and element 9's XH₃'s {seq('4.9')}. Where two numbers are given, the true count lies between them. The smaller counts only minima whose energies differ, which can merge different arrangements of nearly the same energy; the larger also tells apart arrangements of the same energy by their shape, which can split one soft minimum in two. From five molecules on, even 4D's lower counts are above our water's higher ones. "
     f"The best arrangement gets harder to find as well. Of the starts for six molecules, {hit('3',6):.0f}% found our water's best, {hit('4',6):.0f}% found Xater's and {hit('4.9',6):.1f}% found XH₃'s, which is {cl('4.9',6)['best'][0]['hits']} starts in {cl('4.9',6)['starts']}.")
CLX=(f"And these are what a few hundred starts found, not all there are. XH₃'s six turned up {cl('4.9',6)['minima']} minima in {cl('4.9',6)['starts']} starts, most of them seen once. There the estimate of how many remain ({cl('4.9',6)['chao1']:.0f}) can't be trusted, and nor can the claim that the best one found is the best there is. "
     f"The clusters also hold together far harder in 4D: the best hexamers bind at {-cl('3',6)['best'][0]['E']*KC/6:.1f} kcal/mol per molecule for our water and {-cl('4',6)['best'][0]['E']*KC/6:.1f} for Xater. These are the force field's energies, not Hartree–Fock's, and the force field has no three-body forces.")
def dof(d): return d, d*(d-1)//2
rows=''.join(f'<tr><td class="d{d if d in (3,4) else ""}">{d}D</td><td>{dof(d)[0]}</td><td>{dof(d)[1]}</td><td><b>{sum(dof(d))}</b></td><td>{sum(dof(d))*99}</td></tr>' for d in (2,3,4,5,6))
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
  <p>Two molecules from a random start, sliding down the force field's slope to the nearest minimum, every number at once (BFGS: each step learns how the slope curves). The line under each pair is that descent's energy, and the dashed line is where the census's pair sits. When a descent ends, the molecule takes its basin's colour: arrangements within 0.3 kcal/mol and 0.15 bohr are one basin. A descent that runs out of steps before the slope has gone is counted as <i>unfinished</i>, not as a basin. Turn the 4D tile through w to see the turns you can't see in a slice. <b>race</b> runs whole descents without showing them.</p>
  <div class="liquidCtl" id="searchMode"><span>pace</span><button data-m="watch" class="on">watch</button><button data-m="race">race</button></div>
  <div class="tiles two" id="searchTiles"></div>
  <p class="read" id="searchBasins3"></p>
  <p class="read" id="searchBasins4"></p>
  <canvas id="searchCurve" class="chart"></canvas>
  <p class="read">The curve counts the basins found as starts accumulate. If it keeps rising, the search isn't done. Energies are the force field's; where Hartree–Fock has scored a basin (<a href="census.html#fullsearch">chapter 10</a>) its number is shown beside it.</p>
</section>
<section id="funnel">
  <h3>One pair: a funnel</h3>
  <p><b>For a single pair, the landscape is kind.</b> Of 400 random starts on Xater's force field, all 400 slid into the same arrangement, the compact antiparallel pair of chapter 10. Of 400 for our water, 378 found its one linear hydrogen bond, and the rest drifted apart or ran out of steps. Each pair's landscape is a funnel: one minimum, with every slope leading to it. For our water that's the known answer. Of the ten stationary points mapped on the water pair's surface, only the linear pair is a minimum; the others are passes between copies of it.</p>
  <p>So the miss wasn't the landscape being hard. Any descent over all ten numbers, started almost anywhere, would have found the deeper pair. The miss was choosing the slice. Our first full search made a related mistake, and it is worth saying plainly. It counted descents that stalled before the bottom as separate minima. At a turn wound past many radians, the numbers describing it get badly conditioned and the descent crawls. Six "minima" for Xater were one minimum reached six times, not quite all the way. The descent now re-centres its turn as it goes and stops only when the slope is gone. Chapter 10's energies stand, because each was rescored and relaxed by Hartree–Fock itself.</p>
</section>
<section id="crowds">
  <h3>Many molecules: a maze</h3>
  <p>A pair is the easy case. Add molecules and the minima multiply. Quench a liquid's arrangement to its nearest minimum, the trick behind settling every start above, and the number of distinct minima grows <i>exponentially</i> with the number of molecules. That is the inherent-structure picture of liquids and glasses. Three molecules already have 12 numbers in our world and 20 in 4D; six have 30 and 50.</p>
  <p>So we counted. Clusters of three to six molecules were searched from random starts on each world's force field, {CLR(3)}: every start descended until its slope was gone, and the distinct minima were tallied.</p>
  <canvas id="clusterChart" class="chart"></canvas>
  <div class="shells" id="clusterTab"></div>
  <p class="read">Solid lines: minima found, where two are the same if their energies agree within 0.1 kcal/mol and their heavy atoms' distances within 0.1 bohr. The bar under each point runs down to the count told apart by energy alone. Dashed: the Chao1 estimate of how many there are, from how many were found only once or twice; in brackets in the table where it's higher than the count. The force field is fitted to pairs and adds them up; it has no three-body forces.</p>
  <p><b>{CLV}</b> {CLW}</p>
  <p>{CLX}</p>
  <p>For a liquid this hardly matters: a liquid visits a great many minima, and the simulation samples them rather than finding one. It matters for the solid. Which crystal a 4D water freezes into is a search for one best arrangement among very many, and on this evidence 4D's search space is far larger than ours. That's where the extra turns will bite.</p>
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
  <p>Open, and under way: the known-answer checks, Hartree–Fock relaxations from random placements, longer cluster searches where the counts haven't settled, and re-baking chapter 10's force-field minima with the corrected descent.</p>
</section>
'''
