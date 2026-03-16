import React, { useState, useCallback, useEffect } from 'react';
import Terminal from './terminal/Terminal.jsx';
import { createSession, resolveIdentity, saveSession, clearSession, restoreSession } from './auth/oauth.js';

export default function App() {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);

  // Try to restore saved session on mount
  useEffect(() => {
    restoreSession()
      .then(sess => { if (sess) setSession(sess); })
      .catch(() => {}) // refresh failed — user will see login prompt
      .finally(() => setRestoring(false));
  }, []);

  const handleLogin = useCallback(async (handle, appPassword) => {
    const identity = await resolveIdentity(handle);
    const sess = await createSession(identity.pdsUrl, handle, appPassword);
    const fullSession = { ...sess, ...identity };
    saveSession(fullSession);
    setSession(fullSession);
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  if (restoring) return null; // don't flash login while restoring

  return (
    <Terminal session={session} onLogin={handleLogin} onLogout={handleLogout} />
  );
}
