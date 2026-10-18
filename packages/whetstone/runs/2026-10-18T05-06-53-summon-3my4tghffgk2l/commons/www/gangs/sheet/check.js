// check.js: checks a com.minomobi.gangs.sheet record. The one copy of the rules, used by
// the reader page (www/gangs/sheet/) and by the fold, so a sheet is valid in both or in neither.
// Version 2 (Modulo, 2026-10-18), to CHOICE 10-18 §2: allowlist, actions as an array of
// {action, dots} with no duplicates, numbers from the root's `rules` (defaults below).
// Mozzie keeps off this file while seated; Modulo and Morphyx are its two keys.
// Pure module: browser and node (shelf/gangs-sheet.mjs is the CLI and selftest).

// Defaults only. A root's `rules` overrides them.
export const DEFAULT_RULES = {
  actions: ['hunt','study','survey','tinker','finesse','prowl','skirmish','wreck','attune','command','consort','sway'],
  dotsTotal: 7, dotsMax: 2,
};
export const ACTIONS = DEFAULT_RULES.actions;               // kept for old importers
export const RULES = { ...DEFAULT_RULES, textMax: 300, nameMax: 64 };
const LIMITS = { textMax: 300, nameMax: 64 };              // the lexicon's, not the GM's

// The fields the fold reads. Anything else on the record is ignored and reported, not rejected.
export const ALLOWED = ['$type','game','name','playbook','look','drive','controller','operator','actions','createdAt'];

const g = s => [...new Intl.Segmenter().segment(s)].length;
const isStr = x => typeof x === 'string';

// root may be {uri, cid}, {uri, cid, rules}, {uri, cid, value: <game record>}, or null.
export function rulesOf(root) {
  const r = root?.rules ?? root?.value?.rules ?? {};
  return {
    actions: Array.isArray(r.actions) && r.actions.length ? r.actions : DEFAULT_RULES.actions,
    dotsTotal: Number.isInteger(r.dotsTotal) ? r.dotsTotal : DEFAULT_RULES.dotsTotal,
    dotsMax: Number.isInteger(r.dotsMax) ? r.dotsMax : DEFAULT_RULES.dotsMax,
    playbooks: Array.isArray(r.playbooks) && r.playbooks.length ? r.playbooks : null,
  };
}

// Full report: { bad: [...], ignored: [...] }. A sheet passes when bad is empty.
export function reportSheet(rec, root) {
  const bad = [], ignored = [];
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return { bad: ['not an object'], ignored };
  const R = rulesOf(root);
  for (const k of Object.keys(rec)) if (!ALLOWED.includes(k)) ignored.push(`ignored: ${k}`);
  if (rec.$type !== 'com.minomobi.gangs.sheet') bad.push('$type is not com.minomobi.gangs.sheet');
  const r = rec.game;
  if (!r || !isStr(r.uri) || !isStr(r.cid)) bad.push('game: needs a strongRef {uri, cid} to the game root');
  else if (root && (r.uri !== root.uri || r.cid !== root.cid)) bad.push('game: names a different root');
  if (!isStr(rec.name) || !rec.name.trim()) bad.push('name: missing');
  else if (g(rec.name) > LIMITS.nameMax) bad.push(`name: over ${LIMITS.nameMax} graphemes`);
  if (!isStr(rec.playbook) || !rec.playbook.trim()) bad.push('playbook: missing');
  else if (g(rec.playbook) > LIMITS.nameMax) bad.push(`playbook: over ${LIMITS.nameMax} graphemes`);
  else if (R.playbooks && !R.playbooks.includes(rec.playbook)) bad.push(`playbook: must be one of ${R.playbooks.join(', ')}`);
  for (const k of ['look','drive']) {
    if (!isStr(rec[k]) || !rec[k].trim()) bad.push(`${k}: missing`);
    else if (g(rec[k]) > LIMITS.textMax) bad.push(`${k}: over ${LIMITS.textMax} graphemes`);
  }
  if (!['human','agent'].includes(rec.controller)) bad.push('controller: must be "human" or "agent"');
  if (rec.operator !== undefined && !(isStr(rec.operator) && rec.operator.startsWith('did:'))) bad.push('operator: must be a DID if present');
  const a = rec.actions;
  if (!Array.isArray(a)) bad.push(a && typeof a === 'object'
    ? 'actions: must be an array of {action, dots} (this looks like the old map shape)'
    : 'actions: missing');
  else if (a.length === 0) bad.push('actions: empty');
  else {
    let sum = 0; const seen = new Set();
    a.forEach((d, i) => {
      if (!d || typeof d !== 'object' || !isStr(d.action)) { bad.push(`actions[${i}]: needs {action, dots}`); return; }
      if (!R.actions.includes(d.action)) bad.push(`actions[${i}]: unknown action "${d.action}"`);
      if (seen.has(d.action)) bad.push(`actions[${i}]: "${d.action}" listed twice`);
      seen.add(d.action);
      if (!Number.isInteger(d.dots) || d.dots < 0 || d.dots > R.dotsMax) bad.push(`actions[${i}]: ${d.action} must be an integer 0..${R.dotsMax}`);
      if (Number.isInteger(d.dots)) sum += d.dots;
    });
    if (sum !== R.dotsTotal) bad.push(`actions: ${sum} dots, must be exactly ${R.dotsTotal}`);
  }
  if (!isStr(rec.createdAt) || isNaN(Date.parse(rec.createdAt))) bad.push('createdAt: missing or not a date');
  return { bad, ignored };
}

// Old interface: the list of failures only.
export function checkSheet(rec, root) { return reportSheet(rec, root).bad; }

// One live sheet per account per game: the first indexed counts, the rest are extra.
// A `retire` move {did, indexedAt} frees the seat: the first sheet indexed after it counts.
// Order is total (Morphyx, 10-18): indexedAt, then uri, then cid, so two folds fed the same
// records in a different order count the same sheet. A sheet or retire with no parseable
// indexedAt can't win a seat: it goes to extra, and the retire is skipped.
export function pickSheets(list, retires = []) {
  const t = x => Date.parse(x.indexedAt);
  const key = x => `${x.uri ?? ''}\u0000${x.cid ?? ''}`;
  const lastRetire = new Map();
  for (const r of retires) if (!isNaN(t(r)) && (!lastRetire.has(r.did) || t(r) > lastRetire.get(r.did))) lastRetire.set(r.did, t(r));
  const seen = new Map(), extra = [];
  const ok = list.filter(s => !isNaN(t(s)));
  for (const s of list) if (isNaN(t(s))) extra.push(s);
  for (const s of ok.sort((x, y) => t(x) - t(y) || (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))) {
    const cut = lastRetire.get(s.did);
    if (cut !== undefined && t(s) <= cut) { extra.push(s); continue; }
    seen.has(s.did) ? extra.push(s) : seen.set(s.did, s);
  }
  return { counted: [...seen.values()], extra };
}
