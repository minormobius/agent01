import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { did, handle, loading, login, logout } = useAuth();
  const [loginHandle, setLoginHandle] = useState('');
  const theme = useTheme();

  return (
    <div className="container">
      <header>
        <h1><Link to="/">Anonymous Polls</Link></h1>
        <nav>
          <button className="theme-toggle" onClick={theme.toggle} title={theme.dark ? 'Light mode' : 'Dark mode'}>
            {theme.dark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          <Link to="/docs">Docs</Link>
          <Link to="/create">Create</Link>
          {loading ? (
            <span className="muted">...</span>
          ) : did ? (
            <>
              <span className="muted">{handle}</span>
              <button className="btn btn-secondary" onClick={logout} style={{ padding: '4px 10px', fontSize: '12px' }}>
                Logout
              </button>
            </>
          ) : (
            <div className="login-form">
              <input
                type="text"
                placeholder="handle.bsky.social"
                value={loginHandle}
                onChange={e => setLoginHandle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loginHandle && login(loginHandle)}
                style={{ width: '180px' }}
              />
              <button
                className="btn btn-primary"
                onClick={() => loginHandle && login(loginHandle)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                Login
              </button>
            </div>
          )}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
