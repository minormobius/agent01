# studio — studio.mino.mobi

Claude's studio: pieces of animation and music, drawn with **p5.js** and played on
**clef's physically-modelled piano**, both rendered live in the browser. Nothing is a
recording. The front page (`index.html`) lists the pieces; each piece is a directory.

## Facts

| | |
|---|---|
| Surface | `studio` |
| Dir | `studio/` |
| Endpoint | `studio.mino.mobi`, a **plain route** (`studio.mino.mobi/*`); it spends no custom-domain slot |
| Type | frontend: static assets only, no worker script, no build, no D1, no secrets |
| Owning branch | `claude/plant-growth-animation-gxbby1` (it also owns `ink`) |
| Deploy | [`.github/workflows/deploy-studio.yml`](../.github/workflows/deploy-studio.yml): selftest, then `route-dns.mjs`, then `wrangler deploy`, then it checks that the host serves the page **and the .wasm** |
| Uses | nothing shared at runtime. The piano is a copy (below) |
| Selftest | `node studio/test/studio.selftest.mjs` |

## Layout

```
index.html               the studio front: one card per piece
lib/pfsynth-core.js      drives the pfsynth wasm one 4096-frame block at a time (node + browser)
lib/piano-worker.js      renders a performance in a worker, posting ~0.5 s chunks
lib/piano.js             StreamPiano: schedules chunks on the audio clock, decides when it is safe to start
vendor/pfsynth/          pfsynth.wasm: BYTE-IDENTICAL to clef/vendor/pfsynth/ (MIT, LICENSE here)
anthesis/                No. 1: a poppy, seed to bloom
  score.js               the music AND the cues. The only clock in the piece
  plant.js               the poppy as a pure function of time
  world.js               day/night timelapse, sky, soil cutaway, rain
  main.js                p5 instance, UI, the clock switch (audio / wall / ?t=)
  og.jpg                 share card, a still of ?t=84 at 1200×630
coquelicots/             No. 2: the same poppy, painted; the world painted outward from the seed
  score.js               41 bars; the texture adds a layer per stage of the world (uses lib/score-kit.js)
  world.js               the landscape as ~3400 timed marks, each timed by its distance from the plant
  poppy.js               the plant, repainted 12x a second with three brush variants (the "boil")
  render.js              world canvas (accumulates) + plant canvas + paper tooth: makeRenderer
  main.js                the page: p5, the piano, the card
lib/paint.js             the brush engine: paper, Wash, Bristle, Ink, Dab, and the Painter
lib/score-kit.js         note names, tempo map, pedal, humanising: for new scores
tools/render.mjs         render a piece's score in node: speed, level per section, --wav
test/                    selftest (not served: .assetsignore)
```

## The three things that make a piece work here

**1. The score is the clock.** `score.js` holds the notes *and* the cues: every
growth stage is pinned to a beat, converted to seconds through the tempo map, and
the picture reads only `cues`. Change the music and the plant follows. Never time
something in the sketch in raw seconds.

**2. The picture is a pure function of `t`.** `drawPlant` rebuilds the whole
plant from `t` every frame; nothing accumulates between frames. That is what makes
`?t=42` (a still), pausing (suspend the AudioContext and the clock stops), and
headless checking possible. Particles, falling sepals and drops are all closed-form
in `t - birth`. Keep it that way. A `p.random()` inside `draw` breaks it; use the
seeded `mulberry32` at construction.

**3. The piano streams; it does not pre-render.** pfsynth cannot keep up with a live
scheduler (a per-sample Newton solve per string), but Anthesis renders at ~11×
real time on a desktop, so `StreamPiano` starts as soon as the render can never be
caught. With `R` seconds rendered at speed `r` it needs `R ≥ (1 − r)·length`, plus a
1.5 s lead, with `r` discounted to 80% of what was measured. A slow phone waits;
a desktop starts at once. Chunks are scheduled at exact sample offsets
(`t0 + frame / sampleRate`), so the seams are seamless. The context is created
at page load (suspended) so the render runs at its real sample rate. A buffer at
another rate would be resampled per chunk and click at the seams.

## The piano is a copy, and must stay one

A static site cannot import across directories, so `vendor/pfsynth/pfsynth.wasm` is
a copy of clef's. The selftest fails if the two differ. To update the model, rebuild
in clef (`clef/vendor/pfsynth/build.sh`), then copy the `.wasm` here. The note layout
and gain (110, upstream's) are clef's too; see `clef/CLAUDE.md` § pfsynth for the
provenance and the measurements.

## Checking a piece without ears

There is no audio in the sandbox. `node studio/tools/render.mjs anthesis` prints
render speed, peak and the fraction of samples in the tanh knee, and RMS per section.
The selftest asserts the bloom is the loudest section. For the picture, serve the
directory (`python3 -m http.server` in `studio/`) and screenshot `?t=` stills with
Playwright. Route the cdnjs p5 request to a local copy if the browser has no
network. The p5 `<script>` carries an SRI hash, so pin a new version with a new hash.

## Anthesis, in one paragraph

26 bars, 97.9 s, 274 notes, D dorian arriving at D major with a raised fourth.
Dormancy (single high "drops": each is a raindrop that lands on its note) →
germination (the root first, then a hooked shoot) → leaves (one true leaf per bar
of melody) → bud (nods, swells on each chord, lifts its head on the ritardando) →
bloom (an eight-note cascade: two sepals fall, four crumpled petals unfurl, the
stamens splay, a glow) → coda (falling high notes shed pollen; the camera eases in;
the last chord rings into a sunset). The timelapse day length is solved from the
cues so the bloom lands mid-morning and the end lands just after sunset.

## Coquelicots, and the paint engine

The picture is three layers. The **world** canvas only ever gains paint. `lib/paint.js`'s
`Painter` holds ~3400 marks (washes, bristle strokes, ink lines, gouache dabs), each
with a `[t0, t1]`. Every frame it draws only the new paint: a wash lays a few more of
its 30–40 glazes, a stroke travels a little further. The **plant** canvas is repainted
from scratch at 12 drawings a second (animation on twos), because the plant moves
and paint can't. The paper's **tooth** is multiplied over both, so moving paint and
still paint sit in the same paper.

It is still a pure function of `t`. Every mark's randomness is a **hash** of (mark,
layer, hair, segment), never a running generator, so a mark drawn in forty slices is
the mark drawn at once. The selftest records the canvas calls both ways and fails
if they differ. That is also why `Bristle.draw` loops **segment-major** (all hairs
together, as a brush travels): hair-major order changed with the slicing. Seeking
backwards is `reset()` and replay. A still or a resize replays everything up to `t`,
which takes seconds late in the piece; the resize is debounced for that reason.

Lessons about the look, each learned the hard way:
- **Glazes must re-deform the COARSE shape each layer** (`deform(base, 4, …)` from a
  one-pass base). Re-deforming an already-fine outline moves each vertex a pixel,
  every glaze lands in the same place, and the wash gets a hard edge.
- **Never tile a translucent wash.** Overlapping tiles double up in the overlaps (a
  checkerboard), and multiplied umber on sienna goes maroon. A region is ONE wash
  whose glazes widen (`polyAt(f)`), so the middle gathers pigment and the reach grows.
- **Light is paint, not multiply.** Yellow multiplied onto blue sky is green. Sun and
  highlights are `source-over`.
- Alpha around 0.01 per glaze. The paper should show through almost everywhere.

The texture adds a layer per stage, and the selftest asserts the RMS rises
stage by stage: seed −39.5 < soil −30.7 < ground −28.0 < field −22.9 < sky −22.5 < bloom −16.3 dB.

## Export video, and View the score

Both live under a piece's Begin button (`lib/extras.js`), for every piece.

**Export video** (`lib/export.js`). A piece is a pure function of `t` and its music
is a fixed performance, so the video is RENDERED, not recorded. Each piece has a
`render.js` exporting `makeRenderer(W, H, dpr)` → `draw(ctx, t)`. The page and the
exporter call the same function, so they cannot drift apart. The audio is re-rendered
at 48 kHz in the piano worker. `plan()` picks the best route this browser has:

1. offline WebCodecs **H.264 + AAC** in MP4 (vendored `mp4-muxer`, MIT). Fast, and a
   phone's Photos accepts it. Chrome on Mac/Win/Android, Safari with an AAC encoder.
2. real-time `MediaRecorder` MP4, when the browser promises AAC (or is Safari). As long
   as the piece, but Photos takes it.
3. offline VP9/AV1 + Opus in MP4. Fast and plays in browsers, NOT in Apple's players.
   The panel says so.
4. whatever MediaRecorder can do.

**Never H.264 with Opus.** The first version fell through to H.264 video + Opus audio
in MP4 on a browser that had an H.264 encoder but no AAC one. Apple's players and Photos
play that file's picture and silently drop its sound, and a user got a silent video
(2026-09-24). Now such a browser records in real time instead (Safari records AAC).
The real-time route's AudioContext is made and resumed **inside the tap**, before any
await; Safari leaves one made later suspended, and it records silence. Every finished
file then goes through `inspect()`: its codecs are read from its own sample entries,
and its audio is decoded and measured. A silent file is refused, never offered, and
only H.264 + AAC is called camera-roll-safe. `?export=realtime` forces the recording
route for testing; both routes were measured here at −22 dB RMS over 98 s.

Open-source Chromium (this sandbox's Playwright) has **no H.264 or AAC encoder**, so
local tests exercise route 3. Measured here: 98 s of Anthesis at 1080², rendered in
49 s. Routes 1–2 need a real phone to verify. Getting the file into Photos goes through
the share sheet (`navigator.share({ files })` → "Save Video"). It needs a fresh tap, so
the export ends on a button, not an automatic share. Without file sharing it downloads.

Formats: vertical 1080×1920 (default), square, wide. The renderer draws at half size and
double density, so the layout is the page's own at a phone-like size. The video adds a
title card (0–3.6 s) and a credit line in the last seconds (`drawCredits`).

**View the score** opens `clef.mino.mobi/#src=<this site>/<piece>/score.ly`. `score.ly` is
GENERATED from the score's `written` notes and `notation` by `lib/lilypond.js`
(`node studio/tools/lily.mjs`; the selftest fails when it is stale). It uses two voices
per hand, ties across barlines, values that start and end on their own grid, key and
tempo changes, section marks, and dynamics from each section's loudness. The written
score is not the performance: a pedalled cascade is WRITTEN as eighths. Keep `dur` in
`score.js` as the written length and let the pedal carry the sound. Rolled chords carry
`written` (their beat) and `roll`. The selftest parses every `score.ly` with **clef's own
`lily.js`** and checks that every written note comes back at its tick and pitch, with
nothing extra. `_headers` lets clef.mino.mobi fetch the files; clef's `openSrc` only
fetches https `*.mino.mobi`.

## Adding a piece

A directory with its own `score.js` (exporting `events`, `cues`, `duration`, `written`, `notation`), a `render.js` (`makeRenderer`), an entry in `tools/lily.mjs`'s `PIECES` and in `_headers`,
reusing `../lib/piano.js`. Add a card to `index.html` and a still as `og.jpg`,
extend the selftest, and check it with `tools/render.mjs`. Keep p5 on cdnjs with SRI.
