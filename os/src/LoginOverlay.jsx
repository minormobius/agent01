// Login overlay — HTML inputs instead of xterm typing (mobile paste/password
// managers/autocomplete all work). Typeahead lifted from wave's
// HandleTypeahead; auth via the shared OAuth worker (auth.mino.mobi).
// App-password stays as the collapsible fallback (it's the only mode that can
// write ARBITRARY collections — OAuth is bounded by the granted scope).

import React, { useState, useRef, useCallback, useEffect } from 'react';

const TYPEAHEAD_API = 'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead';
const DEBOUNCE_MS = 200;
const LIMIT = 6;

const S = {
  wrap: {
    position: 'fixed', inset: 0, zIndex: 50,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(10,10,10,0.88)', backdropFilter: 'blur(2px)',
    fontFamily: '"Berkeley Mono", "JetBrains Mono", "Fira Code", monospace',
  },
  card: {
    width: 'min(420px, calc(100vw - 32px))',
    background: '#111', border: '1px solid #2a2a2a', borderRadius: 10,
    padding: '22px 20px', color: '#c0c0c0',
  },
  title: { color: '#56b6c2', fontSize: 15, fontWeight: 700, marginBottom: 2 },
  sub: { color: '#707070', fontSize: 12, marginBottom: 16 },
  label: { color: '#808080', fontSize: 11, marginBottom: 6, display: 'block' },
  input: {
    width: '100%', boxSizing: 'border-box',
    background: '#0a0a0a', border: '1px solid #333', borderRadius: 6,
    color: '#e0e0e0', fontSize: 15, padding: '10px 12px',
    fontFamily: 'inherit', outline: 'none',
  },
  drop: {
    position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4,
    background: '#161616', border: '1px solid #333', borderRadius: 6,
    overflow: 'hidden', zIndex: 10, maxHeight: 264, overflowY: 'auto',
  },
  item: (active) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
    cursor: 'pointer', background: active ? '#1f2a2d' : 'transparent',
  }),
  av: { width: 28, height: 28, borderRadius: '50%', background: '#222', flexShrink: 0 },
  name: { fontSize: 12, color: '#c0c0c0' },
  handle: { fontSize: 12, color: '#56b6c2' },
  btn: (primary) => ({
    width: '100%', boxSizing: 'border-box', marginTop: 12,
    padding: '11px 12px', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
    cursor: 'pointer',
    background: primary ? '#1a3b40' : 'transparent',
    border: primary ? '1px solid #2e6a73' : '1px solid #333',
    color: primary ? '#7fd7e0' : '#808080',
  }),
  err: { color: '#e06c75', fontSize: 12, marginTop: 10, wordBreak: 'break-word' },
  foot: { color: '#555', fontSize: 11, marginTop: 14, textAlign: 'center' },
};

export default function LoginOverlay({ onOAuthLogin, onAppPasswordLogin }) {
  const [handle, setHandle] = useState('');
  const [actors, setActors] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showAppPw, setShowAppPw] = useState(false);
  const [appPw, setAppPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef();

  const search = useCallback((q) => {
    if (q.length < 2) { setActors([]); setOpen(false); return; }
    fetch(`${TYPEAHEAD_API}?q=${encodeURIComponent(q)}&limit=${LIMIT}`)
      .then((r) => r.json())
      .then((data) => {
        const results = data.actors || [];
        setActors(results);
        setActiveIdx(-1);
        setOpen(results.length > 0);
      })
      .catch(() => {});
  }, []);

  const onInput = useCallback((e) => {
    const val = e.target.value;
    setHandle(val);
    setError('');
    clearTimeout(timerRef.current);
    const q = val.trim().replace(/^@/, '');
    timerRef.current = setTimeout(() => search(q), DEBOUNCE_MS);
  }, [search]);

  const select = useCallback((actor) => {
    setHandle(actor.handle);
    setOpen(false);
    setActors([]);
  }, []);

  const submit = useCallback(async (mode) => {
    const h = handle.trim().replace(/^@/, '');
    if (!h) { setError('enter a handle'); return; }
    setBusy(true);
    setError('');
    try {
      if (mode === 'oauth') {
        await onOAuthLogin(h); // redirects away on success
      } else {
        await onAppPasswordLogin(h, appPw);
      }
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  }, [handle, appPw, onOAuthLogin, onAppPasswordLogin]);

  const onKeyDown = useCallback((e) => {
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, actors.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(actors[activeIdx]); return; }
      if (e.key === 'Escape') { setOpen(false); return; }
    }
    if (e.key === 'Enter' && !showAppPw) submit('oauth');
  }, [open, actors, activeIdx, select, submit, showAppPw]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.title}>os.mino</div>
        <div style={S.sub}>sign in with your Bluesky account</div>

        <label style={S.label}>handle</label>
        <div style={{ position: 'relative' }}>
          <input
            style={S.input}
            type="text"
            value={handle}
            onChange={onInput}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="alice.bsky.social"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            disabled={busy}
          />
          {open && (
            <div style={S.drop}>
              {actors.map((a, i) => (
                <div
                  key={a.did}
                  style={S.item(i === activeIdx)}
                  onMouseDown={(e) => { e.preventDefault(); select(a); }}
                >
                  {a.avatar
                    ? <img style={S.av} src={a.avatar} alt="" loading="lazy" />
                    : <div style={S.av} />}
                  <div>
                    {a.displayName && <div style={S.name}>{a.displayName}</div>}
                    <div style={S.handle}>@{a.handle}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!showAppPw && (
          <>
            <button style={S.btn(true)} disabled={busy} onClick={() => submit('oauth')}>
              {busy ? 'redirecting…' : 'Continue with Bluesky'}
            </button>
            <button style={S.btn(false)} disabled={busy} onClick={() => setShowAppPw(true)}>
              use app password instead
            </button>
          </>
        )}

        {showAppPw && (
          <>
            <label style={{ ...S.label, marginTop: 12 }}>app password</label>
            <input
              style={S.input}
              type="password"
              value={appPw}
              onChange={(e) => { setAppPw(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit('apppw'); }}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              autoComplete="current-password"
              disabled={busy}
            />
            <button style={S.btn(true)} disabled={busy} onClick={() => submit('apppw')}>
              {busy ? 'authenticating…' : 'Sign in'}
            </button>
            <button style={S.btn(false)} disabled={busy} onClick={() => { setShowAppPw(false); setError(''); }}>
              back to Bluesky sign-in
            </button>
          </>
        )}

        {error && <div style={S.err}>{error}</div>}
        <div style={S.foot}>
          OAuth signs in via auth.mino.mobi (SSO across mino.mobi).<br />
          App password unlocks writes to arbitrary collections.
        </div>
      </div>
    </div>
  );
}
