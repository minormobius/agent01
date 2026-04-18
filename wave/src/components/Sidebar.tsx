import { useState } from 'react';
import type { OrgRecord, WaveOrgContext, WaveChannelRecord, WaveThreadRecord, MembershipRecord } from '../types';
import { HandleTypeahead } from './HandleTypeahead';

interface Props {
  session: { did: string; handle: string };
  orgs: OrgRecord[];
  activeOrg: WaveOrgContext | null;
  channels: WaveChannelRecord[];
  activeChannel: WaveChannelRecord | null;
  threads: WaveThreadRecord[];
  activeThread: WaveThreadRecord | null;
  connected: boolean;
  open: boolean;
  viewMode: 'list' | 'graph';
  vaultUnlocked: boolean;
  inPublicMode: boolean;
  onClose: () => void;
  onSelectOrg: (org: OrgRecord) => void;
  onBackToOrgs: () => void;
  onSelectChannel: (ch: WaveChannelRecord) => void;
  onSelectThread: (th: WaveThreadRecord) => void;
  onCreateChannel: (name: string, tierName?: string) => void;
  onDeleteChannel: (ch: WaveChannelRecord) => void;
  onCreateThread: (title?: string, type?: 'chat' | 'doc') => void;
  onDeleteThread: (th: WaveThreadRecord) => void;
  onCreateOrg: (name: string, tierNames: string[]) => void;
  onDeleteOrg: (org: OrgRecord) => void;
  onInviteMember: (handle: string, tierName: string) => void;
  onRemoveMember: (m: MembershipRecord) => void;
  onSetViewMode: (mode: 'list' | 'graph') => void;
  onLogout: () => void;
  onUnlockVault: () => void;
  onSwitchToPublic: () => void;
  onShowTemplates: () => void;
}

export function Sidebar({
  session, orgs, activeOrg, channels, activeChannel,
  threads, activeThread, connected, open, viewMode,
  vaultUnlocked, inPublicMode,
  onClose, onSelectOrg, onBackToOrgs, onSelectChannel, onSelectThread,
  onCreateChannel, onDeleteChannel, onCreateThread, onDeleteThread,
  onCreateOrg, onDeleteOrg, onInviteMember, onRemoveMember,
  onSetViewMode, onLogout, onUnlockVault, onSwitchToPublic, onShowTemplates,
}: Props) {
  const isFounder = activeOrg?.founderDid === session.did;
  const [showInvite, setShowInvite] = useState(false);
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteTier, setInviteTier] = useState('');

  // --- Public mode: personal notes + org navigation ---
  if (inPublicMode) {
    const docThreads = threads.filter(t => t.thread.threadType === 'doc');

    return (
      <div className={`wave-sidebar ${open ? 'open' : ''}`}>
        {open && <div className="wave-sidebar-overlay" onClick={onClose} />}

        <div className="wave-sidebar-header">
          <h1>Wave</h1>
          <div className="wave-sidebar-user">
            <span>@{session.handle}</span>
          </div>
        </div>

        <div className="wave-sidebar-actions">
          <button className="wave-btn-primary" onClick={() => {
            const title = prompt('Page title:');
            if (title) onCreateThread(title, 'doc');
          }}>
            + Page
          </button>
          <button className="wave-btn-sm" onClick={onShowTemplates}>
            Template
          </button>
          <div className="wave-view-toggle">
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => onSetViewMode('list')}>
              List
            </button>
            <button className={viewMode === 'graph' ? 'active' : ''} onClick={() => onSetViewMode('graph')}>
              Graph
            </button>
          </div>
        </div>

        {/* Public notes list */}
        <div className="wave-section-label"><span>Pages</span></div>
        <div className="wave-note-list">
          {docThreads.length === 0 ? (
            <div className="wave-note-empty">No pages yet</div>
          ) : (
            docThreads.map(th => (
              <div key={th.rkey} className="wave-note-item-row">
                <button
                  className={`wave-note-item ${activeThread?.rkey === th.rkey ? 'active' : ''}`}
                  onClick={() => onSelectThread(th)}
                >
                  <span className="wave-note-title">{th.thread.title || 'Untitled'}</span>
                </button>
                <button className="wave-btn-sm wave-btn-danger" onClick={() => onDeleteThread(th)}>x</button>
              </div>
            ))
          )}
        </div>

        {/* Vault / Orgs section */}
        <div className="wave-section-label"><span>Organizations</span></div>
        <div className="wave-note-list">
          {!vaultUnlocked ? (
            <div className="wave-vault-prompt">
              <button className="wave-btn-sm" onClick={onUnlockVault}>
                Unlock vault for encrypted orgs
              </button>
            </div>
          ) : (
            <>
              {orgs.map(o => (
                <div key={o.rkey} className="wave-note-item-row">
                  <button className="wave-note-item" onClick={() => onSelectOrg(o)}>
                    <span className="wave-note-title">{o.org.name}</span>
                    <span className="wave-note-tags">{o.org.tiers.map(t => t.name).join(', ')}</span>
                  </button>
                  {o.org.founderDid === session.did && (
                    <button className="wave-btn-sm wave-btn-danger" onClick={() => onDeleteOrg(o)}>x</button>
                  )}
                </div>
              ))}
              <div className="wave-vault-prompt">
                <button className="wave-btn-sm" onClick={() => {
                  const name = prompt('Organization name:');
                  if (!name) return;
                  const tiersStr = prompt('Tier names (comma-separated):', 'member, admin');
                  if (!tiersStr) return;
                  const tierNames = tiersStr.split(',').map(s => s.trim()).filter(Boolean);
                  if (tierNames.length > 0) onCreateOrg(name, tierNames);
                }}>
                  + New Org
                </button>
              </div>
            </>
          )}
        </div>

        <div className="wave-sidebar-footer">
          <span>@{session.handle}</span>
          <button className="wave-btn-sm" onClick={onLogout}>Log out</button>
        </div>
      </div>
    );
  }

  // --- Org mode: channels, threads, members ---
  const docThreads = threads.filter(t => t.thread.threadType === 'doc');
  const chatThreads = threads.filter(t => t.thread.threadType === 'chat');

  return (
    <div className={`wave-sidebar ${open ? 'open' : ''}`}>
      {open && <div className="wave-sidebar-overlay" onClick={onClose} />}

      <div className="wave-sidebar-header">
        <h1>{activeOrg?.org.org.name || 'Wave'}</h1>
        <div className="wave-sidebar-user">
          <button className="wave-btn-sm" onClick={onSwitchToPublic}>Notes</button>
          <button className="wave-btn-sm" onClick={onBackToOrgs}>Orgs</button>
          <span className={`wave-status ${connected ? 'on' : ''}`} />
        </div>
      </div>

      {!activeOrg ? (
        // Org picker within org mode
        <>
          <div className="wave-section-label"><span>Organizations</span></div>
          <div className="wave-note-list">
            {orgs.map(o => (
              <div key={o.rkey} className="wave-note-item-row">
                <button className="wave-note-item" onClick={() => onSelectOrg(o)}>
                  <span className="wave-note-title">{o.org.name}</span>
                  <span className="wave-note-tags">{o.org.tiers.map(t => t.name).join(', ')}</span>
                </button>
                {o.org.founderDid === session.did && (
                  <button className="wave-btn-sm wave-btn-danger" onClick={() => onDeleteOrg(o)}>x</button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="wave-sidebar-actions">
            {activeChannel && (
              <>
                <button className="wave-btn-primary" onClick={() => {
                  const title = prompt('Document title:');
                  if (title) onCreateThread(title, 'doc');
                }}>
                  + Page
                </button>
                <button className="wave-btn-sm" onClick={onShowTemplates}>
                  Template
                </button>
                <button className="wave-btn-sm" onClick={() => {
                  const title = prompt('Thread title (optional):');
                  onCreateThread(title || undefined, 'chat');
                }}>
                  + Chat
                </button>
              </>
            )}
            <div className="wave-view-toggle">
              <button className={viewMode === 'list' ? 'active' : ''} onClick={() => onSetViewMode('list')}>List</button>
              <button className={viewMode === 'graph' ? 'active' : ''} onClick={() => onSetViewMode('graph')}>Graph</button>
            </div>
          </div>

          {/* Channels */}
          <div className="wave-section-label">
            <span>Channels</span>
            {isFounder && (
              <button className="wave-btn-sm" onClick={() => {
                const name = prompt('Channel name:');
                if (!name) return;
                const tiers = activeOrg.org.org.tiers
                  .filter(t => t.level <= activeOrg.myTierLevel)
                  .sort((a, b) => a.level - b.level);
                const tierStr = prompt(`Tier (${tiers.map(t => t.name).join(', ')}):`, tiers[0]?.name);
                onCreateChannel(name, tierStr || undefined);
              }}>+</button>
            )}
          </div>
          <div className="wave-note-list wave-channel-list">
            {channels.map(ch => (
              <div key={ch.rkey} className="wave-note-item-row">
                <button
                  className={`wave-note-item ${activeChannel?.rkey === ch.rkey ? 'active' : ''}`}
                  onClick={() => onSelectChannel(ch)}
                >
                  <span className="wave-note-title"># {ch.channel.name}</span>
                </button>
                {isFounder && (
                  <button className="wave-btn-sm wave-btn-danger" onClick={() => onDeleteChannel(ch)}>x</button>
                )}
              </div>
            ))}
          </div>

          {/* Doc threads */}
          {activeChannel && docThreads.length > 0 && (
            <>
              <div className="wave-section-label"><span>Pages</span></div>
              <div className="wave-note-list">
                {docThreads.map(th => (
                  <div key={`${th.authorDid}:${th.rkey}`} className="wave-note-item-row">
                    <button
                      className={`wave-note-item ${activeThread?.rkey === th.rkey && activeThread?.authorDid === th.authorDid ? 'active' : ''}`}
                      onClick={() => onSelectThread(th)}
                    >
                      <span className="wave-note-title">{th.thread.title || 'Untitled'}</span>
                    </button>
                    {th.authorDid === session.did && (
                      <button className="wave-btn-sm wave-btn-danger" onClick={() => onDeleteThread(th)}>x</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Chat threads */}
          {activeChannel && chatThreads.length > 0 && (
            <>
              <div className="wave-section-label"><span>Threads</span></div>
              <div className="wave-note-list">
                {chatThreads.map(th => (
                  <div key={`${th.authorDid}:${th.rkey}`} className="wave-note-item-row">
                    <button
                      className={`wave-note-item ${activeThread?.rkey === th.rkey && activeThread?.authorDid === th.authorDid ? 'active' : ''}`}
                      onClick={() => onSelectThread(th)}
                    >
                      <span className="wave-note-title">{th.thread.title || 'Chat'}</span>
                    </button>
                    {th.authorDid === session.did && (
                      <button className="wave-btn-sm wave-btn-danger" onClick={() => onDeleteThread(th)}>x</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Members */}
          <div className="wave-section-label">
            <span>Members ({activeOrg.memberships.length})</span>
            {isFounder && (
              <button className="wave-btn-sm" onClick={() => {
                setShowInvite(!showInvite);
                if (!inviteTier && activeOrg.org.org.tiers.length > 0) {
                  setInviteTier(activeOrg.org.org.tiers.sort((a, b) => a.level - b.level)[0].name);
                }
              }}>{showInvite ? '−' : '+'}</button>
            )}
          </div>
          {showInvite && activeOrg && (
            <div className="wave-invite-inline">
              <HandleTypeahead
                value={inviteHandle}
                onChange={setInviteHandle}
                onSelect={(actor) => setInviteHandle(actor.handle)}
                placeholder="Search handle..."
                autoFocus
              />
              <div className="wave-invite-row">
                <select value={inviteTier} onChange={e => setInviteTier(e.target.value)}>
                  {activeOrg.org.org.tiers
                    .sort((a, b) => a.level - b.level)
                    .map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <button className="wave-btn-primary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  disabled={!inviteHandle.trim()}
                  onClick={() => {
                    if (inviteHandle.trim() && inviteTier) {
                      onInviteMember(inviteHandle.trim(), inviteTier);
                      setInviteHandle('');
                      setShowInvite(false);
                    }
                  }}>Invite</button>
              </div>
            </div>
          )}
          <div className="wave-note-list wave-members-list">
            {activeOrg.memberships.map(m => (
              <div key={m.rkey} className="wave-note-item-row">
                <span className="wave-member-item">
                  @{m.membership.memberHandle || m.membership.memberDid.slice(0, 16) + '...'}
                  <span className="wave-tier-badge">{m.membership.tierName}</span>
                </span>
                {isFounder && m.membership.memberDid !== session.did && (
                  <button className="wave-btn-sm wave-btn-danger" onClick={() => onRemoveMember(m)}>x</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="wave-sidebar-footer">
        <span className={`wave-status ${connected ? 'on' : ''}`} />
        <span>@{session.handle}</span>
        <button className="wave-btn-sm" onClick={onLogout}>Log out</button>
      </div>
    </div>
  );
}
