/**
 * Wave sidebar — channels, threads, members, and connection status.
 */

import type { WaveOrgContext, WaveChannelRecord, WaveThreadRecord } from "../types";

interface Props {
  ctx: WaveOrgContext;
  myDid: string;
  myHandle: string;
  channels: WaveChannelRecord[];
  activeChannel: WaveChannelRecord | null;
  threads: WaveThreadRecord[];
  activeThread: WaveThreadRecord | null;
  connected: boolean;
  sidebarOpen: boolean;
  onSelectChannel: (ch: WaveChannelRecord) => void;
  onSelectThread: (th: WaveThreadRecord) => void;
  onCreateChannel: (name: string, tier?: string) => void;
  onCreateThread: (title?: string) => void;
  onCreateDoc: (title: string) => void;
  onDeleteChannel: (ch: WaveChannelRecord) => void;
  onDeleteThread: (th: WaveThreadRecord) => void;
  onInviteMember: (handle: string, tier: string) => void;
  onRemoveMember: (rkey: string) => void;
  onBackToOrgs: () => void;
  onCloseSidebar: () => void;
}

export function Sidebar({
  ctx,
  myDid,
  myHandle,
  channels,
  activeChannel,
  threads,
  activeThread,
  connected,
  sidebarOpen,
  onSelectChannel,
  onSelectThread,
  onCreateChannel,
  onCreateThread,
  onCreateDoc,
  onDeleteChannel,
  onDeleteThread,
  onInviteMember,
  onRemoveMember,
  onBackToOrgs,
  onCloseSidebar,
}: Props) {
  const isFounder = ctx.founderDid === myDid;

  return (
    <>
      {sidebarOpen && <div className="wave-sidebar-overlay" onClick={onCloseSidebar} />}
      <div className={`wave-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="wave-sidebar-header">
          <h2>{ctx.org.org.name}</h2>
          <button className="btn-icon" title="Back to orgs" onClick={onBackToOrgs}>
            &larr;
          </button>
        </div>

        {/* Channels */}
        <div className="wave-sidebar-section">
          <div className="wave-section-header">
            <span>Channels</span>
            {isFounder && (
              <button
                className="btn-icon"
                title="New channel"
                onClick={() => {
                  const name = prompt("Channel name:");
                  if (!name) return;
                  const tiers = ctx.org.org.tiers
                    .filter((t) => t.level <= ctx.myTierLevel)
                    .sort((a, b) => a.level - b.level);
                  const tierStr = prompt(`Tier (${tiers.map((t) => t.name).join(", ")}):`, tiers[0]?.name);
                  onCreateChannel(name, tierStr || undefined);
                }}
              >
                +
              </button>
            )}
          </div>
          {channels.map((ch) => (
            <div key={ch.rkey} className="wave-sidebar-row">
              <button
                className={`wave-sidebar-item ${activeChannel?.rkey === ch.rkey ? "active" : ""}`}
                onClick={() => onSelectChannel(ch)}
              >
                # {ch.channel.name}
              </button>
              {isFounder && (
                <button
                  className="wave-btn-delete"
                  title="Delete channel"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChannel(ch);
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          {channels.length === 0 && <p className="wave-empty-hint">No channels yet</p>}
        </div>

        {/* Threads */}
        {activeChannel && (
          <div className="wave-sidebar-section">
            <div className="wave-section-header">
              <span>Threads</span>
              <span>
                <button
                  className="btn-icon"
                  title="New chat thread"
                  onClick={() => {
                    const title = prompt("Thread title (optional):");
                    onCreateThread(title || undefined);
                  }}
                >
                  +
                </button>
                <button
                  className="btn-icon"
                  title="New doc"
                  onClick={() => {
                    const title = prompt("Document title:");
                    if (title) onCreateDoc(title);
                  }}
                >
                  D
                </button>
              </span>
            </div>
            {threads.map((th) => (
              <div key={`${th.authorDid}:${th.rkey}`} className="wave-sidebar-row">
                <button
                  className={`wave-sidebar-item ${activeThread?.rkey === th.rkey && activeThread?.authorDid === th.authorDid ? "active" : ""}`}
                  onClick={() => onSelectThread(th)}
                >
                  {th.thread.threadType === "doc" ? "[doc] " : ""}
                  {th.thread.title || "Chat"}
                </button>
                {th.authorDid === myDid && (
                  <button
                    className="wave-btn-delete"
                    title="Delete thread"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteThread(th);
                    }}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            {threads.length === 0 && <p className="wave-empty-hint">No threads yet</p>}
          </div>
        )}

        {/* Members */}
        <div className="wave-sidebar-section">
          <div className="wave-section-header">
            <span>Members</span>
            {isFounder && (
              <button
                className="btn-icon"
                title="Invite member"
                onClick={() => {
                  const handle = prompt("Handle or DID to invite:");
                  if (!handle) return;
                  const tiers = ctx.org.org.tiers.sort((a, b) => a.level - b.level);
                  const tierStr = prompt(`Tier (${tiers.map((t) => t.name).join(", ")}):`, tiers[0]?.name);
                  if (tierStr) onInviteMember(handle, tierStr);
                }}
              >
                +
              </button>
            )}
          </div>
          {ctx.memberships.map((m) => (
            <div key={m.rkey} className="wave-sidebar-row">
              <span className="wave-sidebar-item wave-member-item">
                @{m.membership.memberHandle || m.membership.memberDid.slice(0, 16) + "..."}
                <span className="wave-tier-badge">{m.membership.tierName}</span>
              </span>
              {isFounder && m.membership.memberDid !== myDid && (
                <button
                  className="wave-btn-delete"
                  title="Remove member"
                  onClick={() => onRemoveMember(m.rkey)}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="wave-sidebar-footer">
          <span className={`wave-status-dot ${connected ? "connected" : ""}`} />
          <span className="wave-handle">@{myHandle}</span>
        </div>
      </div>
    </>
  );
}
