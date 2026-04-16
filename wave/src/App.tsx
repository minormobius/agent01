import { useCallback, useEffect, useRef, useState } from 'react';
import { authInit, authLogin, authLogout } from './lib/auth';
import type { AuthUser } from './lib/auth';
import { PdsClient, resolvePds } from './lib/pds';
import {
  bootstrapVault, discoverOrgs, buildOrgContext, loadChannels,
  loadThreadsForChannel, loadOpsForThread, decryptOp,
  createChannel as ctxCreateChannel, deleteChannel as ctxDeleteChannel,
  createThread as ctxCreateThread, deleteThread as ctxDeleteThread,
  sendMessage as ctxSendMessage, sendDocEdit as ctxSendDocEdit,
  createOrg as ctxCreateOrg, deleteOrg as ctxDeleteOrg,
  inviteMember as ctxInviteMember, removeMember as ctxRemoveMember,
  loadPublicThreads, createPublicThread, loadPublicOps,
  sendPublicDocEdit, sendPublicMessage,
  CHANNEL_COLLECTION, THREAD_COLLECTION, OP_COLLECTION,
} from './lib/context';
import type { IdentityKeys } from './lib/context';
import { buildNoteStubs } from './lib/wiki';
import type { NoteStub } from './lib/wiki';
import type {
  OrgRecord, WaveOrgContext, WaveChannelRecord, WaveThreadRecord,
  WaveOpRecord, MessagePayload, DocEditPayload,
} from './types';
import { JetstreamClient, type JetstreamEvent } from './jetstream';

import { LoginScreen } from './components/LoginScreen';
import { VaultUnlock } from './components/VaultUnlock';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { DocView } from './components/DocView';
import { GraphView } from './components/GraphView';

const PASSPHRASE_KEY = 'wave_vault_passphrase';

export function App() {
  // Auth (phase 1: OAuth)
  const [session, setSession] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [pds, setPds] = useState<PdsClient | null>(null);

  // Vault (phase 2: passphrase)
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [showVaultPrompt, setShowVaultPrompt] = useState(false);
  const [identityKeys, setIdentityKeys] = useState<IdentityKeys | null>(null);

  // Org (available after vault unlock)
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [activeOrg, setActiveOrg] = useState<WaveOrgContext | null>(null);

  // Wave
  const [channels, setChannels] = useState<WaveChannelRecord[]>([]);
  const [activeChannel, setActiveChannel] = useState<WaveChannelRecord | null>(null);
  const [threads, setThreads] = useState<WaveThreadRecord[]>([]);
  const [activeThread, setActiveThread] = useState<WaveThreadRecord | null>(null);
  const [ops, setOps] = useState<WaveOpRecord[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Map<string, MessagePayload | DocEditPayload>>(new Map());

  // Public notes (available immediately after OAuth)
  const [publicThreads, setPublicThreads] = useState<WaveThreadRecord[]>([]);
  const [inPublicMode, setInPublicMode] = useState(true);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [connected, setConnected] = useState(false);
  const [noteStubs, setNoteStubs] = useState<NoteStub[]>([]);

  const jetstreamRef = useRef<JetstreamClient | null>(null);

  // --- Phase 1: Auth init on mount ---
  useEffect(() => {
    (async () => {
      const user = await authInit();
      if (user) {
        setSession(user);
        // Create auth-proxied client for this session
        const client = new PdsClient();
        const userPds = await resolvePds(user.did);
        client.setUserPds(userPds);
        setPds(client);

        // Load public notes immediately
        try {
          const pub = await loadPublicThreads(client, user.did, user.handle);
          setPublicThreads(pub);
        } catch (err) {
          console.warn('Failed to load public notes:', err);
        }

        // Try auto-unlock vault if passphrase is cached
        const passphrase = localStorage.getItem(PASSPHRASE_KEY);
        if (passphrase) {
          try {
            const { identityKeys: keys } = await bootstrapVault(client, user, passphrase);
            setIdentityKeys(keys);
            setVaultUnlocked(true);
            const discovered = await discoverOrgs(client);
            setOrgs(discovered);
          } catch {
            localStorage.removeItem(PASSPHRASE_KEY);
          }
        }
      }
      setAuthChecked(true);
    })();
  }, []);

  // --- OAuth login (no passphrase) ---
  const handleLogin = useCallback(async (handle: string) => {
    await authLogin(handle);
  }, []);

  // --- Vault unlock ---
  const handleVaultUnlock = useCallback(async (passphrase: string) => {
    if (!session || !pds) return;
    localStorage.setItem(PASSPHRASE_KEY, passphrase);
    const { identityKeys: keys } = await bootstrapVault(pds, session, passphrase);
    setIdentityKeys(keys);
    setVaultUnlocked(true);
    setShowVaultPrompt(false);
    setLoading(true);
    try {
      const discovered = await discoverOrgs(pds);
      setOrgs(discovered);
    } finally {
      setLoading(false);
    }
  }, [session, pds]);

  // --- Logout ---
  const handleLogout = useCallback(() => {
    jetstreamRef.current?.close();
    authLogout();
    localStorage.removeItem(PASSPHRASE_KEY);
    setSession(null);
    setPds(null);
    setIdentityKeys(null);
    setVaultUnlocked(false);
    setOrgs([]);
    setActiveOrg(null);
    setChannels([]);
    setActiveChannel(null);
    setThreads([]);
    setActiveThread(null);
    setOps([]);
    setDecryptedMessages(new Map());
    setPublicThreads([]);
    setInPublicMode(true);
  }, []);

  // --- Public notes ---
  const handleCreatePublicThread = useCallback(async (title: string) => {
    if (!pds || !session) return;
    const t = await createPublicThread(pds, session.did, session.handle, title);
    setPublicThreads(prev => [...prev, t]);
    selectThread(t);
  }, [pds, session]);

  const handleDeletePublicThread = useCallback(async (th: WaveThreadRecord) => {
    if (!pds || !session || th.authorDid !== session.did) return;
    if (!confirm(`Delete "${th.thread.title || 'Untitled'}"?`)) return;
    await pds.deleteRecord(THREAD_COLLECTION, th.rkey);
    setPublicThreads(prev => prev.filter(t => t.rkey !== th.rkey));
    if (activeThread?.rkey === th.rkey) { setActiveThread(null); setOps([]); }
  }, [pds, session, activeThread]);

  // --- Select org ---
  const selectOrg = useCallback(async (orgRecord: OrgRecord) => {
    if (!pds || !session || !identityKeys) return;
    setLoading(true);
    setError('');
    setInPublicMode(false);
    try {
      const ctx = await buildOrgContext(pds, orgRecord, identityKeys.privateKey, session.did);
      setActiveOrg(ctx);
      const chans = await loadChannels(pds, ctx);
      setChannels(chans);
      setActiveChannel(null);
      setThreads([]);
      setActiveThread(null);
      setOps([]);
      setDecryptedMessages(new Map());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load org');
    } finally {
      setLoading(false);
    }
  }, [pds, session, identityKeys]);

  // --- Select channel ---
  const selectChannel = useCallback(async (channel: WaveChannelRecord) => {
    if (!pds || !activeOrg) return;
    setActiveChannel(channel);
    setActiveThread(null);
    setOps([]);
    setDecryptedMessages(new Map());
    setLoading(true);
    try {
      const channelUri = `at://${activeOrg.founderDid}/${CHANNEL_COLLECTION}/${channel.rkey}`;
      const loaded = await loadThreadsForChannel(pds, activeOrg, channelUri);
      setThreads(loaded);
    } finally {
      setLoading(false);
    }
  }, [pds, activeOrg]);

  // --- Select thread (public or encrypted) ---
  const selectThread = useCallback(async (thread: WaveThreadRecord) => {
    if (!pds || !session) return;
    setActiveThread(thread);
    setSidebarOpen(false);
    setLoading(true);
    try {
      const threadUri = `at://${thread.authorDid}/${THREAD_COLLECTION}/${thread.rkey}`;

      if (thread.thread.channelUri === 'public') {
        // Public thread — load ops from own PDS only
        const loaded = await loadPublicOps(pds, session.did, session.handle, threadUri);
        setOps(loaded);
      } else if (activeOrg) {
        // Encrypted thread — load ops from all members
        const loaded = await loadOpsForThread(pds, activeOrg, threadUri);
        setOps(loaded);
        startJetstream(activeOrg, threadUri);
      }
    } finally {
      setLoading(false);
    }
  }, [pds, session, activeOrg]);

  // --- Jetstream ---
  const startJetstream = useCallback((ctx: WaveOrgContext, threadUri: string) => {
    jetstreamRef.current?.close();
    const memberDids = ctx.memberships.map(m => m.membership.memberDid);
    const client = new JetstreamClient({
      wantedDids: memberDids,
      wantedCollections: [OP_COLLECTION, THREAD_COLLECTION, CHANNEL_COLLECTION],
      onEvent: (event: JetstreamEvent) => {
        if (event.kind !== 'commit' || !event.commit) return;
        const { operation, collection, rkey, record } = event.commit;
        if (operation === 'create' && collection === OP_COLLECTION && record) {
          const op = record as any;
          if (op.threadUri === threadUri && event.did !== session?.did) {
            const handle = ctx.memberships.find(m => m.membership.memberDid === event.did)?.membership.memberHandle;
            setOps(prev => [...prev, { rkey, op, authorDid: event.did, authorHandle: handle }]);
          }
        }
      },
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    });
    client.connect();
    jetstreamRef.current = client;
  }, [session]);

  useEffect(() => () => { jetstreamRef.current?.close(); }, []);

  // --- Decrypt ops (handles both public and encrypted) ---
  useEffect(() => {
    if (ops.length === 0) return;
    let cancelled = false;
    (async () => {
      const next = new Map(decryptedMessages);
      let changed = false;
      for (const opRec of ops) {
        const key = `${opRec.authorDid}:${opRec.rkey}`;
        if (next.has(key)) continue;
        const payload = await decryptOp(opRec.op, activeOrg);
        if (cancelled) return;
        if (payload) { next.set(key, payload); changed = true; }
      }
      if (changed) setDecryptedMessages(next);
    })();
    return () => { cancelled = true; };
  }, [ops, activeOrg]);

  // --- Build wiki stubs ---
  useEffect(() => {
    const allDocThreads = [
      ...publicThreads.filter(t => t.thread.threadType === 'doc'),
      ...threads.filter(t => t.thread.threadType === 'doc'),
    ];
    if (!allDocThreads.length) { setNoteStubs([]); return; }
    const latestTexts = new Map<string, string>();
    for (const opRec of ops) {
      if (opRec.op.opType !== 'doc_edit') continue;
      const key = `${opRec.authorDid}:${opRec.rkey}`;
      const payload = decryptedMessages.get(key) as DocEditPayload | undefined;
      if (payload?.text !== undefined) {
        const parts = opRec.op.threadUri.split('/');
        latestTexts.set(parts[parts.length - 1], payload.text);
      }
    }
    setNoteStubs(buildNoteStubs(allDocThreads, latestTexts));
  }, [publicThreads, threads, ops, decryptedMessages]);

  // --- Action handlers (encrypted org content) ---
  const handleCreateChannel = useCallback(async (name: string, tierName?: string) => {
    if (!pds || !activeOrg || activeOrg.founderDid !== session?.did) return;
    try {
      await ctxCreateChannel(pds, activeOrg, name, tierName);
      setChannels(await loadChannels(pds, activeOrg));
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  }, [pds, activeOrg, session]);

  const handleDeleteChannel = useCallback(async (ch: WaveChannelRecord) => {
    if (!pds || !session || activeOrg?.founderDid !== session.did) return;
    if (!confirm(`Delete channel #${ch.channel.name}?`)) return;
    await ctxDeleteChannel(pds, ch.rkey);
    setChannels(prev => prev.filter(c => c.rkey !== ch.rkey));
    if (activeChannel?.rkey === ch.rkey) {
      setActiveChannel(null); setThreads([]); setActiveThread(null); setOps([]);
    }
  }, [pds, session, activeOrg, activeChannel]);

  const handleCreateThread = useCallback(async (title?: string, type: 'chat' | 'doc' = 'chat') => {
    if (!pds || !session) return;
    // Public mode: create public doc
    if (inPublicMode) {
      if (type === 'doc' && title) await handleCreatePublicThread(title);
      return;
    }
    if (!activeOrg || !activeChannel) return;
    const t = await ctxCreateThread(pds, activeOrg, activeChannel.rkey, session.did, session.handle, title, type);
    setThreads(prev => [...prev, t]);
    selectThread(t);
  }, [pds, activeOrg, activeChannel, session, selectThread, inPublicMode, handleCreatePublicThread]);

  const handleDeleteThread = useCallback(async (th: WaveThreadRecord) => {
    if (!pds || !session || th.authorDid !== session.did) return;
    if (th.thread.channelUri === 'public') {
      await handleDeletePublicThread(th);
      return;
    }
    if (!confirm(`Delete "${th.thread.title || 'Chat'}"?`)) return;
    await ctxDeleteThread(pds, th.rkey);
    setThreads(prev => prev.filter(t => !(t.rkey === th.rkey && t.authorDid === th.authorDid)));
    if (activeThread?.rkey === th.rkey && activeThread?.authorDid === th.authorDid) {
      setActiveThread(null); setOps([]);
    }
  }, [pds, session, activeThread, handleDeletePublicThread]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!pds || !activeThread || !session) return;
    setSending(true);
    try {
      if (activeThread.thread.channelUri === 'public') {
        const opRec = await sendPublicMessage(pds, activeThread, text, session.did, session.handle);
        setOps(prev => [...prev, opRec]);
      } else if (activeOrg && activeChannel) {
        const opRec = await ctxSendMessage(pds, activeOrg, activeThread, activeChannel.channel.tierName, text, session.did, session.handle);
        setOps(prev => [...prev, opRec]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Send failed'); }
    finally { setSending(false); }
  }, [pds, activeOrg, activeThread, activeChannel, session]);

  const handleSaveDoc = useCallback(async (text: string) => {
    if (!pds || !activeThread || !session) return;
    setSending(true);
    try {
      const lastOp = ops.filter(o => o.op.opType === 'doc_edit').at(-1);
      const baseOpUri = lastOp ? `at://${lastOp.authorDid}/${OP_COLLECTION}/${lastOp.rkey}` : undefined;

      if (activeThread.thread.channelUri === 'public') {
        const opRec = await sendPublicDocEdit(pds, activeThread, text, baseOpUri, session.did, session.handle);
        setOps(prev => [...prev, opRec]);
      } else if (activeOrg && activeChannel) {
        const opRec = await ctxSendDocEdit(pds, activeOrg, activeThread, activeChannel.channel.tierName, text, baseOpUri, session.did, session.handle);
        setOps(prev => [...prev, opRec]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSending(false); }
  }, [pds, activeOrg, activeThread, activeChannel, ops, session]);

  const handleCreateOrg = useCallback(async (name: string, tierNames: string[]) => {
    if (!pds || !session || !identityKeys) return;
    setLoading(true);
    try {
      await ctxCreateOrg(pds, identityKeys, session.did, session.handle, name, tierNames);
      setOrgs(await discoverOrgs(pds));
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, [pds, session, identityKeys]);

  const handleDeleteOrg = useCallback(async (org: OrgRecord) => {
    if (!pds || !session || org.org.founderDid !== session.did) return;
    if (!confirm(`Delete org "${org.org.name}"?`)) return;
    setLoading(true);
    try {
      await ctxDeleteOrg(pds, org);
      setOrgs(await discoverOrgs(pds));
      setActiveOrg(null); setChannels([]); setActiveChannel(null);
      setThreads([]); setActiveThread(null); setOps([]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, [pds, session]);

  const handleInviteMember = useCallback(async (handle: string, tierName: string) => {
    if (!pds || !activeOrg || !identityKeys || !session) return;
    setLoading(true);
    try {
      await ctxInviteMember(pds, activeOrg, identityKeys, session.did, handle, tierName);
      const ctx = await buildOrgContext(pds, activeOrg.org, identityKeys.privateKey, session.did);
      setActiveOrg(ctx);
    } catch (err) { setError(err instanceof Error ? err.message : 'Invite failed'); }
    finally { setLoading(false); }
  }, [pds, activeOrg, identityKeys, session]);

  const handleRemoveMember = useCallback(async (m: any) => {
    if (!pds || !activeOrg || !identityKeys || !session) return;
    if (activeOrg.founderDid !== session.did || m.membership.memberDid === session.did) return;
    if (!confirm(`Remove @${m.membership.memberHandle || m.membership.memberDid}?`)) return;
    await ctxRemoveMember(pds, m.rkey);
    const ctx = await buildOrgContext(pds, activeOrg.org, identityKeys.privateKey, session.did);
    setActiveOrg(ctx);
  }, [pds, activeOrg, identityKeys, session]);

  const handleBackToOrgs = useCallback(() => {
    jetstreamRef.current?.close();
    setActiveOrg(null); setChannels([]); setActiveChannel(null);
    setThreads([]); setActiveThread(null); setOps([]);
    setDecryptedMessages(new Map()); setNoteStubs([]);
    setInPublicMode(true);
  }, []);

  const navigateToThread = useCallback((rkey: string) => {
    const allThreads = [...publicThreads, ...threads];
    const thread = allThreads.find(t => t.rkey === rkey);
    if (thread) selectThread(thread);
  }, [publicThreads, threads, selectThread]);

  // --- Render ---
  if (!authChecked) return <div className="wave-loading">Loading...</div>;

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!pds) return <div className="wave-loading">Connecting...</div>;
  if (loading && !activeOrg && !inPublicMode) return <div className="wave-loading">Loading...</div>;

  // Combine public + org threads for display
  const visibleThreads = inPublicMode ? publicThreads : threads;
  const docThreads = visibleThreads.filter(t => t.thread.threadType === 'doc');

  return (
    <div className="wave-app">
      {sidebarOpen && <div className="wave-overlay" onClick={() => setSidebarOpen(false)} />}
      {showVaultPrompt && (
        <VaultUnlock
          onUnlock={handleVaultUnlock}
          onCancel={() => setShowVaultPrompt(false)}
        />
      )}

      <Sidebar
        session={session}
        orgs={orgs}
        activeOrg={inPublicMode ? null : activeOrg}
        channels={channels}
        activeChannel={activeChannel}
        threads={visibleThreads}
        activeThread={activeThread}
        connected={connected}
        open={sidebarOpen}
        viewMode={viewMode}
        vaultUnlocked={vaultUnlocked}
        inPublicMode={inPublicMode}
        onClose={() => setSidebarOpen(false)}
        onSelectOrg={selectOrg}
        onBackToOrgs={handleBackToOrgs}
        onSelectChannel={selectChannel}
        onSelectThread={selectThread}
        onCreateChannel={handleCreateChannel}
        onDeleteChannel={handleDeleteChannel}
        onCreateThread={handleCreateThread}
        onDeleteThread={handleDeleteThread}
        onCreateOrg={handleCreateOrg}
        onDeleteOrg={handleDeleteOrg}
        onInviteMember={handleInviteMember}
        onRemoveMember={handleRemoveMember}
        onSetViewMode={setViewMode}
        onLogout={handleLogout}
        onUnlockVault={() => setShowVaultPrompt(true)}
        onSwitchToPublic={() => { handleBackToOrgs(); setInPublicMode(true); }}
      />

      <div className="wave-main">
        <div className="wave-mobile-header">
          <button className="wave-btn-hamburger" onClick={() => setSidebarOpen(true)}>Menu</button>
          <span>
            {inPublicMode ? 'Notes' :
              activeChannel ? `# ${activeChannel.channel.name}` :
              activeOrg?.org.org.name || 'Wave'}
          </span>
        </div>

        {error && (
          <div className="wave-error-bar">
            <pre>{error}</pre>
            <button onClick={() => setError('')}>x</button>
          </div>
        )}

        {viewMode === 'graph' && (inPublicMode || activeChannel) ? (
          <GraphView
            stubs={noteStubs}
            activeRkey={activeThread?.rkey || null}
            onSelect={navigateToThread}
          />
        ) : !activeThread ? (
          <div className="wave-empty">
            {inPublicMode
              ? (publicThreads.length === 0
                ? 'Create your first page to get started'
                : 'Select a page from the sidebar')
              : !activeOrg ? 'Select an organization'
              : !activeChannel ? 'Select a channel'
              : 'Select or create a thread'}
          </div>
        ) : activeThread.thread.threadType === 'doc' ? (
          <DocView
            thread={activeThread}
            ops={ops}
            decryptedMessages={decryptedMessages}
            connected={connected}
            sending={sending}
            allStubs={noteStubs}
            allDocThreads={docThreads}
            onSaveDoc={handleSaveDoc}
            onSendComment={handleSendMessage}
            onNavigate={navigateToThread}
          />
        ) : (
          <ChatView
            thread={activeThread}
            ops={ops}
            decryptedMessages={decryptedMessages as Map<string, MessagePayload>}
            connected={connected}
            memberCount={activeOrg?.memberships.length || 1}
            myDid={session.did}
            sending={sending}
            onSendMessage={handleSendMessage}
          />
        )}
      </div>
    </div>
  );
}
