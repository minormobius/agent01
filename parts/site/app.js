// parts — the page. Reads from /api (the index), writes to the signed-in
// person's own repo through auth.mino.mobi, then asks the index to re-read
// that repo so the write shows up at once. Part details come from the CAD
// site's read gateway; the part itself opens in cad.mino.mobi.
import { AuthClient } from './vendor/auth.js';

const COMMUNITY = 'com.minomobi.cad.community', POST = 'com.minomobi.cad.post', COMMENT = 'com.minomobi.cad.comment', VOTE = 'com.minomobi.cad.vote';
const SCOPE = `atproto repo:${COMMUNITY} repo:${POST} repo:${COMMENT} repo:${VOTE}`;
const CAD = 'https://cad.mino.mobi';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const parseAt = (uri) => { const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)/.exec(uri || ''); return m ? { did: m[1], collection: m[2], rkey: m[3] } : null; };
const ago = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return `${Math.floor(s / 86400)} d ago`; };
const api = async (path, init) => { const r = await fetch(`/api/${path}`, init); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
const handles = new Map(); // did → handle, resolved lazily through the public API
async function handleOf(did) {
  if (handles.has(did)) return handles.get(did);
  const p = (async () => { try { const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${enc(did)}`); if (r.ok) return (await r.json()).handle; } catch {} return did.slice(0, 20) + '…'; })();
  handles.set(did, p); return p;
}

// ── auth ──────────────────────────────────────────────────────────────────
const auth = new AuthClient();
let me = null; let mine = {};
async function initAuth() {
  try { await auth.init(); } catch {}
  me = auth.getUser?.() || null;
  $('#who').textContent = me ? `@${me.handle}` : 'not signed in';
  $('#handle').hidden = !!me; $('#signin').hidden = !!me; $('#signout').hidden = !me;
  if (me) { try { mine = (await api(`mine?did=${enc(me.did)}`)).votes || {}; } catch { mine = {}; } }
}
$('#signin').addEventListener('click', async () => { const h = $('#handle').value.trim(); if (!h) return; try { await auth.login(h, { scope: SCOPE }); } catch (e) { alert(`sign-in failed: ${e.message}`); } });
$('#signout').addEventListener('click', async () => { try { await auth.logout(); } catch {} me = null; mine = {}; await initAuth(); route(); });
const needAuth = () => { if (!me) throw new Error('sign in first (top right)'); if (auth.hasScope && !auth.hasScope(POST)) { auth.ensureScope(SCOPE); throw new Error('re-authorising for the parts collections…'); } };
/** After a write: make the index agree with my repo, then refresh my votes. */
async function reindexMe() { await api(`index?repo=${enc(me.did)}`, { method: 'POST' }); mine = (await api(`mine?did=${enc(me.did)}`)).votes || {}; }

// ── writes ────────────────────────────────────────────────────────────────
async function vote(subject, value) {
  needAuth();
  const cur = mine[subject];
  if (cur && cur.value === value) await auth.pds.deleteRecord(VOTE, parseAt(cur.uri).rkey);
  else if (cur) await auth.pds.putRecord(VOTE, parseAt(cur.uri).rkey, { $type: VOTE, subject: { uri: subject, cid: cur.cid || '' }, value, createdAt: new Date().toISOString() });
  else await auth.pds.createRecord(VOTE, { $type: VOTE, subject: await strongRef(subject), value, createdAt: new Date().toISOString() });
  await reindexMe();
}
/** A strongRef needs the target's cid; ask the target's repo for it through the cad gateway. */
async function strongRef(uri) {
  const p = parseAt(uri); if (!p) throw new Error(`bad uri ${uri}`);
  const r = await fetch(`${CAD}/xrpc/com.atproto.repo.getRecord?repo=${enc(p.did)}&collection=${enc(p.collection)}&rkey=${enc(p.rkey)}`);
  if (!r.ok) throw new Error(`cannot fetch ${uri}`);
  const j = await r.json(); return { uri: j.uri, cid: j.cid };
}

// ── views ─────────────────────────────────────────────────────────────────
const main = $('#main');
function voteBox(subject, score, votes) {
  const m = mine[subject]?.value;
  return `<div class="vote"><button data-vote="1" data-subject="${esc(subject)}" class="${m === 1 ? 'on' : ''}" title="up">▲</button><span title="${votes} votes">${score}</span><button data-vote="-1" data-subject="${esc(subject)}" class="${m === -1 ? 'on' : ''}" title="down">▼</button></div>`;
}
function postRow(p) {
  return `<article class="post">${voteBox(p.uri, p.score, p.votes)}<div><h3><a href="#/p/${enc(p.uri)}">${esc(p.title)}</a></h3><div class="meta">in <a href="#/c/${esc(p.communityName || '?')}">${esc(p.communityName || 'a community')}</a> · by <a href="https://bsky.app/profile/${esc(p.did)}" data-did="${esc(p.did)}">${esc(p.did.slice(0, 16))}…</a> · ${ago(p.created_at)} · <a href="#/p/${enc(p.uri)}">${p.comments} comment${p.comments === 1 ? '' : 's'}</a> · <a href="${CAD}/?at=${enc(p.part_uri)}">open part</a></div></div></article>`;
}
async function fillHandles(root = main) { for (const a of root.querySelectorAll('[data-did]')) handleOf(a.dataset.did).then((h) => { a.textContent = `@${h}`; }); }
function sorts(base, sort) { return `<div class="sorts">${['hot', 'new', 'top'].map((s) => `<a href="${base}${s}" class="${s === sort ? 'on' : ''}">${s}</a>`).join('')}</div>`; }

async function front(sort = 'hot') {
  const [{ posts }, { communities }] = await Promise.all([api(`feed?sort=${sort}`), api('communities')]);
  main.innerHTML = `<div class="cols"><section>${sorts('#/?sort=', sort)}${posts.map(postRow).join('') || '<p class="empty">No posts yet. <a href="#/new">Post a part</a>, or <a href="#/found">found a community</a>.</p>'}</section><aside class="side"><h3>communities</h3>${communities.map((c) => `<div class="c"><a href="#/c/${esc(c.name)}">${esc(c.name)}</a><small>${c.posts} post${c.posts === 1 ? '' : 's'}</small></div>`).join('') || '<p class="dim">none yet</p>'}<p class="dim" style="font-size:12px;margin-top:10px">A community is a record in its founder's repo; a post is a record in yours. This page is an index anyone could rebuild.</p></aside></div>`;
  fillHandles();
}
async function community(name, sort = 'hot') {
  const { community: c, posts } = await api(`community?name=${enc(name)}&sort=${sort}`);
  main.innerHTML = `<h2>${esc(c.title || c.name)}<small>${esc(c.name)} · founded by <span data-did="${esc(c.did)}">${esc(c.did.slice(0, 16))}…</span> · ${c.posts} post${c.posts === 1 ? '' : 's'}</small></h2>${c.description ? `<p class="text">${esc(c.description)}</p>` : ''}${c.rules ? `<details><summary class="dim">rules</summary><p class="text">${esc(c.rules)}</p></details>` : ''}<p><a href="#/new?community=${enc(c.uri)}">post a part here</a></p>${sorts(`#/c/${esc(name)}?sort=`, sort)}${posts.map(postRow).join('') || '<p class="empty">nothing posted yet</p>'}`;
  fillHandles();
}
async function post(uri) {
  const [{ post: p, community: c }, { comments }] = await Promise.all([api(`post?uri=${enc(uri)}`), api(`thread?uri=${enc(uri)}`)]);
  const rev = parseAt(p.part_uri);
  const comment = (x) => `<div class="comment" id="${esc(x.uri)}"><div class="meta"><span data-did="${esc(x.did)}">${esc(x.did.slice(0, 16))}…</span> · ${ago(x.created_at)} · <button data-vote="1" data-subject="${esc(x.uri)}" class="${mine[x.uri]?.value === 1 ? 'on' : ''}">▲</button> ${x.score} <button data-vote="-1" data-subject="${esc(x.uri)}" class="${mine[x.uri]?.value === -1 ? 'on' : ''}">▼</button> · <a href="#" data-reply="${esc(x.uri)}">reply</a></div><div class="text">${esc(x.text)}</div><div class="replies">${x.replies.map(comment).join('')}</div></div>`;
  main.innerHTML = `<article class="post">${voteBox(p.uri, p.score, p.votes)}<div><h3>${esc(p.title)}</h3><div class="meta">in <a href="#/c/${esc(c?.name || '')}">${esc(c?.name || 'a community')}</a> · by <span data-did="${esc(p.did)}">${esc(p.did.slice(0, 16))}…</span> · ${ago(p.created_at)}</div><div class="part" id="part"><span class="k">part</span><span>loading…</span><a class="open" href="${CAD}/?at=${enc(p.part_uri)}">open in cad →</a></div>${p.text ? `<div class="text">${esc(p.text)}</div>` : ''}</div></article>
  <h2 style="margin-top:16px">${comments.length ? 'comments' : 'no comments yet'}</h2>
  <form id="comment" data-post="${esc(p.uri)}"><input type="hidden" name="parent"><label><span id="replyto">comment</span><textarea name="text" required placeholder="say something about the part — numbers welcome"></textarea></label><button>post comment</button><div class="status dim" id="cstatus"></div></form>
  ${comments.map(comment).join('')}`;
  fillHandles();
  // the part: the revision record through the cad gateway — its invariants were written when it was saved
  if (rev) fetch(`${CAD}/xrpc/com.atproto.repo.getRecord?repo=${enc(rev.did)}&collection=${enc(rev.collection)}&rkey=${enc(rev.rkey)}`).then((r) => r.json()).then((j) => {
    const v = j.value || {}; const inv = v.invariants || {}; const tree = v.tree || {};
    const n = (x) => (x === undefined || x === null ? '–' : Number(x).toFixed(1));
    $('#part').innerHTML = `<span class="k">part</span><span>${esc(tree.name || (Array.isArray(tree.components) ? 'assembly' : 'part'))}</span>${Array.isArray(tree.components) ? `<span class="k">${tree.components.length} components</span>` : `<span class="k">volume</span><span>${n(inv.volume)} mm³</span><span class="k">χ</span><span>${inv.euler ?? '–'}</span><span class="${inv.watertight ? 'ok' : 'bad'}">${inv.watertight === undefined ? '' : inv.watertight ? 'watertight' : 'not watertight'}</span>`}${v.message ? `<span class="k">“${esc(v.message)}”</span>` : ''}<a class="open" href="${CAD}/?at=${enc(p.part_uri)}">open in cad →</a>`;
  }).catch(() => { $('#part').innerHTML = `<span class="k">part</span><span class="bad">could not read the revision</span><a class="open" href="${CAD}/?at=${enc(p.part_uri)}">open in cad →</a>`; });
}
async function newPost(communityUri = '') {
  const { communities } = await api('communities');
  main.innerHTML = `<h2>post a part<small>a record in your repo that points at a community and at one revision of a part</small></h2>
  <form id="newpost"><label>community<select name="community" required>${communities.map((c) => `<option value="${esc(c.uri)}" ${c.uri === communityUri ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
  <label>the part — one of your files on cad.mino.mobi (its current revision is what gets posted)<div class="files" id="files"><span class="dim">${me ? 'loading your files…' : 'sign in to list your files'}</span></div></label>
  <label>or an AT URI of a revision<input name="part" placeholder="at://did:…/com.minomobi.cad.revision/…"></label>
  <label>title<input name="title" required maxlength="300"></label>
  <label>text<textarea name="text" placeholder="what it is, what you measured, what you are unsure of"></textarea></label>
  <button ${communities.length ? '' : 'disabled'}>post</button><div class="status dim" id="pstatus">${communities.length ? '' : 'found a community first'}</div></form>`;
  if (me) {
    try {
      const r = await fetch(`${CAD}/xrpc/com.atproto.repo.listRecords?repo=${enc(me.did)}&collection=com.minomobi.cad.part&limit=100`); const j = await r.json();
      const files = (j.records || []).map((x) => x.value).filter((v) => v?.head?.uri);
      $('#files').innerHTML = files.length ? files.map((f) => `<label><input type="radio" name="file" value="${esc(f.head.uri)}"> ${esc(f.path)} <small class="dim">${f.kind}</small></label>`).join('') : '<span class="dim">no files in your repo yet — save one in cad.mino.mobi (files tab) and push it</span>';
    } catch { $('#files').innerHTML = '<span class="bad">could not list your files</span>'; }
  }
}
function found() {
  main.innerHTML = `<h2>found a community<small>a record in your repo; the slug is its key and cannot change</small></h2>
  <form id="found"><label>slug (lowercase, 3–32, letters digits dashes)<input name="name" required pattern="[a-z0-9][a-z0-9\\-]{1,30}[a-z0-9]" placeholder="clocks"></label><label>title<input name="title" required maxlength="120"></label><label>description<textarea name="description"></textarea></label><label>rules<textarea name="rules" placeholder="what belongs here, what does not"></textarea></label><button>found it</button><div class="status dim" id="fstatus"></div></form>`;
}

// ── events ────────────────────────────────────────────────────────────────
main.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-vote]'); const r = e.target.closest('[data-reply]');
  if (b) { e.preventDefault(); try { b.disabled = true; await vote(b.dataset.subject, Number(b.dataset.vote)); route(); } catch (err) { alert(err.message); b.disabled = false; } }
  if (r) { e.preventDefault(); const f = $('#comment'); f.parent.value = r.dataset.reply; $('#replyto').textContent = `reply to ${r.dataset.reply.slice(-13)}`; f.text.focus(); }
});
main.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target; const status = f.querySelector('.status'); const btn = f.querySelector('button');
  try {
    needAuth(); btn.disabled = true; status.textContent = 'writing to your repo…';
    if (f.id === 'found') {
      const name = f.name.value.trim();
      await auth.pds.putRecord(COMMUNITY, name, { $type: COMMUNITY, name, title: f.title.value.trim(), description: f.description.value.trim() || undefined, rules: f.rules.value.trim() || undefined, createdAt: new Date().toISOString() });
      await reindexMe(); location.hash = `#/c/${name}`;
    } else if (f.id === 'newpost') {
      const partUri = (f.querySelector('input[name=file]:checked')?.value) || f.part.value.trim();
      if (!partUri) throw new Error('pick a file or paste a revision URI');
      let part = await strongRef(partUri);
      if (part.uri.includes('/com.minomobi.cad.part/')) { const head = (await (await fetch(`${CAD}/xrpc/com.atproto.repo.getRecord?repo=${enc(parseAt(part.uri).did)}&collection=com.minomobi.cad.part&rkey=${enc(parseAt(part.uri).rkey)}`)).json()).value?.head; if (!head?.uri) throw new Error('that file has no head revision'); part = head; }
      if (!part.uri.includes('/com.minomobi.cad.revision/')) throw new Error('a post points at a revision');
      const community = await strongRef(f.community.value);
      const r = await auth.pds.createRecord(POST, { $type: POST, community, part, title: f.title.value.trim(), text: f.text.value.trim() || undefined, createdAt: new Date().toISOString() });
      await reindexMe(); location.hash = `#/p/${enc(r.uri)}`;
    } else if (f.id === 'comment') {
      const postRef = await strongRef(f.dataset.post); const parent = f.parent.value ? await strongRef(f.parent.value) : undefined;
      await auth.pds.createRecord(COMMENT, { $type: COMMENT, post: postRef, ...(parent ? { parent } : {}), text: f.text.value.trim(), createdAt: new Date().toISOString() });
      await reindexMe(); route();
    }
  } catch (err) { status.textContent = err.message; status.className = 'status bad'; btn.disabled = false; }
});

// ── routing ───────────────────────────────────────────────────────────────
async function route() {
  const h = location.hash.slice(1) || '/'; const [path, qs] = h.split('?'); const q = new URLSearchParams(qs || '');
  try {
    if (path === '/' || path === '') await front(q.get('sort') || 'hot');
    else if (path.startsWith('/c/')) await community(decodeURIComponent(path.slice(3)), q.get('sort') || 'hot');
    else if (path.startsWith('/p/')) await post(decodeURIComponent(path.slice(3)));
    else if (path === '/new') await newPost(q.get('community') || '');
    else if (path === '/found') found();
    else main.innerHTML = '<p class="empty">not found</p>';
  } catch (e) { main.innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
await initAuth();
route();
window.__parts = { auth, api, route, vote, get me() { return me; }, get mine() { return mine; } };
