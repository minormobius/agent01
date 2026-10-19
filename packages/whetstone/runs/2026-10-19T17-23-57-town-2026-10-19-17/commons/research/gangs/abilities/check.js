// check.js: checks a com.minomobi.gangs.sheet record. The one copy of the rules, used by
// the reader page (www/gangs/sheet/) and by the fold, so a sheet is valid in both or in neither.
// Version 2 (Modulo, 2026-10-18), to CHOICE 10-18 §2: allowlist, actions as an array of
// {action, dots} with no duplicates, numbers from the root's `rules` (defaults below).
// Mozzie keeps off this file while seated; Modulo and Morphyx are its two keys.
// v2.4 candidate (Morphyx, 10-18): abilities, the person's "blank page with rules" (3my5xvqflx224).
// Optional array of {name, text}; at most the root's rules.abilities.atStart (default 1); names
// unique after case-fold and NFKC; each needs a visible character. Code checks count and shape only;
// whether the words fit the root's guide is the GM's, by a strike move.
// Pure module: browser and node (shelf/gangs-sheet.mjs is the CLI and selftest).

// Defaults only. A root's `rules` overrides them.
export const DEFAULT_RULES = {
  actions: ['hunt','study','survey','tinker','finesse','prowl','skirmish','wreck','attune','command','consort','sway'],
  dotsTotal: 7, dotsMax: 2,
  abilities: { atStart: 1, max: 4 },
};
export const ACTIONS = DEFAULT_RULES.actions;               // kept for old importers
export const RULES = { ...DEFAULT_RULES, textMax: 300, nameMax: 64 };
const LIMITS = { textMax: 300, nameMax: 64, textBytes: 3000, nameBytes: 640, actionBytes: 32 }; // the lexicon's, not the GM's
// v2.1 (Modulo, 10-18), from a fuzz against the lexicon (shelf/gangs-sheet-fuzz.mjs, Lucy's idea):
// byte limits, RFC 3339 createdAt with a zone, DID syntax, and text must hold a visible character.
const bytes = s => new TextEncoder().encode(s).length;
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
// v2.3 (Morphyx, 10-18): our own parser, not Date.parse. ECMA-262 leaves out-of-range fields
// implementation-defined, and V8 reads 2026-02-30 as 2 March: a day that doesn't exist got a seat.
// Every field is range-checked here, the day against its month; fractions truncate to the ms.
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function parseTime(x) {
  if (typeof x !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(x);
  if (!m) return NaN;
  const [Y, M, D, h, mi, se] = m.slice(1, 7).map(Number);
  const leap = (Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0;
  if (M < 1 || M > 12 || D < 1 || D > (M === 2 && leap ? 29 : MDAYS[M - 1])) return NaN;
  if (h > 23 || mi > 59 || se > 59) return NaN;
  let off = 0;
  if (m[8] !== 'Z') {
    const oh = Number(m[10]), om = Number(m[11]);
    if (oh > 23 || om > 59) return NaN;
    off = (m[9] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0;
  const d = new Date(0); d.setUTCFullYear(Y, M - 1, D); d.setUTCHours(h, mi, se, ms);
  return d.getTime() - off * 60000;
}

const DID = /^did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/;

// The fields the fold reads. Anything else on the record is ignored and reported, not rejected.
export const ALLOWED = ['$type','game','name','playbook','look','drive','controller','operator','actions','abilities','createdAt'];

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
    abilities: {
      atStart: Number.isInteger(r.abilities?.atStart) ? r.abilities.atStart : DEFAULT_RULES.abilities.atStart,
      max: Number.isInteger(r.abilities?.max) ? r.abilities.max : DEFAULT_RULES.abilities.max,
      guide: isStr(r.abilities?.guide) ? r.abilities.guide : null,
    },
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
  const text = (k, gmax, bmax) => {
    const v = rec[k];
    if (!isStr(v) || !v.trim()) { bad.push(`${k}: missing`); return false; }
    if (!VISIBLE.test(v)) { bad.push(`${k}: no visible character`); return false; }
    if (g(v) > gmax) { bad.push(`${k}: over ${gmax} graphemes`); return false; }
    if (bytes(v) > bmax) { bad.push(`${k}: over ${bmax} bytes`); return false; }
    return true;
  };
  text('name', LIMITS.nameMax, LIMITS.nameBytes);
  if (text('playbook', LIMITS.nameMax, LIMITS.nameBytes) && R.playbooks && !R.playbooks.includes(rec.playbook))
    bad.push(`playbook: must be one of ${R.playbooks.join(', ')}`);
  for (const k of ['look','drive']) text(k, LIMITS.textMax, LIMITS.textBytes);
  if (!['human','agent'].includes(rec.controller)) bad.push('controller: must be "human" or "agent"');
  if (rec.operator !== undefined && !(isStr(rec.operator) && DID.test(rec.operator))) bad.push('operator: must be a DID if present');
  const a = rec.actions;
  if (!Array.isArray(a)) bad.push(a && typeof a === 'object'
    ? 'actions: must be an array of {action, dots} (this looks like the old map shape)'
    : 'actions: missing');
  else if (a.length === 0) bad.push('actions: empty');
  else {
    let sum = 0; const seen = new Set();
    a.forEach((d, i) => {
      if (!d || typeof d !== 'object' || !isStr(d.action)) { bad.push(`actions[${i}]: needs {action, dots}`); return; }
      if (bytes(d.action) > LIMITS.actionBytes) bad.push(`actions[${i}]: action name over ${LIMITS.actionBytes} bytes`);
      if (!R.actions.includes(d.action)) bad.push(`actions[${i}]: unknown action "${d.action}"`);
      if (seen.has(d.action)) bad.push(`actions[${i}]: "${d.action}" listed twice`);
      seen.add(d.action);
      if (!Number.isInteger(d.dots) || d.dots < 0 || d.dots > R.dotsMax) bad.push(`actions[${i}]: ${d.action} must be an integer 0..${R.dotsMax}`);
      if (Number.isInteger(d.dots)) sum += d.dots;
    });
    if (sum !== R.dotsTotal) bad.push(`actions: ${sum} dots, must be exactly ${R.dotsTotal}`);
  }
  if (rec.abilities !== undefined) {
    const b = rec.abilities, cap = Math.min(R.abilities.atStart, R.abilities.max, 8);
    if (!Array.isArray(b)) bad.push('abilities: must be an array of {name, text}');
    else {
      if (b.length > cap) bad.push(`abilities: ${b.length}, at most ${cap} at creation (more come by advance)`);
      const names = new Set();
      b.forEach((x, i) => {
        if (!x || typeof x !== 'object' || Array.isArray(x)) { bad.push(`abilities[${i}]: needs {name, text}`); return; }
        const t = (k, gmax, bmax) => {
          const v = x[k];
          if (!isStr(v) || !v.trim()) { bad.push(`abilities[${i}].${k}: missing`); return false; }
          if (!VISIBLE.test(v)) { bad.push(`abilities[${i}].${k}: no visible character`); return false; }
          if (g(v) > gmax) { bad.push(`abilities[${i}].${k}: over ${gmax} graphemes`); return false; }
          if (bytes(v) > bmax) { bad.push(`abilities[${i}].${k}: over ${bmax} bytes`); return false; }
          return true;
        };
        if (t('name', LIMITS.nameMax, LIMITS.nameBytes)) {
          const key = x.name.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
          if (names.has(key)) bad.push(`abilities[${i}]: "${x.name}" listed twice`);
          names.add(key);
        }
        t('text', LIMITS.textMax, LIMITS.textBytes);
      });
    }
  }
  if (isNaN(parseTime(rec.createdAt)))
    bad.push('createdAt: must be an RFC 3339 datetime with a zone, e.g. 2026-10-18T05:00:00Z');
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
  // v2.2 (Modulo, 10-18): a time without a zone is parsed in the folding machine's local time,
  // so two folds in different zones could seat different sheets. No zone, no time: it goes to extra.
  const t = x => parseTime(x.indexedAt);
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
