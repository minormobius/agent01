# MANDELBRACT

The Mandelbrot set in four dimensions, at ana.mino.mobi/mandelbract/.

## Can it be done?

The Mandelbrot set lives in the complex numbers, a plane you can add, multiply and divide in. No such number system
exists in three dimensions (that's why the Mandelbulb has to cheat), and in four there is only one, the quaternions
(Frobenius, 1878), which aren't commutative. So the 4D Mandelbrot set is four different things:

| set | what it is | what it gives up |
|---|---|---|
| **(c, z₀)** | z → z² + c with the parameter c *and* the start z₀ free. The plane z₀ = 0 is the Mandelbrot set; the plane at fixed c is that c's filled Julia set. | nothing: it's the complex set's own home. It is unbounded: for c outside M the Julia set is dust, but never empty. |
| **bicomplex** | z₁ + z₂j, i² = j² = −1, ij = ji. The idempotent basis splits products in two, so the set is M × M. | a field: it has zero divisors. Boxy. |
| **quaternion** | z² = (a² − \|b\|², 2ab) sees only \|b\|, so the set is M spun round its real axis. | commutativity, and with it any new detail. |
| **hyperbulb** | r → rⁿ and every hyperspherical angle × n: the Mandelbulb's trick, a dimension up. | algebra: there's no theorem behind it. |

## How it's drawn

Each set has a distance estimate (½|z| ln|z| / |∇z|, with the derivative taken with respect to every coordinate that
moves; for (c, z₀) that's both ∂z/∂c and ∂z/∂z₀). A 4D distance is a lower bound on the distance within your slice,
so the shader sphere-traces the slice by it. Colour is the orbit trap, or (by w) the gradient's component out of
your slice: whether the set carries on ana or kata there.

**Solid** is your 3D slice. **Plane** is the 2D slice through the middle of your view. **Cut open** removes the half of
the solid toward you; the cut face is the plane. The pad twists your slice into w, the lever moves it ana and kata
(kata's controls, as in HILBERT⁴). Double-tap flies to a point.

## Claims and checks (`test/mandelbract.selftest.mjs`)

- (c, z₀): z₀ = 0 agrees with known points in and out of M; c = 0 is the unit disk; c = −2 is the segment [−2, 2].
- bicomplex: the orbit's idempotent parts are exactly the two complex orbits; in the set iff both factors are in M.
- quaternion: escape counts depend only on the real part and the imaginary part's length; the 1–i plane is M.
- hyperbulb: hyperspherical coordinates invert; w = 0 is invariant; w → −w is a symmetry.
- every set: the estimate is 0 inside; and, measured, points half an estimate from an outside point are outside
  (≥ 98%: an estimate, not a bound, so the march steps 0.6 of it).
- the march: rays fired at each set stop on its edge (in, or within eps, with a point 0.01 back outside).

The shader is checked by eye, not by the selftest: keep it in step with `js/fractal.js`.
