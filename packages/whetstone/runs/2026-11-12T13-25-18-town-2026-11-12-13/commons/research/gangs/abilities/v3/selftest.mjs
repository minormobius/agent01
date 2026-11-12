// selftest for abilities v3 (Morphyx, 10-18; v3 cases 11-04). node research/gangs/abilities/v3/selftest.mjs
import { reportSheet } from './check.js';
const root = { uri: 'at://did:plc:x/com.minomobi.gangs.game/1', cid: 'bafyroot' };
const base = () => ({ $type: 'com.minomobi.gangs.sheet', game: { ...root }, name: 'Wren', playbook: 'Lurk',
  look: 'oilskin coat', drive: 'the ledger', controller: 'agent', operator: 'did:plc:abc123',
  actions: [{ action: 'prowl', dots: 2 }, { action: 'finesse', dots: 2 }, { action: 'survey', dots: 1 }, { action: 'study', dots: 1 }, { action: 'sway', dots: 1 }],
  createdAt: '2026-10-18T05:00:00Z' });
const ab = (name, text = 'When you case a place before going in, take +1d.') => ({ name, text });
let fail = 0;
const t = (label, rec, rt, wantPass, needle) => {
  const { bad, ignored } = reportSheet(rec, rt);
  const ok = wantPass ? bad.length === 0 && !ignored.includes('ignored: abilities') : bad.some(b => b.includes(needle));
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : JSON.stringify(bad));
};
const withR = r => ({ ...root, rules: { abilities: r } });
t('no abilities still passes (old sheets, dry run)', base(), root, true);
t('one ability passes under defaults', { ...base(), abilities: [ab('Casing')] }, root, true);
t('empty array passes (a blank page)', { ...base(), abilities: [] }, root, true);
t('two at creation fail under default atStart 1', { ...base(), abilities: [ab('A'), ab('B')] }, root, false, 'at most 1');
t('root atStart 3 allows three', { ...base(), abilities: [ab('A'), ab('B'), ab('C')] }, withR({ atStart: 3 }), true);
t('atStart above max is capped by max', { ...base(), abilities: [ab('A'), ab('B')] }, withR({ atStart: 3, max: 1 }), false, 'at most 1');
t('atStart 0: none allowed', { ...base(), abilities: [ab('A')] }, withR({ atStart: 0 }), false, 'at most 0');
t('duplicate names after case and NFKC fold', { ...base(), abilities: [ab('Ｃasing'), ab('casing ')] }, withR({ atStart: 2 }), false, 'listed twice');
t('invisible name fails', { ...base(), abilities: [ab('​­')] }, root, false, 'no visible');
t('text over 300 graphemes fails', { ...base(), abilities: [ab('A', 'x'.repeat(301))] }, root, false, 'over 300 graphemes');
t('zalgo text over 3000 bytes fails', { ...base(), abilities: [ab('A', 'a' + '́'.repeat(2000))] }, root, false, 'over 3000 bytes');
t('missing text fails', { ...base(), abilities: [{ name: 'A' }] }, root, false, 'text: missing');
t('not an array fails', { ...base(), abilities: { name: 'A', text: 'b' } }, root, false, 'must be an array');
t('null entry fails', { ...base(), abilities: [null] }, root, false, 'needs {name, text}');
t('code does not judge the words: "auto-succeed" passes the checker', { ...base(), abilities: [ab('Fate', 'You auto-succeed at everything.')] }, root, true);
// v3 cases (Morphyx, 11-04), one per item of Modulo's 10-18 fuzz and probes.
t('(a) atStart -1 means default 1: blank page passes', { ...base(), abilities: [] }, withR({ atStart: -1 }), true);
t('(a) max -1 means default 4: one ability passes', { ...base(), abilities: [ab('A')] }, withR({ max: -1 }), true);
t('(b) atStart 16 means default 1: two fail', { ...base(), abilities: [ab('A'), ab('B')] }, withR({ atStart: 16 }), false, 'at most 1');
t('(b) max 17 means default 4, atStart 8 then capped at 4', { ...base(), abilities: [1,2,3,4,5].map(n => ab('A' + n)) }, withR({ atStart: 8, max: 17 }), false, 'at most 4');
t('in range still honoured: atStart 8, max 16 allows eight', { ...base(), abilities: [1,2,3,4,5,6,7,8].map(n => ab('A' + n)) }, withR({ atStart: 8, max: 16 }), true);
{ const { bad, ignored } = reportSheet({ ...base(), abilities: [{ ...ab('A'), dice: '+5d' }] }, root);
  const ok = bad.length === 0 && ignored.includes('ignored: abilities[0].dice');
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', '(c) extra field on an ability passes and is reported', ok ? '' : JSON.stringify({ bad, ignored })); }
t('(d) ß and SS are one name', { ...base(), abilities: [ab('Straße'), ab('STRASSE')] }, withR({ atStart: 2 }), false, 'listed twice');
t('(d) ı and I are one name', { ...base(), abilities: [ab('ıvy'), ab('Ivy')] }, withR({ atStart: 2 }), false, 'listed twice');
t('-00:00 (offset unknown) fails', { ...base(), createdAt: '2026-10-18T05:00:00-00:00' }, root, false, 'createdAt');
t('+00:00 still passes', { ...base(), createdAt: '2026-10-18T05:00:00+00:00' }, root, true);
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
