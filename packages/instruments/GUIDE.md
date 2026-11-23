# Instruments: a piano and a classical guitar you can render

Two physical models from clef (mino.mobi's score editor), rendered offline to a WAV file with node
alone. They are John O'Laughlin's **pfsynth** (MIT, `vendor/LICENSE`), compiled to WebAssembly by
clef, unchanged here:

- **piano** (`vendor/pfsynth.wasm`): a digital waveguide per string, two coupled strings per note
  detuned ±1 cent (so a held note beats), a nonlinear felt hammer solved every sample, stiffness
  and decay that depend on pitch, a stereo soundboard and a room. It rings on after a note's damper
  until every string is quiet, so a render runs a few seconds past the last note.
- **guitar** (`vendor/pfguitar.wasm`): six modal nylon strings. Given pitches, the guitar chooses
  strings and frets itself, with a search over hand positions, and a string rings until a hand
  would stop it. The strings' bridge force is convolved with a measured guitar body (Manuel
  Contreras, Madrid 1971, measured by Robert Mores, Zenodo 4604577, **CC BY 4.0**: credit it
  wherever the sound goes) and then a small room.

## Render

    node render.mjs score.json --out take.wav            # 16-bit stereo WAV, 44.1 kHz
    node render.mjs score.json --out take.wav --mono     # half the bytes
    node render.mjs score.json --out take.wav --rate 22050
    node render.mjs --health                             # one second of each: proves this copy works

It prints one line of JSON: the file, its bytes, each part's notes, length and render time, and the
gain it applied. It writes only the `--out` file.

## A score

```json
{ "parts": [
    { "instrument": "piano",  "events": [ { "at": 0.0, "dur": 1.2, "midi": 60, "velocity": 0.6 } ] },
    { "instrument": "guitar", "events": [ { "at": 0.5, "dur": 0.8, "midi": 64.0 } ], "gain": 0.8 }
] }
```

- `at` and `dur` are seconds. `velocity` is 0 to 1 (default 0.7). `gain` (default 1) scales a part
  in the mix.
- **`midi` may be a fraction, on both instruments.** 69 is A4 = 440 Hz, and 69.215 is 445.5 Hz,
  21.5 cents up: a syntonic comma (81/80) is 21.506 cents. Measured on this copy: the piano within
  1 cent at A4 (the selftest checks it), the guitar within 0.1 cent at A3. For a just ratio r above a
  pitch m, use `m + 12 * log2(r)`.
- **The guitar's range is E2 to B5 (MIDI 40 to 83).** Notes outside it are folded in by octaves, and a
  chord of more than six notes keeps six. The report counts both (`folded_by_octave`,
  `dropped_from_chords`), so it never happens silently.
- **Guitar tablature**, when you want to say which string and fret: `"tab": [{ "at": 0, "end": 1,
  "string": 1, "fret": 3, "velocity": 90, "art": "hammer" }]` (string 1 = high E; velocity in MIDI
  units, up to 4 × 127; `art` is normal, hammer, pull, slide with `slideTo`, harmonic with
  `artParam` = the touched fret, muted or tie). Tab pitches are whole frets.
- Limits: 600 seconds, 32768 piano notes; rates 22050, 44100, 48000.

## Loudness

The parts are summed, and the mix is peak-normalised to −1 dBFS, because the guitar's bridge force
has no natural loudness and the piano is soft-clipped by its own `tanh`. The report says how much
gain was applied. The dither is seeded, so the same score renders to the same bytes every time.

## Sizes, for a job's 20 MB

16-bit stereo at 44.1 kHz is 10.6 MB a minute; mono is 5.3. So a job can bring back about 1.9 minutes
in stereo, 3.8 in mono, or twice those at 22050 Hz. The piano's tail counts: it rings a few seconds
past the last note.

## What it can't do

No other instruments, no sustain pedal, no live playback: it renders a finished score. Render time
grows with how many strings ring at once; `--health` (a three-note chord on each) takes under a
second, and the report gives each part's `render_s`.
