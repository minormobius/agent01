import { useState } from "react";
import type { PdsClient } from "../pds";
import type { NotificationRecord } from "../types";
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
}: Props) {
  const [checkHandle, setCheckHandle] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checkSuccess, setCheckSuccess] = useState("");

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

  return (
    <div className="notif-pane">
      <div className="notif-pane-header">
        <h3>Notifications</h3>
        <button className="notif-close" onClick={onClose}>&times;</button>
      </div>

      {notifications.length === 0 && (
        <p className="notif-empty">No pending notifications.</p>
      )}

      <div className="notif-list">
        {notifications.map((notif) => (
          <div key={notif.rkey} className="notif-item">
            {notif.notification.type === "org-invite" && (
              <>
                <div className="notif-content">
                  <div className="notif-title">Org Invite</div>
                  <div className="notif-detail">
                    Invited to <strong>{notif.notification.orgName}</strong>
                    {notif.notification.invitedByHandle && (
                      <> by @{notif.notification.invitedByHandle}</>
                    )}
                  </div>
                  <div className="notif-meta">
                    Tier: {notif.notification.tierName} &middot;{" "}
                    {new Date(notif.notification.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="notif-actions">
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => onAccept(notif)}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => onDismiss(notif)}
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
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
    </div>
  );
}
