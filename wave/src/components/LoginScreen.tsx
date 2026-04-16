import { useState } from 'react';
import type { AuthUser } from '../lib/auth';

interface Props {
  /** If session exists, user just needs passphrase (returned from OAuth redirect). */
  session?: AuthUser | null;
  onLogin: (handle: string, passphrase: string) => Promise<void>;
  onPassphrase: (passphrase: string) => Promise<void>;
}

export function LoginScreen({ session, onLogin, onPassphrase }: Props) {
  const [handle, setHandle] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const needsPassphraseOnly = !!session;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (needsPassphraseOnly) {
        await onPassphrase(passphrase);
      } else {
        await onLogin(handle, passphrase);
      }
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
        <p>Encrypted collaboration on ATProto</p>

        {needsPassphraseOnly && (
          <div className="wave-login-session">
            Signed in as <strong>@{session!.handle}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!needsPassphraseOnly && (
            <input
              type="text"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder="your.handle.bsky.social"
              required
            />
          )}

          <input
            type="password"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            placeholder="Vault passphrase"
            required
            minLength={8}
            autoFocus={needsPassphraseOnly}
          />
          <small>Encrypts your vault keys. Never leaves your browser.</small>

          {error && <div className="wave-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Unlocking...' : needsPassphraseOnly ? 'Unlock Vault' : 'Sign in with Bluesky'}
          </button>
        </form>
      </div>
    </div>
  );
}
