/**
 * Sync pane — ATProto encrypted push/pull for PM project state.
 *
 * Uses the shared vault crypto layer (sealRecord/unsealRecord) to store
 * project data as encrypted `vault.sealed` records on the user's PDS.
 *
 * Record layout on PDS:
 *   - vault.sealed rkey "pm-{projectRkey}" → full ProjectState (innerType: com.minomobi.pm.project)
 *   - vault.sealed rkey "pm-sched-{taskId}" → per-task schedule (innerType: com.minomobi.pm.schedule)
 *   - vault.sealed rkey "pm-team-{projectRkey}" → team roster (innerType: com.minomobi.pm.team)
 */

import { useState, useCallback, useRef } from "react";
import type { ProjectActions } from "../useProject";
import type { ProjectState } from "../types";
import type { VaultState } from "../../App";
import type { PdsClient } from "../../pds";
import { sealRecord, unsealRecord } from "../../crypto";

const SEALED_COLLECTION = "com.minomobi.vault.sealed";
const KEYRING_RKEY = "self"; // personal vault keyring

// Inner types for PM records
const PM_PROJECT_TYPE = "com.minomobi.pm.project";
const PM_SCHEDULE_TYPE = "com.minomobi.pm.schedule";
const PM_TEAM_TYPE = "com.minomobi.pm.team";

// Stable rkey for the project record (one project per vault for now)
const PROJECT_RKEY = "pm-main";
const TEAM_RKEY = "pm-team-main";

interface LogEntry {
  time: string;
  message: string;
  level: "info" | "error" | "success";
}

interface Props {
  project: ProjectActions;
  vault?: VaultState | null;
  pds?: PdsClient | null;
}

export function Sync({ project, vault, pds }: Props) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, { time, message, level }]);
    // Scroll to bottom after render
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  // --- Push ---
  const handlePush = useCallback(async () => {
    if (!vault || !pds) return;
    setPushing(true);
    addLog("Starting push...");

    try {
      const { state } = project;

      // 1. Seal and push the full project state
      const projectEnvelope = await sealRecord(
        PM_PROJECT_TYPE,
        { _pmState: state },
        KEYRING_RKEY,
        vault.dek,
      );
      await pds.putRecord(SEALED_COLLECTION, PROJECT_RKEY, projectEnvelope);
      addLog(`Pushed project "${state.projectName}"`, "success");

      // 2. Push per-task schedule records
      let schedCount = 0;
      for (const task of state.tasks) {
        const schedEnvelope = await sealRecord(
          PM_SCHEDULE_TYPE,
          {
            taskId: task.id,
            name: task.name,
            plannedStart: task.plannedStart,
            plannedEnd: task.plannedEnd,
            duration: task.duration,
            percentComplete: task.percentComplete,
            assigneeId: task.assigneeId,
          },
          KEYRING_RKEY,
          vault.dek,
        );
        const rkey = `pm-sched-${task.id.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 512);
        await pds.putRecord(SEALED_COLLECTION, rkey, schedEnvelope);
        schedCount++;
      }
      addLog(`Pushed ${schedCount} task schedule(s)`, "success");

      // 3. Push team roster
      if (state.members.length > 0) {
        const teamEnvelope = await sealRecord(
          PM_TEAM_TYPE,
          { members: state.members },
          KEYRING_RKEY,
          vault.dek,
        );
        await pds.putRecord(SEALED_COLLECTION, TEAM_RKEY, teamEnvelope);
        addLog(`Pushed team roster (${state.members.length} members)`, "success");
      }

      addLog("Push complete.", "success");
    } catch (err) {
      addLog(`Push failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setPushing(false);
    }
  }, [vault, pds, project, addLog]);

  // --- Pull ---
  const handlePull = useCallback(async () => {
    if (!vault || !pds) return;
    setPulling(true);
    addLog("Starting pull...");

    try {
      // Fetch all sealed records, look for PM project
      let found = false;
      let cursor: string | undefined;

      do {
        const page = await pds.listRecords(SEALED_COLLECTION, 100, cursor);

        for (const rec of page.records) {
          const val = rec.value as Record<string, unknown>;
          if (val.innerType !== PM_PROJECT_TYPE) continue;
          if (!rec.uri.endsWith(`/${PROJECT_RKEY}`)) continue;

          try {
            const { record } = await unsealRecord<{ _pmState: ProjectState }>(val, vault.dek);
            if (record._pmState) {
              project.replaceState(record._pmState);
              addLog(
                `Pulled project "${record._pmState.projectName}" — ` +
                  `${record._pmState.tasks.length} tasks, ` +
                  `${record._pmState.members.length} members`,
                "success",
              );
              found = true;
            }
          } catch (decryptErr) {
            addLog(
              `Decryption failed for record: ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}`,
              "error",
            );
          }
        }

        cursor = page.cursor;
      } while (cursor && !found);

      if (!found) {
        addLog("No PM project found on PDS. Nothing to pull.", "info");
      } else {
        addLog("Pull complete.", "success");
      }
    } catch (err) {
      addLog(`Pull failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setPulling(false);
    }
  }, [vault, pds, project, addLog]);

  // --- Not connected ---
  if (!vault || !pds) {
    return (
      <div className="sync-pane">
        <div className="sync-status sync-disconnected">
          <h3>Not Connected</h3>
          <p>
            Sign in to the Org Hub first. Your vault encryption keys are needed to push and pull
            project data securely.
          </p>
          <p className="sync-hint">
            Go back to the hub home page and sign in with your ATProto credentials and vault
            passphrase, then return to PM.
          </p>
        </div>
      </div>
    );
  }

  // --- Connected ---
  const { session } = vault;
  const taskCount = project.state.tasks.length;
  const memberCount = project.state.members.length;

  return (
    <div className="sync-pane">
      <div className="sync-status sync-connected">
        <h3>Connected</h3>
        <div className="sync-info-grid">
          <span className="sync-label">DID</span>
          <span className="sync-value">{session.did}</span>
          <span className="sync-label">Handle</span>
          <span className="sync-value">@{session.handle}</span>
          <span className="sync-label">Project</span>
          <span className="sync-value">
            {project.state.projectName} ({taskCount} tasks, {memberCount} members)
          </span>
          <span className="sync-label">Encryption</span>
          <span className="sync-value">AES-256-GCM (vault.sealed)</span>
        </div>
      </div>

      <div className="sync-actions">
        <button className="btn-primary" onClick={handlePush} disabled={pushing || pulling}>
          {pushing ? "Pushing..." : "Push to PDS"}
        </button>
        <button className="btn-secondary" onClick={handlePull} disabled={pushing || pulling}>
          {pulling ? "Pulling..." : "Pull from PDS"}
        </button>
      </div>

      <div className="sync-explainer">
        <strong>How sync works:</strong> Your project data is encrypted client-side with your vault
        key (AES-256-GCM), then stored as sealed records on your ATProto PDS. Only someone with your
        vault passphrase can decrypt it. Push overwrites the remote copy; Pull replaces local state.
      </div>

      {log.length > 0 && (
        <div className="sync-log">
          <h4>Activity Log</h4>
          <div className="sync-log-entries">
            {log.map((entry, i) => (
              <div key={i} className={`sync-log-entry sync-log-${entry.level}`}>
                <span className="sync-log-time">{entry.time}</span>
                <span className="sync-log-msg">{entry.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
