// voice-lex.mjs — the whole CMU dictionary as a lexicon, for the tools that speak the corpus
// (voice/corpus.json's literature needs more than lexicon.json's 340 words). lexicon.json goes on
// top, so its hand pronunciations (lexicon-extra.json) win, as they do on the page.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const voiceDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'voice');
export function fullLexicon() {
  const lex = {};
  for (const line of readFileSync(join(voiceDir, 'cmudict.txt'), 'utf8').split('\n')) {
    if (line.startsWith(';;;')) continue;
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const w = line.slice(0, sp);
    if (!w.includes('(')) lex[w] = line.slice(sp + 1).trim();
  }
  return Object.assign(lex, JSON.parse(readFileSync(join(voiceDir, 'lexicon.json'), 'utf8')).words);
}
export const corpus = () => JSON.parse(readFileSync(join(voiceDir, 'corpus.json'), 'utf8'));
