# PARTICLE-CHORA — particle-hedra, one dimension up

`ana.mino.mobi/chora/`. Jeffrey Ventrella's [*Particle-hedra: Generating Polyhedra with Inter-Particle
Forces*](https://www.ventrella.com/particlehedra/paper.pdf) (Bridges 2024), ported, checked against the paper, and run in
4D.

## The system (`js/particles.js`, no DOM)

Every particle is pulled to the centre by −a·p (a = 0.2) and pushed from every other within a cut-off m by
(1 − d/m)·r along the line between them; velocity takes the force and then a drag (f = 0.97); position takes the
velocity. R[i][j] and M[i][j] are the push type i feels from type j, and needn't be mutual: that's the paper's tiers (a
seed that ignores the next tier, which settles around it). In 4D the w coordinate is simply let free.

Shapes are read off as in the paper: the closest pair sets the edge length, pairs within 3% of it are edges. A tier is
**exactly** a reference shape when its sorted pairwise distances, scaled to unit mean radius, match to 0.02
(`fingerprint`, `identify`); it has a shape's **structure** when its edge graph has the same counts (vertices, edges,
degrees, triangles, squares) but the distances differ (`structure`, `shapeOf`). `energy` is Σ 1/d on the unit sphere.

## What it finds

| | result |
|---|---|
| one kind, 3D: 4, 6, 12 | tetrahedron, octahedron, icosahedron (as the paper) |
| 8 in 3D | not a cube; the same other shape every run (the paper: a square antiprism) |
| cube on an octahedron seed; dodecahedron on an icosahedron | both, every run |
| the paper's Figure 8, its numbers exactly | octahedron, cube, cuboctahedron exact; the outer 24 with the rhombicuboctahedron's structure (48 edges, 4 at a corner, 8 triangles, 18 squares), all edges within 1%, but the squares sheared to rhombi. This is what this port gets with the published numbers; it may be a difference between the port and the paper's app. |
| one kind, 4D: 5, 8 | 5-cell, 16-cell |
| 16 in 4D | not a tesseract (as 8 don't make a cube): the same other shape every run, lower in Σ 1/d than the tesseract (87.783 against 88.416) |
| 24 in 4D | usually a near miss (Σ 1/d 208.354); sometimes the 24-cell (208.337). Shaking (velocity kicks of 0.6) found the 24-cell from every near miss tried, within 12 shakes |
| 120 in 4D | the 600-cell, with the cut-off widened (r 0.02, m 6) past 40 particles: at the paper's m = 3 the swarm outgrows its cut-off and crowds inward |
| tesseract on a 16-cell seed | yes, with the seed pushing harder than the tier pushes itself (0.06 against 0.01) |
| the 24-cell | the 16-cell seed and its tesseract tier, brought onto one sphere |
| the 120-cell (600 on a 600-cell seed) | not reached: 720 particles hadn't settled after 30,000 steps (about 3 minutes) and didn't match. Like the paper's empty spheres |

## The page

`js/main.js` draws on one 2D canvas: discs depth-sorted, each tier's edges in its colour. 4D presets as a shadow (eye
out in w, the frame tilted 35° off w as on PRISM) or a slice (particles near it fading). Small swarms take 6 steps a
frame so you can watch them settle; big ones as many as 400,000 pair checks a frame allow. "Settled" is the selftest's
stop (fastest particle under 10⁻⁹): a looser stop on the page once left the shapes a little off and unrecognised.

## Checks

`node ana/chora/test/particles.selftest.mjs` (~2 s): every row above except the 120-cell, from fixed seeds; and the
identifier (each reference shape, turned, moved and scaled at random, is itself and nothing else).

## Thickness, kicks, sound

**Thick in all four dimensions.** Every edge is a 4D tube of radius ρ (the thickness slider, a fraction of the swarm's
radius) and every particle a 4D ball of radius 1.7ρ. The shadow draws them at their projected width. The slice draws
what a 3D slice really cuts from them: a tube is a union of 4D balls along its segment, and the slice of the ball at
p(t) is a 3D ball round p(t)'s place in the slice of radius √(ρ² − s(t)²), s the distance from the slice. So an edge
crossing the slice is a short tapering stroke, one lying in it a whole tube, a particle just off it a small disc.

**Kicks.** Drag from a particle to fling it (the drag, through your camera and lifted into 4D by your frame), or tap one
and kick it ana or kata (along your w), or at random. "shake" kicks everyone.

**Tuning.** Pull a, push ×r, reach ×m, drag f, applied to every pair's numbers; the swarm re-settles from where it is
(and may settle into something else: doubling the push on a 600-cell once re-settled into a slightly higher-energy shape).

**The modes** (`stiffness`, `eigSym`, `modes`, `notes`, `kickModes`). Near equilibrium the force is −Kδx. Pushes run one
way between tiers, so K is block-triangular by tier and its frequencies are each tier's own block's, the others held
still; within a tier the block is symmetric. `eigSym` is Householder to tridiagonal then implicit QL (EISPACK tred2/tql2,
as JAMA). ω per step from the simulation's step rule, cos ω = 1 − λ/2. The selftest checks K against finite differences of
the simulation's own force, the silent modes (6 free turns in 4D, 3 in 3D, none for a held tier), that a kick's energy
splits among the modes without loss, and that the simulation kicked along one mode swings at that mode's ω. The 16-cell
sounds 5 notes from 26 modes; the 600-cell 23 notes from 474, up to 48 modes on one note.

**Sound** (`js/sound.js`). A kick on a settled swarm rings each of its tier's modes with the kick's component along the
mode's shape: a decaying sine at 1600 Hz per radian-per-step, panned by the share of the shape's motion along your w (all
in your space: left; even in all four directions: centre; mostly ana/kata: right). The simulation's drag rings a mode out
in ~60 steps; the sound is slowed (1.2 s at the paper's drag) and scales with the drag slider. "ring it" and arriving at
a shape sound every mode evenly. While settling, a hiss follows the swarm's mean speed. Each ring is normalised to a fixed
peak, so a harder kick changes the balance of notes, not the loudness.

## Voices and tuning

Each voice is a choice of what strikes the swarm, what damps it, and what listens (`VOICES` in `main.js`):

| voice | strike | damping | listening | sounds |
|---|---|---|---|---|
| bell | a kick to the velocity | air drag: every mode rings equally long | velocity | a bell |
| wood | the same | friction inside the swarm (on how fast neighbours part): damping ∝ stiffness, so high notes die fast | velocity | a knock |
| glass | a hard small hammer | almost none (3× the bell) | acceleration (× ω) | long and bright |
| pluck | pulled aside and let go (the kick as a displacement) | a little less than the bell | position (÷ ω) | soft, low |
| live | the kick, in a copy of the swarm | the drag turned nearly off, so it rings as long as the bell | two microphones on the particles | the real thing |

The first four are the modes (linear: what the swarm does for small kicks). **live** records the simulation itself
(`record`), one step a sample at 2π × 1600 steps a second so its pitches line up with the modes'. The selftest checks
that a gentle kick along a mode rings at the mode's pitch, and that a hard one moves the loudest pitch well away (from
0.142 to 0.416 rad/step for the 16-cell's lowest mode): the forces aren't springs, so hard kicks bend the notes and pass
energy between modes. Big swarms get a shorter recording (about 6·10⁷ pair checks of work: half a second for the
600-cell).

**Tuning** (`tune` in `sound.js`) snaps each note to a scale on C: true (as the physics gives it), semitones (equal
temperament), C major pentatonic, or just-intonation C major. Modes on one note stay on one note. Live can't be tuned.

**The swoosh.** The first version's kick sounded like a whoosh: it was the settling hiss, which followed the swarm's
speed and so fired on every kick. The hiss now sounds only while a dropped-in or shaken swarm settles (and can be
switched off).

**Interaction.** A tap on a particle kicks it in a random direction; a drag from a particle flings it; a drag anywhere
else turns the view. The first version caught any drag within 16 px of a particle as a fling, which with a dense swarm
was nearly every drag, so the view couldn't be turned; now a particle is hit only within its drawn disc.
