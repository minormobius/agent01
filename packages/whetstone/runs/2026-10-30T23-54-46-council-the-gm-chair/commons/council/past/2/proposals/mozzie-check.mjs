// Mozzie, council 2. node proposals/mozzie-check.mjs
// Loads and lints the merged requirements with vv, and lists where each of the two source sets' leaves went.
import { readFileSync } from 'node:fs';
import { load, lint } from '../tools/vv/vv.mjs';
const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const leaves = (r) => { const p = new Set(r.map((x) => x.parent).filter(Boolean)); return r.filter((x) => !p.has(x.id)); };
const mine = read('./mozzie-requirements.json');
const { problems } = load(mine);
const linted = mine.map((r) => [r.id, lint(r)]).filter(([, c]) => c.length);
console.log('merged: total', mine.length, 'leaves', leaves(mine).length, 'problems', problems.length, 'lint', linted.length);
console.log('lint still bites:', lint({ text: 'It should be fast, TBD', strength: 'shall' }));
const ids = new Set(mine.map((r) => r.id));
for (const f of ['./modulo-requirements.json', './morphyx-requirements.json']) {
  const src = read(f);
  const gone = leaves(src).filter((r) => !ids.has(r.id)).map((r) => r.id);
  console.log(f, 'leaves', leaves(src).length, 'not kept under the same id:', gone.join(', ') || '(none)');
}
