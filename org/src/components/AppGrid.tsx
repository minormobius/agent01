import { APPS, type OrgRecord } from "../types";
import { useRouter } from "../router";

interface Props {
  activeOrg: OrgRecord | null;
}

/** Internal routes — apps that live inside the org hub */
const INTERNAL_ROUTES: Record<string, string> = {
  pm: "/pm",
  wave: "/wave",
  crm: "/crm",
  cal: "/cal",
  todo: "/todo",
  contacts: "/contacts",
  docs: "/docs",
};

export function AppGrid({ activeOrg }: Props) {
  const { navigate } = useRouter();

  return (
    <div className="app-grid-section">
      <h2>Tools</h2>
      <div className="app-grid">
        {APPS.map((app) => {
          const internalRoute = INTERNAL_ROUTES[app.id];

          if (internalRoute) {
            // Internal app — use client-side navigation
            return (
              <button
                key={app.id}
                className="app-card"
                onClick={() => navigate(internalRoute)}
              >
                <div className="app-icon">{app.icon}</div>
                <div className="app-name">{app.name}</div>
                <div className="app-desc">{app.description}</div>
                {app.orgAware && (
                  <div style={{ fontSize: "0.7rem", color: "var(--accent)", marginTop: 4 }}>
                    Org-aware
                  </div>
                )}
              </button>
            );
          }

          // External app — open in new tab
          let href = app.url;
          if (app.orgAware && activeOrg) {
            const sep = href.includes("?") ? "&" : "?";
            href += `${sep}org=${activeOrg.rkey}&founder=${encodeURIComponent(activeOrg.org.founderDid)}`;
          }

          return (
            <a
              key={app.id}
              className="app-card"
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
