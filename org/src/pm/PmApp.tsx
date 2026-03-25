/**
 * PM shell — tab bar and pane routing.
 */

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
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
}

export function PmApp({ vault, pds }: Props) {
  const project = useProject();
  const { navigate } = useRouter();
  const { activeTab, setActiveTab } = project;

  return (
    <div className="pm">
      <header className="pm-header">
        <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">
          &larr;
        </button>
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

