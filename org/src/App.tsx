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
import type { Session, OrgRecord, MembershipRecord, NotificationRecord } from "./types";
import type { OrgContext } from "./crm/types";
import {
  discoverOrgs as discoverOrgsFromPds,
  buildOrgContext,
  discoverPendingInvites,
  loadDismissedNotifications,
  BOOKMARK_COLLECTION,
} from "./crm/context";
import { LoginScreen } from "./components/LoginScreen";
import { AppGrid } from "./components/AppGrid";
import { InviteOnboarding } from "./components/InviteOnboarding";
import { OrgManager } from "./components/OrgManager";
import { NotificationPane } from "./components/NotificationPane";
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

type View = "home" | "create" | "join" | "manage-org";

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
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("home");
  const [managingOrg, setManagingOrg] = useState<OrgRecord | null>(null);
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

        // Discover pending invites from known founders
        try {
          const bookmarkOrgRkeys = new Set([
            ...foundedOrgs.map((o) => o.rkey),
            ...joinedOrgs.map((j) => j.org.rkey),
          ]);
          const dismissed = await loadDismissedNotifications(client);
          setDismissedKeys(dismissed);

          // Collect unique founder DIDs from existing memberships (others' orgs we know about)
          const knownFounderDids = new Set<string>();
          for (const m of allMemberships) {
            if (m.membership.orgFounderDid && m.membership.orgFounderDid !== session.did) {
              knownFounderDids.add(m.membership.orgFounderDid);
            }
          }

          const pending = await discoverPendingInvites(
            client, session.did, Array.from(knownFounderDids), bookmarkOrgRkeys, dismissed
          );
          setNotifications(pending);
        } catch (err) {
          console.warn("Failed to discover pending invites:", err);
        }
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
    setView("home");
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
      setManagingOrg(null);
      setView("home");
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
    setNotifications([]);
    setDismissedKeys(new Set());
    setManagingOrg(null);
    setView("home");
    if (window.location.pathname.startsWith("/invite/")) {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  /** Accept an org invite notification — write bookmark, refresh orgs */
  const handleAcceptInvite = useCallback(
    async (notif: NotificationRecord) => {
      if (!pds || !vault) return;
      const inv = notif.notification;
      if (inv.type !== "org-invite") return;

      // Write org bookmark to our PDS
      await pds.putRecord(BOOKMARK_COLLECTION, inv.orgRkey, {
        $type: BOOKMARK_COLLECTION,
        founderDid: inv.founderDid,
        founderService: inv.founderService,
        orgRkey: inv.orgRkey,
        orgName: inv.orgName,
        createdAt: new Date().toISOString(),
      });

      // Remove from notifications
      setNotifications((prev) => prev.filter((n) => n.rkey !== notif.rkey));

      // Re-bootstrap to pick up the new org
      const stored = loadSession();
      if (stored) {
        try {
          await bootstrapVault(stored.service, stored.passphrase, {
            did: vault.session.did,
            handle: vault.session.handle,
            accessJwt: stored.accessJwt,
            refreshJwt: stored.refreshJwt,
          }, pds);
        } catch (err) {
          console.warn("Re-bootstrap after invite accept failed:", err);
        }
      }
    },
    [pds, vault, bootstrapVault],
  );

  /** Dismiss a notification */
  const handleDismissNotification = useCallback(
    async (notif: NotificationRecord) => {
      if (!pds) return;
      // Write dismissal to PDS
      const rkey = notif.rkey.replace(/[^a-zA-Z0-9.:_-]/g, "_");
      try {
        await pds.putRecord("com.minomobi.vault.notificationDismissal", rkey, {
          $type: "com.minomobi.vault.notificationDismissal",
          notificationKey: notif.rkey,
          dismissedAt: new Date().toISOString(),
        });
      } catch { /* best effort */ }
      setDismissedKeys((prev) => new Set([...prev, notif.rkey]));
      setNotifications((prev) => prev.filter((n) => n.rkey !== notif.rkey));
    },
    [pds],
  );

  /** Add newly discovered notifications (from "check invites" feature) */
  const handleNewNotifications = useCallback(
    (newNotifs: NotificationRecord[]) => {
      setNotifications((prev) => {
        const existingKeys = new Set(prev.map((n) => n.rkey));
        const unique = newNotifs.filter((n) => !existingKeys.has(n.rkey) && !dismissedKeys.has(n.rkey));
        return [...prev, ...unique];
      });
    },
    [dismissedKeys],
  );

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
        <PmApp vault={vault} pds={pds} orgs={orgs} memberships={memberships} />
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
          managingOrg={managingOrg}
          loading={loading}
          onLogout={handleLogout}
          onOrgCreated={handleOrgCreated}
          onMembershipsChanged={handleMembershipChanged}
          onOrgDeleted={handleOrgDeleted}
          onManageOrg={(org) => { setManagingOrg(org); setView("manage-org"); }}
          onCreateOrg={() => setView("create")}
          onJoinOrg={() => setView("join")}
          onBack={() => { setManagingOrg(null); setView("home"); }}
          notifications={notifications}
          onAcceptInvite={handleAcceptInvite}
          onDismissNotification={handleDismissNotification}
          onNewNotifications={handleNewNotifications}
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
          managingOrg={managingOrg}
          loading={loading}
          onLogout={handleLogout}
          onOrgCreated={handleOrgCreated}
          onMembershipsChanged={handleMembershipChanged}
          onOrgDeleted={handleOrgDeleted}
          onManageOrg={(org) => { setManagingOrg(org); setView("manage-org"); }}
          onCreateOrg={() => setView("create")}
          onJoinOrg={() => setView("join")}
          onBack={() => { setManagingOrg(null); setView("home"); }}
          notifications={notifications}
          onAcceptInvite={handleAcceptInvite}
          onDismissNotification={handleDismissNotification}
          onNewNotifications={handleNewNotifications}
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
  managingOrg,
  loading,
  onLogout,
  onOrgCreated,
  onMembershipsChanged,
  onOrgDeleted,
  onManageOrg,
  onCreateOrg,
  onJoinOrg,
  onBack,
  notifications,
  onAcceptInvite,
  onDismissNotification,
  onNewNotifications,
}: {
  vault: VaultState;
  pds: PdsClient;
  orgs: OrgRecord[];
  memberships: MembershipRecord[];
  orgContexts: Map<string, OrgContext>;
  view: View;
  managingOrg: OrgRecord | null;
  loading: boolean;
  onLogout: () => void;
  onOrgCreated: (org: OrgRecord) => void;
  onMembershipsChanged: (updated: MembershipRecord[]) => void;
  onOrgDeleted: (orgRkey: string) => void;
  onManageOrg: (org: OrgRecord) => void;
  onCreateOrg: () => void;
  onJoinOrg: () => void;
  onBack: () => void;
  notifications: NotificationRecord[];
  onAcceptInvite: (notif: NotificationRecord) => void;
  onDismissNotification: (notif: NotificationRecord) => void;
  onNewNotifications: (notifs: NotificationRecord[]) => void;
}) {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <div className="hub">
      <header className="hub-header">
        <h1>Org Hub</h1>
        <div className="user-info">
          <ThemePicker />
          <button
            className="notif-bell"
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {notifications.length > 0 && (
              <span className="notif-badge">{notifications.length}</span>
            )}
          </button>
          <span>@{vault.session.handle}</span>
          <button className="btn-secondary btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      {showNotifications && (
        <NotificationPane
          pds={pds}
          myDid={vault.session.did}
          notifications={notifications}
          existingOrgRkeys={new Set(orgs.map((o) => o.rkey))}
          onAccept={onAcceptInvite}
          onDismiss={onDismissNotification}
          onNewNotifications={onNewNotifications}
          onClose={() => setShowNotifications(false)}
        />
      )}

      <div className="hub-body">
        {loading && <div className="loading">Loading...</div>}

        {!loading && view === "home" && (
          <>
            <div className="org-selector">
              <div className="org-selector-header">
                <h2>Organizations</h2>
                <div className="org-header-actions">
                  <button className="btn-secondary btn-sm" onClick={onJoinOrg}>
                    Join
                  </button>
                  <button className="btn-primary btn-sm" onClick={onCreateOrg}>
                    + New
                  </button>
                </div>
              </div>
              {orgs.length === 0 && (
                <p style={{ color: "var(--text-dim)", marginBottom: 12 }}>
                  No organizations yet. Create one or join an existing org.
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
                    <div className="org-item-actions">
                      <span className="tier-badge">
                        {o.org.founderDid === vault.session.did ? "founder" : "member"}
                      </span>
                      <button className="btn-secondary btn-sm" onClick={() => onManageOrg(o)}>
                        Manage
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <AppGrid activeOrg={null} />
          </>
        )}

        {!loading && (view === "create" || view === "join" || view === "manage-org") && (
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
            inline
            initialOrg={view === "manage-org" ? managingOrg : undefined}
            initialView={view === "create" ? "create" : view === "join" ? "join" : view === "manage-org" ? "manage" : undefined}
          />
        )}
      </div>
    </div>
  );
}
