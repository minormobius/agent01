# lab — scoring a composition for variety and harmony

Node-only measurement scaffolding for `morph/`. It exists because "there is not
much texture in the continuous morphing" is a *measurable* claim, and measuring
it turned out to be far more useful than arguing about it.

```bash
node clock/morph/lab/score.mjs            # every preset and every showcase piece
node clock/morph/lab/score.mjs medusa     # just one
node clock/morph/lab/score.mjs --sweep    # waves × threshold × starvation, per subject
node clock/morph/lab/lab.selftest.mjs     # known-answer checks on the scorer itself
```

## Why a score is possible at all

Pluck pitch is

```
step = round(clamp(depth / maxDepth, 0, 1) * 14)
```

— a pure function of a gate's depth from the inputs. Two things follow, and they
are arithmetic rather than opinion:

1. **A finished structure can be reordered but never retuned.** Once growth
   stops, every gate's depth is fixed, so every gate plays the same note
   forever. The only thing that can vary is which gates fire, in what order.
2. **Therefore the only way to change the pitches at all is to change the
   structure** — and `maxDepth` is the divisor, so a structure whose depth moves
   is one where *every* note moves at once.

That is what `drift` measures, and it is the sharpest number here.

## What is scored

Both families are computed over the stream the sonifier would actually **play**,
not the stream the engine produces. The audio takes at most 6 notes from each
tick by a deterministic stratified sample, so a piece can be enormously busy and
still hand you the same six notes every time round — a failure mode invisible to
anything scoring the engine's own output, and the characteristic one for a dense
structure.

| | |
|---|---|
| `variety` | self-similarity of the heard notes at lags of 1, 8, 64 and 512 ticks, pitch entropy against the 15 reachable steps, and how many distinct note-sets appear. Repetition at short lags is rhythm; the same notes 512 ticks later is a loop |
| `harmony` | mean pairwise interval consonance over notes still *sounding* (a pluck rings for up to two seconds, so chords here are made of overlap, not of simultaneous onsets), polyphony against a target band, and how much of the register gets used |
| `drift` | σ of `maxDepth` over the run — literally "does it morph". The metric the original complaint names |
| `period` | exact cycle detection over per-tick note-sets |
| `churn` | births + deaths per tick |

Similarity is compared over a **16-tick window** rather than a single tick,
because a per-tick set punishes sparseness and calls it repetition — and raising
the threshold to stop a piece being a wall of sound is exactly the fix that
would have been penalised.

Period is detected on **raw per-tick** sets, never the windowed ones: a window
longer than the cycle contains the whole cycle at every offset, so every short
cycle reads as period 1.

## What these scores are not

`harmony` is a proxy — interval consonance, voice density, register spread. It
cannot tell you a piece is beautiful, and it should not be optimised against
blindly: `cathedral` scores its best at the settings it already had, and forcing
drift into it costs more variety than the drift is worth. What a score *can* do
is tell you a piece plays three notes and repeats every twelve ticks, and rank
sixty candidates so that taste gets spent on the shortlist instead of the sweep.

`period ∞` is also weaker evidence than it looks: the injection interval is
`depth / rate` and therefore usually fractional, so most of these are
quasi-periodic — coming round to almost the same place forever without ever
exactly repeating. Trust `drift`.

## What it found

Run on all 11 presets and the 6 showcase pieces:

* **Sixteen of seventeen had `drift` 0.00 and `churn` 0.00.** There was no
  morphing to have texture in. Not a tuning problem — a `--sweep` over 36
  settings each, 612 runs, produced **zero** aperiodic results for any of them.
* **`polyrhythm` and `anemone` scored variety 0.00, period 1 — they played
  exactly one pitch.** Depth was collapsed across each strongly connected
  component, so all twenty of the polyrhythm's rings sat at depth 1, `t = 1`,
  one note. The piece whose entire subject is four loops at four rates was a
  single tone, and flat-coloured on screen for the same reason. Fixed in
  `graph.rs` by giving each cell its phase *around* its own cycle; polyrhythm
  went to variety 0.75, aperiodic, and its depth from 1 to 19.
* **Every piece was pinned at the 24-voice pluck ceiling.** Six notes a tick,
  every tick, no rests — which is why they all sounded like one wash.
* Only two mechanisms break periodicity here: **incommensurate feedback loops**
  and **structural turnover**. Three pieces were retuned onto the second, and
  now show drift of 6 to 22 with polyphony down in the 2–18 range.

The scorer also found a bug in itself, which is the argument for
`lab.selftest.mjs`: with a cycle of period 6 planted in a synthetic transcript,
the detector reported 450 — every period longer than the comparison range was
holding *vacuously*. A measuring instrument nobody measures is a way of being
confidently wrong at scale.
