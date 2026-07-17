// os-mino-api — Worker + Container for persistent Claude Code environment
// R2-backed workspace, auto-save, MCP servers, Claude subscription auth

import { Container } from '@cloudflare/containers';

// ─── Capability tokens ─────────────────────────────────────────────
// A container is fully controlled by its user (they have a shell), so NO secret
// is safe inside it. Instead of injecting shared secrets, the DO mints a
// per-instance "capability token" — an HMAC-signed {did, exp} — and hands it to
// the container. Every callback the container makes (sync, and later pds/git)
// carries this token; the worker verifies it and authorizes ONLY that DID's
// resources. The signing key (CAP_SIGNING_KEY) lives only in the worker, never
// in the container, so a shelled user can't forge a token for another DID.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}
async function mintCap(secret, did, ttlSec = 24 * 3600) {
  const payload = b64url(enc.encode(JSON.stringify({ did, exp: Math.floor(Date.now() / 1000) + ttlSec })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}
async function verifyCap(secret, token) {
  if (!secret || !token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlBytes(sig), enc.encode(payload));
  } catch { return null; }
  if (!ok) return null;
  let claims;
  try { claims = JSON.parse(dec.decode(b64urlBytes(payload))); } catch { return null; }
  if (!claims?.did || !claims?.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

// ─── Container class ───────────────────────────────────────────────
// Docker container: bash + Claude Code + MCP servers + persistent workspace.
// One container per user (keyed by DID). Sleeps after 10 min, wakes on reconnect.
// Workspace survives sleep via R2 sync (startup restore + 2-min auto-save).

export class ContainerShell extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';

  constructor(ctx, env) {
    super(ctx, env);
    this._workspaceId = null;
    this._capToken = '';
    // Load workspace ID from DO storage before handling any requests.
    // This ensures envVars has the ID even after container sleep/wake.
    ctx.blockConcurrencyWhile(async () => {
      this._workspaceId = await ctx.storage.get('workspaceId');
    });
  }

  // Environment variables injected into the container.
  // SECURITY: the only credential here is CAP_TOKEN — a per-instance, did-scoped,
  // short-lived capability token. GITHUB_TOKEN / CLOUDFLARE_API_TOKEN are SHARED
  // account credentials and are single-tenant-only; they are gated behind
  // INJECT_SHARED_CREDS and must stay off in any multi-tenant config (the
  // allowlist would otherwise be the only thing standing between a second user
  // and your whole GitHub/Cloudflare account). See SECURITY.md.
  get envVars() {
    const vars = {
      NODE_ENV: 'production',
      SYNC_URL: this.env.SYNC_URL || '',
      CAP_TOKEN: this._capToken || '',
      WORKSPACE_ID: this._workspaceId || '',
      // AGENT_PROFILES — model registry for the in-container `agent <profile>`
      // launcher. Claude Code CLI is the harness for every profile; a profile
      // is just an Anthropic-compatible endpoint + model id + key. kimi3 =
      // Moonshot; any other open model (direct or via a LiteLLM-style gateway
      // that speaks /v1/messages) is one more entry here. Keys ride along ONLY
      // because this deployment is single-tenant (see INJECT_SHARED_CREDS).
      AGENT_PROFILES: JSON.stringify({
        kimi3: {
          base: this.env.KIMI_BASE_URL || 'https://api.moonshot.ai/anthropic',
          model: this.env.KIMI_MODEL || '',
          key: this.env.MOONSHOT_API_KEY || '',
        },
        // claude — native Anthropic; key comes per-connection from the browser
        // (?apiKey → ANTHROPIC_API_KEY in the spawned shell), not from here.
        claude: { base: '', model: '', key: '' },
      }),
    };
    if (this.env.INJECT_SHARED_CREDS === 'true') {
      vars.GITHUB_TOKEN = this.env.GITHUB_TOKEN || '';
      vars.CLOUDFLARE_API_TOKEN = this.env.CLOUDFLARE_API_TOKEN || '';
      vars.CLOUDFLARE_ACCOUNT_ID = this.env.CLOUDFLARE_ACCOUNT_ID || '';
    }
    return vars;
  }

  // Intercept fetch to capture session ID before container starts.
  // The session ID (user's DID) becomes the workspace ID for R2 sync.
  async fetch(request) {
    const url = new URL(request.url);
    const session = url.searchParams.get('session');
    if (session && !this._workspaceId) {
      this._workspaceId = session;
      await this.ctx.storage.put('workspaceId', session);
    }
    // Mint a fresh per-instance capability token bound to this DID before the
    // container starts (refreshed on every wake). The signing key never enters
    // the container, so the shell can't forge a token for another DID.
    if (this._workspaceId && this.env.CAP_SIGNING_KEY) {
      this._capToken = await mintCap(this.env.CAP_SIGNING_KEY, this._workspaceId);
    }
    return super.fetch(request);
  }

  onStart() {
    console.log(`[container] started, workspace=${this._workspaceId}`);
  }

  onStop() {
    console.log('[container] stopped');
  }

  onError(error) {
    console.error('[container] error:', error);
  }
}

// ─── Worker ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' }, { headers: corsHeaders(origin) });
    }

    // Workspace sync: GET/PUT /sync/:workspaceId
    // Called by the container to persist workspace to R2.
    if (url.pathname.startsWith('/sync/')) {
      return handleSync(request, env, url);
    }

    // WebSocket endpoint: /ws?session=<did>&cols=80&rows=24
    if (url.pathname === '/ws') {
      return handleWebSocket(request, env, url);
    }

    return new Response('os.mino — container shell API', {
      status: 200,
      headers: corsHeaders(origin),
    });
  },
};

// ─── Sync handler (R2 workspace persistence) ──────────────────────
// Container calls these endpoints to save/restore workspace tarballs.

async function handleSync(request, env, url) {
  // Auth: per-instance capability token (HMAC-signed {did, exp}).
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const cap = await verifyCap(env.CAP_SIGNING_KEY, token);
  if (!cap) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Extract workspace ID from path: /sync/{workspaceId}
  const workspaceId = decodeURIComponent(url.pathname.replace('/sync/', ''));
  if (!workspaceId) {
    return new Response('Missing workspace ID', { status: 400 });
  }

  // A container may only read/write ITS OWN workspace. This closes the previous
  // cross-tenant leak where any container holding the shared SYNC_TOKEN could
  // read/write every user's R2 tarball.
  if (workspaceId !== cap.did) {
    return new Response('Forbidden', { status: 403 });
  }

  // Sanitize for R2 key (DIDs have colons)
  const r2Key = `workspaces/${workspaceId.replace(/[^a-zA-Z0-9._-]/g, '_')}.tar.gz`;

  // GET: download workspace tarball from R2
  if (request.method === 'GET') {
    const obj = await env.WORKSPACE.get(r2Key);
    if (!obj) return new Response(null, { status: 404 });
    return new Response(obj.body, {
      headers: { 'Content-Type': 'application/gzip' },
    });
  }

  // PUT: upload workspace tarball to R2
  if (request.method === 'PUT') {
    await env.WORKSPACE.put(r2Key, request.body);
    return new Response('ok', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
}

// ─── Identity gate ─────────────────────────────────────────────────
// The container is handed powerful, SHARED credentials (GITHUB_TOKEN,
// CLOUDFLARE_API_TOKEN) via ContainerShell.envVars — anyone who opens a shell
// can read them. So we must prove the connecting user is allowed BEFORE routing
// to a container, and we must derive their identity from a VERIFIED token, never
// from a client-supplied query param.
//
// Spoof/SSRF-safe flow:
//   1. client sends its claimed did (?session) + its PDS accessJwt (?auth)
//   2. did must be on the allowlist (cheap reject)
//   3. resolve the did → its canonical PDS via the TRUSTED directory
//      (plc.directory / did:web) — NOT any client-supplied URL
//   4. call com.atproto.server.getSession on that PDS with the bearer
//   5. assert the token's did matches the claimed, allowlisted did
// An attacker can claim your did but can't produce a valid token for your real
// PDS, and can't redirect us to a lying server, so the gate holds.
//
// Fail closed: if ALLOWED_DIDS is unset, refuse every connection.
async function authorizeDid(env, claimedDid, accessJwt) {
  const allow = (env.ALLOWED_DIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) {
    return { ok: false, status: 503, msg: 'Container access not configured (ALLOWED_DIDS unset)' };
  }
  if (!claimedDid || !accessJwt) {
    return { ok: false, status: 401, msg: 'Missing identity (session + auth required)' };
  }
  if (!allow.includes(claimedDid)) {
    return { ok: false, status: 403, msg: 'Not authorized' };
  }

  let pdsUrl;
  try {
    pdsUrl = await resolvePds(claimedDid);
  } catch {
    return { ok: false, status: 401, msg: 'Could not resolve identity' };
  }

  let verifiedDid;
  try {
    const res = await fetch(`${new URL(pdsUrl).origin}/xrpc/com.atproto.server.getSession`, {
      headers: { Authorization: `Bearer ${accessJwt}` },
    });
    if (!res.ok) return { ok: false, status: 401, msg: 'Invalid session' };
    verifiedDid = (await res.json())?.did;
  } catch {
    return { ok: false, status: 401, msg: 'Auth verification failed' };
  }

  if (!verifiedDid || verifiedDid !== claimedDid || !allow.includes(verifiedDid)) {
    return { ok: false, status: 403, msg: 'Not authorized' };
  }
  return { ok: true, did: verifiedDid };
}

// Trusted DID → PDS resolution (mirrors os/src/auth/oauth.js). Only ever fetches
// plc.directory or the did:web domain itself — never a client-supplied endpoint.
async function resolvePds(did) {
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
    if (!res.ok) throw new Error('plc resolve failed');
    const doc = await res.json();
    const svc = doc.service?.find((s) => s.id === '#atproto_pds');
    if (!svc?.serviceEndpoint) throw new Error('no pds in did doc');
    return svc.serviceEndpoint;
  }
  if (did.startsWith('did:web:')) {
    const domain = did.slice('did:web:'.length);
    if (!/^[a-zA-Z0-9.-]+$/.test(domain)) throw new Error('bad did:web');
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    if (!res.ok) throw new Error('did:web resolve failed');
    const doc = await res.json();
    const svc = doc.service?.find((s) => s.id === '#atproto_pds');
    if (!svc?.serviceEndpoint) throw new Error('no pds in did doc');
    return svc.serviceEndpoint;
  }
  throw new Error('unsupported did method');
}

// ─── WebSocket handler ─────────────────────────────────────────────

async function handleWebSocket(request, env, url) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  // Verify identity BEFORE touching a container. The verified did becomes the
  // workspace key — we ignore any unauthenticated client-claimed value.
  const auth = await authorizeDid(
    env,
    url.searchParams.get('session'),
    url.searchParams.get('auth')
  );
  if (!auth.ok) {
    return new Response(auth.msg, { status: auth.status });
  }
  const sessionId = auth.did;

  // Route to per-user container instance
  const containerId = env.CONTAINER_SHELL.idFromName(sessionId);
  const container = env.CONTAINER_SHELL.get(containerId);

  // Forward WebSocket upgrade to container's PTY server
  const cols = url.searchParams.get('cols') || '80';
  const rows = url.searchParams.get('rows') || '24';
  const containerUrl = new URL(request.url);
  containerUrl.pathname = '/';
  containerUrl.search = `?cols=${cols}&rows=${rows}&session=${encodeURIComponent(sessionId)}`;
  // Per-connection Anthropic key (browser-held, for the native `claude` profile).
  const apiKey = url.searchParams.get('apiKey');
  if (apiKey) containerUrl.search += `&apiKey=${encodeURIComponent(apiKey)}`;
  // Boot profile — auto-launch `agent <profile>` instead of a bare bash prompt
  // (this is how the frontend's `kimi` command lands you straight in the chat).
  // Strictly validated: it becomes part of a shell command in the container.
  const boot = url.searchParams.get('boot');
  if (boot && /^[a-z0-9][a-z0-9-]{0,31}$/.test(boot)) {
    containerUrl.search += `&boot=${boot}`;
  }

  return container.fetch(
    new Request(containerUrl, {
      method: request.method,
      headers: request.headers,
    })
  );
}

// ─── CORS ──────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}
