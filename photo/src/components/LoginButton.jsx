import { useState } from 'react';

export default function LoginButton({ session, onLogin, onLogout }) {
  const [showModal, setShowModal] = useState(false);
  const [handle, setHandle] = useState('');
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
      await onLogin(handle);
      // Browser redirects to Bluesky — won't reach here
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <>
      <button className="arena-auth-btn" onClick={() => setShowModal(true)}>
        Sign in
      </button>

      {showModal && (
        <div className="arena-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="arena-modal" onClick={e => e.stopPropagation()}>
            <h2>Sign in with Bluesky</h2>
            <p className="arena-modal-sub">
              Sign in to upload images and manage albums on your ATProto PDS.
            </p>

            <form onSubmit={handleSubmit}>
              <label className="arena-field">
                <span>Handle</span>
                <input
                  type="text"
                  value={handle}
                  onChange={e => setHandle(e.target.value)}
                  placeholder="you.bsky.social"
                  disabled={loading}
                  autoFocus
                />
              </label>

              {error && <div className="arena-modal-error">{error}</div>}

              <div className="arena-modal-actions">
                <button type="button" onClick={() => setShowModal(false)} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="arena-btn-primary" disabled={loading || !handle}>
                  {loading ? 'Connecting...' : 'Sign in with Bluesky'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
