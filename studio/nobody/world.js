// world.js — the history "Nobody Drew It" shows and sings (grown/film.js does the work): three chapters
// replayed from history.js's snapshots, the time-lapses between them, and the choir that hears them.
import { makeFilm, SPS } from '../grown/film.js';
import { HISTORY, SNAPSHOTS } from './history.js';
import { sec, B, duration } from './score.js';

export { SPS };
export const film = makeFilm({
  HISTORY, SNAPSHOTS, duration, engine: { bpm: 96 },
  chapters: [
    { name: 'the founders', snap: 0, from: sec(B(1)), to: sec(B(17)), still: sec(B(5)), cap: 34 },
    { name: 'the biters', snap: 1, from: sec(B(21)), to: sec(B(33)) },
    { name: 'Quul', snap: 2, from: sec(B(37)), to: duration + 1, follow: 'Quul' },
  ],
  lapses: [
    { from: sec(B(17)), to: sec(B(21)), s0: HISTORY.snaps[0], s1: HISTORY.snaps[1] },
    { from: sec(B(33)), to: sec(B(37)), s0: HISTORY.snaps[1], s1: HISTORY.snaps[2] },
  ],
});
export const { CHAPTERS, LAPSES, chapterAt, lapseAt, censusAt, Replay, choir } = film;
