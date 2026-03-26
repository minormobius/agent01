import { useCallback, useEffect, useRef, useState } from "react";
import { PdsClient, resolveHandle, resolvePds } from "./pds";
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
  generateTierDek,
  wrapDekForMember,
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
  DocEditPayload,
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

  // Doc state
  const [docText, setDocText] = useState("");
  const [docEditing, setDocEditing] = useState(false);
  const [docHistory, setDocHistory] = useState<Array<{ uri: string; authorDid: string; authorHandle?: string; text: string; createdAt: string }>>([]);
  const [showDocHistory, setShowDocHistory] = useState(false);

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        const ctx = await buildOrgContext(pds, orgRecord, identityKeys.privateKey, vault.session.did);
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

    // Unwrap DEKs
    const tierDeks = new Map<string, CryptoKey>();
    const keyringDeks = new Map<string, CryptoKey>();
    const accessibleTiers = orgRecord.org.tiers.filter(t => t.level <= myTierDef.level);
    const diagLines: string[] = [];

    for (const tier of accessibleTiers) {
      const currentEpoch = tier.currentEpoch ?? 0;
      for (let epoch = 0; epoch <= currentEpoch; epoch++) {
        const rkey = keyringRkeyForTier(orgRecord.rkey, tier.name, epoch);
        try {
          const keyringRecord = await controlClient.getRecordFrom(
            founderDid, KEYRING_COLLECTION, rkey
          );
          if (!keyringRecord) {
            diagLines.push(`${tier.name}: keyring not found`);
            continue;
          }
          const keyringVal = (keyringRecord as Record<string, unknown>).value as Keyring & { $type: string };
          const myEntry = keyringVal.members.find((m: KeyringMemberEntry) => m.did === myDid);
          if (!myEntry) {
            diagLines.push(`${tier.name}: not in keyring`);
            continue;
          }

          // Handle both plain base64 string and ATProto { $bytes: "..." } format
          const wrappedDekB64 = typeof myEntry.wrappedDek === "string"
            ? myEntry.wrappedDek
            : (myEntry.wrappedDek as unknown as { $bytes: string }).$bytes;
          const writerPubB64 = typeof keyringVal.writerPublicKey === "string"
            ? keyringVal.writerPublicKey
            : (keyringVal.writerPublicKey as unknown as { $bytes: string }).$bytes;

          const writerPubBytes = fromBase64(writerPubB64);
          const wrappedDekBytes = fromBase64(wrappedDekB64);

          const writerPublicKey = await importPublicKey(writerPubBytes);
          const tierDek = await unwrapDekFromMember(
            wrappedDekBytes, privateKey, writerPublicKey
          );
          keyringDeks.set(rkey, tierDek);
          if (epoch === currentEpoch) {
            tierDeks.set(tier.name, tierDek);
          }
          diagLines.push(`${tier.name}: OK`);
        } catch (err) {
          diagLines.push(`${tier.name}: FAILED ${err instanceof Error ? err.message : err}`);
        }
      }
    }

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

  // --- Create doc thread ---
  const createDocThread = useCallback(
    async (title: string) => {
      if (!pds || !activeOrg || !activeChannel) return;
      const channelUri = `at://${activeOrg.founderDid}/${CHANNEL_COLLECTION}/${activeChannel.rkey}`;
      const record: WaveThread = {
        $type: THREAD_COLLECTION,
        channelUri,
        title,
        threadType: "doc",
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

  // --- Send doc edit ---
  const sendDocEdit = useCallback(
    async (text: string) => {
      if (!pds || !activeOrg || !activeThread || !activeChannel) return;
      setSending(true);
      try {
        const tierName = activeChannel.channel.tierName;
        const dek = activeOrg.tierDeks.get(tierName);
        if (!dek) throw new Error(`No DEK for tier "${tierName}"`);

        const keyringRkey = keyringRkeyForTier(
          activeOrg.org.rkey,
          tierName,
          activeOrg.org.org.tiers.find(t => t.name === tierName)?.currentEpoch ?? 0
        );

        // Level 2: include baseOpUri pointing to the last known op
        const lastOp = ops.length > 0 ? ops[ops.length - 1] : null;
        const baseOpUri = lastOp
          ? `at://${lastOp.authorDid}/${OP_COLLECTION}/${lastOp.rkey}`
          : undefined;

        const payload: DocEditPayload = { text, baseOpUri };
        const plaintext = new TextEncoder().encode(JSON.stringify(payload));
        const { iv, ciphertext } = await encrypt(plaintext, dek);

        const threadUri = `at://${activeThread.authorDid}/${THREAD_COLLECTION}/${activeThread.rkey}`;

        // Set parentOps for causal ordering (Level 2)
        const parentOps = baseOpUri ? [baseOpUri] : undefined;

        const record: WaveOp = {
          $type: OP_COLLECTION,
          threadUri,
          parentOps,
          opType: "doc_edit",
          keyringRkey,
          iv: { $bytes: toBase64(iv) },
          ciphertext: { $bytes: toBase64(ciphertext) },
          createdAt: new Date().toISOString(),
        };

        const res = await pds.createRecord(OP_COLLECTION, record);
        const rkey = res.uri.split("/").pop()!;

        setOps(prev => [...prev, {
          rkey,
          op: record,
          authorDid: vault.session!.did,
          authorHandle: vault.session!.handle,
        }]);
        setDocEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSending(false);
      }
    },
    [pds, activeOrg, activeThread, activeChannel, ops, vault.session]
  );

  // --- Delete channel (founder only) ---
  const deleteChannel = useCallback(
    async (channel: WaveChannelRecord) => {
      if (!pds || !vault.session || !activeOrg) return;
      if (activeOrg.founderDid !== vault.session.did) {
        setError("Only the org founder can delete channels");
        return;
      }
      if (!confirm(`Delete channel #${channel.channel.name}?`)) return;
      await pds.deleteRecord(CHANNEL_COLLECTION, channel.rkey);
      setChannels(prev => prev.filter(c => c.rkey !== channel.rkey));
      if (activeChannel?.rkey === channel.rkey) {
        setActiveChannel(null);
        setThreads([]);
        setActiveThread(null);
        setOps([]);
      }
    },
    [pds, vault.session, activeOrg, activeChannel]
  );

  // --- Delete thread (author only — you can only delete your own records) ---
  const deleteThread = useCallback(
    async (thread: WaveThreadRecord) => {
      if (!pds || !vault.session) return;
      if (thread.authorDid !== vault.session.did) {
        setError("You can only delete threads you created");
        return;
      }
      if (!confirm(`Delete thread "${thread.thread.title || "Chat"}"?`)) return;
      await pds.deleteRecord(THREAD_COLLECTION, thread.rkey);
      setThreads(prev => prev.filter(t => !(t.rkey === thread.rkey && t.authorDid === thread.authorDid)));
      if (activeThread?.rkey === thread.rkey && activeThread?.authorDid === thread.authorDid) {
        setActiveThread(null);
        setOps([]);
      }
    },
    [pds, vault.session, activeThread]
  );

  // --- Create org ---
  const createOrg = useCallback(
    async (name: string, tierNames: string[]) => {
      if (!pds || !vault.session || !identityKeys) return;
      const tiers = tierNames.map((n, i) => ({ name: n, level: i }));
      const org: Org = {
        name,
        founderDid: vault.session.did,
        tiers,
        createdAt: new Date().toISOString(),
      };
      const orgRes = await pds.createRecord(ORG_COLLECTION, { $type: ORG_COLLECTION, ...org });
      const orgRkey = orgRes.uri.split("/").pop()!;

      // Create membership for the founder
      const membership: Membership = {
        orgRkey,
        orgService: pds.getService(),
        orgFounderDid: vault.session.did,
        memberDid: vault.session.did,
        memberHandle: vault.session.handle,
        tierName: tiers[tiers.length - 1].name, // founder gets highest tier
        invitedBy: vault.session.did,
        createdAt: new Date().toISOString(),
      };
      await pds.createRecord(MEMBERSHIP_COLLECTION, { $type: MEMBERSHIP_COLLECTION, ...membership });

      // Create keyring for each tier with founder as sole member
      const pubKeyRaw = await exportPublicKey(identityKeys.publicKey);
      for (const tier of tiers) {
        const tierDek = await generateTierDek();
        const wrappedDek = await wrapDekForMember(tierDek, identityKeys.privateKey, identityKeys.publicKey);
        const keyring: Keyring & { $type: string } = {
          $type: KEYRING_COLLECTION,
          orgRkey,
          tierName: tier.name,
          epoch: 0,
          writerDid: vault.session.did,
          writerPublicKey: { $bytes: toBase64(pubKeyRaw) } as unknown as string,
          members: [{ did: vault.session.did, wrappedDek: { $bytes: toBase64(wrappedDek) } as unknown as string }],
        };
        const rkey = `${orgRkey}:${tier.name}`;
        await pds.putRecord(KEYRING_COLLECTION, rkey, keyring);
      }

      // Refresh org list
      const discovered = await discoverOrgs(pds, vault.session.did, identityKeys.privateKey);
      setOrgs(discovered);
    },
    [pds, vault.session, identityKeys]
  );

  // --- Invite member to org ---
  const inviteMember = useCallback(
    async (handleOrDid: string, tierName: string) => {
      if (!pds || !vault.session || !activeOrg || !identityKeys) return;
      if (activeOrg.founderDid !== vault.session.did) {
        setError("Only the org founder can invite members");
        return;
      }

      // Resolve handle → DID
      const memberDid = handleOrDid.startsWith("did:")
        ? handleOrDid
        : await resolveHandle(handleOrDid);
      const memberHandle = handleOrDid.startsWith("did:") ? undefined : handleOrDid.replace(/^@/, "");

      // Get the member's public key from their PDS
      const memberService = await resolvePds(memberDid);
      const memberClient = new PdsClient(memberService);
      const pubRecord = await memberClient.getRecordFrom(memberDid, PUBKEY_COLLECTION, "self");
      if (!pubRecord) throw new Error("Invitee has no vault encryption key. They must log into Wave first.");
      const pubVal = (pubRecord as Record<string, unknown>).value as Record<string, unknown>;
      const pubField = pubVal.publicKey as { $bytes: string };
      const memberPubKey = await importPublicKey(fromBase64(pubField.$bytes));

      // Create membership record
      const membership: Membership = {
        orgRkey: activeOrg.org.rkey,
        orgService: pds.getService(),
        orgFounderDid: vault.session.did,
        memberDid,
        memberHandle,
        tierName,
        invitedBy: vault.session.did,
        createdAt: new Date().toISOString(),
      };
      await pds.createRecord(MEMBERSHIP_COLLECTION, { $type: MEMBERSHIP_COLLECTION, ...membership });

      // Add member to keyrings for all tiers at their level and below
      const memberTierDef = activeOrg.org.org.tiers.find(t => t.name === tierName);
      if (!memberTierDef) throw new Error("Tier not found");
      const accessibleTiers = activeOrg.org.org.tiers.filter(t => t.level <= memberTierDef.level);

      const pubKeyRaw = await exportPublicKey(identityKeys.publicKey);
      for (const tier of accessibleTiers) {
        const epoch = tier.currentEpoch ?? 0;
        const rkey = keyringRkeyForTier(activeOrg.org.rkey, tier.name, epoch);
        const existing = await pds.getRecord(KEYRING_COLLECTION, rkey);

        if (existing) {
          const keyringVal = (existing as Record<string, unknown>).value as Keyring & { $type: string };
          // Get existing DEK from our own entry
          const myDek = activeOrg.tierDeks.get(tier.name);
          if (!myDek) continue;

          // Wrap DEK for the new member
          const wrappedDek = await wrapDekForMember(myDek, identityKeys.privateKey, memberPubKey);

          keyringVal.members.push({
            did: memberDid,
            wrappedDek: { $bytes: toBase64(wrappedDek) } as unknown as string,
          });
          keyringVal.writerDid = vault.session.did;
          keyringVal.writerPublicKey = { $bytes: toBase64(pubKeyRaw) } as unknown as string;
          await pds.putRecord(KEYRING_COLLECTION, rkey, keyringVal);
        }
      }

      // Create a bookmark on the invitee's PDS (they'll discover the org next login)
      // Note: Can't write to their PDS directly — they'll discover via bookmark on next login
      // The founder stores a "pending invite" that the member resolves client-side

      // Refresh context
      const ctx = await buildOrgContext(pds, activeOrg.org, identityKeys.privateKey, vault.session.did);
      setActiveOrg(ctx);
    },
    [pds, vault.session, activeOrg, identityKeys]
  );

  // --- Remove member from org ---
  const removeMember = useCallback(
    async (membershipRecord: MembershipRecord) => {
      if (!pds || !vault.session || !activeOrg) return;
      if (activeOrg.founderDid !== vault.session.did) {
        setError("Only the org founder can remove members");
        return;
      }
      if (membershipRecord.membership.memberDid === vault.session.did) {
        setError("Cannot remove yourself (the founder) from the org");
        return;
      }
      if (!confirm(`Remove @${membershipRecord.membership.memberHandle || membershipRecord.membership.memberDid} from ${activeOrg.org.org.name}?`)) return;

      await pds.deleteRecord(MEMBERSHIP_COLLECTION, membershipRecord.rkey);

      // TODO: Rotate tier keyrings (epoch bump) to revoke access to future messages
      // For now, removed members lose access to new messages but could still decrypt old ones

      // Refresh context
      const ctx = await buildOrgContext(pds, activeOrg.org, identityKeys!.privateKey, vault.session.did);
      setActiveOrg(ctx);
    },
    [pds, vault.session, activeOrg, identityKeys]
  );

  // --- Delete org ---
  const deleteOrg = useCallback(
    async (orgRecord: OrgRecord) => {
      if (!pds || !vault.session) return;
      if (orgRecord.org.founderDid !== vault.session.did) {
        setError("Only the org founder can delete an org");
        return;
      }
      if (!confirm(`Delete org "${orgRecord.org.name}"? This removes all memberships, keyrings, and channels.`)) return;

      // Delete memberships
      let cursor: string | undefined;
      do {
        const page = await pds.listRecords(MEMBERSHIP_COLLECTION, 100, cursor);
        for (const rec of page.records) {
          const val = rec.value as unknown as Membership;
          if (val.orgRkey === orgRecord.rkey) {
            const rkey = rec.uri.split("/").pop()!;
            await pds.deleteRecord(MEMBERSHIP_COLLECTION, rkey);
          }
        }
        cursor = page.cursor;
      } while (cursor);

      // Delete keyrings
      cursor = undefined;
      do {
        const page = await pds.listRecords(KEYRING_COLLECTION, 100, cursor);
        for (const rec of page.records) {
          const val = rec.value as unknown as Keyring;
          if (val.orgRkey === orgRecord.rkey) {
            const rkey = rec.uri.split("/").pop()!;
            await pds.deleteRecord(KEYRING_COLLECTION, rkey);
          }
        }
        cursor = page.cursor;
      } while (cursor);

      // Delete channels
      cursor = undefined;
      do {
        const page = await pds.listRecords(CHANNEL_COLLECTION, 100, cursor);
        for (const rec of page.records) {
          const val = rec.value as unknown as WaveChannel;
          if (val.orgRkey === orgRecord.rkey) {
            const rkey = rec.uri.split("/").pop()!;
            await pds.deleteRecord(CHANNEL_COLLECTION, rkey);
          }
        }
        cursor = page.cursor;
      } while (cursor);

      // Delete the org record itself
      await pds.deleteRecord(ORG_COLLECTION, orgRecord.rkey);

      // Refresh
      const discovered = await discoverOrgs(pds, vault.session.did, identityKeys!.privateKey);
      setOrgs(discovered);
      setActiveOrg(null);
      setChannels([]);
      setActiveChannel(null);
      setThreads([]);
      setActiveThread(null);
      setOps([]);
    },
    [pds, vault.session, identityKeys]
  );

  // --- Select thread → load ops ---
  const selectThread = useCallback(
    async (thread: WaveThreadRecord) => {
      if (!pds || !activeOrg || !activeChannel) return;
      setActiveThread(thread);
      setSidebarOpen(false);
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
  const [decryptedMessages, setDecryptedMessages] = useState<Map<string, MessagePayload | DocEditPayload>>(new Map());

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
      if (changed) {
        setDecryptedMessages(newDecrypted);

        // Build doc state if this is a doc thread
        if (activeThread?.thread.threadType === "doc") {
          const history: typeof docHistory = [];
          let latestText = "";
          for (const opRec of ops) {
            const key = `${opRec.authorDid}:${opRec.rkey}`;
            const p = newDecrypted.get(key);
            if (p && "text" in p && opRec.op.opType === "doc_edit") {
              const docPayload = p as DocEditPayload;
              latestText = docPayload.text;
              history.push({
                uri: `at://${opRec.authorDid}/${OP_COLLECTION}/${opRec.rkey}`,
                authorDid: opRec.authorDid,
                authorHandle: opRec.authorHandle,
                text: docPayload.text,
                createdAt: opRec.op.createdAt,
              });
            }
          }
          setDocHistory(history);
          if (!docEditing) setDocText(latestText);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [ops, activeOrg, decryptOp, activeThread]);

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
            <p className="empty">No orgs yet.</p>
          ) : (
            <div className="org-list">
              {orgs.map(o => (
                <div key={o.rkey} className="sidebar-row">
                  <button
                    className="org-item"
                    onClick={() => selectOrg(o)}
                  >
                    <span className="org-name">{o.org.name}</span>
                    <span className="org-tiers">
                      {o.org.tiers.map(t => t.name).join(", ")}
                    </span>
                  </button>
                  {o.org.founderDid === vault.session!.did && (
                    <button
                      className="btn-delete"
                      title="Delete org"
                      onClick={(e) => { e.stopPropagation(); deleteOrg(o); }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <button className="btn-secondary" onClick={async () => {
            const name = prompt("Organization name:");
            if (!name) return;
            const tiersStr = prompt("Tier names (comma-separated, lowest to highest):", "member, admin");
            if (!tiersStr) return;
            const tierNames = tiersStr.split(",").map(s => s.trim()).filter(Boolean);
            if (tierNames.length === 0) return;
            setLoading(true);
            try {
              await createOrg(name, tierNames);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to create org");
            } finally {
              setLoading(false);
            }
          }}>
            + New Organization
          </button>
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
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
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
            <div key={ch.rkey} className="sidebar-row">
              <button
                className={`sidebar-item ${activeChannel?.rkey === ch.rkey ? "active" : ""}`}
                onClick={() => selectChannel(ch)}
              >
                # {ch.channel.name}
              </button>
              {activeOrg.founderDid === vault.session!.did && (
                <button
                  className="btn-delete"
                  title="Delete channel"
                  onClick={(e) => { e.stopPropagation(); deleteChannel(ch); }}
                >
                  ×
                </button>
              )}
            </div>
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
              <span>
                <button
                  className="btn-icon"
                  title="New chat thread"
                  onClick={async () => {
                    const title = prompt("Thread title (optional):");
                    const t = await createThread(title || undefined);
                    if (t) selectThread(t);
                  }}
                >
                  +
                </button>
                <button
                  className="btn-icon"
                  title="New doc"
                  onClick={async () => {
                    const title = prompt("Document title:");
                    if (!title) return;
                    const t = await createDocThread(title);
                    if (t) selectThread(t);
                  }}
                >
                  D
                </button>
              </span>
            </div>
            {threads.map(th => (
              <div key={`${th.authorDid}:${th.rkey}`} className="sidebar-row">
                <button
                  className={`sidebar-item ${activeThread?.rkey === th.rkey && activeThread?.authorDid === th.authorDid ? "active" : ""}`}
                  onClick={() => selectThread(th)}
                >
                  {th.thread.threadType === "doc" ? "[doc] " : ""}{th.thread.title || "Chat"}
                </button>
                {th.authorDid === vault.session!.did && (
                  <button
                    className="btn-delete"
                    title="Delete thread"
                    onClick={(e) => { e.stopPropagation(); deleteThread(th); }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {threads.length === 0 && (
              <p className="empty-hint">No threads yet</p>
            )}
          </div>
        )}

        {/* Members */}
        <div className="sidebar-section">
          <div className="section-header">
            <span>Members</span>
            {activeOrg.founderDid === vault.session.did && (
              <button
                className="btn-icon"
                title="Invite member"
                onClick={async () => {
                  const handle = prompt("Handle or DID to invite:");
                  if (!handle) return;
                  const tiers = activeOrg.org.org.tiers.sort((a, b) => a.level - b.level);
                  const tierStr = prompt(
                    `Tier (${tiers.map(t => t.name).join(", ")}):`,
                    tiers[0]?.name
                  );
                  if (!tierStr) return;
                  setLoading(true);
                  try {
                    await inviteMember(handle, tierStr);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Invite failed");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                +
              </button>
            )}
          </div>
          {activeOrg.memberships.map(m => (
            <div key={m.rkey} className="sidebar-row">
              <span className="sidebar-item member-item">
                @{m.membership.memberHandle || m.membership.memberDid.slice(0, 16) + "..."}
                <span className="tier-badge">{m.membership.tierName}</span>
              </span>
              {activeOrg.founderDid === vault.session!.did && m.membership.memberDid !== vault.session!.did && (
                <button
                  className="btn-delete"
                  title="Remove member"
                  onClick={() => removeMember(m)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <span className={`status-dot ${connected ? "connected" : ""}`} />
          <span className="handle">@{vault.session.handle}</span>
        </div>
      </div>

      {/* Main area */}
      <div className="main-area">
        <div className="mobile-header">
          <button className="btn-hamburger" onClick={() => setSidebarOpen(true)}>
            ☰
          </button>
          <span className="mobile-title">
            {activeChannel ? `# ${activeChannel.channel.name}` : activeOrg.org.org.name}
            {activeThread?.thread.title ? ` / ${activeThread.thread.title}` : ""}
          </span>
          <span className={`status-dot ${connected ? "connected" : ""}`} />
        </div>
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
        ) : activeThread.thread.threadType === "doc" ? (
          /* --- Doc view --- */
          <>
            <div className="thread-header">
              <h3>{activeThread.thread.title || "Untitled Document"}</h3>
              <span className="thread-meta">
                {docHistory.length} edits
                {connected && " · live"}
                <button className="btn-icon" title="History" onClick={() => setShowDocHistory(!showDocHistory)}>
                  {showDocHistory ? "Close" : "History"}
                </button>
              </span>
            </div>

            {showDocHistory ? (
              <div className="messages doc-history">
                <div className="doc-history-header">Edit History ({docHistory.length} versions)</div>
                {docHistory.map((entry, i) => (
                  <div key={entry.uri} className="message">
                    <div className="message-author">
                      v{i + 1} by @{entry.authorHandle || entry.authorDid.slice(0, 16) + "..."}
                    </div>
                    <div className="message-text doc-history-text">
                      {entry.text.slice(0, 200)}{entry.text.length > 200 ? "..." : ""}
                    </div>
                    <div className="message-time">
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                    <button className="btn-secondary" onClick={() => {
                      setDocText(entry.text);
                      setDocEditing(true);
                      setShowDocHistory(false);
                    }}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            ) : docEditing ? (
              <div className="doc-editor">
                <textarea
                  className="doc-textarea"
                  value={docText}
                  onChange={e => setDocText(e.target.value)}
                  placeholder="Write your document in markdown..."
                />
                <div className="doc-actions">
                  <button
                    className="btn-primary"
                    onClick={() => sendDocEdit(docText)}
                    disabled={sending}
                  >
                    {sending ? "Saving..." : "Save"}
                  </button>
                  <button className="btn-secondary" onClick={() => {
                    setDocEditing(false);
                    // Restore to latest version
                    if (docHistory.length > 0) {
                      setDocText(docHistory[docHistory.length - 1].text);
                    }
                  }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="doc-viewer">
                {loading && <div className="loading-inline">Loading document...</div>}
                <div className="doc-content">
                  {docText ? (
                    <pre className="doc-rendered">{docText}</pre>
                  ) : (
                    <p className="empty-hint">Empty document. Click Edit to start writing.</p>
                  )}
                </div>
                <div className="doc-actions">
                  <button className="btn-primary" onClick={() => setDocEditing(true)}>
                    Edit
                  </button>
                </div>
              </div>
            )}

            {/* Chat comments on the doc */}
            <div className="doc-comments">
              <div className="section-header"><span>Comments</span></div>
              <div className="messages compact">
                {ops.filter(o => o.op.opType === "message").map(opRec => {
                  const key = `${opRec.authorDid}:${opRec.rkey}`;
                  const payload = decryptedMessages.get(key);
                  return (
                    <div key={key} className="message compact">
                      <span className="message-author">
                        @{opRec.authorHandle || opRec.authorDid.slice(0, 16) + "..."}
                      </span>
                      <span className="message-text">
                        {payload ? payload.text : "Decrypting..."}
                      </span>
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
                  placeholder="Add a comment..."
                  disabled={sending}
                />
                <button
                  className="btn-primary send-btn"
                  onClick={sendMessage}
                  disabled={sending || !messageText.trim()}
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          /* --- Chat view --- */
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
                      {payload ? payload.text : "Decrypting..."}
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
              Encrypts your vault keys. Never leaves your browser.
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
