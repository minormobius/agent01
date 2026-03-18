import { useCallback, useState } from "react";
import { PdsClient } from "./pds";
import {
  deriveKek,
  generateIdentityKey,
  exportPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  importPublicKey,
  deriveDek,
  sealRecord,
  unsealRecord,
  unwrapDekFromMember,
  toBase64,
  fromBase64,
} from "./crypto";
import type {
  Deal,
  DealRecord,
  VaultState,
  OrgRecord,
  OrgContext,
  Org,
  MembershipRecord,
  Membership,
  Keyring,
  KeyringMemberEntry,
} from "./types";
import { LoginScreen } from "./components/LoginScreen";
import { DealsBoard } from "./components/DealsBoard";
import { DocsPage } from "./components/DocsPage";
import { OrgManager } from "./components/OrgManager";
import { OrgSwitcher } from "./components/OrgSwitcher";

type Tab = "deals" | "docs";

const SEALED_COLLECTION = "com.minomobi.vault.sealed";
const IDENTITY_COLLECTION = "com.minomobi.vault.wrappedIdentity";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";
const ORG_COLLECTION = "com.minomobi.vault.org";
const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
const KEYRING_COLLECTION = "com.minomobi.vault.keyring";
const INNER_TYPE = "com.minomobi.crm.deal";

export function App() {
  const [vault, setVault] = useState<VaultState>({
    session: null,
    dek: null,
    initialized: false,
    keyringRkey: null,
    activeOrg: null,
  });
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [pds, setPds] = useState<PdsClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("deals");

  // Identity keys kept in memory for org operations
  const [identityKeys, setIdentityKeys] = useState<{
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  } | null>(null);

  // Org state
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [showOrgManager, setShowOrgManager] = useState(false);

  // --- Login + Unlock ---

  const handleLogin = useCallback(
    async (
      service: string,
      handle: string,
      appPassword: string,
      passphrase: string
    ) => {
      // Step 1: Authenticate with PDS
      const client = new PdsClient(service);
      let session;
      try {
        session = await client.login(handle, appPassword);
      } catch (err) {
        throw new Error(`Login failed: ${err instanceof Error ? err.message : err}`);
      }
      setPds(client);

      // Step 2: Derive KEK from passphrase
      const salt = new TextEncoder().encode(session.did + ":vault-kek");
      const kek = await deriveKek(passphrase, salt);

      // Step 3: Check if identity exists on PDS
      const existing = await client.getRecord(IDENTITY_COLLECTION, "self");

      let privateKey: CryptoKey;
      let publicKey: CryptoKey;

      if (existing) {
        // Returning user: unwrap existing identity key
        const val = existing.value as Record<string, unknown>;
        const wrappedField = val.wrappedKey as { $bytes: string };
        const wrappedKey = fromBase64(wrappedField.$bytes);
        try {
          privateKey = await unwrapPrivateKey(wrappedKey, kek);
        } catch {
          throw new Error("Wrong vault passphrase. The passphrase couldn't decrypt your identity key.");
        }

        // Fetch public key
        const pubRecord = await client.getRecord(PUBKEY_COLLECTION, "self");
        if (!pubRecord) {
          throw new Error("Vault corrupted: identity key exists but public key record is missing.");
        }
        const pubVal = pubRecord.value as Record<string, unknown>;
        const pubField = pubVal.publicKey as { $bytes: string };
        publicKey = await importPublicKey(fromBase64(pubField.$bytes));
      } else {
        // First run: generate identity key pair, store on PDS
        const keyPair = await generateIdentityKey();
        privateKey = keyPair.privateKey;
        publicKey = keyPair.publicKey;

        const wrappedKey = await wrapPrivateKey(privateKey, kek);
        const pubKeyRaw = await exportPublicKey(publicKey);

        // Store wrapped private key
        try {
          await client.putRecord(IDENTITY_COLLECTION, "self", {
            $type: IDENTITY_COLLECTION,
            wrappedKey: { $bytes: toBase64(wrappedKey) },
            algorithm: "PBKDF2-SHA256",
            salt: { $bytes: toBase64(salt) },
            iterations: 600000,
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          throw new Error(`Failed to store vault identity on PDS: ${err instanceof Error ? err.message : err}`);
        }

        // Store public key
        try {
          await client.putRecord(PUBKEY_COLLECTION, "self", {
            $type: PUBKEY_COLLECTION,
            publicKey: { $bytes: toBase64(pubKeyRaw) },
            algorithm: "ECDH-P256",
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          throw new Error(`Failed to store public key on PDS: ${err instanceof Error ? err.message : err}`);
        }
      }

      // Step 4: Derive personal DEK
      const dek = await deriveDek(privateKey, publicKey);

      setIdentityKeys({ privateKey, publicKey });

      setVault({
        session,
        dek,
        initialized: true,
        keyringRkey: "self",
        activeOrg: null,
      });

      // Load personal deals + discover orgs
      setLoading(true);
      try {
        await loadDeals(client, dek, "self");
        await discoverOrgs(client, session.did, privateKey);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // --- Discover orgs ---

  const discoverOrgs = async (
    client: PdsClient,
    _myDid: string,
    _privateKey: CryptoKey
  ) => {
    // Load orgs I've founded
    const foundedOrgs: OrgRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listRecords(ORG_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        const rkey = rec.uri.split("/").pop()!;
        foundedOrgs.push({
          rkey,
          org: val as unknown as Org,
        });
      }
      cursor = page.cursor;
    } while (cursor);
    setOrgs(foundedOrgs);

    // Load memberships (on my PDS — these include both my own and others')
    const allMemberships: MembershipRecord[] = [];
    cursor = undefined;
    do {
      const page = await client.listRecords(MEMBERSHIP_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        const rkey = rec.uri.split("/").pop()!;
        allMemberships.push({
          rkey,
          membership: val as unknown as Membership,
        });
      }
      cursor = page.cursor;
    } while (cursor);
    setMemberships(allMemberships);
  };

  // --- Load deals (personal or org) ---

  const loadDeals = async (
    client: PdsClient,
    dek: CryptoKey,
    keyringPrefix: string
  ) => {
    const loaded: DealRecord[] = [];
    let cursor: string | undefined;

    do {
      const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        if (val.innerType !== INNER_TYPE) continue;
        // Filter by keyring prefix
        const recKeyring = val.keyringRkey as string;
        if (keyringPrefix === "self" && recKeyring !== "self") continue;
        if (keyringPrefix !== "self" && !recKeyring.startsWith(keyringPrefix + ":"))
          continue;
        try {
          const { record } = await unsealRecord<Deal>(val, dek);
          const rkey = rec.uri.split("/").pop()!;
          loaded.push({ rkey, deal: record });
        } catch (err) {
          console.warn("Failed to unseal record:", rec.uri, err);
        }
      }
      cursor = page.cursor;
    } while (cursor);

    setDeals(loaded);
  };

  // --- Load org deals (across tiers the user has access to) ---

  const loadOrgDeals = async (
    client: PdsClient,
    orgCtx: OrgContext
  ) => {
    const loaded: DealRecord[] = [];
    let cursor: string | undefined;

    // Scan the founder's PDS for sealed records
    do {
      const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        if (val.innerType !== INNER_TYPE) continue;
        const recKeyring = val.keyringRkey as string;
        // Check if this record belongs to this org
        if (!recKeyring.startsWith(orgCtx.org.rkey + ":")) continue;
        // Extract tier name from keyring rkey
        const tierName = recKeyring.split(":")[1];
        const dek = orgCtx.tierDeks.get(tierName);
        if (!dek) continue; // User doesn't have access to this tier
        try {
          const { record } = await unsealRecord<Deal>(val, dek);
          const rkey = rec.uri.split("/").pop()!;
          loaded.push({ rkey, deal: record });
        } catch (err) {
          console.warn("Failed to unseal org record:", rec.uri, err);
        }
      }
      cursor = page.cursor;
    } while (cursor);

    // Also scan each member's PDS for their sealed records
    for (const m of orgCtx.memberships) {
      if (m.membership.memberDid === client.getSession()?.did) continue; // Already scanned own repo
      try {
        let memberCursor: string | undefined;
        do {
          const page = await client.listRecordsFrom(
            m.membership.memberDid,
            SEALED_COLLECTION,
            100,
            memberCursor
          );
          for (const rec of page.records) {
            const val = rec.value as Record<string, unknown>;
            if (val.innerType !== INNER_TYPE) continue;
            const recKeyring = val.keyringRkey as string;
            if (!recKeyring.startsWith(orgCtx.org.rkey + ":")) continue;
            const tierName = recKeyring.split(":")[1];
            const dek = orgCtx.tierDeks.get(tierName);
            if (!dek) continue;
            try {
              const { record } = await unsealRecord<Deal>(val, dek);
              const rkey = rec.uri.split("/").pop()!;
              loaded.push({ rkey, deal: record });
            } catch {
              // Can't decrypt — wrong tier or corrupted
            }
          }
          memberCursor = page.cursor;
        } while (memberCursor);
      } catch {
        // Member's PDS might be unreachable
      }
    }

    setDeals(loaded);
  };

  // --- Switch to org ---

  const switchToOrg = useCallback(
    async (orgRkey: string) => {
      if (!pds || !identityKeys || !vault.session) return;
      setLoading(true);
      try {
        const orgRecord = orgs.find((o) => o.rkey === orgRkey);
        if (!orgRecord) throw new Error("Org not found");

        // Find my membership
        const myMembership = memberships.find(
          (m) =>
            m.membership.orgRkey === orgRkey &&
            m.membership.memberDid === vault.session!.did
        );
        if (!myMembership) throw new Error("Not a member of this org");

        const myTierDef = orgRecord.org.tiers.find(
          (t) => t.name === myMembership.membership.tierName
        );
        if (!myTierDef) throw new Error("Tier not found in org");

        // Unwrap DEKs for all tiers at or below my level
        const tierDeks = new Map<string, CryptoKey>();
        const accessibleTiers = orgRecord.org.tiers.filter(
          (t) => t.level <= myTierDef.level
        );

        for (const tier of accessibleTiers) {
          try {
            const keyringRecord = await pds.getRecord(
              KEYRING_COLLECTION,
              `${orgRkey}:${tier.name}`
            );
            if (!keyringRecord) continue;

            const keyringVal = (keyringRecord as Record<string, unknown>)
              .value as Keyring & { $type: string };
            const myEntry = keyringVal.members.find(
              (m: KeyringMemberEntry) => m.did === vault.session!.did
            );
            if (!myEntry) continue;

            const writerPublicKey = await importPublicKey(
              fromBase64(keyringVal.writerPublicKey)
            );
            const tierDek = await unwrapDekFromMember(
              fromBase64(myEntry.wrappedDek),
              identityKeys.privateKey,
              writerPublicKey
            );
            tierDeks.set(tier.name, tierDek);
          } catch (err) {
            console.warn(`Failed to unwrap DEK for tier ${tier.name}:`, err);
          }
        }

        // Get org memberships for deal loading
        const orgMemberships = memberships.filter(
          (m) => m.membership.orgRkey === orgRkey
        );

        const orgCtx: OrgContext = {
          org: orgRecord,
          service: pds.getService(),
          founderDid: orgRecord.org.founderDid,
          myTierName: myMembership.membership.tierName,
          myTierLevel: myTierDef.level,
          tierDeks,
          memberships: orgMemberships,
        };

        setVault((prev) => ({
          ...prev,
          activeOrg: orgCtx,
          keyringRkey: `${orgRkey}:${myMembership.membership.tierName}`,
        }));

        await loadOrgDeals(pds, orgCtx);
      } catch (err) {
        console.error("Failed to switch to org:", err);
      } finally {
        setLoading(false);
      }
    },
    [pds, identityKeys, vault.session, orgs, memberships]
  );

  // --- Switch to personal vault ---

  const switchToPersonal = useCallback(async () => {
    if (!pds || !vault.dek) return;
    setVault((prev) => ({ ...prev, activeOrg: null, keyringRkey: "self" }));
    setLoading(true);
    try {
      await loadDeals(pds, vault.dek, "self");
    } finally {
      setLoading(false);
    }
  }, [pds, vault.dek]);

  // --- Save deal ---

  const handleSaveDeal = useCallback(
    async (deal: Deal, existingRkey?: string, tierName?: string) => {
      if (!pds || !vault.session) throw new Error("Vault not unlocked");

      let dek: CryptoKey;
      let keyringRkey: string;

      if (vault.activeOrg && tierName) {
        // Org mode: use tier-specific DEK
        const tierDek = vault.activeOrg.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        keyringRkey = `${vault.activeOrg.org.rkey}:${tierName}`;
      } else if (vault.dek) {
        // Personal vault
        dek = vault.dek;
        keyringRkey = "self";
      } else {
        throw new Error("No encryption key available");
      }

      const sealed = await sealRecord(INNER_TYPE, deal, keyringRkey, dek);

      if (existingRkey) {
        await pds.putRecord(SEALED_COLLECTION, existingRkey, sealed);
        setDeals((prev) =>
          prev.map((d) =>
            d.rkey === existingRkey ? { rkey: existingRkey, deal } : d
          )
        );
      } else {
        const res = await pds.createRecord(SEALED_COLLECTION, sealed);
        const rkey = res.uri.split("/").pop()!;
        setDeals((prev) => [...prev, { rkey, deal }]);
      }
    },
    [pds, vault.dek, vault.activeOrg, vault.session]
  );

  // --- Delete deal ---

  const handleDeleteDeal = useCallback(
    async (rkey: string) => {
      if (!pds) throw new Error("Vault not unlocked");
      await pds.deleteRecord(SEALED_COLLECTION, rkey);
      setDeals((prev) => prev.filter((d) => d.rkey !== rkey));
    },
    [pds]
  );

  // --- Logout ---

  const handleLogout = useCallback(() => {
    setVault({
      session: null,
      dek: null,
      initialized: false,
      keyringRkey: null,
      activeOrg: null,
    });
    setDeals([]);
    setPds(null);
    setIdentityKeys(null);
    setOrgs([]);
    setMemberships([]);
  }, []);

  // --- Render ---

  if (!vault.session || !vault.dek) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onShowDocs={() => setTab("docs")}
        showingDocs={tab === "docs"}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <p>Decrypting vault...</p>
      </div>
    );
  }

  // Compute available tiers for the deal form
  const availableTiers = vault.activeOrg
    ? vault.activeOrg.org.org.tiers.filter(
        (t) => t.level <= vault.activeOrg!.myTierLevel
      )
    : null;

  return (
    <>
      <DealsBoard
        deals={deals}
        onSaveDeal={handleSaveDeal}
        onDeleteDeal={handleDeleteDeal}
        handle={vault.session.handle}
        onLogout={handleLogout}
        tab={tab}
        onTabChange={setTab}
        orgSwitcher={
          <OrgSwitcher
            orgs={orgs}
            activeOrg={vault.activeOrg}
            onSwitchToPersonal={switchToPersonal}
            onSwitchToOrg={switchToOrg}
            onManageOrgs={() => setShowOrgManager(true)}
          />
        }
        activeOrg={vault.activeOrg}
        availableTiers={availableTiers}
      />
      {tab === "docs" && <DocsPage />}
      {showOrgManager && pds && identityKeys && (
        <OrgManager
          pds={pds}
          myDid={vault.session.did}
          myPrivateKey={identityKeys.privateKey}
          myPublicKey={identityKeys.publicKey}
          orgs={orgs}
          memberships={memberships}
          onOrgCreated={(org) => setOrgs((prev) => [...prev, org])}
          onMemberInvited={(m) =>
            setMemberships((prev) => [...prev, m])
          }
          onClose={() => setShowOrgManager(false)}
        />
      )}
    </>
  );
}
