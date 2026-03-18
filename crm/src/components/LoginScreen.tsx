import { useState } from "react";

interface Props {
  onLogin: (service: string, handle: string, appPassword: string, vaultPassphrase: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: Props) {
  const [service, setService] = useState("https://bsky.social");
  const [handle, setHandle] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onLogin(service, handle, appPassword, passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Vault CRM</h1>
        <p className="subtitle">End-to-end encrypted deals on ATProto</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="service">PDS Service</label>
            <input
              id="service"
              type="url"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="https://bsky.social"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="handle">Handle</label>
            <input
              id="handle"
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="you.bsky.social"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="appPassword">App Password</label>
            <input
              id="appPassword"
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              required
            />
          </div>

          <hr />

          <div className="field">
            <label htmlFor="passphrase">Vault Passphrase</label>
            <input
              id="passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Your encryption passphrase"
              required
              minLength={8}
            />
            <small>
              This never leaves your browser. It encrypts your data before
              it reaches the PDS.
            </small>
          </div>

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Unlocking..." : "Unlock Vault"}
          </button>
        </form>
      </div>
    </div>
  );
}
