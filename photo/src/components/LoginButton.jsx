import { useState } from 'react';

export default function LoginButton({ session, onLogin, onLogout }) {
  const [showModal, setShowModal] = useState(false);
  const [service, setService] = useState('https://bsky.social');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (session) {
    return (
      <div className="arena-auth">
        <span className="arena-auth-user">@{session.handle}</span>
        <button className="arena-auth-btn" onClick={onLogout}>Log out</button>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(service, identifier, password);
      setShowModal(false);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button className="arena-auth-btn" onClick={() => setShowModal(true)}>
        Log in
      </button>

      {showModal && (
        <div className="arena-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="arena-modal" onClick={e => e.stopPropagation()}>
            <h2>Log in to your PDS</h2>
            <p className="arena-modal-sub">
              Use an app password to upload images and manage albums on your ATProto PDS.
            </p>

            <form onSubmit={handleSubmit}>
              <label className="arena-field">
                <span>PDS Service</span>
                <input
                  type="text"
                  value={service}
                  onChange={e => setService(e.target.value)}
                  placeholder="https://bsky.social"
                  disabled={loading}
                />
              </label>

              <label className="arena-field">
                <span>Handle or DID</span>
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="you.bsky.social"
                  disabled={loading}
                  autoFocus
                />
              </label>

              <label className="arena-field">
                <span>App password</span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  disabled={loading}
                />
              </label>

              {error && <div className="arena-modal-error">{error}</div>}

              <div className="arena-modal-actions">
                <button type="button" onClick={() => setShowModal(false)} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="arena-btn-primary" disabled={loading || !identifier || !password}>
                  {loading ? 'Logging in...' : 'Log in'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
