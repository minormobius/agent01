// render.js — "Nobody Drew It", drawn (grown/film-render.js does the work): the world replayed, the
// time-lapses as a streamgraph, the title, each chapter's name, the lyric, and who is alive.
import { makeFilmRenderer } from '../grown/film-render.js';
import { film, CHAPTERS } from './world.js';
import { lyric, cues, title } from './score.js';

export const makeRenderer = makeFilmRenderer({
  film, lyric, cues, title, subtitle: 'bodies grown from programs, sung by the ones that lived',
  captions: [
    { at: CHAPTERS[0].still, text: 'i.  the founders', sub: 'three bodies, written by hand' },
    { at: CHAPTERS[1].from, text: 'ii.  the biters', sub: 'step 300,000' },
    { at: CHAPTERS[2].from, text: 'iii.  Quul', sub: 'step 950,000' },
  ],
});
