// spec/app.js — renderer for the site-wide spec sheet.
// Merges the generated layer (spec/data.js -> window.SPEC_DATA) with the
// hand-authored layer (spec/curated.js -> window.SPEC_CURATED), then runs a
// client-side reachability probe over every public endpoint.
(function () {
  'use strict';
  const D = window.SPEC_DATA, C = window.SPEC_CURATED;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---------------------------------------------------------------- merge --
  const famOf = (s) => C.families[s.surface] || 'platform';
  const surfaces = D.surfaces.map((s) => ({
    ...s,
    family: famOf(s),
    bestDesc: C.descOverrides[s.surface] || s.desc || null,
  }));
  const byFam = new Map(C.familyOrder.map((f) => [f.id, []]));
  for (const s of surfaces) (byFam.get(s.family) || byFam.get('platform')).push(s);

  // unique probe targets: host -> { url, surfaces:[], pending }
  const targets = new Map();
  for (const s of surfaces) {
    for (const h of s.hosts) {
      if (!targets.has(h)) targets.set(h, { host: h, path: C.healthPaths[h] || '/', surfaces: [], pending: false });
      const t = targets.get(h);
      t.surfaces.push(s.surface);
      t.pending = t.pending || s.pending;
    }
  }

  // ---------------------------------------------------------------- header --
  const featCount = surfaces.reduce((n, s) => n + s.features.length, 0);
  $('stamp').textContent = `generated from commit ${D.generated.commit} · ${D.generated.date}` +
    (D.probe ? ` · endpoints last verified ${D.probe.at} (HTTP status from CI/sandbox)` : '');
  $('counts').innerHTML = [
    [surfaces.length, 'deploy surfaces'],
    [targets.size, 'public endpoints'],
    [featCount + surfaces.length, 'catalogued pages'],
    [C.familyOrder.length, 'families'],
    [(D.unmanaged?.reference_workers?.length || 0) + (D.unmanaged?.in_progress?.length || 0), 'unmanaged workers'],
  ].map(([n, l]) => `<div><b>${n}</b>${l}</div>`).join('');

  // ----------------------------------------------------------- capabilities --
  const capCol = (list, cls) => `<div class="${cls}">` + list.map((g) =>
    `<h4>${esc(g.head)}</h4><ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('') + '</div>';
  $('caps').innerHTML = capCol(C.capabilities.can, 'can') + capCol(C.capabilities.cant, 'cant');

  // ---------------------------------------------------------------- probing --
  // Browser probe is reachability-only: a no-cors fetch resolves opaquely for
  // ANY response (200/404/500 alike) and rejects only on DNS/TLS/socket
  // failure. The baked snapshot (data.js probe) carries real HTTP codes.
  const probeState = new Map(); // host -> 'ok' | 'bad' | 'pending-probe'
  function bakedCode(host) { return D.probe?.results?.[host]?.code; }
  function dotFor(host, pending) {
    const live = probeState.get(host);
    const code = bakedCode(host);
    let cls = 'dim', title = 'not probed';
    if (live === 'ok') { cls = 'ok'; title = 'responding (live probe)'; }
    else if (live === 'bad') { cls = 'bad'; title = 'unreachable (live probe)'; }
    else if (code != null) { cls = code === 0 ? 'bad' : 'ok'; title = code === 0 ? `unreachable at last verify` : `HTTP ${code} at last verify`; }
    if (pending && cls !== 'ok') { cls = 'warn'; title = 'domain pending attach'; }
    return `<span class="dot ${cls}" data-host="${esc(host)}" title="${esc(host)}: ${title}"></span>`;
  }
  function refreshDots() {
    document.querySelectorAll('.dot[data-host]').forEach((el) => {
      const host = el.dataset.host;
      const t = targets.get(host);
      const tmp = document.createElement('span');
      tmp.innerHTML = dotFor(host, t?.pending);
      el.className = tmp.firstChild.className;
      el.title = tmp.firstChild.title;
    });
    renderBoard();
  }
  async function probeHost(t) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      await fetch(`https://${t.host}${t.path}`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
      probeState.set(t.host, 'ok');
    } catch { probeState.set(t.host, 'bad'); }
    clearTimeout(timer);
  }
  let probing = false;
  async function probeAll() {
    if (probing) return; probing = true; renderBoard();
    const queue = [...targets.values()];
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) { await probeHost(queue.shift()); refreshDots(); }
    });
    await Promise.all(workers);
    probing = false; refreshDots();
  }
  function renderBoard() {
    const total = targets.size;
    const probed = [...targets.keys()].filter((h) => probeState.has(h));
    const up = probed.filter((h) => probeState.get(h) === 'ok').length;
    const down = probed.filter((h) => probeState.get(h) === 'bad');
    const baked = D.probe ? Object.entries(D.probe.results) : [];
    const bakedDown = baked.filter(([, r]) => r.code === 0 || r.code >= 500).map(([h]) => h);
    let html = '';
    if (probed.length) {
      html += `<span class="dot ${down.length ? 'warn' : 'ok'}"></span> live probe: <b>${up}/${probed.length}</b> endpoints responding` +
        (down.length ? ` — unreachable: ${down.map(esc).join(', ')}` : '') + '<br>';
    }
    if (D.probe) html += `last verified snapshot (${D.probe.at}): ${baked.length - bakedDown.length}/${baked.length} healthy` +
      (bakedDown.length ? ` — down: ${bakedDown.map(esc).join(', ')}` : '');
    html += ` <button id="reprobe">${probing ? 'probing…' : probed.length ? 're-probe from this browser' : 'probe from this browser'}</button>`;
    html += `<br><span style="color:var(--dim)">browser probes prove reachability only (opaque no-cors); the snapshot carries HTTP codes. API workers are probed at their health paths.</span>`;
    $('board').innerHTML = html;
    $('reprobe').onclick = probeAll;
    // findings box
    const f = $('findings');
    if (bakedDown.length || down.length) {
      const items = [...new Set([...bakedDown, ...down])].map((h) => {
        const owners = targets.get(h)?.surfaces.join(', ') || '?';
        const pend = targets.get(h)?.pending ? ' (expected — domain pending attach)' : '';
        return `<li><code>${esc(h)}</code> — surface: ${esc(owners)}${pend}</li>`;
      }).join('');
      f.hidden = false;
      f.innerHTML = `<b>attention</b><ul class="feats">${items}</ul>`;
    }
  }

  // ------------------------------------------------------------ index table --
  const chipRow = (s) => {
    const w = s.wrangler || {};
    const chips = [];
    chips.push(`<span class="chip dim">${esc(s.type)}</span>`);
    for (const d of w.d1 || []) chips.push(`<span class="chip">d1:${esc(d)}</span>`);
    for (const o of w.durableObjects || []) chips.push(`<span class="chip">do:${esc(o)}</span>`);
    for (const k of w.kv || []) chips.push(`<span class="chip">kv:${esc(k)}</span>`);
    if (w.ai) chips.push('<span class="chip">workers-ai</span>');
    if ((w.crons || []).length) chips.push(`<span class="chip">cron×${w.crons.length}</span>`);
    for (const t of s.tags || []) chips.push(`<span class="chip dim">${esc(t)}</span>`);
    return chips.join('');
  };
  function renderIndex() {
    let rows = '<table class="idx"><tr><th></th><th>surface</th><th>endpoint</th><th>stack</th><th>owning branch</th></tr>';
    for (const f of C.familyOrder) {
      const list = byFam.get(f.id) || [];
      if (!list.length) continue;
      rows += `<tr class="fam"><td colspan="5">${esc(f.label)} (${list.length})</td></tr>`;
      for (const s of list) {
        const dots = s.hosts.length ? s.hosts.map((h) => dotFor(h, s.pending)).join(' ') : '<span class="chip dim">internal</span>';
        const eps = s.hosts.length
          ? s.hosts.map((h) => `<a href="https://${esc(h)}${esc(C.healthPaths[h] ? '' : '/')}">${esc(h)}</a>`).join('<br>')
          : `<code>${esc(s.endpoint)}</code>`;
        rows += `<tr><td>${dots}</td><td><a href="#s-${esc(s.surface)}"><b>${esc(s.surface)}</b></a></td>` +
          `<td style="font-family:var(--mono);font-size:.72rem">${eps}</td>` +
          `<td>${chipRow(s)}</td><td><code style="font-size:.68rem">${esc(s.branch)}</code></td></tr>`;
      }
    }
    $('idx').innerHTML = rows + '</table>';
  }

  // ---------------------------------------------------------------- sheets --
  const gh = (p) => `https://github.com/minormobius/agent01/blob/main/${p}`;
  function techRow(dt, dd) { return dd ? `<dt>${dt}</dt><dd>${dd}</dd>` : ''; }
  function sheet(s) {
    const w = s.wrangler || {};
    const eps = s.hosts.length
      ? s.hosts.map((h) => `${dotFor(h, s.pending)} <a href="https://${esc(h)}/">${esc(h)}</a>`).join(' · ')
      : `<span class="chip dim">internal worker — no public domain</span> <code>${esc(s.endpoint)}</code>`;
    const feats = s.features.length ? `<ul class="feats">` + s.features.map((f) =>
      `<li><a href="${esc(f.url)}">${esc(f.name)}</a>${f.parent ? ` <span>· under ${esc(f.parent)}</span>` : ''}${f.desc ? ` <span>— ${esc(f.desc)}</span>` : ''}</li>`).join('') + '</ul>' : '';
    const bindings = [
      ...(w.d1 || []).map((x) => `D1 <code>${esc(x)}</code>`),
      ...(w.durableObjects || []).map((x) => `DO <code>${esc(x)}</code>`),
      ...(w.kv || []).map((x) => `KV <code>${esc(x)}</code>`),
      ...(w.ai ? ['Workers AI'] : []),
      ...(w.crons || []).map((x) => `cron <code>${esc(x)}</code>`),
    ].join(' · ');
    const note = s.note && s.note !== s.bestDesc
      ? (s.note.length > 340
        ? `<details><summary>registry note (${s.note.length} chars)</summary><p class="note">${esc(s.note)}</p></details>`
        : `<p class="note">${esc(s.note)}</p>`)
      : '';
    const status = s.status
      ? `<details${/AUDIT|UNREACH|pending/i.test(s.status) ? ' open' : ''}><summary>status</summary><p class="note">${esc(s.status)}</p></details>` : '';
    return `<div class="sheet" id="s-${esc(s.surface)}" data-search="${esc((s.surface + ' ' + (s.bestDesc || '') + ' ' + (s.note || '') + ' ' + s.features.map((f) => f.name + ' ' + (f.desc || '')).join(' ')).toLowerCase())}">
      <div class="head"><h3>${esc(s.surface)}</h3><span class="eps">${eps}</span>
        ${s.age ? `<span class="chip dim">${esc(s.age)}${s.commits ? ` · ${s.commits} commits` : ''}</span>` : ''}
        ${s.pending ? '<span class="chip" style="color:var(--warn)">domain pending</span>' : ''}</div>
      ${s.bestDesc ? `<p class="desc">${esc(s.bestDesc)}</p>` : ''}
      ${note}
      ${feats ? `<details open><summary>features / sub-pages (${s.features.length})</summary>${feats}</details>` : ''}
      <dl class="tech">
        ${techRow('dir', `<code>${esc(s.dirs ? s.dirs.join(', ') : s.dir)}</code>`)}
        ${techRow('worker', w.name ? `<code>${esc(w.name)}</code>${w.config ? ` <span style="color:var(--muted)">(${esc(w.config)})</span>` : ''}` : (s.surface === 'root' ? 'Cloudflare Pages project <code>agent01</code>' : null))}
        ${techRow('compat', w.compat ? `<code>${esc(w.compat)}</code>${(w.flags || []).length ? ' + ' + w.flags.map((f) => `<code>${esc(f)}</code>`).join(', ') : ''}` : null)}
        ${techRow('bindings', bindings || null)}
        ${techRow('custom domains', (w.domains || []).length ? w.domains.map((d) => `<code>${esc(d)}</code>`).join(', ') : (s.hosts.length && w.name ? '<span style="color:var(--warn)">none declared in config — dashboard-attached (golden-rule risk)</span>' : null))}
        ${techRow('uses', s.uses.length ? s.uses.map(esc).join(', ') : null)}
        ${techRow('provides', s.provides ? esc(s.provides) : null)}
        ${techRow('serves (bundled)', s.serves ? s.serves.map(esc).join(', ') : null)}
        ${techRow('deploy', s.workflow ? `<a href="${gh('.github/workflows/' + s.workflow)}"><code>${esc(s.workflow)}</code></a> from <code>${esc(s.branch)}</code> (+ <code>${esc(D.trunk)}</code>)` : '<span style="color:var(--bad)">no workflow found</span>')}
      </dl>
      ${s.paths.length ? `<details><summary>deploy trigger paths (${s.paths.length})</summary><p class="note">${s.paths.map((p) => `<code>${esc(p)}</code>`).join(' ')}</p></details>` : ''}
      ${status}
    </div>`;
  }
  function renderSheets() {
    let html = '';
    for (const f of C.familyOrder) {
      const list = byFam.get(f.id) || [];
      if (!list.length) continue;
      html += `<h2 id="f-${esc(f.id)}">${esc(f.label)}</h2><p class="famblurb">${esc(f.blurb)}</p>`;
      html += list.map(sheet).join('');
    }
    $('sheets').innerHTML = html;
  }

  // ------------------------------------------------------------- unmanaged --
  const un = D.unmanaged || {};
  $('unmanaged-body').innerHTML =
    `<p>Reference workers with a wrangler config but no deploy workflow: ${(un.reference_workers || []).map((w) => `<code>${esc(w)}</code>`).join(', ') || '—'}.</p>` +
    `<p style="margin-top:.4rem">In progress: ${(un.in_progress || []).map(esc).join('; ') || '—'}</p>`;

  $('foot').innerHTML = `machine layer: <code>scripts/build-spec.mjs</code> over <code>deploy-registry.json</code> + <code>index.html</code> · curated layer: <code>spec/curated.js</code> · to regenerate: <code>node scripts/build-spec.mjs --probe --write</code>`;

  // ---------------------------------------------------------------- filter --
  $('filter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.sheet').forEach((el) => {
      el.style.display = !q || el.dataset.search.includes(q) ? '' : 'none';
    });
  });

  renderIndex();
  renderSheets();
  renderBoard();
  probeAll();
})();
