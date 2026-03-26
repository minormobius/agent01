import { useState, useCallback, useEffect, useRef } from "react";
import { PdsClient } from "./pds";
import {
  deriveKek,
  generateIdentityKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  exportPublicKey,
  importPublicKey,
  deriveDek,
  fromBase64,
  toBase64,
} from "./crypto";
import type { Session, OrgRecord, MembershipRecord } from "./types";
import type { OrgContext } from "./crm/types";
import {
  discoverOrgs as discoverOrgsFromPds,
  buildOrgContext,
} from "./crm/context";
import { LoginScreen } from "./components/LoginScreen";
import { AppGrid } from "./components/AppGrid";
import { InviteOnboarding } from "./components/InviteOnboarding";
import { OrgManager } from "./components/OrgManager";
import { PmApp } from "./pm/PmApp";
import { WaveApp } from "./wave/WaveApp";
import { CrmApp } from "./crm/CrmApp";
import { CalendarApp } from "./cal/CalendarApp";
import { ThemePicker } from "./components/ThemePicker";
import { Route } from "./router";

// ATProto collection names
const IDENTITY_COLLECTION = "com.minomobi.vault.wrappedIdentity";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";

export interface VaultState {
  session: Session;
  dek: CryptoKey;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

type View = "orgs" | "manage";

/** Parse invite params from URL: /invite/<orgRkey>?founder=<did>&service=<pds> */
function parseInviteUrl(): { orgRkey: string; founderDid: string; founderService: string } | null {
  const path = window.location.pathname;
  const match = path.match(/^\/invite\/([^/]+)/);
  if (!match) return null;
  const params = new URLSearchParams(window.location.search);
  const founderDid = params.get("founder");
  const founderService = params.get("service");
  if (!founderDid || !founderService) return null;
  return { orgRkey: match[1], founderDid, founderService };
}

// --- Durable session ---
const SESSION_KEY = "mino-org-session";

interface StoredSession {
  service: string;
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  passphrase: string;
}

function saveSession(service: string, session: Session, passphrase: string) {
  const stored: StoredSession = {
    service,
    did: session.did,
    handle: session.handle,
    accessJwt: session.accessJwt,
    refreshJwt: session.refreshJwt,
    passphrase,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function App() {
  const [vault, setVault] = useState<VaultState | null>(null);
  const [pds, setPds] = useState<PdsClient | null>(null);
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [orgContexts, setOrgContexts] = useState<Map<string, OrgContext>>(new Map());
  const [view, setView] = useState<View>("orgs");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const restoredRef = useRef(false);

  const inviteParams = parseInviteUrl();

  // --- Core vault bootstrap (shared by login + restore) ---
  const bootstrapVault = useCallback(
    async (service: string, passphrase: string, session: Session, client: PdsClient) => {
      // Derive KEK
      const salt = new TextEncoder().encode(session.did + ":vault-kek");
      const kek = await deriveKek(passphrase, salt);

      let privateKey: CryptoKey, publicKey: CryptoKey;

      // Check for existing identity
      const existing = await client.getRecord(IDENTITY_COLLECTION, "self");

      if (existing) {
        const val = (existing as Record<string, unknown>).value as Record<string, unknown>;
        const wrappedField = val.wrappedKey as { $bytes: string };
        const wrappedKey = fromBase64(wrappedField.$bytes);
        try {
          privateKey = await unwrapPrivateKey(wrappedKey, kek);
        } catch {
          throw new Error("Wrong vault passphrase.");
        }
        const pubRecord = await client.getRecord(PUBKEY_COLLECTION, "self");
        const pubVal = (pubRecord as Record<string, unknown>).value as Record<string, unknown>;
        const pubField = pubVal.publicKey as { $bytes: string };
        publicKey = await importPublicKey(fromBase64(pubField.$bytes));
      } else {
        // First run — generate identity
        const keyPair = await generateIdentityKey();
        privateKey = keyPair.privateKey;
        publicKey = keyPair.publicKey;

        const wrappedKey = await wrapPrivateKey(privateKey, kek);
        const pubKeyRaw = await exportPublicKey(publicKey);

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

      const dek = await deriveDek(privateKey, publicKey);
      setPds(client);
      setVault({ session, dek, privateKey, publicKey });

      // Persist session
      saveSession(service, session, passphrase);

      // Discover orgs and build contexts
      setLoading(true);
      try {
        const { foundedOrgs, joinedOrgs, allMemberships } = await discoverOrgsFromPds(client);
        const allOrgs = [...foundedOrgs, ...joinedOrgs.map((j) => j.org)];
        setOrgs(allOrgs);
        setMemberships(allMemberships);

        // Build org contexts (unwrap DEKs once, share across apps)
        const contexts = new Map<string, OrgContext>();
        for (const org of foundedOrgs) {
          const myM = allMemberships.find(
            (m) => m.membership.orgRkey === org.rkey && m.membership.memberDid === session.did
          );
          if (!myM) continue;
          try {
            const ctx = await buildOrgContext(
              client, client.getService(), org, myM, allMemberships, privateKey, session.did
            );
            contexts.set(org.rkey, ctx);
          } catch (err) {
            console.warn(`Failed to build context for ${org.org.name}:`, err);
          }
        }
        for (const { org, founderService } of joinedOrgs) {
          const myM = allMemberships.find(
            (m) => m.membership.orgRkey === org.rkey && m.membership.memberDid === session.did
          );
          if (!myM) continue;
          try {
            const ctx = await buildOrgContext(
              client, founderService, org, myM, allMemberships, privateKey, session.did
            );
            contexts.set(org.rkey, ctx);
          } catch (err) {
            console.warn(`Failed to build context for ${org.org.name}:`, err);
          }
        }
        setOrgContexts(contexts);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // --- Restore session on mount ---
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const stored = loadSession();
    if (!stored) {
      setRestoring(false);
      return;
    }

    (async () => {
      try {
        const client = new PdsClient(stored.service);
        // Try to refresh the session using stored refresh token
        client.restoreSession({
          did: stored.did,
          handle: stored.handle,
          accessJwt: stored.accessJwt,
          refreshJwt: stored.refreshJwt,
        });
        await client.refreshSession();
        const session = client.getSession()!;
        await bootstrapVault(stored.service, stored.passphrase, session, client);
      } catch (err) {
        console.warn("Session restore failed:", err);
        clearSession();
      } finally {
        setRestoring(false);
      }
    })();
  }, [bootstrapVault]);

  // --- Login (fresh) ---
  const handleLogin = useCallback(
    async (service: string, handle: string, appPassword: string, passphrase: string) => {
      const client = new PdsClient(service);
      const session = await client.login(handle, appPassword);
      await bootstrapVault(service, passphrase, session, client);
    },
    [bootstrapVault],
  );

  // --- Callbacks for child components ---
  const handleOrgCreated = useCallback((org: OrgRecord) => {
    setOrgs((prev) => [...prev, org]);
    setView("orgs");
  }, []);

  const handleMembershipChanged = useCallback(
    (updated: MembershipRecord[]) => setMemberships(updated),
    [],
  );

  const handleOrgDeleted = useCallback(
    (orgRkey: string) => {
      setOrgs((prev) => prev.filter((o) => o.rkey !== orgRkey));
      setMemberships((prev) => prev.filter((m) => m.membership.orgRkey !== orgRkey));
      setOrgContexts((prev) => { const u = new Map(prev); u.delete(orgRkey); return u; });
      setView("orgs");
    },
    [],
  );

  const handleLogout = useCallback(() => {
    clearSession();
    setVault(null);
    setPds(null);
    setOrgs([]);
    setMemberships([]);
    setOrgContexts(new Map());
    setView("orgs");
    if (window.location.pathname.startsWith("/invite/")) {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  // --- Restoring session ---
  if (restoring) {
    return (
      <div className="hub" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="loading">Restoring session...</div>
      </div>
    );
  }

  // --- Invite onboarding (not logged in, invite URL present) ---
  if (!vault && inviteParams) {
    return (
      <InviteOnboarding
        orgRkey={inviteParams.orgRkey}
        founderDid={inviteParams.founderDid}
        founderService={inviteParams.founderService}
        onComplete={handleLogin}
      />
    );
  }

  // --- Not logged in ---
  if (!vault || !pds) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // --- Routed app pages (logged in) ---
  return (
    <>
      <Route path="/pm">
        <PmApp vault={vault} pds={pds} orgs={orgs} />
      </Route>

      <Route path="/wave">
        <WaveApp vault={vault} pds={pds} orgs={orgs} orgContexts={orgContexts} />
      </Route>

      <Route path="/crm">
        <CrmApp vault={vault} pds={pds} orgs={orgs} orgContexts={orgContexts} />
      </Route>

      <Route path="/cal">
        <CalendarApp vault={vault} pds={pds} orgs={orgs} orgContexts={orgContexts} />
      </Route>

      <Route path="/" exact>
        <HubHome
          vault={vault}
          pds={pds}
          orgs={orgs}
          memberships={memberships}
          orgContexts={orgContexts}
          view={view}
          loading={loading}
          onLogout={handleLogout}
          onOrgCreated={handleOrgCreated}
          onMembershipsChanged={handleMembershipChanged}
          onOrgDeleted={handleOrgDeleted}
          onManageOrgs={() => setView("manage")}
          onBack={() => setView("orgs")}
        />
      </Route>

      <Route path="/invite">
        <HubHome
          vault={vault}
          pds={pds}
          orgs={orgs}
          memberships={memberships}
          orgContexts={orgContexts}
          view={view}
          loading={loading}
          onLogout={handleLogout}
          onOrgCreated={handleOrgCreated}
          onMembershipsChanged={handleMembershipChanged}
          onOrgDeleted={handleOrgDeleted}
          onManageOrgs={() => setView("manage")}
          onBack={() => setView("orgs")}
        />
      </Route>
    </>
  );
}

// --- Hub home ---

function HubHome({
  vault,
  pds,
  orgs,
  memberships,
  orgContexts,
  view,
  loading,
  onLogout,
  onOrgCreated,
  onMembershipsChanged,
  onOrgDeleted,
  onManageOrgs,
  onBack,
}: {
  vault: VaultState;
  pds: PdsClient;
  orgs: OrgRecord[];
  memberships: MembershipRecord[];
  orgContexts: Map<string, OrgContext>;
  view: View;
  loading: boolean;
  onLogout: () => void;
  onOrgCreated: (org: OrgRecord) => void;
  onMembershipsChanged: (updated: MembershipRecord[]) => void;
  onOrgDeleted: (orgRkey: string) => void;
  onManageOrgs: () => void;
  onBack: () => void;
}) {
  return (
    <div className="hub">
      <header className="hub-header">
        <h1>Org Hub</h1>
        <div className="user-info">
          <ThemePicker />
          <span>@{vault.session.handle}</span>
          <button className="btn-secondary btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <div className="hub-body">
        {loading && <div className="loading">Loading...</div>}

        {!loading && view === "orgs" && (
          <>
            <div className="org-selector">
              <h2>Organizations</h2>
              {orgs.length === 0 && (
                <p style={{ color: "var(--text-dim)", marginBottom: 12 }}>
                  No organizations yet. Manage orgs to create one.
                </p>
              )}
              <div className="org-list">
                {orgs.map((o) => (
                  <div key={o.rkey} className="org-item">
                    <div>
                      <div className="org-name">{o.org.name}</div>
                      <div className="org-meta">
                        {o.org.founderDid === vault.session.did ? "Founded by you" : "Member"} &middot; {o.org.tiers.length} tiers
                      </div>
                    </div>
                    <span className="tier-badge">
                      {o.org.founderDid === vault.session.did ? "founder" : "member"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="org-actions">
                <button className="btn-primary" style={{ width: "auto" }} onClick={onManageOrgs}>
                  Manage Organizations
                </button>
              </div>
            </div>
            <AppGrid activeOrg={null} />
          </>
        )}

        {view === "manage" && (
          <OrgManager
            pds={pds}
            myDid={vault.session.did}
            myHandle={vault.session.handle}
            myPrivateKey={vault.privateKey}
            myPublicKey={vault.publicKey}
            orgs={orgs}
            memberships={memberships}
            relationships={Array.from(orgContexts.values()).flatMap((ctx) => ctx.relationships)}
            onOrgCreated={onOrgCreated}
            onMemberInvited={(m) => onMembershipsChanged([...memberships, m])}
            onOrgUpdated={() => {}}
            onOrgJoined={() => {}}
            onMemberRemoved={() => {}}
            onRelationshipCreated={() => {}}
            onOrgDeleted={onOrgDeleted}
            onClose={onBack}
          />
        )}
      </div>
    </div>
  );
}
