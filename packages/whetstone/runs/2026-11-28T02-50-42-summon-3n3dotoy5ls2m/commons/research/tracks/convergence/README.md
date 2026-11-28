# Convergence: track 5 (Modulo, 11-24)

The person (3n33rhxuyik2l): "start another composition, keep pushing boundaries, try to be ambitious."

A tempo canon after Conlon Nancarrow, who wrote for the player piano because no human could keep these
tempos. Nine voices play one melody. Voice r (r = 4 to 12) sits at harmonic r of C1 and plays at tempo r.
Its pitch ratio to any other voice is its tempo ratio, as in the Rhythmicon (track 2), but now carrying a tune.

- The melody is 143 notes, written as a first half, a middle note and its mirror, so both pitches and gaps
  are palindromes. Every note is h/8 of its voice's base, h in 8..16 (the overtone scale, with the 11th
  and 13th). So **every pitch in the piece is a whole multiple of C1/8 = 4.0879 Hz**: 56 distinct
  multiples, 32 to 192.
- Each voice is placed so that its middle note lands at **T = 90.000 s**. Voice 4 plays the melody over
  180 s (0 to 180), and voice 12 three times as fast (60 to 120). The others enter at 18, 30, 38.57, 45, 50, 54,
  57.27 and 60 s, closer together as T nears, and leave in mirror order. At T all nine strike at once:
  harmonics 64, 80, …, 192 of 4.0879 Hz, i.e. harmonics 4..12 of C3.
- 1287 notes, 185.1 s, mono 44.1 kHz, 16.3 MB (under the job's 20 MB). Raw peak 0.970, no clipping.

## What a listener can check
A stopwatch: the one strike where everything lands is at 1:30.0. A tuner on the opening (voice 4 alone for
18 s): every pitch is a harmonic of C1. The 7th, 11th and 13th sit −31.2, −48.7 and +40.5 c from the nearest
equal-tempered key. Run backwards, the score's onset pattern is itself. The piano's decay doesn't run
backwards, so the sound isn't the same in reverse.

## Dry run (11-24, this session)
`node make-score.mjs > score.json` is deterministic (cmp clean). Two renders: sha256
692f997e0ced4951fd12368ab2204ac1734b418123aa0f523533465bada7f8d9 both times.
`node check.mjs score.json convergence.wav`, with nothing expected fed in:
- most notes at one instant: 9, at 90 s. Palindrome: 991/991 onset times mirrored (to 10 µs).
- every pitch k × 4.0879 Hz, worst error 0.00038 c (float32 midi).
- biggest 5-ms attack in the audio at 89.999 s (5-ms windows, so ±5 ms).
- RMS per 10 s: 0.040 0.041 0.056 0.067 0.075 0.089 0.095 0.092 0.087 0.084 0.091 0.094 0.089 0.075 0.067 0.056 0.041 0.040 0.011.
  The arch is there. It isn't a spike at T because the fast voices are short and quiet: velocity falls as 1/√(r/4).

## Not checked
Whether it's good to listen to. I can't hear. The 11th and 13th in a nine-voice texture may sound wrong
rather than strange. Render it on https://miniphim.minomobi.com/handmade/ (it's listed there) and say.

## Next
Job research/jobs/convergence.json, signed by Modulo. It needs one more key. Then done.json's sha256 against
692f997e…, then the spec and two signatures. Track 4's spec (two-thirds) is signed by Modulo and goes first.
