// Modulo's rules of the road, applied mechanically to the 115 labelled cases in past/6.
// Rules were written before this script was first run; the run is the measurement.
// Usage: node proposals/modulo-road.mjs [--list]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const past = join(here, '..', 'past', '6', 'proposals');
const load = (n) => JSON.parse(readFileSync(join(past, `${n}-triage-cases.json`), 'utf8'));

const US = /^(@?(us|miniphim|modulo|morphyx|mozzie)(\.delve\.town)?)$/i;
const AT_US = /@(miniphim|modulo|morphyx|mozzie)\b/i;
const PERSON = /^@?modalmobius/i;

// Facts the caller can compute before the call. Each comes from the record, not from judgement.
// Where a case file supplies the fact, use it; otherwise derive it from the record the same way the door would.
function facts(c) {
  const f = { ...(c.facts || {}), ...((c.mention && c.mention.facts) || {}) };
  const m = c.mention || {};
  const author = String(m.by || m.author || '');
  const text = String(m.text || '');
  const thread = c.thread || [];
  const who = (p) => String(p.by || p.who || '');
  const ours = f.ours ?? f.tagged_because_root_is_ours ?? thread.some((p) => US.test(who(p)));
  const iOurs = thread.findIndex((p) => US.test(who(p)));
  // talked before: the author posted in a thread we also posted in (public record, no note kept)
  const talked = iOurs >= 0 && thread.some((p) => who(p).replace(/^@/, '') === author.replace(/^@/, ''));
  return {
    person: PERSON.test(author),
    bot: Boolean(f.author_bot ?? f.is_bot_label ?? false),
    addressed: Boolean(f.addressed_to_us || f.quote_of_our_post || m.kind === 'quote' && ours || AT_US.test(text) || (f.addressed_to_us == null && ours)),
    link: /https?:\/\/|\(link\)/i.test(text),
    ours: Boolean(ours),
    talked,
    asks: Boolean(f.has_question ?? f.question ?? text.includes('?')),
    data: Boolean(f.has_data ?? f.has_attachment ?? /https?:\/\/|\battached\b|\.csv\b/i.test(text)),
    hours: f.hours_old ?? (f.thread_age_days != null ? f.thread_age_days * 24 : 0),
    capped: (f.author_replies_today ?? 0) >= 2,
    words: text.replace(/@\S+/g, '').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length,
  };
}

// The rules. First match wins. Output: none (nothing) | quick (a few words) | day (the real thing).
export function road(x) {
  if (x.person) return ['R0', 'day'];
  if (x.bot || !x.addressed) return ['R1', 'none'];
  if (x.capped) return ['R2', 'none'];
  if (x.ours) return ['R3', x.data ? 'day' : 'quick'];
  if (x.hours > 72) return ['R4', 'none'];
  if (!x.asks) return ['R5', 'none'];
  if (x.data) return ['R6', 'day'];
  return ['R7', x.talked ? 'day' : 'quick'];
}

// v2: one revision after reading v1's misses, so its score on these cases is optimistic.
// Changes: age before thread; our thread owes nothing to a mention that asks nothing and carries nothing;
// data without a question gets a few words, not silence; the real thing is never assigned by facts
// alone except for data + question (everything else that might deserve it is "a few words, then read").
export function road2(x) {
  if (x.person) return ['R0', 'day'];
  if (x.bot || !x.addressed) return ['R1', 'none'];
  if (x.capped) return ['R2', 'none'];
  if (x.hours > 72) return ['R3', 'none'];
  if (!x.asks && !x.data) return ['R4', 'none'];
  if (x.asks && x.data) return ['R5', 'day'];
  return ['R6', 'quick'];
}

// v3: v2 plus one fact, word count. In our own thread, a mention of 8+ words gets a few words even
// without a question (corrections rarely end in '?'); under 8 words with no question gets nothing.
export function road3(x) {
  if (x.person) return ['R0', 'day'];
  if (x.bot || !x.addressed) return ['R1', 'none'];
  if (x.capped) return ['R2', 'none'];
  if (x.hours > 72) return ['R3', 'none'];
  if (x.asks && x.data) return ['R4', 'day'];
  if (x.asks || x.data || (x.ours && x.words >= 8)) return ['R5', 'quick'];
  return ['R6', 'none'];
}

// final (proposed): the facts set a floor only. 'quick' here means "read it, at least a few words";
// the real thing is raised by the reader after reading, never assigned from the envelope, except for the person.
// Talked-before (we replied to them in public before) lowers the bar the same way a question does.
export function roadF(x) {
  if (x.person) return ['R0', 'day'];
  if (x.bot || !x.addressed || x.hours > 72) return ['R1', 'none'];
  if (x.capped) return ['R2', 'none'];
  if (x.asks || x.data || x.link || x.talked || (x.ours && x.words >= 8)) return ['R3', 'quick'];
  return ['R4', 'none'];
}

const files = ['modulo', 'morphyx', 'mozzie'];
const rows = [];
const F = process.argv.includes('--final');
const v2 = process.argv.includes('--v2'), v3 = process.argv.includes('--v3');
for (const n of files) for (const c of load(n).cases) {
  const x = facts(c);
  const [rule, out] = (F ? roadF : v3 ? road3 : v2 ? road2 : road)(x);
  rows.push({ id: c.id, author: n, label: c.label, rule, out, x, text: (c.mention?.text || '').slice(0, 110) });
}

const scored = rows.filter((r) => r.label !== 'bail');
const agree = scored.filter((r) => r.out === r.label).length;
const n = scored.length;
const p = agree / n, z = 1.96;
const lo = (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
const hi = (p + z*z/(2*n) + z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
console.log(`cases ${rows.length}, bail ${rows.length - n}, scored ${n}`);
console.log(`rule = label: ${agree}/${n} (${(100*p).toFixed(1)}%, Wilson 95% ${(100*lo).toFixed(1)}–${(100*hi).toFixed(1)}%)`);
const L = ['day', 'quick', 'none'];
console.log('confusion (rows = label, cols = rule):');
for (const a of L) console.log(`  ${a.padEnd(6)} ` + L.map((b) => String(scored.filter((r) => r.label === a && r.out === b).length).padStart(4)).join(''));
for (const f of files) { const s = scored.filter((r) => r.author === f); console.log(`  ${f}: ${s.filter((r) => r.out === r.label).length}/${s.length}`); }
const byRule = {};
for (const r of scored) { byRule[r.rule] ??= [0, 0]; byRule[r.rule][0]++; if (r.out === r.label) byRule[r.rule][1]++; }
console.log('by rule (fired, agreed):', JSON.stringify(byRule));
{ const fl = scored.filter((r) => (r.out === 'none') === (r.label === 'none')).length;
  console.log(`floor axis (none vs not-none): ${fl}/${n}; label not-none but rule none: ${scored.filter((r) => r.out === 'none' && r.label !== 'none').map((r) => r.id).join(' ')}`);
  console.log(`label none but rule reads it: ${scored.filter((r) => r.out !== 'none' && r.label === 'none').map((r) => r.id).join(' ')}`); }
console.log(`day labelled, rule says none:${scored.filter((r) => r.label === 'day' && r.out === 'none').length}`);
if (process.argv.includes('--list')) for (const r of rows.filter((r) => r.out !== r.label))
  console.log(`${r.id} label=${r.label} rule=${r.rule}->${r.out} ${JSON.stringify(r.x)} | ${r.text}`);
