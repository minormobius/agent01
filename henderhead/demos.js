// demos.js — the shelf and the queue.
//
// One record per demo of Matt Henderson's that this site has rebuilt or would
// like to. `state` is the only field that matters operationally:
//
//   built    — live here, with a link to his original on the page
//   queued   — we would rebuild it; nothing has been written
//
// There is deliberately no third state for "in progress by a bot". The
// follow-along pipeline described on the front page does not exist yet and is
// not to be built before the consent gate in /#consent is passed; if it ever
// is, this file is where it would take its work from, and a `state` of
// `declined` is the kill switch for one entry.
//
// `post` is the rkey of the original on Bluesky; `title` quotes his own words
// for it. Nothing here copies his renders — the links go to them instead.

export const AUTHOR = {
  name: 'Matt Henderson',
  handle: 'matthen.com',
  site: 'https://matthen.com',
  bsky: 'https://bsky.app/profile/matthen.com',
  bio: 'Maths animations, dialogue systems research',
};

export const postURL = (rkey) => `${AUTHOR.bsky}/post/${rkey}`;

export const DEMOS = [
  {
    id: 'sand',
    state: 'built',
    href: './sand/',
    title: 'How to make an ellipse, using sand and physics',
    date: '2026-09-20',
    post: '3mvxdzadgds2z',
    quote: 'How to make an ellipse, using sand and physics',
    tags: ['geometry', 'granular', 'rust→wasm'],
    what: 'Sand pours onto a plate with a hole in it. A cone builds under the pour, a funnel opens around the hole, and the crease where the two surfaces meet is an ellipse whose foci are the pour point and the hole.',
    built: 'The sand is simulated rather than drawn — every cell topples against its neighbours until nothing stands steeper than the angle of repose — and the curve is then measured off it by a fitter told nothing about where the two features are. It comes back with 2c/2a = 0.73 against the 0.737 measured off his own video. The page also answers the obvious follow-up: you cannot get a parabola out of two holes, because two points can only give you a sum or a difference of distances. The missing focus is a slot.',
  },
  {
    id: 'ball',
    state: 'built',
    href: '/ball/',
    date: '2026-09-14',
    post: '3mvi6wjvk6k2p',
    title: 'Chaos from bouncing a ball in a circle',
    quote: 'The system seems to move between Stable Eras and Chaotic Eras, where it is hard to predict four bounces ahead.',
    what: 'A ball bouncing under gravity inside a circle, with a few hundred slightly-mistaken copies of it fanning out ahead. The gravity is the whole thing: without it the same picture is integrable and four bounces ahead is perfectly predictable.',
    built: 'Bounces solved exactly rather than stepped — on the wall the quartic loses its constant term and the next bounce is a closed-form cubic root — so the energy drifts by less than a part in a billion over five thousand bounces. The spread of the fan is plotted, so the Eras are measured; and the phase portrait shows where they come from, which turned out not to be what we first assumed.',
    tags: ['rust', 'wasm', 'canvas'],
  },
  {
    id: 'wheel',
    state: 'built',
    href: '/wheel/',
    date: '2026-09-13',
    post: '3mvg57cbsuc23',
    title: 'Approximating the Lorenz attractor with a chaotic leaky water wheel',
    quote: 'The orange dot is the centre of mass of the water. It traces (a projection of) the familiar attractor as the wheel spins seemingly randomly left and right.',
    what: 'Buckets hang from a wheel, water is poured in at the top, every bucket leaks. That is the whole machine, and it is the Lorenz system exactly — not by analogy. The centre of mass of the water moves in the Lorenz (Y, Z) plane, so the orange dot is not drawing something that looks like the attractor, it is drawing the attractor.',
    built: 'The wheel, its twin started a billionth apart, the continuum reduction and the Lorenz equations all run in lockstep from the same state. The knobs the video cannot have: turn the inflow up through ρ = 1 and ρ_Hopf and watch it go from standing to spinning to chaotic, and turn the damping down until it cannot be chaotic at any flow.',
    tags: ['rust', 'wasm', 'canvas'],
  },
  {
    id: 'craft',
    state: 'built',
    href: '/craft/',
    date: '2026-09-11',
    post: '3mva6fo4ew22c',
    title: 'A cellular automaton from Minecraft crafting recipes',
    quote: 'I added random motion to keep the grid alive — and banned buttons.',
    what: 'Items drift around a grid of inventory slots, and whenever they drift into the shape of a crafting recipe they are crafted. Seed it with logs, planks and cobblestone and every boat, bowl and pickaxe that appears is something the shuffling stumbled into.',
    built: 'The rule read off the video frame by frame, in a Rust→WASM engine. The recipe book is the whole transition rule and every entry is clickable, because switching one off is the fastest way to understand what it was doing — which is what his banned buttons were about.',
    tags: ['rust', 'wasm', 'canvas'],
  },
  {
    id: 'cf',
    state: 'built',
    href: '/cf/',
    date: '2026-09-09',
    post: '3mv2xgpwkg22t',
    title: 'Drawing a picture from the continued fraction of a number',
    quote: 'The continued fraction terms drive a Fourier series.',
    what: 'The convergent denominators q_k of a number become the frequencies of a Fourier series, each with amplitude q_k^-α. Rationals give a few clean lobes; the golden ratio gives the roughest curve there is, because its q_k grow the slowest of any number.',
    built: 'Exact continued fractions in Rust — Euclid in 128-bit integers, a separate periodic route for quadratic surds — compiled to WebAssembly. Sweep x from 0 to 1, stack thousands of curves into one density plot, watch the epicycles turn.',
    tags: ['rust', 'wasm', 'canvas'],
  },
  {
    id: 'maze-hang',
    state: 'queued',
    date: '2026-08-26',
    post: '3mtyxnfgd4s2j',
    title: 'To tell if a maze is solvable, just hang it by its corners',
    quote: 'If it tears into pieces, you’ve found a solution.',
    what: 'A maze’s walls are connected iff the maze is unsolvable — so a physical pull on opposite corners is a topological solver.',
    why: 'Wants a real cloth/mass-spring solve to be convincing, and a maze generator to feed it. The payoff is that you can drag it yourself.',
    tags: ['physics', 'graphs'],
  },
  {
    id: 'julia-ring',
    state: 'queued',
    date: '2026-09-07',
    post: '3muvuqcrsk22g',
    title: 'A ring built from the Julia sets found along the main cardioid of the Mandelbrot set',
    what: 'Walk the boundary of the main cardioid and the Julia set at each point is a different closed curve; laid side by side they make a ring.',
    why: 'Per-pixel escape-time on the GPU, one Julia set per angle. The interactive version is obvious: scrub the angle, zoom the Mandelbrot alongside.',
    tags: ['webgl', 'fractals'],
  },
  {
    id: 'rgb-cube',
    state: 'queued',
    date: '2026-08-16',
    post: '3mt6zfn7l3c2b',
    title: 'Drawing all 16,777,216 possible 24-bit RGB colours in one 2D image, each exactly once',
    what: 'A bijection from the 256³ colour cube onto a 4096² image, walked so that neighbours in the cube stay neighbours on the plane.',
    why: 'A space-filling-curve problem with a hard constraint you can check: every colour exactly once. Verifiable, which makes it a good rebuild.',
    tags: ['canvas', 'combinatorics'],
  },
  {
    id: 'knight-distance',
    state: 'queued',
    date: '2026-08-31',
    post: '3muem5hjttc2x',
    title: 'The Knight’s Distance Function',
    quote: 'how many knight moves a square is from another',
    what: 'Breadth-first search from the centre of an unbounded board; the distance settles into a closed form away from the origin, with exceptions near it.',
    why: 'Small, exact, and the closed form versus the BFS is a comparison you can put on screen side by side.',
    tags: ['graphs', 'canvas'],
  },
  {
    id: 'pid',
    state: 'queued',
    date: '2026-08-25',
    post: '3mtw6yfbzys2m',
    title: 'Playing with the P, I and D weights in a PID controller',
    what: 'A ball balanced on a beam, with the three gains exposed as sliders.',
    why: 'The most straightforwardly interactive thing in the whole feed — three numbers and an integrator, and it teaches control theory in a minute.',
    tags: ['physics', 'controls'],
  },
  {
    id: 'reaction-diffusion',
    state: 'queued',
    date: '2026-08-30',
    post: '3muc7p5juas2x',
    title: 'Reaction Diffusion in Photoshop',
    quote: 'Blur, Sharpen, Posterize, repeat.',
    what: 'Gray–Scott patterns emerging from nothing but three ordinary image filters applied in a loop.',
    why: 'Three shader passes. The point is that the filters are the reaction and the diffusion, which is much more fun to demonstrate than to say.',
    tags: ['webgl', 'shaders'],
  },
  {
    id: 'voronoi-cones',
    state: 'queued',
    date: '2026-08-27',
    post: '3mu3ti7yd4c2y',
    title: '2D Voronoi cells from 3D cones',
    what: 'Put a cone over each site and look from above: the depth buffer does the Voronoi diagram for you.',
    why: 'Fifteen lines of WebGL, and the moment the camera tilts, the trick becomes obvious. Best rebuilt with the camera under your control.',
    tags: ['webgl', 'geometry'],
  },
  {
    id: 'parabola-circles',
    state: 'queued',
    date: '2026-08-27',
    post: '3mu3nfjb3gs2p',
    title: 'A parabola is formed when circles radiating from a point meet lines moving at the same speed',
    quote: 'this is equivalent to slicing a cone parallel to its side.',
    what: 'The focus–directrix definition, animated, and then shown to be the conic section.',
    why: 'Pure 2D and pure geometry; the interactive knob is the eccentricity, which turns it into the whole family of conics.',
    tags: ['canvas', 'geometry'],
  },
  {
    id: 'penrose-life',
    state: 'queued',
    date: '2026-08-15',
    post: '3mt57wzxxus2m',
    title: 'Game of Life on Penrose tiles',
    what: 'Conway’s rules on an aperiodic tiling, where cells have varying numbers of neighbours and nothing can glide.',
    why: 'We already have a Penrose tiler in this repo, in packages/tilings. The rule variants are the interesting knob.',
    tags: ['tilings', 'automata'],
  },
  {
    id: 'slow-light',
    state: 'queued',
    date: '2026-09-03',
    post: '3mulqrjypqk2x',
    title: 'What if light travelled super slow?',
    quote: 'turning a lamp on and off in an infinite mirror hallway',
    what: 'Finite light speed in a hall of mirrors, so you watch the reflections arrive one after another.',
    why: 'A ray-marched shader with a time-of-flight term. The knob is the speed of light, which is a very good knob.',
    tags: ['webgl', 'optics'],
  },
  {
    id: 'three-ears',
    state: 'queued',
    date: '2026-09-02',
    post: '3mujgsfvvqs2q',
    title: 'What if our ears were like our eyes, and only had three types of receptor?',
    quote: 'Interestingly speech is still more or less intelligible.',
    what: 'Collapse the audible spectrum onto three overlapping response curves and resynthesise, the way three cone types collapse light.',
    why: 'Needs the Web Audio API and a microphone, which makes it the only one on this list with a privacy question attached. Worth doing carefully or not at all.',
    tags: ['audio', 'dsp'],
  },
];

export const BUILT = DEMOS.filter((d) => d.state === 'built');
export const QUEUED = DEMOS.filter((d) => d.state === 'queued');
