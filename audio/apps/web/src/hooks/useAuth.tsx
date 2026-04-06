/**
 * ATProto auth context — manages login state.
 * Uses app-password auth (same pattern as poll).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin } from '../lib/api';

interface AuthState {
  token: string | null;
  did: string | null;
  handle: string | null;
  displayName?: string;
  avatarUrl?: string;
}

interface AuthContextValue extends AuthState {
  login: (handle: string, appPassword: string) => Promise<void>;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextValue>(null!);

const STORAGE_KEY = 'audio-rooms-auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return { token: null, did: null, handle: null };
  });

  useEffect(() => {
    if (auth.token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [auth]);

  const login = useCallback(async (handle: string, appPassword: string) => {
    const res = await apiLogin(handle, appPassword);
    setAuth({
      token: res.session.sessionId,
      did: res.session.did,
      handle: res.session.handle,
      displayName: res.session.displayName,
      avatarUrl: res.session.avatarUrl,
    });
  }, []);

  const logout = useCallback(() => {
    setAuth({ token: null, did: null, handle: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout, isLoggedIn: !!auth.token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
