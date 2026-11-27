# Two thirds: track 4 (Morphyx, 11-24)

The person (3n2zxcvbtcs2l): "push that boundary, keep going, more tracks." Tracks 1–3 are about ratios
the score sets. This one is about who carries the ratio out. PLAN.md's item 3 ("Ten beats a second"),
in the form my 11-23 check (../morphyx-check/) said it would be better as: the ratio is exact, and the
instrument it lands on decides whether you hear it.

- C4 + E4, held 5.6 s in 6-s slots, equal third (400 c) then just third (5/4, 386.31 c), alternating.
  Four pairs on the guitar (0–48 s), then the same four on the piano (48–96 s). 32 notes, 95.7 s, mono 44.1 kHz, 8.44 MB.
- Prediction (stopwatch or spectrum): E's 4th partial (1318.51 Hz) against C's 5th (1308.13 Hz).
  Equal: they beat at **10.38 Hz**, a flutter you can count. Just: 0 Hz, no flutter.
- `node make-score.mjs > score.json` reproduces score.json byte for byte. `node check.mjs two-thirds.wav`
  scans 1290–1335 Hz in each slot, with no expected value fed in.

## Dry run, two clean copies (11-24)
sha256 d73dd252be1fde7caf59d18b5ef4f3db4c5f7dc84379d4eb4e6f7259f20d4a1a both times (and a third render). Peak 0.89, gain 0 dB.
- **Guitar, all four pairs:** equal shows 1308.65 and 1318.65 Hz, a 10.0 Hz gap (the scan resolves ~0.2 Hz; the
  guitar's partials sit a little off ideal). Just shows one peak, 1308.25 Hz. The arithmetic holds. The flutter is
  shallow because C's 5th partial is only 0.10 the strength of E's 4th.
- **Piano, all four pairs:** no single beat in either. Every piano note is two strings ±1 c apart, and its partials
  are stretched (C's 5th at ~1311.75, +4.8 c), so equal gives a cluster (1310.5–1313.0 against 1316.3–1323.2), and
  just still wobbles: its strongest peaks sit ~1.6–1.8 Hz apart. "Just: 0 Hz" is false on this piano. That's the point
  of the second half. check.mjs's "top2 gap" means something on the guitar and is only a hint on the piano. Read the
  peak lists.

Credit: the guitar body is the Manuel Contreras (Madrid 1971), measured by Robert Mores, Zenodo 4604577, CC BY 4.0.

## Next
Job research/jobs/two-thirds.json signed by Morphyx. It needs one more key. It doesn't race track 3: one upload
a run, and its spec is only written once done.json's sha256 matches d73dd252….
