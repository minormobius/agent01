// PTY WebSocket server — runs inside the Cloudflare Container
// Spawns bash with real PTY, streams I/O over WebSocket.
// Auto-saves workspace every 2 minutes + on SIGTERM (worker /sync → DO storage).

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
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

// Last moment anything meaningful happened (client attached, message sent,
// agent running). The autosave PUT goes through the Durable Object, which
// RESETS its idle timer — so saving unconditionally would keep the container
// awake (and billing) forever. Skip saves once we've been idle a while and
// let the 10-min sleep actually happen; the final save before going quiet
// already captured the state.
let lastActivity = Date.now();
export function touchActivity() { lastActivity = Date.now(); }
const IDLE_SAVE_CUTOFF_MS = 7 * 60 * 1000;

async function saveWorkspace() {
  if (saving || !SYNC_ENABLED) return;
  if (Date.now() - lastActivity > IDLE_SAVE_CUTOFF_MS) return; // let the DO sleep
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

// A CELL is (harness, model-profile) — the unit this platform runs and compares.
// Everything below is keyed by the cell, not the profile, so `claude:ds4-flash`
// and `opencode:ds4-flash` are separate conversations with separate logs even
// though they are the same model.
const cellKey = (harness, profile) => `${harness}-${profile}`;
const chatSessionFile = (cell) => `/home/coder/.claude/os-chat-session-${cell}`;

// Self-report the selected profile's state (never the key itself) so a
// misconfigured container names its own problem in the chat.
function profileDiag(name, harness = 'claude') {
  try {
    const prof = JSON.parse(process.env.AGENT_PROFILES || '{}')[name];
    if (!prof) return { missing: true, harness };
    // Each harness needs a different wire format from the same provider; report
    // the one THIS run will actually use, so "no endpoint" is attributable.
    const base = harness === 'opencode'
      ? (prof.oaiBase || '')
      : (prof.base || 'anthropic');
    return {
      harness,
      model: prof.model || '(default)',
      base: base || '(none for this harness)',
      hasKey: !!prof.key,
      runnable: harness === 'opencode' ? !!prof.oaiBase : true,
    };
  } catch {
    return { parseError: true, harness };
  }
}

// RUNS ARE DECOUPLED FROM CONNECTIONS. Mobile sockets die constantly (screen
// rotate, phone lock) — the agent must NOT die with them, and a reattaching
// client must get the story so far. Per-CELL state lives at module scope:
// clients attach/detach freely; every frame is buffered in memory AND appended
// to a rolling on-disk log (survives container sleeps via workspace sync).

const CHAT_LOG_MAX = 400;
const chatStates = new Map(); // cell -> { child, buffer, clients, hydrated }
const chatLogFile = (cell) => `/home/coder/.claude/os-chat-log-${cell}.ndjson`;

function chatState(cell) {
  let s = chatStates.get(cell);
  if (!s) {
    s = { child: null, buffer: [], clients: new Set(), hydrated: false };
    chatStates.set(cell, s);
  }
  if (!s.hydrated) {
    s.hydrated = true;
    try {
      const lines = readFileSync(chatLogFile(cell), 'utf8').trim().split('\n');
      for (const line of lines.slice(-CHAT_LOG_MAX)) {
        try { s.buffer.push(JSON.parse(line)); } catch { /* skip bad line */ }
      }
      // Rewrite trimmed so the log can't grow unbounded across sleeps.
      writeFileSync(chatLogFile(cell), s.buffer.map((f) => JSON.stringify(f)).join('\n') + '\n');
    } catch { /* no log yet */ }
  }
  return s;
}

// Record a frame: buffer + disk + broadcast to attached clients (optionally
// excluding the originator, which already rendered its own action locally).
function chatRecord(cell, state, frame, excludeWs = null) {
  state.buffer.push(frame);
  if (state.buffer.length > CHAT_LOG_MAX) state.buffer.shift();
  try { appendFileSync(chatLogFile(cell), JSON.stringify(frame) + '\n'); } catch { /* disk */ }
  for (const c of state.clients) {
    if (c !== excludeWs && c.readyState === c.OPEN) c.send(JSON.stringify(frame));
  }
  touchActivity();
}

function startChatRun(cell, harness, profile, state, text, originWs) {
  const cwd = CHAT_CWD_CANDIDATES.find((d) => existsSync(d)) || '/home/coder';

  // Each harness has its own headless mode and its own way of continuing a
  // conversation. Both are told to skip permission prompts: the container is
  // single-tenant, owned by the person driving the chat, and the blast radius
  // is the container itself + what the scoped PAT allows. In both cases the
  // prompt rides stdin, so user text is never shell-quoted.
  let cmd;
  if (harness === 'opencode') {
    // opencode's session store is per-profile (agent.sh sets XDG_DATA_HOME),
    // so "continue the last session in this store" IS the right conversation —
    // no session id to track. `-` reads the prompt from stdin.
    const cont = existsSync(chatSessionFile(cell)) ? ' --continue' : '';
    cmd = `cd ${cwd} && agent --harness=opencode ${profile} run --format json --auto${cont} -`;
  } else {
    // Resume the persisted conversation if one exists; else start fresh.
    let resume = '';
    try {
      const sid = readFileSync(chatSessionFile(cell), 'utf8').trim();
      if (/^[a-zA-Z0-9-]{8,64}$/.test(sid)) resume = ` --resume ${sid}`;
    } catch { /* first conversation */ }
    cmd = `cd ${cwd} && agent --harness=claude ${profile} -p --output-format stream-json --verbose --dangerously-skip-permissions${resume}`;
  }

  const child = spawn('bash', ['-lc', cmd], {
    env: { ...process.env, HOME: '/home/coder' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  state.child = child;
  chatRecord(cell, state, { type: 'user-msg', text }, originWs);
  chatRecord(cell, state, { type: 'start', harness, diag: profileDiag(profile, harness) });
  child.stdin.write(text);
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
      emitChatLine(cell, harness, state, line);
    }
  });
  child.stderr.on('data', (d) => {
    // Accumulate for the exit report — a failed run's stderr is the
    // diagnosis and must never be lost to client-side filtering.
    stderrBuf = (stderrBuf + d.toString()).slice(-8000);
  });
  child.on('exit', (code) => {
    if (buf.trim()) emitChatLine(cell, harness, state, buf.trim());
    // opencode has no session id to persist; the marker file is what tells the
    // next turn that a session exists in this cell's store to --continue.
    if (harness === 'opencode' && code === 0) {
      try { writeFileSync(chatSessionFile(cell), 'opencode'); } catch { /* not fatal */ }
    }
    chatRecord(cell, state, { type: 'done', code, stderr: code ? stderrBuf.slice(-4000) : undefined });
    state.child = null;
  });
  child.on('error', (err) => {
    chatRecord(cell, state, { type: 'error', error: err.message });
    state.child = null;
  });
}

// The browser renders Claude Code's stream-json shapes (system/init, assistant
// with content blocks, result). Rather than pretend to know OpenCode's event
// schema — it is not part of its documented contract and it moves — we
// DUCK-TYPE: recognise the fields we can act on, and pass anything else through
// verbatim, which ChatView already renders as an info line. So an unrecognised
// event degrades to "shown as raw text", never to "silently dropped".
function normalizeOpencodeEvent(evt) {
  if (!evt || typeof evt !== 'object') return null;

  // Assistant prose, under any of the field names these streams commonly use.
  const text = typeof evt.text === 'string' ? evt.text
    : typeof evt.content === 'string' ? evt.content
    : typeof evt.delta === 'string' ? evt.delta
    : typeof evt.message === 'string' ? evt.message
    : null;
  const roleish = evt.role ?? evt.type ?? '';
  if (text && /assist|message|text|content|output|delta/i.test(String(roleish))) {
    return { type: 'assistant', message: { content: [{ type: 'text', text }] } };
  }

  // Tool activity.
  const toolName = evt.tool ?? evt.toolName ?? evt.name ?? null;
  if (toolName && /tool/i.test(String(roleish) + String(evt.tool ? 'tool' : ''))) {
    return {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: String(toolName), input: evt.input ?? evt.args ?? {} }] },
    };
  }

  return null;
}

function emitChatLine(cell, harness, state, line) {
  if (harness === 'opencode') {
    let evt;
    try { evt = JSON.parse(line); } catch { chatRecord(cell, state, { type: 'event', line }); return; }
    const norm = normalizeOpencodeEvent(evt);
    chatRecord(cell, state, { type: 'event', line: norm ? JSON.stringify(norm) : line });
    return;
  }

  // Claude Code: persist the session id from the init event for --resume.
  if (line.includes('"session_id"')) {
    try {
      const evt = JSON.parse(line);
      if (evt.session_id) writeFileSync(chatSessionFile(cell), evt.session_id);
    } catch { /* not fatal */ }
  }
  chatRecord(cell, state, { type: 'event', line });
}

function handleChatConnection(ws, req) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const rawProfile = params.get('profile') || 'kimi3';
  const profile = /^[a-z0-9][a-z0-9-]{0,31}$/.test(rawProfile) ? rawProfile : 'kimi3';
  const rawHarness = params.get('harness') || 'claude';
  const harness = (rawHarness === 'claude' || rawHarness === 'opencode') ? rawHarness : 'claude';
  const cell = cellKey(harness, profile);
  const state = chatState(cell);
  state.clients.add(ws);
  touchActivity();

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  // Attach: current status (is a run still going?) + the story so far.
  send({ type: 'ready', profile, harness, busy: !!state.child });
  if (state.buffer.length) send({ type: 'history', frames: state.buffer });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    touchActivity();

    if (msg.type === 'ping') { send({ type: 'pong' }); return; }
    if (msg.type === 'interrupt') { state.child?.kill('SIGINT'); return; }
    if (msg.type !== 'user' || typeof msg.text !== 'string' || !msg.text.trim()) return;
    if (state.child) { send({ type: 'error', error: 'a run is already in progress' }); return; }
    startChatRun(cell, harness, profile, state, msg.text, ws);
  });

  // Detach WITHOUT killing the run — the whole point.
  ws.on('close', () => { state.clients.delete(ws); });
  ws.on('error', () => { state.clients.delete(ws); });
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
  // Harness picks the agent loop (claude | opencode); same re-validation, same
  // reason. Absent/invalid → agent.sh's own default.
  const ptyHarness = params.get('harness');
  const ptyHarnessOk = ptyHarness && /^[a-z0-9][a-z0-9-]{0,31}$/.test(ptyHarness);
  const harnessArg = ptyHarnessOk ? `--harness=${ptyHarness} ` : '';
  const shellArgs = bootOk
    ? ['--login', '-c', `agent ${harnessArg}${boot}; exec bash --login`]
    : ['--login'];

  const shell = pty.spawn('bash', shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: '/home/coder/workspace',
    env,
  });

  console.log(`[pty] spawned bash (pid=${shell.pid}, ${cols}x${rows}${bootOk ? `, boot=${harnessArg ? `${ptyHarness}:` : ''}${boot}` : ''})`);

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
