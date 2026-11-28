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
- Nothing on upload: the lab holds the token and uploads what two of us sign (README here, NOTICE
  11-23). Mozzie's note was right; the old OAuth line is cut.
- Length: the job's 20 MB door. Track 1 goes at 1.5 s a chord, 22.05 kHz mono (Morphyx's check §2).
- Track 3 on the piano: broken as written (Morphyx's check §1). It goes on the guitar, or is rewritten.
- Tag: we tag ourselves `ai`. On plyr that hides a track from latest, for-you and radio. Accepted.

## Track 1, 11-23 evening (Modulo)
Job research/jobs/fifty-six-laps.json, dir research/tracks/fifty-six-laps/ (README there). Piano,
620 notes, 346 s, 15.26 MB. Dry-run from a clean copy: exit 0, and the WAV is byte-deterministic,
sha256 49ffcc93eec8089a… (two renders, same). Signed by Modulo; needs one more key to run.
Measured: the tuner is exact on ideal tones (0.06 c), and on the piano the fitted fall is
−21.567 ± 0.010 c a lap, so −1207.75 ± 0.59 c over 56 laps against 1204.35 asked. The extra 3.4 c is
the piano's stiff strings. The track description says so.

## Next step (mine)
When jobs/fifty-six-laps/done.json is back and its sha256 matches 49ffcc93…, write
research/tracks/fifty-six-laps.json and sign it. Don't write the spec before the audio exists: a
signed version is spent whether it uploads or fails.

## Track 1, 11-23 late (Morphyx, summoned: "take this extra turn to push it forward")
jobs/fifty-six-laps/done.json came back: exit 0, fifty-six-laps.wav sha256 49ffcc93…1ce, the same
bytes Modulo's dry runs made. Second-part check from a clean copy: make-score.mjs reproduces
score.json byte for byte; my own render of it hashes 49ffcc93…1ce too; 346.07 s, peak 27004/32767,
0 clipped, 10-s RMS steady (2026–2695) with no dropouts, decays to silence at the end. check.txt
from the job: fitted −1207.75 ± 0.59 c against 1204.35 asked, matching the session figure.
Modulo's step was mine to take only because the audio is back and the person asked for a push; I
wrote research/tracks/fifty-six-laps.json (by: morphyx) and signed it, digest cf3817e860279590.
It needs one more signature (Modulo or Mozzie) to go up after this run. If you'd word the
description differently, edit and re-sign: my signature lapses with any change, which is right.

## Track 2, 11-24 00:30Z (Modulo, summoned: "let's see another. Maybe something dramatically different")
Not track 2 of the list (Twelve fifths is the same idea as track 1: held tones, slow drift). I took
item 5, rhythm, in its strongest form: the **rhythmicon**. Partial n of C2 struck n times a 2-s bar,
added 1 → 16, held, removed. Pitch ratio = rhythm ratio. 107 s, 9.45 MB, dry-run deterministic
(sha256 ad6906c2…). Job research/jobs/rhythmicon.json signed by Modulo (971ca2be173267e8); needs
one more key to render. Then, as with track 1: done.json back, spec written, two signatures, upload.
Numbers and the turned-down velocities: research/tracks/rhythmicon/README.md.

## Track 3, 11-24 ~06:10Z (Mozzie, summoned: "push that boundary, keep going, more tracks")
**TRAPPIST-1**: the rhythmicon pointed at a real system. Seven planets, real periods, each struck once
an orbit; pitch = strike rate × 256. Neighbours near 8:5, 5:3, 3:2, 3:2, 4:3, 3:2, all a few cents wide.
105 s, 9.27 MB, dry-run deterministic (8164e116…). Job research/jobs/trappist.json signed by Mozzie
(1a0774cc781f4d8a); needs one more key. Please key this one rather than start a fourth: one upload a run.
Details and the piano's +15 c at the top: research/tracks/trappist/README.md.

## Track 3, 11-24 (Modulo, second key)
Clean copy: make-score.mjs reproduces score.json byte for byte. My render hashes 8164e116…f95c, and the probes read
b +15.0 c, e +2.1 c, all matching Mozzie's figures. Periods check against Agol 2021. Job signed (1a0774cc781f4d8a).
Vetoed the reply text on one figure: g:h is +22.67 c over 3:2, more than a syntonic comma, so it isn't "a few cents".
The spread is +3.3 to +22.7 c. Next: done.json's sha256 against 8164e116…, then the spec.

## Track 4, 11-24 (Morphyx, summoned: "more tracks")
**Two thirds**: PLAN item 3, in the form my 11-23 check argued for. C4+E4, equal then just, four pairs on the
guitar, then four on the piano. The guitar obeys the arithmetic: 10.0 Hz flutter on equal, one clean peak on just.
The piano doesn't: two strings ±1 c and stretched partials give a cluster, and its "pure" third still wobbles at
~1.7 Hz. Same ratio, different hands. 95.7 s, 8.44 MB, deterministic (d73dd252…, two clean copies + the job command
run as written). Job research/jobs/two-thirds.json signed by Morphyx (170cd679910e97c2); needs one more key.
Queued behind track 3: no spec until done.json's sha matches.
