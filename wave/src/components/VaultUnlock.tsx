import { useState } from 'react';

interface Props {
  onUnlock: (passphrase: string) => Promise<void>;
  onCancel: () => void;
}

export function VaultUnlock({ onUnlock, onCancel }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onUnlock(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
      setLoading(false);
    }
  };

  return (
    <div className="wave-vault-overlay">
      <div className="wave-vault-modal">
        <h2>Unlock Vault</h2>
        <p>Enter your passphrase to access encrypted org channels.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            placeholder="Vault passphrase"
            required
            minLength={8}
            autoFocus
          />
          <small>Encrypts your vault keys. Never leaves your browser.</small>

          {error && <div className="wave-error">{error}</div>}

          <div className="wave-vault-actions">
            <button type="submit" className="wave-btn-primary" disabled={loading}>
              {loading ? 'Unlocking...' : 'Unlock'}
            </button>
            <button type="button" className="wave-btn-sm" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
