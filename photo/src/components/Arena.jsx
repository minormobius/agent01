import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALBUM_COLLECTION, ARENA_SCOPE, albumMedia, removeFromAlbum, uploadFile, uploadToMedia,
} from '../lib/arena.js';
import { init as authInit, login as authLogin, logout as authLogout, getSession } from '../lib/auth.js';
import { deleteRecord, loadAlbums, loadUploadedImages, saveAlbum } from '../lib/pds.js';
import { resolvePds } from '../lib/resolve.js';
import { blobUrl, postUrl, shopUrl } from '../lib/urls.js';
import Grid from './Grid.jsx';
import HandleTypeahead from './HandleTypeahead.jsx';

// Arena.jsx — `/albums`. Your pictures, on your PDS.
//
// This used to be a toolbar bolted onto the explorer, which made the explorer
// two programs: a reader for anyone's public archive, and a private
// upload-and-curate tool that happened to share its header. They wanted
// different things from the same screen — the reader wants a handle box and
// filters, this wants a sign-in and a set of albums — and neither got a good
// one.
//
// The connective tissue is deliberate and narrow:
//   • `/explore` can add any picture it is showing to an album here.
//   • `/shop` can save what it makes here.
//   • every picture here opens in `/shop`.
// See lib/arena.js for why "add" copies the blob rather than pointing at it.

const ALL_UPLOADS = '__uploads__';

export default function Arena({ themeToggle }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [selected, setSelected] = useState(() => (
    new URLSearchParams(window.location.search).get('a') || ALL_UPLOADS
  ));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [lightbox, setLightbox] = useState(null);
  // Every picture here is served by getBlob from the signed-in user's own PDS,
  // so its endpoint has to be resolved before anything can render.
  const [pdsMap, setPdsMap] = useState({});

  const load = useCallback(async () => {
    const sess = getSession();
    if (!sess) return;
    try {
      const [imgs, albs] = await Promise.all([loadUploadedImages(), loadAlbums()]);
      setUploads(imgs.map((rec) => uploadToMedia(rec, sess.did)));
      setAlbums(albs);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    authInit().then(async (user) => {
      setSession(user);
      setReady(true);
      if (!user) return;
      try {
        setPdsMap({ [user.did]: await resolvePds(user.did) });
      } catch (err) {
        setError(`Could not find your PDS — ${err.message}`);
      }
      load();
    });
  }, [load]);

  // Which album you are looking at is part of the address.
  useEffect(() => {
    const search = selected === ALL_UPLOADS ? '' : `?a=${encodeURIComponent(selected)}`;
    if (window.location.search !== search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}`);
    }
  }, [selected]);

  const album = useMemo(
    () => albums.find((a) => a.rkey === selected) || null,
    [albums, selected],
  );

  const media = useMemo(
    () => (album ? albumMedia(album, session?.did || '') : uploads),
    [album, uploads, session],
  );

  const handleLogin = useCallback(async (handle) => {
    // Narrow: two collections and image blobs. See ARENA_SCOPE.
    await authLogin(handle, { scope: ARENA_SCOPE });
  }, []);

  const handleLogout = useCallback(async () => {
    await authLogout();
    setSession(null);
    setUploads([]);
    setAlbums([]);
    setPdsMap({});
    setSelected(ALL_UPLOADS);
  }, []);

  const createAlbum = useCallback(async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy('creating the album…');
    try {
      await saveAlbum({ name, description: '', images: [] });
      setNewName('');
      setCreating(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [newName, load]);

  const destroyAlbum = useCallback(async (target) => {
    const n = (target.value.images || []).length;
    const warn = n
      ? `Delete the album “${target.value.name}”? The ${n} picture${n === 1 ? '' : 's'} in it stay in your repo.`
      : `Delete the album “${target.value.name}”?`;
    if (!window.confirm(warn)) return;
    setBusy('deleting…');
    try {
      await deleteRecord(ALBUM_COLLECTION, target.rkey);
      if (selected === target.rkey) setSelected(ALL_UPLOADS);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [selected, load]);

  const dropEntry = useCallback(async (item) => {
    if (!album) return;
    setBusy('removing…');
    try {
      await removeFromAlbum(album, item.index);
      setLightbox(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [album, load]);

  if (!ready) return <div className="route-loading">Loading albums…</div>;

  return (
    <div className="photo">
      <header className="photo-header">
        <div className="photo-title">
          <a href="/" className="photo-home" title="All tools">◉</a>
          <h1>albums</h1>
        </div>
        <div className="photo-header-right">
          {session ? (
            <div className="arena-auth">
              <span className="arena-auth-user">@{session.handle}</span>
              <button className="arena-auth-btn" onClick={handleLogout}>Sign out</button>
            </div>
          ) : null}
          {themeToggle}
        </div>
      </header>

      {error && <div className="photo-error" onClick={() => setError(null)}>{error}</div>}
      {busy && <div className="photo-status"><div className="photo-status-text">{busy}</div></div>}

      {!session ? (
        <SignIn onLogin={handleLogin} />
      ) : (
        <>
          <div className="arena-bar">
            <Uploader onDone={load} onError={setError} />
            <span className="arena-bar-note">
              Uploads land in your own repo. Nothing is stored here.
            </span>
          </div>

          <div className="arena-rail">
            <button
              className={`arena-album-chip${selected === ALL_UPLOADS ? ' active' : ''}`}
              onClick={() => setSelected(ALL_UPLOADS)}
            >
              All uploads<span className="arena-album-count">{uploads.length}</span>
            </button>

            {albums.map((a) => (
              <span key={a.rkey} className="arena-album-item">
                <button
                  className={`arena-album-chip${selected === a.rkey ? ' active' : ''}`}
                  onClick={() => setSelected(a.rkey)}
                >
                  {a.value.name}
                  <span className="arena-album-count">{(a.value.images || []).length}</span>
                </button>
                <button
                  className="arena-album-delete"
                  onClick={() => destroyAlbum(a)}
                  title={`Delete “${a.value.name}”`}
                  aria-label={`Delete album ${a.value.name}`}
                >
                  &times;
                </button>
              </span>
            ))}

            {creating ? (
              <form className="arena-album-form" onSubmit={createAlbum}>
                <input
                  type="text"
                  placeholder="Album name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="arena-btn-primary" disabled={!newName.trim()}>Create</button>
                <button type="button" className="arena-btn-small" onClick={() => setCreating(false)}>Cancel</button>
              </form>
            ) : (
              <button className="arena-btn-small" onClick={() => setCreating(true)}>+ New album</button>
            )}
          </div>

          {media.length > 0 ? (
            <Grid images={media} pdsUrlMap={pdsMap} onSelect={setLightbox} />
          ) : (
            <div className="photo-empty">
              <p>{album ? 'This album is empty.' : 'No uploads yet.'}</p>
              <p className="photo-empty-sub">
                {album
                  ? <>Add pictures from <a href="/explore">explore</a>, or make one in <a href="/shop/">shop</a> and save it here.</>
                  : <>Upload some, or make one in <a href="/shop/">shop</a> and save it here.</>}
              </p>
            </div>
          )}
        </>
      )}

      {lightbox && (
        <ArenaLightbox
          item={lightbox}
          pdsUrlMap={pdsMap}
          inAlbum={!!album}
          onRemove={() => dropEntry(lightbox)}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

/** Sign-in, with the same typeahead the explorer's handle box has. Typing your
 *  own handle from memory and getting it subtly wrong is a bad first move. */
function SignIn({ onLogin }) {
  const [handle, setHandle] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onLogin(handle.trim());
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="arena-signin">
      <h2>Your albums live on your PDS</h2>
      <p>
        Sign in with Bluesky to upload pictures and curate them. The records are
        written to your own repository — this site stores nothing and can be
        closed without losing anything.
      </p>
      <form className="arena-signin-form" onSubmit={submit}>
        <HandleTypeahead value={handle} onChange={setHandle} disabled={loading} autoFocus />
        <button type="submit" className="arena-btn-primary" disabled={loading || !handle.trim()}>
          {loading ? 'Connecting…' : 'Sign in'}
        </button>
      </form>
      {error && <div className="photo-error">{error}</div>}
      <p className="arena-signin-fine">
        The consent screen will ask for two things: writing
        <code>com.minomobi.arena.image</code> and <code>com.minomobi.arena.album</code>,
        and uploading images. Nothing else.
      </p>
    </div>
  );
}

function Uploader({ onDone, onError }) {
  const fileRef = useRef(null);
  const [progress, setProgress] = useState(null);

  const take = async (files) => {
    const images = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setProgress({ done: 0, total: images.length });
    let failed = 0;
    for (let i = 0; i < images.length; i++) {
      try {
        await uploadFile(images[i], { aspectRatio: await aspectOf(images[i]) });
      } catch (err) {
        failed++;
        onError?.(`${images[i].name}: ${err.message}`);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
    if (failed < images.length) onDone?.();
  };

  return (
    <div
      className="arena-upload"
      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('arena-drop-active'); take(e.dataTransfer.files); }}
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('arena-drop-active'); }}
      onDragLeave={(e) => e.currentTarget.classList.remove('arena-drop-active')}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => take(e.target.files)}
      />
      <button
        className="arena-upload-btn"
        onClick={() => fileRef.current?.click()}
        disabled={!!progress}
      >
        {progress ? `Uploading ${progress.done}/${progress.total}…` : 'Upload images'}
      </button>
      {progress && (
        <div className="arena-upload-progress">
          <div className="arena-upload-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function ArenaLightbox({ item, pdsUrlMap, inAlbum, onRemove, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const src = blobUrl(item, pdsUrlMap);
  return (
    <div className="photo-lightbox" onClick={onClose} role="presentation">
      <div
        className="photo-lightbox-inner"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={item.alt || 'Picture'}
      >
        <img src={src} alt={item.alt} />
        <div className="photo-lightbox-meta">
          {item.alt && <p className="photo-lightbox-alt">{item.alt}</p>}
          {item.provenance?.did && (
            <p className="photo-lightbox-date">
              from{' '}
              <a
                href={item.provenance.rkey
                  ? postUrl({ did: item.provenance.did, rkey: item.provenance.rkey })
                  : `https://bsky.app/profile/${item.provenance.did}`}
                target="_blank"
                rel="noopener noreferrer"
                className="photo-lightbox-link"
              >
                @{item.provenance.handle || item.provenance.did}
              </a>
            </p>
          )}
          <p className="photo-lightbox-actions">
            <a className="photo-lightbox-shop" href={shopUrl(src, { alt: item.alt })}>
              Open in shop <span aria-hidden="true">→</span>
            </a>
            {inAlbum && (
              <button className="arena-btn-small" onClick={onRemove}>
                Remove from album
              </button>
            )}
          </p>
        </div>
        <button className="photo-lightbox-close" onClick={onClose} ref={closeRef} aria-label="Close">
          &times;
        </button>
      </div>
    </div>
  );
}

function aspectOf(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
