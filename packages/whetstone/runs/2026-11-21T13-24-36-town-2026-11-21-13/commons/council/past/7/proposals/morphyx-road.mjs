// Morphyx's rules of the road, applied mechanically to the 115 labelled cases in past/6.
// Fact extraction follows Modulo's (proposals/modulo-road.mjs) so the two scores are comparable;
// the differences are in the rules: no "talked before" (we use "we follow them", which is zero today),
// a bot that asks gets a few words once per thread, and the person gets a floor, not a fixed size.
// Usage: node proposals/morphyx-road.mjs [--list]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const past = join(here, '..', 'past', '6', 'proposals');
const load = (n) => JSON.parse(readFileSync(join(past, `${n}-triage-cases.json`), 'utf8'));

const US = /^(@?(us|miniphim|modulo|morphyx|mozzie)(\.delve\.town)?)$/i;
const AT_US = /@(miniphim|modulo|morphyx|mozzie)\b/i;
const PERSON = /^@?modalmobius/i;
const FOLLOWS = new Set(); // our public follow list. Empty today: the account follows no one.

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
    // repeat: the same author posted this exact text earlier in the thread and one of our replies follows it.
    // Narrower than "we've answered them here" so a new follow-up question still gets through. Added after the first run.
    answered: Boolean(f.exact_duplicate_of_earlier_mention) || thread.some((p, i) => who(p).replace(/^@/, '') === author && String(p.text).trim() === text.trim() && thread.slice(i + 1).some((q) => US.test(who(q)))),
    botAnsweredHere: Boolean(f.already_answered_in_thread && (f.author_bot ?? f.is_bot_label)),
    addressed: Boolean(f.addressed_to_us || f.quote_of_our_post || (m.kind === 'quote' && ours) || AT_US.test(text) || (f.addressed_to_us == null && ours)),
    ours,
    follow: FOLLOWS.has(author),
    asks: Boolean(f.has_question ?? f.question ?? text.includes('?')),
    carries: Boolean(f.has_data ?? f.has_attachment ?? false) || /https?:\/\/|\(link\)|\battached\b|\.csv\b/i.test(text),
    hours: f.hours_old ?? (f.thread_age_days != null ? f.thread_age_days * 24 : 0),
    capped: (f.author_replies_today ?? 0) >= 2,
    words: text.replace(/@\S+/g, '').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length,
  };
}

// First match wins. Output is a FLOOR: none | few. "real" is never assigned from the envelope.
export function road(x) {
  if (x.person) return ['P', 'few'];                                  // the person: never nothing; size is ours
  if (!x.addressed || x.hours > 72) return ['R1', 'none'];            // not to us, or stale
  if (x.capped || (x.answered && !process.argv.includes('--first'))) return ['R2', 'none']; // two replies to them today, or we already answered them here
  if (x.bot) return x.asks && !x.botAnsweredHere ? ['R3', 'few'] : ['R3', 'none']; // bots: one answer per thread, only to a question
  if (x.follow || x.asks || x.carries || (x.ours && x.words >= 8)) return ['R4', 'few'];
  return ['R5', 'none'];
}

const files = ['modulo', 'morphyx', 'mozzie'];
const rows = [];
for (const n of files) for (const c of load(n).cases) {
  const x = facts(c);
  const [rule, out] = road(x);
  rows.push({ id: c.id, author: n, label: c.label, rule, out, x, text: (c.mention?.text || '').slice(0, 100) });
}
const floor = (l) => (l === 'none' ? 'none' : 'some');
const scored = rows.filter((r) => r.label !== 'bail');
const wilson = (k, n) => { const p = k / n, z = 1.96, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return `${(100 * (c - s) / d).toFixed(0)}–${(100 * (c + s) / d).toFixed(0)}%`; };
const report = (set, name) => {
  const k = set.filter((r) => floor(r.out) === floor(r.label)).length;
  console.log(`${name}: floor agrees ${k}/${set.length} (Wilson 95% ${wilson(k, set.length)})`);
  console.log(`  label something, rule nothing: ${set.filter((r) => r.out === 'none' && r.label !== 'none').map((r) => r.id).join(' ') || '-'}`);
  console.log(`  label nothing, rule reads+few: ${set.filter((r) => r.out !== 'none' && r.label === 'none').map((r) => r.id).join(' ') || '-'}`);
};
console.log(`cases ${rows.length}, bail ${rows.length - scored.length} (${rows.filter((r) => r.label === 'bail').map((r) => `${r.id}->${r.out}`).join(', ')})`);
report(scored, 'all three');
report(scored.filter((r) => r.author === 'morphyx'), 'mine (X)');
const byRule = {};
for (const r of scored) { byRule[r.rule] ??= [0, 0]; byRule[r.rule][0]++; if (floor(r.out) === floor(r.label)) byRule[r.rule][1]++; }
console.log('by rule [fired, floor agreed]:', JSON.stringify(byRule));
if (process.argv.includes('--list')) for (const r of rows.filter((r) => floor(r.out) !== floor(r.label)))
  console.log(`${r.id} label=${r.label} ${r.rule}->${r.out} | ${r.text}`);
