import { useState } from "react";
import { ThemePicker } from "./ThemePicker";
import type { Session } from "../types";

interface Props {
  onLogin: (handle: string, passphrase: string) => Promise<void>;
  /** If provided, user already has an OAuth session — only ask for passphrase. */
  session?: Session | null;
  /** Optional heading override for onboarding flow */
  heading?: string;
  subtitle?: string;
}

export function LoginScreen({ onLogin, session, heading, subtitle }: Props) {
  const [handle, setHandle] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passphraseOnly = !!session;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphraseOnly && !handle.trim()) return;
    if (!passphrase.trim()) return;
    setError("");
    setLoading(true);
    try {
      await onLogin(passphraseOnly ? session!.handle : handle.trim(), passphrase.trim());
      // If OAuth: browser redirects, won't reach here
      // If passphrase-only: bootstrapVault runs and state updates
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-theme-picker"><ThemePicker /></div>
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>{heading ?? "Org Hub"}</h1>
        <p className="subtitle">
          {subtitle ?? (passphraseOnly
            ? `Signed in as @${session!.handle}. Enter your vault passphrase to continue.`
            : "Sign in with your Bluesky account to manage organizations.")}
        </p>

        {!passphraseOnly && (
          <div className="field">
            <label htmlFor="handle">Handle</label>
            <input
              id="handle"
              placeholder="you.bsky.social"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
          </div>
        )}

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
          {loading ? "Connecting..." : passphraseOnly ? "Unlock Vault" : "Sign in with Bluesky"}
        </button>
      </form>
    </div>
  );
}
