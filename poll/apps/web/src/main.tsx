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
import './styles.css';

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
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
