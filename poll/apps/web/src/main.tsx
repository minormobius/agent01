import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { CreatePollPage } from './pages/CreatePoll';
import { PollPage } from './pages/Poll';
import { VotePage } from './pages/Vote';
import { AuditPage } from './pages/Audit';
import { AdminPage } from './pages/Admin';
import { DocsPage } from './pages/Docs';
import { QuickVotePage } from './pages/QuickVote';
import './styles.css';

/**
 * If the SPA handles an /api/* route, something is wrong with Worker routing.
 * Show a diagnostic page instead of a blank screen.
 */
function ApiDebug() {
  return (
    <div className="card" style={{ background: 'var(--error-bg, #2a0000)', border: '1px solid var(--error-color, #c33)' }}>
      <h3 style={{ color: 'var(--error-color, #c33)' }}>Routing Error</h3>
      <p>This page should have been handled by the API Worker, not the SPA.</p>
      <pre style={{ fontSize: '12px', overflow: 'auto', padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
        {window.location.href}
      </pre>
      <p className="muted" style={{ fontSize: '12px' }}>
        The Worker may still be deploying, or _routes.json isn't routing /api/* paths correctly.
        Try <a href="/api/debug/ping">GET /api/debug/ping</a> to check if the Worker is responding.
      </p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="card">
      <h3>Page not found</h3>
      <p className="muted">
        <code>{window.location.pathname}</code> doesn't match any route.
      </p>
    </div>
  );
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreatePollPage />} />
            <Route path="/poll/:id" element={<PollPage />} />
            <Route path="/poll/:id/vote" element={<VotePage />} />
            <Route path="/poll/:id/audit" element={<AuditPage />} />
            <Route path="/poll/:id/admin" element={<AdminPage />} />
            <Route path="/v/:id" element={<QuickVotePage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/api/*" element={<ApiDebug />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
