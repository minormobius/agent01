import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import Landing from './components/Landing.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { normalizeLegacyHash, routeName } from './lib/route.js';
import './App.css';

// App.jsx — routing and theme, and nothing else.
//
// `/` is the surface's index: fourteen tools had accumulated here with no way
// in but a URL you had to already know.
//
// The five applications behind it are **real paths** — `/explore`, `/albums`,
// `/thread`, `/sleuth`, `/codescan` — not fragments. See `lib/route.js` for why
// and for the legacy-URL rewrite; `worker.js` serves this page for each of
// them, off the same list in `lib/catalogue.js`.
//
// Every route except the landing is behind `React.lazy`. That is not a
// micro-optimisation — the explorer pulls in DuckDB and the CAR parser, Sleuth
// pulls in the LLM client and the dossier prompts, CodeScan pulls in an OCR
// engine, and all of it used to ship to anyone who opened the front page.

// Runs on import, before React renders and before any route reads the URL, so
// a shared `#/explore?u=alice` link lands on `/explore?u=alice`.
normalizeLegacyHash();

const Explorer = lazy(() => import('./components/Explorer.jsx'));
const Arena = lazy(() => import('./components/Arena.jsx'));
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

/**
 * The current route, as a bare name (`explore`, `''` for the landing page).
 *
 * There is no client-side router: moving between these tools is a full
 * navigation on purpose (see `lib/route.js`). `popstate` is still watched so
 * that a route which rewrites its own URL — the explorer keeps its whole view
 * state in the query string — survives the back button without a reload.
 */
function useRoute() {
  const [name, setName] = useState(() => routeName(window.location.pathname));
  useEffect(() => {
    const handler = () => setName(routeName(window.location.pathname));
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  return name;
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
  const route = useRoute();
  const { isDark, toggle: toggleTheme } = useTheme();
  const themeToggle = <ThemeToggle isDark={isDark} onToggle={toggleTheme} />;

  switch (route) {
    case 'explore':
      return <Route name="explore"><Explorer themeToggle={themeToggle} /></Route>;
    case 'albums':
      return <Route name="albums"><Arena themeToggle={themeToggle} /></Route>;
    case 'thread':
      return (
        <Route name="thread">
          <div className="photo"><Thread themeToggle={themeToggle} /></div>
        </Route>
      );
    case 'sleuth':
      return (
        <Route name="sleuth">
          <div className="photo"><Sleuth themeToggle={themeToggle} /></div>
        </Route>
      );
    case 'codescan':
      return <Route name="codescan"><CodeScan themeToggle={themeToggle} /></Route>;
    default:
      return <Landing themeToggle={themeToggle} />;
  }
}
