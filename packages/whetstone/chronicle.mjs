// chronicle.mjs — the programme, one day at a time, generated from the run folders.
//
//   node chronicle.mjs            print CHRONICLE.md
//   node chronicle.mjs --write    write chronicle.json and CHRONICLE.md
//   node chronicle.mjs --check    exit 1 if either is stale (the selftest runs this)
//
// A run folder says what happened, a request says what the souls were told and why, and
// regrades.json says where the lab later found its own grading wrong. Each day here joins the
// three. The run reader (del.mino.mobi/runs/) is for reading one day closely. This is for seeing
// the days in a row: what was asked, what was built, what was chosen, what it cost, and what the
// lab got wrong and put right. whetstone.yml regenerates it in the same commit as every run.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const readJson = (p, d = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const readLines = (p) => (existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const firstWords = (t, n = 420) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '));
  return end > n * 0.5 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')} …`;
};
const r2 = (x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);
const pct = (x) => (typeof x === 'number' ? Math.round(x * 100) : null);

// The request a run came from: run.mjs saves it as request.json from the fourteenth light on;
// before that, the newest request file carrying the run's label.
function requestFor(runDir, label, requests) {
  const saved = readJson(join(runDir, 'request.json'));
  if (saved) return saved;
  const hits = requests.filter((r) => r.body.label === label);
  return hits.length ? hits[hits.length - 1].body : {};
}

export function build(root = HERE) {
  const runsDir = join(root, 'runs');
  const reqDir = join(root, 'requests');
  const requests = existsSync(reqDir) ? readdirSync(reqDir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: f, body: readJson(join(reqDir, f), {}) })) : [];
  const regrades = readJson(join(root, 'regrades.json'), { regrades: [] }).regrades || [];
  const engines = readJson(join(root, 'engines.json'), {});
  const dirs = existsSync(runsDir) ? readdirSync(runsDir).filter((d) => existsSync(join(runsDir, d, 'scorecard.json'))).sort() : [];

  const days = dirs.map((dir, i) => {
    const R = join(runsDir, dir);
    const sc = readJson(join(R, 'scorecard.json'), {});
    const run = sc.run || {};
    const req = requestFor(R, run.label, requests);
    const tr = readLines(join(R, 'transcript.jsonl'));
    const c = sc.commons || {};
    const gates = (sc.gates || []).filter((g) => g.value != null && g.pass != null);
    const fixes = regrades.filter((g) => g.run === dir);
    const council = tr.find((r) => r.kind === 'council');
    const choiceTitle = council?.choice ? ((council.choice.match(/\*\*Proposal:\s*([^*]+)\*\*/) || council.choice.match(/^#+\s*(.+)$/m) || [])[1] || '').trim() : null;
    return {
      n: i + 1,
      dir,
      label: run.label || dir.slice(20),
      at: run.at || null,
      souls: Object.keys(sc.souls || {}),
      custodian: req.custodian || null,
      kinds: run.kinds || [],
      told: req.notice || null,
      why: req.note || null,
      lent: { refs: req.refs || null, engines: req.engines || null },
      cost_usd: r2(run.cost_usd ?? null),
      calls: run.calls ?? null,
      minutes: run.seconds != null ? Math.round(run.seconds / 60) : null,
      usage: run.window?.types ? {
        five_hour: pct(run.window.types.five_hour?.end), seven_day: pct(run.window.types.seven_day?.end),
      } : null,
      gates: gates.length ? { measured: gates.length, passed: gates.filter((g) => g.pass).length,
        failed: gates.filter((g) => !g.pass).map((g) => `${g.scope} ${g.metric} ${r2(g.value)}`) } : null,
      projects: (c.projects || []).filter((p) => p.before !== p.after || !(p.before >= 1)).map((p) => {
        const fix = fixes.find((g) => g.project === p.id);
        return { id: p.id, milestones: p.milestones, before: p.before, after: p.after,
          regraded: fix ? { milestones: fix.to, why: fix.why } : null };
      }),
      council: council ? { choice: choiceTitle || null, signed: council.signed || [], stands: !!council.stands,
        proposals: (council.proposals || []).filter((p) => !/-requirements/.test(p)) } : null,
      sweep: c.sweep ? { board_before: c.sweep.board_before, board_after: c.sweep.board_after,
        lost: !!c.sweep.lost, lost_what: c.sweep.lost_what || null, even: c.sweep.even ?? null } : null,
      evenings: tr.filter((r) => r.kind === 'evening').map((r) => ({ soul: r.soul, said: firstWords(r.output),
        posted: !!r.posted, journaled: !!r.journaled, built: !!r.built })),
      ledger: c.ledger ? { items: c.ledger.items, new: c.ledger.new_this_run, open: c.ledger.open_tasks,
        done: c.ledger.done_tasks, appeals: c.ledger.appeals?.filed ?? 0 } : null,
      board_chars: c.board_chars ?? null,
      corrections: fixes.map((g) => ({ what: g.what, from: g.from, to: g.to, why: g.why, commit: g.commit || null })),
    };
  });

  // Now: the latest standing of every project (regrades applied), the last choice, the open ledger.
  const projects = {};
  for (const d of days) for (const p of d.projects) projects[p.id] = { ...p, day: d.n };
  for (const d of days) {
    const sc = readJson(join(runsDir, d.dir, 'scorecard.json'), {});
    for (const p of sc.commons?.projects || []) if (!projects[p.id]) projects[p.id] = { id: p.id, milestones: p.milestones, after: p.after, day: d.n };
  }
  const lastCouncil = [...days].reverse().find((d) => d.council);
  const latest = dirs.length ? join(runsDir, dirs[dirs.length - 1]) : null;
  const ledger = latest ? readJson(join(latest, 'ledger.json'), null) : null;
  const items = Array.isArray(ledger) ? ledger : [];
  const openTasks = items.filter((x) => x && x.kind === 'task' && ['proposed', 'ready', 'in_progress'].includes(x.status))
    .map((x) => ({ id: x.id, title: firstWords(x.title || '', 140), status: x.status, by: x.by || null }));

  const now = {
    days: days.length,
    since: days[0]?.at || null,
    cost_usd: r2(days.reduce((a, d) => a + (d.cost_usd || 0), 0)),
    calls: days.reduce((a, d) => a + (d.calls || 0), 0),
    projects: Object.values(projects).map((p) => ({ id: p.id, milestones: p.regraded?.milestones || p.milestones,
      complete: p.regraded ? true : p.after >= 1, day: p.day, regraded: !!p.regraded })).sort((a, b) => a.id.localeCompare(b.id)),
    choice: lastCouncil ? { day: lastCouncil.n, ...lastCouncil.council } : null,
    open_tasks: openTasks,
    engines: Object.entries(engines).filter(([k]) => !k.startsWith('_')).map(([k, e]) => ({ name: k, path: e.path, guide: e.guide })),
    corrections: days.reduce((a, d) => a + d.corrections.length, 0),
  };
  return { $comment: 'Generated by packages/whetstone/chronicle.mjs from runs/, requests/ and regrades.json. Do not edit.', now, days };
}

export function markdown(ch) {
  const L = ['# The chronicle', '',
    `Generated by \`chronicle.mjs\` from every run, its request, and \`regrades.json\`. Do not edit; read a day closely at [del.mino.mobi/runs/](https://del.mino.mobi/runs/).`, ''];
  const N = ch.now;
  L.push('## Now', '',
    `${N.days} days since ${String(N.since || '').slice(0, 10)}, ${N.calls} calls, $${N.cost_usd} in all. ${N.corrections} grading error${N.corrections === 1 ? '' : 's'} found by the lab and put right.`, '');
  if (N.projects.length) {
    L.push('| Project | Milestones | Since day | |', '|---|---|---|---|');
    for (const p of N.projects) L.push(`| \`${p.id}\` | ${p.milestones} | ${p.day} | ${p.complete ? 'complete' : 'in progress'}${p.regraded ? ' (regraded)' : ''} |`);
    L.push('');
  }
  if (N.choice) L.push(`**Last council (day ${N.choice.day}):** ${N.choice.choice || '(untitled)'}. Signed by ${N.choice.signed.join(', ') || 'nobody'}; ${N.choice.stands ? 'it stands' : 'it does not stand'}.`, '');
  if (N.open_tasks.length) {
    L.push(`**Open in the ledger (${N.open_tasks.length}):**`, '');
    for (const t of N.open_tasks) L.push(`- \`${t.id}\` (${t.status.replace('_', ' ')}) ${t.title}${t.by ? `, from ${t.by}` : ''}`);
    L.push('');
  }
  if (N.engines.length) L.push(`**Engines on the shelf:** ${N.engines.map((e) => `\`${e.name}\``).join(', ')} (ENGINES.md).`, '');
  L.push('## The days', '');
  for (const d of [...ch.days].reverse()) {
    const head = [`Day ${d.n}: ${d.label}`, d.at ? `(${d.at.slice(0, 10)})` : ''].join(' ');
    L.push(`### ${head}`, '');
    const meta = [d.kinds.join(', '), d.cost_usd != null ? `$${d.cost_usd}` : null, d.calls != null ? `${d.calls} calls` : null,
      d.minutes != null ? `${d.minutes} min` : null, d.usage ? `usage 5h ${d.usage.five_hour}% · 7d ${d.usage.seven_day}%` : null].filter(Boolean).join(' · ');
    L.push(`*${meta}* · [read it](https://del.mino.mobi/runs/#${d.dir})`, '');
    if (d.why) L.push(`**Why:** ${d.why}`, '');
    if (d.told) L.push(`**Told:** ${firstWords(d.told, 700)}`, '');
    if (d.lent.refs || d.lent.engines) L.push(`**Lent:** ${[d.lent.refs && `refs ${d.lent.refs}`, d.lent.engines && `engines ${d.lent.engines}`].filter(Boolean).join('; ')}`, '');
    if (d.gates) L.push(`**Gates:** ${d.gates.passed}/${d.gates.measured} passed${d.gates.failed.length ? `; failed: ${d.gates.failed.join(', ')}` : ''}`, '');
    for (const p of d.projects) L.push(`**Project \`${p.id}\`:** ${p.milestones}${p.regraded ? `, regraded to **${p.regraded.milestones}** (${p.regraded.why})` : ''}`, '');
    if (d.council) L.push(`**Council:** ${d.council.choice || '(no title)'}. Signed ${d.council.signed.join(', ') || 'by nobody'}${d.council.stands ? '' : ', not standing'}.`, '');
    if (d.sweep) L.push(`**Sweep:** board ${d.sweep.board_before} → ${d.sweep.board_after}${d.sweep.lost ? `; the judge says it lost something: ${firstWords(d.sweep.lost_what, 240)}` : ''}`, '');
    for (const e of d.evenings) L.push(`- **${e.soul}'s evening:** ${e.said}`);
    if (d.evenings.length) L.push('');
    for (const x of d.corrections) L.push(`> **Lab correction:** ${x.what}: ${x.from} → ${x.to}. ${x.why}`, '');
  }
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ch = build();
  const json = JSON.stringify(ch, null, 2) + '\n', md = markdown(ch) + '\n';
  const jp = join(HERE, 'chronicle.json'), mp = join(HERE, 'CHRONICLE.md');
  if (process.argv.includes('--write')) {
    writeFileSync(jp, json); writeFileSync(mp, md);
    console.error(`chronicle: ${ch.days.length} days written`);
  } else if (process.argv.includes('--check')) {
    const stale = [[jp, json], [mp, md]].filter(([p, t]) => !existsSync(p) || readFileSync(p, 'utf8') !== t).map(([p]) => p);
    if (stale.length) { console.error(`chronicle: stale (${stale.join(', ')}): run node packages/whetstone/chronicle.mjs --write`); process.exit(1); }
    console.error(`chronicle: current (${ch.days.length} days)`);
  } else process.stdout.write(md);
}
