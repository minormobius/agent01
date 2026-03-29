import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(handle, appPassword);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>Sign in with Bluesky</h2>
      <p className="muted">Use an app password from your Bluesky account settings.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="handle">Handle</label>
          <input
            id="handle"
            type="text"
            placeholder="you.bsky.social"
            value={handle}
            onChange={e => setHandle(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">App Password</label>
          <input
            id="password"
            type="password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={appPassword}
            onChange={e => setAppPassword(e.target.value)}
            required
          />
        </div>

        {error && <div className="error">{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
