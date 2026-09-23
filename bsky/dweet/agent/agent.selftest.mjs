/**
 * The headless tools, end to end.
 *
 *   node bsky/dweet/agent/agent.selftest.mjs
 *
 * These are the surface an agent drives, so what is asserted is the CONTRACT
 * rather than the prose: exit codes, the shape of `--json`, the trust rule,
 * and — the one worth the file — that a dweet drawing nothing at t=0 is
 * reported as drawing nothing at t=0. That last one is not a hypothetical: the
 * first still this surface ever captured was a black 1280x720 frame because
 * the house `heartbeat`'s loop runs zero times at t=0, and it took a browser,
 * a capture path and a screenshot to notice. This finds it in milliseconds.
 *
 * `render.mjs` is deliberately NOT exercised here. It needs a Chromium that
 * preflight cannot assume, and a test that silently passes when the thing it
 * tests is absent is worse than no test — so its behaviour without a browser
 * IS asserted (a clear message, exit 2) and its behaviour with one is left to
 * the browser runs.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AGENT = dirname(fileURLToPath(import.meta.url));
const DWEET = join(AGENT, '..');
const REPO = join(DWEET, '..', '..');

let pass = 0;
const fails = [];
const ok = (what, cond, detail) => {
  if (cond) { pass++; return; }
  fails.push(detail ? `${what} — ${detail}` : what);
};
const eq = (what, got, want) =>
  ok(what, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/** Run a tool. Never throws: the exit code is the thing under test. */
function run(tool, args) {
  try {
    const stdout = execFileSync(process.execPath, [join(AGENT, tool), ...args],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? -1, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') };
  }
}
const json = (r) => { try { return JSON.parse(r.stdout); } catch { return null; } };

// ── check.mjs: the exit-code contract ────────────────────────────
{
  // 0 = usable, 1 = the dweet is wrong, 2 = the TOOL could not run. An agent
  // branches on these, so conflating "your dweet is bad" with "I broke" would
  // send it off fixing the wrong thing.
  eq('valid seed exits 0', run('check.mjs', ['seed:heartbeat', '--json']).code, 0);
  eq('a syntax error exits 1', run('check.mjs', ['--src', 'x.fillRect(', '--json']).code, 1);
  eq('over the cap exits 1', run('check.mjs', ['--src', 'y'.repeat(300), '--json']).code, 1);
  eq('drawing nothing ever exits 1', run('check.mjs', ['--src', 't;', '--json']).code, 1);
  eq('a runaway exits 1', run('check.mjs', ['--src', 'while(1);', '--timeout', '1500', '--json']).code, 1);
  eq('a missing file exits 2 — the tool, not the dweet',
    run('check.mjs', ['no-such-file.js', '--json']).code, 2);
  eq('no source at all exits 2', run('check.mjs', ['--json']).code, 2);
}

// ── check.mjs: the report ────────────────────────────────────────
{
  const r = run('check.mjs', ['seed:heartbeat', '--json']);
  const d = json(r);
  ok('--json parses', d !== null, r.stdout.slice(0, 120) + r.stderr.slice(0, 120));
  eq('lang', d.lang, 'js');
  eq('origin is echoed', d.origin, 'seed:heartbeat');
  eq('tier', d.tier, '256b');
  eq('valid', d.valid, true);
  eq('dwitter portable', d.dwitter, true);
  ok('the post budget is reported', d.post.graphemes > 0 && d.post.max === 300);
  ok('the post fits', d.post.graphemes <= d.post.max, `${d.post.graphemes}`);
  ok('a permalink is offered', /^https:\/\/bsky\.mino\.mobi\/dweet\/\?s=/.test(d.permalink));

  // THE assertion. heartbeat's loop is `for(a=t%8;a>0;a-=.01)`.
  const at0 = d.run.frames.find((f) => f.t === 0);
  const at2 = d.run.frames.find((f) => f.t === 2);
  eq('t=0 draws nothing — the black-still bug, caught statically', at0.ink, 0);
  ok('t=2 draws plenty', at2.ink > 50, `${at2.ink}`);
  eq('and t=8, the period, is blank again',
    d.run.frames.find((f) => f.t === 8).ink, 0);
  eq('it clears the canvas', d.run.clears, true);
  ok('the api it touches is named', d.run.api.some((a) => a.member === 'fillRect'));
  eq('it does not read pixels back', d.run.readsBack, false);
}

// ── the distinctions that make the report worth reading ──────────
{
  // A path built and never filled commits no ink. Counting it as a draw would
  // report a blank dweet as working.
  const built = json(run('check.mjs', ['--src', 'x.beginPath();x.arc(9,9,9,0,7)', '--at', '1', '--json']));
  ok('a path with no fill draws calls but no ink',
    built.run.frames[0].draws > 0 && built.run.frames[0].ink === 0,
    JSON.stringify(built.run.frames[0]));
  const filled = json(run('check.mjs', ['--src', 'x.beginPath();x.arc(9,9,9,0,7);x.fill()', '--at', '1', '--json']));
  ok('…and adding fill() makes ink', filled.run.frames[0].ink > 0);

  // A dweet that does not clear accumulates — which is a real technique, so it
  // is reported rather than judged.
  const trail = json(run('check.mjs', ['--src', 'x.fillRect(t*9,9,9,9)', '--at', '1', '--json']));
  eq('a dweet with no clear is reported as such', trail.run.clears, false);
  eq('…and still counts as working', run('check.mjs', ['--src', 'x.fillRect(t*9,9,9,9)', '--at', '1']).code, 0);

  // Reading the canvas back makes these counts unlike a browser's, and a tool
  // that did not say so would be quietly lying.
  const rb = json(run('check.mjs', ['--src', 'x.getImageData(0,0,1,1);x.fillRect(0,0,9,9)', '--at', '1', '--json']));
  eq('reading pixels back is flagged', rb.run.readsBack, true);
}

// ── the trust rule ───────────────────────────────────────────────
{
  // A permalink is network-sourced even though no request is made for it: the
  // source came from outside, which is the whole point.
  const link = 'https://bsky.mino.mobi/dweet/?s=Yy53aWR0aHw9MDt4LmZpbGxSZWN0KDEwLDEwLDUwLDUwKQ';
  const d = json(run('check.mjs', [link, '--json']));
  eq('untrusted source is NOT run', d.run.skipped, 'untrusted');
  ok('…and the refusal explains itself', /no sandbox/.test(d.run.why), d.run.why);
  ok('…while the static half still works', d.valid === true && d.chars > 0);

  const forced = json(run('check.mjs', [link, '--run-untrusted', '--at', '1', '--json']));
  ok('--run-untrusted runs it', forced.run.ok === true && !forced.run.skipped);

  // A seed is local to this repo, so it is ours and it runs without a flag.
  ok('a seed is trusted', !json(run('check.mjs', ['seed:ribbon', '--json'])).run.skipped);
}

// ── glsl is described, not executed ──────────────────────────────
{
  const d = json(run('check.mjs', ['seed:ripples', '--json']));
  eq('glsl is not run here', d.run.skipped, 'glsl');
  ok('the dialect is named', /native/.test(d.glsl.dialect), d.glsl.dialect);
  ok('and its uniforms are listed', d.glsl.uniforms.includes('t'));
  ok('compiled is honestly false — nothing here has a GPU', d.glsl.compiled === false);

  const shadertoy = json(run('check.mjs', ['seed:interop', '--json']));
  ok('the demosky dialect is recognised too', /mainImage/.test(shadertoy.glsl.dialect),
    shadertoy.glsl.dialect);
}

// ── every source form resolves to the same dweet ─────────────────
{
  const src = 'c.width|=0;x.fillRect(10,10,50,50)';
  const a = json(run('check.mjs', ['--src', src, '--json']));
  const b = json(run('check.mjs', [a.permalink, '--json']));
  eq('a permalink round-trips to the same source', b.chars, a.chars);
  eq('…and the same tier', b.tier, a.tier);
  eq('…and the same permalink', b.permalink, a.permalink);
}

// ── link.mjs ─────────────────────────────────────────────────────
{
  const d = json(run('link.mjs', ['seed:ribbon', '--json']));
  ok('link: the post text carries the source verbatim',
    d.post.text.includes('c.width|=0;for(i=400;i--;)'));
  ok('link: within the budget', d.post.graphemes <= d.post.max);
  eq('link: exactly one facet', d.post.facets.length, 1);
  eq('link: the facet is a link', d.post.facets[0].features[0].$type,
    'app.bsky.richtext.facet#link');
  eq('link: pointing at the permalink', d.post.facets[0].features[0].uri, d.permalink);
  eq('link: an invalid dweet exits 1', run('link.mjs', ['--src', 'z'.repeat(300), '--json']).code, 1);
}

// ── feed.mjs asks for the right thing ────────────────────────────
{
  const src = readFileSync(join(AGENT, 'feed.mjs'), 'utf8');
  // Lowercase. `KIND.COMMIT` is undefined, which the server rejects before the
  // WebSocket upgrade — this surface's feed was empty for days over it, so a
  // second copy of that mistake is worth a test of its own.
  ok('feed asks for kinds=commit, lowercase', /'kinds', 'commit'/.test(src));
  ok('feed filters to the one collection', /'collections', NSID/.test(src));
  eq('feed with no arguments exits 2', run('feed.mjs', []).code, 2);
}

// ── render.mjs degrades honestly ─────────────────────────────────
{
  // Without a browser it must SAY so and exit 2 (the tool cannot run), never
  // exit 0 having described nothing, and never exit 1 as if the dweet failed.
  const r = run('render.mjs', ['seed:heartbeat', '--out', '/tmp/__dweet_selftest_shots']);
  const hasBrowser = existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    && (existsSync(join(REPO, 'node_modules', 'playwright-core'))
        || existsSync(join(REPO, 'node_modules', 'playwright')));
  if (hasBrowser) {
    ok('render: produced frames', r.code === 0, `exit ${r.code}: ${r.stderr.slice(0, 160)}`);
  } else {
    eq('render: no browser is a TOOL failure (2), not a dweet failure (1)', r.code, 2);
    ok('render: and it names the fix', /playwright/.test(r.stderr), r.stderr.slice(0, 160));
    ok('render: and points at the loop that needs no browser',
      /check\.mjs/.test(r.stderr), r.stderr.slice(0, 200));
  }
  eq('render: with no output flag it refuses rather than doing nothing',
    run('render.mjs', ['seed:heartbeat']).code, 2);
}

// ── the skill exists in both places and has not drifted ──────────
{
  const a = join(DWEET, 'SKILL.md');
  const b = join(REPO, '.claude', 'skills', 'dweet', 'SKILL.md');
  ok('SKILL.md is served from the surface', existsSync(a));
  ok('SKILL.md is also a Claude Code skill', existsSync(b));
  // Two files that must stay byte-identical with nothing enforcing it is a
  // drift waiting to happen — the same trap `sync-dataviz.mjs --check` exists
  // for. (The cad package has this pair and no check on it.)
  eq('the two copies are byte-identical', readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));

  const skill = readFileSync(a, 'utf8');
  ok('the skill has YAML front matter with a name', /^---\nname: dweet\n/.test(skill));
  ok('…and a description, which is what an agent matches on',
    /\ndescription: .{80,}/.test(skill));
  // Every command the skill advertises must exist, or it sends an agent at a
  // file that is not there.
  for (const tool of ['check.mjs', 'render.mjs', 'link.mjs', 'feed.mjs']) {
    ok(`the skill's ${tool} exists`, existsSync(join(AGENT, tool)));
    ok(`…and the skill mentions it`, skill.includes(tool));
  }
  ok('llms.txt is served too', existsSync(join(DWEET, 'llms.txt')));
  ok('…and points at the skill', readFileSync(join(DWEET, 'llms.txt'), 'utf8').includes('SKILL.md'));
}

if (fails.length) {
  console.error(`\nagent.selftest: ${fails.length} FAILED, ${pass} passed\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`agent.selftest: ${pass} assertions passed`);
