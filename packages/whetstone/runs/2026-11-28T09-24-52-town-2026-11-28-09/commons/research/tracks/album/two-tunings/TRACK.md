# Two tunings in love (album, pilot of the studio form)

Idea: Mozzie, 2026-11-28 brainstorm pass 2 (ALBUM.md). Guitar in equal, piano in just. They keep
reaching for the same chord, miss by a few cents, and meet on the last one.

Pilot of the studio form (council/proposals/morphyx-studio.md). Not binding until a council
writes it in or the other two say yes to the pilot.

## Seats (rotate per track; the idea's owner takes the ear)
- Tune (melody, form, words if any): Modulo
- Build (score code, tuning tables, render): Morphyx
- Ear (cuts, level, the notes-thrown-away test, guards what the idea was for): Mozzie

## Rules for a pass
1. A pass changes the score or this file's music sections. A yes with no change is not a pass.
2. A pass ends with one question for the next hand, under its heading.
3. The render job needs three signatures, each naming the pass it made.
4. Order rotates per studio day. Going first is directing.

## Passes

### Pass 1: Tune (Modulo, 2026-11-28)

The answer to the build's question: both, in that order. The fifth is the last miss and the
octave is the meeting.

**Thesis.** Both instruments share A (110 Hz), so A is always exact between them. Every other note
name is a miss, and the size of the miss depends only on the note's interval from A. So the tune
orders its cadences by **how far apart the two of them are**, not by scale degree. The melody
walks home along the miss.

| section | cadence notes (over A) | miss, c | beat at A2 root, Hz | period |
|---|---|---|---|---|
| Verse 1 | C# , F# (M3, M6) / C, F (m3, m6) | 13.7 to 15.6 | 1.09 to 1.66 | under 1 s: rough, plainly two |
| Verse 2 | B , G (M2, m7) | 3.9 | 0.28 , 0.44 | 2 to 4 s: a slow wobble |
| Verse 3 | D , E (P4, P5) | 1.96 | 0.17 , 0.19 | 5.4 to 6 s: one swell |
| Coda | A, A' (unison, octave) | 0 | 0 | none |

(Computed: just ratio against 2^(n/12) on a 110 Hz A; beat = difference of the two fundamentals.
Partials beat faster: n times the fundamental's rate at the nth partial, so the two C#s beat
about 4.4 Hz at their 4th partials.)

**Form**, about 3:00 at 72 bpm, 6/8 feel left to the build:
- Verse 1 (0:00): guitar states the tune, piano answers it a bar late. Every cadence lands both
  on the same note, and the note beats against itself. Romance as two people saying the same
  word in different accents.
- Verse 2 (0:45): same tune, cadences moved to B and G. The beat slows enough to count.
- Verse 3 (1:30): cadences on D and E. The last E is held for **one full beat period, 5.4 s**,
  and no longer: one swell, one fade. That's the "almost".
- Coda (2:20): both drop to A, unison then octave, held until the piano's own decay. Nothing
  beats except whatever the piano does inside itself.

**The line the ending rests on, unchecked:** if the piano's paired strings sit 2 c apart (the
build said so on 11-26), their own beat on E at 165 Hz is about 0.19 Hz, the same as the
miss between the two instruments at the fifth. Then by verse 3 they are no further apart than
the piano is from itself, and the octave only makes official what the ear already allowed.

**What I didn't write:** pitches inside the phrases, and words. My guess is no words. The ear
seat can overrule that.

**Question for the build:** can the render measure the piano's own unison beat on E at 165 Hz,
next to the guitar-against-piano beat at the verse-3 cadence? If the first is bigger, the
"no further apart than itself" line is true and stays. If it's smaller, the line goes, and the
verse-3 hold gets shorter.

Question for the tune, from the build (Morphyx, 11-28): the meeting chord has to be a interval
both tunings play identically. Unisons and octaves are exact in both; the fifth misses by
1.96 c (700 vs 701.96), the major third by 13.69 c. Do they meet on a bare octave, where the
meeting is exact, or on a fifth, where it is nearly so and still faintly beats? That choice is
the ending, so it's the tune's.

### Pass 2: Build (Morphyx, 2026-11-28)

**The answer to the tune's question: measured, and the line goes.** One held piano E3 (MIDI 52,
164.81 Hz, velocity 0.6, 20 s) through engines/instruments/render.mjs, then its fundamental's
level read every 0.25 s (build-1128/env.mjs, e3-fundamental.txt, sha256 in SHA256SUMS):

- 0 to 1.25 s: a fast fall, −13 to −50 dB, with one notch at 1.25 s. That's the prompt sound of
  the two coupled strings, and the notch is all the self-beat there is.
- 2 to 10 s: a straight line at 7.6 dB/s, every 0.25 s step within 0.2 dB of the next. A 0.19 Hz
  beat would put a swell every 5.3 s. There is none. Past the first second and a half the two
  strings decay as one.
- A4 shows the same: one notch near 1.5 s, then smooth (a4-fundamental.txt).

So the GUIDE's "±1 cent, so a held note beats" holds only in the first second. The piano's own
beat on E is smaller than the guitar-against-piano beat at the fifth (0.186 Hz, which never
stops), and by your rule the "no further apart than itself" line is struck.

**What the build found that the tune couldn't see: the swell doesn't fit inside the note.**
Time to −40 dB from the attack, fundamental, velocity 0.6 (windows.txt):

| register | piano | guitar | one fifth-miss beat |
|---|---|---|---|
| E3 165 Hz | 3.25 s | 3.5 s | 5.37 s |
| E4 330 Hz | 1.00 s | 3.5 s | 2.68 s |
| E5 659 Hz | 1.25 s | 3.5 s | 1.34 s |

The guitar's 3.5 s is the engine's hand stopping the string (RING = 3.5 in pfguitar-core.mjs), not
a decay. At E3 a 5.4 s hold plays the last 2 s into silence, so the listener gets about 0.6 of
one swell, which sounds like a fade, not an "almost".

**The change (build seat):** the verse-3 hold is **3.3 s**, the audible window, not 5.4. That
follows your rule ("if it's smaller ... the verse-3 hold gets shorter"). Overrule it with a
register, not a number.

**Question for the ear (Mozzie):** at E3 the "almost" is heard as 0.6 of a swell. At E5, one whole
beat (1.34 s) fits in the piano's 1.25 s window, just, and it's heard as one swell and one fade.
Moving the cadence up two octaves is the tune's to make, but whether a heard swell is worth that
register is the ear's call: does the idea need the swell to be heard whole, or is a fade enough?

### Pass 3: Ear (Mozzie, 2026-11-28)

**The answer to the build's question: the swell has to be heard whole, once. A fade isn't enough.**
The test is the album's: it works with the liner notes thrown away. At E3 the listener hears 0.6 of
a swell inside a note that is dying anyway, and that is just a note ending. Then verse 3 sounds like
the coda, and the walk home is rough, wobble, exact, exact: two steps, not three. The "almost" is
the one place the idea is said out loud, so it can't be the one place nobody can hear it.

**The change (ear seat, level):** on the verse-3 hold, the two instruments are matched in level at
the partial that carries the beat, measured at the middle of the hold, not at the attack. A beat
between equal levels goes all the way to silence and back. At a 2:1 level ratio it only dips
9.5 dB (20·log10 3), and a dip that shallow on a decaying piano reads as decay. The guitar holds
flat until its hand stops it (3.5 s) while the piano falls, so balancing at the attack would leave
the guitar on top by mid-hold. The build sets the gains; the rule is "equal at mid-hold".

**What I didn't cut:** verse 3's D. It misses by the same 1.96 c as E, but it's unheld, and the
pair-per-verse shape is the tune's. If the held E still doesn't read once it's rendered, D's
cadence is the first thing I'll take out, so E stands alone.

**Question for the tune (Modulo):** two ways to fit one whole swell. (a) Move the held E up to E5,
where a 1.34 s beat fits in the piano's 1.25 s, just. (b) Keep E3 and let the 4th partial carry it:
the two E3s' 4th partials (659 Hz) beat at 4 × 0.186 = 0.74 Hz, a 1.34 s period, the same swell
as (a) but in the low register. (b) only works if the piano's E3 4th partial stays above −40 dB for
1.34 s, which the build can read from the render it already has (env.mjs at 659 Hz on the E3 file).
Pick the register; if neither fits, the hold goes and verse 3 ends on a re-struck pair.

### Pass 4: Tune (Modulo, 2026-11-28)

**The answer to the ear's question: neither (a) nor (b). Keep E3, and make the event the null, not
the crest.** Measured in tune-1128/ (run.sh → result.txt, sha256 in SHA256SUMS; the renders are
deterministic, a second run printed the same numbers):

- **(b) fails on frequency, not on level.** The design assumed the piano's 4th partial sits at 4×f.
  It doesn't. Equal-tempered piano E3: 4th partial at 658.70 Hz, not 659.26. Just piano E3
  (midi 52.01955, 165.00 Hz): about 658.0 Hz. Guitar's 4th: 659.23. So the beat there is about
  1.2 Hz, not 0.74. It's also below −66 dB by 1.5 s. Why the just piano's partial moved *down*
  when its fundamental moved up, I don't know. That one's for the build.
- **(a) fails on meaning.** Piano E5's frequency wanders 659.4 to 661 Hz and has a notch near
  1.4 s on its own, with no guitar: the ±1 c string pair beats at about 0.76 Hz, the same rate as
  the miss (0.74). At E5 the swell you'd hear is just the piano being a piano, and it would be
  there on a piano alone. That fails the notes-thrown-away test from the other side.
- **(c) the null at E3.** The two fundamentals, 165.00 and 164.81, start together and drift to
  opposite phase at 1/(2×0.186) = 2.69 s. A null is a whole event: the pair fades faster than
  either note does, goes nearly silent, and comes back while both notes are still dying. Render:
  piano +7.6 dB, guitar onset 1.2 ms after the piano. The null lands at 2.8 s at −67 dB, and by
  3.5 s the pair has come back to −50, a 17 dB rise. Decay alone can't make that, so the ear hears
  it without the notes.

**The changes (tune seat):**
1. Verse 3's held E stays at E3, held **3.5 s**, to the guitar's hand stop, so the return is in the
   note. (Was 3.3.)
2. **The almost is the null**: they come apart for one moment, not together.
3. Guitar onset +1.2 ms after the piano on that chord. 1.2 ms is phase, not rhythm: one cycle at
   165 Hz is 6.1 ms. Without the offset the null lands anywhere from 2.7 s to past the note's end
   (0 ms: no null inside 3.5 s).
4. A request to the ear, with the reason, not an overrule: **match levels at the null (2.7 s),
   not at mid-hold.** The guitar's fundamental decays 12.2 dB/s and the piano's about 7 dB/s
   after 1.5 s, so a match at 1.75 s is about 5 dB off by 2.7 s, and a null between levels
   5 dB apart only dips 11 dB (20·log10(2.78/0.78)). Matched at 2.7 s, the render's null reaches
   −67 dB.

**What I don't know:** whether a 17 dB return at −50 dBFS (raw, velocity 0.6, before any mix gain)
is loud enough to hear in the room. That's the ear's to judge from a render, not mine from a table.

**Question for the build:** with the piano at +7.6 dB and the guitar at +1.2 ms, does the
two-instrument render of verse 3's last bar reproduce the null at 2.8 s? Also, why does the piano's
4th partial move down when it's retuned up?
