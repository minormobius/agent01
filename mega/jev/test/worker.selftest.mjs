// worker.selftest.mjs — exercises the proxy with a stubbed upstream.
//
//   node mega/jev/test/worker.selftest.mjs
//
// No network, no real key. The stub captures the outgoing request so we can
// assert the two things that actually matter:
//   1. the secret goes UP to TypeSafe and never comes BACK to the caller
//   2. the caller cannot steer the proxy anywhere we did not intend

// Drives the REAL mega worker, so the mount itself is under test, not just
// the handler in isolation.
import worker from '../../worker.js';

const SECRET = 'sk-test-DO-NOT-LEAK-6c1f9a';
let passed = 0;
const failures = [];
const ok = (cond, label) => { cond ? passed++ : failures.push(label); };
const ok_ = ok; // alias, for scopes that use `ok` as a local counter

const ASSETS = { fetch: async () => new Response('asset', { status: 200 }) };
const envWith = (key) => ({ TYPESAFE_API_KEY: key, ASSETS });

// Each call gets its own client IP by default, so the per-isolate throttle
// cannot make one test's requests affect another's. Pass an explicit `ip` to
// exercise the throttle itself.
let ipSeq = 0;
let stubCalls = 0;
const post = (body, { raw = false, ip = null } = {}) =>
  new Request('https://mega.mino.mobi/jev/api/ask', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': ip || `10.0.0.${++ipSeq % 250}-${ipSeq}`,
    },
    body: raw ? body : JSON.stringify(body),
  });

const goodQuestions = {
  move: { type: 'choice', instructions: 'Which way?', criteria: { a: 'A', b: 'B' } },
  danger: { type: 'score', instructions: 'How bad?', criteria: ['calm', 'bad'] },
  fight: { type: 'noul', instructions: 'Fight?' },
};
const goodBody = { state: { room: 1 }, questions: goodQuestions };

// Swap global fetch for a capturing stub.
function withStub(handler, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init); };
  return fn(calls).finally(() => { globalThis.fetch = real; });
}

const upstreamOK = () =>
  new Response(JSON.stringify({
    model: 'jev-latest',
    answers: { move: { type: 'choice', choice: 'a', probabilities: { a: 0.9, b: 0.1 }, confidence: 0.88 } },
    usage: { input_tokens: 312, output_tokens: 48 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

await (async () => {
  // ---------------------------------------------------------- health ----
  {
    const res = await worker.fetch(new Request('https://mega.mino.mobi/jev/api/health'), envWith(SECRET));
    const body = await res.json();
    ok(res.status === 200, 'health returns 200');
    ok(body.configured === true, 'health reports configured when a key is set');
    ok(!JSON.stringify(body).includes(SECRET), 'health NEVER echoes the key');
    ok(!JSON.stringify(body).includes(SECRET.slice(0, 8)), 'health leaks no prefix of the key');
  }
  {
    const res = await worker.fetch(new Request('https://mega.mino.mobi/jev/api/health'), envWith(undefined));
    const body = await res.json();
    ok(body.configured === false, 'health reports unconfigured with no key');
  }

  // ------------------------------------------------------- method/shape ----
  {
    const res = await worker.fetch(new Request('https://mega.mino.mobi/jev/api/ask'), envWith(SECRET));
    ok(res.status === 405, 'GET /api/ask is 405');
  }
  {
    const res = await worker.fetch(post(goodBody), envWith(undefined));
    const body = await res.json();
    ok(res.status === 503, 'no key configured -> 503');
    ok(body.error === 'no_api_key', 'no key is reported as no_api_key');
  }
  {
    const res = await worker.fetch(post('{not json', { raw: true }), envWith(SECRET));
    ok(res.status === 400, 'malformed JSON -> 400');
  }
  for (const [bad, label] of [
    [{ questions: goodQuestions }, 'missing state'],
    [{ state: 'x' }, 'missing questions'],
    [{ state: 'x', questions: [] }, 'questions as an array'],
    [{ state: 'x', questions: {} }, 'empty questions'],
    [{ state: 'x', questions: { q: { type: 'essay', instructions: 'hi' } } }, 'unknown question type'],
    [{ state: 'x', questions: { q: { type: 'noul' } } }, 'question without instructions'],
    [{ state: 'x', questions: { q: { type: 'noul', instructions: '' } } }, 'empty string instructions'],
    [{ state: 'x', questions: { q: { type: 'noul', instructions: {} } } }, 'empty object instructions'],
    [{ state: 'x', questions: { q: { type: 'noul', instructions: [] } } }, 'empty array instructions'],
    [{ state: 'x', questions: { q: { type: 'noul', instructions: 42 } } }, 'numeric instructions'],
  ]) {
    const res = await worker.fetch(post(bad), envWith(SECRET));
    ok(res.status === 422, `${label} -> 422`);
  }
  {
    const many = {};
    for (let i = 0; i < 20; i++) many[`q${i}`] = { type: 'noul', instructions: 'x' };
    const res = await worker.fetch(post({ state: 'x', questions: many }), envWith(SECRET));
    ok(res.status === 422, 'too many questions -> 422');
  }
  {
    const huge = JSON.stringify({ state: 'x'.repeat(70_000), questions: goodQuestions });
    const res = await worker.fetch(post(huge, { raw: true }), envWith(SECRET));
    ok(res.status === 413, 'oversized body -> 413');
  }

  // ---------------------------------------------------- the happy path ----
  await withStub(upstreamOK, async (calls) => {
    const res = await worker.fetch(
      // extra fields the caller must NOT be able to smuggle through
      post({ ...goodBody, model: 'something-expensive', max_tokens: 99999, stream: true }),
      envWith(SECRET),
    );
    const body = await res.json();
    ok(res.status === 200, 'happy path -> 200');
    ok(calls.length === 1, 'exactly one upstream call');

    const { url, init } = calls[0];
    ok(url === 'https://api.typesafe.ai/v1/systemone', 'calls the documented endpoint');
    ok(init.method === 'POST', 'calls upstream with POST');
    ok(init.headers.authorization === `Bearer ${SECRET}`, 'sends the key as a bearer token UPSTREAM');

    const sent = JSON.parse(init.body);
    ok(sent.model === 'jev-latest', 'model is forced to jev-latest, not the caller value');
    ok(!('max_tokens' in sent), 'unknown caller fields are stripped');
    ok(!('stream' in sent), 'stream cannot be smuggled through');
    ok(Object.keys(sent).sort().join() === 'model,questions,state', 'upstream body is exactly {state,questions,model}');

    // THE assertion this whole file exists for.
    const out = JSON.stringify(body);
    ok(!out.includes(SECRET), 'the key NEVER appears in the proxied response');
    ok(body.source === 'typesafe', 'real answers are stamped source=typesafe');
    ok(typeof body.latency_ms === 'number', 'latency is reported');
    ok(body.answers.move.choice === 'a', 'the answer passes through intact');

    // no CORS headers -> a browser on another origin cannot read this
    ok(!res.headers.get('access-control-allow-origin'), 'no CORS header is emitted (same-origin only)');
  });

  // ------------------------------------------------- upstream failures ----
  for (const [status, label] of [[401, 'bad key'], [422, 'validation'], [429, 'rate limit'], [529, 'overloaded']]) {
    await withStub(
      async () => new Response(JSON.stringify({ error: { message: `upstream says ${status}`, key: SECRET } }), { status }),
      async () => {
        const res = await worker.fetch(post(goodBody), envWith(SECRET));
        const out = JSON.stringify(await res.json());
        ok(res.status !== 200, `upstream ${label} is not reported as success`);
        // Even if the upstream echoed something secret-shaped, we must not
        // widen the blast radius by returning our own key.
        ok(!out.includes(`Bearer ${SECRET}`), `upstream ${label}: no bearer header leaks`);
      },
    );
  }
  await withStub(
    async () => { throw new Error('connect ETIMEDOUT'); },
    async () => {
      const res = await worker.fetch(post(goodBody), envWith(SECRET));
      const body = await res.json();
      ok(res.status === 502, 'upstream unreachable -> 502');
      ok(body.error === 'upstream_unreachable', 'unreachable upstream is named');
      ok(!JSON.stringify(body).includes(SECRET), 'unreachable path leaks no key');
    },
  );
  await withStub(
    async () => new Response('<html>not json</html>', { status: 200 }),
    async () => {
      const res = await worker.fetch(post(goodBody), envWith(SECRET));
      ok(res.status === 502, 'non-JSON upstream -> 502');
    },
  );

  // ------------------------------------- structured instructions are legal ----
  // docs.typesafe.ai/primitives/advanced: `instructions` and criteria values
  // accept JSON objects/arrays, not just strings. This proxy must not be
  // stricter than the service it fronts.
  await withStub(upstreamOK, async (calls) => {
    const structured = {
      state: { x: 1 },
      questions: {
        move: {
          type: 'choice',
          instructions: { task: 'Pick a door.', objective: 'Go deeper.', health: { current: 9, max: 12 } },
          criteria: { a: { direction: 'DOWN', note: 'toward the vaults' }, b: 'plain string is fine too' },
        },
      },
    };
    const res = await worker.fetch(post(structured), envWith(SECRET));
    ok_(res.status === 200, 'object instructions are accepted, not 422');
    const sent = JSON.parse(calls[0].init.body);
    ok_(typeof sent.questions.move.instructions === 'object',
      'structured instructions reach upstream unflattened');
    ok_(typeof sent.questions.move.criteria.a === 'object',
      'structured criteria values reach upstream unflattened');
  });
  await withStub(upstreamOK, async () => {
    const res = await worker.fetch(post({
      state: 'x',
      questions: { q: { type: 'noul', instructions: ['line one', 'line two'] } },
    }), envWith(SECRET));
    ok_(res.status === 200, 'array instructions are accepted');
  });

  // ----------------------------------------------- retrying 429 and 529 ----
  // The docs ask for backoff on these two, and a real 529 (2026-09-17) is what
  // prompted it. Everything else must fail fast rather than spend the budget
  // twice on an error that will repeat.
  for (const status of [429, 529]) {
    await withStub(
      async () => {
        // fail twice, then succeed
        return (++stubCalls <= 2)
          ? new Response(JSON.stringify({ error: 'busy' }), { status })
          : upstreamOK();
      },
      async (calls) => {
        stubCalls = 0;
        const res = await worker.fetch(post(goodBody), envWith(SECRET));
        const body = await res.json();
        ok_(res.status === 200, `a ${status} is retried until it succeeds`);
        ok_(calls.length === 3, `${status}: it took all three attempts (got ${calls.length})`);
        ok_(body.attempts === 3, `${status}: the retry count is reported`);
        ok_(!JSON.stringify(body).includes(SECRET), `${status}: the retry path leaks no key`);
      },
    );
  }
  {
    // a persistent 529 gives up rather than hanging, and says how many it tried
    await withStub(
      async () => new Response(JSON.stringify({ error: 'busy' }), { status: 529 }),
      async (calls) => {
        const res = await worker.fetch(post(goodBody), envWith(SECRET));
        const body = await res.json();
        ok_(res.status === 529, 'a persistent 529 is surfaced, not swallowed');
        ok_(calls.length === 3, `it stops after the retry limit (got ${calls.length})`);
        ok_(body.attempts === 3, 'the attempt count is reported on failure too');
      },
    );
  }
  for (const status of [401, 422, 400]) {
    await withStub(
      async () => new Response(JSON.stringify({ error: 'nope' }), { status }),
      async (calls) => {
        await worker.fetch(post(goodBody), envWith(SECRET));
        ok_(calls.length === 1, `a ${status} is NOT retried (got ${calls.length} call(s))`);
      },
    );
  }

  // ---------------------------------------------------------- throttling ----
  // The proxy spends real money, so one caller must not be able to hammer it.
  await withStub(upstreamOK, async (calls) => {
    const ip = '203.0.113.99';
    let ok = 0, limited = 0, firstLimitedAt = -1;
    for (let i = 0; i < 40; i++) {
      const res = await worker.fetch(post(goodBody, { ip }), envWith(SECRET));
      if (res.status === 200) ok++;
      else if (res.status === 429) {
        if (firstLimitedAt < 0) firstLimitedAt = i;
        limited++;
        const body = await res.json();
        ok_(body.error === 'rate_limited', 'a throttled call is named rate_limited');
        ok_(typeof body.retry_after_s === 'number' && body.retry_after_s > 0, 'throttling reports retry_after_s');
        ok_(res.headers.get('retry-after'), 'throttling sets a Retry-After header');
        ok_(!JSON.stringify(body).includes(SECRET), 'the throttled path leaks no key');
      }
    }
    ok_(limited > 0, 'hammering one IP eventually gets throttled');
    ok_(ok <= 30, `no more than the limit got through (got ${ok})`);
    ok_(firstLimitedAt === 30, `throttling starts exactly at the limit (started at ${firstLimitedAt})`);
    // and it throttled BEFORE spending anything upstream
    ok_(calls.length === ok, `upstream was called only for the calls that passed (${calls.length} vs ${ok})`);
  });
  // a different caller is unaffected by the one that got throttled
  await withStub(upstreamOK, async () => {
    const res = await worker.fetch(post(goodBody, { ip: '203.0.113.7' }), envWith(SECRET));
    ok_(res.status === 200, 'a different IP is not punished for another IP hammering');
  });
  // the throttle must not gate the free endpoints
  {
    let allOk = true;
    for (let i = 0; i < 50; i++) {
      const res = await worker.fetch(new Request('https://mega.mino.mobi/jev/api/health'), envWith(SECRET));
      if (res.status !== 200) allOk = false;
    }
    ok_(allOk, '/api/health is never throttled');
  }

  // ------------------------------------- mega's own routes still work ----
  // jev is a guest on this worker. Mounting it must not disturb the surface
  // it is riding on.
  {
    const res = await worker.fetch(
      new Request('https://mega.mino.mobi/sprite/api/sprite.svg?seed=3'), envWith(SECRET));
    ok(res.status === 200, "mega's /sprite/api still responds");
    const ct = res.headers.get('content-type') || '';
    ok(/svg|xml/.test(ct), `/sprite/api returns an image (${ct})`);
    ok(res.headers.get('access-control-allow-origin') === '*',
      "mega's own API keeps its CORS header");
  }
  {
    const res = await worker.fetch(
      new Request('https://mega.mino.mobi/bees/api/atlas.json'), envWith(SECRET));
    ok(res.status === 200 || res.status === 400, "mega's /bees/api still routes (not swallowed)");
  }
  {
    // a /jev path that is NOT an api route must fall through to the assets
    const res = await worker.fetch(new Request('https://mega.mino.mobi/jev/'), envWith(SECRET));
    ok((await res.text()) === 'asset', '/jev/ itself falls through to the asset store');
  }
  {
    const res = await worker.fetch(new Request('https://mega.mino.mobi/jev/api/nope'), envWith(SECRET));
    ok((await res.text()) === 'asset', 'an unknown /jev/api path falls through rather than 500ing');
  }

  // ------------------------------------------------------------ assets ----
  {
    const res = await worker.fetch(new Request('https://mega.mino.mobi/'), envWith(SECRET));
    ok(res.status === 200 && (await res.text()) === 'asset', 'non-api paths fall through to ASSETS');
  }
})();

if (failures.length) {
  console.error(`✗ worker selftest: ${failures.length} failure(s) of ${passed + failures.length} checks\n`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✓ worker selftest: ${passed} checks passed`);
