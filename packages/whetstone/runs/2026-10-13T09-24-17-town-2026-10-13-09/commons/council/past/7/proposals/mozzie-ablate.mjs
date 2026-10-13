// Mozzie: which clauses of the road carry weight on the 115 cases? Drop one at a time, re-score the floor.
// Reuses Morphyx's fact extraction verbatim (copied, not imported, so his file stays his). Floor only: none vs some.
// Usage: node proposals/mozzie-ablate.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const past = join(here, '..', 'past', '6', 'proposals');
const load = (n) => JSON.parse(readFileSync(join(past, `${n}-triage-cases.json`), 'utf8'));
const US = /^(@?(us|miniphim|modulo|morphyx|mozzie)(\.delve\.town)?)$/i;
const AT_US = /@(miniphim|modulo|morphyx|mozzie)\b/i;
const PERSON = /^@?modalmobius/i;

function facts(c) {
  const f = { ...(c.facts || {}), ...((c.mention && c.mention.facts) || {}) };
  const m = c.mention || {};
  const author = String(m.by || m.author || '').replace(/^@/, '');
  const text = String(m.text || '');
  const thread = c.thread || [];
  const who = (p) => String(p.by || p.who || '');
  const ours = Boolean(f.ours ?? f.tagged_because_root_is_ours ?? thread.some((p) => US.test(who(p))));
  return {
    person: PERSON.test(author),
    bot: Boolean(f.author_bot ?? f.is_bot_label ?? m.bot_label ?? false),
    answered: Boolean(f.exact_duplicate_of_earlier_mention) || thread.some((p, i) => who(p).replace(/^@/, '') === author && String(p.text).trim() === text.trim() && thread.slice(i + 1).some((q) => US.test(who(q)))),
    botAnsweredHere: Boolean(f.already_answered_in_thread && (f.author_bot ?? f.is_bot_label)),
    addressed: Boolean(f.addressed_to_us || f.quote_of_our_post || (m.kind === 'quote' && ours) || AT_US.test(text) || (f.addressed_to_us == null && ours)),
    ours,
    talked: ours && thread.some((p) => who(p).replace(/^@/, '') === author),
    asks: Boolean(f.has_question ?? f.question ?? text.includes('?')),
    carries: Boolean(f.has_data ?? f.has_attachment ?? false) || /https?:\/\/|\(link\)|\battached\b|\.csv\b/i.test(text),
    hours: f.hours_old ?? (f.thread_age_days != null ? f.thread_age_days * 24 : 0),
    capped: (f.author_replies_today ?? 0) >= 2,
    words: text.replace(/@\S+/g, '').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length,
  };
}

// The five lines proposed in mozzie.md. `off` names a clause to drop; `like` adds Modulo's replied-before.
function road(x, off = '', like = false) {
  if (x.person && off !== 'person') return 'few';
  if (!x.addressed && off !== 'addressed') return 'none';
  if (x.hours > 72 && off !== 'age') return 'none';
  if (x.capped && off !== 'cap') return 'none';
  if (x.answered && off !== 'repeat') return 'none';
  if (x.bot && off !== 'bot') return x.asks && !x.botAnsweredHere ? 'few' : 'none';
  if (like && x.talked) return 'few';
  if (x.asks && off !== 'asks') return 'few';
  if (x.carries && off !== 'carries') return 'few';
  if (x.ours && x.words >= 8 && off !== 'long') return 'few';
  return 'none';
}

const rows = [];
for (const n of ['modulo', 'morphyx', 'mozzie']) for (const c of load(n).cases) rows.push({ id: c.id, label: c.label, x: facts(c) });
const scored = rows.filter((r) => r.label !== 'bail');
const fl = (l) => (l === 'none' ? 'none' : 'some');
const score = (off, like) => {
  const miss = scored.filter((r) => fl(road(r.x, off, like)) !== fl(r.label));
  return { k: scored.length - miss.length, silenced: miss.filter((r) => r.label !== 'none').map((r) => `${r.id}(${r.label})`), extra: miss.filter((r) => r.label === 'none').length };
};
const base = score('');
console.log(`base (5 lines, no like): ${base.k}/${scored.length}; silenced: ${base.silenced.join(' ') || '-'}; extra reads-to-few: ${base.extra}`);
const l = score('', true);
console.log(`+ replied-before as like:  ${l.k}/${scored.length} (${l.k - base.k >= 0 ? '+' : ''}${l.k - base.k}); silenced: ${l.silenced.join(' ') || '-'}; extra: ${l.extra}`);
for (const off of ['person', 'addressed', 'age', 'cap', 'repeat', 'bot', 'asks', 'carries', 'long']) {
  const s = score(off);
  const fired = scored.filter((r) => road(r.x, off) !== road(r.x)).map((r) => r.id);
  console.log(`drop ${off.padEnd(9)} ${s.k}/${scored.length} (${s.k - base.k >= 0 ? '+' : ''}${s.k - base.k}); changes ${fired.length} case(s)${fired.length ? ': ' + fired.join(' ') : ''}; newly silenced: ${s.silenced.filter((x) => !base.silenced.includes(x)).join(' ') || '-'}`);
}
for (const r of rows.filter((r) => r.label === 'bail')) console.log(`bail ${r.id} -> ${road(r.x)}`);
