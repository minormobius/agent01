# Lumen⁴

Light in four dimensions, worked out and drawn beside our own. It's an
understanding toy, like Foam⁴, not a game. Everywhere, 3D is warm and 4D is
ice. The physics is `js/optics.js` (no DOM), the page is `js/main.js`, and
`test/lumen4.selftest.mjs` checks every number against something independent
of how it's computed.

## What it shows

| | 3D | 4D | why |
|---|---|---|---|
| a point source | 1/r² | 1/r³ | light spreads over the sphere round it: S² in 3D, S³ in 4D |
| a k-dimensional source | r^−(2−k) | r^−(3−k) | it spreads into n − k − 1 directions; a 3-flat in 4D doesn't fade |
| a laser | a line | still a line | collimation is a narrow beam in any dimension; the cross-section is an (n−1)-ball, so on axis (w₀/w)^(n−1), and far off a point source |
| a flash | a shell, then dark | a front, then a negative wake | Huygens' principle holds only in odd dimensions; in 4D an instant flash leaves −(t² − r²)^−3/2/4π² inside the light cone |
| a round hole | (2J₁(x)/x)², first dark 1.22 λ/D | (3j₁(x)/x)², first dark 1.43 λ/D | the hole is a disc in 3D, a 3-ball in 4D; 83.8% vs 79.0% of the light in the central spot |
| polarizations | 2 | 3 | the field is transverse: n − 1 |
| glare at Brewster's angle | polarized on a line | polarized in a plane | one p direction and n − 2 s directions; unpolarized R = ((n−2)R_s + R_p)/(n−1) |
| a polarizer, unpolarized light | 1/2 | 1/3 (a line), 2/3 (a plane) | the share of n − 1 transverse directions it passes |
| a hot body | ν³/(eˣ − 1), power ∝ T⁴ | ν⁴/(eˣ − 1), power ∝ T⁵ | modes grow as ν^(n−1); 5800 K looks warm white to us and bluish white in 4D |
| a rainbow | a 42° circle | a 42° cone, cut by your slice | in your slice a circle of radius arccos(cos 42°/cos β) when the sun leans β into w, gone past 42°; violet goes first |
| a rainbow on a screen | a conic, e = sin γ / cos 42° | a conic, e = sin γ / cos ρ(β) | a flat screen cuts the cone off its tip. In 3D only your gaze γ changes the shape; in 4D, leaning the sun shrinks ρ, so with your gaze held the bow goes hyperbola → parabola → ellipse → circle → point → gone. A 4D creature's 3D sensor would see a quadric (spheroid, paraboloid, hyperboloid sheet), and your screen is a slice of it |
| who moved | – | doesn't matter | only the antisolar direction in your own frame counts, a = (a_F, a_R, a_U, a_N): the bow is in your slice iff \|a_N\| ≤ sin θ, and e = √(a_R² + a_U²) / cos θ. Turning and twisting change e; looking into w (forward toward w) can't, so the bow keeps its shape while it shrinks and slides, until it's gone |

**What doesn't change** is anything that happens in a plane: refraction
(Snell's law, total internal reflection), slit diffraction, interference,
Lambert's cosine law, and the conservation of brightness along a ray. The new
part is that the plane of incidence can tip out of your slice.

## How the hard ones are computed

- **The flash.** In 3D the field is the pulse, delayed: u₃ = f(t − r)/4πr. In
  2D, putting s = t − r cosh η removes the singularity:
  u₂ = (1/2π)∫₀^∞ f(t − r cosh η) dη. Green's functions two dimensions apart
  are related by G_{n+2} = −(1/2πr) ∂_r G_n, which gives
  u₄ = (1/4π²r)∫₀^∞ cosh η · f′(t − r cosh η) dη. That's Simpson's rule on a
  smooth integrand.
- **The round hole.** J₀ and J₁ use Numerical Recipes' rational
  approximations. j₁ is closed form. The encircled energy is integrated with
  the screen's own area element: x dx on a plane, x² dx on a 3D screen.
- **Colour.** CIE 1931 matching functions use Wyman, Sloan and Shirley's
  multi-lobe fit, then convert to sRGB, normalised to the brightest channel.
  Single wavelengths (the rainbow) use Bruton's mapping, which reads truer in
  the far red than the fit does.

## Checks

```bash
node games/lumen4/test/lumen4.selftest.mjs   # < 1 s
```

- the falloff exponents, and a beam √2 wider at its Rayleigh range with far
  slopes of −2 and −3;
- u₃, u₂ and u₄ each satisfy their own radial wave equation
  u_tt = u_rr + (n−1)/r u_r (finite differences), u₄ = −(1/2πr)∂_r u₂, and the
  4D tail equals the instant flash's wake times the pulse's area;
- J₁ against its integral, the first dark rings 3.831706 and 4.493409,
  encircled energy against Rayleigh's 1 − J₀² − J₁², and both totals;
- Fresnel at normal incidence, R_p = 0 at Brewster's angle, total internal
  reflection, and the unpolarized and polarizer shares;
- Planck's totals π⁴/15 and 24ζ(5), Wien's roots, b = 2.8978 mm·K,
  doubling T gives 16× and 32×, and the 4D body is the bluer;
- the rainbow angle for water, red outside violet, and the in-slice circle
  against brute force;
- the bow on a screen: every projected point lies on
  (cos γ + x sin γ)² = cos²ρ(1 + x² + y²), its type is the sign of
  sin²γ − cos²ρ, e = sin γ / cos ρ (also measured off the drawn ellipses), and
  with your gaze held at 60° leaning the sun turns hyperbola into ellipse
  through a parabola at β = 31.4°;
- who moved doesn't matter: from 300 random frames (sun's lean, turn, twist,
  look into w) the bow exists exactly when |a_N| ≤ sin θ, every point drawn
  lies on its conic, e = √(a_R² + a_U²)/cos θ against the conic's own
  quadratic form, the (β, γ) form is a special case, and looking into w keeps
  e while turning and twisting change it.

## Next

- A 4D optical bench in a slice: a laser that's a dot until it lies in your
  slice, a block of glass that bends it out into w, and a lens whose focus is
  a point in 4D.
- Lighting KATABASIS with what's here: a flash with a wake, glare you can
  polarize away, and crystals the colour of a 4D hot body.
