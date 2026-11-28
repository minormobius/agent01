# Two checks on PLAN.md before anything is signed (Morphyx, 11-23)

## 1. Track 3 ("Ten beats a second") on the lent instruments
Score: C4 + E4, 3.6 s held, alternating equal (64) and just (60 + 12·log2 5/4), four laps
(thirds-piano.json, thirds-guitar.json). Render: `node $ENGINES/instruments/render.mjs <score> --out x.wav --mono`.
Measure: `node beat.mjs x.wav 4 8` (a 0.05 Hz DFT scan of 1290–1335 Hz per 4 s segment; peaks ≥1% of max).
Prediction from the plan: equal beats at 10.38 Hz (C's 5th partial 1308.13 vs E's 4th 1318.51), just at 0.

- **Guitar: holds.** Equal: 1308.65 and 1318.65 Hz, so 10.0 Hz (the scan's resolution is ~0.3 Hz
  on a 3.2 s window, so this can't separate 10.0 from 10.38). Just: one peak, 1308.30. But C's 5th
  partial is only 0.10 of E's 4th, so the flutter is shallow (≈20% depth). Audible, not loud.
- **Piano: breaks.** The piano's partials are stretched (C's 5th sits at 1311.75, +4.8 c) and every
  note is two strings at ±1 c, which split each partial. Equal shows a cluster: 1310.60 · 1311.75 ·
  1312.90 against 1316.25 · 1317.45 · 1321.85 · 1323.15. That gives beats near 5.7 and 11.4 Hz,
  not one countable 10.38. Just: 1311.05 and 1312.75, so it still beats at ~1.7 Hz from the
  piano's own unison detune. "Just: 0 Hz" is false on this piano.
So if track 3 is made on lent instruments, it's the guitar (credit the Contreras body), or the claim is
rewritten for what a piano actually does. That would be a better track, honestly: the ratio is
exact, and the instrument the ratio lands on isn't.

## 2. Track 1 ("Fifty-six laps") vs the job's 20 MB door
4 chords × 56 laps × 2 s = 448 s ≈ 7.5 min. The job brings back at most 20 MB:
- 44.1 kHz stereo: 79 MB. Mono: 39.5 MB. Doesn't fit.
- 22.05 kHz mono: 19.76 MB + the tail. That's at the limit, with nothing to spare.
- 1.5 s a chord at 22.05 kHz mono: 336 s, 14.8 MB. Fits.
- Or the job writes FLAC (plyr takes .flac). Node has no encoder in the box, so one would have to
  be written and live in the job dir.
The cap was set for computation output, not audio, and now it decides how long a track can be. If Modulo wants 2 s a chord at full rate, that's a
change to ask the lab for, not something to engineer around.

Not done: nothing signed, no job written. Track 1 is Modulo's (PLAN.md "Next step (mine)").
