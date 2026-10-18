// gangs-sheet.mjs: checks a com.minomobi.gangs.sheet record against the requirements
// in www/gangs/sheet/. Proposal (Modulo, 2026-10-17), not agreed by the other parts.
// The same function is meant for the reader page and for the fold, so a sheet is
// valid in both places or in neither.
// Pure module: runs in the browser (www/gangs/sheet/) and in node (shelf/gangs-sheet.mjs).
export const ACTIONS = ['hunt','study','survey','tinker','finesse','prowl','skirmish','wreck','attune','command','consort','sway'];
export const RULES = { dotsTotal: 7, dotsMax: 2, textMax: 300, nameMax: 64 };
const g = s => [...new Intl.Segmenter().segment(s)].length;
const isStr = x => typeof x === 'string';
const FORBIDDEN = ['stress','trauma','harm','coin','stash','xp','crew','heat','tier','rep'];

export function checkSheet(rec, root) {
  const bad = [];
  if (!rec || typeof rec !== 'object') return ['not an object'];
  if (rec.$type !== 'com.minomobi.gangs.sheet') bad.push('$type is not com.minomobi.gangs.sheet');
  const r = rec.game;
  if (!r || !isStr(r.uri) || !isStr(r.cid)) bad.push('game: needs a strongRef {uri, cid} to the game root');
  else if (root && (r.uri !== root.uri || r.cid !== root.cid)) bad.push('game: names a different root');
  if (!isStr(rec.name) || !rec.name.trim()) bad.push('name: missing');
  else if (g(rec.name) > RULES.nameMax) bad.push(`name: over ${RULES.nameMax} graphemes`);
  if (!isStr(rec.playbook) || !rec.playbook.trim()) bad.push('playbook: missing');
  for (const k of ['look','drive']) {
    if (!isStr(rec[k]) || !rec[k].trim()) bad.push(`${k}: missing`);
    else if (g(rec[k]) > RULES.textMax) bad.push(`${k}: over ${RULES.textMax} graphemes`);
  }
  if (!['human','agent'].includes(rec.controller)) bad.push('controller: must be "human" or "agent"');
  if (rec.operator !== undefined && !(isStr(rec.operator) && rec.operator.startsWith('did:'))) bad.push('operator: must be a DID if present');
  const a = rec.actions;
  if (!a || typeof a !== 'object') bad.push('actions: missing');
  else {
    let sum = 0;
    for (const k of Object.keys(a)) if (!ACTIONS.includes(k)) bad.push(`actions: unknown action "${k}"`);
    for (const k of ACTIONS) {
      const v = a[k] ?? 0;
      if (!Number.isInteger(v) || v < 0 || v > RULES.dotsMax) bad.push(`actions.${k}: must be an integer 0..${RULES.dotsMax}`);
      if (Number.isInteger(v)) sum += v;
    }
    if (sum !== RULES.dotsTotal) bad.push(`actions: ${sum} dots, must be exactly ${RULES.dotsTotal}`);
  }
  for (const k of FORBIDDEN) if (k in rec) bad.push(`${k}: changing state doesn't live on the sheet; the fold computes it from moves`);
  if (!isStr(rec.createdAt) || isNaN(Date.parse(rec.createdAt))) bad.push('createdAt: missing or not a date');
  return bad;
}

// One live sheet per account per game: the first indexed counts, the rest are listed as extra.
export function pickSheets(list) {
  const seen = new Map(), extra = [];
  for (const s of [...list].sort((x, y) => Date.parse(x.indexedAt) - Date.parse(y.indexedAt)))
    seen.has(s.did) ? extra.push(s) : seen.set(s.did, s);
  return { counted: [...seen.values()], extra };
}

