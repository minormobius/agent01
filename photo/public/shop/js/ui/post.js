// post.js — the dialog behind “post to Bluesky”. The impure half: canvas,
// network, DOM. Every decision it makes lives in `core/publish.js`, where the
// selftest can reach it.
//
// SIGNING IN COSTS A NAVIGATION, SO THE STACK TRAVELS IN THE LINK
// --------------------------------------------------------------
// OAuth is a full-page redirect. Someone forty edits deep who clicks “sign in”
// would come back to an empty canvas, which is an unacceptable way to lose an
// afternoon. So the return URL carries `#r=<recipe>` — the same shareable
// recipe the file menu copies — and boot re-applies it to the picture on the
// way back in. If the picture itself came from `?u=` (which is how the archive
// opens one here) the round trip is lossless. If it came off a local disk, the
// recipe survives and the pixels do not; the dialog says so before it navigates
// rather than after.
//
// Most people will never see that path: one sign-in works across every
// *.mino.mobi site through a domain cookie, so anyone who signed in on the
// archive to browse their own uploads is already signed in here.

import { AuthClient } from '../vendor/auth.js';
import { encodeRecipe } from '../core/doc.js';
import {
  ALBUM_COLLECTION, ALBUM_SCOPE, ARCHIVE_LIMIT, BLOB_LIMIT, COLLECTION,
  IMAGE_COLLECTION, SCOPE, TEXT_LIMIT, appendToAlbum, buildImageRecord,
  buildPostRecord, countGraphemes, describeFit, encodePlan, fitToLimit,
  hasTransparency, postPermalink,
} from '../core/publish.js';
import { toCanvas } from './io.js';

const $ = (id) => document.getElementById(id);

export function createPublisher(app) {
  const auth = new AuthClient();
  let booted = null;
  let busy = false;
  let albums = [];

  /** Pick up a session — from the callback, from localStorage, or from the
   *  shared .mino.mobi cookie. Fire-and-forget at boot so the dialog opens
   *  already knowing who you are; awaited again when it opens, in case the
   *  network was slow. */
  function boot() {
    booted = booted || auth.init().catch(() => null);
    return booted;
  }

  /** Where a redirect should land: here, with the current stack in the hash. */
  function returnHere() {
    const url = new URL(location.href);
    url.searchParams.delete('__auth_session');
    url.hash = '';
    if (app.doc) {
      try {
        const r = encodeRecipe(app.doc);
        // A hand-painted mask RLE can run long, and an over-long URL is refused
        // somewhere between here and the authorization server. Better to lose
        // the recipe than the sign-in.
        if (r.length <= 6000) url.hash = `r=${r}`;
      } catch { /* the stack is a nicety; the sign-in is not */ }
    }
    return url.toString();
  }

  function note(text, kind = '') {
    const el = $('post-note');
    el.textContent = text;
    el.className = `post-note${kind ? ` ${kind}` : ''}`;
  }

  function setBusy(on) {
    busy = on;
    $('post-go').disabled = on;
    $('post-save').disabled = on;
    $('post-go').textContent = on ? 'working…' : 'post';
  }

  /** The signed-in user's albums, for the “save to” picker. Best effort: a
   *  session with only the post scope cannot list them, and that is fine —
   *  saving escalates when you ask for it. */
  async function loadAlbums() {
    albums = [];
    try {
      const res = await auth.pds.listRecords(ALBUM_COLLECTION, 100);
      albums = (res?.records || []).map((r) => ({
        rkey: String(r.uri).split('/').pop(),
        value: r.value,
      }));
    } catch { /* no albums, or no permission to see them yet */ }
    renderAlbums();
  }

  function renderAlbums() {
    const sel = $('post-album');
    const keep = sel.value;
    sel.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = albums.length ? 'uploads only (no album)' : 'uploads only';
    sel.appendChild(none);
    for (const a of albums) {
      const o = document.createElement('option');
      o.value = a.rkey;
      o.textContent = a.value?.name || a.rkey;
      sel.appendChild(o);
    }
    if (keep) sel.value = keep;
    $('post-album-row').hidden = !auth.getUser();
  }

  /**
   * Save the picture into the album page's collections instead of posting it.
   *
   * Deliberately a different scope from posting, asked for the first time you
   * use it: someone who only ever posts should never see an album collection on
   * their consent screen. And a different size budget — nothing downstream
   * re-encodes an album picture, so it is fitted to what a PDS accepts and
   * tries PNG first.
   */
  async function doSave() {
    if (busy || !app.doc) return;
    const user = auth.getUser();
    if (!user) { note('sign in first', 'err'); return; }

    if (!auth.hasScope(ALBUM_SCOPE)) {
      note('saving to an album needs one more permission — sending you to Bluesky…');
      await auth.ensureScope(ALBUM_SCOPE, { returnTo: returnHere() });
      return;
    }

    setBusy(true);
    try {
      const { W, H } = app.doc;
      const alt = $('post-alt').value.trim();
      note('encoding…');
      const fit = await encodeFor(app.lastComposite, W, H, { limit: ARCHIVE_LIMIT, lossless: true });
      if (!fit) throw new Error('this browser could not encode the picture');
      if (!fit.fit) {
        throw new Error(`the smallest this picture can be made is `
          + `${Math.round(fit.bytes.length / 1024)} kB, and a PDS blob tops out around `
          + `${Math.round(ARCHIVE_LIMIT / 1024)} kB — crop it, or shrink the document`);
      }

      note(`uploading ${describeFit(fit, W, H)}…`);
      const blob = await auth.pds.uploadBlob(fit.bytes, fit.step.type);

      note('saving…');
      await auth.pds.createRecord(IMAGE_COLLECTION, buildImageRecord({
        blob, alt, W: fit.W, H: fit.H,
      }));

      const rkey = $('post-album').value;
      const album = albums.find((a) => a.rkey === rkey);
      if (album) {
        await auth.pds.putRecord(
          ALBUM_COLLECTION, rkey,
          appendToAlbum(album.value, { blob, alt, W: fit.W, H: fit.H }),
        );
        album.value = appendToAlbum(album.value, { blob, alt, W: fit.W, H: fit.H });
      }

      const el = $('post-note');
      el.className = 'post-note ok';
      el.textContent = album ? `saved to “${album.value.name}” — ` : 'saved to your uploads — ';
      const a = document.createElement('a');
      a.href = album ? `/albums?a=${encodeURIComponent(rkey)}` : '/albums';
      a.textContent = 'open albums';
      el.appendChild(a);
      app.status(`saved to your repo · ${describeFit(fit, W, H)}`);
    } catch (err) {
      note(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  function renderWho() {
    const host = $('post-who');
    host.innerHTML = '';
    const user = auth.getUser();

    if (user) {
      const who = document.createElement('span');
      who.className = 'post-who-name';
      who.textContent = `posting as @${user.handle}`;
      const out = document.createElement('button');
      out.className = 'ghost small';
      out.textContent = 'sign out';
      out.onclick = async () => { await auth.logout(); renderWho(); };
      host.append(who, out);
      return;
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'you.bsky.social';
    input.className = 'post-handle';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    const go = document.createElement('button');
    go.className = 'start small';
    go.textContent = 'sign in';
    const signIn = async () => {
      const handle = input.value.trim().replace(/^@/, '');
      if (!handle) { note('type the handle you post from', 'err'); input.focus(); return; }
      note('opening Bluesky…');
      try {
        await auth.login(handle, { scope: SCOPE, returnTo: returnHere() });
      } catch (err) {
        note(err.message, 'err');
      }
    };
    go.onclick = signIn;
    input.onkeydown = (ev) => { if (ev.key === 'Enter') signIn(); };
    host.append(input, go);
  }

  /** Re-encode the composite until it fits a blob limit. */
  async function encodeFor(px, W, H, { limit = BLOB_LIMIT, lossless = false } = {}) {
    const transparent = hasTransparency(px);
    const src = toCanvas(px, W, H);
    // `lossless` asks the PNG rungs to be tried even for an opaque picture —
    // an album keeps what you made, a post keeps what Bluesky will accept.
    const plan = encodePlan({ transparent: transparent || lossless });
    const fit = await fitToLimit(plan, async (step) => {
      const w = Math.max(1, Math.round(W * step.scale));
      const h = Math.max(1, Math.round(H * step.scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      // JPEG has no alpha: without this, every transparent pixel posts as black.
      if (step.type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, w, h);
      const blob = await new Promise((res) => c.toBlob(res, step.type, step.quality));
      if (!blob) return null;   // a type this browser will not encode
      return { bytes: new Uint8Array(await blob.arrayBuffer()), W: w, H: h, transparent };
    }, limit);
    return fit;
  }

  async function doPost() {
    if (busy || !app.doc) return;
    const user = auth.getUser();
    if (!user) { note('sign in first', 'err'); return; }

    const alt = $('post-alt').value.trim();
    const text = $('post-text').value;
    const n = countGraphemes(text);
    if (n > TEXT_LIMIT) { note(`that is ${n} characters — Bluesky takes ${TEXT_LIMIT}`, 'err'); return; }

    // Identity is granted site-wide; permission to *write* is not. A session
    // minted on the archive covers uploads and albums, not posts — so ask for
    // the missing token here, from this click, rather than failing at the PDS.
    if (!auth.hasScope(SCOPE)) {
      note('Bluesky needs to approve posting from this page — sending you there…');
      await auth.ensureScope(SCOPE, { returnTo: returnHere() });
      return;   // ensureScope navigates away
    }

    setBusy(true);
    try {
      const { W, H } = app.doc;
      note('encoding…');
      const fit = await encodeFor(app.lastComposite, W, H);
      if (!fit) throw new Error('this browser could not encode the picture');
      if (!fit.fit) {
        throw new Error(`the smallest this picture can be made is `
          + `${Math.round(fit.bytes.length / 1024)} kB, and Bluesky takes `
          + `${Math.round(BLOB_LIMIT / 1024)} kB — crop it, or shrink the document`);
      }

      note(`uploading ${describeFit(fit, W, H)}…`);
      const blob = await auth.pds.uploadBlob(fit.bytes, fit.step.type);

      note('posting…');
      const res = await auth.pds.createRecord(COLLECTION, buildPostRecord({
        text, alt, blob, W: fit.W, H: fit.H,
      }));

      const link = postPermalink(res?.uri);
      const el = $('post-note');
      el.className = 'post-note ok';
      el.textContent = 'posted — ';
      if (link) {
        const a = document.createElement('a');
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'open it on Bluesky';
        el.appendChild(a);
      }
      app.status(`posted to Bluesky · ${describeFit(fit, W, H)}`);
    } catch (err) {
      note(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  function updateCount() {
    const n = countGraphemes($('post-text').value);
    const el = $('post-count');
    el.textContent = `${n}/${TEXT_LIMIT}`;
    el.classList.toggle('over', n > TEXT_LIMIT);
  }

  function wire() {
    const box = $('post');
    $('post-cancel').onclick = () => { box.hidden = true; };
    $('post-go').onclick = doPost;
    $('post-save').onclick = doSave;
    $('post-text').oninput = updateCount;
    box.onclick = (ev) => { if (ev.target === box) box.hidden = true; };
  }

  let wired = false;

  async function open() {
    if (!app.doc || !app.lastComposite) { app.status('open a picture first'); return; }
    if (!wired) { wire(); wired = true; }
    const box = $('post');
    box.hidden = false;
    // The archive hands over the picture's alt text along with its URL; keeping
    // it is the difference between a described picture and an undescribed one.
    const carried = new URLSearchParams(location.search).get('alt');
    if (carried && !$('post-alt').value) $('post-alt').value = carried;
    renderAlbums();
    updateCount();
    renderWho();
    note(auth.getUser()
      ? 'the picture is re-encoded to fit Bluesky’s 1 MB limit; nothing else leaves this tab.'
      : 'signing in reloads this page — your stack travels with it in the link.');
    await boot();
    renderWho();
    renderAlbums();
    if (auth.getUser()) {
      note('the picture is re-encoded to fit Bluesky’s 1 MB limit; nothing else leaves this tab.');
      loadAlbums();
    }
  }

  boot();
  return { open };
}
