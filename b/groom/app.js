// groom — page wiring. Pure judgements live in groom.js, network in scan.js;
// this file is the DOM, the progress reporting, and the one authenticated
// operation the tool performs.
//
// THE RULE THE UNFOLLOW BUTTON OBEYS. Deleting a follow record is a write to
// the SIGNED-IN person's repo — there is no such thing as unfollowing on
// someone else's behalf, and the auth worker would refuse it anyway. So the
// buttons appear only when the account being scanned IS the account signed in.
// Scanning a stranger is a perfectly good read-only use of this page; it just
// cannot end in a write, and the UI says so rather than offering a button that
// fails.

import {
  classify, fmtAgo, lastPostLabel, parseActorInput, pickUnfollowScope, rkeyOf,
  selectRows, summarize, DAY_MS, FOLLOW_COLLECTION, STATE_LABEL, WINDOWS,
} from './groom.js';
import { checkMutuals, hydrateProfiles, lastActivity, listFollows, pool, resolveActor, resolvePdsHost } from './scan.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

const form = $('form'), actorInput = $('actor'), goBtn = $('go'), stopBtn = $('stop');
const windowSel = $('window'), mutualsBox = $('mutuals');
const statusBox = $('status'), errorBox = $('error'), out = $('out'), whoStrip = $('whoStrip');

let auth = null;                 // AuthClient, loaded lazily
let unfollowScope = null;        // { token, narrow } once the ceiling is read
let scan = null;                 // the current result set
let controller = null;           // AbortController for a running scan

const state = {
  filterDormant: true,
  filterNonMutual: false,
  mode: 'any',
  sort: 'oldest',
};

// ─── chrome ──────────────────────────────────────────────────────────────────

for (const w of WINDOWS) {
  const o = el('option', null, w.label);
  o.value = String(w.days);
  if (w.days === 365) o.selected = true;
  windowSel.append(o);
}

function say(msg, { done = 0, total = 0 } = {}) {
  statusBox.hidden = false;
  statusBox.textContent = '';
  statusBox.append(el('div', null, msg));
  if (total > 0) {
    const bar = el('div', 'bar');
    const fill = el('span');
    fill.style.width = `${Math.round((done / total) * 100)}%`;
    bar.append(fill);
    statusBox.append(bar);
  }
}
const clearSay = () => { statusBox.hidden = true; statusBox.textContent = ''; };
function fail(msg) { errorBox.hidden = false; errorBox.textContent = msg; }
const clearFail = () => { errorBox.hidden = true; errorBox.textContent = ''; };

// ─── auth ────────────────────────────────────────────────────────────────────

/**
 * Bring up the shared OAuth client, and work out which scope to ask for.
 *
 * `pickUnfollowScope` reads the LIVE ceiling rather than assuming one — the
 * auth worker is deployed from another branch, so the narrow
 * `repo:app.bsky.graph.follow` token becomes grantable on a deploy this surface
 * does not control. Asking for it early fails the whole sign-in at PAR; asking
 * for the fallback forever means a broader consent screen than this site
 * deserves. Reading the ceiling gets both right with no code change.
 */
async function ensureAuth() {
  if (auth) return auth;
  const [{ AuthClient }, ceiling] = await Promise.all([
    import('/packages/oauth-client/auth.js'),
    fetch('https://auth.mino.mobi/client-metadata.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && j.scope)
      .catch(() => null),
  ]);
  unfollowScope = pickUnfollowScope(ceiling || '');
  auth = new AuthClient();
  auth.onAuthChange(() => { renderWhoStrip(); renderRows(); });
  await auth.init();
  renderWhoStrip();
  return auth;
}

/** The DID we are signed in as, or null. */
const signedInDid = () => auth?.getUser()?.did || null;
/** Can this scan end in a write? Only when it is the signed-in person's own list. */
const canUnfollow = () => Boolean(scan && unfollowScope && signedInDid() && signedInDid() === scan.did && auth.hasScope(unfollowScope.token));

function renderWhoStrip() {
  const user = auth?.getUser();
  whoStrip.hidden = false;
  whoStrip.textContent = '';

  if (!user) {
    whoStrip.append(el('span', null, 'Not signed in — unfollowing needs a sign-in.'));
    const b = el('button', 'ghost', 'sign in');
    b.onclick = () => startLogin();
    const sp = el('span', 'spacer'); whoStrip.append(sp, b);
    return;
  }

  whoStrip.append(el('span', null, 'Signed in as '));
  const who = el('b', null, '@' + user.handle);
  whoStrip.append(who);

  if (scan && scan.did !== user.did) {
    whoStrip.append(el('span', null, ` — but this list belongs to @${scan.handle}, so there is nothing here you can unfollow.`));
  } else if (scan && !auth.hasScope(unfollowScope.token)) {
    whoStrip.append(el('span', null, ' — this session cannot write follows yet.'));
    const b = el('button', 'ghost', 'authorise unfollowing');
    b.onclick = async () => { await auth.ensureScope(unfollowScope.token); };
    whoStrip.append(b);
  }

  const sp = el('span', 'spacer');
  const outBtn = el('button', 'ghost', 'sign out');
  outBtn.onclick = async () => { await auth.logout(); renderWhoStrip(); renderRows(); };
  whoStrip.append(sp, outBtn);
}

async function startLogin() {
  const handle = parseActorInput(actorInput.value) || window.prompt('Your Bluesky handle:');
  if (!handle) return;
  try {
    await ensureAuth();
    // Ask for the write up front: the whole point of signing in HERE is to
    // unfollow, so a second consent round-trip later is pure friction.
    await auth.login(String(handle).replace(/^@/, ''), { scope: `atproto ${unfollowScope.token}` });
  } catch (e) { fail(`sign-in failed: ${e.message}`); }
}

// ─── the scan ────────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (controller) return;
  const actor = parseActorInput(actorInput.value);
  if (!actor) { fail('That does not look like a handle, a DID or a profile URL.'); return; }
  await runScan(actor);
});

stopBtn.addEventListener('click', () => controller?.abort());

async function runScan(actor) {
  clearFail();
  out.textContent = '';
  scan = null;
  controller = new AbortController();
  const signal = controller.signal;
  goBtn.disabled = true; stopBtn.hidden = false;

  const now = Date.now();
  const dormantDays = Number(windowSel.value) || 365;
  const cutoff = now - dormantDays * DAY_MS;
  const wantMutuals = mutualsBox.checked;

  try {
    say('resolving…');
    const profile = await resolveActor(actor, { signal });
    const did = profile.did;

    say(`reading @${profile.handle}'s follow records…`);
    const pds = await resolvePdsHost(did, { signal });
    const follows = await listFollows(did, {
      pds, signal,
      onProgress: (n) => say(`reading @${profile.handle}'s follow records… ${n}`),
    });
    if (!follows.length) { clearSay(); out.append(el('div', 'empty', `@${profile.handle} follows nobody.`)); return; }

    const dids = follows.map((f) => f.did);

    say(`looking up ${dids.length} accounts…`, { done: 0, total: dids.length });
    const profiles = await hydrateProfiles(dids, { signal, onProgress: (n) => say(`looking up ${dids.length} accounts…`, { done: n, total: dids.length }) });

    let mutuals = new Map();
    if (wantMutuals) {
      say('checking who follows back…', { done: 0, total: dids.length });
      mutuals = await checkMutuals(did, dids, { signal, onProgress: (n) => say('checking who follows back…', { done: n, total: dids.length }) });
    }

    // The expensive pass: one feed read per account, bounded by needsAnotherPage.
    let done = 0;
    say(`reading feeds… 0 / ${dids.length}`, { done: 0, total: dids.length });
    const activity = await pool(dids, async (d) => {
      const a = await lastActivity(d, cutoff, { signal });
      done++;
      if (done % 5 === 0 || done === dids.length) say(`reading feeds… ${done} / ${dids.length}`, { done, total: dids.length });
      return a;
    }, { signal });

    const rows = follows.map((f, i) => {
      const profileView = profiles.get(f.did) || null;
      const verdict = classify({ profile: profileView, ...activity[i] }, { now, dormantDays });
      return {
        ...f, ...verdict,
        rkey: rkeyOf(f.uri),
        profile: profileView,
        handle: profileView?.handle || null,
        displayName: profileView?.displayName || null,
        avatar: profileView?.avatar || null,
        description: profileView?.description || '',
        followsBack: wantMutuals ? mutuals.get(f.did) : undefined,
        unfollowed: false,
        msg: null,
      };
    });

    scan = { did, handle: profile.handle, rows, now, dormantDays, windowLabel: WINDOWS.find((w) => w.days === dormantDays)?.label || `${dormantDays} days`, checkedMutuals: wantMutuals };
    clearSay();
    await ensureAuth().catch(() => {});
    render();
  } catch (e) {
    clearSay();
    if (e.name === 'AbortError') fail('Scan stopped. Nothing was changed.');
    else fail(e.message || String(e));
  } finally {
    controller = null; goBtn.disabled = false; stopBtn.hidden = true;
  }
}

// ─── render ──────────────────────────────────────────────────────────────────

function render() {
  out.textContent = '';
  if (!scan) return;
  // The strip's message depends on WHOSE list this is, which is only known once
  // a scan exists — repaint it here or "signed in, but this list is not yours"
  // never gets said, and the missing unfollow buttons look like a bug.
  renderWhoStrip();
  out.append(renderSummary(), renderControls(), rowsHost());
  renderRows();
}

function renderSummary() {
  const t = summarize(scan.rows);
  const box = el('div', 'summary');
  const tallies = el('div', 'tallies');
  const add = (n, k, hot) => {
    const d = el('div', 'tally' + (hot ? ' hot' : ''));
    d.append(el('div', 'n', String(n)), el('div', 'k', k));
    tallies.append(d);
  };
  add(t.total, 'follows');
  add(t.dormant, `silent ${scan.windowLabel}+`, t.dormant > 0);
  if (t.gone) add(t.gone, 'gone');
  if (scan.checkedMutuals) add(t.nonMutual, 'no follow-back');
  if (scan.checkedMutuals && t.both) add(t.both, 'both', true);
  box.append(tallies);

  if (t.gone) {
    const n = el('div', 'note');
    n.append(document.createTextNode(`${t.gone} of these are `), el('b', null, 'deleted, deactivated or suspended'),
      document.createTextNode(' — accounts your following list in the app does not show you at all. They are dead weight by definition.'));
    box.append(n);
  }
  if (t.unknown) {
    const n = el('div', 'note');
    n.append(document.createTextNode(`${t.unknown} could not be read far enough to judge, so they are reported as `),
      el('b', null, 'unreadable'), document.createTextNode(' rather than guessed at, and are never proposed for unfollowing.'));
    box.append(n);
  }
  return box;
}

function renderControls() {
  const box = el('div', 'controls');

  const mk = (labelText, key) => {
    const lab = el('label');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = state[key];
    cb.onchange = () => { state[key] = cb.checked; renderRows(); };
    lab.append(cb, document.createTextNode(labelText));
    return lab;
  };
  box.append(mk(`silent ${scan.windowLabel}+`, 'filterDormant'));
  if (scan.checkedMutuals) {
    box.append(mk('no follow-back', 'filterNonMutual'));
    const modeLab = el('label');
    const sel = el('select');
    for (const [v, t] of [['any', 'either'], ['all', 'both at once']]) {
      const o = el('option', null, t); o.value = v; if (state.mode === v) o.selected = true; sel.append(o);
    }
    sel.onchange = () => { state.mode = sel.value; renderRows(); };
    modeLab.append(document.createTextNode('match '), sel);
    box.append(modeLab);
  }

  const sortLab = el('label');
  const sortSel = el('select');
  for (const [v, t] of [['oldest', 'quietest first'], ['recent-follow', 'recently followed first'], ['handle', 'by handle']]) {
    const o = el('option', null, t); o.value = v; if (state.sort === v) o.selected = true; sortSel.append(o);
  }
  sortSel.onchange = () => { state.sort = sortSel.value; renderRows(); };
  sortLab.append(document.createTextNode('sort '), sortSel);
  box.append(sortLab);
  return box;
}

function rowsHost() {
  const host = el('div');
  host.id = 'rowsHost';
  return host;
}

function visibleRows() {
  const picked = selectRows(scan.rows, { dormant: state.filterDormant, nonMutual: state.filterNonMutual, mode: state.mode });
  const by = {
    // null lastPost sorts oldest — those are the never-posted and the
    // read-past-the-cutoff accounts, which are the quietest of all.
    oldest: (a, b) => (a.lastPost ?? -Infinity) - (b.lastPost ?? -Infinity),
    'recent-follow': (a, b) => Date.parse(b.followedAt || 0) - Date.parse(a.followedAt || 0),
    handle: (a, b) => String(a.handle || '￿').localeCompare(String(b.handle || '￿')),
  }[state.sort];
  return picked.slice().sort(by);
}

function renderRows() {
  const host = document.getElementById('rowsHost');
  if (!host || !scan) return;
  host.textContent = '';

  const rows = visibleRows();
  if (!rows.length) {
    host.append(el('div', 'empty', 'Nothing matches that filter — which is the good outcome.'));
    return;
  }

  const list = el('div', 'rows');
  for (const r of rows) list.append(renderRow(r));
  host.append(list);
  if (canUnfollow()) host.append(renderBulk(rows));
}

function renderRow(r) {
  const row = el('div', 'row' + (r.unfollowed ? ' done' : ''));

  if (canUnfollow() && !r.unfollowed && r.state !== 'unknown') {
    const cb = el('input'); cb.type = 'checkbox'; cb.dataset.pick = r.did;
    row.append(cb);
  }

  if (r.avatar) {
    const img = el('img', 'avatar'); img.src = r.avatar; img.alt = ''; img.loading = 'lazy';
    row.append(img);
  } else {
    row.append(el('div', 'avatar blank'));
  }

  const who = el('div', 'who');
  if (r.handle) {
    const a = el('a', 'name', r.displayName || r.handle);
    a.href = `https://bsky.app/profile/${r.handle}`;
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    who.append(a, el('div', 'handle', '@' + r.handle));
  } else {
    who.append(el('div', 'name', 'account gone'), el('div', 'handle', r.did));
  }
  if (r.description) who.append(el('div', 'bio', r.description));

  const tags = el('div', 'tags');
  const stateCls = { gone: 'gone', never: 'solo', 'reposts-only': 'boost', dormant: 'silent' }[r.state] || '';
  tags.append(el('span', 'tag ' + stateCls, STATE_LABEL[r.state]));
  // The date tag only earns its place when it says something the state tag has
  // not: "never posted / never posted" and "gone / last post unknown" are noise
  // in a list whose whole job is to be scanned quickly.
  if (r.state !== 'never' && r.state !== 'gone' && r.state !== 'unknown') {
    tags.append(el('span', 'tag', 'last post ' + lastPostLabel(r, scan.windowLabel, scan.now)));
  }
  if (r.state === 'reposts-only') tags.append(el('span', 'tag boost', 'reposted ' + fmtAgo(r.lastRepost, scan.now)));
  if (r.followsBack === false) tags.append(el('span', 'tag solo', 'no follow-back'));
  if (r.followedAt) tags.append(el('span', 'tag', 'followed ' + fmtAgo(Date.parse(r.followedAt), scan.now)));
  who.append(tags);
  row.append(who);

  const act = el('div', 'act');
  if (r.unfollowed) {
    act.append(el('span', 'msg', 'unfollowed'));
  } else if (canUnfollow() && r.state !== 'unknown') {
    const b = el('button', 'ghost', 'unfollow');
    b.onclick = async () => {
      b.disabled = true;
      const ok = await unfollowOne(r);
      if (!ok) b.disabled = false;
      renderRows();
    };
    act.append(b);
  }
  if (r.msg) act.append(el('span', 'msg' + (r.msgBad ? ' bad' : ''), r.msg));
  row.append(act);
  return row;
}

/** Set by renderBulk so the delegated change handler below can reach the
 *  current bar's counter without re-registering a listener each render. */
let bulkSync = null;

function renderBulk(rows) {
  const bar = el('div', 'bulk');
  const count = el('span', null, '0 selected');
  const sync = () => {
    const n = document.querySelectorAll('input[data-pick]:checked').length;
    count.textContent = `${n} selected`;
    goBulk.disabled = n === 0;
  };

  const all = el('button', 'ghost', 'select all shown');
  all.onclick = () => {
    for (const cb of document.querySelectorAll('input[data-pick]')) cb.checked = true;
    sync();
  };
  const none = el('button', 'ghost', 'clear');
  none.onclick = () => {
    for (const cb of document.querySelectorAll('input[data-pick]')) cb.checked = false;
    sync();
  };

  const goBulk = el('button', null, 'unfollow selected');
  goBulk.disabled = true;
  goBulk.onclick = async () => {
    const picked = new Set([...document.querySelectorAll('input[data-pick]:checked')].map((c) => c.dataset.pick));
    const targets = rows.filter((r) => picked.has(r.did) && !r.unfollowed);
    if (!targets.length) return;
    // An unfollow is not undoable from here — refollowing is a different record
    // and loses the original date — so the count gets said out loud first.
    if (!window.confirm(`Unfollow ${targets.length} account${targets.length === 1 ? '' : 's'}? This cannot be undone from this page.`)) return;
    goBulk.disabled = true; all.disabled = true;
    let n = 0;
    for (const r of targets) {
      say(`unfollowing… ${++n} / ${targets.length}`, { done: n, total: targets.length });
      await unfollowOne(r);
    }
    clearSay();
    renderRows();
  };

  // The row checkboxes are siblings of this bar, not children, so the listener
  // goes on the shared host. It is re-created with the bar on every render,
  // which is why it must NOT go on `document` — that leaks one handler per
  // filter toggle for the life of the page.
  bulkSync = sync;
  bar.append(all, none, el('span', 'spacer'), count, goBulk);
  return bar;
}

// One listener for the whole page, registered once at load rather than per
// render — see the note in renderBulk.
document.addEventListener('change', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.dataset.pick) bulkSync?.();
});

// ─── the one write ───────────────────────────────────────────────────────────

/**
 * Delete one follow record from the signed-in person's own repo.
 * Guarded twice over: `canUnfollow()` gates the button, and this re-checks the
 * DID at call time, because a session can change between render and click.
 */
async function unfollowOne(r) {
  if (!canUnfollow()) { r.msg = 'not authorised'; r.msgBad = true; return false; }
  if (!r.rkey) { r.msg = 'no record key'; r.msgBad = true; return false; }
  try {
    await auth.pds.deleteRecord(FOLLOW_COLLECTION, r.rkey);
    r.unfollowed = true; r.msg = null; r.msgBad = false;
    return true;
  } catch (e) {
    r.msg = (e.message || 'failed').slice(0, 80); r.msgBad = true;
    return false;
  }
}

// ─── boot ────────────────────────────────────────────────────────────────────

(async () => {
  // Pick up a session if one exists — the strip needs to know before any scan,
  // and a return from the OAuth redirect lands here with the token in the URL.
  try { await ensureAuth(); } catch { renderWhoStrip(); }

  // ?u= prefills and runs, so a scan is linkable.
  const u = new URLSearchParams(location.search).get('u');
  const signedIn = auth?.getUser();
  const start = parseActorInput(u || '') || (signedIn ? signedIn.handle : null);
  if (start) {
    actorInput.value = start;
    if (u) runScan(start);
  }
})();
