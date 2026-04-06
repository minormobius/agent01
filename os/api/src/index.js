// os-mino-api — Worker + Container for persistent Claude Code environment
// R2-backed workspace, auto-save, MCP servers, Claude subscription auth

import { Container } from '@cloudflare/containers';

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
    // Load workspace ID from DO storage before handling any requests.
    // This ensures envVars has the ID even after container sleep/wake.
    ctx.blockConcurrencyWhile(async () => {
      this._workspaceId = await ctx.storage.get('workspaceId');
    });
  }

  // Environment variables injected into the container.
  // Container uses these for R2 sync and MCP server auth.
  get envVars() {
    return {
      NODE_ENV: 'production',
      SYNC_URL: this.env.SYNC_URL || '',
      SYNC_TOKEN: this.env.SYNC_TOKEN || '',
      WORKSPACE_ID: this._workspaceId || '',
      GITHUB_TOKEN: this.env.GITHUB_TOKEN || '',
      CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN || '',
      CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID || '',
    };
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
  // Auth: shared secret between container and worker
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token || token !== env.SYNC_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Extract workspace ID from path: /sync/{workspaceId}
  const workspaceId = decodeURIComponent(url.pathname.replace('/sync/', ''));
  if (!workspaceId) {
    return new Response('Missing workspace ID', { status: 400 });
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

// ─── WebSocket handler ─────────────────────────────────────────────

async function handleWebSocket(request, env, url) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const sessionId = url.searchParams.get('session');
  if (!sessionId) {
    return new Response('Missing session parameter', { status: 400 });
  }

  // Route to per-user container instance
  const containerId = env.CONTAINER_SHELL.idFromName(sessionId);
  const container = env.CONTAINER_SHELL.get(containerId);

  // Forward WebSocket upgrade to container's PTY server
  const cols = url.searchParams.get('cols') || '80';
  const rows = url.searchParams.get('rows') || '24';
  const containerUrl = new URL(request.url);
  containerUrl.pathname = '/';
  containerUrl.search = `?cols=${cols}&rows=${rows}&session=${encodeURIComponent(sessionId)}`;

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
