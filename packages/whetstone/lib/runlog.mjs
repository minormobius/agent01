// runlog.mjs — RUNLOG.md: when each run started, what woke it, when it read the town, when its posts went
// out (Morphyx, 2026-10-14, draft morphyx-why-late: "a run log: trigger uri, town-read time, publish
// time"). Written into the commons at the start of every run, like COSTS.md, from what the lab already
// keeps in runs/<run>/: the folder's name (the start), request.json (what asked for the run),
// scorecard.json (length, cost, what was held or failed, and from 10-14 the town-read time and the
// GitHub Actions link) and commons/town/sent.jsonl (each post's publish time). A post's or a summon's own
// time is read from its record key (a TID), so the lag from the person's post to the run is measurable.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const S32 = '234567abcdefghijklmnopqrstuvwxyz';
// at://…/<rkey>: a TID's microseconds since the epoch, as an ISO time (null if the key isn't a TID).
export function tidTime(uri) {
  const k = String(uri || '').split('/').pop();
  if (!/^[234567a-z]{13}$/.test(k)) return null;
  let v = 0n; for (const c of k) v = v * 32n + BigInt(S32.indexOf(c));
  const ms = Number((v >> 10n) / 1000n);
  return ms > 1.6e12 && ms < 4.1e12 ? new Date(ms).toISOString() : null;
}
const stampTime = (dir) => { const m = dir.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/); return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z` : null; };
const hm = (iso) => (iso ? iso.slice(11, 19) : '—');
const mins = (a, b) => { const d = Math.round((Date.parse(b) - Date.parse(a)) / 1000); return d < 0 ? '—' : d < 120 ? `${d} s` : `${Math.round(d / 60)} min`; };
const json = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

export function runRows(runsDir, { operatorDid = 'did:plc:nhlcvrqwh7hwhvmgxbut6c2f', limit = 50 } = {}) {
  if (!existsSync(runsDir)) return [];
  const dirs = readdirSync(runsDir).filter((d) => stampTime(d) && existsSync(join(runsDir, d, 'scorecard.json'))).sort().slice(-limit);
  return dirs.map((d) => {
    const req = json(join(runsDir, d, 'request.json')) || {}, run = json(join(runsDir, d, 'scorecard.json'))?.run || {};
    const start = run.started_at || stampTime(d), end = run.at || null;
    let trigger = { kind: 'request', what: req.label || d };
    if (req.summoned_by?.length) {
      const first = req.summoned_by.map((u) => ({ uri: u, at: tidTime(u), who: u.split('/')[2] === operatorDid ? 'the person' : u.split('/')[2] })).sort((a, b) => String(a.at).localeCompare(String(b.at)))[0];
      trigger = { kind: 'summon', uri: first.uri, at: first.at, who: first.who, more: req.summoned_by.length - 1 };
    } else if (/^town-\d{4}-\d{2}-\d{2}-\d{2}$/.test(req.label || '')) trigger = { kind: 'clock', what: `the clock, ${req.label.slice(-2)}:23` };
    const sent = (existsSync(join(runsDir, d, 'commons', 'town', 'sent.jsonl')) ? readFileSync(join(runsDir, d, 'commons', 'town', 'sent.jsonl'), 'utf8') : '')
      .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((x) => x && x.at && x.at >= start && (!end || Date.parse(x.at) <= Date.parse(end) + 20 * 60_000));
    const town = run.town || {};
    return { dir: d, label: req.label || run.label || d, start, end, minutes: run.seconds ? Math.round(run.seconds / 6) / 10 : null, cost: run.cost_usd ?? null,
      trigger, town_read_at: run.town_read_at || null, actions: run.actions || null,
      out: sent.map((x) => ({ at: x.at, kind: x.kind, writer: x.writer, uri: x.uri || x.target || null, after_run: !!(end && x.at > end) })),
      held: (town.held || []).length, failed: (town.failed || []).length };
  });
}

export function runLogMd(runsDir, opt = {}) {
  const rows = runRows(runsDir, opt).reverse();
  if (!rows.length) return null;
  const trig = (t) => t.kind === 'summon' ? `${t.who} at ${hm(t.at)}${t.more ? ` (+${t.more} more)` : ''}: ${t.uri}` : t.kind === 'clock' ? t.what : `a request (${t.what})`;
  const line = (r) => {
    const lag = r.trigger.kind === 'summon' && r.trigger.at ? ` · started ${mins(r.trigger.at, r.start)} after the summon` : '';
    const out = r.out.length ? r.out.map((o) => `${hm(o.at)} ${o.kind}${o.writer ? ` by ${o.writer}` : ''}${o.after_run ? ' (after the run, once the house was up)' : ''}`).join('; ') : 'nothing';
    return `### ${r.start.slice(0, 10)} ${hm(r.start)} · ${r.label}\n` +
      `- woke by: ${trig(r.trigger)}${lag}\n` +
      `- town read: ${r.town_read_at ? hm(r.town_read_at) : '— (not recorded before 10-14)'} · ended: ${hm(r.end)}${r.minutes != null ? ` (${r.minutes} min)` : ''}${r.cost != null ? ` · $${r.cost.toFixed(2)}` : ''}\n` +
      `- went out: ${out}${r.held ? ` · held ${r.held}` : ''}${r.failed ? ` · failed ${r.failed}` : ''}\n` +
      (r.actions ? `- GitHub Actions: ${r.actions}\n` : '');
  };
  return `# RUNLOG: your last ${rows.length} runs, newest first\n\nWritten by the lab at the start of every run (Morphyx asked, 10-14), from each run's folder: its name (the start),\nrequest.json (what woke it), scorecard.json (length, cost, held and failed, the town-read time) and town/sent.jsonl\n(each post's publish time). A summon's time is its post's own record key. Times are UTC. A post marked "after the run"\nwaited for the house to answer 200 and went out from the same job once the deploy was up.\n\n` + rows.map(line).join('\n');
}
