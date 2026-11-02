# ORBITAL

The electron cloud of hydrogen in four dimensions, exactly, on ATOM⁴'s terms
([four.mino.mobi/atom/hydrogen.html](https://four.mino.mobi/atom/hydrogen.html)).

## What you see

- **Your slice** (left, or top): a 3D slice of the 4D atom. It's rendered as a cloud: bright where |ψ|² is, **teal**
  where the wave is positive, **rose** where negative. The pad twists your slice into w: right tips the screen's right
  toward ana, up tips its up (keys J L, I K). The lever moves your slice ana and kata (R F), ⊞ (or Z) squares it up,
  and dragging turns the atom. The readout says where the nucleus is (in your slice, or how far ana or kata) and which
  direction your slice can't see.
- **Ours** (right top): the same orbital in our 3D atom, whole, when there is one.
- **The dartboard** (right bottom): electrons thrown at both clouds, drawn from |ψ|², counted by how far from the
  nucleus they land. They build up against the exact radial distribution P(r) = r^{d−1}R². The solid tick is the
  likeliest distance, the dashed one the mean. In your slice, the electrons that land within a thin band of it show as
  dots, teal ana and rose kata.

## The orbitals

| | ours | kata's |
|---|---|---|
| s | 1 | 1 |
| p | 3 (x, y, z) | 4 (x, y, z, w) |
| d | 5 | 9: six of the plane kind (xy, xz, xw, yz, yw, zw), three of the axis kind (x²−y², z²−w², x²+y²−z²−w²) |
| f | 7 (xyz; x(y²−z²) ×3; x(5x²−3r²) ×3) | 16: four of three axes (xyz, xyw, xzw, yzw); eight of an axis times a difference of the others' squares (x(y²−z²), x(y²+z²−2w²), …); four of an axis alone (x(2x²−r²), …) |

What stands out:
- **p_w**: a slice through the nucleus is exactly its node, so you see nothing. Move ana and a teal lobe swells into
  view; kata, a rose one.
- **d_xw, d_yw, d_zw**: through the nucleus, nothing. Offset ana, each looks exactly like p_x, p_y or p_z; kata, the
  same upside down. A 4D d orbital, sliced, is often a p orbital whose sign says which side of you it is.
- **f with w as a factor** (xyw, xzw, yzw, w(x²−y²), w(x²+y²−2z²)): through the nucleus, nothing. Ana each slices
  to a d orbital (f_xyw to d_xy) and kata to the same upside down. **w(2w²−r²)** slices, a distance a ana, to a(a² −
  ρ²): a ball, teal inside radius a and rose outside it, an s orbital with a node.
- **x²+y²−z²−w²**: positive all round the xy-plane and negative all round the zw-plane. Those two planes are
  completely perpendicular and meet only at the nucleus. Nothing in 3D can do that.

## sp⁴ hybrids

**sp⁴** mixes ns with the four np into five hybrids:

    h_k = ∓(1/√5) ns + √(4/5) np·d_k

Each is one fifth s and four fifths p. Each has one big lobe pointing at a corner d_k of the **5-cell**, 4D's
tetrahedron, and every pair of corners is at cos = −1/4, **104.48°** apart. Our sp³ has four at 109.47°.

They're stationary states, not just shapes: energy depends only on n, so ns and np have the same energy and any mix of
them is an exact solution too. The selftest checks the full 4D equation for each.

The sign on ns is a convention: (−1)^(n−1), so the big lobe points along d_k and not away from it. The corners are
taken in a natural frame:
- **h5 points straight along w, ana.** Through the nucleus your slice sees only a small rose core.
- **h1 to h4 make our tetrahedron in x, y, z**, each tipped 14.48° kata.

So squared up, sp⁴ looks like our sp³ plus one you can't see. Pick them one at a time (ours, beside it, is the sp³ lobe
along the same line) or **all five**. All five are drawn in their own colours, each point coloured by the hybrid that
dominates there. Arrows run from the nucleus toward each corner: their length is the part in your slice, and the label
says how far the rest leans ana or kata.

## Time

**time** lets the clock run. A state is a sum of eigenstates with complex coefficients, each turning at e^(−iEt). Only
differences of energy show, so the page turns each part by e^(−i(E − E₀)t): a single stationary state stands still. The
colour is now the phase, round a wheel (teal 0, gold π/2, rose π, violet −π/2), so a real orbital is still teal and
rose. White arrows are the probability current j = Im(ψ*∇ψ), divided by the density, so they show the local velocity:
the arrow is its part in your slice, and a tick its part ana (teal) or kata (rose). The electrons are the latest 2500
drawn from |ψ(t)|², so the dots move with the cloud.

| preset | what it shows |
|---|---|
| **beat ana–kata** | 1s + 2p_w, half and half. The parts' phases turn at different rates, so the electron **swings ana and kata** once every 1.069 fs (ours, 1s + 2p_z, every 0.405). In your slice it can't be seen to move: the cloud brightens and dims. A swinging charge like this is what an atom emitting light is doing. |
| **beat along x** | the same along x, where you can see it swing |
| **turning in xy** | 2p (x + iy): a stationary state whose density stands still, yet the electron goes round, one unit of angular momentum at every point. The phase winds once round the ring. |
| **two planes at once** | 3d (x + iy)(z + iw): one unit of angular momentum in the xy-plane **and** one in the zw-plane, at every point. Every classical orbit under a 1/r force lies in one plane, so no planet can do this. All its turning is in one of 4D rotation's two halves (ATOM⁴'s left). |
| **two planes, other way** | (x + iy)(z − iw): the other half (right). The ticks reverse. |

The clock shows femtoseconds; a beat is shown every five seconds, and ours runs on the same atomic clock.

## r

Three numbers say where the electron is, and they disagree.

| ground state | densest | likeliest distance | mean distance | bound by |
|---|---|---|---|---|
| ours | the nucleus | 1 bohr | 1.5 bohr | 13.61 eV |
| kata's | the nucleus | 2.25 bohr | 3 bohr | 6.05 eV |

The density is highest at the nucleus, but a shell at radius r holds more space the further out it is (r² for us, r³
here), so the likeliest distance is out at a shell. The dartboard counts it.

## How it's solved (`js/hydrogen.js`, no DOM)

**The force.** It's pinned at 1/r in any dimension, ATOM⁴'s position. Gauss's law in 4D would give 1/r², and with
that there's no ground state. The equation separates into ψ = R(r)·Y, with

    R = r^l e^{−κr} L_{n−l−1}^{(2l+d−2)}(2κr),   κ = Z/(n + (d−3)/2),   E = −κ²/2

In 4D that's E = −Z²/2(n + ½)², ATOM⁴'s spectrum. The radial part is normalised numerically.

**The directions.** Y is a harmonic polynomial of degree l (its Laplacian is zero), written c0 + b·x + xᵀQx for s, p
and d, plus a cubic for f. It's normalised on the sphere using the sphere's exact moments: the mean of Π x_i^{a_i}
over the sphere is Π(a_i − 1)!! / [d(d + 2)…(d + Σa − 2)]. The shader evaluates the cubic as Σᵢ xᵢ · xᵀMᵢx, four
matrices. The d orbitals of the axis kind are
traceless diagonals, mutually orthogonal.

**The dartboard.** The distance r comes from P(r)'s tabulated cumulative distribution. The direction is drawn uniform
on the sphere, then kept with chance Y²/max Y².

**Drawing.** One shader volume-renders ψ at each point of your slice, O + X·E0 + Y·E1 + Z·E2 in 4D. The slice's frame
is turned in the plane of a screen direction and N.

## Testing

```bash
node kata/orbital/test/orbital.selftest.mjs   # ~3 s
```

It checks:
- time: 1s + 2p_w obeys i∂ψ/∂t = Hψ; its average w swings from +1.39 to −1.41 bohr in half a beat while x, y and z
  stay put; 2p (x + iy) has one unit of angular momentum in xy at every point; the double rotations have one in xy
  and ±1 in zw at every point;
- the full 4D Schrödinger equation, −½∇²ψ − ψ/r = Eψ by a finite-difference Laplacian, for every orbital with n ≤ 4
  (the 16 f's included) and both hybrid sets, 60 in all;
- the five hybrids: orthonormal, 104.48° apart, each one's electrons leaning toward its own corner, and the four not
  along w making our tetrahedron;
- every state with n ≤ 4 and l ≤ 2, in 3D and 4D, solves its radial equation at its energy, and the energies are
  ATOM⁴'s and Bohr's;
- the 6.05 eV ground state;
- radial orthogonality;
- the counts (1, 4, 9, 16 against 1, 3, 5, 7), each direction harmonic and all of them orthonormal on the sphere;
- the radii (2.25 and 3 against 1 and 1.5);
- the dartboard against P(r) and against Y²;
- the slice claims: p_w invisible through the nucleus, d_zw p_z-shaped with its sign by side, and the two rings'
  signs.
