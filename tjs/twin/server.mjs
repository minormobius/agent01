// twin/server.mjs — the twin plant as an HTTP service speaking the CopleyBench
// amp wire contract (the same surface ScriptHost drives on the real Server /
// SimServer). Point ScriptHost's `Copley.ServerUrl` here and a recipe runs
// against the three.js twin instead of metal — pure sim, no CAN.
//
//   node tjs/twin/server.mjs [--port 5400] [--system ../systems/mps-1.system.json]
//
// Endpoints (subset of CopleyBench, enough to drive + observe):
//   GET  /api/amps                     -> [{node, axis, role, board, channel}]
//   GET  /api/amp/:node/status         -> AmpStatus (position mm, enabled, mode:'twin')
//   POST /api/amp/:node/enable|disable|home
//   POST /api/amp/:node/moverel        body { counts|delta_mm, vel?, accel?, ... } -> OpResult
//   POST /api/coordinated/move         body { moves:[{axis|node, counts|delta_mm,...}] } -> OpResult
//   GET  /api/telemetry/stream         Server-Sent Events, 20 Hz (twin's telemetry channel;
//                                      the real SimServer uses WS /ws/telemetry — parity is a
//                                      small follow-up, see HOMUNCULUS.md)
//   GET  /api/pose                     -> deviceId -> joint state (for external viewers)
//
// No build step, no dependencies — node http only, matching the repo's ethos.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { systemToHomunculus } from '../lib/homunculus.js';
import { PlantBridge } from '../lib/plant-bridge.js';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const PORT = +arg('--port', process.env.PORT || 5400);
const SYS = arg('--system', new URL('../systems/mps-1.system.json', import.meta.url).pathname);

const sys = JSON.parse(readFileSync(SYS.startsWith('/') && process.platform === 'win32' ? SYS.slice(1) : SYS, 'utf8'));
const { deck, profiles, notes } = systemToHomunculus(sys);
const bridge = new PlantBridge(deck, profiles);

const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    if (path === '/' ) return json(res, 200, { service: 'tjs twin plant', system: sys.meta && sys.meta.id, amps: bridge.amps().length, notes });
    if (path === '/api/amps') return json(res, 200, bridge.amps());
    if (path === '/api/pose') return json(res, 200, bridge.pose());

    const m = path.match(/^\/api\/amp\/([^/]+)\/(status|enable|disable|home|moverel)$/);
    if (m) {
      const node = decodeURIComponent(m[1]), verb = m[2];
      if (verb === 'status') { const s = bridge.status(node); return s ? json(res, 200, s) : json(res, 404, { ok: false, message: 'unknown node' }); }
      if (verb === 'enable') return json(res, 200, bridge.enable(node, true));
      if (verb === 'disable') return json(res, 200, bridge.disable(node));
      if (verb === 'home') return json(res, 200, bridge.home(node));
      if (verb === 'moverel') { const body = await readBody(req); return json(res, 200, bridge.moveRel(node, body)); }
    }

    if (path === '/api/coordinated/move' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, bridge.coordinatedMove(body.moves || []));
    }

    if (path === '/api/telemetry/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
      const tick = () => res.write(`data: ${JSON.stringify(bridge.telemetry())}\n\n`);
      tick();
      const iv = setInterval(tick, 50); // 20 Hz
      req.on('close', () => clearInterval(iv));
      return;
    }

    return json(res, 404, { ok: false, message: `no route ${req.method} ${path}` });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e && e.message || e), code: 'server_error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`tjs twin plant  : http://127.0.0.1:${PORT}   (system: ${sys.meta && sys.meta.id}, ${bridge.amps().length} amps)`);
  console.log('wire contract   : /api/amps · /api/amp/:node/{status,moverel,enable,home} · /api/coordinated/move · /api/telemetry/stream');
  console.log('safety          : pure sim — no CAN, no hardware. Parallel to CopleyBench.Server, never the bus owner.');
});
