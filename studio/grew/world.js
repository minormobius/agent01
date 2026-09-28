// world.js — the history "And Still It Grew" shows and sings (grown/film.js does the work): four chapters
// replayed from history.js's snapshots (the founders; steps 150,000, 300,000 and 950,000), the
// time-lapses between them, and the choir, here with the score's own harmony, a beat and bells.
import { makeFilm, SPS } from '../grown/film.js';
import { HISTORY, SNAPSHOTS } from './history.js';
import { sec, B, duration, harmony, drive, BPM } from './score.js';

export { SPS };
export const film = makeFilm({
  HISTORY, SNAPSHOTS, duration, engine: { bpm: BPM, harmony, drive, voices: 8 },
  chapters: [
    { name: 'the founders', snap: 0, from: sec(B(1)), to: sec(B(21)), still: sec(B(5)), cap: 30 },
    { name: 'step 150,000', snap: 1, from: sec(B(25)), to: sec(B(41)), cap: 50 },
    { name: 'the biters', snap: 2, from: sec(B(45)), to: sec(B(57)), cap: 50 },
    { name: 'Quul', snap: 3, from: sec(B(61)), to: duration + 1, follow: 'Quul' },
  ],
  lapses: [
    { from: sec(B(21)), to: sec(B(25)), s0: HISTORY.snaps[0], s1: HISTORY.snaps[1] },
    { from: sec(B(41)), to: sec(B(45)), s0: HISTORY.snaps[1], s1: HISTORY.snaps[2] },
    { from: sec(B(57)), to: sec(B(61)), s0: HISTORY.snaps[2], s1: HISTORY.snaps[3] },
  ],
});
export const { CHAPTERS, LAPSES, chapterAt, lapseAt, censusAt, Replay, choir } = film;
/** The commonest species in a snapshot (for the chapter's name). */
export function commonest(k) {
  const by = {}; for (const b of SNAPSHOTS[k].bodies) { const nm = SNAPSHOTS[k].genomes[b.g].name; by[nm] = (by[nm] || 0) + 1; }
  return Object.entries(by).sort((a, b) => b[1] - a[1])[0][0];
}
