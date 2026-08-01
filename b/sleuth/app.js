// app.js — sleuth's view layer.
//
// Ported from photo's `Sleuth.jsx` + `Dossier.jsx`, which is where this lived
// while it was filed as an image tool. `b` has no build step, so the components
// became plain DOM. `./posts.js`, `./llm.js` and `./dossier.js` came across
// unchanged — none of them ever had a React import, which is why the port was
// an afternoon rather than a rewrite.
//
// THE KEY LIVES IN sessionStorage, AND THAT IS A DELIBERATE DOWNGRADE.
// It is bring-your-own: the key goes straight from this tab to the provider and
// never touches a server here. `localStorage` would keep it forever on an
// origin that loads third-party code; `sessionStorage` dies with the tab, which
// bounds the exposure to one session. The settings panel says so out loud
// rather than leaving it to be discovered. (On `photo` the reason was a
// CDN-loaded DuckDB; there is no such load here, and the answer is the same
// anyway — a durable secret wants a durable reason.)
//
// NO EMBEDDINGS. Search is TF-IDF over the posts in `./posts.js`, computed in
// the tab. It is instant, free, needs no key, and the retrieved posts are what
// get handed to the model as context — so the whole tool works with no key at
// all, and a key only adds the answering.

import { resolveHandle } from '../lib/identity.js';
import { TextIndex, fetchRecentPosts } from './posts.js';
import { buildRAGMessages, detectProvider, getProviders, streamChat } from './llm.js';
import { generateDossier } from './dossier.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const index = new TextIndex();
const state = {
  handle: '', did: '', loaded: false, busy: false,
  chat: [], streaming: false,
  key: sessionStorage.getItem('sleuth_api_key') || '',
  provider: sessionStorage.getItem('sleuth_provider') || '',
};

// ───────────────────────────────────────────────────────── the corpus ──

async function loadPosts(raw) {
  const handle = String(raw || '').replace(/^@/, '').trim();
  if (!handle || state.busy) return;

  state.busy = true;
  state.loaded = false;
  state.chat = [];
  $('#out').innerHTML = '';
  $('#error').hidden = true;
  say('resolving…');

  try {
    const { did, pdsUrl } = await resolveHandle(handle);
    state.did = did;
    state.handle = handle;

    const posts = await fetchRecentPosts(pdsUrl, did, {
      maxPosts: 1000,
      onProgress: ({ fetched, calls }) => say(`fetching… ${fetched} posts, ${calls} calls`),
    });
    index.build(posts);
    state.loaded = true;
    say(`${posts.length.toLocaleString()} posts indexed — ask anything`);
    history.replaceState(null, '', `${location.pathname}?u=${encodeURIComponent(handle)}`);
    renderControls();
  } catch (err) {
    say('');
    fail(err.message);
  } finally {
    state.busy = false;
    $('#go').disabled = false;
  }
}

const say = (text) => {
  $('#status').textContent = text;
  $('#status').hidden = !text;
  $('#go').disabled = state.busy;
};

function fail(message) {
  const box = $('#error');
  box.textContent = message;
  box.hidden = false;
}

// ───────────────────────────────────────────────────────── search/ask ──

function ask(question) {
  const q = String(question || '').trim();
  if (!q || !state.loaded) return;
  const hits = index.search(q, state.key ? 15 : 20);

  if (!state.key) { renderHits(hits, q); return; }

  const messages = buildRAGMessages(q, hits, state.chat);
  state.chat.push({ role: 'user', content: q });
  renderChat(hits);
  streamAnswer(messages);
}

async function streamAnswer(messages) {
  state.streaming = true;
  const bubble = el('div', 'bubble assistant');
  $('#chat').appendChild(bubble);
  let full = '';
  try {
    for await (const chunk of streamChat({ provider: state.provider, apiKey: state.key, messages })) {
      full += chunk;
      bubble.textContent = full;
      bubble.scrollIntoView({ block: 'end' });
    }
    state.chat.push({ role: 'assistant', content: full });
  } catch (err) {
    bubble.className = 'bubble assistant err';
    bubble.textContent = `${err.message}`;
  } finally {
    state.streaming = false;
  }
}

function renderChat(hits) {
  const chat = $('#chat');
  chat.innerHTML = '';
  for (const turn of state.chat) {
    chat.appendChild(el('div', `bubble ${turn.role}`, turn.content));
  }
  if (hits?.length) chat.appendChild(citations(hits));
}

function citations(hits) {
  const box = el('details', 'cites');
  box.appendChild(el('summary', null, `${hits.length} posts used as context`));
  for (const h of hits) box.appendChild(postLine(h));
  return box;
}

function renderHits(hits, query) {
  const out = $('#out');
  out.innerHTML = '';
  if (!hits.length) {
    out.appendChild(el('p', 'muted', `nothing matches “${query}”.`));
    return;
  }
  out.appendChild(el('div', 'stats', `${hits.length} posts`));
  for (const h of hits) out.appendChild(postLine(h));
}

function postLine(hit) {
  const doc = hit.doc || hit;
  const row = el('div', 'hit');
  const when = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '';
  const a = el('a', 'hit-when', when || 'open');
  a.href = doc.url || `https://bsky.app/profile/${doc.did}/post/${doc.rkey}`;
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  row.appendChild(a);
  row.appendChild(el('div', 'hit-text', doc.text || ''));
  return row;
}

// ───────────────────────────────────────────────────────────── dossier ──

async function buildDossier() {
  if (!state.loaded) return;
  if (!state.key) { fail('a dossier needs your own API key — open settings'); return; }
  $('#error').hidden = true;
  const out = $('#out');
  out.innerHTML = '';
  say('reading the whole timeline…');

  try {
    const data = await generateDossier({
      docs: index.docs,
      handle: state.handle,
      streamChat,
      provider: state.provider,
      apiKey: state.key,
      onProgress: ({ detail }) => say(detail),
    });
    say('');
    out.appendChild(renderDossier(data));
  } catch (err) {
    say('');
    fail(`dossier failed — ${err.message}`);
  }
}

function renderDossier(data) {
  const { handle, temporalStats: t, themes = [], arcs = [], profile = {} } = data;
  const root = el('div', 'dossier');

  const head = el('header', 'dossier-head');
  head.appendChild(el('div', 'dossier-handle', `@${handle}`));
  if (profile.tagline) head.appendChild(el('div', 'dossier-tagline', profile.tagline));
  head.appendChild(el('div', 'muted',
    `${(t?.totalPosts || 0).toLocaleString()} posts · ${t?.firstPost} — ${t?.lastPost}`));
  root.appendChild(head);

  if (profile.personality_traits?.length) {
    const s = section('personality');
    for (const trait of profile.personality_traits) {
      const item = el('div', 'trait');
      const row = el('div', 'trait-row');
      row.appendChild(el('span', 'trait-name', trait.trait));
      row.appendChild(el('span', 'muted', `${Math.round((trait.strength || 0.5) * 100)}%`));
      item.appendChild(row);
      const bar = el('div', 'bar');
      const fill = el('div', 'bar-fill');
      fill.style.width = `${(trait.strength || 0.5) * 100}%`;
      bar.appendChild(fill);
      item.appendChild(bar);
      if (trait.evidence) item.appendChild(el('div', 'muted small', trait.evidence));
      s.appendChild(item);
    }
    root.appendChild(s);
  }

  if (arcs.length) {
    const s = section('narrative arcs');
    for (const arc of arcs) s.appendChild(renderArc(arc));
    root.appendChild(s);
  }

  if (profile.interests_ranked?.length) {
    const s = section('interests');
    const list = el('div', 'chips');
    for (const i of profile.interests_ranked) {
      list.appendChild(el('span', 'chip', `${i.interest}${i.depth ? ` · ${i.depth}` : ''}`));
    }
    s.appendChild(list);
    root.appendChild(s);
  }

  for (const [title, rows, titleKey, bodyKey] of [
    ['strengths', profile.strengths, 'strength', 'evidence'],
    ['blind spots', profile.blind_spots, 'area', 'observation'],
  ]) {
    if (!rows?.length) continue;
    const s = section(title);
    for (const r of rows) {
      const item = el('div', 'trait');
      item.appendChild(el('div', 'trait-name', r[titleKey]));
      item.appendChild(el('div', 'muted small', r[bodyKey]));
      s.appendChild(item);
    }
    root.appendChild(s);
  }

  if (profile.communication_style) {
    const s = section('communication style');
    s.appendChild(el('p', null, profile.communication_style));
    root.appendChild(s);
  }
  if (profile.surprising_finding) {
    const s = section('unexpected');
    s.appendChild(el('p', null, profile.surprising_finding));
    root.appendChild(s);
  }

  root.appendChild(el('div', 'muted small',
    `${themes.length} themes · ${arcs.length} arcs · generated in your browser by ${state.provider}`));
  return root;
}

function renderArc(arc) {
  const box = el('div', 'arc');
  const head = el('div', 'arc-head');
  head.appendChild(el('span', 'trait-name', arc.arc_title || 'arc'));
  if (arc.arc_type) head.appendChild(el('span', 'muted small', arc.arc_type.replace(/_/g, ' ')));
  box.appendChild(head);

  const posts = arc._posts || [];
  const phase = (label, text, citations) => {
    if (!text) return;
    const row = el('div', 'arc-phase');
    row.appendChild(el('span', 'arc-label', label));
    const body = el('span', null, `${text} `);
    // The citations are the point of the arc: a claim about somebody's life,
    // linked back to the post it came from.
    for (const n of citations || []) {
      const post = posts[n - 1];
      if (!post?.url) { body.appendChild(document.createTextNode(`[${n}]`)); continue; }
      const a = el('a', 'cite', `[${n}]`);
      a.href = post.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      body.appendChild(a);
    }
    row.appendChild(body);
    box.appendChild(row);
  };

  phase('origin', arc.origin?.summary, arc.origin?.citations);
  phase('evolution', arc.evolution?.summary, arc.evolution?.citations);
  for (const shift of arc.key_shifts || []) phase('shift', shift.summary, shift.citations);
  phase('now', arc.current_state?.summary, arc.current_state?.citations);
  return box;
}

const section = (title) => {
  const s = el('section', 'dossier-section');
  s.appendChild(el('h2', null, title));
  return s;
};

// ──────────────────────────────────────────────────────────── controls ──

function renderControls() {
  $('#tools').hidden = !state.loaded;
  $('#ask').placeholder = state.key
    ? `ask about @${state.handle}…`
    : `search @${state.handle}'s posts…`;
  $('#dossier').disabled = !state.key;
  $('#dossier').title = state.key ? '' : 'needs your own API key';
}

function renderSettings() {
  // getProviders() returns the table keyed by id, not a list.
  const sel = $('#provider');
  sel.innerHTML = '';
  for (const [id, p] of Object.entries(getProviders())) {
    const o = el('option', null, p.name);
    o.value = id;
    sel.appendChild(o);
  }
  if (state.provider) sel.value = state.provider;
  $('#key').value = state.key;
}

$('#settings-toggle').onclick = () => {
  const box = $('#settings');
  box.hidden = !box.hidden;
  if (!box.hidden) renderSettings();
};

$('#key').oninput = () => {
  state.key = $('#key').value.trim();
  if (state.key) {
    sessionStorage.setItem('sleuth_api_key', state.key);
    const detected = detectProvider(state.key);
    if (detected) {
      state.provider = detected;
      sessionStorage.setItem('sleuth_provider', detected);
      $('#provider').value = detected;
    }
  } else {
    sessionStorage.removeItem('sleuth_api_key');
  }
  renderControls();
};

$('#provider').onchange = () => {
  state.provider = $('#provider').value;
  sessionStorage.setItem('sleuth_provider', state.provider);
};

$('#forget').onclick = () => {
  state.key = '';
  sessionStorage.removeItem('sleuth_api_key');
  sessionStorage.removeItem('sleuth_provider');
  $('#key').value = '';
  renderControls();
};

$('#form').addEventListener('submit', (e) => { e.preventDefault(); loadPosts($('#handle').value); });
$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#ask').value;
  $('#ask').value = '';
  ask(q);
});
$('#dossier').onclick = buildDossier;

if (window.attachHandleTypeahead) {
  window.attachHandleTypeahead($('#handle'), { onPick: (a) => loadPosts(a.handle) });
}

const initial = new URLSearchParams(location.search).get('u');
if (initial) { $('#handle').value = initial; loadPosts(initial); }
renderControls();
