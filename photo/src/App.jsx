import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import Landing from './components/Landing.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './App.css';

// App.jsx — routing and theme, and nothing else.
//
// `/` is now the surface's index rather than the explorer: fourteen tools had
// accumulated here with no way in but a URL you had to already know. The
// explorer moved to `#/explore`.
//
// Every route except the landing is behind `React.lazy`. That is not a
// micro-optimisation — the explorer pulls in DuckDB and the CAR parser, Sleuth
// pulls in the LLM client and the dossier prompts, CodeScan pulls in an OCR
// engine, and all of it used to ship to anyone who opened the front page.

const Explorer = lazy(() => import('./components/Explorer.jsx'));
const Thread = lazy(() => import('./components/Thread.jsx'));
const Sleuth = lazy(() => import('./components/Sleuth.jsx'));
const CodeScan = lazy(() => import('./components/CodeScan.jsx'));

// ---- Theme toggle ----
function useTheme() {
  const [theme, setThemeState] = useState(() => localStorage.getItem('atphoto-theme') || 'system');

  useEffect(() => {
    const resolved = theme === 'system' ? null : theme;
    if (resolved) document.documentElement.setAttribute('data-theme', resolved);
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('atphoto-theme', theme);
  }, [theme]);

  const isDark = theme === 'dark'
    || (theme === 'system' && typeof window !== 'undefined'
      && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggle = useCallback(() => setThemeState(isDark ? 'light' : 'dark'), [isDark]);

  return { theme, isDark, toggle };
}

function ThemeToggle({ isDark, onToggle }) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? '☀' : '☾'}
    </button>
  );
}

function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}

function Loading({ what }) {
  return <div className="route-loading">Loading {what}…</div>;
}

/** One lazy route: its own error boundary, its own suspense fallback. A crash
 *  in the explorer must not take the landing page — or the other tools — down. */
function Route({ name, children }) {
  return (
    <ErrorBoundary name={name}>
      <Suspense fallback={<Loading what={name} />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  const route = useHashRoute();
  const { isDark, toggle: toggleTheme } = useTheme();
  const themeToggle = <ThemeToggle isDark={isDark} onToggle={toggleTheme} />;

  if (route.startsWith('#/explore')) {
    return <Route name="explore"><Explorer themeToggle={themeToggle} /></Route>;
  }
  if (route.startsWith('#/thread')) {
    return (
      <Route name="thread">
        <div className="photo"><Thread themeToggle={themeToggle} /></div>
      </Route>
    );
  }
  if (route.startsWith('#/sleuth')) {
    return (
      <Route name="sleuth">
        <div className="photo"><Sleuth themeToggle={themeToggle} /></div>
      </Route>
    );
  }
  if (route.startsWith('#/codescan')) {
    return <Route name="codescan"><CodeScan themeToggle={themeToggle} /></Route>;
  }

  return <Landing themeToggle={themeToggle} />;
}
