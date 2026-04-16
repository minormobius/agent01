import { useState } from 'react';

interface Props {
  onLogin: (handle: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: Props) {
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(handle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wave-login">
      <div className="wave-login-card">
        <h1>Wave</h1>
        <p>Wiki + collaboration on ATProto</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder="your.handle.bsky.social"
            required
            autoFocus
          />

          {error && <div className="wave-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Redirecting...' : 'Sign in with Bluesky'}
          </button>
        </form>
      </div>
    </div>
  );
}
