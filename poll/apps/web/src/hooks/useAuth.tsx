import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, authStart, authLogout } from '../lib/api';

interface AuthState {
  did: string | null;
  handle: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (handle: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    did: null,
    handle: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    getMe()
      .then(user => setState({ did: user.did, handle: user.handle, loading: false, error: null }))
      .catch(() => setState({ did: null, handle: null, loading: false, error: null }));
  }, []);

  const login = useCallback(async (handle: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const result = await authStart(handle);
      if (result.session) {
        setState({ did: result.session.did, handle: result.session.handle, loading: false, error: null });
      } else if (result.authUrl) {
        window.location.href = result.authUrl;
      }
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const logout = useCallback(async () => {
    await authLogout().catch(() => {});
    setState({ did: null, handle: null, loading: false, error: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
