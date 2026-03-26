/**
 * PM shell — tab bar and pane routing.
 * Org-aware: scopes project data per org via localStorage key.
 */

import { useState, useEffect, useRef } from "react";
import { useProject } from "./useProject";
import { PM_TABS } from "./types";
import { Dashboard } from "./panes/Dashboard";
import { Tasks } from "./panes/Tasks";
import { Gantt } from "./panes/Gantt";
import { Kanban } from "./panes/Kanban";
import { SCurve } from "./panes/SCurve";
import { Team } from "./panes/Team";
import { Resources } from "./panes/Resources";
import { Sync } from "./panes/Sync";
import { Docs } from "./panes/Docs";
import { useRouter } from "../router";
import { discoverOrgs } from "../crm/context";
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";
import type { OrgRecord } from "../crm/types";

type OrgScope = "personal" | string; // org rkey

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
}

export function PmApp({ vault, pds }: Props) {
  const { navigate } = useRouter();
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [orgScope, setOrgScope] = useState<OrgScope>("personal");
  const discoveredRef = useRef(false);

  // Discover orgs on mount
  useEffect(() => {
    if (!pds || discoveredRef.current) return;
    discoveredRef.current = true;
    (async () => {
      try {
        const { foundedOrgs, joinedOrgs } = await discoverOrgs(pds);
        setOrgs([...foundedOrgs, ...joinedOrgs.map((j) => j.org)]);
      } catch (err) {
        console.warn("PM: failed to discover orgs:", err);
      }
    })();
  }, [pds]);

  // Scope key for localStorage: "personal" or org rkey
  const storageScope = orgScope === "personal" ? undefined : orgScope;

  return <PmInner
    key={orgScope}
    vault={vault}
    pds={pds}
    orgs={orgs}
    orgScope={orgScope}
    onOrgScopeChange={setOrgScope}
    storageScope={storageScope}
    navigate={navigate}
  />;
}

/** Inner component — remounts when orgScope changes via React key */
function PmInner({ vault, pds, orgs, orgScope, onOrgScopeChange, storageScope, navigate }: {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs: OrgRecord[];
  orgScope: OrgScope;
  onOrgScopeChange: (scope: OrgScope) => void;
  storageScope?: string;
  navigate: (path: string) => void;
}) {
  const project = useProject(storageScope);
  const { activeTab, setActiveTab } = project;

  return (
    <div className="pm">
      <header className="pm-header">
        <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">
          &larr;
        </button>
        <select
          className="org-select pm-org-select"
          value={orgScope}
          onChange={(e) => onOrgScopeChange(e.target.value as OrgScope)}
        >
          <option value="personal">Personal</option>
          {orgs.map((org) => (
            <option key={org.rkey} value={org.rkey}>
              {org.org.name}
            </option>
          ))}
        </select>
        <h1 className="pm-title">
          <input
            className="pm-title-input"
            value={project.state.projectName}
            onChange={(e) => project.setProjectName(e.target.value)}
          />
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary btn-sm" onClick={project.exportJSON}>
            Export
          </button>
          <label className="btn-secondary btn-sm" style={{ cursor: "pointer" }}>
            Import
            <input
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) project.importJSON(f);
              }}
            />
          </label>
        </div>
      </header>

      <nav className="pm-tabs">
        {PM_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`pm-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="pm-pane">
        {activeTab === "dashboard" && <Dashboard project={project} />}
        {activeTab === "tasks" && <Tasks project={project} />}
        {activeTab === "gantt" && <Gantt project={project} />}
        {activeTab === "kanban" && <Kanban project={project} />}
        {activeTab === "scurve" && <SCurve project={project} />}
        {activeTab === "team" && <Team project={project} />}
        {activeTab === "resources" && <Resources project={project} />}
        {activeTab === "sync" && <Sync project={project} vault={vault} pds={pds} />}
        {activeTab === "docs" && <Docs />}
      </div>
    </div>
  );
}

