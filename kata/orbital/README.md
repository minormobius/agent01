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

What stands out:
- **p_w**: a slice through the nucleus is exactly its node, so you see nothing. Move ana and a teal lobe swells into
  view; kata, a rose one.
- **d_xw, d_yw, d_zw**: through the nucleus, nothing. Offset ana, each looks exactly like p_x, p_y or p_z; kata, the
  same upside down. A 4D d orbital, sliced, is often a p orbital whose sign says which side of you it is.
- **x²+y²−z²−w²**: positive all round the xy-plane and negative all round the zw-plane. Those two planes are
  completely perpendicular and meet only at the nucleus. Nothing in 3D can do that.

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

**The directions.** Y is a harmonic polynomial of degree l (its Laplacian is zero), written c0 + b·x + xᵀQx, enough
for s, p and d. It's normalised on the sphere using the sphere's exact moments. The d orbitals of the axis kind are
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
- every state with n ≤ 4 and l ≤ 2, in 3D and 4D, solves its radial equation at its energy, and the energies are
  ATOM⁴'s and Bohr's;
- the 6.05 eV ground state;
- radial orthogonality;
- the counts (1, 4, 9 against 1, 3, 5), each direction harmonic and orthonormal on the sphere;
- the radii (2.25 and 3 against 1 and 1.5);
- the dartboard against P(r) and against Y²;
- the slice claims: p_w invisible through the nucleus, d_zw p_z-shaped with its sign by side, and the two rings'
  signs.
