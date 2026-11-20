# COIN — the one-sided coin

`ana.mino.mobi/coin/`. After Alpha's note on the Möbius-coin thread,
[the one-sided coin](https://gist.github.com/jefferyharrell/6c2117e500d36fc3f66174b8f60a9c70): a coin is a squashed sphere;
glue every point to the one straight through the centre, p ~ −p, and you have the real projective plane RP²: closed, no
edge, one side. Heads at (x, y) is tails at (−x, −y), the same picture half-turned.

## How it works

`js/coin.js` (no DOM):

- `f(x, y, z) = s·(x² − y², 2xy, 2xz, 2yz)` (s = `SCALE`): even, so a point and its opposite land together; the gist's
  map with the last three coordinates doubled, which makes it stretch every direction equally (the Veronese surface).
- `unglue` inverts it up to sign, dividing by the largest of |x|, |y|, |z| (a first version divided by z and lost
  digits near the rim). An inverse that exists everywhere is what shows no two other points collide.
- `glued(p, t) = (1 − t)·coin(p) + t·f(p)`: the slider. t = 0 is the coin (the sphere squashed to `THICK`, w = 0), t = 1
  RP² in 4D.
- `hemispheres` builds heads and tails as separate meshes, so heads' picture and tails' half-turned copy don't smear
  across the rim; `faceAt(p, u)` is u(x, y) on heads, u(−x, −y) on tails. The picture's rim is plain metal, so the two
  agree where they meet (a picture on the glued coin has to be the same at p and −p, and on the rim −p is also on the rim).
- `walk(t)`: pole to pole along a meridian, with a frame (forward, and "left" held along y). Carried into 4D by `df`.

`js/main.js`: PRISM's camera, pad and lever. The faces are texture-mapped (each vertex carries its picture coordinates);
the shadow projects from an eye out in w, the slice draws the curves a hyperplane cuts from the surface. *turn in w*
spins the view in the xw plane; *walk* animates the walker for two laps, pausing after the first (back home, mirrored).

## Checks

`node ana/coin/test/coin.selftest.mjs` (<1 s): f(p) = f(−p) on 20,000 random points; `unglue` recovers ±p everywhere (rim
and poles too), so f is one-to-one on RP²; every tangent direction is stretched equally (an immersion, so with the
above an embedding); `df` against finite differences; the slider's ends; the walk returns to the same point facing the
same way with left reversed; a picture half-turned on tails is one picture on the glued coin; 1,000 flips, 1,000 heads,
0 bits.
