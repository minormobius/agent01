// PTY WebSocket server — runs inside the Cloudflare Container
// Spawns bash with real PTY, streams I/O over WebSocket.
// Auto-saves workspace to R2 every 2 minutes + on SIGTERM.

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { execSync } from 'node:child_process';
import pty from 'node-pty';

const PORT = 8080;
const HEARTBEAT_MS = 30_000;
const AUTOSAVE_MS = 2 * 60 * 1000; // 2 minutes

const SYNC_URL = process.env.SYNC_URL || '';
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const WORKSPACE_ID = process.env.WORKSPACE_ID || '';
const SYNC_ENABLED = !!(SYNC_URL && SYNC_TOKEN && WORKSPACE_ID);

// ─── Workspace auto-save to R2 ───────────────────────────────────

let saving = false;

async function saveWorkspace() {
  if (saving || !SYNC_ENABLED) return;
  saving = true;

  try {
    // Tar workspace + Claude config. Exclude heavy/regenerable stuff.
    const tarData = execSync(
      'tar czf - -C /home/coder' +
        ' --ignore-failed-read' +
        ' --exclude=node_modules' +
        ' --exclude=.cache' +
        ' --exclude=__pycache__' +
        ' workspace .claude .bashrc .gitconfig' +
        ' 2>/dev/null',
      { maxBuffer: 100 * 1024 * 1024, encoding: 'buffer' }
    );

    const resp = await fetch(
      `${SYNC_URL}/sync/${encodeURIComponent(WORKSPACE_ID)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${SYNC_TOKEN}`,
          'Content-Type': 'application/gzip',
        },
        body: tarData,
      }
    );

    if (resp.ok) {
      console.log(`[sync] saved (${(tarData.length / 1024).toFixed(0)} KB)`);
    } else {
      console.error(`[sync] save failed: ${resp.status}`);
    }
  } catch (err) {
    // tar errors on missing optional files are expected (e.g., no .gitconfig yet)
    if (!err.message.includes('No such file')) {
      console.error(`[sync] error: ${err.message}`);
    }
  } finally {
    saving = false;
  }
}

// Start auto-save interval
const autosaveInterval = SYNC_ENABLED
  ? setInterval(saveWorkspace, AUTOSAVE_MS)
  : null;

// Graceful shutdown: save workspace before container sleeps
async function shutdown(signal) {
  console.log(`[server] ${signal}, saving workspace...`);
  if (autosaveInterval) clearInterval(autosaveInterval);
  await saveWorkspace();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── HTTP server ──────────────────────────────────────────────────

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ─── WebSocket server ─────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const cols = parseInt(params.get('cols')) || 80;
  const rows = parseInt(params.get('rows')) || 24;

  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: 'en_US.UTF-8',
    HOME: '/home/coder',
  };

  const shell = pty.spawn('bash', ['--login'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: '/home/coder/workspace',
    env,
  });

  console.log(`[pty] spawned bash (pid=${shell.pid}, ${cols}x${rows})`);

  // PTY → WebSocket
  shell.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  shell.onExit(({ exitCode, signal }) => {
    console.log(`[pty] exited (code=${exitCode}, signal=${signal})`);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
      ws.close();
    }
  });

  // WebSocket → PTY
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'input':
        shell.write(msg.data);
        break;
      case 'resize':
        if (msg.cols > 0 && msg.rows > 0) {
          shell.resize(msg.cols, msg.rows);
        }
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  });

  ws.on('close', () => {
    console.log('[pty] client disconnected, killing shell');
    shell.kill();
  });

  ws.on('error', (err) => {
    console.error('[pty] ws error:', err.message);
    shell.kill();
  });

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

// Detect dead connections
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[pty-server] listening on :${PORT}, sync=${SYNC_ENABLED ? 'on' : 'off'}`);
});
