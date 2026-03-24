import { APPS, type OrgRecord } from "../types";

interface Props {
  activeOrg: OrgRecord | null;
}

export function AppGrid({ activeOrg }: Props) {
  return (
    <div className="app-grid-section">
      <h2>Tools</h2>
      <div className="app-grid">
        {APPS.map((app) => {
          // Org-aware apps get org context params if an org is selected
          let href = app.url;
          if (app.orgAware && activeOrg) {
            const sep = href.includes("?") ? "&" : "?";
            href += `${sep}org=${activeOrg.rkey}&founder=${encodeURIComponent(activeOrg.org.founderDid)}`;
          }

          return (
            <a
              key={app.id}
              className={`app-card${app.orgAware && !activeOrg ? "" : ""}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="app-icon">{app.icon}</div>
              <div className="app-name">{app.name}</div>
              <div className="app-desc">{app.description}</div>
              {app.orgAware && (
                <div style={{ fontSize: "0.7rem", color: "var(--accent)", marginTop: 4 }}>
                  Org-aware
                </div>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
