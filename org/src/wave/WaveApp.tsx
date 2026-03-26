/**
 * WaveApp — encrypted channels, threads & docs on ATProto.
 * Receives vault + pds from the org hub (no independent login).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { PdsClient, resolvePds } from "../pds";
import { resolveHandle } from "../pds";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type { OrgRecord, OrgBookmark } from "../types";
import type {
  WaveOrgContext,
  WaveChannelRecord,
  WaveThreadRecord,
  WaveOpRecord,
  MessagePayload,
  DocEditPayload,
} from "./types";
import {
  buildOrgContext,
  loadChannels,
  loadThreadsForChannel,
  loadOpsForThread,
  decryptOp,
  sendMessageOp,
  sendDocEditOp,
  createChannelRecord,
  createThreadRecord,
  inviteMemberToOrg,
  createOrgRecord,
  CHANNEL_COLLECTION,
  THREAD_COLLECTION,
  MEMBERSHIP_COLLECTION,
} from "./context";
import { JetstreamClient, type JetstreamEvent } from "./jetstream";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { DocView } from "./components/DocView";
import { OrgPicker } from "./components/OrgPicker";

const ORG_COLLECTION = "com.minomobi.vault.org";
const BOOKMARK_COLLECTION = "com.minomobi.vault.orgBookmark";
const OP_COLLECTION = "com.minomobi.wave.op";

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs?: OrgRecord[];
  orgContexts?: Map<string, import("../crm/types").OrgContext>;
}

export function WaveApp({ vault, pds, orgs: sharedOrgs = [] }: Props) {
  const { navigate } = useRouter();

  // Org state (use shared orgs from hub, fall back to local discovery)
  const [localOrgs, setLocalOrgs] = useState<OrgRecord[]>([]);
  const orgs = sharedOrgs.length > 0 ? sharedOrgs : localOrgs;
  const [activeOrg, setActiveOrg] = useState<WaveOrgContext | null>(null);

  // Wave state
  const [channels, setChannels] = useState<WaveChannelRecord[]>([]);
  const [activeChannel, setActiveChannel] = useState<WaveChannelRecord | null>(null);
  const [threads, setThreads] = useState<WaveThreadRecord[]>([]);
  const [activeThread, setActiveThread] = useState<WaveThreadRecord | null>(null);
  const [ops, setOps] = useState<WaveOpRecord[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Jetstream
  const jetstreamRef = useRef<JetstreamClient | null>(null);
  const [connected, setConnected] = useState(false);

  // Refs for Jetstream handler (so it always sees current state)
  const activeOrgRef = useRef<WaveOrgContext | null>(null);
  const activeChannelRef = useRef<WaveChannelRecord | null>(null);
  const activeThreadRef = useRef<WaveThreadRecord | null>(null);
  activeOrgRef.current = activeOrg;
  activeChannelRef.current = activeChannel;
  activeThreadRef.current = activeThread;

  // Decrypted cache
  const [decryptedMessages, setDecryptedMessages] = useState<Map<string, MessagePayload | DocEditPayload>>(new Map());

  // --- Not connected ---
  if (!vault || !pds) {
    return (
      <div className="wave-org-picker">
        <div className="wave-org-picker-card">
          <h1>Wave</h1>
          <p className="wave-subtitle">Sign in from the hub first.</p>
          <button className="btn-secondary" style={{ width: "100%", marginTop: 16 }} onClick={() => navigate("/")}>
            Back to Hub
          </button>
        </div>
      </div>
    );
  }

  const myDid = vault.session.did;
  const myHandle = vault.session.handle;

  // --- Discover orgs on mount (skip if hub provided them) ---
  useEffect(() => {
    if (!pds || !vault || sharedOrgs.length > 0) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const discovered = await discoverOrgs(pds, myDid);
        if (!cancelled) setLocalOrgs(discovered);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pds, vault, myDid, sharedOrgs]);

  // --- Org discovery ---
  async function discoverOrgs(client: PdsClient, _did: string): Promise<OrgRecord[]> {
    const foundedOrgs: OrgRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listRecords(ORG_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        const val = rec.value as Record<string, unknown>;
        const rkey = (rec as unknown as { uri: string }).uri.split("/").pop()!;
        foundedOrgs.push({ rkey, org: val as unknown as OrgRecord["org"] });
      }
      cursor = page.cursor;
    } while (cursor);

    // Bookmarks (joined orgs)
    const bookmarks: OrgBookmark[] = [];
    cursor = undefined;
    do {
      const page = await client.listRecords(BOOKMARK_COLLECTION, 100, cursor);
      for (const rec of page.records) {
        bookmarks.push(rec.value as unknown as OrgBookmark);
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
        const orgRec = await founderClient.getRecordFrom(bm.founderDid, ORG_COLLECTION, bm.orgRkey);
        if (!orgRec) continue;
        const val = (orgRec as Record<string, unknown>).value as unknown as OrgRecord["org"];
        joinedOrgs.push({ rkey: bm.orgRkey, org: val });
      } catch (err) {
        console.warn("Failed to fetch joined org:", err);
      }
    }

    return [...foundedOrgs, ...joinedOrgs];
  }

  // --- Select org ---
  const selectOrg = useCallback(
    async (orgRecord: OrgRecord) => {
      if (!pds || !vault) return;
      setLoading(true);
      setError("");
      try {
        const ctx = await buildOrgContext(pds, orgRecord, vault.privateKey, myDid);
        setActiveOrg(ctx);
        const chans = await loadChannels(pds, ctx, myDid);
        setChannels(chans);
        setActiveChannel(null);
        setThreads([]);
        setActiveThread(null);
        setOps([]);
        setDecryptedMessages(new Map());
        startOrgJetstream(ctx);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load org");
      } finally {
        setLoading(false);
      }
    },
    [pds, vault, myDid],
  );

  // --- Select channel ---
  const selectChannel = useCallback(
    async (channel: WaveChannelRecord) => {
      if (!pds || !activeOrg) return;
      setActiveChannel(channel);
      setActiveThread(null);
      setOps([]);
      setLoading(true);
      try {
        const channelUri = `at://${activeOrg.founderDid}/${CHANNEL_COLLECTION}/${channel.rkey}`;
        const loaded = await loadThreadsForChannel(pds, activeOrg, channelUri, myDid);
        setThreads(loaded);
      } finally {
        setLoading(false);
      }
    },
    [pds, activeOrg, myDid],
  );

  // --- Select thread ---
  const selectThread = useCallback(
    async (thread: WaveThreadRecord) => {
      if (!pds || !activeOrg) return;
      setActiveThread(thread);
      setSidebarOpen(false);
      setLoading(true);
      try {
        const threadUri = `at://${thread.authorDid}/${THREAD_COLLECTION}/${thread.rkey}`;
        const loaded = await loadOpsForThread(pds, activeOrg, threadUri, myDid);
        setOps(loaded);
      } finally {
        setLoading(false);
      }
    },
    [pds, activeOrg, myDid],
  );

  // --- Create channel ---
  const handleCreateChannel = useCallback(
    async (name: string, tierName?: string) => {
      if (!pds || !activeOrg) return;
      if (activeOrg.founderDid !== myDid) {
        setError("Only the org founder can create channels");
        return;
      }
      const accessibleTiers = activeOrg.org.org.tiers
        .filter((t) => t.level <= activeOrg.myTierLevel)
        .sort((a, b) => a.level - b.level);
      const resolvedTier = tierName ?? accessibleTiers[0]?.name ?? activeOrg.myTierName;
      await createChannelRecord(pds, activeOrg, name, resolvedTier);
      const chans = await loadChannels(pds, activeOrg, myDid);
      setChannels(chans);
    },
    [pds, activeOrg, myDid],
  );

  // --- Create thread ---
  const handleCreateThread = useCallback(
    async (title?: string) => {
      if (!pds || !activeOrg || !activeChannel) return;
      const t = await createThreadRecord(pds, activeOrg, activeChannel.rkey, "chat", title, myDid, myHandle);
      setThreads((prev) => [...prev, t]);
      selectThread(t);
    },
    [pds, activeOrg, activeChannel, myDid, myHandle, selectThread],
  );

  // --- Create doc ---
  const handleCreateDoc = useCallback(
    async (title: string) => {
      if (!pds || !activeOrg || !activeChannel) return;
      const t = await createThreadRecord(pds, activeOrg, activeChannel.rkey, "doc", title, myDid, myHandle);
      setThreads((prev) => [...prev, t]);
      selectThread(t);
    },
    [pds, activeOrg, activeChannel, myDid, myHandle, selectThread],
  );

  // --- Delete channel ---
  const handleDeleteChannel = useCallback(
    async (ch: WaveChannelRecord) => {
      if (!pds || activeOrg?.founderDid !== myDid) return;
      if (!confirm(`Delete channel #${ch.channel.name}?`)) return;
      await pds.deleteRecord(CHANNEL_COLLECTION, ch.rkey);
      setChannels((prev) => prev.filter((c) => c.rkey !== ch.rkey));
      if (activeChannel?.rkey === ch.rkey) {
        setActiveChannel(null);
        setThreads([]);
        setActiveThread(null);
        setOps([]);
      }
    },
    [pds, activeOrg, myDid, activeChannel],
  );

  // --- Delete thread ---
  const handleDeleteThread = useCallback(
    async (th: WaveThreadRecord) => {
      if (!pds || th.authorDid !== myDid) return;
      if (!confirm(`Delete thread "${th.thread.title || "Chat"}"?`)) return;
      await pds.deleteRecord(THREAD_COLLECTION, th.rkey);
      setThreads((prev) => prev.filter((t) => !(t.rkey === th.rkey && t.authorDid === th.authorDid)));
      if (activeThread?.rkey === th.rkey && activeThread?.authorDid === th.authorDid) {
        setActiveThread(null);
        setOps([]);
      }
    },
    [pds, myDid, activeThread],
  );

  // --- Invite member ---
  const handleInviteMember = useCallback(
    async (handleOrDid: string, tierName: string) => {
      if (!pds || !activeOrg || !vault) return;
      setLoading(true);
      try {
        const memberDid = handleOrDid.startsWith("did:") ? handleOrDid : await resolveHandle(handleOrDid);
        const memberHandle = handleOrDid.startsWith("did:") ? undefined : handleOrDid.replace(/^@/, "");
        await inviteMemberToOrg(pds, activeOrg, memberDid, memberHandle, tierName, myDid, vault.privateKey, vault.publicKey);
        // Refresh context
        const ctx = await buildOrgContext(pds, activeOrg.org, vault.privateKey, myDid);
        setActiveOrg(ctx);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invite failed");
      } finally {
        setLoading(false);
      }
    },
    [pds, activeOrg, vault, myDid],
  );

  // --- Remove member ---
  const handleRemoveMember = useCallback(
    async (membershipRkey: string) => {
      if (!pds || !activeOrg || !vault) return;
      const m = activeOrg.memberships.find((m) => m.rkey === membershipRkey);
      if (!m) return;
      if (m.membership.memberDid === myDid) {
        setError("Cannot remove yourself");
        return;
      }
      if (!confirm(`Remove @${m.membership.memberHandle || m.membership.memberDid}?`)) return;
      await pds.deleteRecord(MEMBERSHIP_COLLECTION, membershipRkey);
      const ctx = await buildOrgContext(pds, activeOrg.org, vault.privateKey, myDid);
      setActiveOrg(ctx);
    },
    [pds, activeOrg, vault, myDid],
  );

  // --- Send message ---
  const handleSendMessage = useCallback(async () => {
    if (!pds || !activeOrg || !activeThread || !activeChannel || !messageText.trim()) return;
    setSending(true);
    try {
      const opRec = await sendMessageOp(
        pds,
        activeOrg,
        activeThread.authorDid,
        activeThread.rkey,
        activeChannel.channel.tierName,
        messageText.trim(),
        myDid,
        myHandle,
      );
      setOps((prev) => [...prev, opRec]);
      setMessageText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, [pds, activeOrg, activeThread, activeChannel, messageText, myDid, myHandle]);

  // --- Send doc edit ---
  const handleSendDocEdit = useCallback(
    async (text: string) => {
      if (!pds || !activeOrg || !activeThread || !activeChannel) return;
      setSending(true);
      try {
        const lastOp = ops.length > 0 ? ops[ops.length - 1] : null;
        const baseOpUri = lastOp ? `at://${lastOp.authorDid}/${OP_COLLECTION}/${lastOp.rkey}` : undefined;
        const opRec = await sendDocEditOp(
          pds,
          activeOrg,
          activeThread.authorDid,
          activeThread.rkey,
          activeChannel.channel.tierName,
          text,
          baseOpUri,
          myDid,
          myHandle,
        );
        setOps((prev) => [...prev, opRec]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSending(false);
      }
    },
    [pds, activeOrg, activeThread, activeChannel, ops, myDid, myHandle],
  );

  // --- Create org ---
  const handleCreateOrg = useCallback(
    async (name: string, tierNames: string[]) => {
      if (!pds || !vault) return;
      setLoading(true);
      try {
        await createOrgRecord(pds, name, tierNames, myDid, myHandle, vault.privateKey, vault.publicKey);
        const discovered = await discoverOrgs(pds, myDid);
        setLocalOrgs(discovered);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create org");
      } finally {
        setLoading(false);
      }
    },
    [pds, vault, myDid, myHandle],
  );

  // --- Jetstream (org-level: watches ops, threads, and channels) ---
  const startOrgJetstream = useCallback(
    (ctx: WaveOrgContext) => {
      jetstreamRef.current?.close();
      const memberDids = ctx.memberships.map((m) => m.membership.memberDid);

      const client = new JetstreamClient({
        wantedDids: memberDids,
        wantedCollections: [OP_COLLECTION, THREAD_COLLECTION, CHANNEL_COLLECTION],
        onEvent: (event: JetstreamEvent) => {
          if (event.kind !== "commit" || !event.commit) return;
          const { operation, collection, rkey, record } = event.commit;
          if (operation !== "create" || !record) return;
          if (event.did === myDid) return; // skip own records (already added optimistically)

          const handle = ctx.memberships.find(
            (m) => m.membership.memberDid === event.did,
          )?.membership.memberHandle;

          if (collection === OP_COLLECTION) {
            const op = record as unknown as import("./types").WaveOp;
            const curThread = activeThreadRef.current;
            if (curThread) {
              const threadUri = `at://${curThread.authorDid}/${THREAD_COLLECTION}/${curThread.rkey}`;
              if (op.threadUri === threadUri) {
                setOps((prev) => [...prev, { rkey, op, authorDid: event.did, authorHandle: handle }]);
              }
            }
          } else if (collection === THREAD_COLLECTION) {
            const thread = record as unknown as import("./types").WaveThread;
            const curChannel = activeChannelRef.current;
            if (curChannel) {
              const channelUri = `at://${ctx.founderDid}/${CHANNEL_COLLECTION}/${curChannel.rkey}`;
              if (thread.channelUri === channelUri) {
                setThreads((prev) => {
                  // Dedupe
                  if (prev.some((t) => t.rkey === rkey && t.authorDid === event.did)) return prev;
                  return [...prev, { rkey, thread, authorDid: event.did, authorHandle: handle }];
                });
              }
            }
          } else if (collection === CHANNEL_COLLECTION) {
            const channel = record as unknown as import("./types").WaveChannel;
            if (channel.orgRkey === ctx.org.rkey) {
              // Only add if the user has access to this tier
              const tierDef = ctx.org.org.tiers.find((t) => t.name === channel.tierName);
              if (tierDef && tierDef.level <= ctx.myTierLevel) {
                setChannels((prev) => {
                  if (prev.some((c) => c.rkey === rkey)) return prev;
                  return [...prev, { rkey, channel }];
                });
              }
            }
          }
        },
        onConnect: () => setConnected(true),
        onDisconnect: () => setConnected(false),
      });

      client.connect();
      jetstreamRef.current = client;
    },
    [myDid],
  );

  // Cleanup jetstream on unmount
  useEffect(() => {
    return () => {
      jetstreamRef.current?.close();
    };
  }, []);

  // --- Decrypt ops ---
  useEffect(() => {
    if (!activeOrg || ops.length === 0) return;
    let cancelled = false;

    (async () => {
      const newDecrypted = new Map(decryptedMessages);
      let changed = false;
      for (const opRec of ops) {
        const key = `${opRec.authorDid}:${opRec.rkey}`;
        if (newDecrypted.has(key)) continue;
        const payload = await decryptOp(opRec.op, activeOrg);
        if (cancelled) return;
        if (payload) {
          newDecrypted.set(key, payload);
          changed = true;
        }
      }
      if (changed) setDecryptedMessages(newDecrypted);
    })();

    return () => {
      cancelled = true;
    };
  }, [ops, activeOrg]);

  // --- Back to orgs ---
  const backToOrgs = useCallback(() => {
    setActiveOrg(null);
    setChannels([]);
    setActiveChannel(null);
    setThreads([]);
    setActiveThread(null);
    setOps([]);
    setDecryptedMessages(new Map());
    jetstreamRef.current?.close();
  }, []);

  // --- Org picker ---
  if (!activeOrg) {
    return (
      <OrgPicker
        orgs={orgs}
        myDid={myDid}
        loading={loading}
        onSelectOrg={selectOrg}
        onCreateOrg={handleCreateOrg}
        onBack={() => navigate("/")}
      />
    );
  }

  // --- Main chat interface ---
  return (
    <div className="wave-layout">
      <Sidebar
        ctx={activeOrg}
        myDid={myDid}
        myHandle={myHandle}
        channels={channels}
        activeChannel={activeChannel}
        threads={threads}
        activeThread={activeThread}
        connected={connected}
        sidebarOpen={sidebarOpen}
        onSelectChannel={selectChannel}
        onSelectThread={selectThread}
        onCreateChannel={handleCreateChannel}
        onCreateThread={handleCreateThread}
        onCreateDoc={handleCreateDoc}
        onDeleteChannel={handleDeleteChannel}
        onDeleteThread={handleDeleteThread}
        onInviteMember={handleInviteMember}
        onRemoveMember={handleRemoveMember}
        onBackToOrgs={backToOrgs}
        onCloseSidebar={() => setSidebarOpen(false)}
      />

      <div className="wave-main-area">
        <div className="wave-mobile-header">
          <button className="wave-btn-hamburger" onClick={() => setSidebarOpen(true)}>
            &#9776;
          </button>
          <span className="wave-mobile-title">
            {activeChannel ? `# ${activeChannel.channel.name}` : activeOrg.org.org.name}
            {activeThread?.thread.title ? ` / ${activeThread.thread.title}` : ""}
          </span>
          <span className={`wave-status-dot ${connected ? "connected" : ""}`} />
        </div>

        {error && (
          <div className="wave-error-bar">
            <pre className="wave-error-text">{error}</pre>
            <button onClick={() => setError("")}>&times;</button>
          </div>
        )}

        {!activeThread ? (
          <div className="wave-empty-state">
            {!activeChannel ? "Select a channel to get started" : "Select or create a thread"}
          </div>
        ) : activeThread.thread.threadType === "doc" ? (
          <DocView
            thread={activeThread}
            ops={ops}
            decryptedMessages={decryptedMessages}
            connected={connected}
            loading={loading}
            sending={sending}
            messageText={messageText}
            myDid={myDid}
            onMessageTextChange={setMessageText}
            onSendMessage={handleSendMessage}
            onSendDocEdit={handleSendDocEdit}
          />
        ) : (
          <ChatView
            ctx={activeOrg}
            channel={activeChannel!}
            thread={activeThread}
            ops={ops}
            decryptedMessages={decryptedMessages}
            connected={connected}
            loading={loading}
            messageText={messageText}
            sending={sending}
            myDid={myDid}
            onMessageTextChange={setMessageText}
            onSendMessage={handleSendMessage}
          />
        )}
      </div>
    </div>
  );
}
