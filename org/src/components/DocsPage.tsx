import { useState } from "react";
import { useRouter } from "../router";
import { EncryptionTab } from "./docs/EncryptionTab";
import { OrgsTab } from "./docs/OrgsTab";
import { PermissionsTab } from "./docs/PermissionsTab";
import { RecordsTab } from "./docs/RecordsTab";
import { AppsTab } from "./docs/AppsTab";

const TABS = [
  { id: "encryption", label: "Encryption" },
  { id: "orgs", label: "Orgs & Membership" },
  { id: "permissions", label: "Permissions" },
  { id: "records", label: "Records" },
  { id: "apps", label: "Apps" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DocsPage() {
  const [tab, setTab] = useState<TabId>("encryption");
  const { navigate } = useRouter();

  return (
    <div className="docs-page">
      <header className="docs-header">
        <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">
          &larr;
        </button>
        <h1>Documentation</h1>
      </header>

      <nav className="docs-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`docs-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <article className="docs-content">
        {tab === "encryption" && <EncryptionTab />}
        {tab === "orgs" && <OrgsTab />}
        {tab === "permissions" && <PermissionsTab />}
        {tab === "records" && <RecordsTab />}
        {tab === "apps" && <AppsTab />}
      </article>
    </div>
  );
}
