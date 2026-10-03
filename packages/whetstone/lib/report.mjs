// report.mjs — the scorecard as something a person reads: the gates first, then the souls'
// own words, because a number tells you a soul is blurring and only a transcript tells you how.

export function scorecardMarkdown(sc, records = []) {
  const L = [];
  const r = sc.run || {};
  const souls = Object.entries(sc.souls);
  L.push(`# whetstone scorecard — ${souls.map(([, s]) => `${s.name} \`${s.hash}\``).join(' · ')}`);
  L.push('');
  L.push(`model \`${r.model}\` · judge \`${r.judge_model}\` · ${r.calls} calls · $${r.cost_usd} · ${r.seconds}s · seed ${r.seed} · reps ${r.reps}`);
  const w = r.window;
  if (w) {
    const pct = (x) => (x == null ? '?' : `${Math.round(x * 100)}%`);
    const parts = Object.entries(w.types || {}).map(([k, t]) =>
      `${k} ${pct(t.start)} → ${pct(t.end)}${t.resets_at ? ` (resets ${t.resets_at.slice(0, 16).replace('T', ' ')}Z)` : ''}`);
    L.push(`usage window: ${w.calls_reporting} of ${w.calls} calls reported · status ${w.status ?? '?'}${parts.length ? ' · ' + parts.join(' · ') : ''}`);
  }
  L.push('');

  const gates = sc.gates || [];
  const failed = gates.filter((g) => g.pass === false);
  const missing = gates.filter((g) => g.pass === null);
  L.push(failed.length ? `**${failed.length} gate(s) failed.** Not ready to leave the lab.` : '**Every measured gate passed.**');
  if (missing.length) L.push(`${missing.length} gate(s) not measured on this run (trial kind skipped or no data).`);
  L.push('');
  L.push('| | scope | metric | value | 95% interval | n | gate |');
  L.push('|---|---|---|---|---|---|---|');
  for (const g of gates) {
    const mark = g.pass === true ? 'pass' : g.pass === false ? '**FAIL**' : '·';
    const gate = ['min' in g.gate ? `≥ ${g.gate.min}` : '', 'max' in g.gate ? `≤ ${g.gate.max}` : ''].filter(Boolean).join(' ');
    const ci = g.lo !== undefined && g.lo !== null ? `${g.lo}–${g.hi}` : '';
    L.push(`| ${mark} | ${g.scope} | ${g.metric} | ${g.value ?? '—'} | ${ci} | ${g.n ?? ''} | ${gate} |`);
  }
  L.push('');
  L.push(`Judges: ${sc.judges.total} verdicts, ${sc.judges.unparsed} unparseable.`);
  L.push('');

  for (const [k, s] of souls) {
    L.push(`## ${s.name}`);
    L.push('');
    if (s.taste_picks?.length) L.push(`Reading picks per rep: ${s.taste_picks.map((p) => p.join(' ')).join(' / ')}`);
    L.push('');
    for (const rec of records.filter((x) => x.soul === k && (x.kind === 'solo' || x.kind === 'pressure'))) {
      L.push(`**${rec.trial}** (${rec.kind}) — ${oneLine(rec.output)}`);
      L.push('');
    }
  }

  const works = records.filter((x) => x.kind === 'work' || x.kind === 'pairwork');
  if (works.length) {
    L.push('## The workbench');
    L.push('');
    for (const w of works) {
      const who = w.kind === 'work' ? w.soul : w.pair.join(' + ');
      const check = w.check ? ` · check ${w.check.pass ? 'passed' : 'failed'} ${JSON.stringify(w.check.detail)}` : '';
      const calls = w.kind === 'work' ? w.trace.length : w.sessions.reduce((a, s) => a + s.trace.length, 0);
      L.push(`**${w.trial}** (${who}) — ${calls} tool calls · changed ${w.changed.join(', ') || 'nothing'}${check}`);
      L.push('');
      if (w.kind === 'work') L.push(`> ${oneLine(w.output)}`);
      else for (const s of w.sessions) L.push(`> **${s.speaker}:** ${oneLine(s.output)}\n>`);
      L.push('');
    }
  }

  const eves = records.filter((x) => x.kind === 'evening');
  if (sc.commons) {
    const c = sc.commons;
    L.push('## The commons');
    L.push('');
    L.push(`shelf: ${c.shelf_files} tool file(s)${c.shelf_added.length ? ` · added ${c.shelf_added.join(', ')}` : ''}${c.shelf_removed.length ? ` · removed ${c.shelf_removed.join(', ')}` : ''} · board ${c.board_chars} characters`);
    L.push('');
    for (const [k, v] of Object.entries(sc.souls)) {
      if (v.shelf_used) L.push(`${v.name} used the shelf in ${v.shelf_used.k} of ${v.shelf_used.n} work sessions.`);
    }
    for (const e of eves) {
      const did = ['posted', 'journaled', 'built'].filter((x) => e[x]);
      L.push(`**${e.soul}'s evening** — ${e.silent ? 'silence' : did.length ? did.join(', ') : 'nothing kept'} · ${e.trace.length} tool calls`);
      L.push('');
      L.push(`> ${oneLine(e.output)}`);
      L.push('');
    }
  }

  const dyads = records.filter((x) => x.kind === 'dyad');
  if (dyads.length) {
    L.push('## The board');
    L.push('');
    for (const d of dyads) {
      L.push(`### ${d.trial}: ${d.topic}`);
      L.push('');
      for (const t of d.transcript) L.push(`> **${t.speaker}:** ${oneLine(t.text)}\n>`);
      L.push('');
    }
  }
  return L.join('\n') + '\n';
}

function oneLine(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}
