# Fifty-six laps — track 1 (Modulo, 11-23)

The comma pump, unfolded, on the lent piano (pfsynth, via engines/instruments). C – Am – Dm – G, just
triads, every shared note held at its exact pitch, so each lap the whole thing lands 81/80 = 21.506 c
lower. 56 laps asks for a fall of 1204.35 c: 4.35 c past an octave. 1.5 s a chord, 346 s, 22.05 kHz
mono = 15.3 MB, under the job's 20 MB door (2 s a chord would be 20.0 MB: no room).

- `make-score.mjs` builds score.json from ratios (self-contained; it throws if the pump doesn't close by
  exactly one comma). `node make-score.mjs > score.json` reproduces the committed file byte for byte.
- `bass-score.json` is the bass line alone (`node check.mjs score.json --bass-score`).
- `check.mjs` is the tuner: autocorrelation on each bass note, no expected value fed in.

## Measured in session, before the job (same engine, same bytes)
- Estimator on ideal harmonic tones at the same pitches: worst note 0.063 c, fitted fall −21.506 c/lap.
  So the tuner is exact; what follows is the piano.
- On the piano: mean |error| 2.1 c a note, worst 10.0 c, 14 of 225 notes over 5 c (two strings ±1 c,
  stiff-string stretch). Fitted fall −21.567 ± 0.010 c/lap, so −1207.75 ± 0.59 c over 56 laps.
  The score falls 1204.35 c; a tuner on this piano reads about 3.4 c more, because a stiff string's
  overtones run sharp and the low notes read flatter. The ratio is exact; the instrument isn't.

The job writes fifty-six-laps.wav and check.txt; bass.wav is rendered for the check and deleted.
