import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OpenAICredentialStore } from './src/openai-credential.js';
import { proxyOpenAIResponses } from './src/openai-proxy.js';
import { codexChatArgs, normalizeCodexEvent } from './container/codex-chat.js';

const jwt = (seconds) => `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url')}.y`;
const response = (body, status = 200) => Response.json(body, { status });
const request = (body, method = 'PUT') => new Request('https://do/_openai', { method, body: JSON.stringify(body) });
const tokenRequest = () => new Request('https://do/_openai/token');
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function storage() {
  const values = new Map();
  return {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => { values.set(key, structuredClone(value)); },
    delete: async (key) => values.delete(key),
  };
}
async function seeded(fetcher, access = jwt(-10)) {
  const db = storage();
  const store = new OpenAICredentialStore(db, fetcher);
  assert.equal((await store.handle(request({ access_token: access, refresh_token: 'old-refresh', account_id: 'acct' }), 'put')).status, 200);
  return { db, store };
}

test('concurrent stale requests rotate once and persist before returning', async () => {
  let calls = 0;
  const { db, store } = await seeded(async (_url, opts) => {
    calls++;
    assert.equal(JSON.parse(opts.body).refresh_token, 'old-refresh');
    assert.equal((await db.get('openai:cred')).refreshPending, true);
    return response({ access_token: jwt(3600), refresh_token: 'new-refresh' });
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => store.handle(tokenRequest(), 'token')));
  assert.equal(calls, 1);
  for (const result of results) assert.equal(result.status, 200);
  assert.equal((await db.get('openai:cred')).refresh, 'new-refresh');
  const restarted = new OpenAICredentialStore(db, () => assert.fail('restart must reuse rotated access'));
  assert.equal((await restarted.handle(tokenRequest(), 'token')).status, 200);
});

test('deletion waits for refresh, then cannot be resurrected', async () => {
  const entered = deferred(), finish = deferred();
  const { db, store } = await seeded(async () => {
    entered.resolve(); await finish.promise;
    return response({ access_token: jwt(3600), refresh_token: 'new-refresh' });
  });
  const refreshing = store.handle(tokenRequest(), 'token');
  await entered.promise;
  const deleting = store.handle(new Request('https://do/_openai', { method: 'DELETE' }), 'delete');
  finish.resolve();
  await Promise.all([refreshing, deleting]);
  assert.equal(await db.get('openai:cred'), undefined);
  assert.equal((await store.handle(tokenRequest(), 'token')).status, 503);
});

test('replacement during refresh wins over the old rotated family', async () => {
  const entered = deferred(), finish = deferred();
  const { db, store } = await seeded(async () => {
    entered.resolve(); await finish.promise;
    return response({ access_token: jwt(3600), refresh_token: 'old-family-rotated' });
  });
  const refreshing = store.handle(tokenRequest(), 'token');
  await entered.promise;
  const replacing = store.handle(request({ access_token: jwt(7200), refresh_token: 'replacement-family' }), 'put');
  finish.resolve();
  await Promise.all([refreshing, replacing]);
  assert.equal((await db.get('openai:cred')).refresh, 'replacement-family');
});

test('ambiguous rotation persists across restart and never replays refresh', async () => {
  const { db, store } = await seeded(async () => { throw new Error('connection lost after rotation'); });
  assert.equal((await store.handle(tokenRequest(), 'token')).status, 503);
  const restarted = new OpenAICredentialStore(db, () => assert.fail('must not replay an ambiguous refresh'));
  const status = await (await restarted.handle(tokenRequest(), 'status')).json();
  assert.equal(status.loginRequired, true);
  assert.equal(status.error, 'refresh_uncertain');
  assert.equal((await restarted.handle(tokenRequest(), 'token')).status, 503);
});

test('malformed successful refresh cannot fall back to a consumed token', async () => {
  const { store } = await seeded(async () => response({ access_token: jwt(3600) }));
  assert.equal((await (await store.handle(tokenRequest(), 'token')).json()).error, 'refresh_uncertain');
});

test('invalid grants require login and never echo upstream secret material', async () => {
  let calls = 0;
  const { store } = await seeded(async () => { calls++; return response({ error: 'invalid_grant', detail: 'old-refresh' }, 400); });
  const result = await store.handle(tokenRequest(), 'token');
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes('old-refresh'));
  await store.handle(tokenRequest(), 'token');
  assert.equal(calls, 1);
});

test('known transient errors retain the family and can recover', async () => {
  let calls = 0;
  const { db, store } = await seeded(async () => ++calls === 1 ? response({ error: 'busy' }, 500)
    : response({ access_token: jwt(3600), refresh_token: 'new-refresh' }));
  assert.equal((await store.handle(tokenRequest(), 'token')).status, 502);
  assert.equal((await db.get('openai:cred')).refresh, 'old-refresh');
  assert.equal((await store.handle(tokenRequest(), 'token')).status, 200);
});

test('non-JSON gateway errors are retryable, malformed success requires login', async () => {
  const { db, store } = await seeded(async () => new Response('gateway unavailable', { status: 502 }));
  assert.equal((await store.handle(tokenRequest(), 'token')).status, 502);
  assert.ok(!(await db.get('openai:cred')).refreshPending);
  const second = new OpenAICredentialStore(db, async () => new Response('broken successful response'));
  assert.equal((await (await second.handle(tokenRequest(), 'token')).json()).error, 'refresh_uncertain');
});

test('storage failure after rotation leaves a persistent uncertainty marker', async () => {
  const { db, store } = await seeded(async () => response({ access_token: jwt(3600), refresh_token: 'rotated' }));
  const put = db.put;
  db.put = async (key, value) => {
    if (value.refresh === 'rotated') throw new Error('disk failure');
    return put(key, value);
  };
  assert.equal((await store.handle(tokenRequest(), 'token')).status, 503);
  assert.equal((await db.get('openai:cred')).refreshPending, true);
  const restarted = new OpenAICredentialStore(db, () => assert.fail('cannot replay after failed persistence'));
  assert.equal((await (await restarted.handle(tokenRequest(), 'token')).json()).error, 'refresh_uncertain');
});

test('invalid deposits leave the existing credential intact', async () => {
  const { db, store } = await seeded(() => assert.fail('no OAuth call expected'), jwt(3600));
  for (const body of [null, [], { refresh_token: {} }, { refresh_token: 'bad\nheader' }, { refresh_token: 'r', account_id: 123 }]) {
    assert.equal((await store.handle(request(body), 'put')).status, 400);
  }
  assert.equal((await db.get('openai:cred')).refresh, 'old-refresh');
  const status = await store.handle(tokenRequest(), 'status');
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.ok(!(await status.text()).includes('old-refresh'));
});

test('parallel 401 recovery refreshes once for the rejected access token', async () => {
  const access = jwt(3600);
  let calls = 0;
  const { store } = await seeded(async () => { calls++; return response({ access_token: jwt(7200), refresh_token: 'rotated' }); }, access);
  await Promise.all(Array.from({ length: 10 }, () => store.handle(request({ rejected_access_token: access }, 'POST'), 'token')));
  assert.equal(calls, 1);
});

test('proxy replays body once on 401, swaps credentials and streams SSE', async () => {
  const tokens = ['old-access', 'new-access'];
  const bodies = [], rejected = [];
  let calls = 0;
  const stub = { fetch: async (req) => {
    if (req.method === 'POST') rejected.push((await req.json()).rejected_access_token);
    return response({ access_token: tokens.shift(), account_id: 'real-account' });
  } };
  const req = new Request('https://worker/openai/v1/responses', { method: 'POST', body: '{"stream":true}', headers: {
    Authorization: 'Bearer capability', Cookie: 'browser-secret', 'chatgpt-account-id': 'spoofed',
    'session-id': 'session', 'x-codex-test': 'metadata', 'Content-Type': 'application/json', 'Content-Encoding': 'identity',
  } });
  const result = await proxyOpenAIResponses(req, stub, {}, async (_url, options) => {
    bodies.push(await new Response(options.body).text());
    assert.equal(options.headers.get('cookie'), null);
    assert.equal(options.headers.get('chatgpt-account-id'), 'real-account');
    assert.equal(options.headers.get('session-id'), 'session');
    assert.equal(options.headers.get('content-encoding'), 'identity');
    assert.equal(options.headers.get('authorization'), `Bearer ${calls === 0 ? 'old-access' : 'new-access'}`);
    return ++calls === 1 ? new Response('unauthorized', { status: 401 })
      : new Response('data: reply\n\n', { headers: { 'Content-Type': 'text/event-stream', 'set-cookie': 'upstream-cookie' } });
  });
  assert.deepEqual(bodies, ['{"stream":true}', '{"stream":true}']);
  assert.deepEqual(rejected, ['old-access']);
  assert.equal(result.headers.get('content-type'), 'text/event-stream');
  assert.equal(result.headers.get('set-cookie'), null);
  assert.equal(await result.text(), 'data: reply\n\n');
});

test('proxy does not retry 403 and surfaces missing credentials', async () => {
  let calls = 0;
  const req = () => new Request('https://worker/openai/v1/responses', { method: 'POST', body: '{}' });
  const result = await proxyOpenAIResponses(req(), { fetch: async () => response({ access_token: 'a' }) }, {}, async () => { calls++; return new Response('forbidden', { status: 403 }); });
  assert.equal(result.status, 403);
  assert.equal(calls, 1);
  const missing = await proxyOpenAIResponses(req(), { fetch: async () => response({ error: 'no_credential' }, 503) }, {}, () => assert.fail('no upstream call'));
  assert.equal(missing.status, 503);
});

test('Codex commands use stdin and resume a validated per-cell session', () => {
  const id = '0199a213-81c0-7800-8aa1-bbab2a035a53';
  assert.ok(codexChatArgs('astra', id).includes('resume'));
  assert.ok(codexChatArgs('astra', id).includes(id));
  assert.ok(!codexChatArgs('astra', 'bad; command').includes('resume'));
  assert.equal(codexChatArgs('astra').at(-1), '-');
});

test('Codex output handles snapshots, tools, failures and session IDs', () => {
  const seen = new Map();
  const event = (type, text) => ({ type, item: { id: 'item1', type: 'agent_message', text } });
  assert.equal(normalizeCodexEvent({ type: 'thread.started', thread_id: 'thread-id' }).session_id, 'thread-id');
  assert.equal(normalizeCodexEvent(event('item.updated', 'hello'), seen).message.content[0].text, 'hello');
  assert.equal(normalizeCodexEvent(event('item.completed', 'hello world'), seen).message.content[0].text, ' world');
  assert.equal(normalizeCodexEvent(event('item.completed', 'hello world'), seen).type, 'codex_progress');
  assert.equal(normalizeCodexEvent({ type: 'turn.failed', error: { message: 'login required' } }).is_error, true);
  assert.equal(normalizeCodexEvent({ type: 'item.started', item: { id: 'tool1', type: 'command_execution', command: 'ls' } }, seen).message.content[0].name, 'command_execution');
  assert.equal(normalizeCodexEvent({ type: 'future-event' }), null);
});

test('credential handoff tests (Python standard library)', () => {
  const file = fileURLToPath(new URL('./deposit-credential.test.py', import.meta.url));
  let result;
  for (const runtime of process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']) {
    result = spawnSync(runtime, [file], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    if (!result.error) break;
  }
  assert.equal(result.status, 0, `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`);
});
