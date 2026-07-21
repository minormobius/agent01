// Container backend endpoint + reachability probe.
//
// Availability is decided at RUNTIME by probing the worker's /health — not by a
// build-time variable. The production endpoint is baked in as the default, so
// the moment deploy-os-api.yml brings the backend up, `kimi`/`container` work
// with no frontend rebuild; until then the commands report exactly what's
// missing instead of dangling a dead WebSocket. VITE_CONTAINER_API_URL remains
// an optional override (staging, self-hosted); localhost keeps the dev default.

export const CONTAINER_API_URL =
  import.meta.env.VITE_CONTAINER_API_URL ||
  (typeof location !== 'undefined' && location.hostname === 'localhost'
    ? 'ws://localhost:8787'
    : 'wss://os-api.minomobi.com');

// True iff the backend answers /health within timeoutMs. ws(s):// → http(s)://.
export async function checkContainerHealth(timeoutMs = 4000) {
  const httpUrl = CONTAINER_API_URL.replace(/^ws/, 'http');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${httpUrl}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
