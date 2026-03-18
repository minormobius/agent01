import { useState } from "react";
import { DocsPage } from "./DocsPage";

interface Props {
  onLogin: (service: string, handle: string, appPassword: string, vaultPassphrase: string) => Promise<void>;
  onShowDocs: () => void;
  showingDocs: boolean;
}

type Screen = "welcome" | "login";

export function LoginScreen({ onLogin, onShowDocs, showingDocs }: Props) {
  const [screen, setScreen] = useState<Screen>("welcome");
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
      {screen === "welcome" && (
        <div className="login-card welcome-card">
          <h1>Vault CRM</h1>
          <p className="subtitle">End-to-end encrypted deals on ATProto</p>

          <div className="welcome-pitch">
            <p>
              A deals pipeline where every record is encrypted in your browser
              before it touches the network. Your PDS stores ciphertext. Only
              you hold the keys.
            </p>
          </div>

          <div className="welcome-steps">
            <h2>Get started in 3 steps</h2>

            <div className="welcome-step">
              <span className="step-number">1</span>
              <div className="step-content">
                <strong>Get a Bluesky account</strong>
                <p>
                  Sign up at{" "}
                  <a href="https://bsky.app" target="_blank" rel="noopener noreferrer">
                    bsky.app
                  </a>{" "}
                  if you don't have one. Any ATProto PDS works — Bluesky is
                  just the default.
                </p>
              </div>
            </div>

            <div className="welcome-step">
              <span className="step-number">2</span>
              <div className="step-content">
                <strong>Generate an App Password</strong>
                <p>
                  In Bluesky: Settings &rarr; Privacy and Security &rarr;{" "}
                  App Passwords &rarr; Add App Password. This is a
                  separate credential that can't post or change your
                  account settings.
                </p>
              </div>
            </div>

            <div className="welcome-step">
              <span className="step-number">3</span>
              <div className="step-content">
                <strong>Choose a Vault Passphrase</strong>
                <p>
                  This encrypts your CRM data locally. It never leaves your
                  browser. Pick something strong — if you lose it, your
                  encrypted data is unrecoverable.
                </p>
              </div>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={() => setScreen("login")}
          >
            I'm ready — Log in
          </button>

          <div className="welcome-features">
            <div className="welcome-feature">
              <strong>Personal vault</strong>
              <p>Your deals, encrypted with your passphrase. Nobody else can read them.</p>
            </div>
            <div className="welcome-feature">
              <strong>Team orgs</strong>
              <p>
                Create an org with configurable access tiers. Invite teammates
                by DID. Each tier gets its own encryption key — higher tiers
                see everything below.
              </p>
            </div>
            <div className="welcome-feature">
              <strong>Federated</strong>
              <p>
                Members can be on different PDSes. No central server. The org
                exists as ATProto records on the founder's PDS.
              </p>
            </div>
          </div>

          <div className="login-footer">
            <button type="button" className="link-button" onClick={onShowDocs}>
              How does the encryption work?
            </button>
          </div>
        </div>
      )}

      {screen === "login" && (
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
              <small>
                Your ATProto server. Leave as-is for Bluesky.
              </small>
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
              <small>
                Your Bluesky handle or custom domain.
              </small>
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
              <small>
                From Bluesky Settings &rarr; App Passwords. Not your main password.
              </small>
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
                it reaches the PDS. First login creates your vault. Same
                passphrase unlocks it on return.
              </small>
            </div>

            {error && <div className="error">{error}</div>}

            <button type="submit" disabled={loading}>
              {loading ? "Unlocking..." : "Unlock Vault"}
            </button>
          </form>

          <div className="login-footer">
            <button
              type="button"
              className="link-button"
              onClick={() => setScreen("welcome")}
            >
              &larr; Back to getting started
            </button>
            <button
              type="button"
              className="link-button"
              onClick={onShowDocs}
            >
              How does the encryption work?
            </button>
          </div>
        </div>
      )}

      {showingDocs && (
        <div className="login-docs-overlay" onClick={onShowDocs}>
          <div className="login-docs-panel" onClick={(e) => e.stopPropagation()}>
            <button className="login-docs-close" onClick={onShowDocs}>
              Back to login
            </button>
            <DocsPage />
          </div>
        </div>
      )}
    </div>
  );
}
