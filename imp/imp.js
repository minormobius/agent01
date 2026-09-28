// imp.mino.mobi — renders the evaluation from runs/index.json (written by
// scripts/build-imp.mjs from the bakeoff/<run-id> results branches).

const NAMES = { 'ds4-flash': 'DeepSeek V4 Flash', 'ds4-pro': 'DeepSeek V4 Pro', kimi3: 'Kimi K3' };
const ORDER = ['ds4-flash', 'ds4-pro', 'kimi3'];
const modelName = (m) => NAMES[m] || m;
const pct = (x) => (x == null ? '—' : `${Math.round(x * 1000) / 10}%`);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids) n.append(k);
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const byModel = (cells) => [...cells].sort((a, b) => ORDER.indexOf(a.model) - ORDER.indexOf(b.model));

// theme toggle — a per-viewer convenience, so browser storage, guarded
document.getElementById('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('imp-theme', root.dataset.theme); } catch (e) {}
});

const { runs } = await (await fetch('runs/index.json')).json();
const run = (id) => runs.find((r) => r.id === id);
const trec = byModel(run('imp-04').cells).filter((c) => c.tasks.trec);

// ─── tiles ────────────────────────────────────────────────────────────
{
  const gains = trec.map((c) => c.tasks.trec.arms.gepa.score - c.tasks.trec.arms.baseline.score);
  const kimi = trec.find((c) => c.model === 'kimi3');
  const tiles = [
    [`${pct(Math.min(...trec.map((c) => c.tasks.trec.arms.gepa.score)))}<small> – ${pct(Math.max(...trec.map((c) => c.tasks.trec.arms.gepa.score)))}</small>`, 'held-out accuracy after GEPA, all three models (chance is 50%)'],
    [`+${Math.round((kimi.tasks.trec.arms.gepa.score - kimi.tasks.trec.arms.baseline.score) * 100)}<small> pts</small>`, 'Kimi K3, the cleanest before/after: 50% → 94%'],
    ['18/18', 'every model on the hard tool task once its rules were stated'],
    ['1', 'bug found in Imp, with a two-clause fix'],
  ];
  const box = document.getElementById('tiles');
  for (const [v, l] of tiles) {
    const t = el('div', { class: 'tile' });
    const vv = el('div', { class: 'v' });
    vv.innerHTML = v; // our own literals, no data from outside
    t.append(vv, el('div', { class: 'l', text: l }));
    box.append(t);
  }
  void gains;
}

// ─── the dumbbell chart ───────────────────────────────────────────────
// Drawn at the container's real width (so text stays legible on a phone) and
// redrawn on resize. Narrow: the model name sits above its row.
{
  const svg = document.getElementById('trec-svg');
  const tip = document.getElementById('tip');
  const show = (evt, html) => {
    tip.innerHTML = html; // built from our own numbers and names below
    const box = svg.parentElement.getBoundingClientRect();
    tip.style.left = `${Math.max(0, Math.min(evt.clientX - box.left + 12, box.width - 270))}px`;
    tip.style.top = `${evt.clientY - box.top + 12}px`;
    tip.classList.add('on');
  };
  const hide = () => tip.classList.remove('on');

  const draw = () => {
    svg.replaceChildren();
    const W = Math.max(300, Math.round(svg.parentElement.clientWidth - 32));
    const narrow = W < 560;
    const L = narrow ? 14 : 170, R = 26, top = narrow ? 2 : 18, rowH = narrow ? 76 : 58;
    const H = top + rowH * trec.length + 24;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    const x = (v) => L + (W - L - R) * v;

    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append(svgEl('line', { class: t === 0.5 ? 'chance' : 'grid', x1: x(t), x2: x(t), y1: top - 10, y2: H - 22 }));
      const tx = svgEl('text', { class: 'lab', x: x(t), y: H - 6, 'text-anchor': 'middle' });
      tx.textContent = `${t * 100}%`;
      svg.append(tx);
    }

    trec.forEach((c, i) => {
      const a = c.tasks.trec.arms;
      const y = top + rowH * i + (narrow ? rowH - 22 : rowH / 2);
      const name = svgEl('text', { class: 'row-lab', x: 0, y: narrow ? y - 34 : y - 2 });
      name.textContent = modelName(c.model);
      const sub = svgEl('text', { class: 'row-sub', x: narrow ? W : 0, y: narrow ? y - 34 : y + 14, 'text-anchor': narrow ? 'end' : 'start' });
      sub.textContent = `${a.baseline.errors} → ${a.gepa.errors} parse errors`;
      svg.append(name, sub);
      svg.append(svgEl('line', { class: 'link', x1: x(a.baseline.score), x2: x(a.gepa.score), y1: y, y2: y }));

      for (const [arm, cls, colour, label] of [['baseline', 'before', 'var(--before)', 'before'], ['gepa', 'after', 'var(--after)', 'after GEPA']]) {
        const v = a[arm].score;
        svg.append(svgEl('circle', { class: `dot ${cls}`, cx: x(v), cy: y, r: 7, fill: colour }));
        const val = svgEl('text', { class: 'val', x: x(v), y: y - 13, 'text-anchor': 'middle' });
        val.textContent = pct(v);
        svg.append(val);
        const hit = svgEl('circle', { class: 'hit', cx: x(v), cy: y, r: 16 });
        const extra = arm === 'gepa' ? `<br>optimizing took ${Math.round(a.gepa.optimize_seconds / 60)} min` : '';
        const html = `<b>${modelName(c.model)}</b> · ${label}<br>${pct(v)} of 80 held out · ${a[arm].errors} parse errors${extra}`;
        hit.addEventListener('mousemove', (e) => show(e, html));
        hit.addEventListener('mouseleave', hide);
        svg.append(hit);
      }
    });
  };
  draw();
  let pending;
  addEventListener('resize', () => { clearTimeout(pending); pending = setTimeout(draw, 120); });

  // table view of the same numbers
  const tbl = el('table');
  tbl.innerHTML = '<thead><tr><th>model</th><th class="num">baseline</th><th class="num">after GEPA</th><th class="num">gain</th><th class="num">parse errors before → after</th><th class="num">optimize</th></tr></thead>';
  const tb = el('tbody');
  for (const c of trec) {
    const a = c.tasks.trec.arms;
    const tr = el('tr');
    for (const [v, num] of [
      [modelName(c.model), false],
      [pct(a.baseline.score), true],
      [pct(a.gepa.score), true],
      [`+${Math.round((a.gepa.score - a.baseline.score) * 1000) / 10} pts`, true],
      [`${a.baseline.errors} → ${a.gepa.errors}`, true],
      [`${Math.round(a.gepa.optimize_seconds / 60)} min`, true],
    ]) tr.append(el('td', { class: num ? 'num' : '', text: v }));
    tb.append(tr);
  }
  tbl.append(tb);
  document.getElementById('trec-table').append(tbl);
}

// ─── instruction before / after ───────────────────────────────────────
{
  const tabs = document.getElementById('instr-tabs');
  const pair = document.getElementById('instr-pair');
  const render = (c) => {
    const changed = Object.values(c.tasks.trec.gepa.changed || {});
    pair.replaceChildren();
    const b = changed[0]?.before ?? '(unchanged)';
    const a = changed[0]?.after ?? '(GEPA kept the original)';
    pair.append(
      el('div', {}, el('div', { class: 'k', text: 'before' }), el('pre', { text: b })),
      el('div', { class: 'after' }, el('div', { class: 'k', text: `after GEPA — ${modelName(c.model)}` }), el('pre', { text: a })),
    );
    for (const btn of tabs.children) btn.setAttribute('aria-selected', String(btn.dataset.model === c.model));
  };
  for (const c of trec) {
    const btn = el('button', { type: 'button', role: 'tab', 'data-model': c.model, text: modelName(c.model) });
    btn.addEventListener('click', () => render(c));
    tabs.append(btn);
  }
  render(trec.find((c) => c.model === 'kimi3') || trec[0]);
}

// ─── tool tasks table ─────────────────────────────────────────────────
{
  const find = (id, model, task) => run(id)?.cells.find((c) => c.model === model)?.tasks[task];
  const frac = (t, arm) => (t ? `${Math.round(t.arms[arm].score * t.n_test)}/${t.n_test}` : '—');
  const tbl = el('table');
  tbl.innerHTML = '<thead><tr><th>model</th><th class="num">route, zero-shot</th><th class="num">route, 8 examples</th><th class="num">desk</th><th class="num">desk_hard</th><th class="num">desk_hard tool calls</th><th class="num">desk_hard wall</th></tr></thead>';
  const tb = el('tbody');
  for (const m of ORDER) {
    // Kimi's imp-01 cell failed on configuration; its routing numbers are from imp-02.
    const route = find(m === 'kimi3' ? 'imp-02' : 'imp-01', m, 'route');
    const desk = find('imp-01', m, 'desk');
    const hard = find('imp-03', m, 'desk_hard');
    const deskCell = desk && desk.arms.react.score > 0 ? frac(desk, 'react') : '—';
    const tr = el('tr');
    for (const [v, num] of [
      [modelName(m), false],
      [frac(route, 'zero_shot'), true],
      [frac(route, 'few_shot_k8'), true],
      [deskCell, true],
      [frac(hard, 'react'), true],
      [hard ? String(hard.arms.react.tool_calls ?? hard.tool_calls) : '—', true],
      [hard ? `${hard.arms.react.seconds}s` : '—', true],
    ]) tr.append(el('td', { class: num ? 'num' : '', text: v }));
    tb.append(tr);
  }
  tbl.append(tb);
  const box = document.getElementById('tools-table');
  box.append(tbl);
  box.append(el('p', { class: 'row-sub', text: 'route: 20 held-out tickets (imp-01; kimi3 from imp-02, after its configuration fix). desk: imp-01 — Kimi\'s cell failed that run. desk_hard: imp-03, with the stated rule.' }));
}

// ─── trace links ──────────────────────────────────────────────────────
{
  const box = document.getElementById('trace-links');
  const links = [];
  for (const r of runs) for (const f of r.files) if (f.endsWith('.traces.md')) links.push([r.id, f]);
  links.forEach(([id, f], i) => {
    box.append(el('a', { href: `trace.html?f=${encodeURIComponent(`${id}/${f}`)}`, text: `${id}/${f.replace('.traces.md', '')}` }));
    if (i < links.length - 1) box.append(' · ');
  });
}

// ─── runs table ───────────────────────────────────────────────────────
{
  const tbl = el('table');
  tbl.innerHTML = '<thead><tr><th>run</th><th>what it asked</th><th>evidence</th></tr></thead>';
  const tb = el('tbody');
  for (const r of runs) {
    const files = el('td');
    const show = r.files.filter((f) => f === 'report.md' || f === 'results.json' || f.endsWith('.program.json'));
    show.forEach((f, i) => {
      files.append(el('a', { href: `runs/${r.id}/${f}`, text: f.replace('.program.json', ' program') }));
      if (i < show.length - 1) files.append(el('br'));
    });
    tb.append(el('tr', {}, el('td', { text: r.id }), el('td', { text: r.note || '' }), files));
  }
  tbl.append(tb);
  document.getElementById('runs-table').append(tbl);
}

// ─── era: minormobius's posts ─────────────────────────────────────────
{
  const eraRun = [...runs].reverse().find((r) => r.cells.some((c) => c.tasks.era));
  if (eraRun) {
    document.getElementById('era').hidden = false;
    const cells = byModel(eraRun.cells).filter((c) => c.tasks.era);
    const ARMS = [['baseline', 'zero-shot'], ['few_shot_k16', '16 examples'], ['gepa', 'GEPA']];

    const tbl = el('table');
    tbl.innerHTML = '<thead><tr><th>model</th>' + ARMS.map(([, l]) => `<th class="num">${l}</th>`).join('') + '<th class="num">GEPA, within a year</th></tr></thead>';
    const tb = el('tbody');
    for (const c of cells) {
      const a = c.tasks.era.arms;
      const tr = el('tr', {}, el('td', { text: modelName(c.model) }));
      for (const [k] of ARMS) tr.append(el('td', { class: 'num', text: a[k] ? pct(a[k].score) + (a[k].errors ? ` (${a[k].errors} err)` : '') : '—' }));
      tr.append(el('td', { class: 'num', text: a.gepa ? pct(a.gepa.within_one) : '—' }));
      tb.append(tr);
    }
    tbl.append(tb);
    document.getElementById('era-table').append(tbl, el('p', { class: 'row-sub', text: `run ${eraRun.id} · 120 held-out posts · chance 25% exact, 62.5% within a year for a uniform guesser` }));

    // confusion matrix, per model and arm
    const years = ['2023', '2024', '2025', '2026'];
    const mBox = document.getElementById('era-matrix');
    const mTabs = document.getElementById('era-tabs');
    const drawMatrix = (c, arm) => {
      const conf = c.tasks.era.arms[arm]?.confusion;
      mBox.replaceChildren();
      if (!conf) return;
      const t = el('table', { class: 'cm' });
      const head = el('tr', {}, el('th', { class: 'axis-t', text: 'written ↓  guessed →' }));
      for (const y of years) head.append(el('th', { class: 'axis-t', text: y }));
      t.append(head);
      for (const y of years) {
        const row = el('tr', {}, el('th', { class: 'r axis-t', text: y }));
        const total = Object.values(conf[y]).reduce((s, n) => s + n, 0) || 1;
        for (const g of years) {
          const n = conf[y][g] || 0;
          const a = n / total;
          const td = el('td', { class: 'cell', text: String(n), title: `written ${y}, guessed ${g}: ${n} of ${total}` });
          td.style.background = `color-mix(in oklab, var(--after) ${Math.round(a * 100)}%, var(--surface))`;
          td.style.color = a > 0.45 ? '#fff' : 'var(--fg)';
          if (y === g) td.style.outline = '1px solid var(--after)';
          row.append(td);
        }
        t.append(row);
      }
      mBox.append(t);
    };
    const armBtns = [];
    for (const c of cells) for (const [k, l] of ARMS) {
      if (!c.tasks.era.arms[k]) continue;
      const b = el('button', { type: 'button', role: 'tab', text: `${modelName(c.model)} · ${l}` });
      b.addEventListener('click', () => { drawMatrix(c, k); for (const x of armBtns) x.setAttribute('aria-selected', String(x === b)); });
      armBtns.push(b); mTabs.append(b);
    }
    const best = cells.map((c) => [c, c.tasks.era.arms.gepa?.score ?? 0]).sort((a, b) => b[1] - a[1])[0]?.[0] || cells[0];
    const first = armBtns.find((b) => b.textContent === `${modelName(best.model)} · GEPA`) || armBtns[0];
    first?.click();

    // instructions
    const iTabs = document.getElementById('era-itabs');
    const iBox = document.getElementById('era-instr');
    const withGepa = cells.filter((c) => c.tasks.era.gepa && !c.tasks.era.gepa.error);
    const drawInstr = (c) => {
      const ch = Object.values(c.tasks.era.gepa.changed || {})[0];
      iBox.replaceChildren(
        el('div', {}, el('div', { class: 'k', text: 'before' }), el('pre', { text: ch?.before ?? 'A post by one Bluesky user. Guess the year they wrote it.' })),
        el('div', { class: 'after' }, el('div', { class: 'k', text: `after GEPA — ${modelName(c.model)}` }), el('pre', { text: ch?.after ?? '(GEPA kept the original instruction)' })),
      );
      for (const b of iTabs.children) b.setAttribute('aria-selected', String(b.dataset.model === c.model));
    };
    for (const c of withGepa) {
      const b = el('button', { type: 'button', role: 'tab', 'data-model': c.model, text: modelName(c.model) });
      b.addEventListener('click', () => drawInstr(c));
      iTabs.append(b);
    }
    if (withGepa.length) drawInstr(withGepa.find((c) => c.model === best.model) || withGepa[0]);

    // samples: from runs/<id>/results.json (rows are not in index.json)
    fetch(`runs/${eraRun.id}/results.json`).then((r) => r.json()).then((full) => {
      const cell = full.cells.find((c) => c.model === best.model);
      const rows = cell?.tasks?.era?.rows?.gepa || cell?.tasks?.era?.rows?.baseline || [];
      const pick = [...rows.filter((r) => r.predicted === r.year).slice(0, 4), ...rows.filter((r) => r.predicted !== r.year).slice(0, 4)];
      const t = el('table');
      t.innerHTML = '<thead><tr><th>post</th><th>written</th><th>guessed</th></tr></thead>';
      const b = el('tbody');
      for (const r of pick) {
        const ok = r.predicted === r.year;
        const link = el('a', { href: `https://bsky.app/profile/minormobius.bsky.social/post/${r.rkey}`, text: r.created || r.year });
        b.append(el('tr', {},
          el('td', {}, el('blockquote', { class: 'post', text: r.text })),
          el('td', {}, link),
          el('td', {}, el('span', { class: ok ? 'ok' : 'no', text: `${r.predicted ?? 'error'} ${ok ? '✓' : '✗'}` }))));
      }
      t.append(b);
      document.getElementById('era-samples').append(t, el('p', { class: 'row-sub', text: `${modelName(best.model)}, ${cell?.tasks?.era?.rows?.gepa ? 'after GEPA' : 'zero-shot'} — four right, four wrong, in held-out order.` }));
    });
  }
}
