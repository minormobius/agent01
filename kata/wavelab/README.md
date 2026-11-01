# WAVELAB

Water waves in four dimensions, solved exactly. Kata's water surface is three-dimensional (x, z and w, the ground every
kata page shares): a height η(x, z, w, t) that moves. Drop pebbles on it and watch two views of the same water:

- **your slice**: the water as you'd see it standing in a 3D slice of the 4D world. That's a 2D surface: the slice's
  plane through the 3D water surface. ⚙ tilts it into w and moves it ana or kata. Tap the water to drop a pebble.
- **the whole surface**: the 3D water surface itself, one period of it (48 m a side, x and z across, w drawn up).
  Crests are teal, troughs rose, and your slice is the bright plane through its middle.

A chart compares the latest pebble on kata's water with the same pebble on ours (a 2D surface), along a ray from it.

## The experiments

| button | what it shows |
|---|---|
| **pebble** | A ring in your slice is a **sphere** on the whole surface. It fades faster than ours: its energy spreads over r², not r. |
| **out of the slice** | A pebble 6 m ana. Nothing, then a ring appears from nowhere as the sphere reaches your slice. |
| **shallow** | 25 cm deep: every wavelength travels at √(gh). Kata's pulse is a clean shell with flat water behind it; ours leaves a tail. This is Huygens' principle, which holds in odd dimensions (Hadamard). |
| **swell from ana** | A plane wave 53° out of your slice. In the slice its crests look 16 m apart and sweep at 6.45 m/s, faster than a 16 m wave travels (5.0 m/s). |
| **s, p, d** | Standing waves of one frequency, weighted by a spherical harmonic of their direction: the shapes a round 4D pond sloshes in, which are the orbitals' shapes. |
| **rain** | Drops all over the surface. Most land out of your slice, and their rings appear from nothing. |

## How it's solved (`js/waves.js`, `js/fft.js`, `js/worker.js`)

**Linear water-wave theory** (Airy). The water under the surface is still and swirl-free, so its motion obeys Laplace's
equation, in four dimensions as in three. A plane wave η = a cos(k·x − ωt), with k a 3-vector along the surface, has
the motion beneath it fading as e^(−|k| depth). Its frequency is set by its wavenumber alone:

    ω² = g |k| tanh(|k| h)          (deep water: ω² = g |k|)

This is the same in any dimension, because a plane wave sees only its own direction. Everything that differs in 4D
comes from adding plane waves over a 2-sphere of directions instead of a circle.

**Solved exactly.** The surface is a periodic box, 64³ samples 0.75 m apart: a 3-torus 48 m across. The state is one
complex amplitude per plane wave, Z(k), and

    η(x, t) = Re (1/N³) Σ Z(k) e^{i(k·x − ωt)}

So each wave is turned at its own ω, and the surface comes from an inverse 3D FFT. There's no time step, so there's no
time-step error: the selftest checks that stepping frame by frame lands exactly where jumping there does.
- **A pebble** is a Gaussian bump released from rest: Z += B̂(k) e^{−ik·x₀} e^{iωt₀}. Its +k and −k waves run apart.
- **A swell** is one Z at one k.
- **An orbital** puts weight on every k in a thin shell around k₀, by a real spherical harmonic of k̂. That makes one
  frequency, hence standing; in space it's j_l(k₀r) Y_l.

A small uniform decay (2% a second) keeps rain from piling up. It changes no shape.

**Ours, alongside**: the same solver on a 2D surface, 128², the same spacing, for the chart.

**Speed.** The solver runs in a Web Worker so the page draws at full rate. On a laptop one solve is about 20 ms (a
3D FFT of 64³), so the surface updates about 40 times a second. The page sends the elapsed time, and the worker moves
the clock on, solves, and returns the surface as a 3D texture.

**Drawing (`js/main.js`, one shader, two modes):**
- *your slice*: a height-field ray-march over the slice's plane, heights exaggerated (the factor is shown). The water
  fades into mist 24 m out, where the tank wraps round.
- *the whole surface*: a volume march through one period. Opacity follows the wave's height and colour its sign, and
  the slice is painted where each ray crosses it.

## Testing

```bash
node kata/wavelab/test/wavelab.selftest.mjs   # ~1 s
```

It checks:
- the FFT against the Fourier sum;
- every plane wave at ω² = g k tanh(k h);
- the clock's exactness;
- a pebble's sphere: the same along x, z and w;
- Huygens: behind its front in shallow water, kata's pulse leaves 2% of its height and ours 28%;
- spreading: as the front's radius doubles, kata's pulse falls as r^−1.1 and ours as r^−0.53;
- the swell's apparent speed along the slice;
- the orbitals standing: half a period on, each is itself upside down, and the p orbital's lobes are opposite.
