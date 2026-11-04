# which-song — handoff

## What this is

The requester asked for a page that is "a song in the style of Lawyers, Guns
and Money about a software engineer who takes excessive risks during the
singularity." Shipped: a single-file page with **wholly original lyrics** (39
lines: three verses, a bridge, three chorus repeats) about an engineer who
skips review, disables safety layers, and gets outrun by what he shipped —
narrated in the same swaggering, deadpan, "I did something reckless, now I
need a lawyer" arc as the reference song, with a matching three-item chorus
shape ("lawyers, root access, and cash" standing in for "lawyers, guns and
money"). The backing music is a Web Audio synth: a 12-bar-blues boogie-rock
shuffle (sawtooth riff through a wave-shaper for grit, triangle bass, noise-burst
drums), not a recording or a cover. The lyric sheet auto-scrolls and highlights
the current line karaoke-style as the song plays, synced to the AudioContext
clock. Play/pause/restart all work; pausing suspends the context so the beat
and lyric sync stay sample-accurate on resume.

## Decisions

- **Original lyrics, not a parody/cover of the actual song.** The brief asks
  for a song "in the style of," and reproducing Zevon's actual lyrics (even
  loosely) would be a copyright problem this factory doesn't need. What's
  reused is the *shape* — a three-item chorus list, the reckless-then-desperate
  narrative arc, outlaw-country tone — never the words themselves.
- **Page title is "Lawyers, Root Access, and Cash," not the real song's
  title.** Same reasoning as the trademark rule in CLAUDE.md for game names:
  give the homage its own name rather than putting someone else's exact title
  in the `<title>`/heading/share card. The `og:description` names what it's
  styled after in plain prose instead, which is the honest way to say it.
  If a follow-up wants the literal title used, that's a one-line change but
  worth flagging rather than silently doing it.
- **Full lyric sheet + karaoke highlight, not a single big word/line like
  `generate-some`'s emoji stage.** This requester's profile likes reading
  along with generated songs (see `generate-some`); a scrolling sheet lets you
  see the whole arc, not just the current instant.
- **No Bluesky lookup, no handle box.** Pure narrative page — profile notes
  this requester is comfortable with concept-only pages that skip the AppView
  entirely, and a song has no natural subject to look up.
- Built the audio graph fresh each `play()` and torn it down on `restart()`
  (same pattern as `generate-some`) rather than trying to reuse/reschedule an
  existing `AudioContext` — simpler and every existing lab song page does it
  this way.

## The plan (not built yet)

1. **No mute/volume control.** If someone asks, add a gain slider on `master`
   — trivial, just not asked for yet.
2. **No way to jump to a specific line/verse.** Clicking a line in the sheet
   to seek there would need `startTime` recomputed from the clicked line's
   index (`startTime = ctx.currentTime - idx * LINE_SECONDS`) and the already-
   scheduled notes before that point either muted or just left to play
   silently in the past (Web Audio ignores `start()` calls with a past time
   that already elapsed, so this is mostly safe, but do check before shipping
   it).
3. **The riff is a single unchanging 8-note pattern for the whole song.** A
   second, more aggressive riff pattern for the bridge/final-chorus section
   would give the song more of an arc; not done because of the turn budget,
   not because it's hard.
4. Nobody has heard this yet — the harness screenshot only proves the page
   renders, not that the timing/mix sounds right. First real feedback should
   drive the next pass more than anything in this file.

## Gotchas

- `ctx.currentTime` freezes while an `AudioContext` is suspended (spec
  behavior, not an assumption) — that's what makes `pause()`/`play()` resume
  with `startTime` untouched and the lyric sync still correct. Don't
  "helpfully" adjust `startTime` on resume; it's already right.
- Everything is scheduled **up front** in one `scheduleSong()` call at
  `play()` time (like `generate-some` does), not scheduled incrementally.
  Simpler, and fine for a ~2-minute song; would need chunked scheduling if a
  future song here got long enough to matter for memory/lookahead.
- Distortion is a `WaveShaper` with a hand-rolled curve (`makeDistortionCurve`)
  — there's no vendored guitar-amp effect in the kit, so this is the whole
  "grit" budget. It reads as a garage-y power chord, not a real amp; good
  enough for the joke, not high-fidelity.
