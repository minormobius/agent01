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

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pwa-install-dismissed') === 'true'
  );
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  return { canShow: !!deferredPrompt && !dismissed && !isInstalled, install, dismiss };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { did, handle, loading, logout } = useAuth();
  const theme = useTheme();
  const pwa = useInstallPrompt();

  return (
    <div className="container">
      {pwa.canShow && (
        <div className="install-banner">
          <span>Install ATPolls for one-tap voting</span>
          <div className="flex gap-8">
            <button className="btn" onClick={pwa.install}>Install</button>
            <button className="dismiss-btn" onClick={pwa.dismiss}>&times;</button>
          </div>
        </div>
      )}
      <header>
        <h1><Link to="/">ATPolls</Link></h1>
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
          {!loading && did && (
            <>
              <span className="muted">{handle}</span>
              <button className="btn btn-secondary" onClick={logout} style={{ padding: '4px 10px', fontSize: '12px' }}>
                Logout
              </button>
            </>
          )}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

export function AuthCard({ returnTo }: { returnTo?: string } = {}) {
  const { did, handle, loading, error, login, loginOAuth, logout } = useAuth();
  const [loginHandle, setLoginHandle] = useState('');
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [appPassword, setAppPassword] = useState('');

  const doOAuth = () => {
    if (loginHandle) loginOAuth(loginHandle, returnTo);
  };

  const doAppPasswordLogin = () => {
    if (loginHandle && appPassword) {
      login(loginHandle, appPassword);
      setAppPassword('');
    }
  };

  if (loading) return null;

  if (did) {
    return (
      <div className="card auth-card">
        <div className="auth-card-inner">
          <span>Signed in as <strong>{handle}</strong></span>
          <button className="btn btn-secondary" onClick={logout} style={{ padding: '4px 10px', fontSize: '12px' }}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Sign in with Bluesky</h3>
      <p className="muted mb-12">
        Enter your Bluesky handle to sign in securely via OAuth.
      </p>
      <div className="auth-form">
        <input
          type="text"
          placeholder="handle.bsky.social"
          value={loginHandle}
          onChange={e => setLoginHandle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doOAuth()}
        />
        <button className="btn btn-primary" onClick={doOAuth}>
          Sign in with Bluesky
        </button>
      </div>
      {!showAppPassword && (
        <p className="muted" style={{ marginTop: 8, fontSize: '12px' }}>
          <button
            onClick={() => setShowAppPassword(true)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: '12px' }}
          >
            Use app password instead
          </button>
        </p>
      )}
      {showAppPassword && (
        <div className="auth-form" style={{ marginTop: 8 }}>
          <input
            type="password"
            placeholder="App password"
            value={appPassword}
            onChange={e => setAppPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doAppPasswordLogin()}
          />
          <button className="btn btn-secondary" onClick={doAppPasswordLogin}>
            Sign in with app password
          </button>
          <p className="muted" style={{ fontSize: '11px', marginTop: 4 }}>
            Generate one at <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer">bsky.app/settings/app-passwords</a>
          </p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
