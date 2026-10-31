# Sonar in air — sources

Literature for [`/sonar/`](https://sci.mino.mobi/sonar/), a working one-emitter,
one-receiver air sonar that runs in a phone's browser. `sci.selftest.mjs` §8
asserts every DOI on the page is catalogued here.

Citation metadata for every entry was confirmed against Crossref on 2026-10-15,
and every DOI resolves. **[unverified]** means the full text was not read from
this sandbox: the page only uses that source for what its title and abstract
establish, and anything more specific must be checked against the paper first.

## The signal path

- **Turin, G. L. (1960).** An introduction to matched filters. *IRE Trans. Inf.
  Theory* 6(3), 311–329. doi:10.1109/TIT.1960.1057571. **[unverified]**
  *Gives:* the matched filter (correlate against the known pulse) as the
  receiver that maximises peak SNR, and pulse compression of a swept pulse. The
  page's numbers do not come from the paper. The selftest measures resolution,
  sidelobes and recovered range on synthetic echoes.

## The medium

- **Cramer, O. (1993).** The variation of the specific heat ratio and the speed
  of sound in air with temperature, pressure, humidity, and CO₂ concentration.
  *J. Acoust. Soc. Am.* 93(5), 2510. doi:10.1121/1.405827. **[unverified]**
  *Gives:* the full dependence of c, and the justification for using the
  ideal-gas `331.3·√(1 + T/273.15)`. Humidity and CO₂ move c by a few tenths of
  a percent at room conditions, below one sample of range at 48 kHz.
- **Bass, H. E., Sutherland, L. C., Zuckerwar, A. J., Blackstock, D. T.,
  Hester, D. M. (1995).** Atmospheric absorption of sound: Further
  developments. *J. Acoust. Soc. Am.* 97(1), 680. doi:10.1121/1.412989.
  **[unverified]**
  *Gives:* the pure-tone absorption formula standardised as ISO 9613-1:1993
  (classical + rotational loss, plus O₂ and N₂ vibrational relaxation).
  Implemented in `sonar/sonar.js`, and the selftest checks it against the
  standard's tabulated 4.66 dB/km at 1 kHz, 20 °C, 50 % RH.

## Phones as sonar

- **Peng, C., Shen, G., Zhang, Y., Li, Y., Tan, K. (2007).** BeepBeep: a high
  accuracy acoustic ranging system using COTS mobile devices. *SenSys '07*.
  doi:10.1145/1322263.1322265. **[unverified]**
  *Gives:* precedent for timing against your own recorded emission rather than
  trusting the OS's audio latency, which is the page's direct-path trick.
- **Nandakumar, R., Iyer, V., Tan, D., Gollakota, S. (2016).** FingerIO: using
  active sonar for fine-grained finger tracking. *CHI '16*.
  doi:10.1145/2858036.2858580. **[unverified]**
  *Gives:* precedent for phone-speaker/phone-mic active sonar resolving a
  finger's motion by looking at changes between successive echo profiles.

## Not yet sourced

The page's AirPods section relies on general Bluetooth behaviour: the
hands-free profile's speech-rate microphone path and the radio link's latency.
It quotes no number for either. The page *measures* the sample rate and the
latency and prints them. A Bluetooth SIG HFP specification citation belongs
here before the section makes any quantitative claim.
