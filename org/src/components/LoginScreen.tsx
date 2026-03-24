import { useState } from "react";

interface Props {
  onLogin: (service: string, handle: string, appPassword: string, passphrase: string) => Promise<void>;
  /** Optional heading override for onboarding flow */
  heading?: string;
  subtitle?: string;
}

export function LoginScreen({ onLogin, heading, subtitle }: Props) {
  const [service, setService] = useState("https://bsky.social");
  const [handle, setHandle] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !appPassword.trim() || !passphrase.trim()) return;
    setError("");
    setLoading(true);
    try {
      await onLogin(service, handle.trim(), appPassword.trim(), passphrase.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>{heading ?? "Org Hub"}</h1>
        <p className="subtitle">{subtitle ?? "Sign in with your ATProto account to manage organizations."}</p>

        <div className="field">
          <label htmlFor="service">PDS Service</label>
          <input id="service" value={service} onChange={(e) => setService(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="handle">Handle</label>
          <input
            id="handle"
            placeholder="you.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="app-password">App Password</label>
          <input
            id="app-password"
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
          />
        </div>

        <hr className="separator" />

        <div className="field">
          <label htmlFor="passphrase">Vault Passphrase</label>
          <input
            id="passphrase"
            type="password"
            placeholder="min 8 characters"
            minLength={8}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Connecting..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
