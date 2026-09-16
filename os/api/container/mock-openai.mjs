#!/usr/bin/env node
// mock-openai.mjs — a Responses-API stand-in, so the Codex harness can be
// proven end to end with NO credential and no contact with OpenAI.
//
// Why this exists: the one thing that genuinely needs the principal's ChatGPT
// token is whether the real upstream accepts Codex's payload (os/api/CODEX.md
// §5 — the endpoint checks the bearer before the body, so it cannot be probed
// unauthenticated). EVERYTHING ELSE can be verified against this: that the
// binary runs in the container, that `agent --harness=codex` writes a usable
// config, that base_url + env_key reach an arbitrary host from container
// egress, and that a turn completes and streams back.
//
//   node mock-openai.mjs [port]        # default 8899
//   agent --harness=codex <profile> exec --skip-git-repo-check "say hi"
//
// It logs the Authorization header it received, which is the assertion that
// matters for Design C: the container should be sending a CAPABILITY token,
// never an OpenAI credential.

import http from 'node:http';

const port = Number(process.argv[2] || 8899);

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const auth = req.headers.authorization || '(none)';
    let parsed = {};
    try { parsed = JSON.parse(body || '{}'); } catch { /* logged as-is below */ }

    console.log(`\n${req.method} ${req.url}`);
    console.log(`  authorization: ${auth.slice(0, 24)}…  (${auth.length} chars)`);
    console.log(`  model: ${parsed.model ?? '?'}   stream: ${parsed.stream ?? '?'}`);
    console.log(`  wire keys: ${Object.keys(parsed).join(',') || '(unparsed)'}`);
    if (/^Bearer sk-/.test(auth) || /^Bearer ey/.test(auth)) {
      console.log('  ⚠️  that looks like a REAL credential, not a capability token');
    }

    if (!req.url.endsWith('/responses')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"mock: only /responses is implemented"}');
      return;
    }

    // Minimal but COMPLETE Responses SSE turn. Codex hangs on a stream that
    // never reaches response.completed, so the terminal events matter as much
    // as the text.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    const id = 'resp_mock_1';
    const text = 'pong from the mock — the codex harness reached its provider';
    const message = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] };

    send('response.created', { type: 'response.created', response: { id, status: 'in_progress', output: [] } });
    send('response.output_item.done', { type: 'response.output_item.done', output_index: 0, item: message });
    send('response.completed', {
      type: 'response.completed',
      response: {
        id, status: 'completed', output: [message],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    });
    res.end();
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock Responses API on http://127.0.0.1:${port}/v1`);
  console.log('point a cell at it with:');
  console.log(`  AGENT_PROFILES='{"mock":{"respBase":"http://127.0.0.1:${port}/v1","model":"mock-model","key":"cap-token-stand-in"}}' \\`);
  console.log('    agent --harness=codex mock exec --skip-git-repo-check "say hi"');
});
