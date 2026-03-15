import React, { useState, useCallback } from 'react';
import Terminal from './terminal/Terminal.jsx';
import { createSession, resolveIdentity } from './auth/oauth.js';

export default function App() {
  const [session, setSession] = useState(null);

  const handleLogin = useCallback(async (handle, appPassword) => {
    const identity = await resolveIdentity(handle);
    const sess = await createSession(identity.pdsUrl, handle, appPassword);
    setSession({ ...sess, ...identity });
  }, []);

  const handleLogout = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <Terminal session={session} onLogin={handleLogin} onLogout={handleLogout} />
  );
}
