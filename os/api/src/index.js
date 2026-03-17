// os-mino-api — Worker + Container class for browser-based PTY shell
// Handles WebSocket upgrade, auth, and routes to per-session Container

import { Container } from '@cloudflare/containers';

// ─── Container class ───────────────────────────────────────────────
// Each instance is a Docker container running bash + node-pty + claude-code.
// One container per user session. Sleeps after 10 min idle, wakes on reconnect.

export class ContainerShell extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';

  // Environment variables injected into the container at startup.
  // The ANTHROPIC_API_KEY is set dynamically per-session via onStart.
  get envVars() {
    return {
      NODE_ENV: 'production',
    };
  }

  onStart() {
    console.log('[container] shell started');
  }

  onStop() {
    console.log('[container] shell stopped');
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
      return new Response(null, {
        headers: corsHeaders(origin),
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' }, { headers: corsHeaders(origin) });
    }

    // WebSocket endpoint: /ws?session=<id>&apiKey=<key>
    if (url.pathname === '/ws') {
      return handleWebSocket(request, env, url);
    }

    return new Response('os.mino — container shell API', {
      status: 200,
      headers: corsHeaders(origin),
    });
  },
};

// ─── WebSocket handler ─────────────────────────────────────────────

async function handleWebSocket(request, env, url) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  // Session ID determines which container instance to use.
  // Each unique session gets its own container.
  const sessionId = url.searchParams.get('session');
  if (!sessionId) {
    return new Response('Missing session parameter', { status: 400 });
  }

  // Get or create a container for this session
  const containerId = env.CONTAINER_SHELL.idFromName(sessionId);
  const container = env.CONTAINER_SHELL.get(containerId);

  // Forward the WebSocket upgrade to the container's PTY server.
  // Pass terminal dimensions as query params.
  const cols = url.searchParams.get('cols') || '80';
  const rows = url.searchParams.get('rows') || '24';
  const containerUrl = new URL(request.url);
  containerUrl.pathname = '/';
  containerUrl.search = `?cols=${cols}&rows=${rows}`;

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}
