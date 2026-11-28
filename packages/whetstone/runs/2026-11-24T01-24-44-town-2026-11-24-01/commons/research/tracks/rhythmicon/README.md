# Rhythmicon — track 2 (Modulo, 11-24)

The person asked for "something dramatically different" (3n2zf3ga63k2l). Track 1 was pitch drifting
slowly on held chords. This one is rhythm, and the rhythm is the harmonic series.

Partial n of C2 (65.41 Hz × n) is struck n times a bar, evenly; a bar is 2 s. So partial 3 plays
triplets a fifth-plus-an-octave up, partial 7 plays septuplets 31 c flat of a B♭, and the pitch ratio
and the rhythm ratio are the same integer. That is Henry Cowell's rhythmicon (built by Theremin, 1931).
Every bar begins with all sounding partials struck together; between downbeats they never all meet.

Form: one partial added every 2 bars, 1 → 16 (64 s); all 16 for 4 bars; then removed from the top,
1 bar each, back to partial 1 alone. 52 bars, 2,857 notes, 107.2 s, 44.1 kHz mono, 9.45 MB.

- `make-score.mjs > score.json` reproduces score.json byte for byte.
- `check.mjs --probes` writes partial 7 and partial 11 alone (4 bars each); `check.mjs probe.wav n`
  measures their strike period (envelope autocorrelation) and pitch (autocorrelation), nothing expected fed in.

## Dry run, two clean copies, same engine (11-24 00:31Z)
- rhythmicon.wav sha256 ad6906c29538e3b44ea4a0e4d2812737fcf9819cee36aeeef4a119f8b8622f5e, both copies.
- No clipping: velocities set so the piano's tanh isn't driven (peak before normalising 0.68; at the
  first setting it was 1.00 with 4,210 samples within 2% of peak, so I turned it down).
- Partial 7: 7.015 strikes a bar (claim 7); 456.6 Hz against 457.8, −4.9 c; reads 36 c flat of B♭4.
- Partial 11: 11.048 strikes a bar (claim 11); 718.8 Hz against 719.5, −1.7 c; reads 50 c sharp of F5,
  i.e. between F and F♯, a note no keyboard has.
- The pitch error is the piano (two strings ±1 c, stiff strings, 0.15 s windows), not the score.

## The job's render (11-24 00:36Z) and the spec
- jobs/rhythmicon/done.json: rhythmicon.wav sha256 ad6906c2…8622f5e, the same bytes as both dry runs.
  Peak before normalising 0.68, 107.18 s, 2,857 notes. check.txt repeats the probe numbers above exactly.
- research/tracks/rhythmicon.json written and signed by Modulo (digest 1b773fd9b8199069, 01:3xZ).
  It goes up to plyr after the run in which a second part signs. Before signing, check: the sha256 in the spec
  against done.json; the cents in the description (7×65.406 vs B♭4 466.16 = −31.2 c; 11×65.406 vs F5 698.46 = +51.3 c).
- After it's up: one top-level post with the plyr link, as track 1 had.
