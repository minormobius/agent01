import { useState } from "react";
import { PdsClient, resolvePds, authLogin } from "../pds";
import {
  deriveKek,
  generateIdentityKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  exportPublicKey,
  fromBase64,
  toBase64,
} from "../crypto";
import type { Session } from "../types";

const IDENTITY_COLLECTION = "com.minomobi.vault.wrappedIdentity";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";
const ORG_COLLECTION = "com.minomobi.vault.org";
const BOOKMARK_COLLECTION = "com.minomobi.vault.orgBookmark";

interface Props {
  orgRkey: string;
  founderDid: string;
  founderService: string;
  /** Pre-existing OAuth session (after redirect). Null = needs sign-in first. */
  session: Session | null;
  /** Called after all steps complete so the parent can proceed with full login */
  onComplete: (passphrase: string) => Promise<void>;
}

type Step = 1 | 2 | 3;

export function InviteOnboarding({ orgRkey, founderDid, founderService, session, onComplete }: Props) {
  // If we already have an OAuth session, start at step 2
  const [step, setStep] = useState<Step>(session ? 2 : 1);
  const [orgName, setOrgName] = useState<string | null>(null);

  // Step 1: handle entry (OAuth redirect)
  const [handle, setHandle] = useState("");

  // Step 2: Passphrase
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Step 1: Sign in via OAuth ---
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setError("");
    setLoading(true);
    try {
      await authLogin(handle.trim());
      // Browser redirects — won't reach here
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  };

  // --- Step 2: Choose passphrase + create vault ---
  const handleSetPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }
    if (passphrase !== passphraseConfirm) {
      setError("Passphrases don't match");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (!session) throw new Error("No session");

      const client = new PdsClient(); // auth-proxied
      const salt = new TextEncoder().encode(session.did + ":vault-kek");
      const kek = await deriveKek(passphrase, salt);

      // Check if vault already exists
      const existing = await client.getRecord(IDENTITY_COLLECTION, "self");

      if (existing) {
        // Verify passphrase works with existing vault
        const val = (existing as Record<string, unknown>).value as Record<string, unknown>;
        const wrappedField = val.wrappedKey as { $bytes: string };
        try {
          await unwrapPrivateKey(fromBase64(wrappedField.$bytes), kek);
        } catch {
          throw new Error("You already have a vault. The passphrase you entered doesn't match it.");
        }
      } else {
        // Create new vault identity
        const keyPair = await generateIdentityKey();
        const wrappedKey = await wrapPrivateKey(keyPair.privateKey, kek);
        const pubKeyRaw = await exportPublicKey(keyPair.publicKey);

        await client.putRecord(IDENTITY_COLLECTION, "self", {
          $type: IDENTITY_COLLECTION,
          wrappedKey: { $bytes: toBase64(wrappedKey) },
          algorithm: "PBKDF2-SHA256",
          salt: { $bytes: toBase64(salt) },
          iterations: 600000,
          createdAt: new Date().toISOString(),
        });
        await client.putRecord(PUBKEY_COLLECTION, "self", {
          $type: PUBKEY_COLLECTION,
          publicKey: { $bytes: toBase64(pubKeyRaw) },
          algorithm: "ECDH-P256",
          createdAt: new Date().toISOString(),
        });
      }

      // Fetch org name for display
      try {
        let resolvedService: string;
        try {
          resolvedService = await resolvePds(founderDid);
        } catch {
          resolvedService = founderService;
        }
        const founderClient = new PdsClient(resolvedService);
        const orgRec = await founderClient.getRecordFrom(founderDid, ORG_COLLECTION, orgRkey);
        if (orgRec) {
          const val = (orgRec as Record<string, unknown>).value as Record<string, unknown>;
          setOrgName(val.name as string);
        }
      } catch {
        // Non-fatal — we just won't show the org name
      }

      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vault setup failed");
    } finally {
      setLoading(false);
    }
  };

  // --- Step 3: Accept invite (write bookmark) ---
  const handleAcceptInvite = async () => {
    setError("");
    setLoading(true);
    try {
      if (!session) throw new Error("No session");

      const client = new PdsClient(); // auth-proxied
      // Write an org bookmark to the invitee's own PDS
      await client.putRecord(BOOKMARK_COLLECTION, orgRkey, {
        $type: BOOKMARK_COLLECTION,
        founderDid,
        founderService,
        orgRkey,
        orgName: orgName ?? "Unknown Org",
        createdAt: new Date().toISOString(),
      });

      // Clear the invite URL and proceed with full login
      window.history.replaceState(null, "", "/");
      await onComplete(passphrase.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setLoading(false);
    }
  };

  // --- Step indicators ---
  const steps = [
    { num: 1, label: "Sign In" },
    { num: 2, label: "Encryption" },
    { num: 3, label: "Join Org" },
  ];

  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <h1>Join {orgName ?? "Organization"}</h1>
        <p className="subtitle">You've been invited to join an organization on Org Hub.</p>

        {/* Progress steps */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            margin: "20px 0",
          }}
        >
          {steps.map((s) => (
            <div
              key={s.num}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  background:
                    s.num < step
                      ? "var(--success)"
                      : s.num === step
                        ? "var(--accent)"
                        : "var(--surface-3)",
                  color: s.num <= step ? "#fff" : "var(--text-dim)",
                }}
              >
                {s.num < step ? "\u2713" : s.num}
              </div>
              <span
                style={{
                  fontSize: "0.8rem",
                  color: s.num === step ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {s.label}
              </span>
              {s.num < 3 && (
                <div
                  style={{
                    width: 24,
                    height: 1,
                    background: s.num < step ? "var(--success)" : "var(--border)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <hr className="separator" />

        {/* Step 1: Sign In */}
        {step === 1 && (
          <form onSubmit={handleSignIn}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 16 }}>
              Sign in with your Bluesky account. If you don't have one, create one at{" "}
              <a href="https://bsky.app" target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>
                bsky.app
              </a>{" "}
              first.
            </p>
            <div className="field">
              <label htmlFor="ob-handle">Handle</label>
              <input
                id="ob-handle"
                placeholder="you.bsky.social"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Redirecting..." : "Sign in with Bluesky"}
            </button>
          </form>
        )}

        {/* Step 2: Choose passphrase */}
        {step === 2 && (
          <form onSubmit={handleSetPassphrase}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 16 }}>
              {session && <span>Signed in as <strong>@{session.handle}</strong>. </span>}
              Choose an encryption passphrase. This protects your vault — it's never sent to any server.
              You'll need it every time you sign in.
            </p>
            <div className="field">
              <label htmlFor="ob-pass">Passphrase</label>
              <input
                id="ob-pass"
                type="password"
                placeholder="min 8 characters"
                minLength={8}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ob-pass-confirm">Confirm Passphrase</label>
              <input
                id="ob-pass-confirm"
                type="password"
                placeholder="type it again"
                value={passphraseConfirm}
                onChange={(e) => setPassphraseConfirm(e.target.value)}
              />
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Setting up vault..." : "Continue"}
            </button>
          </form>
        )}

        {/* Step 3: Accept invite */}
        {step === 3 && (
          <div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 16 }}>
              Your vault is ready. Accept the invitation to join <strong>{orgName ?? "the organization"}</strong>.
            </p>
            <div
              className="section"
              style={{ background: "var(--surface-2)", marginBottom: 16 }}
            >
              <div style={{ fontSize: "0.85rem" }}>
                <div>
                  <strong>Organization:</strong> {orgName ?? orgRkey}
                </div>
                <div style={{ color: "var(--text-dim)", marginTop: 4 }}>
                  <strong>Your account:</strong> @{session?.handle}
                </div>
              </div>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: 16 }}>
              After joining, the org admin will grant you access to encrypted tiers.
              You'll be able to use org-aware tools like Wave, CRM, and PM.
            </p>
            {error && <div className="error-box">{error}</div>}
            <button className="btn-primary" onClick={handleAcceptInvite} disabled={loading}>
              {loading ? "Joining..." : "Accept Invite"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
