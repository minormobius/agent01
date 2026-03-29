import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Layout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, handle, logout } = useAuth();

  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="logo">audio.mino.mobi</Link>
        <nav>
          {isLoggedIn ? (
            <div className="auth-info">
              <span className="handle">@{handle}</span>
              <button onClick={logout} className="btn btn-small">Sign out</button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-small">Sign in</Link>
          )}
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
