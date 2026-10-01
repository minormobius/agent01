// guitar.js — reading a score as a guitarist does: which string and fret plays each note, and how.
//
// LilyPond writes guitar music as ordinary notes plus a few marks: a string number (`c4\3`),
// `\harmonic`, `\glissando`, a slur (which on one string is a hammer-on or a pull-off),
// `\deadNote` / `\palmMute`. And it draws tablature from the same notes with `\new TabStaff`.
// This pass turns that into what a guitar needs, written onto each pitch:
//
//   p.string   1 (high E) … 6 (low E), standard tuning
//   p.fret     the fret it is stopped at (for a harmonic, the fret the finger touches)
//   p.art      'hammer' | 'pull' | 'slide' | 'harmonic' | 'muted' (absent: plucked)
//   p.artParam a harmonic's touched fret
//   p.slideTo  the fret a glissando slides to
//
// The tab staff and the guitar's playback read the SAME answer, so what you see on the tab is
// what is played. When the score names no string, the note goes where LilyPond's own TabStaff
// puts it: the lowest fret any free string can reach (open strings first). That is the open-
// position voicing every chord book draws: a G chord written as notes comes out 320033.

import { midiOf } from './model.js';

/** Open strings, string 1 first (standard tuning, as the tab staff and pfsynth's guitar assume). */
export const OPEN = [64, 59, 55, 50, 45, 40];
const MAX_FRET = 19;
const GUITAR_CLEFS = new Set(['treble_8', 'G_8', 'tenorG']);

/** Is this staff a guitar's? A TabStaff, a staff named for one, or one already using string numbers. */
export function isGuitarStaff(st) {
  if (st.tab) return true;
  if (/guitar|gtr/i.test(`${st.name} ${st.midi} ${st.label}`)) return true;
  return st.voices.some((v) => v.some((e) => (e.kind === 'note' && e.pitches.some((p) => p.string)) || (e.kind === 'clef' && GUITAR_CLEFS.has(e.value) && /guitar|gtr/i.test(`${st.name} ${st.midi}`))));
}

/** True when any staff of the score is a guitar's: the page then plays it on the guitar model. */
export const hasGuitar = (score) => score.staves.some(isGuitarStaff);

/**
 * Assign strings and frets to one moment's notes (all voices at one tick), in place. Notes
 * with a string number keep it; the rest take, highest first, the free string with the lowest
 * fret. A note no free string can reach gets no fret (the guitar model then places it itself).
 */
function assignMoment(heads) {
  const used = new Set();
  for (const h of heads) {
    if (!h.p.string) continue;
    h.p.fret = h.midi - OPEN[h.p.string - 1];
    used.add(h.p.string);
  }
  for (const h of [...heads].filter((x) => !x.p.string).sort((a, b) => b.midi - a.midi)) {
    let best = 0, bestFret = Infinity;
    for (let s = 1; s <= 6; s++) {
      const f = h.midi - OPEN[s - 1];
      if (used.has(s) || f < 0 || f > MAX_FRET) continue;
      if (f < bestFret) { best = s; bestFret = f; }
    }
    if (best) { h.p.string = best; h.p.fret = bestFret; used.add(best); h.p.autoString = true; }
  }
}

/**
 * Annotate every guitar staff of a parsed score: strings and frets per moment, then the
 * techniques along each voice. Mutates the score's pitch objects (the engraver and the
 * playback both read them from there). Returns the score.
 */
export function annotateGuitar(score) {
  for (const st of score.staves) {
    if (!isGuitarStaff(st)) continue;
    st.guitar = true;
    // strings and frets, one moment at a time, across the staff's voices
    const byTick = new Map();
    for (const v of st.voices) for (const e of v) {
      if (e.kind !== 'note') continue;
      if (!byTick.has(e.tick)) byTick.set(e.tick, []);
      for (const p of e.pitches) byTick.get(e.tick).push({ p, midi: midiOf(p) });
    }
    for (const heads of byTick.values()) assignMoment(heads);
    // techniques, along each voice in order
    for (const v of st.voices) {
      let prev = null, slurOpen = false;
      for (const e of v) {
        if (e.kind !== 'note') continue;
        const single = e.pitches.length === 1 ? e.pitches[0] : null;
        for (const p of e.pitches) {
          if (p.harmonic) { p.art = 'harmonic'; p.artParam = p.fret; }
          else if (e.muted) p.art = 'muted';
        }
        const last = prev && prev.pitches.length === 1 ? prev.pitches[0] : null;
        // A slur or a slide is played on ONE string. Where the note was placed by the
        // lowest-fret rule (not by a string number) and the previous note's string can
        // reach it, it moves there: `a8( b)` is a hammer-on on the G string, 2 to 4,
        // not a G-string A and an open B.
        if (single && last && single.autoString && last.string && (slurOpen || prev.gliss)) {
          const f = midiOf(single) - OPEN[last.string - 1];
          if (f >= 0 && f <= MAX_FRET && Math.abs(f - last.fret) <= 7) { single.string = last.string; single.fret = f; }
        }
        if (single && last && single.string && single.string === last.string && !single.art) {
          // a slur on one string is the left hand: up a hammer-on, down a pull-off
          if (slurOpen && single.fret !== last.fret) single.art = single.fret > last.fret ? 'hammer' : 'pull';
          // a glissando slides the finger along the string into this note
          if (prev.gliss) { last.slideTo = single.fret; single.art = 'slide'; }
        }
        if (e.slur === 'start') slurOpen = true;
        else if (e.slur === 'stop' || e.slur === 'both') slurOpen = e.slur === 'both';
        prev = e;
      }
    }
  }
  return score;
}
