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
  toBase64,
  fromBase64,
} from "./crypto";
import type { Deal, DealRecord, VaultState } from "./types";
import { LoginScreen } from "./components/LoginScreen";
import { DealsBoard } from "./components/DealsBoard";

const SEALED_COLLECTION = "com.minomobi.vault.sealed";
const IDENTITY_COLLECTION = "com.minomobi.vault.wrappedIdentity";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";
const INNER_TYPE = "com.minomobi.crm.deal";

export function App() {
  const [vault, setVault] = useState<VaultState>({
    session: null,
    dek: null,
    initialized: false,
    keyringRkey: null,
  });
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [pds, setPds] = useState<PdsClient | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Login + Unlock ---

  const handleLogin = useCallback(
    async (
      service: string,
      handle: string,
      appPassword: string,
      passphrase: string
    ) => {
      const client = new PdsClient(service);
      const session = await client.login(handle, appPassword);
      setPds(client);

      // Derive KEK from passphrase
      const salt = new TextEncoder().encode(session.did + ":vault-kek");
      const kek = await deriveKek(passphrase, salt);

      // Check if identity exists on PDS
      const existing = await client.getRecord(IDENTITY_COLLECTION, "self");

      let privateKey: CryptoKey;
      let publicKey: CryptoKey;

      if (existing) {
        // Returning user: unwrap existing identity key
        const val = existing.value as Record<string, unknown>;
        const wrappedField = val.wrappedKey as { $bytes: string };
        const wrappedKey = fromBase64(wrappedField.$bytes);
        privateKey = await unwrapPrivateKey(wrappedKey, kek);

        // Fetch public key
        const pubRecord = await client.getRecord(PUBKEY_COLLECTION, "self");
        const pubVal = pubRecord!.value as Record<string, unknown>;
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
        await client.putRecord(IDENTITY_COLLECTION, "self", {
          $type: IDENTITY_COLLECTION,
          wrappedKey: { $bytes: toBase64(wrappedKey) },
          algorithm: "PBKDF2-SHA256",
          salt: { $bytes: toBase64(salt) },
          iterations: 600000,
          createdAt: new Date().toISOString(),
        });

        // Store public key
        await client.putRecord(PUBKEY_COLLECTION, "self", {
          $type: PUBKEY_COLLECTION,
          publicKey: { $bytes: toBase64(pubKeyRaw) },
          algorithm: "ECDH-P256",
          createdAt: new Date().toISOString(),
        });
      }

      // Derive DEK (v0.1: self-ECDH)
      const dek = await deriveDek(privateKey, publicKey);

      setVault({
        session,
        dek,
        initialized: true,
        keyringRkey: "self",
      });

      // Load existing sealed deals
      setLoading(true);
      try {
        await loadDeals(client, dek);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // --- Load deals ---

  const loadDeals = async (client: PdsClient, dek: CryptoKey) => {
    const loaded: DealRecord[] = [];
    let cursor: string | undefined;

    do {
      const page = await client.listRecords(SEALED_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        if (val.innerType !== INNER_TYPE) continue;
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

  // --- Save deal ---

  const handleSaveDeal = useCallback(
    async (deal: Deal, existingRkey?: string) => {
      if (!pds || !vault.dek) throw new Error("Vault not unlocked");

      const sealed = await sealRecord(
        INNER_TYPE,
        deal,
        vault.keyringRkey!,
        vault.dek
      );

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
    [pds, vault.dek, vault.keyringRkey]
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
    setVault({ session: null, dek: null, initialized: false, keyringRkey: null });
    setDeals([]);
    setPds(null);
  }, []);

  // --- Render ---

  if (!vault.session || !vault.dek) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <p>Decrypting vault...</p>
      </div>
    );
  }

  return (
    <DealsBoard
      deals={deals}
      onSaveDeal={handleSaveDeal}
      onDeleteDeal={handleDeleteDeal}
      handle={vault.session.handle}
      onLogout={handleLogout}
    />
  );
}
