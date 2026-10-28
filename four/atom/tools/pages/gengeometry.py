# ------------------------------------------------------------------ 1 geometry (exec'd by genpages.py; numbers from js/geometry.js)
GE=json.loads(subprocess.run(['node','--input-type=module','-e','import { numbers } from "'+ATOM+'js/geometry.js"; console.log(JSON.stringify(numbers()));'],capture_output=True,text=True,check=True).stdout)
GD=GE['per']
GEOSLICE=json.loads(subprocess.run(['node','--input-type=module','-e','import * as G from "'+ATOM+'js/geometry.js"; const {V,E}=G.tesseract(); console.log(JSON.stringify([-1.5,-0.5,0,0.5,1.5].map((h)=>G.sliceCorners(V,E,[0.5,0.5,0.5,0.5],h).length)));'],capture_output=True,text=True,check=True).stdout)
GEOSLICE='1, '+', '.join(map(str,GEOSLICE))+', 1'
def pc(v,k=0): return f"{v*100:.{k}f}%"
TAG={'choice':'<span class="tag choice">a choice</span>','follows':'<span class="tag follows">follows</span>','computed':'<span class="tag computed">computed</span>','open':'<span class="tag open">open</span>'}
geometry=f'''<section id="room">
  <h3>Room grows faster {TAG['follows']}</h3>
  <p>Everything in this book happens in four dimensions of space: four directions, each at right angles to the other three, which we call x, y, z and w. Time is extra. Nobody can picture the fourth direction, but we can count in it, and counting is enough. This chapter is the counting. It has no physics in it, and the rest of the book leans on it.</p>
  <p>Start with a sphere: every point at one distance r from a centre. Its surface, and the ball inside it:</p>
  <table class="verdict"><tr><th></th><th>the surface</th><th>the ball inside</th><th>double the radius, and the surface grows</th></tr>
    <tr><td>2D: a circle</td><td>2πr</td><td>πr²</td><td>× {GD['2']['doubling']}</td></tr>
    <tr><td>3D: ours</td><td>4πr²</td><td>(4/3)πr³</td><td>× {GD['3']['doubling']}</td></tr>
    <tr><td><b>4D</b></td><td><b>2π²r³</b></td><td><b>½π²r⁴</b></td><td><b>× {GD['4']['doubling']}</b></td></tr></table>
  <p><b>In four dimensions a sphere's surface grows as r³.</b> So anything that spreads out from a point and isn't used up on the way (light, the lines of a field, heat, a puff of gas) is spread over a surface growing as r³, and thins as 1/r³. Ten times farther away there's a thousandth as much; in ours, a hundredth.</p>
  <canvas class="chart" id="cGeoSpread"></canvas>
  <p class="read" id="kGeoSpread"></p>
  <p>That one fact sets the problem the rest of the book solves. A charge's field, spread over spheres by Gauss's law, falls as 1/r³, so the energy between two charges falls as 1/r². <a href="force.html">chapter 2</a> shows that no atom survives that, and why this universe pins the force at 1/r instead. Light keeps the 1/r³ (<a href="light.html">chapter 3</a>), so a lamp twice as far off is an eighth as bright. And a 4D atom has more neighbours at every distance, which is why 4D's gases are held together by the crowd rather than by their nearest neighbours (<a href="gas.html#far">chapter 13</a>).</p>
</section>
<section id="shells">
  <h3>Counting in thin shells {TAG['follows']}</h3>
  <p>The same counting decides how heat is shared out. Give each way something can move a point: one for each velocity, or one for each wave a box can hold. The ways with speeds near v fill a thin shell round the centre, and a shell holds a number growing as its surface, v<sup>d − 1</sup>. Here are the whole-number points in each shell, counted, against the sphere's surface:</p>
  <canvas class="chart" id="cGeoShells"></canvas>
  <p class="read" id="kGeoShells"></p>
  <p>So in 4D there are many more ways to move fast. That counting is behind the spread of speeds in a gas, and behind each 4D atom's 2kT of heat, ½kT for each of its four directions (<a href="gas.html#ideal">chapter 13</a>). It's behind light too: a box holds waves of frequency ν in proportion to ν³, so a glowing body's spectrum goes as ν⁴ before it turns over, and the heat it gives out grows as T⁵, not our T⁴ (<a href="light.html">chapter 3</a>).</p>
</section>
<section id="corners">
  <h3>Corners and skins {TAG['follows']}</h3>
  <p>A square has 4 corners and a cube 8. A d-dimensional cube has 2<sup>d</sup> corners, and its flat parts of each dimension k number C(d, k) 2<sup>d − k</sup>:</p>
  <table class="verdict"><tr><th></th><th>corners</th><th>edges</th><th>squares</th><th>cubes</th></tr>
    <tr><td>a cube</td><td>{GE['cube'][0]}</td><td>{GE['cube'][1]}</td><td>{GE['cube'][2]}</td><td>1</td></tr>
    <tr><td><b>a tesseract</b></td><td><b>{GE['tesseract'][0]}</b></td><td><b>{GE['tesseract'][1]}</b></td><td><b>{GE['tesseract'][2]}</b></td><td><b>{GE['tesseract'][3]}</b></td></tr></table>
  <p>The corners take over. A ball fills {pc(GD['2']['ballInCube'])} of the square round it, {pc(GD['3']['ballInCube'])} of the cube and {pc(GD['4']['ballInCube'])} of the tesseract; in ten dimensions, a quarter of a percent. And more of a ball lies near its surface: its outer tenth by radius holds {pc(GD['2']['skin10'])} of a disc, {pc(GD['3']['skin10'])} of our ball, and {pc(GD['4']['skin10'])} of a 4D one.</p>
  <p>To see a 4D object we use two pictures, as a flat creature might picture a cube. Its <b>shadow</b> folds w into depth by perspective; its <b>slice</b> is what a 3D creature living at one value of w would see. Colour gives w: pink is kata (w below), green is ana (w above). Turn these, through w too, and slice them:</p>
  <div class="tiles" id="geoTiles"></div>
</section>
<section id="slices">
  <h3>A tesseract passing through {TAG['follows']}</h3>
  <p>A creature living in our 3D space, watching a tesseract drift through it along w, sees only the slice where the two meet. What it sees depends on which way the tesseract comes in. Cube first, a whole cube appears, stays as it is, and vanishes whole. Corner first, it starts as a point, swells into a tetrahedron, has its corners cut off into a truncated tetrahedron, is an octahedron at the middle, and shrinks back the other way: {GEOSLICE} corners, counted where the edges cross the slice.</p>
  <div class="tiles" id="sliceTiles"></div>
  <p class="read">Press "sweep through w" to watch one pass, or drag the slider.</p>
</section>
<section id="directions">
  <h3>More room at right angles {TAG['follows']}</h3>
  <p>Pick two directions at random. In a flat world every angle between them is equally likely. In ours, angles near 90° are likelier: there's a whole circle of directions at right angles to any one, and only a point at 0°. In 4D there's a whole sphere of them, so random directions crowd toward right angles even more:</p>
  <canvas class="chart" id="cGeoAngles"></canvas>
  <p class="read" id="kGeoAngles"></p>
  <p>The mean of |cos θ| between two random directions is {GD['2']['meanAbsCos']:.2f} in 2D, {GD['3']['meanAbsCos']:.2f} in ours and {GD['4']['meanAbsCos']:.2f} in 4D. <b>Aiming is harder</b>: a cone of 30° round a direction catches {pc(GD['3']['within30'],1)} of all directions in ours and {pc(GD['4']['within30'],1)} in 4D. So two 4D molecules tumbling into each other line up well less often, and a search for how they fit best has more to search (<a href="search.html">chapter 12</a>).</p>
  <p><b>More neighbours touch.</b> Around one ball, {GD['2']['kissing']} equal balls can touch it in a plane, {GD['3']['kissing']} in ours and <b>{GD['4']['kissing']} in 4D</b>, at the corners of the 24-cell, the regular shape with no cousin in our world (<a href="shapes.html">chapter 7</a>). Yet the densest packing fills less: {pc(GD['2']['packing'])}, {pc(GD['3']['packing'])}, and {pc(GD['4']['packing'])} in 4D. There's more room at every distance, and less of it gets filled.</p>
</section>
<section id="walks">
  <h3>Lost walkers stay lost {TAG['follows']}</h3>
  <p>A walker on a grid steps to a neighbouring point at random, forever. Will it ever come home? Pólya proved in 1921 that on a line or a plane it always does, eventually, and that from three dimensions on it may not. In ours it comes home {pc(GD['3']['returnChance'],0)} of the time; <b>in 4D, {pc(GD['4']['returnChance'],0)}</b>. There's more room to get lost in.</p>
  <canvas class="chart" id="cGeoWalk"></canvas>
  <p class="read" id="kGeoWalk"></p>
  <p class="read">1,500 walkers in each dimension, simulated in your browser, against the exact limits (dotted), from Montroll's integral.</p>
  <p>That is diffusion. Two molecules drifting apart in a 4D liquid are less likely to meet again, and a wandering molecule wastes fewer steps going back over its own path: in a long walk {pc(1-GD['4']['returnChance'],0)} of the points a 4D walker reaches are new to it, against {pc(1-GD['3']['returnChance'],0)} in ours. More first meetings, fewer second chances.</p>
</section>
<section id="planes">
  <h3>Planes meet at a point {TAG['follows']}</h3>
  <p>Count the directions. A flat thing of dimension a and one of dimension b, sitting in d dimensions at random, share a flat thing of dimension a + b − d, or miss each other entirely if that's negative:</p>
  <table class="verdict"><tr><th>through one point</th><th>in ours</th><th>in 4D</th></tr>
    <tr><td>two lines</td><td>meet only at the point</td><td>meet only at the point</td></tr>
    <tr><td>a line and a plane</td><td>meet only at the point</td><td>meet only at the point</td></tr>
    <tr><td>two planes</td><td><b>share a line</b></td><td><b>meet only at the point</b></td></tr>
    <tr><td>two 3D spaces</td><td>are the same space</td><td>share a plane</td></tr></table>
  <p>Away from a shared point it's the same story, one size up. In ours two lines usually miss each other; in 4D a line usually misses a plane, and two lines almost always do. Two planes still meet, but only at a point.</p>
  <p><b>Two planes can be completely at right angles.</b> The xy plane and the zw plane share only the origin, and every direction in one is at right angles to every direction in the other. Two planes in general sit at two angles to each other, not one. This keeps turning up: the space at right angles to a flat molecule is itself a plane, so Xater's lone pairs make a ring round it (<a href="xater.html">chapter 10</a>), and two planets orbiting in different planes needn't ever come near each other (<a href="planets.html#orbits">chapter 14</a>).</p>
</section>
<section id="turning">
  <h3>Turning happens in planes {TAG['follows']}</h3>
  <p>A turn moves points round within a plane. There's one plane of axes in 2D, {GD['3']['turnPlanes']} in ours (xy, yz, zx) and <b>{GD['4']['turnPlanes']} in 4D</b> (xy, xz, xw, yz, yw, zw), so a 4D turn needs six numbers where ours needs three. In ours every turn has an axis, a line left where it was. In 4D a turn can move every line: turn xy and zw together, each at its own rate, and only the centre stays put. When the two rates are equal, every point runs round a great circle at the same speed (the "two planes at once" tab above). How this gives spin a handedness, and makes a 4D electron's spin feel only half of a magnetic field, is <a href="motion.html">chapter 4</a>.</p>
</section>
<section id="combing">
  <h3>The 3-sphere can be combed {TAG['follows']}</h3>
  <p>Try to comb the hair on a ball flat all over, and there's always a crown: somewhere the hair stands up or swirls round a point. That's a theorem (Poincaré and Brouwer's, the "hairy ball"): any smooth flow over our sphere stops somewhere. The wind on Earth always has a calm spot.</p>
  <p><b>The 3-sphere, the surface of a 4D ball, can be combed.</b> Turn xy and zw at the same rate, as above. Every point of the 3-sphere moves, all at the same speed, and each runs round a great circle. These are Hopf's circles. They fill the 3-sphere and no two meet; any two stay the same distance apart all the way round; and within the 3-sphere each pair is linked once, like two rings of a chain. Projected into our space they make nested tori of circles:</p>
  <canvas class="chart tall hopf" id="cHopf"></canvas>
  <p class="read">Hopf's circles, a few of them, projected from the 3-sphere into our space. Each colour is one torus of circles: pink, the single ring through the middle; then tori of circles farther out, each circle linked through the others. Past the blue ones the circles grow until one becomes the line through the ring's centre. Drag to turn.</p>
  <p>Why it matters here: gas circling a star covers a sphere, so in our world its streams must cross somewhere, and streams that cross collide, lose energy and settle into one plane. That's a reason our solar system is flat. In 4D the streams needn't cross, so a 4D nebula needn't flatten into a disk. {TAG['computed']} Simulated, it flattens only if it spins in one plane; spinning in two, it stops part-way, and at equal rates it stays round (<a href="planets.html#formation">chapter 14</a>).</p>
</section>
<section id="clifford">
  <h3>A flat torus {TAG['follows']}</h3>
  <p>Halfway out among Hopf's circles sits a special torus: the points (cos a, sin a, cos b, sin b)/√2, a circle in xy times a circle in zw. Step along a or along b and you move the same distance, at right angles, wherever you are. <b>The torus is flat</b>, as flat as a sheet of paper: it's an old video game's screen, where leaving one edge brings you back at the opposite one, made without stretching anything. In ours no torus can be flat, because a doughnut's outside curves one way and its inside the other. Clifford's torus also splits the 3-sphere into two equal solid tori, and its diagonals are Hopf circles. Projected into our space, it's a doughnut whose radii are in the ratio √2 to 1:</p>
  <canvas class="chart tall hopf" id="cClifford"></canvas>
  <p class="read">The Clifford torus, projected into our space: the grid of its a and b circles, which in 4D are all the same size and meet at right angles everywhere, and two of its diagonals in colour, Hopf circles, linked. Drag to turn.</p>
</section>
<section id="knots">
  <h3>Knots untie, and gloves turn over {TAG['follows']}</h3>
  <p>A knot in a string unties in 4D: lift one strand off into w, pass it over the other and set it back. No string can be knotted in 4D, and no two rings can be linked. Surfaces can be: a sphere can be knotted in 4D, as a string is in ours.</p>
  <p>A left glove becomes a right one by half a turn through w, as a flat L on a table becomes a backward one by flipping it over through our third direction. So nothing that is left- or right-handed in our world is handed in 4D. A 4D molecule needs five different neighbours round one atom to be handed (<a href="darbon.html">chapter 8</a> has both to turn).</p>
</section>
<section id="geometrynext">
  <h3>Checked, and what it gives the rest</h3>
  <p class="read">Checked here (selftests 37 and 38): the sphere formulas against random points, the spread of directions against sampling, the shells' counts against the sphere's surface, Pólya's chances (Montroll's integral against known values, and against walks), the corner-first slices' corners, the Clifford torus's flatness and its √2 doughnut, the 24 shortest vectors of the densest 4D lattice, the general-position counts against random flats, a double rotation with no line left in place, and Hopf's circles: unit speed everywhere, no two meeting, each pair the same distance apart. This chapter is mathematics, so everything in it follows, nothing is chosen; the physics starts in <a href="force.html">chapter 2</a>.</p>
</section>
'''
