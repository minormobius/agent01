import { Lexicons } from '@atproto/lexicon';
import { readFileSync, readdirSync } from 'node:fs';
const [dir, ...files] = process.argv.slice(2);
const lex = new Lexicons();
for (const f of readdirSync(dir)) if (f.endsWith('.json')) lex.add(JSON.parse(readFileSync(dir + '/' + f)));
for (const f of files) {
  const r = JSON.parse(readFileSync(f));
  try { lex.assertValidRecord(r.$type, r); console.log('valid  ', f); } catch (e) { console.log('INVALID', f, e.message); }
}
