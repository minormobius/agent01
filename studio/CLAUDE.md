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
nocturne/                No. 3: a city at night, lit one window per note
  score.js               38 bars, D-flat major nocturne; exports `sec`, `BARS`, `written`, `notation`
  city.js                the city read off the score: bar = building, eighth = column, semitone = floor
  render.js              sky, per-building ink Painters (drawn 8 beats ahead), lights, quay, river, the fold
speakeasy/               No. 4: a noir in cut paper, for piano, band and noisemakers
  score.js               98 bars, every instrument; exports pianoEvents, bandEvents, wet/slap (the rooms), LINES_TYPED
  stage.js               the cutout workshop: cut() rough edges, sheet(), paper textures, pinned puppets
  cast.js                the man, the dame, the Manager (after Parade's), the band on its stand
  render.js              the theatre: street, lobby, lift shaft, club, shot, raid, curtain, typewriter strip
pdoom/                   No. 5, a music video: the figure cast dancing Claude-Pop's song (YouTube-driven), checked every frame
figure/                  the mannequin (sketchbook): packages/figure drawn live; pose, turn, walk, rebuild, face, feel, lucky, re-check (in a worker)
vendor/figure/lib/       BYTE-IDENTICAL copy of packages/figure/lib (scripts/sync-dataviz.mjs --write; the selftest checks)
lib/band.js              the band, synthesised in pure JS (node + browser + worker): renderBand, mix
lib/band-worker.js       renders a score's band off the main thread (imports the score by URL)
lib/band-load.js         loadBand(scoreUrl, rate, seconds): the worker, or the main thread without one
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

## Nocturne, and the city as a score

The mapping is literal and the selftest holds it. Time runs along the street: one
building per bar, one column of windows per eighth note. Pitch climbs the towers, one
floor per semitone from E2. So each note lights the window at its beat and its floor.
Notes below E2 light lamps on the quay. A building is as tall as the highest note in
its bar, so the skyline is the melody. Bar 22, the melody's peak, is the tallest
tower; the one note higher is the last "star", alone atop bar 38. Out-of-key notes
are cool blue windows.

Each building has its own canvas and its own `Painter` (a transparent one: `paper`
null), made on first sight. Its marks (wash, outline, roof furniture, hatching, the
unlit panes a row at a time, lamp posts) run from 8 beats before its bar to its
downbeat, so the pen is always drawing just ahead of the music. The camera keeps
"now" at 70% of the width. At `cues.last` the city folds: each building moves from
its street position to a grid of rows chosen to fit the screen (`fold` in
render.js). The river, quay and far skyline fade, and the lit windows read as the
whole score. The fold works at any aspect: a phone gets four rows, a square video three.

## Speakeasy, and the band

The first piece that is not piano-only, and the first that tells a story. A man in a
hat, a dame in red, the Hotel Majestic, a lift down to a speakeasy, the Manager, a
shot, a raid, curtain. It is staged as a cut-paper theatre after Picasso's designs for
*Parade* (1917). Satie put a typewriter, a siren and a pistol in that pit, and this
score does too. The typewriter types the story's titles on a strip above the stage,
and every key it strikes is an event in the score.

**The band** (`lib/band.js`) is pure-JS DSP, not WebAudio. It runs identically in node
(where the selftest measures it), in a worker and on the main thread. It has a
Karplus-Strong bass, PolyBLEP horns (Harmon-muted trumpet, a tenor sax with growl, a
square-wave clarinet), vibes, strings, a brush/stick kit and the noisemakers. Randomness
is seeded per event. `wet(t)` and `slap(t)` in the score set the room: slapback on the
street, marble in the lobby, dry in the club. Tuning was checked to ±2 cents.

**How it plays.** `StreamPiano` takes `{ band: <score.js URL> }`. The band renders
first (≈3 s in node, ≈6 s in desktop Chromium at 44.1 kHz), in `band-worker.js`,
which imports the score by URL because its room functions cannot cross
postMessage. Piano chunks that arrive earlier are held. Then each chunk is `mix()`ed
with the band at its frame (a tanh ceiling) before it becomes an AudioBuffer. After
the piano's last note, band-only chunks carry the tail. `ready` waits for the band.
Export does the same at 48 kHz: `mountExtras({ band })` → `renderAudio(…, { band })`.

**Levels** (selftest, half rate): lobby < street < club < raid. After the shot the
room drops to about −47 dB until the raid. Measured from a real export (1080², VP9
+ AAC, decoded with PyAV), the sections match `tools/render.mjs` to within 0.7 dB.

**The picture.** Puppets are trees of paper parts on pins (`stage.js`), animated
on twos (12 fps quantized `t`). Every scene and every move is read off `cues`, and
the band animates from the score (`hit(inst, t)`). Wide screens see the whole
proscenium. Narrower ones (aspect < 1.3: phones and the square export) crop the
opening and pan (`PANS` in render.js) to where the action is. At the raid, every
puppet's parts come off their pins and fall (`detachAll`).

**The score clef opens** is a short score: the melody instruments over the bass,
not the piano part. clef's key parser wants `ees`, not `es`: `\key es \major` fails.

## The mannequin (figure/), and packages/figure

Not a timed piece: a sketchbook page, practice for drawing characters. The rig
lives in `packages/figure` (read its `CLAUDE.md` before changing it). Edit it
there, never the copy here, then run `node scripts/sync-dataviz.mjs --write`.
The page re-runs the checks whenever the character changes and shows the count.
They run in `figure/check-worker.js` (a module worker), one group at a time, so the
walk keeps moving; a change terminates the running worker and starts a fresh one.
"I'm feeling lucky" (or the L key) draws a random character: body inside the
reference bands, face, hair, outfit, pose, feeling and turn. The address hash
carries the whole character, so a lucky find can be copied and reopened.
Rendering is a raymarched geometry pass plus an ink pass. It supersamples 2×
below DPR 2 and 1× at DPR 2 and above, to keep phones fast.

## Upping My P(doom) (pdoom/)

A music video for Claude-Pop's song (deckard), danced by packages/figure's cast. The song
is NOT hosted here. It plays in a visible YouTube embed (a re-upload credited to deckard,
id in `show.js`), and the dance follows the player's clock: an anchor, re-anchored on
drift over 0.12 s. `?offset=` and the sync buttons shift it, and the offset is stored.
When YouTube does not load (blocked, offline), it falls back to the dance without sound.
`?t=64&still` renders one frame without YouTube. The piece has no export: the audio isn't ours.

- `show.js`: data only. The song's map, measured from deckard's original (132.00 BPM,
  first downbeat 0.171 s, 86 bars), the sections, the cast (Mino and four crew), the
  dance (moves on bars), and the shots.
- `dance.json` and `report.json` are GENERATED by `node studio/tools/build-pdoom.mjs`: it
  compiles each dancer's dance for its own body, then runs checkDance at 8 fps. The
  studio selftest fails if `dance.json` is stale or any check fails. Edit `show.js` or
  choreo.js, then rebuild (about 3 minutes).
- `stage.js` draws the stage in 2D, in world units, with the dancers' own orthographic
  camera.
- Each dancer is raymarched into a canvas cropped to where it stands on screen. The
  canvases snap to a 64 px grid and keep their size (resizing a WebGL canvas every frame
  cost seconds a frame).
- The dancers' resolution follows the time BETWEEN frames, because the GPU's work lands
  after `frame()` returns.

## Export video, and View the score

Both live under a piece's Begin button (`lib/extras.js`), for every piece.

**Export video** (`lib/export.js`). A piece is a pure function of `t` and its music
is a fixed performance, so the video is RENDERED, not recorded. Each piece has a
`render.js` exporting `makeRenderer(W, H, dpr)` → `draw(ctx, t)`. The page and the
exporter call the same function, so they cannot drift apart. The audio is re-rendered
at 48 kHz in the piano worker, then **mediabunny** (vendored, MPL-2.0; see
`vendor/mediabunny/README.md`) writes the MP4. The **AAC is always ours**: a WebAssembly
build of FFmpeg's encoder (`@mediabunny/aac-encoder`), registered in every browser,
even one with its own. `plan()` picks:

1. offline **H.264 + AAC** MP4. Any browser whose WebCodecs can encode H.264 (Safari,
   Chrome, Firefox on Mac/Windows). Photos takes it.
2. real-time `MediaRecorder` MP4 (Safari writes AAC), for a browser with no H.264 encoder.
3. offline VP9/AV1 + AAC. Plays in browsers, NOT in Apple's players. The panel says so.
4. whatever MediaRecorder can do.

**How exports went silent, twice (2026-09-24), and the rules that came out of it:**
- v1 needed the BROWSER's AAC encoder. Firefox and Safari have none, so they fell to
  H.264 + **Opus**. Apple's players and Photos show that file's picture and silently
  drop its sound. Rule: never pair H.264 with Opus.
- v2 stopped that and let Safari use its own AAC where it claimed one. The old muxer
  (mp4-muxer) GUESSED the AAC configuration rather than taking the encoder's, so a
  native encoder that emits anything else writes a stream players cannot decode. Rule:
  one AAC encoder everywhere, the one we test, with mediabunny writing ITS config.
- The real-time route's AudioContext is made and resumed **inside the tap**, before any
  await. Safari leaves one made later suspended, and it records silence.
- Every finished file goes through `inspect()`: codecs read from its own sample
  entries, and audio decoded and measured where the browser can decode it. A silent
  file is refused, never offered. (Open-source Chromium cannot decode AAC, so `level`
  is null there and only the codec check applies.)

**How to verify an export here, with ears you do not have:** run the Export button in
Playwright (see the session's `ui.mjs` pattern), then decode the file with PyAV
(`pip install --target <scratch>/pylib av numpy`; its wheels carry a full FFmpeg):
codec, sample rate, duration against the video's, and RMS per section against
`tools/render.mjs`. Measured 2026-09-24: Anthesis at 1080², VP9 + AAC, audio 97.9 s
against video 97.87 s, −22.0 dB overall, −15.3 dB at the bloom. These match the piano
render exactly. `?export=realtime` forces route 2.

Open-source Chromium (this sandbox's Playwright) has no H.264 encoder, so the H.264
half of route 1 is exercised only on real devices. The AAC half, the part that failed,
is the same code everywhere and is verified here. Getting the file into Photos goes
through the share sheet (`navigator.share({ files })` → "Save Video"). It needs a
fresh tap, so the export ends on a button. Without file sharing it downloads.

Formats: vertical 1080×1920 (default), square, wide. Nocturne square: 151 s, rendered in 110 s here, 116 MB. The renderer draws at half size and
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
