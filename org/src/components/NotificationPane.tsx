import { useState } from "react";
import type { PdsClient } from "../pds";
import type { NotificationRecord, NotificationPreferences, NotificationType } from "../types";
import { NOTIFICATION_TYPE_LABELS } from "../types";
import { checkInvitesFromUser } from "../crm/context";
import { HandleTypeahead } from "./HandleTypeahead";

interface Props {
  pds: PdsClient;
  myDid: string;
  notifications: NotificationRecord[];
  existingOrgRkeys: Set<string>;
  onAccept: (notif: NotificationRecord) => void;
  onDismiss: (notif: NotificationRecord) => void;
  onNewNotifications: (notifs: NotificationRecord[]) => void;
  onClose: () => void;
  notifPrefs: NotificationPreferences | null;
  onSaveNotifPrefs: (prefs: NotificationPreferences) => void;
}

/** Render a human-readable notification summary */
function renderNotifContent(notif: NotificationRecord) {
  const n = notif.notification;
  switch (n.type) {
    case "org-invite":
      return (
        <div className="notif-content">
          <div className="notif-title">Org Invite</div>
          <div className="notif-detail">
            Invited to <strong>{n.orgName}</strong>
            {n.invitedByHandle && <> by @{n.invitedByHandle}</>}
          </div>
          <div className="notif-meta">
            Tier: {n.tierName} &middot; {new Date(n.createdAt).toLocaleDateString()}
          </div>
        </div>
      );
    case "wave-message":
      return (
        <div className="notif-content">
          <div className="notif-title">New Message</div>
          <div className="notif-detail">
            {n.senderHandle && <>@{n.senderHandle} in </>}
            <strong>#{n.channelName}</strong>
            {n.threadTitle && <> / {n.threadTitle}</>}
          </div>
          {n.preview && <div className="notif-preview">{n.preview}</div>}
          <div className="notif-meta">{new Date(n.createdAt).toLocaleTimeString()}</div>
        </div>
      );
    case "wave-doc-edit":
      return (
        <div className="notif-content">
          <div className="notif-title">Doc Edited</div>
          <div className="notif-detail">
            {n.senderHandle && <>@{n.senderHandle} edited </>}
            <strong>{n.docTitle || "Untitled"}</strong> in #{n.channelName}
          </div>
          <div className="notif-meta">{new Date(n.createdAt).toLocaleTimeString()}</div>
        </div>
      );
    case "wave-thread":
      return (
        <div className="notif-content">
          <div className="notif-title">New {n.threadType === "doc" ? "Doc" : "Thread"}</div>
          <div className="notif-detail">
            {n.senderHandle && <>@{n.senderHandle} created </>}
            <strong>{n.threadTitle || (n.threadType === "doc" ? "Untitled Doc" : "Chat")}</strong> in #{n.channelName}
          </div>
          <div className="notif-meta">{new Date(n.createdAt).toLocaleTimeString()}</div>
        </div>
      );
    case "wave-channel":
      return (
        <div className="notif-content">
          <div className="notif-title">New Channel</div>
          <div className="notif-detail">
            {n.senderHandle && <>@{n.senderHandle} created </>}
            <strong>#{n.channelName}</strong>
          </div>
          <div className="notif-meta">{new Date(n.createdAt).toLocaleTimeString()}</div>
        </div>
      );
    case "deal-created":
    case "deal-updated":
      return (
        <div className="notif-content">
          <div className="notif-title">{n.type === "deal-created" ? "New Deal" : "Deal Updated"}</div>
          <div className="notif-detail">
            {n.senderHandle && <>@{n.senderHandle}: </>}
            <strong>{n.dealTitle}</strong>
            {n.stage && <> ({n.stage})</>}
          </div>
          <div className="notif-meta">
            {n.orgName} &middot; {new Date(n.createdAt).toLocaleTimeString()}
          </div>
        </div>
      );
    case "proposal-created":
    case "proposal-approved":
      return (
        <div className="notif-content">
          <div className="notif-title">{n.type === "proposal-created" ? "New Proposal" : "Proposal Approved"}</div>
          <div className="notif-detail">
            {n.senderHandle && <>@{n.senderHandle}: </>}
            {n.summary}
          </div>
          <div className="notif-meta">
            {n.orgName} &middot; {new Date(n.createdAt).toLocaleTimeString()}
          </div>
        </div>
      );
    case "cal-event":
      return (
        <div className="notif-content">
          <div className="notif-title">Calendar Event</div>
          <div className="notif-detail">
            {n.senderHandle && <>@{n.senderHandle}: </>}
            <strong>{n.eventTitle}</strong>
            {n.eventDate && <> on {n.eventDate}</>}
          </div>
          <div className="notif-meta">
            {n.orgName} &middot; {new Date(n.createdAt).toLocaleTimeString()}
          </div>
        </div>
      );
    default: {
      const _exhaustive: never = n;
      return (
        <div className="notif-content">
          <div className="notif-title">Notification</div>
          <div className="notif-meta">{new Date((_exhaustive as { createdAt: string }).createdAt).toLocaleTimeString()}</div>
        </div>
      );
    }
  }
}

export function NotificationPane({
  pds,
  myDid,
  notifications,
  existingOrgRkeys,
  onAccept,
  onDismiss,
  onNewNotifications,
  onClose,
  notifPrefs,
  onSaveNotifPrefs,
}: Props) {
  const [checkHandle, setCheckHandle] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checkSuccess, setCheckSuccess] = useState("");
  const [showPrefs, setShowPrefs] = useState(false);

  const handleCheckInvites = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkHandle.trim()) return;
    setChecking(true);
    setCheckError("");
    setCheckSuccess("");

    try {
      const found = await checkInvitesFromUser(
        pds,
        checkHandle.trim(),
        myDid,
        existingOrgRkeys,
      );

      if (found.length === 0) {
        setCheckSuccess("No pending invites found from this user.");
      } else {
        onNewNotifications(found);
        setCheckSuccess(`Found ${found.length} invite${found.length > 1 ? "s" : ""}!`);
      }
      setCheckHandle("");
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Failed to check invites");
    } finally {
      setChecking(false);
    }
  };

  const togglePref = (type: NotificationType) => {
    const current = notifPrefs?.enabled[type] ?? true;
    const updated: NotificationPreferences = {
      $type: "com.minomobi.vault.notificationPrefs",
      enabled: { ...(notifPrefs?.enabled ?? {}), [type]: !current },
      orgOverrides: notifPrefs?.orgOverrides,
      updatedAt: new Date().toISOString(),
    };
    onSaveNotifPrefs(updated);
  };

  const isEnabled = (type: NotificationType) => notifPrefs?.enabled[type] ?? true;

  return (
    <div className="notif-pane">
      <div className="notif-pane-header">
        <h3>Notifications</h3>
        <div className="notif-header-actions">
          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowPrefs(!showPrefs)}
            title="Notification settings"
          >
            {showPrefs ? "Back" : "Settings"}
          </button>
          <button className="notif-close" onClick={onClose}>&times;</button>
        </div>
      </div>

      {showPrefs ? (
        <div className="notif-prefs">
          <p className="notif-prefs-label">Choose which notifications you receive:</p>
          {(Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((type) => (
            <label key={type} className="notif-pref-row">
              <input
                type="checkbox"
                checked={isEnabled(type)}
                onChange={() => togglePref(type)}
              />
              <span>{NOTIFICATION_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
      ) : (
        <>
          {notifications.length === 0 && (
            <p className="notif-empty">No pending notifications.</p>
          )}

          <div className="notif-list">
            {notifications.map((notif) => (
              <div key={notif.rkey} className="notif-item">
                {renderNotifContent(notif)}
                <div className="notif-actions">
                  {notif.notification.type === "org-invite" && (
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => onAccept(notif)}
                    >
                      Accept
                    </button>
                  )}
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => onDismiss(notif)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="notif-check">
            <h4>Check invites from user</h4>
            <form onSubmit={handleCheckInvites} className="notif-check-form">
              <HandleTypeahead
                id="check-invites-handle"
                value={checkHandle}
                onChange={setCheckHandle}
                placeholder="handle.bsky.social"
              />
              <button
                type="submit"
                className="btn-secondary btn-sm"
                disabled={checking || !checkHandle.trim()}
              >
                {checking ? "Checking..." : "Check"}
              </button>
            </form>
            {checkError && <div className="notif-error">{checkError}</div>}
            {checkSuccess && <div className="notif-success">{checkSuccess}</div>}
          </div>
        </>
      )}
    </div>
  );
}
