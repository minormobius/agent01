// PTY WebSocket server — runs inside the Cloudflare Container
// Spawns a bash shell with a real PTY, streams I/O over WebSocket

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';

const PORT = 8080;
const HEARTBEAT_MS = 30_000;

const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const cols = parseInt(new URL(req.url, 'http://localhost').searchParams.get('cols')) || 80;
  const rows = parseInt(new URL(req.url, 'http://localhost').searchParams.get('rows')) || 24;

  // Env vars passed from the Worker via Container class envVars
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

  // PTY → WebSocket (raw terminal output)
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
  ws.on('pong', () => { ws.isAlive = true; });
});

// Heartbeat interval — detect dead connections
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
  console.log(`[pty-server] listening on :${PORT}`);
});
