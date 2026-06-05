// feedgen builder UI — assemble a block pipeline, preview it live against the
// public Bluesky AppView. The pipeline object IS the future atproto record;
// "definition" shows it verbatim. Publishing (OAuth → write record → serving
// worker) is slice 2.
import { AuthClient } from './auth.js';

const auth = new AuthClient();
let user = null;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ── state: the feed definition ──────────────────────────────────────────────
const def = {
  name: 'My feed',
  description: '',
  inputs: [{ type: 'author', actor: 'bsky.app', filter: 'posts_no_replies' }],
  filters: [],
  sort: { type: 'latest' },
  limit: 40,
};

const INPUT_DEFAULTS = {
  search: () => ({ type: 'search', q: '', sort: 'latest' }),
  list:   () => ({ type: 'list', uri: '' }),
  author: () => ({ type: 'author', actor: '', filter: 'posts_no_replies' }),
};
const FILTER_DEFAULTS = {
  regex:         () => ({ type: 'regex', mode: 'include', pattern: '' }),
  media:         () => ({ type: 'media', has: 'image' }),
  lang:          () => ({ type: 'lang', code: 'en' }),
  removeReplies: () => ({ type: 'removeReplies' }),
  removeReposts: () => ({ type: 'removeReposts' }),
  minLikes:      () => ({ type: 'minLikes', n: 5 }),
};

// ── auth (shared mino.mobi OAuth worker, auth.mino.mobi) ─────────────────────
async function initAuth() {
  try { user = await auth.init(); } catch { user = null; }
  renderAuth();
}
function renderAuth() {
  const host = $('fg-auth');
  if (!host) return;
  host.textContent = '';
  if (user) {
    host.innerHTML = `<span class="fg-who">🦋 @${esc(user.handle || user.did || '')}</span><button id="fg-signout" class="fg-authbtn ghost">sign out</button>`;
    $('fg-signout').addEventListener('click', async () => { await auth.logout(); user = null; renderAuth(); });
  } else {
    host.innerHTML = `<button id="fg-signin" class="fg-authbtn">sign in with Bluesky</button>`;
    $('fg-signin').addEventListener('click', signinFlow);
  }
  renderPublish();
}

// ── publish: write the definition + the feed.generator record to the PDS ─────
function renderPublish() {
  const host = $('fg-publish');
  if (!host) return;
  if (!user) {
    host.innerHTML = 'Sign in (top-right) to publish this feed to your PDS as a real, installable Bluesky feed.';
    return;
  }
  host.innerHTML = `<button id="fg-publish-btn" class="fg-pubbtn">⬆ publish to Bluesky</button><span id="fg-publish-msg" class="fg-pubmsg"></span>`;
  $('fg-publish-btn').addEventListener('click', publish);
}
async function publish() {
  const btn = $('fg-publish-btn'), msg = $('fg-publish-msg');
  if (!def.inputs || !def.inputs.length) { msg.textContent = ' add at least one input first'; return; }
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'publishing…'; msg.textContent = '';
  try {
    const now = new Date().toISOString();
    const defRes = await auth.pds.createRecord('com.minomobi.feedgen.def', { $type: 'com.minomobi.feedgen.def', ...def, createdAt: now });
    const rkey = (defRes.uri || '').split('/').pop();
    await auth.pds.putRecord('app.bsky.feed.generator', rkey, {
      $type: 'app.bsky.feed.generator',
      did: 'did:web:b.mino.mobi',
      displayName: (def.name || 'feedgen feed').slice(0, 240),
      description: ((def.description ? def.description + '\n\n' : '') + 'built with b.mino.mobi/feedgen').slice(0, 300),
      createdAt: now,
    });
    const feedUrl = `https://bsky.app/profile/${user.did}/feed/${rkey}`;
    msg.innerHTML = ` ✓ published — <a href="${esc(feedUrl)}" target="_blank" rel="noopener">open your feed ↗</a>`;
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (/40[13]|scope|insufficient|forbidden|not.*allowed/i.test(m)) {
      msg.innerHTML = ' needs the publish scope — <a href="#" id="fg-reauth">sign out &amp; back in</a> to grant it.';
      const r = document.getElementById('fg-reauth');
      if (r) r.addEventListener('click', async (ev) => { ev.preventDefault(); await auth.logout(); user = null; renderAuth(); signinFlow(); });
    } else {
      msg.textContent = ' publish failed: ' + m;
    }
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}
function signinFlow() {
  const host = $('fg-auth');
  host.innerHTML = `<input id="fg-handle" class="fg-input" placeholder="you.bsky.social" autocomplete="username" spellcheck="false" autocapitalize="none" style="width:160px"><button id="fg-go" class="fg-authbtn">go</button><button id="fg-cancel" class="fg-authbtn ghost">cancel</button>`;
  const h = $('fg-handle'); h.focus();
  const go = async () => {
    const handle = h.value.trim(); if (!handle) return;
    $('fg-go').textContent = '…';
    try { await auth.login(handle); }
    catch (e) { alert('Login failed: ' + (e.message || e)); renderAuth(); }
  };
  $('fg-go').addEventListener('click', go);
  h.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('fg-cancel').addEventListener('click', renderAuth);
}

// ── small field helpers ─────────────────────────────────────────────────────
function field(label, input) {
  const w = el('label', 'fg-field');
  w.append(el('span', 'fg-flabel', label), input);
  return w;
}
function textInput(val, onset, ph) {
  const i = el('input', 'fg-input'); i.type = 'text'; i.value = val || ''; if (ph) i.placeholder = ph;
  i.addEventListener('input', () => onset(i.value));
  return i;
}
function numInput(val, onset) {
  const i = el('input', 'fg-input fg-num'); i.type = 'number'; i.min = '0'; i.value = val;
  i.addEventListener('input', () => onset(parseInt(i.value || '0', 10)));
  return i;
}
function select(opts, val, onset) {
  const s = el('select', 'fg-input');
  for (const [v, label] of opts) { const o = el('option'); o.value = v; o.textContent = label; if (v === val) o.selected = true; s.append(o); }
  s.addEventListener('change', () => onset(s.value));
  return s;
}
function card(title, body, onRemove) {
  const c = el('div', 'fg-card');
  const head = el('div', 'fg-card-head');
  head.append(el('span', 'fg-card-title', title));
  const rm = el('button', 'fg-x', '✕'); rm.type = 'button'; rm.title = 'remove'; rm.addEventListener('click', onRemove);
  head.append(rm);
  c.append(head, body);
  return c;
}

// ── render the editor from `def` ────────────────────────────────────────────
function renderInputs() {
  const host = $('fg-inputs'); host.textContent = '';
  def.inputs.forEach((inp, i) => {
    const body = el('div', 'fg-card-body');
    if (inp.type === 'search') {
      body.append(
        field('search for', textInput(inp.q, (v) => inp.q = v, 'keyword, phrase, #hashtag')),
        field('order', select([['latest', 'latest'], ['top', 'top']], inp.sort, (v) => inp.sort = v)),
        el('div', 'fg-note', '🔒 search needs sign-in — coming in slice 2'),
      );
    } else if (inp.type === 'list') {
      body.append(field('list uri', textInput(inp.uri, (v) => inp.uri = v, 'at://did:plc:…/app.bsky.graph.list/…')));
    } else if (inp.type === 'author') {
      body.append(
        field('author', textInput(inp.actor, (v) => inp.actor = v, 'handle.bsky.social or did:…')),
        field('include', select([['posts_no_replies', 'posts'], ['posts_with_replies', 'posts + replies'], ['posts_with_media', 'media only']], inp.filter, (v) => inp.filter = v)),
      );
    }
    host.append(card(`input · ${inp.type}`, body, () => { def.inputs.splice(i, 1); renderInputs(); }));
  });
}

function renderFilters() {
  const host = $('fg-filters'); host.textContent = '';
  def.filters.forEach((f, i) => {
    const body = el('div', 'fg-card-body');
    let title = `filter · ${f.type}`;
    if (f.type === 'regex') {
      title = 'filter · regex';
      body.append(
        field('mode', select([['include', 'keep if matches'], ['exclude', 'drop if matches']], f.mode, (v) => f.mode = v)),
        field('pattern', textInput(f.pattern, (v) => f.pattern = v, 'e.g. \\b(art|sketch)\\b')),
      );
    } else if (f.type === 'media') {
      body.append(field('must have', select([['image', 'image'], ['video', 'video'], ['link', 'link'], ['quote', 'quote']], f.has, (v) => f.has = v)));
    } else if (f.type === 'lang') {
      body.append(field('language', textInput(f.code, (v) => f.code = v, 'en, ja, pt …')));
    } else if (f.type === 'minLikes') {
      body.append(field('min likes', numInput(f.n, (v) => f.n = v)));
    } else if (f.type === 'removeReplies') {
      body.append(el('div', 'fg-note', 'drops replies — top-level posts only'));
    } else if (f.type === 'removeReposts') {
      body.append(el('div', 'fg-note', 'drops reposts from list / author inputs'));
    }
    host.append(card(title, body, () => { def.filters.splice(i, 1); renderFilters(); }));
  });
}

function renderMeta() {
  $('fg-name').value = def.name;
  $('fg-sort').value = def.sort.type;
  $('fg-limit').value = def.limit;
  $('fg-def').textContent = JSON.stringify(def, null, 2);
}

function renderAll() { renderInputs(); renderFilters(); renderMeta(); }

// ── preview ─────────────────────────────────────────────────────────────────
const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function bskyUrl(post) {
  const rkey = (post.uri || '').split('/').pop();
  const handle = post.author && (post.author.handle || post.author.did);
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}
function renderPost(post) {
  const a = post.author || {};
  const rec = post.record || {};
  const av = a.avatar ? `<img class="fg-av" src="${esc(a.avatar)}" alt="" loading="lazy">` : '<span class="fg-av fg-av-empty"></span>';
  const when = rec.createdAt ? new Date(rec.createdAt).toLocaleString() : '';
  return `<a class="fg-post" href="${esc(bskyUrl(post))}" target="_blank" rel="noopener">
    ${av}
    <div class="fg-post-main">
      <div class="fg-post-head"><b>${esc(a.displayName || a.handle || '')}</b> <span class="fg-handle">@${esc(a.handle || '')}</span> <span class="fg-when">${esc(when)}</span></div>
      <div class="fg-post-text">${esc(rec.text || '')}</div>
      <div class="fg-post-meta">♥ ${post.likeCount || 0} · ⇄ ${post.repostCount || 0} · 💬 ${post.replyCount || 0}</div>
    </div>
  </a>`;
}

let running = false;
async function runPreview() {
  if (running) return;
  running = true;
  renderMeta();
  const out = $('fg-preview');
  out.innerHTML = '<div class="fg-status">running…</div>';
  try {
    const res = await fetch('/api/feedgen/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ def }) });
    if (!res.ok) throw new Error('preview HTTP ' + res.status);
    const { posts, errors, candidateCount } = await res.json();
    let head = `<div class="fg-status">${posts.length} post${posts.length === 1 ? '' : 's'} · ${candidateCount} matched candidates`;
    if (errors.length) head += ` · <span class="fg-err">${esc(errors.join('; '))}</span>`;
    head += '</div>';
    out.innerHTML = head + (posts.length ? posts.map(renderPost).join('') : '<div class="fg-status">no posts — loosen the filters or change the input</div>');
  } catch (e) {
    out.innerHTML = `<div class="fg-status fg-err">preview failed: ${esc(e.message || String(e))}</div>`;
  } finally {
    running = false;
  }
}

// ── wire toolbar ────────────────────────────────────────────────────────────
function init() {
  initAuth();
  $('fg-add-input').addEventListener('change', (e) => {
    const t = e.target.value; e.target.value = '';
    if (INPUT_DEFAULTS[t]) { def.inputs.push(INPUT_DEFAULTS[t]()); renderInputs(); }
  });
  $('fg-add-filter').addEventListener('change', (e) => {
    const t = e.target.value; e.target.value = '';
    if (FILTER_DEFAULTS[t]) { def.filters.push(FILTER_DEFAULTS[t]()); renderFilters(); }
  });
  $('fg-name').addEventListener('input', (e) => def.name = e.target.value);
  $('fg-sort').addEventListener('change', (e) => def.sort.type = e.target.value);
  $('fg-limit').addEventListener('input', (e) => def.limit = Math.max(1, Math.min(100, parseInt(e.target.value || '40', 10))));
  $('fg-run').addEventListener('click', runPreview);
  $('fg-def-toggle').addEventListener('click', () => $('fg-def-wrap').classList.toggle('open'));
  renderAll();
  runPreview();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
