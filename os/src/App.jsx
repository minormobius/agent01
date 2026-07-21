import React, { useState, useCallback, useEffect, useRef } from 'react';
import Terminal from './terminal/Terminal.jsx';
import ChatView from './ChatView.jsx';
import LoginOverlay from './LoginOverlay.jsx';
import { createSession, resolveIdentity, describeDid, saveSession, clearSession, restoreSession } from './auth/oauth.js';
import { AuthClient } from '../../packages/oauth-client/auth.js';
import { WSTransport } from './lib/ws-transport.js';
// Backend availability is probed at RUNTIME by the kimi/container commands
// (checkContainerHealth in lib/container-config.js) — no build-time gate.
import { CONTAINER_API_URL } from './lib/container-config.js';

// Shared OAuth client (auth.mino.mobi). Module-level singleton: one instance
// across renders, and the .mino.mobi SSO cookie means a session minted on ANY
// mino.mobi site is picked up here with zero typing.
const auth = new AuthClient();

// Build the os session object for an OAuth user. Same shape the shell expects,
// with authMode/authClient so XRPCClient routes writes through the auth
// worker's /pds/* proxy (reads stay public XRPC straight to the PDS).
// Robust to the auth worker returning a DID in the handle field (observed in
// prod): resolve from whichever identifier we actually have.
async function oauthSession(user) {
  const raw = (user.handle || '').trim();
  const did = user.did || (raw.startsWith('did:') ? raw : null);

  if (raw && !raw.startsWith('did:')) {
    // Normal case: a real handle.
    const identity = await resolveIdentity(raw); // handle → did + pdsUrl
    return {
      did: did || identity.did,
      handle: raw,
      pdsUrl: identity.pdsUrl,
      accessJwt: null,
      authMode: 'oauth',
      authClient: auth,
    };
  }

  if (!did) throw new Error('auth session has neither handle nor DID');
  // Handle field held a DID (or was empty): resolve the DID document directly
  // and recover the true handle from alsoKnownAs.
  const identity = await describeDid(did);
  return {
    did,
    handle: identity.handle || did,
    pdsUrl: identity.pdsUrl,
    accessJwt: null,
    authMode: 'oauth',
    authClient: auth,
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [containerStatus, setContainerStatus] = useState('disconnected');
  const [bootLog, setBootLog] = useState([]);
  // Default surface is the CHAT with the agent; the terminal (full PDS shell +
  // PTY container) is the power mode, one tap away.
  const [view, setView] = useState('chat');
  const transportRef = useRef(null);

  // Session bootstrap. Every step logs into bootLog, which the login overlay
  // renders — a silent bounce back to the login screen was undebuggable.
  // Priority order:
  //   1. A fresh OAuth callback (?__auth_session) — must be consumed FIRST, or
  //      a stale app-password session in localStorage shadows the login the
  //      user just completed.
  //   2. Saved app-password session (power mode).
  //   3. Shared OAuth session: stored token or the .mino.mobi SSO cookie.
  const bootstrap = useCallback(async () => {
    const notes = [];
    setRestoring(true);
    try {
      const hasCallback = new URL(window.location.href).searchParams.has('__auth_session');
      let user = null;

      if (hasCallback) {
        notes.push('oauth callback: token received');
        user = await auth.init();
        notes.push(user?.handle
          ? `oauth: session valid — @${user.handle}`
          : 'oauth: auth worker rejected the callback token');
      }

      if (!user) {
        const saved = await restoreSession().catch((e) => {
          notes.push(`app-password restore failed: ${e.message}`);
          return null;
        });
        if (saved) { setSession(saved); return; }
        if (!hasCallback) {
          user = await auth.init();
          notes.push(user?.handle
            ? `sso: existing session — @${user.handle}`
            : 'sso: no existing session');
        }
      }

      if (user?.handle) {
        try {
          setSession(await oauthSession(user));
          return;
        } catch (e) {
          notes.push(`identity resolution failed: ${e.message}`);
        }
      }
    } catch (e) {
      notes.push(`boot error: ${e.message}`);
    } finally {
      setBootLog(notes);
      setRestoring(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // Create transport once.
  useEffect(() => {
    transportRef.current = new WSTransport({
      url: CONTAINER_API_URL,
      onStatus: setContainerStatus,
    });

    return () => {
      transportRef.current?.disconnect();
    };
  }, []);

  // OAuth login — redirects the page to Bluesky consent and back.
  const handleOAuthLogin = useCallback(async (handle) => {
    await auth.login(handle, { returnTo: window.location.href });
  }, []);

  // App-password login (fallback / power mode).
  const handleLogin = useCallback(async (handle, appPassword) => {
    const identity = await resolveIdentity(handle);
    const sess = await createSession(identity.pdsUrl, handle, appPassword);
    const fullSession = { ...sess, ...identity };
    saveSession(fullSession);
    setSession(fullSession);
  }, []);

  const handleLogout = useCallback(() => {
    transportRef.current?.disconnect();
    clearSession();
    if (session?.authMode === 'oauth') auth.logout().catch(() => {});
    setSession(null);
  }, [session]);

  // Credential for os-api (/ws PTY and /chat agent). Returns null after
  // kicking off an OAuth bounce when a cookie-only SSO session has no local
  // token (the .mino.mobi cookie can't reach os-api.minomobi.com — different
  // registrable domain — so this origin needs its own bearer once).
  const getContainerAuth = useCallback(() => {
    if (!session) return null;
    if (session.authMode === 'oauth') {
      const token = auth.getToken();
      if (!token) {
        auth.login(session.handle, { returnTo: window.location.href }).catch(() => {});
        return null;
      }
      return { auth: token, authMode: 'oauth' };
    }
    return { auth: session.accessJwt, authMode: 'pds' };
  }, [session]);

  // opts: { apiKey?, boot? } — boot names an agent profile (e.g. 'kimi3') the
  // container should launch straight into instead of a bare bash prompt.
  const handleConnectContainer = useCallback((opts = {}) => {
    if (!session) return;
    const authInfo = getContainerAuth();
    if (!authInfo) return;

    transportRef.current?.connect({
      cols: 80,
      rows: 24,
      session: session.did,
      apiKey: opts.apiKey,
      boot: opts.boot,
      ...authInfo,
    });
  }, [session, getContainerAuth]);

  if (restoring) return null;

  // Signed in + chat view (the default): the main page IS the agent chat.
  if (session && view === 'chat') {
    return (
      <ChatView
        session={session}
        getContainerAuth={getContainerAuth}
        profile="kimi3"
        onOpenTerminal={() => setView('terminal')}
        onLogout={handleLogout}
      />
    );
  }

  // Terminal view (power mode) or the login state (terminal behind overlay).
  return (
    <>
      <Terminal
        session={session}
        onLogin={handleLogin}
        onLogout={handleLogout}
        transport={transportRef.current}
        onConnectContainer={handleConnectContainer}
        containerStatus={containerStatus}
      />
      {session && (
        <button
          onClick={() => setView('chat')}
          style={{
            position: 'fixed', top: 8, left: 12, zIndex: 10,
            background: '#161616', border: '1px solid #2a2a2a', borderRadius: 6,
            color: '#7fd7e0', fontSize: 11, padding: '4px 10px', cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          ← chat
        </button>
      )}
      {!session && (
        <LoginOverlay
          onOAuthLogin={handleOAuthLogin}
          onAppPasswordLogin={handleLogin}
          onRecheck={bootstrap}
          diagnostics={bootLog}
        />
      )}
    </>
  );
}
