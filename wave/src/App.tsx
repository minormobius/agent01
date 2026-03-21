import { useCallback, useEffect, useRef, useState } from "react";
import { PdsClient, resolvePds } from "./pds";
import {
  deriveKek,
  generateIdentityKey,
  exportPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  importPublicKey,
  deriveDek,
  encrypt,
  decrypt,
  toBase64,
  fromBase64,
  unwrapDekFromMember,
} from "./crypto";
import type {
  Org,
  OrgRecord,
  OrgBookmark,
  Membership,
  MembershipRecord,
  KeyringMemberEntry,
  Keyring,
  WaveOrgContext,
  WaveState,
  WaveChannel,
  WaveChannelRecord,
  WaveThread,
  WaveThreadRecord,
  WaveOpRecord,
  WaveOp,
  MessagePayload,
} from "./types";
import { JetstreamClient, type JetstreamEvent } from "./jetstream";

// --- ATProto collection names ---
const IDENTITY_COLLECTION = "com.minomobi.vault.wrappedIdentity";
const PUBKEY_COLLECTION = "com.minomobi.vault.encryptionKey";
const ORG_COLLECTION = "com.minomobi.vault.org";
const MEMBERSHIP_COLLECTION = "com.minomobi.vault.membership";
const KEYRING_COLLECTION = "com.minomobi.vault.keyring";
const BOOKMARK_COLLECTION = "com.minomobi.vault.orgBookmark";
const CHANNEL_COLLECTION = "com.minomobi.wave.channel";
const THREAD_COLLECTION = "com.minomobi.wave.thread";
const OP_COLLECTION = "com.minomobi.wave.op";

function keyringRkeyForTier(orgRkey: string, tierName: string, epoch: number): string {
  return epoch === 0 ? `${orgRkey}:${tierName}` : `${orgRkey}:${tierName}:${epoch}`;
}

export function App() {
  const [vault, setVault] = useState<WaveState>({
    session: null,
    dek: null,
    initialized: false,
    keyringRkey: null,
  });
  const [pds, setPds] = useState<PdsClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Identity keys
  const [identityKeys, setIdentityKeys] = useState<{
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  } | null>(null);

  // Org state
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [activeOrg, setActiveOrg] = useState<WaveOrgContext | null>(null);

  // Wave state
  const [channels, setChannels] = useState<WaveChannelRecord[]>([]);
  const [activeChannel, setActiveChannel] = useState<WaveChannelRecord | null>(null);
  const [threads, setThreads] = useState<WaveThreadRecord[]>([]);
  const [activeThread, setActiveThread] = useState<WaveThreadRecord | null>(null);
  const [ops, setOps] = useState<WaveOpRecord[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  // Jetstream
  const jetstreamRef = useRef<JetstreamClient | null>(null);
  const [connected, setConnected] = useState(false);

  // Scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ops]);

  // --- Login ---
  const handleLogin = useCallback(
    async (service: string, handle: string, appPassword: string, passphrase: string) => {
      const client = new PdsClient(service);
      const session = await client.login(handle, appPassword);
      setPds(client);

      // Derive KEK
      const salt = new TextEncoder().encode(session.did + ":vault-kek");
      const kek = await deriveKek(passphrase, salt);

      // Check for existing identity
      const existing = await client.getRecord(IDENTITY_COLLECTION, "self");

      let privateKey: CryptoKey;
      let publicKey: CryptoKey;

      if (existing) {
        const val = existing.value as Record<string, unknown>;
        const wrappedField = val.wrappedKey as { $bytes: string };
        const wrappedKey = fromBase64(wrappedField.$bytes);
        try {
          privateKey = await unwrapPrivateKey(wrappedKey, kek);
        } catch {
          throw new Error("Wrong vault passphrase.");
        }
        const pubRecord = await client.getRecord(PUBKEY_COLLECTION, "self");
        if (!pubRecord) throw new Error("Vault corrupted: missing public key.");
        const pubVal = pubRecord.value as Record<string, unknown>;
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
      setIdentityKeys({ privateKey, publicKey });

      setVault({
        session,
        dek,
        initialized: true,
        keyringRkey: "self",
      });

      // Discover orgs
      setLoading(true);
      try {
        const discovered = await discoverOrgs(client, session.did, privateKey);
        setOrgs(discovered);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // --- Discover orgs ---
  const discoverOrgs = async (
    client: PdsClient,
    myDid: string,
    _privateKey: CryptoKey
  ): Promise<OrgRecord[]> => {
    // Founded orgs
    const foundedOrgs: OrgRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listRecords(ORG_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as unknown as Org;
        const rkey = rec.uri.split("/").pop()!;
        foundedOrgs.push({ rkey, org: val });
      }
      cursor = page.cursor;
    } while (cursor);

    // Bookmarks (joined orgs)
    const bookmarks: Array<{ rkey: string; bookmark: OrgBookmark }> = [];
    cursor = undefined;
    do {
      const page = await client.listRecords(BOOKMARK_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as unknown as OrgBookmark;
        const rkey = rec.uri.split("/").pop()!;
        bookmarks.push({ rkey, bookmark: val });
      }
      cursor = page.cursor;
    } while (cursor);

    const joinedOrgs: OrgRecord[] = [];
    for (const bm of bookmarks) {
      try {
        let founderService: string;
        try {
          founderService = await resolvePds(bm.bookmark.founderDid);
        } catch {
          founderService = bm.bookmark.founderService;
        }
        const founderClient = new PdsClient(founderService);
        const orgRec = await founderClient.getRecordFrom(
          bm.bookmark.founderDid, ORG_COLLECTION, bm.bookmark.orgRkey
        );
        if (!orgRec) continue;
        const val = (orgRec as Record<string, unknown>).value as unknown as Org;
        joinedOrgs.push({ rkey: bm.bookmark.orgRkey, org: val });
      } catch (err) {
        console.warn(`Failed to fetch joined org:`, err);
      }
    }

    void myDid;
    return [...foundedOrgs, ...joinedOrgs];
  };

  // --- Select org ---
  const selectOrg = useCallback(
    async (orgRecord: OrgRecord) => {
      if (!pds || !vault.session || !identityKeys) return;
      setLoading(true);
      setError("");
      try {
        const ctx = await buildOrgContext(pds, orgRecord, identityKeys.privateKey, identityKeys.publicKey, vault.session.did);
        setActiveOrg(ctx);
        // Load channels for this org
        const chans = await loadChannels(pds, ctx);
        setChannels(chans);
        setActiveChannel(null);
        setThreads([]);
        setActiveThread(null);
        setOps([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load org");
      } finally {
        setLoading(false);
      }
    },
    [pds, vault.session, identityKeys]
  );

  // --- Build org context ---
  const buildOrgContext = async (
    client: PdsClient,
    orgRecord: OrgRecord,
    privateKey: CryptoKey,
    publicKey: CryptoKey,
    myDid: string
  ): Promise<WaveOrgContext> => {
    const founderDid = orgRecord.org.founderDid;
    const isFounder = founderDid === myDid;

    // Resolve founder's PDS for non-founders
    let founderService: string;
    if (isFounder) {
      founderService = client.getService();
    } else {
      founderService = await resolvePds(founderDid);
    }
    const controlClient = isFounder ? client : new PdsClient(founderService);

    // Fetch memberships for this org
    const allMemberships: MembershipRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await controlClient.listRecordsFrom(
        founderDid, MEMBERSHIP_COLLECTION, 100, cursor
      );
      for (const rec of page.records) {
        const val = rec.value as unknown as Membership;
        if (val.orgRkey === orgRecord.rkey) {
          const rkey = rec.uri.split("/").pop()!;
          allMemberships.push({ rkey, membership: val });
        }
      }
      cursor = page.cursor;
    } while (cursor);

    const myMembership = allMemberships.find(m => m.membership.memberDid === myDid);
    if (!myMembership) throw new Error("You are not a member of this org");

    const myTierDef = orgRecord.org.tiers.find(t => t.name === myMembership.membership.tierName);
    if (!myTierDef) throw new Error("Tier not found");

    // Unwrap DEKs — collect diagnostics for debugging on mobile
    const tierDeks = new Map<string, CryptoKey>();
    const keyringDeks = new Map<string, CryptoKey>();
    const accessibleTiers = orgRecord.org.tiers.filter(t => t.level <= myTierDef.level);
    const diagLines: string[] = [];

    diagLines.push(`org tiers: ${orgRecord.org.tiers.map(t => `${t.name}(lvl=${t.level},ep=${t.currentEpoch ?? 0})`).join(", ")}`);
    diagLines.push(`my tier: ${myTierDef.name} (level ${myTierDef.level})`);
    diagLines.push(`accessible: ${accessibleTiers.map(t => t.name).join(", ") || "(none)"}`);
    diagLines.push(`founder: ${founderDid.slice(0, 24)}...`);
    diagLines.push(`isFounder: ${isFounder}`);

    for (const tier of accessibleTiers) {
      const currentEpoch = tier.currentEpoch ?? 0;
      for (let epoch = 0; epoch <= currentEpoch; epoch++) {
        const rkey = keyringRkeyForTier(orgRecord.rkey, tier.name, epoch);
        diagLines.push(`--- ${tier.name} ep${epoch} rkey=${rkey}`);
        try {
          const keyringRecord = await controlClient.getRecordFrom(
            founderDid, KEYRING_COLLECTION, rkey
          );
          if (!keyringRecord) {
            diagLines.push(`  → keyring NOT FOUND on PDS`);
            continue;
          }
          const keyringVal = (keyringRecord as Record<string, unknown>).value as Keyring & { $type: string };
          const memberDids = keyringVal.members.map((m: KeyringMemberEntry) => m.did.slice(0, 20) + "...");
          diagLines.push(`  → keyring has ${keyringVal.members.length} members: ${memberDids.join(", ")}`);
          const myEntry = keyringVal.members.find((m: KeyringMemberEntry) => m.did === myDid);
          if (!myEntry) {
            diagLines.push(`  → MY DID NOT IN KEYRING (${myDid.slice(0, 20)}...)`);
            continue;
          }
          diagLines.push(`  → found my wrapped DEK, unwrapping...`);
          diagLines.push(`  → wrappedDek typeof=${typeof myEntry.wrappedDek} raw=${JSON.stringify(myEntry.wrappedDek).slice(0, 100)}`);
          diagLines.push(`  → writerPubKey typeof=${typeof keyringVal.writerPublicKey} raw=${JSON.stringify(keyringVal.writerPublicKey).slice(0, 100)}`);

          // ATProto bytes fields may come back as { $bytes: "base64" } or plain string
          const wrappedDekB64 = typeof myEntry.wrappedDek === "string"
            ? myEntry.wrappedDek
            : (myEntry.wrappedDek as unknown as { $bytes: string }).$bytes;
          const writerPubB64 = typeof keyringVal.writerPublicKey === "string"
            ? keyringVal.writerPublicKey
            : (keyringVal.writerPublicKey as unknown as { $bytes: string }).$bytes;

          const writerPubBytes = fromBase64(writerPubB64);
          const wrappedDekBytes = fromBase64(wrappedDekB64);
          const myPubBytes = await exportPublicKey(publicKey);
          const pubKeysMatch = writerPubBytes.length === myPubBytes.length &&
            writerPubBytes.every((b: number, i: number) => b === myPubBytes[i]);
          diagLines.push(`  → writerPub len=${writerPubBytes.length}, myPub len=${myPubBytes.length}, match=${pubKeysMatch}`);
          diagLines.push(`  → wrappedDek len=${wrappedDekBytes.length} (expected 60)`);
          diagLines.push(`  → writerDid same=${keyringVal.writerDid === myDid}`);

          const writerPublicKey = await importPublicKey(writerPubBytes);
          const tierDek = await unwrapDekFromMember(
            wrappedDekBytes, privateKey, writerPublicKey
          );
          keyringDeks.set(rkey, tierDek);
          if (epoch === currentEpoch) {
            tierDeks.set(tier.name, tierDek);
          }
          diagLines.push(`  → OK, DEK unwrapped`);
        } catch (err) {
          diagLines.push(`  → UNWRAP FAILED: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    diagLines.push(`result: ${tierDeks.size} tier DEKs, ${keyringDeks.size} keyring DEKs`);

    return {
      org: orgRecord,
      service: founderService,
      founderDid,
      myTierName: myMembership.membership.tierName,
      myTierLevel: myTierDef.level,
      tierDeks,
      keyringDeks,
      memberships: allMemberships,
      diagnostics: diagLines.join("\n"),
    };
  };

  // --- Load channels for an org ---
  const loadChannels = async (
    client: PdsClient,
    ctx: WaveOrgContext
  ): Promise<WaveChannelRecord[]> => {
    const result: WaveChannelRecord[] = [];
    let cursor: string | undefined;
    const controlClient = ctx.founderDid === vault.session?.did
      ? client
      : new PdsClient(ctx.service);

    do {
      const page = await controlClient.listRecordsFrom(
        ctx.founderDid, CHANNEL_COLLECTION, 100, cursor
      );
      for (const rec of page.records) {
        const val = rec.value as unknown as WaveChannel;
        if (val.orgRkey !== ctx.org.rkey) continue;
        // Only show channels at tiers we can access
        const tierDef = ctx.org.org.tiers.find(t => t.name === val.tierName);
        if (tierDef && tierDef.level <= ctx.myTierLevel) {
          const rkey = rec.uri.split("/").pop()!;
          result.push({ rkey, channel: val });
        }
      }
      cursor = page.cursor;
    } while (cursor);

    return result;
  };

  // --- Create channel ---
  const createChannel = useCallback(
    async (name: string, tierName?: string) => {
      if (!pds || !vault.session || !activeOrg) return;
      // Only org founder can create channels (they go on founder's PDS)
      if (activeOrg.founderDid !== vault.session.did) {
        setError("Only the org founder can create channels");
        return;
      }
      // Default to lowest tier the founder has access to (most inclusive)
      const accessibleTiers = activeOrg.org.org.tiers
        .filter(t => t.level <= activeOrg.myTierLevel)
        .sort((a, b) => a.level - b.level);
      const resolvedTier = tierName ?? accessibleTiers[0]?.name ?? activeOrg.myTierName;

      const record: WaveChannel = {
        $type: CHANNEL_COLLECTION,
        orgRkey: activeOrg.org.rkey,
        name,
        tierName: resolvedTier,
        createdAt: new Date().toISOString(),
      };
      await pds.createRecord(CHANNEL_COLLECTION, record);
      const chans = await loadChannels(pds, activeOrg);
      setChannels(chans);
    },
    [pds, vault.session, activeOrg]
  );

  // --- Select channel → load threads ---
  const selectChannel = useCallback(
    async (channel: WaveChannelRecord) => {
      if (!pds || !activeOrg || !vault.session) return;
      setActiveChannel(channel);
      setActiveThread(null);
      setOps([]);
      setLoading(true);
      try {
        const channelUri = `at://${activeOrg.founderDid}/${CHANNEL_COLLECTION}/${channel.rkey}`;
        const loadedThreads = await loadThreadsForChannel(pds, activeOrg, channelUri);
        setThreads(loadedThreads);
      } finally {
        setLoading(false);
      }
    },
    [pds, activeOrg, vault.session]
  );

  // --- Load threads for a channel (scan all member PDSes) ---
  const loadThreadsForChannel = async (
    client: PdsClient,
    ctx: WaveOrgContext,
    channelUri: string
  ): Promise<WaveThreadRecord[]> => {
    const result: WaveThreadRecord[] = [];
    const memberDids = ctx.memberships.map(m => m.membership.memberDid);

    for (const did of memberDids) {
      try {
        let memberService: string;
        if (did === vault.session?.did) {
          memberService = client.getService();
        } else {
          memberService = await resolvePds(did);
        }
        const memberClient = did === vault.session?.did ? client : new PdsClient(memberService);

        let cursor: string | undefined;
        do {
          const page = await memberClient.listRecordsFrom(did, THREAD_COLLECTION, 100, cursor);
          for (const rec of page.records) {
            const val = rec.value as unknown as WaveThread;
            if (val.channelUri === channelUri) {
              const rkey = rec.uri.split("/").pop()!;
              const handle = ctx.memberships.find(m => m.membership.memberDid === did)?.membership.memberHandle;
              result.push({ rkey, thread: val, authorDid: did, authorHandle: handle });
            }
          }
          cursor = page.cursor;
        } while (cursor);
      } catch (err) {
        console.warn(`Failed to load threads from ${did}:`, err);
      }
    }

    result.sort((a, b) => a.thread.createdAt.localeCompare(b.thread.createdAt));
    return result;
  };

  // --- Create thread ---
  const createThread = useCallback(
    async (title?: string) => {
      if (!pds || !activeOrg || !activeChannel) return;
      const channelUri = `at://${activeOrg.founderDid}/${CHANNEL_COLLECTION}/${activeChannel.rkey}`;
      const record: WaveThread = {
        $type: THREAD_COLLECTION,
        channelUri,
        title,
        threadType: "chat",
        createdAt: new Date().toISOString(),
      };
      const res = await pds.createRecord(THREAD_COLLECTION, record);
      const rkey = res.uri.split("/").pop()!;
      const newThread: WaveThreadRecord = {
        rkey,
        thread: record,
        authorDid: vault.session!.did,
        authorHandle: vault.session!.handle,
      };
      setThreads(prev => [...prev, newThread]);
      return newThread;
    },
    [pds, activeOrg, activeChannel, vault.session]
  );

  // --- Select thread → load ops ---
  const selectThread = useCallback(
    async (thread: WaveThreadRecord) => {
      if (!pds || !activeOrg || !activeChannel) return;
      setActiveThread(thread);
      setLoading(true);
      try {
        const threadUri = `at://${thread.authorDid}/${THREAD_COLLECTION}/${thread.rkey}`;
        const loadedOps = await loadOpsForThread(pds, activeOrg, threadUri);
        setOps(loadedOps);
        // Start Jetstream for live updates
        startJetstream(activeOrg, threadUri);
      } finally {
        setLoading(false);
      }
    },
    [pds, activeOrg, activeChannel]
  );

  // --- Load ops for a thread ---
  const loadOpsForThread = async (
    client: PdsClient,
    ctx: WaveOrgContext,
    threadUri: string
  ): Promise<WaveOpRecord[]> => {
    const result: WaveOpRecord[] = [];
    const memberDids = ctx.memberships.map(m => m.membership.memberDid);

    for (const did of memberDids) {
      try {
        let memberService: string;
        if (did === vault.session?.did) {
          memberService = client.getService();
        } else {
          memberService = await resolvePds(did);
        }
        const memberClient = did === vault.session?.did ? client : new PdsClient(memberService);

        let cursor: string | undefined;
        do {
          const page = await memberClient.listRecordsFrom(did, OP_COLLECTION, 100, cursor);
          for (const rec of page.records) {
            const val = rec.value as unknown as WaveOp;
            if (val.threadUri === threadUri) {
              const rkey = rec.uri.split("/").pop()!;
              const handle = ctx.memberships.find(m => m.membership.memberDid === did)?.membership.memberHandle;
              result.push({ rkey, op: val, authorDid: did, authorHandle: handle });
            }
          }
          cursor = page.cursor;
        } while (cursor);
      } catch (err) {
        console.warn(`Failed to load ops from ${did}:`, err);
      }
    }

    result.sort((a, b) => a.op.createdAt.localeCompare(b.op.createdAt));
    return result;
  };

  // --- Decrypt a message op ---
  const decryptOp = useCallback(
    async (op: WaveOp): Promise<MessagePayload | null> => {
      if (!activeOrg) return null;
      // Try keyring DEK first, then tier DEK
      const dek = activeOrg.keyringDeks.get(op.keyringRkey) ?? activeOrg.tierDeks.get(
        // Extract tier name from keyring rkey (format: orgRkey:tierName or orgRkey:tierName:epoch)
        op.keyringRkey.split(":").slice(1, -1).join(":") || op.keyringRkey.split(":")[1]
      );
      if (!dek) return null;
      try {
        const iv = fromBase64(op.iv.$bytes);
        const ciphertext = fromBase64(op.ciphertext.$bytes);
        const plaintext = await decrypt(ciphertext, iv, dek);
        const json = new TextDecoder().decode(plaintext);
        return JSON.parse(json) as MessagePayload;
      } catch {
        return null;
      }
    },
    [activeOrg]
  );

  // --- Send message ---
  const sendMessage = useCallback(
    async () => {
      if (!pds || !activeOrg || !activeThread || !messageText.trim()) return;
      setSending(true);
      try {
        const tierName = activeChannel!.channel.tierName;
        const dek = activeOrg.tierDeks.get(tierName);
        if (!dek) {
          const available = [...activeOrg.tierDeks.keys()].join(", ");
          throw new Error(
            `No DEK for tier "${tierName}". Available: [${available}].\n\n` +
            `--- Keyring Trace ---\n${activeOrg.diagnostics}`
          );
        }

        const keyringRkey = keyringRkeyForTier(
          activeOrg.org.rkey,
          tierName,
          activeOrg.org.org.tiers.find(t => t.name === tierName)?.currentEpoch ?? 0
        );

        const payload: MessagePayload = { text: messageText.trim() };
        const plaintext = new TextEncoder().encode(JSON.stringify(payload));
        const { iv, ciphertext } = await encrypt(plaintext, dek);

        const threadUri = `at://${activeThread.authorDid}/${THREAD_COLLECTION}/${activeThread.rkey}`;
        const record: WaveOp = {
          $type: OP_COLLECTION,
          threadUri,
          opType: "message",
          keyringRkey,
          iv: { $bytes: toBase64(iv) },
          ciphertext: { $bytes: toBase64(ciphertext) },
          createdAt: new Date().toISOString(),
        };

        const res = await pds.createRecord(OP_COLLECTION, record);
        const rkey = res.uri.split("/").pop()!;

        // Optimistic add
        setOps(prev => [...prev, {
          rkey,
          op: record,
          authorDid: vault.session!.did,
          authorHandle: vault.session!.handle,
        }]);
        setMessageText("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Send failed");
      } finally {
        setSending(false);
      }
    },
    [pds, activeOrg, activeThread, activeChannel, messageText, vault.session]
  );

  // --- Jetstream live updates ---
  const startJetstream = useCallback(
    (ctx: WaveOrgContext, threadUri: string) => {
      // Close existing connection
      jetstreamRef.current?.close();

      const memberDids = ctx.memberships.map(m => m.membership.memberDid);

      const client = new JetstreamClient({
        wantedDids: memberDids,
        wantedCollections: [OP_COLLECTION, THREAD_COLLECTION, CHANNEL_COLLECTION],
        onEvent: (event: JetstreamEvent) => {
          if (event.kind !== "commit" || !event.commit) return;
          const { operation, collection, rkey, record } = event.commit;

          if (operation === "create" && collection === OP_COLLECTION && record) {
            const op = record as unknown as WaveOp;
            if (op.threadUri === threadUri) {
              // Don't duplicate our own ops (already added optimistically)
              if (event.did === vault.session?.did) return;
              const handle = ctx.memberships.find(
                m => m.membership.memberDid === event.did
              )?.membership.memberHandle;
              setOps(prev => [...prev, {
                rkey,
                op,
                authorDid: event.did,
                authorHandle: handle,
              }]);
            }
          }
        },
        onConnect: () => setConnected(true),
        onDisconnect: () => setConnected(false),
      });

      client.connect();
      jetstreamRef.current = client;
    },
    [vault.session]
  );

  // Cleanup Jetstream on unmount
  useEffect(() => {
    return () => {
      jetstreamRef.current?.close();
    };
  }, []);

  // --- Decrypted messages cache ---
  const [decryptedMessages, setDecryptedMessages] = useState<Map<string, MessagePayload>>(new Map());

  useEffect(() => {
    if (!activeOrg || ops.length === 0) return;
    let cancelled = false;

    (async () => {
      const newDecrypted = new Map(decryptedMessages);
      let changed = false;
      for (const opRec of ops) {
        const key = `${opRec.authorDid}:${opRec.rkey}`;
        if (newDecrypted.has(key)) continue;
        const payload = await decryptOp(opRec.op);
        if (cancelled) return;
        if (payload) {
          newDecrypted.set(key, payload);
          changed = true;
        }
      }
      if (changed) setDecryptedMessages(newDecrypted);
    })();

    return () => { cancelled = true; };
  }, [ops, activeOrg, decryptOp]);

  // --- Render ---

  if (!vault.session) {
    return <LoginView onLogin={handleLogin} />;
  }

  if (loading && !activeOrg) {
    return <div className="loading-screen">Loading orgs...</div>;
  }

  // Org picker
  if (!activeOrg) {
    return (
      <div className="org-picker">
        <div className="org-picker-card">
          <h1>Wave</h1>
          <p className="subtitle">Choose an organization</p>
          {orgs.length === 0 ? (
            <p className="empty">No orgs found. Create one in the CRM first.</p>
          ) : (
            <div className="org-list">
              {orgs.map(o => (
                <button
                  key={o.rkey}
                  className="org-item"
                  onClick={() => selectOrg(o)}
                >
                  <span className="org-name">{o.org.name}</span>
                  <span className="org-tiers">
                    {o.org.tiers.map(t => t.name).join(", ")}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button className="btn-secondary logout-btn" onClick={() => {
            setVault({ session: null, dek: null, initialized: false, keyringRkey: null });
            setPds(null);
          }}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  // Main chat interface
  return (
    <div className="wave-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>{activeOrg.org.org.name}</h2>
          <button className="btn-icon" title="Back to orgs" onClick={() => {
            setActiveOrg(null);
            setChannels([]);
            setActiveChannel(null);
            setThreads([]);
            setActiveThread(null);
            setOps([]);
            setDecryptedMessages(new Map());
            jetstreamRef.current?.close();
          }}>
            ←
          </button>
        </div>

        {/* Channels */}
        <div className="sidebar-section">
          <div className="section-header">
            <span>Channels</span>
            {activeOrg.founderDid === vault.session.did && (
              <button
                className="btn-icon"
                title="New channel"
                onClick={() => {
                  const name = prompt("Channel name:");
                  if (!name) return;
                  const tiers = activeOrg.org.org.tiers
                    .filter(t => t.level <= activeOrg.myTierLevel)
                    .sort((a, b) => a.level - b.level);
                  const tierStr = prompt(
                    `Tier (${tiers.map(t => t.name).join(", ")}):`,
                    tiers[0]?.name
                  );
                  createChannel(name, tierStr || undefined);
                }}
              >
                +
              </button>
            )}
          </div>
          {channels.map(ch => (
            <button
              key={ch.rkey}
              className={`sidebar-item ${activeChannel?.rkey === ch.rkey ? "active" : ""}`}
              onClick={() => selectChannel(ch)}
            >
              # {ch.channel.name}
            </button>
          ))}
          {channels.length === 0 && (
            <p className="empty-hint">No channels yet</p>
          )}
        </div>

        {/* Threads */}
        {activeChannel && (
          <div className="sidebar-section">
            <div className="section-header">
              <span>Threads</span>
              <button
                className="btn-icon"
                title="New thread"
                onClick={async () => {
                  const title = prompt("Thread title (optional):");
                  const t = await createThread(title || undefined);
                  if (t) selectThread(t);
                }}
              >
                +
              </button>
            </div>
            {threads.map(th => (
              <button
                key={`${th.authorDid}:${th.rkey}`}
                className={`sidebar-item ${activeThread?.rkey === th.rkey && activeThread?.authorDid === th.authorDid ? "active" : ""}`}
                onClick={() => selectThread(th)}
              >
                {th.thread.title || "Chat"}
              </button>
            ))}
            {threads.length === 0 && (
              <p className="empty-hint">No threads yet</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          <span className={`status-dot ${connected ? "connected" : ""}`} />
          <span className="handle">@{vault.session.handle}</span>
        </div>
      </div>

      {/* Main area */}
      <div className="main-area">
        {error && (
          <div className="error-bar">
            <pre className="error-text">{error}</pre>
            <button onClick={() => setError("")}>×</button>
          </div>
        )}

        {!activeThread ? (
          <div className="empty-state">
            {!activeChannel
              ? "Select a channel to get started"
              : "Select or create a thread"}
          </div>
        ) : (
          <>
            <div className="thread-header">
              <h3>{activeThread.thread.title || `# ${activeChannel!.channel.name}`}</h3>
              <span className="thread-meta">
                {activeOrg.memberships.length} members
                {connected && " · live"}
              </span>
            </div>

            <div className="messages">
              {loading && <div className="loading-inline">Loading messages...</div>}
              {ops.map(opRec => {
                const key = `${opRec.authorDid}:${opRec.rkey}`;
                const payload = decryptedMessages.get(key);
                const isMe = opRec.authorDid === vault.session!.did;
                return (
                  <div key={key} className={`message ${isMe ? "mine" : ""}`}>
                    <div className="message-author">
                      {opRec.authorHandle
                        ? `@${opRec.authorHandle}`
                        : opRec.authorDid.slice(0, 20) + "..."}
                    </div>
                    <div className="message-text">
                      {payload ? payload.text : "🔒 Decrypting..."}
                    </div>
                    <div className="message-time">
                      {new Date(opRec.op.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="compose">
              <input
                type="text"
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                disabled={sending}
              />
              <button
                className="btn-primary send-btn"
                onClick={sendMessage}
                disabled={sending || !messageText.trim()}
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Login View ---

function LoginView({ onLogin }: { onLogin: (s: string, h: string, p: string, v: string) => Promise<void> }) {
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
        <h1>Wave</h1>
        <p className="subtitle">Encrypted chat on ATProto</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="service">PDS Service</label>
            <input
              id="service"
              type="url"
              value={service}
              onChange={e => setService(e.target.value)}
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
              onChange={e => setHandle(e.target.value)}
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
              onChange={e => setAppPassword(e.target.value)}
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
              onChange={e => setPassphrase(e.target.value)}
              placeholder="Your encryption passphrase"
              required
              minLength={8}
            />
            <small>
              Same passphrase as the CRM. Never leaves your browser.
            </small>
          </div>

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Unlocking..." : "Open Wave"}
          </button>
        </form>
      </div>
    </div>
  );
}
