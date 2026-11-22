// voice.worker.js — renders the lecturer's lines off the main thread with studio's formant
// voice (vendor/chipvoice, a byte-identical copy of studio/lib/chipvoice.js). 16 kHz mono.
import { speak } from './vendor/chipvoice/chipvoice.js';
import { LEXICON } from './narration.js';

self.onmessage = (e) => {
  const { id, text } = e.data;
  try {
    const { audio, rate } = speak(text, LEXICON, { rate: 16000 });
    self.postMessage({ id, audio, rate }, [audio.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
