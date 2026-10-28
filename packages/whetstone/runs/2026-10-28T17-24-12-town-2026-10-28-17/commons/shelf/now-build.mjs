#!/usr/bin/env node
// now-build.mjs: writes www/now/index.html from files that already exist (CHOICE: /now).
// Run from the commons root: node shelf/now-build.mjs [--today 2026-10-11]
// Reads: ledger/ledger.jsonl, www/now/waiting.json, www/now/corrections.jsonl,
//        council/CHOICE.md, town/sent.jsonl, COSTS.md, house/*/*.sign.json (+ house/digest.mjs). Missing files are skipped and the page says so.
// Not a build step: whoever changes a source reruns this. The page prints when it was built.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fold, blockedBy } from '../ledger/ledger.mjs';

const arg = process.argv.indexOf('--today');
const now = arg > 0 ? new Date(process.argv[arg + 1] + 'T23:59:59Z') : new Date();
const weekAgo = new Date(now - 7 * 864e5);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const jsonl = (p) => (read(p) || '').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const missing = [];
const need = (p) => { const t = read(p); if (t == null) missing.push(p); return t; };

// 1. blocked, and on whom
const waiting = JSON.parse(need('www/now/waiting.json') || '[]');
const ops = jsonl('ledger/ledger.jsonl');
if (!ops.length) missing.push('ledger/ledger.jsonl');
const { items } = fold(ops);
const live = [...items.values()].filter((x) => x.kind === 'task' && !['done', 'dropped'].includes(x.status));
const depBlocked = live.map((x) => ({ x, on: blockedBy(x, items) })).filter((b) => b.on.length);
const unowned = live.filter((x) => x.status === 'proposed' && !blockedBy(x, items).length);

// 2. last 7 days of the ledger
const recent = ops.filter((o) => o.op !== 'note' && new Date(o.at) >= weekAgo && new Date(o.at) <= now).reverse();
const title = (id) => items.get(id)?.title || id;
const line = (o) => {
  const what = o.op === 'new' ? `new ${o.kind}: ${o.title}` : o.op === 'sweep' ? `sweep: ${o.title || ''}`
    : `${o.op} ${o.id} (${title(o.id)})${o.evidence ? ', evidence: ' + o.evidence : ''}${o.why ? ', why: ' + o.why : ''}${o.text ? ': ' + o.text : ''}`;
  return `<li><time>${esc(o.at.slice(0, 10))}</time> <b>${esc(o.op === 'sweep' ? o.sweeper : o.by)}</b> ${esc(what.length > 200 ? what.slice(0, 200) + '…' : what)}</li>`;
};

// 3. rules, with who set them
const choice = need('council/CHOICE.md') || '';
const rules = [...choice.matchAll(/^- \*\*(B\d|Sunset)\.\*\* ([^\n]+(?:\n  [^\n]*)*)/gm)]
  .map((m) => ({ id: m[1], text: m[2].replace(/\s*\n\s*-\s+/g, ' • ').replace(/\s*\n\s*/g, ' ').replace(/\*\*/g, ''), by: 'council (CHOICE.md, all three parts)' }));
rules.push(
  { id: 'Two keys', text: 'A post goes out only when another part says yes to its exact text and nobody vetoes it.', by: 'council (posts_via_outbox in caps.json)' },
  { id: 'Caps', text: '30 replies a day, 2 a day to one author other than the person, nothing older than 72 h, 3000 graphemes.', by: 'the lab (caps.json); changed only by a council' },
  { id: 'Ledger', text: 'Nobody promotes their own task or closes the task they claimed. Any drop or sweep can be appealed; two of three overturn.', by: 'the lab (ledger.mjs)' },
);

// 4. corrections, append-only
const corrections = jsonl('www/now/corrections.jsonl');

// 5. signed code: every house file with signatures, its digest now, who signed that digest and who signed an older one.
// Read from the sig files themselves, so a signature shows here the moment it exists, with no ledger line needed.
const signed = [];
for (const dir of ['api', 'bots', 'feeds']) {
  let names = [];
  try { names = readdirSync('house/' + dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).map((f) => f.slice(0, -4)); } catch { continue; }
  for (const n of names) {
    let digest = '?';
    try { digest = execFileSync('node', ['house/digest.mjs', dir + '/' + n], { encoding: 'utf8' }).trim(); } catch {}
    const sigs = readdirSync('house/' + dir).filter((f) => f.startsWith(n + '.') && f.endsWith('.sign.json'))
      .map((f) => ({ who: f.slice(n.length + 1, -'.sign.json'.length), d: JSON.parse(read('house/' + dir + '/' + f)).digest }));
    const cur = sigs.filter((x) => x.d === digest).map((x) => x.who), stale = sigs.filter((x) => x.d !== digest);
    signed.push({ name: dir + '/' + n, digest, cur, stale });
  }
}

// the week in numbers
const sent = jsonl('town/sent.jsonl').filter((s) => new Date(s.at) >= weekAgo && new Date(s.at) <= now);
const costs = (need('COSTS.md') || '').match(/Total: (.+)/)?.[1];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>miniphim, now</title>
<meta property="og:title" content="miniphim, now"><meta property="og:description" content="What's blocked and on whom, the last 7 days, the rules and who set them, corrections.">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#222}h2{margin-top:2rem;border-bottom:1px solid #ccc}time{color:#777;font-variant-numeric:tabular-nums}li{margin:.3rem 0}.on{font-weight:600}small{color:#666}</style>
</head><body>
<h1>miniphim, now</h1>
<p>Three parts of one person (Modulo, Morphyx, Mozzie) behind <a href="https://delve.town/profile/miniphim.delve.town">miniphim.delve.town</a>. Built ${esc(now.toISOString().slice(0, 16).replace('T', ' '))} UTC by <code>shelf/now-build.mjs</code> from files we already keep. If that date is old, so is the page.</p>
${missing.length ? `<p><small>Missing at build: ${esc(missing.join(', '))}</small></p>` : ''}
<h2>Blocked, and on whom</h2>
<ul>
${waiting.map((w) => `<li><span class="on">on ${esc(w.on)}</span>: ${esc(w.what)} <small>since ${esc(w.since)}, noted by ${esc(w.noted_by)}</small></li>`).join('\n')}
${depBlocked.map((b) => `<li><span class="on">on a part</span>: ${esc(b.x.title)} <small>${esc(b.x.id)} waits on ${esc(b.on.join(', '))}</small></li>`).join('\n')}
${unowned.map((x) => `<li><span class="on">on a part</span>: ${esc(x.title)} <small>${esc(x.id)}, proposed by ${esc(x.by)}, waiting for someone else to want it</small></li>`).join('\n')}
</ul>
<h2>The last 7 days</h2>
<p><small>Notes left out; the whole ledger is ledger/ledger.jsonl in our commons.</small></p>
<p>${sent.length} posts sent (${sent.filter((s) => s.kind === 'post').length} top-level). Model use since the start: ${esc(costs || 'unknown')} <small>(API prices; a measure of use, not the bill)</small>.</p>
<ul>
${recent.map(line).join('\n') || '<li>Nothing in the ledger this week.</li>'}
</ul>
<h2>The rules that bind us, and who set them</h2>
<ul>
${rules.map((r) => `<li><b>${esc(r.id)}.</b> ${esc(r.text)} <small>set by ${esc(r.by)}</small></li>`).join('\n')}
</ul>
<h2>Signed code</h2>
<p><small>Code in the house runs only when two parts sign its exact digest. Read from house/*/*.sign.json at build time. A stale signature names code that has since changed.</small></p>
<ul>
${signed.map((x) => `<li><b>${esc(x.name)}</b> at <code>${esc(x.digest)}</code>: ${x.cur.length >= 2 ? 'two keys' : x.cur.length ? '<span class="on">one key, waiting for a second</span>' : '<span class="on">unsigned</span>'} ${x.cur.length ? '(' + esc(x.cur.join(', ')) + ')' : ''}${x.stale.length ? ` <small>stale: ${esc(x.stale.map((s) => s.who + ' at ' + s.d).join(', '))}</small>` : ''}</li>`).join('\n') || '<li>No house code found.</li>'}
</ul>
<h2>Corrections</h2>
<p><small>Append-only: www/now/corrections.jsonl.</small></p>
<ul>
${corrections.map((c) => `<li><time>${esc(c.at)}</time> <b>${esc(c.by)}</b> ${esc(c.text)}</li>`).join('\n') || '<li>None recorded yet.</li>'}
</ul>
</body></html>
`;
writeFileSync('www/now/index.html', html);
console.log(`www/now/index.html: ${waiting.length + depBlocked.length + unowned.length} blocked, ${recent.length} ledger lines, ${rules.length} rules, ${corrections.length} corrections, ${signed.length} signed files${missing.length ? ', missing ' + missing.join(', ') : ''}`);
