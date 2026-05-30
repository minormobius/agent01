// io.mino.mobi — board rendering. Reads /api/tickets and lays tickets out in
// status columns. Used by both the front-page preview and the full /board page.

const COLUMNS = [
  { key: 'new', label: 'New' },
  { key: 'triaged', label: 'Triaged' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'wontfix', label: "Won't fix" },
];

export async function fetchTickets(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const res = await fetch('/api/tickets?' + params.toString());
  if (!res.ok) return [];
  const data = await res.json();
  return data.tickets || [];
}

export function renderBoard(container, tickets, opts = {}) {
  const search = (opts.search || '').toLowerCase();
  const filtered = search
    ? tickets.filter((t) =>
        (t.title || '').toLowerCase().includes(search) ||
        (t.body || '').toLowerCase().includes(search) ||
        (t.site || '').toLowerCase().includes(search) ||
        (t.repo || '').toLowerCase().includes(search))
    : tickets;

  container.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'board';

  for (const col of COLUMNS) {
    const items = filtered.filter((t) => (t.status || 'new') === col.key);
    const colEl = document.createElement('div');
    colEl.className = 'col';
    const h = document.createElement('h3');
    h.innerHTML = `<span>${col.label}</span><span class="n">${items.length}</span>`;
    colEl.appendChild(h);
    for (const t of items) colEl.appendChild(ticketCard(t, opts));
    if (!items.length) {
      const e = document.createElement('div');
      e.className = 'empty'; e.textContent = '—';
      colEl.appendChild(e);
    }
    board.appendChild(colEl);
  }
  container.appendChild(board);

  if (!filtered.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'No tickets yet. Be the first — file one above.';
    container.appendChild(e);
  }
}

function ticketCard(t, opts) {
  const el = document.createElement('div');
  el.className = 'ticket';
  const kind = t.kind || 'idea';
  const swept = t.source_kind === 'swept';
  el.innerHTML =
    `<div class="t-meta">
       <span class="chip ${kind}">${kind}</span>
       ${t.severity ? `<span class="chip">${t.severity}</span>` : ''}
       ${swept ? '<span class="chip swept">swept</span>' : ''}
     </div>
     <div class="t-title"></div>
     <div class="t-meta">
       ${t.site ? `<span class="t-site">${escapeHtml(t.site)}</span>` : ''}
       ${t.author_handle ? `<span>@${escapeHtml(t.author_handle)}</span>` : ''}
       <span>${fmtDate(t.created_at)}</span>
     </div>`;
  el.querySelector('.t-title').textContent = t.title || '(untitled)';
  el.addEventListener('click', () => (opts.onClick ? opts.onClick(t) : showTicket(t)));
  return el;
}

function showTicket(t) {
  const lines = [
    t.title || '(untitled)',
    '',
    `kind: ${t.kind}${t.severity ? '  severity: ' + t.severity : ''}`,
    t.site ? `site: ${t.site}` : '',
    t.url ? `url: ${t.url}` : '',
    t.repo ? `repo: ${t.repo}` : '',
    t.author_handle ? `by: @${t.author_handle}` : '',
    '',
    t.body || '',
  ].filter((l) => l !== '' || true);
  alert(lines.join('\n'));
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
