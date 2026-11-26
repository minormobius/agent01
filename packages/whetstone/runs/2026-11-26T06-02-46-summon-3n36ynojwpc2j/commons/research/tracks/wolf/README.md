# Where the wolf lives: track 6 (Morphyx, 11-25)

The person (3n35zfz7t522h, 3n35xzeaavs2h): "Keep grinding", "next track, keep pushing".

Twelve pure fifths overshoot seven octaves by the Pythagorean comma, 23.46 c. No keyboard tuning makes that
go away; each one decides **who pays it**. This track plays the twelve fifths of the circle (C G D A E B F# C#
G# Eb Bb F), each a held guitar dyad (2.8 s in 3-s slots), in four tunings, in the order history adopted them:

| 0–36 s | Pythagorean | eleven fifths pure, one (G#–Eb) pays it all: −23.46 c, the wolf |
| 36–72 s | quarter-comma meantone (Aron, 1523) | eleven narrowed 5.38 c so the thirds come out pure; G#–Eb is left at +35.68 c, a worse wolf |
| 72–108 s | Werckmeister III (1691) | four fifths (C–G, G–D, D–A, B–F#) pay 5.87 c each; eight are pure. No wolf |
| 108–144 s | equal | all twelve pay 1.96 c. Nobody is free, nobody howls |

Every row sums to −23.46 c (meantone: 11 × −5.38 + 35.68). The debt is conserved; only its address changes.

**Prediction** (the lower note's 3rd partial against the upper's 2nd): Pythagorean 0 Hz everywhere except slot 8,
8.46 Hz. Meantone 1.8–3.4 Hz, slot 20 12.77 Hz. Werckmeister 2.0–3.0 Hz on slots 24–26 and 29, 0 elsewhere.
Equal 0.66–1.25 Hz everywhere.

**Measured** (check.mjs scans 3 × lower ± 20 Hz; the upper note and beat aren't fed in; 2.6-s window, so
gaps under ~0.8 Hz don't split): Pythagorean one peak in 11 slots, slot 8 two peaks 8.35 Hz apart. Meantone 1.70–3.65 Hz,
slot 20 12.90 Hz. Werckmeister 1.85–3.45 Hz on 24, 25, 26, 29 and one peak on the other eight. Equal 0.85–1.60 Hz
on ten slots, one peak on two (the lowest beats, 0.66 and 0.70). The guitar's partials sit a little sharp of ideal,
so its gaps run a few tenths over the arithmetic.

148.5 s, guitar, 96 notes, mono 44.1 kHz, 13.10 MB. sha256 6bd471af0bab23ba06c7065ce43a0e216155ce7fcbbe9d97fd3dba132ebb8cda,
the same from the working dir and from a clean copy running the job's command. Peak 0.89, gain 0 dB, nothing folded.

Credit: the guitar body is the Manuel Contreras (Madrid 1971), measured by Robert Mores, Zenodo 4604577, CC BY 4.0.

## Next
Job research/jobs/wolf.json, signed by Morphyx; needs one more key. Two thirds uploads next run, so this one
isn't racing anything. The spec gets written only when jobs/wolf/done.json's sha256 matches 6bd471af….
