// The generator, in a Web Worker.
//
// A hard 15x15 takes a couple of seconds to generate and the search is a tight
// synchronous loop with nothing to yield to — on the main thread that is two
// seconds of a page that does not scroll, does not repaint and does not answer
// a tap, which reads as a crash rather than as work. So the whole generator
// runs here and the page gets messages.
//
// It also means the 738 KB answer list and its 1.3 MB bit index are built ONCE,
// off the main thread, and stay warm: the second puzzle costs only the search.
//
//   in   {type: 'generate', id, seed, size, difficulty}
//   out  {type: 'ready', lexiconId, answers}
//        {type: 'puzzle', id, puzzle, ms}
//        {type: 'error',  id, error}

import { Lexicon } from './lexicon.js';
import { puzzleFrom } from './puzzle.js';

let lexicon = null;
let loading = null;

async function ready() {
  if (lexicon) return lexicon;
  if (!loading) {
    loading = (async () => {
      const res = await fetch(new URL('../dict/answers.txt', import.meta.url));
      if (!res.ok) throw new Error(`answers.txt: ${res.status}`);
      lexicon = new Lexicon(await res.text());
      postMessage({ type: 'ready', lexiconId: lexicon.id, answers: lexicon.size });
      return lexicon;
    })();
  }
  return loading;
}

self.addEventListener('message', async (event) => {
  const msg = event.data || {};
  if (msg.type !== 'generate') return;
  try {
    const lex = await ready();
    const started = Date.now();
    const puzzle = puzzleFrom({ seed: msg.seed, size: msg.size, difficulty: msg.difficulty }, lex);
    if (!puzzle.ok) throw new Error(puzzle.reason);
    postMessage({ type: 'puzzle', id: msg.id, puzzle, ms: Date.now() - started });
  } catch (e) {
    postMessage({ type: 'error', id: msg.id, error: String(e?.message || e) });
  }
});

ready().catch((e) => postMessage({ type: 'error', id: null, error: String(e?.message || e) }));
