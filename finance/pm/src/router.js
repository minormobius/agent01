import { useState, useEffect } from "react";

// Tiny path-based router. The PM app is mounted under /pm on fin.mino.mobi
// (the speculative-feedback playground owns the root). BASE strips/prepends
// that prefix so the route table can stay declared as "/", "/networth", …
// unchanged. The surface worker (finance/worker.js) serves /pm/* with
// subtree-aware SPA fallback, so deep links like /pm/networth boot this app
// on refresh.
const BASE = "/pm";

export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return normalize(stripBase(path));
}

export function navigate(to) {
  const target = normalize(to);
  if (target === normalize(stripBase(window.location.pathname))) return;
  window.history.pushState({}, "", withBase(to));
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

// "/pm/networth" -> "/networth"; "/pm" or "/pm/" -> "/"
function stripBase(p) {
  if (p === BASE) return "/";
  if (p.startsWith(BASE + "/")) return p.slice(BASE.length);
  return p;
}

// "/networth" -> "/pm/networth"; "/" -> "/pm"
function withBase(p) {
  const n = normalize(p);
  return n === "/" ? BASE : BASE + n;
}

// Real URL for an in-app target, so anchors (cmd/middle-click) resolve right.
export function hrefFor(to) {
  return withBase(to);
}

// Strip trailing slash except for root
function normalize(p) {
  if (!p || p === "/") return "/";
  return p.replace(/\/+$/, "");
}
