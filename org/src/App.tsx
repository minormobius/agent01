import { useState, useCallback } from "react";
import { PdsClient, resolvePds } from "./pds";
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
import type { Session, OrgRecord, Org, MembershipRecord, Membership, OrgBookmark } from "./types";
import { LoginScreen } from "./components/LoginScreen";
import { OrgList } from "./components/OrgList";
import { OrgDetail } from "./components/OrgDetail";
import { CreateOrg } from "./components/CreateOrg";
import { AppGrid } from "./components/AppGrid";
import { InviteOnboarding } from "./components/InviteOnboarding";
import { PmApp } from "./pm/PmApp";
import { Route } from "./router";

// ATProto collection names
const IDENTITY_COLLECTION = "com.minomobi.vault.wrappedIdentity";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";
const ORG_COLLECTION = "com.minomobi.vault.org";
const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
const BOOKMARK_COLLECTION = "com.minomobi.vault.orgBookmark";

export interface VaultState {
  session: Session;
  dek: CryptoKey;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

type View = "orgs" | "create" | "detail" | "invite-onboarding";

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

export function App() {
  const [vault, setVault] = useState<VaultState | null>(null);
  const [pds, setPds] = useState<PdsClient | null>(null);
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrgRecord | null>(null);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [view, setView] = useState<View>("orgs");
  const [loading, setLoading] = useState(false);

  const inviteParams = parseInviteUrl();

  // --- Login + vault bootstrap ---
  const handleLogin = useCallback(
    async (service: string, handle: string, appPassword: string, passphrase: string) => {
      const client = new PdsClient(service);
      const session = await client.login(handle, appPassword);
      setPds(client);

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
      setVault({ session, dek, privateKey, publicKey });

      // Discover orgs
      setLoading(true);
      try {
        const discovered = await discoverOrgs(client, session.did);
        setOrgs(discovered.orgs);
        setMemberships(discovered.memberships);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // --- Org discovery ---
  async function discoverOrgs(
    client: PdsClient,
    _myDid: string,
  ): Promise<{ orgs: OrgRecord[]; memberships: MembershipRecord[] }> {
    // Founded orgs
    const foundedOrgs: OrgRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listRecords(ORG_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = (rec as Record<string, unknown>).value as Org;
        const rkey = (rec as Record<string, unknown>).uri as string;
        foundedOrgs.push({ rkey: rkey.split("/").pop()!, org: val });
      }
      cursor = page.cursor;
    } while (cursor);

    // All memberships from my founded orgs
    const allMemberships: MembershipRecord[] = [];
    cursor = undefined;
    do {
      const page = await client.listRecords(MEMBERSHIP_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = (rec as Record<string, unknown>).value as Membership;
        const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
        allMemberships.push({ rkey, membership: val });
      }
      cursor = page.cursor;
    } while (cursor);

    // Bookmarks (joined orgs from other founders)
    const bookmarks: OrgBookmark[] = [];
    cursor = undefined;
    do {
      const page = await client.listRecords(BOOKMARK_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        bookmarks.push((rec as Record<string, unknown>).value as OrgBookmark);
      }
      cursor = page.cursor;
    } while (cursor);

    const joinedOrgs: OrgRecord[] = [];
    for (const bm of bookmarks) {
      try {
        let founderService: string;
        try {
          founderService = await resolvePds(bm.founderDid);
        } catch {
          founderService = bm.founderService;
        }
        const founderClient = new PdsClient(founderService);
        const orgRec = await founderClient.getRecordFrom(
          bm.founderDid,
          ORG_COLLECTION,
          bm.orgRkey,
        );
        if (!orgRec) continue;
        const val = (orgRec as Record<string, unknown>).value as Org;
        joinedOrgs.push({ rkey: bm.orgRkey, org: val });

        // Also fetch memberships from founder for this org
        let mCursor: string | undefined;
        do {
          const page = await founderClient.listRecordsFrom(
            bm.founderDid,
            MEMBERSHIP_COLLECTION,
            100,
            mCursor,
          );
          for (const rec of page.records) {
            const mVal = (rec as Record<string, unknown>).value as Membership;
            if (mVal.orgRkey === bm.orgRkey) {
              const rkey = ((rec as Record<string, unknown>).uri as string).split("/").pop()!;
              allMemberships.push({ rkey, membership: mVal });
            }
          }
          mCursor = page.cursor;
        } while (mCursor);
      } catch (err) {
        console.warn("Failed to fetch joined org:", err);
      }
    }

    return { orgs: [...foundedOrgs, ...joinedOrgs], memberships: allMemberships };
  }

  // --- Callbacks for child components ---
  const handleOrgCreated = useCallback((org: OrgRecord) => {
    setOrgs((prev) => [...prev, org]);
    setView("orgs");
  }, []);

  const handleMembershipChanged = useCallback(
    (updated: MembershipRecord[]) => setMemberships(updated),
    [],
  );

  const handleSelectOrg = useCallback((org: OrgRecord) => {
    setSelectedOrg(org);
    setView("detail");
  }, []);

  const handleLogout = useCallback(() => {
    setVault(null);
    setPds(null);
    setOrgs([]);
    setMemberships([]);
    setSelectedOrg(null);
    setView("orgs");
    // Clear invite URL
    if (window.location.pathname.startsWith("/invite/")) {
      window.history.replaceState(null, "", "/");
    }
  }, []);

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
      {/* PM tool — full-page, own layout */}
      <Route path="/pm">
        <PmApp />
      </Route>

      {/* Hub home — org management + app grid */}
      <Route path="/" exact>
        <HubHome
          vault={vault}
          pds={pds}
          orgs={orgs}
          memberships={memberships}
          selectedOrg={selectedOrg}
          view={view}
          loading={loading}
          onLogout={handleLogout}
          onSelectOrg={handleSelectOrg}
          onCreateView={() => setView("create")}
          onOrgCreated={handleOrgCreated}
          onMembershipsChanged={handleMembershipChanged}
          onBack={() => {
            setSelectedOrg(null);
            setView("orgs");
          }}
        />
      </Route>

      {/* Invite link (logged in — write bookmark) */}
      <Route path="/invite">
        <HubHome
          vault={vault}
          pds={pds}
          orgs={orgs}
          memberships={memberships}
          selectedOrg={selectedOrg}
          view={view}
          loading={loading}
          onLogout={handleLogout}
          onSelectOrg={handleSelectOrg}
          onCreateView={() => setView("create")}
          onOrgCreated={handleOrgCreated}
          onMembershipsChanged={handleMembershipChanged}
          onBack={() => {
            setSelectedOrg(null);
            setView("orgs");
          }}
        />
      </Route>
    </>
  );
}

// --- Hub home (extracted for reuse across routes) ---

function HubHome({
  vault,
  pds,
  orgs,
  memberships,
  selectedOrg,
  view,
  loading,
  onLogout,
  onSelectOrg,
  onCreateView,
  onOrgCreated,
  onMembershipsChanged,
  onBack,
}: {
  vault: VaultState;
  pds: PdsClient;
  orgs: OrgRecord[];
  memberships: MembershipRecord[];
  selectedOrg: OrgRecord | null;
  view: View;
  loading: boolean;
  onLogout: () => void;
  onSelectOrg: (org: OrgRecord) => void;
  onCreateView: () => void;
  onOrgCreated: (org: OrgRecord) => void;
  onMembershipsChanged: (updated: MembershipRecord[]) => void;
  onBack: () => void;
}) {
  return (
    <div className="hub">
      <header className="hub-header">
        <h1>Org Hub</h1>
        <div className="user-info">
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
            <OrgList
              orgs={orgs}
              myDid={vault.session.did}
              onSelect={onSelectOrg}
              onCreate={onCreateView}
            />
            <AppGrid activeOrg={selectedOrg} />
          </>
        )}

        {view === "create" && (
          <CreateOrg
            pds={pds}
            myDid={vault.session.did}
            myPrivateKey={vault.privateKey}
            myPublicKey={vault.publicKey}
            onCreated={onOrgCreated}
            onCancel={onBack}
          />
        )}

        {view === "detail" && selectedOrg && (
          <OrgDetail
            pds={pds}
            vault={vault}
            org={selectedOrg}
            memberships={memberships.filter((m) => m.membership.orgRkey === selectedOrg.rkey)}
            onMembershipsChanged={onMembershipsChanged}
            onBack={onBack}
          />
        )}
      </div>
    </div>
  );
}
