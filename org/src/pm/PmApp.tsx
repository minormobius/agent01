/**
 * PM shell — tab bar and pane routing.
 * Panes are lazy-loaded as they get built out.
 */

import { useProject } from "./useProject";
import { PM_TABS } from "./types";
import { Dashboard } from "./panes/Dashboard";
import { useRouter } from "../router";

export function PmApp() {
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
        {activeTab === "tasks" && <Placeholder label="Tasks" />}
        {activeTab === "gantt" && <Placeholder label="Gantt" />}
        {activeTab === "kanban" && <Placeholder label="Kanban" />}
        {activeTab === "scurve" && <Placeholder label="S-Curve" />}
        {activeTab === "team" && <Placeholder label="Team" />}
        {activeTab === "resources" && <Placeholder label="Resources" />}
        {activeTab === "sync" && <Placeholder label="Sync" />}
        {activeTab === "docs" && <Placeholder label="Docs" />}
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div style={{ padding: 32, color: "var(--text-dim)", textAlign: "center" }}>
      {label} pane — coming next
    </div>
  );
}
