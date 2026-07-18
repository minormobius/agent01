// PTY WebSocket server — runs inside the Cloudflare Container
// Spawns bash with real PTY, streams I/O over WebSocket.
// Auto-saves workspace every 2 minutes + on SIGTERM (worker /sync → DO storage).

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import pty from 'node-pty';

const PORT = 8080;
const HEARTBEAT_MS = 30_000;
const AUTOSAVE_MS = 2 * 60 * 1000; // 2 minutes

const SYNC_URL = process.env.SYNC_URL || '';
// Per-instance, did-scoped capability token minted by the worker (replaces the
// old shared SYNC_TOKEN). The worker authorizes sync against the DID inside it.
const CAP_TOKEN = process.env.CAP_TOKEN || '';
const WORKSPACE_ID = process.env.WORKSPACE_ID || '';
const SYNC_ENABLED = !!(SYNC_URL && CAP_TOKEN && WORKSPACE_ID);

// ─── Workspace auto-save (worker /sync → DO storage) ────────────

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
          Authorization: `Bearer ${CAP_TOKEN}`,
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
  // Compare the PATH, not the raw URL — the worker's boot probe appends a
  // query string, which made a healthy container answer 404.
  const reqPath = new URL(req.url, 'http://localhost').pathname;
  if (reqPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ─── Headless agent chat (/chat) ──────────────────────────────────
// Drives Claude Code in non-interactive mode (`claude -p --output-format
// stream-json`) through the `agent <profile>` launcher — same harness and
// model profiles as the PTY, but structured NDJSON events instead of a TUI,
// so the browser can render a real chat. One run at a time per connection.
// Conversation continuity: the session_id from the stream's init event is
// persisted per-profile and resumed with --resume (survives container sleeps
// via the workspace sync, which includes ~/.claude).

const CHAT_CWD_CANDIDATES = ['/home/coder/workspace/agent01', '/home/coder/workspace'];
const chatSessionFile = (profile) => `/home/coder/.claude/os-chat-session-${profile}`;

// Self-report the selected profile's state (never the key itself) so a
// misconfigured container names its own problem in the chat.
function profileDiag(name) {
  try {
    const prof = JSON.parse(process.env.AGENT_PROFILES || '{}')[name];
    if (!prof) return { missing: true };
    return { model: prof.model || '(default)', base: prof.base || 'anthropic', hasKey: !!prof.key };
  } catch {
    return { parseError: true };
  }
}

function handleChatConnection(ws, req) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const rawProfile = params.get('profile') || 'kimi3';
  const profile = /^[a-z0-9][a-z0-9-]{0,31}$/.test(rawProfile) ? rawProfile : 'kimi3';
  let child = null;

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  send({ type: 'ready', profile });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'ping') { send({ type: 'pong' }); return; }
    if (msg.type === 'interrupt') { child?.kill('SIGINT'); return; }
    if (msg.type !== 'user' || typeof msg.text !== 'string' || !msg.text.trim()) return;
    if (child) { send({ type: 'error', error: 'a run is already in progress' }); return; }

    const cwd = CHAT_CWD_CANDIDATES.find((d) => existsSync(d)) || '/home/coder';

    // Resume the persisted conversation if one exists; else start fresh.
    let resume = '';
    try {
      const sid = readFileSync(chatSessionFile(profile), 'utf8').trim();
      if (/^[a-zA-Z0-9-]{8,64}$/.test(sid)) resume = ` --resume ${sid}`;
    } catch { /* first conversation */ }

    // --dangerously-skip-permissions: the container is single-tenant, owned by
    // the same person driving the chat, and the blast radius is the container
    // itself + what the scoped PAT allows. The prompt rides stdin (no shell
    // quoting of user text).
    const cmd = `cd ${cwd} && agent ${profile} -p --output-format stream-json --verbose --dangerously-skip-permissions${resume}`;
    child = spawn('bash', ['-lc', cmd], {
      env: { ...process.env, HOME: '/home/coder' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    send({ type: 'start', diag: profileDiag(profile) });
    child.stdin.write(msg.text);
    child.stdin.end();

    let buf = '';
    let stderrBuf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        // Persist the session id from the init event for --resume next turn.
        if (line.includes('"session_id"')) {
          try {
            const evt = JSON.parse(line);
            if (evt.session_id) writeFileSync(chatSessionFile(profile), evt.session_id);
          } catch { /* not fatal */ }
        }
        send({ type: 'event', line });
      }
    });
    child.stderr.on('data', (d) => {
      // Accumulate for the exit report — a failed run's stderr is the
      // diagnosis and must never be lost to client-side filtering.
      stderrBuf = (stderrBuf + d.toString()).slice(-8000);
      send({ type: 'stderr', text: d.toString().slice(0, 4000) });
    });
    child.on('exit', (code) => {
      if (buf.trim()) send({ type: 'event', line: buf.trim() });
      send({ type: 'done', code, stderr: code ? stderrBuf.slice(-4000) : undefined });
      child = null;
    });
    child.on('error', (err) => {
      send({ type: 'error', error: err.message });
      child = null;
    });
  });

  ws.on('close', () => { child?.kill(); });
  ws.on('error', () => { child?.kill(); });
}

// ─── WebSocket server ─────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // Path routing: /chat → headless agent chat; anything else → PTY shell.
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/chat') {
    console.log('[chat] client connected');
    handleChatConnection(ws, req);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    return;
  }

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

  // Per-connection Anthropic key (native `claude` profile) — forwarded by the
  // worker from the browser. Worker-held profile keys arrive via AGENT_PROFILES.
  const apiKey = params.get('apiKey');
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;

  // Boot profile: land straight in `agent <profile>` (the chat), fall back to
  // bash when the agent exits. Re-validated here — it is spliced into a shell
  // command. Unknown/invalid profile → plain bash.
  const boot = params.get('boot');
  const bootOk = boot && /^[a-z0-9][a-z0-9-]{0,31}$/.test(boot);
  const shellArgs = bootOk
    ? ['--login', '-c', `agent ${boot}; exec bash --login`]
    : ['--login'];

  const shell = pty.spawn('bash', shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: '/home/coder/workspace',
    env,
  });

  console.log(`[pty] spawned bash (pid=${shell.pid}, ${cols}x${rows}${bootOk ? `, boot=${boot}` : ''})`);

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
