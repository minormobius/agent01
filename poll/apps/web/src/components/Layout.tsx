import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Layout({ children }: { children: React.ReactNode }) {
  const { did, handle, loading, login, logout } = useAuth();
  const [loginHandle, setLoginHandle] = useState('');

  return (
    <div className="container">
      <header>
        <h1><Link to="/">Anonymous Polls</Link></h1>
        <nav>
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
