# BRIEF — generate-some

## What this is

The ask: generate music and lyrics, build a pool of 100 emoji, map every few
words of the lyrics to one emoji, and play it back as a "music video" that is
just the emoji (near full-screen) plus the lyric line as a subtitle. The
context that prompted it was someone else's post about hand-building a
PowerPoint "music video" and finding it eerie that a model would choose images
based on lyrics — that's flavor, not a spec, and nothing on the page quotes or
names anyone.

Shipped, in one turn, complete and working:

- Original lyrics (`LINES` in the script), ~49 short chunks of 3-4 words each,
  written for this page — not sourced from anywhere.
- `POOL`: exactly 100 emoji, hand-picked for a mix of expressive faces and
  night/fire/water/light imagery that suits the lyrics' theme (translation,
  static, symbols).
- `emojiFor()`: a small `KEYMAP` gives ~30 theme words (fire, night, ocean,
  symbol, voice…) a deliberate emoji from the pool; everything else hashes the
  chunk text into the same 100-item pool, deterministically — same words
  always render the same emoji, every play.
- Music: NOT a recording — there is no audio-generation model or file
  available in this sandbox — so it's a small generative ambient bed
  synthesized live with Web Audio oscillators: a 4-chord pad loop (Am-F-C-G),
  a sine bass note per bar, and a soft kick/hat pattern. Scheduled entirely up
  front against `AudioContext.currentTime` at play-time (not a lookahead
  scheduler loop), which is simpler and fine at this song length (~83s).
- Playback, subtitles and the big emoji are all driven off the same
  `ctx.currentTime` clock via `requestAnimationFrame`, so pause (tab hidden →
  `ctx.suspend()`) and resume keep everything in sync with no drift.
- No Bluesky lookup on this page at all — this requester (see
  `lab/_profiles/ezba.bsky.social.md`) is on record as comfortable with
  pure-concept pages, and there's no handle-shaped input this page needs.

## Decisions

- **Hardcoded lyric chunks, not runtime text-splitting.** Simpler to control
  chunk length ("a few words") precisely than to write a generic splitter and
  hope it lands on sensible boundaries. Trade-off: adding a verse means
  editing the `LINES` array by hand, not just pasting a paragraph.
- **Deterministic emoji mapping over random-per-play.** Wanted repeat visits
  (or reading the lyrics twice) to feel like a real mapping, not a slot
  machine. The hash fallback means every word not in `KEYMAP` still always
  renders the same emoji — it just isn't necessarily *meaningful*, which the
  "how this was made" disclosure is upfront about.
- **Schedule the whole song upfront, not a lookahead loop.** The standard
  Web Audio pattern (Chris Wilson's "tale of two clocks") exists for tracks
  that are open-ended or user-editable live. This song is fixed-length and
  short; scheduling every oscillator at `play()` time is far less code and
  there's no correctness gap at 83 seconds.
- **`ctx.suspend()`/`resume()` for pause, not a stop/rebuild.** Because both
  the audio schedule and the subtitle clock read off `ctx.currentTime`,
  suspending freezes both simultaneously for free. Restart tears the whole
  context down and reschedules rather than trying to seek.

## The plan (not built yet)

Nothing is broken or half-finished, but if there's a next turn:

1. **A second song/lyric set, chosen by the visitor**, e.g. a mood or key
   picker that swaps `LINES`/`CHORDS` for a different pre-written set — more
   "generate" than one fixed track. Would need 2-3 more hand-written lyric
   sets plus matching chord loops; the playback engine underneath doesn't
   change.
2. **Save a "favorite line → emoji" moment to the visitor's own repo** via
   `/_kit/pds.js` (`com.minomobi.lab.doc`, kind `generate-some-fave`) — low
   priority, this page works fully without any sign-in and probably should
   stay that way per the "sign-in is optional" rule.
3. If asked for genuinely *distinct* melodies rather than a fixed loop,
   look at seeding the chord/rhythm choice from a hash of a visitor-chosen
   word — keeps it deterministic and connects the "generate" framing to
   something the visitor typed, rather than `Math.random()` (unavailable in
   the workflow tool context anyway, and cheap-feeling if it were used here).

## Gotchas

- `#about button` inherited a 32px `min-height` from a first draft — under
  the 44px tap-target floor. Fixed before shipping; if this file's styles are
  ever touched again, check every button rule explicitly rather than trusting
  the kit's own button style covers it (it doesn't set a min-height at all).
- Web Audio autoplay: `AudioContext` is created inside the `play()` click
  handler (a real user gesture), and `ctx.resume()` is called defensively
  right after construction in case a browser still hands back a `suspended`
  context on first creation.
- No network calls anywhere on this page — don't add `kit.bskyGet` here
  without a reason; there's no handle-shaped input for it to attach to.
