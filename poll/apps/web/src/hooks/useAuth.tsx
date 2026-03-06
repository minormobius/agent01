import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, authStart, authLogout, authRefresh } from '../lib/api';

interface AuthState {
  did: string | null;
  handle: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (handle: string, appPassword?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// --- IndexedDB helpers for refresh token persistence ---

const DB_NAME = 'atpolls-auth';
const STORE_NAME = 'tokens';

function openTokenDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRefreshToken(token: string): Promise<void> {
  const db = await openTokenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(token, 'refreshToken');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getRefreshToken(): Promise<string | null> {
  const db = await openTokenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get('refreshToken');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function clearRefreshToken(): Promise<void> {
  const db = await openTokenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete('refreshToken');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    did: null,
    handle: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Try session cookie first, then fall back to refresh token
    getMe()
      .then(user => setState({ did: user.did, handle: user.handle, loading: false, error: null }))
      .catch(async () => {
        // Session expired — try refresh token from IndexedDB
        try {
          const token = await getRefreshToken();
          if (token) {
            const result = await authRefresh(token);
            if (result.session) {
              setState({ did: result.session.did, handle: result.session.handle, loading: false, error: null });
              return;
            }
          }
        } catch {
          // Refresh failed — token expired or revoked
          await clearRefreshToken().catch(() => {});
        }
        setState({ did: null, handle: null, loading: false, error: null });
      });
  }, []);

  const login = useCallback(async (handle: string, appPassword?: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const result = await authStart(handle, appPassword);
      if (result.session) {
        // Persist refresh token for PWA long-lived auth
        if (result.refreshToken) {
          await saveRefreshToken(result.refreshToken).catch(() => {});
        }
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
    await clearRefreshToken().catch(() => {});
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
