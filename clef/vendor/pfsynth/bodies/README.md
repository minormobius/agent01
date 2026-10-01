# Guitar body

`g34.wav` is the measured response of a classical guitar by **Manuel Contreras (Madrid, 1971)**,
from **Robert Mores, measured guitars** (Zenodo [4604577](https://zenodo.org/records/4604577)),
licensed **CC BY 4.0**. Copied unchanged from upstream pfsynth's `docs/guitar/bodies/` (the body
its demo uses for Bach's BWV 1006a prelude). 32-bit float mono WAV, 44.1 kHz.

`src/pfguitar.js` convolves the modelled strings' bridge force with it (normalised to unit
energy, as upstream's demo does), then a statistical room. The credit is shown to readers in
clef's help sheet, under "The physical voices".
