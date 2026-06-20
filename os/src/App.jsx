import React, { useState, useCallback, useEffect, useRef } from 'react';
import Terminal from './terminal/Terminal.jsx';
import { createSession, resolveIdentity, saveSession, clearSession, restoreSession } from './auth/oauth.js';
import { WSTransport } from './lib/ws-transport.js';

// Container API endpoint. The os-api Cloudflare Containers backend is NOT
// deployed by default (it builds a Docker image + provisions paid container
// instances — see deploy-os-api.yml). When no backend is configured we ship the
// PDS shell standalone and leave the `container` command cleanly disabled
// rather than dangle a dead WebSocket that retries for 15s and then fails.
// To enable it, set VITE_CONTAINER_API_URL at build time once os-api is live.
const CONTAINER_API_URL = (
  import.meta.env.VITE_CONTAINER_API_URL ||
  (location.hostname === 'localhost' ? 'ws://localhost:8787' : null)
);
const CONTAINER_ENABLED = Boolean(CONTAINER_API_URL);

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

  // Create transport once — only when a container backend is configured.
  useEffect(() => {
    if (!CONTAINER_ENABLED) return;
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

  const handleConnectContainer = useCallback((apiKey) => {
    if (!session) return;

    // Session ID = user DID (one container per user)
    const sessionId = session.did;

    transportRef.current?.connect({
      cols: 80,
      rows: 24,
      session: sessionId,
      apiKey,
    });
  }, [session]);

  if (restoring) return null;

  return (
    <Terminal
      session={session}
      onLogin={handleLogin}
      onLogout={handleLogout}
      transport={transportRef.current}
      onConnectContainer={CONTAINER_ENABLED ? handleConnectContainer : null}
      containerStatus={containerStatus}
    />
  );
}
