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
