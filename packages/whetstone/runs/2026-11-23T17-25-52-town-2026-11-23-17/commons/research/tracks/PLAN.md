# Tracks — Modulo, started 2026-11-23

The person asked (3n2xjyylqqc2w, 06:49Z) to start planning tracks for plyr.fm. Rule for every
track here: it states one ratio, and a listener with a tuner or a stopwatch can check it. The
check is part of the track, written before the render.

## Measured today
`node shelf/pump-render.mjs 8 2 /tmp/x.wav` renders the comma pump ("hold") through the jams
rack wasm (organ bass, strings triad, a pluck on the fifth) and measures the bass of every chord
by autocorrelation, with no expected value fed in.
- 8 laps, 2 s a chord: 68.3 s, peak 0.435, 0 clipped.
- Tonic: computed −172.05 c, measured −172.04 c. Worst chord over 33 chords: 0.012 c.
- Found: pump.js folds roots to ±600 c, so the bass jumps up an octave at chord 19 (G, −1103 →
  −605). Fine for a page, wrong for a track whose point is a steady fall. Fix in the track
  voicing, not in pump.js (its selftest pins the fold).

## The list (order = order of release)
1. **Fifty-six laps.** The comma pump, unfolded. 1200 / 21.506 = 55.80 laps to fall an octave;
   56 laps falls 1204.35 c, so it ends 4.35 c flat of an octave below where it began. 4 chords
   × 56 × 2 s ≈ 7.5 min. Voicing must start high (bass C3) so the end isn't 32 Hz mud.
   Check: tuner on the first and last C. Prediction: −1204.35 c ± 0.1.
2. **Twelve fifths.** Climb by pure 3/2, folded into one octave. After 12 the "same" note is
   23.46 c sharp (Pythagorean comma), bigger than the syntonic comma of track 1. Check: tuner,
   and the start drone held under the end so the beating is audible.
3. **Ten beats a second.** C4–E4, alternating just (5/4) and equal (400 c) thirds on the organ.
   Equal: the 4th partial of E against the 5th of C differ by 10.38 Hz, which you hear as a
   flutter you can count. Just: 0 Hz. Check: stopwatch, or a spectrum.
4. **Monochord.** Partials 1–16 of one string, from www/monochord. The 7th and 11th are the
   ones no keyboard has (−31.2 c and −48.7 c from equal). Check: tuner.
5. Open: a rhythm piece (3:2 → 4:3 → 5:4 polyrhythms). Rhythm is ratio too. Not specified yet.

## Blocked on
- Upload: plyr uploads through OAuth in its web app (their STATUS.md, read 11-23). The person
  said "let me ask" (the lab). Until then, nothing leaves /tmp. WAVs are ~6 MB a minute, too
  big for the commons; the script reproduces them byte for byte (checked: two 2-lap renders, same
  sha256 039cbcad…).
- Tag: we tag ourselves `ai`. On plyr that hides a track from latest, for-you and radio. Accepted.

## Next step (mine)
Track 1's voicing: extend pump-render.mjs with an unfolded mode, render 56 laps, and keep the
measured table here.
