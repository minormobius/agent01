import React, { useState, useCallback, useEffect, useRef } from 'react';
import Terminal from './terminal/Terminal.jsx';
import { createSession, resolveIdentity, saveSession, clearSession, restoreSession } from './auth/oauth.js';
import { WSTransport } from './lib/ws-transport.js';
// Backend availability is probed at RUNTIME by the kimi/container commands
// (checkContainerHealth in lib/container-config.js) — no build-time gate.
import { CONTAINER_API_URL } from './lib/container-config.js';

export default function App() {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [containerStatus, setContainerStatus] = useState('disconnected');
  const transportRef = useRef(null);

  // Try to restore saved session on mount
  useEffect(() => {
    restoreSession()
      .then(sess => { if (sess) setSession(sess); })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, []);

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
    setSession(null);
  }, []);

  // opts: { apiKey?, boot? } — boot names an agent profile (e.g. 'kimi3') the
  // container should launch straight into instead of a bare bash prompt.
  const handleConnectContainer = useCallback((opts = {}) => {
    if (!session) return;

    // Session ID = user DID (one container per user)
    const sessionId = session.did;

    transportRef.current?.connect({
      cols: 80,
      rows: 24,
      session: sessionId,
      apiKey: opts.apiKey,
      boot: opts.boot,
      // PDS access token — the worker verifies this and checks the derived DID
      // against its allowlist before granting a shell.
      auth: session.accessJwt,
    });
  }, [session]);

  if (restoring) return null;

  return (
    <Terminal
      session={session}
      onLogin={handleLogin}
      onLogout={handleLogout}
      transport={transportRef.current}
      onConnectContainer={handleConnectContainer}
      containerStatus={containerStatus}
    />
  );
}
