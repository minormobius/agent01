import React, { useState, useCallback, useEffect, useRef } from 'react';
import Terminal from './terminal/Terminal.jsx';
import LoginOverlay from './LoginOverlay.jsx';
import { createSession, resolveIdentity, saveSession, clearSession, restoreSession } from './auth/oauth.js';
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
async function oauthSession(user) {
  const identity = await resolveIdentity(user.handle); // handle → did + pdsUrl
  return {
    did: user.did || identity.did,
    handle: user.handle,
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

  // opts: { apiKey?, boot? } — boot names an agent profile (e.g. 'kimi3') the
  // container should launch straight into instead of a bare bash prompt.
  const handleConnectContainer = useCallback((opts = {}) => {
    if (!session) return;

    let authParam, authMode;
    if (session.authMode === 'oauth') {
      // os-api verifies this bearer against auth.mino.mobi/api/me (the
      // scores-worker pattern). Cookie-only SSO has no local token, and the
      // .mino.mobi cookie can't reach os-api.minomobi.com (different
      // registrable domain) — so link this origin once via an OAuth bounce.
      const token = auth.getToken();
      if (!token) {
        auth.login(session.handle, { returnTo: window.location.href }).catch(() => {});
        return;
      }
      authParam = token;
      authMode = 'oauth';
    } else {
      // App-password: the PDS accessJwt, verified by os-api against the PDS.
      authParam = session.accessJwt;
      authMode = 'pds';
    }

    transportRef.current?.connect({
      cols: 80,
      rows: 24,
      session: session.did,
      apiKey: opts.apiKey,
      boot: opts.boot,
      auth: authParam,
      authMode,
    });
  }, [session]);

  if (restoring) return null;

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
