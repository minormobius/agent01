# TRAPPIST-1 — track 3 (Mozzie, 11-24)

The person (3n2zxcvbtcs2l): "Crystalline spheres all order and structure… push that boundary, keep
going, more tracks." Track 2 was the harmonic series as rhythm: integers, exact. This is the same
machine pointed at a real sky. Seven planets of TRAPPIST-1, each struck once per orbit.

- Periods, days (Agol et al. 2021, PSJ 2:1, as listed by the NASA Exoplanet Archive):
  b 1.510826 · c 2.421937 · d 4.049219 · e 6.101013 · f 9.207540 · g 12.352446 · h 18.772866.
- Time: h's year = 4 s (0.21307 s a day). b strikes every 0.322 s.
- Pitch: strike rate × 256, exactly 8 octaves up. h = 64 Hz, b = 795.2 Hz. So, as in the rhythmicon,
  the pitch ratio of any two planets is their orbit ratio. Unlike it, the ratios aren't integers.
- Neighbours sit near small ratios, and every one is a little wide (cents above just):
  b→c 8:5 +3.3 · c→d 5:3 +5.4 · d→e 3:2 +7.7 · e→f 3:2 +10.6 · f→g 4:3 +10.7 · g→h 3:2 +22.7.
  A just chord that's slightly out, and the out-ness is the planets'.
- Form: all start together at 0. h alone, then one planet every 8 s from the outside in (b at 48 s);
  all seven 48–80 s; then they leave from the inside out, one every 4 s (b at 80 s … h at 104 s).
  400 notes, 105.1 s, mono 44.1 kHz, 9.27 MB.

`node make-score.mjs > score.json` reproduces score.json byte for byte. `check.mjs` is Modulo's rhythmicon
checker, adapted: it renders b and e alone for 8 s and measures strike period and pitch, nothing expected fed in.

## Dry run, two clean copies (11-24 ~06:10Z)
- sha256 8164e1160a0ca9bb593d24011aac25dc4d49fdff4d99792eb02452578589f95c both times. Peak before
  normalising 0.545, no clipping.
- e alone: 1.297 s a strike (claim 1.300), 197.17 Hz (claim 196.93, +2.1 c); pitch / strike rate 255.7 (claim 256).
- b alone: 0.3208 s (claim 0.3219), 802.1 Hz (claim 795.2, **+15 c**); ratio 257.3.
- The +15 c on b is the piano model, not the score: the same probe at whole keys reads 78 +0.7 c,
  79 +6.3 c, 80 +10.7 c. The model's top runs sharp. It goes in the description, not under the rug.

## Next
Job research/jobs/trappist.json signed by Mozzie. One more key to render. Then: done.json's sha256 against
8164e116…, the spec, two signatures, upload. One upload a run, so it doesn't race anything.
