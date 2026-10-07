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
voice/                   a lab: Claude's voice by formant synthesis (lib/chipvoice.js), scored by Whisper (tools/voice.mjs)
avatar/                  Attractor Bodies (sketchbook): packages/attractor (vendor/attractor/lib) on the figure rig
lecture/                 No. 10, The Minormobius Lectures: a documentary as a lecture (script.js the words; score.js the clock; record.js, narration.js, faces/ GENERATED)
grew/                    No. 9, And Still It Grew: the major-key companion to No. 8 (score.js carries the harmony, drive and two voices; grown/film*.js do the rest)
nobody/                  No. 8, Nobody Drew It: one evolved Grown history replayed (world.js, history.js GENERATED), sung by the world's choir, a voice and piano
grown/                   Grown (sketchbook): bodies grown organ by organ from a program (packages/attractor lib/organism.js); gl.js WebGL
cycle/                   Colour Cycle (sketchbook): a 256-colour landscape under the real sky; scene.js, astro.js, stars.js (GENERATED), night.js, world.js + fly.js (the flight), sound.js, main.js
accretion/               Accretion (sketchbook): a flow that grows a geode round itself (packages/attractor lib/shell.js); gl.js WebGL
descending/              No. 7, Daisy Bell sung by the formant voice (lib/chipsing.js); a figure descending, after Duchamp
bommie/                  No. 6, a sitcom on a coral head: script.js (the clock), world.js (poses at t), sound.js (synth), render.js (raymarch)
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

## A Voice of Arithmetic (voice/, lib/chipvoice.js)

A lab for giving Claude a voice without a model: text to speech by the established techniques,
then (later) a learned one. The owner supplies ears and, when it comes to that, a voice.

- `lib/chipvoice.js`: words → phonemes (the CMU dictionary) → durations and pitch by rule
  (Klatt 1979, simplified) → formant targets per phoneme → 5 ms parameter tracks, smoothed for
  coarticulation → a Klatt-style synthesiser: a KLGLOTT88 glottal pulse (plus breath) through a
  nasal pole/zero pair and five cascade resonators; noise through two band-passes and a bypass,
  high-passed, for the fricatives and bursts. `VOICE` holds everything that is a voice (pitch,
  formant scale, rate, breath, open quotient) and each rule as a switch. Deterministic (the
  noise is an LFSR), so a rule change is measurable.
- `voice/texts.js`: my paragraph, and Harvard sentences lists 1–5 (50 sentences, 390 words):
  the honest test, phonetically balanced and unpredictable. `voice/lexicon.json` is the CMU
  dictionary cut to those words (`tools/voice-lexicon.mjs`); `voice/cmudict.txt` is the whole
  dictionary (BSD-2-Clause, `CMUDICT-LICENSE.txt`), loaded by the page when you type.
- **Scoring**: `tools/voice.mjs` renders each sentence and runs `tools/voice_asr.py`
  (faster-whisper, base.en, int8, beam 5, no prompt, each sentence alone), and prints WER and
  CER. It needs `pip install --target <dir> faster-whisper` and `VOICE_PYLIB=<dir>`; the model
  downloads from Hugging Face on first use (`HF_HOME`). `--set key=value` tries a VOICE setting;
  `--report` writes `voice/report.json`, which the page shows. On the 50-sentence set one run's
  noise is about ±2–3 points: don't trust a smaller change.
- A natural reference for comparison: Piper (`pip install piper-tts`, the en_US lessac voice)
  scores ~0–3% on the same sentences with the same judge. Its spectrograms were what showed the
  fricatives reaching down to 0 Hz.

- **The reference voice** (ElevenLabs): `.github/workflows/voice-ref.yml` runs
  `tools/voice-ref.mjs` when `tools/voice-ref/request.json` changes on this branch, with the key
  as a GitHub secret (it never reaches the repo or the sandbox), and commits what it made. Steps:
  `design` (candidate voices, to `voice/candidates/`, auditioned on the page), `save` (the owner's
  pick, to `tools/voice-ref/voice.json`), `speak` (the test set with character timings, 16 kHz
  WAV + JSON, to `tools/voice-ref/<voice_id>/`, unserved). The formant voice is measured and
  tuned against it; it is a reference, not the page's voice. Its commit is by GITHUB_TOKEN, so it
  does not deploy: the next push from here does. Using its audio to TRAIN a model waits on
  reading ElevenLabs' terms; the owner's own recordings are the clean source for that.

- **The reference, measured** (2026-09-25). The owner picked candidate 2c (ElevenLabs voice
  `NkiasLzNGB7MWA6gNgU4`); it read the paragraph, the Harvard sentences and a 48-frame phonetics kit
  (`PHONETIC` in texts.js: h_d vowels, stops before three vowels, consonants between vowels).
  `tools/voice-align-prep.mjs` renders the same texts with the formant voice, frame-labelled;
  `tools/voice_measure.py` warps those labels onto each recording by DTW over MFCCs, word by word
  (word spans from ElevenLabs' character timings), and measures each phoneme. Durations came out
  realistic. Formants were hard: LPC roots lost F1 (the fundamental is ~20 dB over everything; use
  0.97 pre-emphasis), band-picking confused back vowels, and even Praat's Burg tracker
  (parselmouth) read F1 at the pitch on many frames. `tools/voice_profile.py` keeps what passes
  sanity checks (8 vowels) and the durations and pitch, in `lib/chipvoice-profile.js`.
  The voice: 120 Hz median, 100–155 Hz, 11.7 phonemes/s, a fronted /u/ (F2 ~1300 Hz).
  **Result: transplanting it made the formant voice LESS intelligible.** Harvard WER ~29% →
  vowels 37.4%, durations 48.7%, both 50–58%. Real speech's pace is too fast for a buzzy synthetic
  voice (the same as the rate sweep), and half a set of measured vowels clashes with the textbook
  consonants and bandwidths around it: the textbook set is at least consistent. So `VOICE.profile`
  (1 vowels, 2 durations) stays 0. Using the reference well probably means fitting the whole
  synthesiser to it at once (analysis by synthesis), or a model.

- **Analysis by synthesis** (`tools/voice-fit.mjs`, 2026-09-25): nothing measured, everything
  fitted. 131 targets (vowel and glide formants, diphthong ends, fricative bands, stop loci and
  bursts; ±35% of the textbook) by coordinate descent on the synthesiser's own rendering of 2c's
  sentences against the recordings (MFCC distance after word-by-word DTW; timing not fitted).
  3 step sizes, ~7 min. The loss fell 37.4 → 33.8, the same on the held-out list 5 (it
  generalises). Whisper: Harvard 29.2% → 35.9%, paragraph 11% → 28%. **Spectral likeness is not
  intelligibility**: matching the reference on average pulls phonemes toward each other and loses
  the contrasts a listener uses. `VOICE.fit` (lib/chipvoice-fit.js) stays 0; the page plays it.
  Then **a listener's loss** (`--loss classify`): a nearest-centroid phoneme classifier built from the
  reference's frames (labelled once by aligning the textbook voice's rendering onto them) judges
  the synthesiser's phonemes; the loss is its negative log-probability of the right one. It fell
  2.73 → 2.59 (held out 2.67 → 2.55), and Whisper got WORSE: Harvard 48.7%, paragraph 34%. The
  proxy was gamed (e.g. F3s collapsing onto F2s, which the MFCC classifier doesn't mind). Both
  fits are kept in lib/chipvoice-fit.js (`VOICE.fit` 1 likeness, 2 classify) and play on the page.
  Lesson: only a real listener should steer it. Next: Whisper in the loop (slow: ~20 s an
  evaluation), on few parameters, with the formants' order kept (F1 < F2 < F3).

- **The grind: Whisper in the loop** (`tools/voice-grind.mjs`, 2026-09-26, 109 min). Coordinate
  descent on CER% (Whisper base.en, 20 Harvard sentences, a warm `tools/voice_asr_server.py`) +
  tone (dB RMS between the long-term spectrum's shape, third-octave bands, and 2c's recordings of
  the same sentences) + pitch (semitones off 2c's median and melody range). Every kept step writes
  `voice/grind/NN.wav` + `progress.json`; the page's "The grind" section draws the curve and plays
  them (`2c.wav` is the target). `--resume` carries on from the last step; touch `grind/STOP` to end.
  What it found, in order:
  - the fits so far moved only formant targets, and every voice sounded alike: **tone is the source
    and the prosody**. The tone gap was two things: 2c has ~17 dB more at 125–160 Hz (a chest voice
    close to the mic) and ~11 dB less at 500–800 Hz (a peaky F1). New controls: `warmth` (the glottal
    flow mixed into its derivative: a fundamental), `bw1` (F1's width), `hiss`, `tilt`, `bw`,
    `jitter`. `warmth` was first scaled 8× too weak (a step moved nothing the grind could see).
  - **the objective is chaotic at fine scales**: rounding a formant by <1 Hz flipped words (Whisper
    itself is repeatable on identical audio). Small gains can be luck; big moves are trustworthy.
  - at tone ×1.5 the grind spent its time on vowel nudges; phase 2 (tone ×4, pitch ×2, the voice's
    controls only) moved tone 7.5 → 5.5 dB, and warmth + a wider F1 made it MORE intelligible too.
  - raising pitch toward 2c's 120 Hz always cost Whisper more than it gained (113 Hz stayed).
  **Result, adopted as VOICE's defaults**: all 50 sentences WER 29.2% → 24.1% (CER 16.7 → 12.9),
  the 30 never tuned on ~23.5%, the paragraph 11.3%, tone 7.7 → 5.5 dB off 2c.

- **Phase 3, the consonants** (2026-09-26, owner: "the noise of s … too sudden with the onset").
  The hiss had no envelope: it switched on in ~5 ms. 2c's rises: s 120 ms, sh 70, z 55, ch/j 35,
  f/th/v 15–25 (10–90% of the >2.5 kHz band, from the phonetics kit). Now `shapeFrication` in
  tracks(): a smoothstep rise (`fricAttack`, 60 ms for a sibilant; ×0.33 f/th/v/dh; ×0.25 an
  affricate, whose sharp start is its cue) starting a third of the way into the sound before, and a
  fall (`fricRelease`). New stop controls: `aspLevel`, `aspMs`, `closure`, `voiceBar`. The envelope
  alone: 24.1% → 23.8%, paragraph 11.3% → 7.5%. Then 55 min of grind on 19 consonant parameters
  (the envelope, hiss, stops, the s/sh/z/f/th noise, the t/p/k bursts: `--only consonants`): the
  fall shortened to 22.5 ms, hiss 0.85, closures ×1.05, sh's band up, f's and s's upper noise up.
  **All 50: WER 22.6%, CER 10.8%; the paragraph 3.8% (2 of 53 words).** Adopted.
  Still failing: the velars' place (cow → toe, cool → pool, glue → do, gang → bag: k/g's burst and
  locus don't say "back of the mouth"), some initial t/s (Two → Who, salt → all), some vowels.

- **The stops rebuilt** (2026-09-26): k/g were heard as t/p/d/b. `PLACES` in chipvoice.js: each
  place's locus and locus-equation weight (lips F2 850, tip 1800; the velar has none: F2 just above
  its vowel's and F3 `pinch` Hz above that), its transition time (45/45/60 ms), burst (10/15/25 ms,
  a velar's compact and dying away) and breath (55/65/80 ms). The transitions are drawn explicitly
  from the release through the breath into the vowel, and into a stop from the vowel before; the
  generic smoothing only softens them. Untuned: all 50 WER 22.6% → **19.7%**, the 30 never tuned on
  22.2% → **18.4%** ("the crooked maze" 88% → 0%). Adopted.
  Then **phase 4, a grind on 13 stop parameters, overfit**: the 20 tuning sentences 22% → 16%, the
  other 30 18.4% → 23%. Rolled back (chipvoice-fit.js's `whisper` is step 45's again; VOICE's stop
  controls stay at 1). Phases 1–3 generalised because their moves were broad (warmth, the hiss's
  envelope); fine-grained parameters on 20 sentences learn the sentences. **Next grind: a held-out
  check inside the loop** (accept a step only if it doesn't worsen a second set), or more sentences.
  `grind/progress.json` carries `verdicts`, which the page shows between the steps.

- **A corpus, and a grind that checks itself** (2026-09-26). `tools/voice-corpus.mjs` builds
  `voice/corpus.json` from Moby-Dick (Gutenberg #2701), the Sermon on the Mount (KJV, Matthew 5–7,
  #10), minimal pairs in "Say ___ again." (velars, initial stops, sibilants), conversational lines
  and the Harvard sentences: 304 train, 46 validation, 49 test, every word in the CMU dictionary
  (`tools/voice-lex.mjs` loads the whole dictionary with lexicon.json on top). `voice.mjs --corpus
  val|test` scores a split by source. The voice as it stood: validation WER 17.6% (convo 2.6%,
  Moby-Dick 16.8, Sermon 21.6, pairs 37.5), test 20.9% (pairs 54%: "shin" → "soon", "blue" →
  "boo", "crass" → "dress"; some are homophones: tow/toe). A word alone is the honest consonant test.
  `voice-grind.mjs --corpus` draws a fresh `--batch` (24) of train each pass, scores validation
  after each pass (`val` in progress.json, white dots on the page's curve), keeps the best by
  validation and stops after `--patience` (2) passes without improvement, restoring it.
  **Phase 5, the stops again** (22 min): each pass improved its batch (11.3 → 8.5, 12.3 → 9.4% CER)
  and worsened validation (8.3 → 9.6 → 9.8%); stopped and restored the start. The same moves as
  phase 4 (shorter transitions, stronger voice bar, softer k burst) are noise-fitting. Nothing
  adopted: the stop controls are at their tuning optimum; the velar/cluster errors need structure.

Harvard WER through the first session (base.en; 80 words until the set grew to 240, then 390):
42.5% first render → +[h] 17 dB quieter 45 (noise) → slow glides out of R/W/Y 42 (R heard as
R) → on 240 words 40.4 → fricatives high-passed, F1 damped in aspiration 36.7 → function-word
shortening OFF 33.3 → breath 0.8 30.4 → on 390 words 27.4 → f0 105, oq 0.55, edge silence,
velar locus by vowel, affricate tails, broad SH ~29 (flat). The paragraph: 26% → ~8–11%.
What still fails: stops at word onsets (Two → Who, colt → coke), affricates (juice → goose),
some vowels (hill → heel). Next: listening with the owner, a chip-constrained renderer
(pulse/triangle/noise channels), then analysis-resynthesis from a recorded voice and a model.

## Descending (descending/), and the singing voice (lib/chipsing.js)

No. 7: Daisy Bell (Dacre, 1892; the song an IBM 7094 sang at Bell Labs in 1961) sung by the voice lab's
formant voice, for piano and voice. The voice comes in **fractured** and ends **embodied**, and so does
the picture: a figure descending a staircase in flat planes, after Duchamp (1912).

- `lib/chipsing.js`: the voice singing. A song is lines of `lyric` (hyphenated syllables, `_` a melisma)
  and `notes` ('C5:3 A4 r:1', beats), on a tempo map (`song.sec`). Consonants go BEFORE the beat so each
  vowel starts on it; intervocalic consonants carry to the next syllable except a nasal/liquid before
  another consonant. Pitch: a damped spring between notes (overshoot), vibrato 5.3 Hz arriving 0.22 s into
  a held vowel, a slow wander; F1 raised to the pitch on high notes; diphthongs hold, then glide in their
  last 150 ms (`hold` in chipvoice's tracks()). `consonants` ×1.4 capped at half a note: Whisper hears
  the chorus nearly whole (the fast last line was the hard one). `embody(t)` 0..1: at 0 a chip (a
  pulse-wave glottis via tracks' optional `chip`, pitch steps with no spring or vibrato, vowels clipped
  to 45%, the output sample-held to a quarter rate and quantised toward 4 bits: renderFormant).
  **Every vowel is pinned to its beat after layout**: a stop's closure/burst/breath make their own
  frames, and the old relative correction let the song drift up to 270 ms late (the owner heard
  "syllables slip over the beat"). Now each vowel's real start is measured and the error comes out of
  the vowel/silence before it, then the consonants; the selftest holds the worst under 6 ms (2.5).
  Notes come back with `sungAt`/`sungEnd`.
- `descending/score.js`: 3/4 (`B(bar, beat)` is 3 beats a bar), 138 bpm. Intro (music box), three
  choruses (sparse / waltz with answering arpeggios / a tone up in G with the tune doubled, octave bass
  and runs), interludes, a coda rolling the last chord up the keys. `embody(t)` is here: the voice and
  the picture read the same curve. `vocal(sampleRate)` sings it; lib/band.js mixes it as the band
  (`renderBand(..., { vocal })`, band-worker.js and band-load.js pass it). `lexicon.js` is GENERATED
  (`tools/descending-lexicon.mjs`). No score.ly: lib/lilypond.js writes 4/4 only (`mountExtras({ score: false })`).
- `descending/figure.js`: the staircase (RISE 0.17, RUN 0.28; tread j at y = −j·RISE) and the figure as
  pure functions of t: one tread per bar (bars 9–124, 116 treads), a foot landing on each downbeat,
  step over step; the rear foot rolls onto its toes before swinging (without that the rear shin raked
  back and it read as kneeling); a closing step at bar 125, then it straightens and turns to face us.
  The selftest: heels and toes clear every tread (2 cm), legs never over-reach, planted feet stay put.
- `descending/render.js` + `thought.js`: **the figure goes from wood to thought** (owner, 2026-09-26: don't
  draw attention to the mannequin's exact shape; keep the long tail throughout; a self-portrait). The
  voice and the picture move opposite ways: the sound gains a body while the body becomes math.
  - The wood: limbs are cones in three flat facets. Up to 15 exposures a fraction of a second apart,
    set back up the stairs. `burnAt(t)` (bars 12–42) burns each facet at its moment (head first, feet
    last, a hash): it chars, shrinks to its middle with an ember edge, throws sparks into the light, and
    is gone. Older exposures burn later: the fire runs back along the trail.
  - The thought (`thought.js`): 3200 points, each anchored on a part's surface and given a place in a
    strange attractor fitted to that part (its longest axis along the bone): Lorenz the torso, Aizawa
    the head, Thomas the limbs, Halvorsen the hands and feet. The attractors are integrated ONCE at load
    (RK4, ~0.1 s) and read by index (offset + t·rate), so it stays a pure function of t. `mathAt(t)`
    (bars 34–80) moves the points from surface to orbit; the head swells and brightens on each sung
    vowel; the last chord blooms the orbits out.
  - The points swirl over the mannequin's surface from the first frame (round each part, faster where
    it shears, and back and forth along it: closed-form in t), then loose into their orbits.
  - The trail (owner: "every figure saved at full opacity"): every exposure on a 1/3 s grid for 16 s,
    the wood's at full opacity, the light's at full strength, memoised per exposure. When the figure
    stands still (intro, coda) the history drifts up the stairs by how little it has moved, rather than
    piling onto the body (48 coincident exposures blew the final figure out to a white blob).
  - The world turns with it (`env.js`): the far wall is the song's **spectrogram**, 23k glints
    (voice harmonics shaped by each vowel's formants, piano partials by 1/k, a column every eighth of a
    bar, height by log frequency) written FIVE treads ahead of the figure as each moment is sung. Behind
    the figure the wall is under its own trail, so the song is written where it is walking to; by the
    coda it surrounds it. Each glint lights on its note with a flash, stays, and twinkles; drawn as a
    dash to the next column so harmonics read as lines. The stairs the figure has left turn to points
    (`STAIR` template: edges and faces) as `envAmt` rises (bars 30–100); the floor at the coda.
  - **The hand-off** (owner: the transition read as a ghost of the mannequin): each part lets go of the
    surface as its own wood burns (`LOOSEN` in thought.js: head bar 14 … feet bar 36, each over 30 bars;
    `mathParts(t)`), so the whole mannequin never stands as points: thought takes it from the top down.
  - **Export**: `makeRenderer` must return `{ draw }` (lib/extras.js calls `r.draw`); a bare function
    worked on the page and broke Export video. The selftest checks. A square export ran clean in
    headless Chromium (VP9 route, ~7 min for the piece).
  - **Long exposures** (owner: the trail's trailing edge was faint): each trail exposure (every 0.5 s)
    integrates the points over its whole window (5 instants, every third point), so the trail is
    continuous streaks as bright as the figure's own.
  - **Stairs become circuit boards** (`circuit(j)` in env.js: traces routed in 0/45/90° runs on a 1/24
    grid between pads, vias, gold edge-connector fingers down each riser; hashed per tread). The wood
    fades into the board as `stairLight` rises: the treads it has left from bar 30, all of them through
    the last chorus. A pulse runs along each trace once a bar.
  - **The grade** (`gradeAt`, bars 49–118): muted earth to a hyper-real orange and teal. Background, wall,
    board and vignette lerp to teal; the figure, trail, copper and the voice's spectrum to hot orange,
    the piano's spectrum to cyan. A soft-light teal pass goes on BEFORE the light (over the light it
    turned the orange figure yellow-green), and the light is tone-mapped on its brightest channel
    (per channel, a bright orange whitened). 22–34 ms a frame on the CPU-only canvas.
  - The light is added up in a Float32 buffer (half resolution above 0.6 MP), tone-mapped v/(1+v) over
    only the box the points touched, and laid on with 'lighter'. The glow is computed in JS (cells a
    quarter the size, blurred, added bilinearly), because a canvas-scaled blurred copy cost up to 200 ms
    a frame on a software canvas; the last chord's halo goes into the same cells. Headless Chromium
    (CPU-only): 10–20 ms a frame at 720p and at a phone's 3× DPR.
  - The lyric is lettered in the corner as it is sung. A tall frame puts the figure right of centre.

## Attractor Bodies (avatar/), and packages/attractor

A sketchbook, after Descending's final figure (owner: "the attractor avatar has some juice… a whole field
of attractors out there to fit a vague humanoid body plan"). The engine is `packages/attractor` (read its
README and CLAUDE.md), copied to `vendor/attractor/lib` by `scripts/sync-dataviz.mjs --write`.

- **The space**: Sprott's general quadratic flows, 30 coefficients named by a 30-letter code. A find must
  be bounded, chaotic (Lyapunov > 0.02) AND fractal (correlation dimension ≥ 1.5): Lyapunov alone let
  limit cycles through. ~1 in 1100 random codes passes; the bestiary holds 240 found + 10 named.
- **A character** (`character(seed)`): a body spec for packages/figure, an attractor per part class by
  fit (round head, broad torso, textured limbs; left/right mirrored; sometimes one for every limb: "kin"),
  a palette, and a style: threads (few points, long streaks: the curves show; the best), dust, ribbons.
- **The page**: walk or the figure's named poses, a turning camera, the knobs (thought: surface ↔ orbit,
  reach, swirl, speed), eight neighbour seeds as stills, "discover a torso" (a live search), the hash as
  the character. 50–60 fps in CPU-only Chromium at desktop and phone sizes.
- **The camera**: one finger orbits, two pinch (zoom about their middle) and pan, the wheel zooms about
  the cursor, a double tap goes home; kept in the hash as `cam=`. The auto-turn waits 4 s after a touch.
- **Hands, two levels**: far off each hand is one attractor; once a hand is ~30 px on screen its fingers
  fade in as threads along packages/figure's finger bones (`handPose`), in the character's gesture.
- **Other body plans** (`#plan=quadruped&family=hound`): mega/sprite's creatures (polypod, quadruped,
  radial, axial, isopod, four families each) ported to 3D bones in `packages/attractor/lib/plans.js`, same
  genes and gaits. mega/ is another branch's surface: port from it, never edit it. A creature's bones use
  the same five part classes, so the same attractor choices fill them; a bare seed is still the humanoid
  (no existing link changed). Creatures move or hold still, are looked down on a little more (pitch
  0.42), and are fitted to the stage by their extent over a gait. Lucky picks a plan a third of the time
  humanoid; the neighbours share the plan.

## Colour Cycle (cycle/)

A sketchbook (owner, 2026-10-06, after someone sent them Huckaby's Canvas Cycle: "procgen aesthetics
and atmospherics in graphics and music… I think it's something new… author a scene generator"; then
"constellation accurate stars… date, latitude longitude, direction… fly through the scene… up the
waterfall, a full loop in five days"). The technique is 8-bit colour cycling (Mark Ferrari's painted
scenes): each pixel is an INDEX into a 256-entry palette; the picture moves because ranges of the
palette rotate, and the day passes because the palette is re-lit. Ferrari's scenes are his; this uses
the technique only.

```
cycle/scene.js   the painting: generate(seed) (index map + palette), paintSunPath, light, palette (pure)
cycle/astro.js   sun (~0.01°), moon (~1°, phase), stars → alt/az for a moment and place (pure)
cycle/stars.js   GENERATED by tools/cycle-stars.mjs: 2851 stars to mag 5.5 + constellation figures
                 (d3-celestial, Olaf Frohn, BSD-3: the licence is carried in the file)
cycle/night.js   the real stars, the moon in its phase, the figures, over the painting's sky pixels
cycle/world.js   the 3D world: heightmap + per-cell palette index, trees, cabin, the flight loop (pure)
cycle/fly.js     Voxel Space renderer for the world (imported only when "fly" is pressed)
cycle/compose.js the duo's composer: notes bar by bar for the landscape and the moment (pure)
cycle/music.js   compose.js → pfstream.wasm, the guitar dressed by partitioned convolution (pure)
cycle/music-worker.js  the duo rendered ahead in a worker, posted half a second at a time
cycle/weather.js the forecast, lightning schedule and the light under weather (pure)
cycle/precip.js  rain, rings on the lake, snow, fog, the bolt, drawn in RGB over a finished frame
cycle/sound.js   the beds, the duo laid on the audio clock, the old pad and bells as its stand-in
cycle/main.js    the page: clock (real ms), place, facing, the two views
```

**The rule that makes it a look and not a filter:** the index map is authored FOR the palette. (The
PC-98 pass on the dancers was a palette squeezed onto a full-colour render, and the owner read it as
degradation.) What an index means is chosen by what it should do:

- **phase** for water: a waterfall's index is its row (plus a per-column lag) mod 16, so turning the
  cycle pours it; the lake's is a wobbling band, smoke's rises with height, foam's rings move outward.
- **facing** for rock, ground, pines, the cabin: index = which way the face turns. The palette lights
  faces by the sun's real direction, so shadows swing across the range from one painted image.
- **the sun's path** is painted into the sky: the day's REAL track (date, place, facing) as up to 60
  discs, one entry each, resting at the sky's colour at their height (the ramp and the discs share an
  elevation curve; mismatch shows as holes), each remembering the moment the sun stands there.
  `paintSunPath` re-paints only sky pixels, once a solar day or when the place or facing changes.
- **reflections** mirror the layer above into two tones × three ripple phases.

**The real sky** (astro.js, night.js). The painting's sky is a STEREOGRAPHIC projection centred on the
horizon straight ahead, 160° across: conformal, so constellations keep their shapes, and the horizon
stays the straight line the painting stands on; it shows about 60° up in the middle. Stars and the moon
are drawn per frame in RGB over sky pixels (a cloud hides them in proportion to the day's cover); the
moon's terminator comes from the sun's direction seen from the moon. Daily weather: `weather()` is a
seeded walk over days that fades the painted clouds (two height bands so they fade into the right sky).
The clock is real milliseconds: real time, or a day in 4 min / 1 min, or held; time shown is local
mean solar time at the longitude. Checked against Polaris, the equinox, New York's solstice sunrise
(09:25 UTC) and the October 2026 full and new moons (selftest).

**The flight** (world.js, fly.js). The painting's sibling in 3D: a 1024² heightmap of 4 m cells (lake
in a basin, meadows, a ring of mountains, a plateau with a cliff, a river in a valley across it pouring
over as the fall), x east and y north so the real sky lines up. Every CELL is a palette index (6
materials × 17 facing buckets, lake and river phases), and it is drawn the way Comanche drew in 1992:
Voxel Space, column by column, into an index buffer; so the palette still lights and moves the world.
The fall and cliff strata are indexed per ROW from height (a vertical face is one cell in a heightmap).
Close to the camera the cell is chosen through an ordered dither, so cells blend instead of blocking.
Per pixel, in RGB: haze by distance, the sky (gradient, sun glow and disc, a cloud layer at 1800 m from
a 512² texture, cover from `weather`), the lake's reflection (a second Voxel Space pass from a camera
mirrored below the water, which looks THROUGH water cells), and the stars and moon in true perspective,
reflected in the lake. Pines are billboards indexed by the compass way each needle-mass faces; the
cabin is six flat-filled quads with its window. The loop (Catmull-Rom through waypoints, re-timed by
arc length, kept 30 m clear of slopes sideways except at the fall) is flown once in FIVE DAYS of the
scene's clock: at 4 min a day, a 20-minute flight; held, it stops. The heading (owner: "camera rotation is stepping
clockwork") is a weighted sum of where the path goes over the next ~300 m (samples interpolated, a bell
of weights that slides with the camera), then averaged over ±5 s of the flight: a pure function of the
loop position. Measured at 60 fps over the whole loop: at most 10°/s, 0.007° change between frames
(it had been whole-sample aim points: 2.3° ticks, and 230°/s swings at the foot of the fall, where the
path's ground track doubles back). At night the gaze tips up (owner:
"more night sky when the landscape is dark"): the horizon sinks by how dark it is, within the shear
Voxel Space allows. The cloud texture tiles (its noise blended with shifted copies): a seam showed
as a straight line across the night sky. ~35 ms a frame in node, 35 fps in
headless Chromium (CPU); phones will be slower. Not seen on a phone; not listened to.

Budget: the painting uses 253 of 256 entries, the world 166. Cycles turn `perBeat` entries a beat with
fractional blending (`turnCycles`, Canvas Cycle's "blend shift").

**The duo** (owner, 2026-10-07: "procgen composition with John's piano and guitar. A Duende for every
landscape, sort of steady state but still sonically rich"). Endless music, composed as it plays:

- **The host** (`clef/vendor/pfsynth/pf_stream.c`, ours → `studio/vendor/pfsynth/pfstream.wasm` via
  clef's build.sh; clef's own two binaries rebuild byte-identical). pf_web.c and pf_guitar_web.c render a
  finished score; this one takes notes WHILE it renders. The piano is pf_web.c's chain with its note list
  turned into a queue; the guitar is six core/pf_pluck strings driven as upstream's host/pf_guitar.c's
  apply_event drives them (pluck position and material, harmonics as a touch lifted after the touch time,
  hammer-ons and pull-offs as legato, mutes), with upstream's defaults from its own init, on its
  128-frame absolute control blocks. What it leaves out is upstream's whole-score planning (string
  assignment, let-ring): the composer gives each note its string and length. Verified (selftest): the
  piano is pf_web.c EXACTLY at the same block size (max diff 0; at 4096 vs 2048 they differ by 1e-3
  because pf_web's own retirement depends on its block), the guitar is upstream's to −93 dB, with notes
  pushed 0.2 s ahead of the render. An endless stream cannot compute every struck string forever (as
  upstream's finite renders do): a released string 90 dB down in energy from its loudest is skipped
  until struck again. That took the render from 3.8× to ~6× real time in node.
- **The composer** (`compose.js`): the biome is the home (alpine D, canyon A as Duende's, autumn E,
  alien F#); the light is the mode's brightness on a ladder (Phrygian … Lydian) over that root, so it
  turns by modal colour; the canyon is flamenco: chords in A Phrygian with the major third on the home
  chord only (A major against Bb, C, Dm), the Andalusian descent every third phrase. Four time scales:
  the 12/8 bar (the palette's beat), the 4-bar phrase (question and answer, traded between the two),
  the 32-bar section (texture, mode, a harmonic plan), the day. Motifs (seeded) keep their shape;
  only where a line starts and lands is pulled onto the chord, it starts near where the last bar ended,
  and the whole line moves by octaves into its register (the first version snapped every strong beat to
  the chord and wrapped notes one by one: repeated notes and random leaps). Third bars develop (sequence,
  fragment, augmentation, inversion, retrograde); later phrases bring back what was sung. TEXTURES, by
  the time of day in the painting and by the leg of the loop in the flight (`place` per spline segment
  in world.js): lake (pedalled piano wave, guitar harmonics), falls (guitar tremolo, four notes to a
  beat against the 12/8, over held piano chords), river (a p-i-m-a ostinato on a shape found in one
  hand position with open strings, the piano singing), mountains (rolled chords on the 3+3+2+2+2
  accents, strums), stars (sparse, high, harmonics more with the moon). Guitar melody notes go where
  they sit lowest in reach (`#onString`); the selftest holds every guitar note on a string and fret.
- **The stream** (`music.js`, `music-worker.js`): the composer runs two bars ahead of the render; the
  guitar's bridge force is dressed as clef dresses it (the Contreras body, unit energy, upstream's room),
  folded into one impulse per ear and applied by uniformly partitioned overlap-save convolution (both
  ears in one inverse FFT). The worker keeps 5 s ahead of what the page has played and thins the music
  (`density`) if it renders under 1.6× real time. Chunks land at exact samples on the audio clock;
  scene seconds are the palette's clock, so the music and the palette keep one beat. Each note struck
  flares a star (night), a glint (day) or a firefly (dusk). The old pad and bells play only until the
  first chunk, or if the worker fails or falls behind (6 late chunks).
- Measured: ~6× real time in node at 44.1 kHz; −22 to −30 dB by texture; Chromium plays it with the
  painting at 60 fps. Not listened to here.

**The beds** (sound.js, WebAudio): the fall, the lake and wind as filtered noise, under the duo, on their
own gain: the "ambience" button turns them off without touching the music (owner: "the option to kill
the environmental noise"), kept in the link as `amb=0`.

**Weather** (owner, 2026-10-07: "Yep do it"). `forecast(seed, ms, lat, lon, force)` is pure: each local
day draws a kind weighted by season (storm needs warmth, snow needs < ~4 °C from `temperature()`: date,
|lat|, hour), and the hour shapes it (showers come and go on a noise, storms build 9–16 h, fog at dawn);
the last two hours of the night ease into tomorrow. `lying` is snow from the last three days × cold.
- Light: `weatherLight` greys and darkens zen/hor/amb, moves the sun's share into the ambient, scales
  `sunI`/`moonI` (disc, glitter) and sets `veiled`; a flash adds white. Both views go through it;
  lying snow whitens the land's albedo (painting by layer, flight by upness).
- Lightning is a schedule in SCENE seconds (1.7 s slots, chance 0.07·storm), not simulated ms, so the
  picture's flash, sound.js `thunder()` (delay `thunderDelay(dist)`, 1.2–17 s) and the composer's low
  cluster (music-worker `cond().thunder`) agree. The bolt draws only on open sky (`sky(x,y)`), so it
  strikes behind the ridge, not across it.
- precip.js draws in RGB after the palette (rain crosses everything, no index can mean "rain over
  whatever"). Fog in the painting is a band at the waterline plus a veil on far layers; in the flight
  it is the haze distance.
- Sound: a rain bed (high-passed white + band-passed brown) and wind scale with rain/storm/wind, under
  the ambience gain. The composer's texture follows: storm → mountains, snow/fog → stars/lake, rain →
  river/falls.
- Chooser: auto or a kind, `wx=` in the link. Not judged by ear here.

**The page**: hard square pixels covering the stage (drag to pan the painting when cropped). Controls:
day speed, an hour scrubber (solar time), "sky" (place presets incl. "here" by geolocation, date,
facing, weather), constellation figures, the palette strip, fly. `#seed=N&lat=&lon=&face=&date=YYYY-MM-DD&h=
&speed=&fig=1&mode=fly&wx=&amb=0`.

## Accretion (accretion/), and packages/attractor/lib/shell.js

A sketchbook (owner, 2026-09-27, after a Cryptic from Stormlight: "that mixture of morphing and
crystalline… creatures grown then lived in… I see us as some kind of hybrid organism"). Our own thing,
not a Cryptic: a creature that is a FLOW (a bestiary attractor, its orbit running) and a HOUSE of
crystals the flow grows round itself. The flow is the process; the crystal is what it leaves, and what
shapes it next.

- **The rules** (shell.js): the orbit's density, blurred, is the nutrient; close in it is the current.
  Crystals nucleate on a band of nutrient (fed, but out of the flow's way), more readily beside others
  (anyone's: a druse clusters), pointing up the nutrient's gradient: in, at the flow. A tip grows while
  fed and is dissolved back where a current runs, so the tips stop short of the orbit and carve a room.
- **An ecosystem, not a script** (owner, 2026-09-27: "what compels the attractor to translate… better if
  it emerged… rather than the geode strictly following the flow"). The first version wandered a fixed
  Lissajous path. Now a `World` holds a MEDIUM of dissolved mineral in seeded veins (a 4-unit grid) and
  1–5 creatures. A flow grazes the medium where its orbit runs; crystals are built out of it (nucleation
  and growth need it and take it); a dissolved crystal gives its mineral back, and so does eroding reef;
  the medium diffuses and seeps back to its veins slowly. Motion is forces, integrated with damping:
  HUNGER (up the medium's gradient, sensed 2.2k away, scaled by how eaten-out its own place is),
  CROWDING (a tip in a flow's current pushes it along the crystal: its own house closing in, or another's
  reef), a little distance between flows, the walls. It turns slowly to face its way and the house is
  re-grown to fit. Any flow's halo feeds (keeps alive) any crystal; any flow's current carves any crystal.
  So: a creature grows while its place is rich, eats it out, climbs toward richer water, and leaves a
  reef that stores the mineral until it erodes back. A creature born somewhere poor barely grows and
  goes looking (the selftest's world 1: 126 units in 3000 steps).
- **Genes**: the attractor, size, halo/wall/channel, girth, reach, habit (a pull to the cube's axes and
  diagonals), clustering, appetite, restlessness, the mineral (bismuth's thin film, quartz, amethyst,
  obsidian, citrine: `MINERALS`).
- **Deterministic**: every decision is a hash of (thing, step); creatures step in a fixed order (all
  grow, all carve, all move); the world after n steps is a function of (seed, count, n). The selftest
  checks the world is the same twice, tips point in and stay out of their current, a hungry flow moves
  on by itself, everything stays finite and in the world, and mineral cycles. ~0.6 ms a step for three.
- **The page** (gl.js, WebGL1): each crystal a hexagonal prism and point, flat-shaded, with a knobbly
  lump of rind rock at its base, so a house reads as a geode; **cut open** (a plane through what the
  camera looks at, square to the view) shows the druse and the flow inside. Toggles: **rind** off, and
  **lit reef** (a crystal no flow feeds keeps its light instead of bleaching: a wake of gems; with the
  rind off it reads as glowing gem clusters). Glass minerals are lit by their own flow's colour; bismuth
  takes the oxide film. Per creature, two meshes: reef (crystals near no flow, every 3 s) and live.
  The camera frames the whole world or follows one creature. `#seed=N&n=3&at=S` grows S steps first.
- Measured only in SwiftShader here (CPU raster, meaningless for a GPU). Real-device frame rate is
  unverified.

## The Minormobius Lectures (lecture/), No. 10

The owner (2026-09-29): "making minormobius the documentary… deep reading of the public sources (really just
bsky), documentary tone… social graph over time, eras and epochs… an attractor avatar presenting this
character to a class aboard some O'Neill cylinder"; then "the preagentic era mattering… all the homies can be
named and depicted, everyone ID'd by their pfp… the arc of agent01". A treatment was agreed first (a private
artifact page); this is its build.

- **The record** (`record.js`, GENERATED by `tools/lecture-record.mjs`, which needs the network and a full
  clone): his public repo as a CAR (`com.atproto.sync.getRepo`, no auth; ~93 MB, 51k posts, 182k likes),
  reduced to posts per month, the twelve accounts he paid most attention to per era (replies 3, mentions and
  quotes 2, reposts 1, likes 0.3) with their profile pictures saved to `faces/` (a canvas that draws another
  host's image cannot be exported), 16 of his own top-level posts per era WITH their pictures for the orb
  (owner: "all shown posts gotta contain the images… fewer posts is ok as long as they're intelligible"),
  the quoted posts exactly with their pictures (images, a video's poster frame, a link card's thumb; blob
  CIDs re-encoded base32 for the AppView CDN), all shrunk to 420 px into `posts/` (python3 + Pillow),
  commits per month, and each served directory's first commit. **Only his posts are quoted**; other
  people appear by handle, name and face (the owner asked for that). The corpus itself never enters the repo.
- **The eras** are hand-read (script.js `ERAS`), from posting volume, how much the circle turned over
  quarter to quarter, and distinctive words: the invite era (2023-04–09: hellthreads, beamposting), the
  reading room (to 2024-06: the book club he founded, Neuromancer first), the New Sun (to 2025-06: Wolfe),
  the quiet (2025-07–12: 72 posts in September; the record says kids, a job, pizza night), agent01 (2026-).
- **The script is the clock** (`script.js` → `score.js`): each line has what is said (`say`, spelled for the
  formant voice) and what is shown (`text`); `narration.js` (GENERATED, `tools/lecture-narration.mjs`) holds
  the lexicon and how long each line takes, and score.js lays them end to end (a breath between, a longer
  one after a quoted post, a title card per lecture). Change a line, rerun the narration tool. The piano is
  written against the same seconds (60 bpm, a beat a second): F major under the voice, D minor for the quiet,
  broken chords for the return, the call on each title card, a rolled chord at "Class dismissed". `vocal()`
  speaks every line at 16 kHz, reads it up to the output rate, and puts it in a small hall.
- **The picture** (`render.js`, 2D canvas, pure in t): the cylinder as hoop's home screen sees it (owner:
  "view from the surface, sun rail moves all the way through… passing overhead"): a perspective camera
  standing on the floor, tipped up, walking slowly down a bore 7 radii long; the rind a foam of jittered
  hexagons up both walls and over the roof; the sun rail the whole axis, from over our heads to the far
  cap, with a day's light travelling along it; the wild ecosystem drifting round the axis. (The first
  version looked along the axis from its end, the sun a point: the owner wanted to stand on the ground.)
  The 146 sites are cells on the walls and far roof, dark until lecture 7 lights each in the month it was
  born, named as they light. The lecturer is an attractor body
  (vendor/attractor), three poses solved once and eased between line by line, brighter and further into its
  orbits while speaking. Boards per lecture: the orb (his posts, picture above text, on a turning sphere; only
  the ones facing us carry their words), faces (a ring per era,
  crossfading), words, quotes, the chart (posts, and commits under them), the sites, the tools. Subtitles
  always. Vertical frames put the board above and the lecturer below.
- Not verified here: the audio in a browser (the vocal and piano ran in node only) and an export.

## And Still It Grew (grew/), No. 9

Owner, on No. 8: "Holy shit that slaps… a haunting morosity… a different version, maybe in a major key,
denser of description, more lyrics, more sound, more music theory, a burst of creation". The same world
and machinery (the films now share `grown/film.js`, the replay and the choir, and `grown/film-render.js`,
the picture, each configured by a piece's world.js and render.js), its own music:

- **The harmony** (`score.js`, bar by bar, `chordAt`/`harmony`): 116 bpm, D major. Intro on Dsus2; verses
  I–vi–IV–V; choruses I–V⁶–vi–IV–I⁶–IV–V–V⁷ over a bass walking down D C♯ B; time-lapses round the circle
  of fifths (vi–II⁷–V–I, E7 as V of V); verse 2 borrows iv (Gm) for "mouth after mouth"; verse 3 sits in
  B minor's shadow with F♯7, its dominant; the bridge is ♭VI–♭VII–I (B♭–C–D), with a 4–3 suspension on
  "drew it"; the last time-lapse is a dominant pedal on A, then B7 pivots to E; the last two choruses
  are a whole step up, in E; the coda is IV–iv–I twice (A, A minor, E), a plagal amen that keeps a little
  of No. 8's minor. `harmony(t)` returns one chord object per chord, so the choir moves only on changes.
- **More sound**: grown/sound.js's engine takes `harmony`, `drive` and `voices` now (the defaults are
  the world's own, and No. 8 renders exactly as before): `drive(t)` by section adds a kick on one and
  three (and the and of three when full), a snare on two and four, hats in eighths, and bells bursting
  over the chord's tones; the choir holds eight species. A second voice sings a diatonic third below the
  lead in the choruses (`harmonySong`, generated from the lead by `thirdBelow`).
- **Denser words**: forty lines, mostly eighth notes, 362 sung notes: the founders, losing the gut and the
  chains ("some of us grew like a stair, like a chain, mouth after mouth after mouth, again"), the biters,
  Quul ("trailing four mouths through the gold and the mud"), and the choruses turned outward at the end.
  `lexicon.js` GENERATED by `tools/nobody-lexicon.mjs grew` (it takes the piece's directory now).
- **Four moments**: `history.js` GENERATED by `tools/nobody-history.mjs grew 0,150000,300000,950000`
  (~17 min; the same seed-1 run): the founders, the world of Novi (step 150,000, before Quul: this is
  where No. 8's "Quul arrives off-screen" is answered), the biters, Quul's world. The picture is warmer:
  a gold haze, the bodies brighter as the music drives.

## Nobody Drew It (nobody/), No. 8

The owner, after Grown: "what are we leading toward… various organisms singing how-to videos in chorus".
The answer tried here: a piece people watch and listen to (a game is a later, bigger bet). One real
evolved history, replayed as it happened, sung by the world itself.

- `score.js`: the clock. 96 bpm in 4/4 (a bar 2.5 s), 57 bars, ~146 s. The chords are the world's own
  (grown/sound.js CHORDS: Dm, Bb, F, C, two bars each, from bar 1), so the choir and the song agree.
  Title (1–4), founders (5–8), verse 1 (9–16), time-lapse (17–20), the biters (21–24), verse 2 (25–32),
  time-lapse (33–36), Quul (37–40), verse 3 (41–48), coda (49–56), the last chord (57). The lyric is the
  world's rules ("A mouth grows a gut, a gut grows a fin; what eats will bud, what starves goes back in"),
  each line two bars, sung by lib/chipsing.js and lettered on screen as it is sung (the voice is ~20%
  word errors: the words are always shown). `lexicon.js` is GENERATED (`tools/nobody-lexicon.mjs`).
  `vocal()` is async (it replays the world): lib/band-worker.js, band-load.js and tools/render.mjs now
  await it. It returns the voice and the choir mixed into one track.
- `history.js` is GENERATED (`tools/nobody-history.mjs`, ~17 min): Grown's world, seed 1, founders ×3,
  mutation 0.3, predation and drift on, run to step 950,000 with snapshots at 0, 300,000 and 950,000
  (`World.snapshot()` / `World.restore()`: the medium as 16-bit fixed point; a restored world continues
  deterministically) and a census every 2000 steps (the 18 species that filled the most of it, and the
  rest). Quul already led at 300,000 (28 of 60) and had 46 of 60 at 950,000.
- `world.js`: `Replay` restores a chapter's snapshot at its first second and steps it 30 times a second
  (seeking back restores again; the selftest checks two routes to 100 s agree). The camera's target is
  smoothed per step, so it is the same at any frame rate; in Quul's chapter it follows one Quul.
  `choir(sampleRate)` hears the same replay through grown/sound.js's conductor; in the time-lapses the
  named species sing from the census, and each that first appears there enters with its chime. ~8 s for
  the whole film in node.
- `render.js`: the replayed world (grown/gl.js and grown/scene.js, shared with the sketchbook, drawn into
  an offscreen WebGL canvas and copied onto the frame), the time-lapses as a streamgraph of the history
  (every band a body plan, as wide as how many were alive; names at each band's widest point so far; a
  sweep and the step), the title, each chapter's name, the lyric, and the live census (names and organ
  trees in organ colours). Vertical, square and wide all frame: the camera backs off on a tall frame.
- **The reveal** (owner: "a big intro chord generated by the population… it only plays once… sample it and
  repeat it a couple times, fading out"). It was an accident at first: at each chapter's first second the
  conductor met a restored world full of species it had never heard, and they all entered at once. Now
  it is deliberate (grown/film.js `choir()`): a fresh conductor per chapter (no stray burst), and the
  reveal's entries (a 'new' per plan, up to 24 buds) rendered on their own engine (`startAt`, no bass)
  for two bars and laid in three times, at gains 1, 0.55, 0.3. Measured in No. 9: −10 dB at the reveal,
  −14 and −17 at the echoes, then the world's usual −19.
- **Focus** (owner: "the closeup is out of focus"). grown/gl.js's points grew as 1/distance with no
  limit, so a close-up was a few huge soft discs. They stop at `uMax` (h/200 px) now, and give back the
  light they would have spread as brightness (√ of the size lost, at most 3×). The sketchbook shares it.
- Not verified here: the audio in a browser end to end (the band worker path ran in node only), and
  the video export on a real device (this sandbox's Chromium has no H.264 encoder).

## Grown (grown/), and packages/attractor/lib/organism.js

A sketchbook (owner, 2026-09-27: "the interesting thing would be to grow novel body plans… you'd need
bodily functions that get grown"). Accretion's creatures all share one plan (a flow and its house);
here the PLAN is what varies. Stage 1 (this): the organs and the developmental program, proven with
three hand-written bodies. Stage 2 (next): mutation on, run headless for hours, keep a bestiary of
lineages. No fitness function, ever: what feeds buds, what doesn't starves.

- **Organs** (`ORGANS`, each an attractor from the bestiary chosen per genome, with a build cost and an
  upkeep): mouth (grazes its medium cell and the six round it), gut (capacity), fin (swings about its
  root; the power stroke bites 4× the recovery, so a beating fin thrusts; off-centre fins turn the body),
  sense (the medium's gradient over 3–9 units; steers by beating the far side's fins harder), shell
  (crystal armour from spare energy: mass and drag), bud (a child with half the energy when the gut is
  full and the plan is complete). A full body idles its fins (`beat.rest`, a gene): without that the
  swimmer beat itself to death.
- **The genome is a program**: a root organ and rules `{ p, c, az, el, len, size, mirror, phase }`, and
  a beat `{ amp, period, steer, rest }`. `develop()` runs the rules breadth-first (depth ≤ 4, ≤ 18 organs,
  no organ in another's place) into a PLAN; the body grows along it only when it can pay the next
  organ's build cost and keep a margin. So a body starts as one mouth and grows as it eats. `mutate()`
  (stage 2) nudges a rule, copies, drops or retypes one, or retunes the beat.
- **Physics**: rigid body (organs where development put them) plus swinging fins; linear drag; yaw from
  fin torque; pitch eased toward the sense's vertical gradient. The world (`WX×WY×WZ` 160×64×160) has a
  medium in seeded veins that diffuses and regrows slowly (`regrow`), and `hard` scales upkeep: at 1
  nothing ever died and grazers filled the cap; at 3 there is competition (in the mixed world the
  swimmers die out first and the reef-builders slowly gain on the grazers). A dead body's organs go
  back into the medium; its armour stays as reef, which erodes back very slowly.
- **The three hand-written bodies** (selftest, alone from the richest place in three worlds, 3000 steps:
  all grow their whole plan and live): grazer (mouth, sense, gut, two fins, bud: cruises), reef
  (big mouth, gut, four shells, bud: never moves, grows ~55 armour crystals), swimmer (small mouth, long
  sense, gut, four fins, bud: twice the grazer's top speed). The first swimmer had a fin→fin rule that
  recursed into 12 fins it could not feed: exactly what evolution should prune.
- **Evolution** (owner: "turn on mutation"). `World({ mutate })`: each child has that chance (the page
  and the tool use 0.3) of `mutate(genome)`: one change (sometimes two): a rule's numbers nudged, a rule
  copied (a new organ, often a new branch), dropped, retyped, mirrored or unmirrored, the beat retuned,
  or one organ's attractor swapped (its look; looks are inherited, `genome.flows`). A child whose ORGAN
  TREE differs is a new species: `signature()` is the tree, canonically (m mouth, g gut, f fin, s sense,
  h shell, b bud; brackets hold what grows from an organ), and `speciesName(sig)` names it. Every body
  dies of age (`lifespan` 5000 ± 25%): without that a mutant that lost its bud lived forever on a vein,
  and a full world (cap 60) had no births. `census()` counts the living by plan and keeps `book`.
- **The headless run** (`node packages/attractor/tools/evolve.mjs [steps] [seed] --write`, 1M steps ≈ 7
  min): founders put back if all die (counted), a census every 2000 steps, the top 16 evolved plans
  (founders left out) with their programs to `lib/evolved.js` (GENERATED), which the page's "evolved"
  founders button seeds from. What happened in the first runs: the reef-builders and swimmers died
  out early (armour has no use yet: nothing attacks; fins are dear); a finless grazer (m(g(b)s)) and
  then the cheapest replicator possible, a mouth and a bud (m(b)), rose, as feared, but did not sweep:
  grazers with one fin, two buds, doubled gut branches and a fin growing from a bud coexisted with it.
  **The 1M-step run behind lib/evolved.js** (seed 1, 441 s): 306 plans, ~3600 mutants, no reseeds. The
  gut was lost (every late plan is gutless; the grazer went extinct at 404k after leading for 400k). Then
  SEGMENTATION evolved: a bud that grows a fin and a new mouth, which grows another bud… (Noqusa,
  m(b(fm(b(fm)))), the most common plan at the end; Tekaor m(b(m(b(m)))); Dawy branching). A body plan
  of repeated units, which no rule wrote: the `develop()` recursion (depth 4) made it possible, selection
  found it. The top of the book by lives: Minoul m(b(f)) (a bud with a fin), the grazer, Ulzo m(b).
  Next pressures (done below): predation, drifting veins, more seeds.
- **Predation, hunting, drifting veins** (owner: "all of those"). A mouth that touches another species'
  organ bites it: 0.06×size energy out, divided by the prey's guard (1 + 0.08 × armour crystals + 0.6 ×
  shell size), 70% to the biter; a body bitten in the last 30 steps that runs out of energy died
  'eaten'. Kin (the same species) are never bitten. The `hunt` gene (beat.hunt, −1…1, founders 0,
  mutated additively) turns a sense toward (+) or away from (−) the nearest other species. Veins wander
  slow loops round their homes (a turn in ~40000 steps; `lay(s)` every 100 steps rebuilds the baseline
  the medium seeps to). Predation makes a step ~0.7 ms (1M steps ≈ 7–17 min).
- **Four 1M-step runs with all three pressures** (seeds 1–4, merged into lib/evolved.js; `evolve.mjs
  --json` per run, `--merge` to combine). Each world found its own answer; no plan won everywhere:
  seed 1, Quul m(g(bf)m(m(m(m)))), a gut body trailing a chain of four mouths, a hunter (+0.29), 50 of
  60 at the end; seed 2, Ithithpo m(g(bf)), minimal; seed 3 collapsed to two tiny plans (m(bf), m(b));
  seed 4, a clade built on a new motif, a sense that grows a fin that grows a bud (Milo m(s(f(b))),
  Wyzone, Vibrazo, Aeith, Kawyith), mostly with fleeing instincts. Shells came back once armour had a
  use (Lofeno m(g(bf)h) led seed 4 for a while) but did not win. Chained segments recurred as a motif
  (mouth chains in seed 1, bud-mouth repeats in seeds 1–3) but only dominated the no-predation run.
  Eaten was ~10% of deaths, old age ~85%. Next, if wanted: a bigger world or cap (diversity is capped
  by 60 bodies), bites that need a bigger mouth than the prey organ, a second resource.
- **The sound** (`grown/sound.js`, pure-JS DSP; the page runs it in an AudioWorklet, `sound-worklet.js`,
  or a ScriptProcessor where there is none; "listen" starts it, from a tap). The population is the
  score. The engine keeps its own time (96 bpm, a chord every 2 bars: Dm, Bb, F, C, each with its 9th);
  the conductor (`makeConductor`, called after every world step and ~5× a second) tells it who is alive
  and what happened. Each of the six commonest species sings a sustained vowel (a softened saw through
  three formant band-passes and a little breath): its chord tone and vowel from its signature, an
  octave by its organ count, as loud as √count. Fins: sixteenth ticks, as dense as the world is
  swimming. A bud plucks its species' tone; a new plan, a three-note rise; bites snap (at most two a
  sixteenth); a kill thuds; the bass is the chord's root, as warm as the water is rich. Freeverb-shaped
  reverb with the bass kept out of its send: an earlier four-delay network rang at some pitches and the
  level jumped 9 dB a chord; the formants were Q 9–14 at first and a lone voice's level swung 6 dB with
  its pitch (Q 3.5/5/7 now). Selftest: a full choir ~10 dB over one voice and steady (±1.6 dB) across
  the progression; 10 s of an evolved world heard through the conductor. 30 s of a world renders in
  ~2.5 s in node, simulation included.
- **The page**: organs as their attractors in their colours, bonds as threads, armour and reef as
  crystals, the medium as dim motes; follow one body to read its organs, energy, age and children.
  30 steps a second at 1×. ~0.4 ms a step for ~60 bodies in node. Real-device frame rate unverified.

## The Bommie (bommie/)

A sitcom on a coral head, and the studio's answer to P(doom): **nobody in it is human**, so
nobody can be judged against a person. The residents are toys under water: sculpted smooth
shapes, glossy button eyes, soft light, blue with distance. Episode 1, "The Shell Game"
(104 s): Gus the hermit crab has outgrown his whelk and tries a tin can (it rolls) and a conch
(it won't lift), Barry the parrotfish drops a sandstorm on him, and Pip the anemone tells him
a shell is a shell. The show is meant to last: a durable cast and set to come back to for
sound design and art direction.

- `script.js` is the clock and the bible: the cast (each with a voice: pitch, rate, timbre),
  the set, and the episode as data: lines, laughs, foley, paths, looks, Gus's shell, shots
  (a multi-camera sitcom: hard cuts, each shot drifting a little), the light through the day.
  `sayings()` turns each line into syllables; the voices AND the mouths are timed from them.
- `world.js`: everything as a pure function of t. Gus's four walking legs are planted where
  the body was when each step began (footfalls tied to arc length, not time), so a planted foot
  cannot slide. `bommieSDF` is the coral head, line for line with the shader, so node can check
  that no fish swims into the building (the shader's doorways are left out of it: conservative).
- `sound.js`: pure-JS synthesis, the studio's way (node measures it). The reef's bed is its
  real one, snapping shrimp: a Poisson stream of bright clicks. **They are the laugh track**:
  at each LAUGH the click rate and loudness swell and fuse into a fizz. Voices are gibberish:
  each creature a source (gravel: a clicky rasp; chirp; bubble: a gurgling blub; breath:
  formant-shaped noise; mumble) through two vowel formants scaled to its size. Foley: crunch,
  pop, clonk (tin partials), roll, scrape, thud, poof, shake, bubbles (Minnaert chirps). A
  marimba and Karplus-Strong bass theme over the titles and credits. A little reverb, a
  low-pass for water. Renders 104 s in ~2 s at 32 kHz, in a worker as the page loads.
- `render.js`: one WebGL2 raymarch of set and cast, one context. Wrapped diffuse, soft
  shadows, AO, caustics on upward faces, a water-coloured rim, absorption (red first) and
  fog, light shafts, marine snow, plankton sparks at night. The cast is posed on **twos**
  (12 poses a second, as stop-motion is shot) while the water runs smooth; `?smooth` turns
  that off. Resolution follows the frame time (0.3–1× CSS pixels): under water, soft is fine.
- `main.js`: the soundtrack is the clock (an AudioBufferSource; seeking restarts it at an
  offset); subtitles, titles, credits and a seek bar are HTML over the canvas; sand and
  bubbles are drawn in 2D from world.js's closed-form particles. Space pauses, arrows skip.
  `?t=42&still` is one frame without sound.
- Levels (selftest, 16 kHz): the reef at rest ~−37 dB, dialogue ~−20, a big laugh ~−20.

Ideas parked for later episodes: residents peeking from the doorways; Barry's sand as a
running gag (the reef's beaches are parrotfish); the Europan ice spiders as a spinoff in the
same engine (the upside-down world, the tides on a 3.55-day cycle).

## Upping My P(doom) (pdoom/)

**Status: a closed experiment (2026-09-25).** It stays up as it is. Nothing more is planned
for it, and packages/figure's anime look is parked with it. What it established:

- **Technically, it holds.** Five bodies, 86 bars, every frame checked: feet planted, limbs
  clear of each other, skin inside the clothes, 8/8 checks through the whole song for all five.
  The choreography compiler (moves on the beat, fitted per body), the springs (overlap,
  anticipation, breath), the live faces (blinks, eye darts, singing from the vocal band) and a
  YouTube-clocked page all work, on desktop and (after the fixes below) on a phone.
- **Artistically, it doesn't, and polish didn't move it.** Five passes (motion, faces, shape,
  light and line, stylisation) each measurably improved something, and the figures still sat in
  the valley. Anime-styled people are judged against hand-drawn anime, where an artist cheats
  every frame (a redrawn face, a moved shoulder); a procedural rig can't cheat per frame, so it
  loses the comparison. The owner's read of the last pass: "blurry more than style". The PC-98
  dither and the surface-pinned brush strokes read as degradation, not a look.
- **The lesson for the next piece: pick a subject with no reference to miss.** Invented,
  inhuman creatures are judged as themselves. Toys, clay, creatures. That's the stop-motion
  thesis: meet the renderer where it's strong (solid forms, consistent light), and let the
  idiom (holds, twos, a handmade roughness) absorb what it can't do.
- **Carried forward**: the checks (contacts matter more to invented creatures, not less), the
  choreography compiler's shape (moves on beats, compiled per body, checked every frame),
  surface coordinates pinned to primitives (texture that sticks to a moving body), one WebGL
  context per page, and a canvas that sizes from its own box.


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
- `voice.json`: the mouth through the song. How open and how round, at 30 fps, derived from the vocal band of deckard's original, only inside the sung spans (from its subtitles). Numbers, not audio. Mino sings throughout, the crew on the choruses. `?shot=face` holds a close-up for looking.
- The page plays each dance through `liveDance` (springs, breath, per-dancer seed = cast index), and the build checks the same thing.
- `stage.js` draws the stage in 2D, in world units, with the dancers' own orthographic
  camera.
- Each dancer is raymarched into a canvas cropped to where it stands on screen. The
  canvases snap to a 64 px grid and keep their size (resizing a WebGL canvas every frame
  cost seconds a frame).
- The dancers' resolution follows the time BETWEEN frames, because the GPU's work lands
  after `frame()` returns.
- **One WebGL context for all five dancers** (`gl` in main.js), drawn into once per dancer and
  copied out, rebuilt if it is lost. Each dancer had its own before; with the PC-98 pass that
  was six, a phone dropped them (rotation, memory, a trip to another tab), and a dropped one
  never drew again: the dancers vanished while the stage played on. The frame loop also
  survives a bad frame. The canvas sizes itself from its own box (ResizeObserver), not the
  window's.
- **On a phone the player never covers the stage**: upright it is a band under the stage,
  on its side a column beside it (YouTube wants the player at least 200 × 200).
- **Looks** (the look button, `?look=`): anime, brush (strokes painted on the body: the figure
  rig's `brush` style), and PC-98.
- The **PC-98 look** (`pc98.js`, `?look=pc98`): a WebGL post-pass over the
  finished frame, onto `#post` laid over the stage: 400 lines, 16 colours at 4 bits a channel,
  a 4×4 Bayer dither. Eight colours are pinned (ink, skin light and shade, each dancer's hair),
  because a fit by area gives the dark stage nearly all of them; the other eight are fitted to
  each frame (weighted k-means on a 96×54 thumbnail, bright and coloured pixels counting more),
  starting from the last frame's so the palette doesn't flicker.

## Export video, and View the score

Both live under a piece's Begin button (`lib/extras.js`), for every piece.

**Export video** (`lib/export.js`). A piece is a pure function of `t` and its music
is a fixed performance, so the video is RENDERED, not recorded. Each piece has a
`render.js` exporting `makeRenderer(W, H, dpr)` → `{ draw(ctx, t) }`. The page and the
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
