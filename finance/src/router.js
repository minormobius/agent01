import { useState, useEffect } from "react";

// Tiny path-based router. Cloudflare Pages SPA fallback (public/_redirects)
// makes any unknown path serve index.html, which boots App and reads
// window.location.pathname to render the right route.

export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return normalize(path);
}

export function navigate(to) {
  const target = normalize(to);
  if (target === normalize(window.location.pathname)) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

// Strip trailing slash except for root
function normalize(p) {
  if (!p || p === "/") return "/";
  return p.replace(/\/+$/, "");
}
