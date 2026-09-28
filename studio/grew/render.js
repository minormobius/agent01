// render.js — "And Still It Grew", drawn (grown/film-render.js does the work): the world replayed, warmer
// than No. 8 (a gold haze of mineral, the bodies brighter as the music opens up), the time-lapses as a
// streamgraph, the title, each chapter's name, the lyric, and who is alive.
import { makeFilmRenderer } from '../grown/film-render.js';
import { film, CHAPTERS, commonest } from './world.js';
import { lyric, cues, title, drive } from './score.js';

export const makeRenderer = makeFilmRenderer({
  film, lyric, cues, title, subtitle: 'the same world, in a major key, told by the ones who grew',
  captions: [
    { at: CHAPTERS[0].still, text: 'i.  the founders', sub: 'nine bodies, written by hand' },
    { at: CHAPTERS[1].from, text: `ii.  the world of ${commonest(1)}`, sub: 'step 150,000' },
    { at: CHAPTERS[2].from, text: 'iii.  the biters', sub: 'step 300,000' },
    { at: CHAPTERS[3].from, text: 'iv.  Quul', sub: 'step 950,000' },
  ],
  look: { haze: [0.62, 0.48, 0.2], glow: (t) => 1 + 0.35 * drive(t), accent: '255,196,110', lyricColour: '255,242,214' },
});
