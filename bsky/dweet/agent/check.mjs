/**
 * Everything about a dweet that can be known without a browser.
 *
 *   node agent/check.mjs <src> [--lang js|glsl] [--at t0,t1,…] [--no-run]
 *                             [--run-untrusted] [--json] [--timeout ms]
 *
 * `<src>` is a file, `-` for stdin, `seed:<name>`, an `at://` uri, a
 * permalink, or use `--src '<source>'`.
 *
 * Exit 1 if the dweet is invalid, throws, or draws nothing at every sampled
 * moment. Exit 2 if the tool itself could not run.
 *
 * ─── what it answers, and why each one is here ─────────────────────────────
 *
 * | reported | the mistake it catches |
 * |---|---|
 * | chars / cap | a dweet the composer will refuse, found before you paste it |
 * | bytes / tier | which demoscene size class it landed in, and by how much |
 * | dwitter | whether it is also portable to dwitter.net unchanged |
 * | **post** | **whether source + link still fit Bluesky's 300 graphemes** |
 * | compiles | a syntax error, named |
 * | draws@t | **a dweet that renders NOTHING at the moment you chose** |
 * | clears | whether it clears the canvas, which decides trails vs accumulation |
 * | api | which canvas surface it actually touches |
 *
 * The `draws@t` row is the one worth the file. A dweet that draws nothing in
 * its first seconds is the commonest way one looks broken, and it is invisible
 * in the source: the house `heartbeat` runs `for(a=t%8;a>0;a-=.01)`, zero
 * iterations at t=0, and its first captured still was a perfectly black
 * 1280x720 frame.
 *
 * Draw calls are NOT pixels. This says a dweet did something, never that it
 * looks like anything — for that, `render.mjs`.
 */
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import {
  ROOT, arg, has, num, positional, resolveSource, emit, die,
} from './common.mjs';
import {
  validate, countChars, sizeClass, dwitterPortable, MAX_CHARS, DWITTER_CHARS, wrapFragment,
} from '../sandbox.js';
import { composePost, graphemes, permalink, POST_MAX } from '../share.js';

const DEFAULT_TIMES = [0, 1, 2, 4, 8];

function runProbe(src, times, timeoutMs) {
  return new Promise((resolve) => {
    const w = new Worker(path.join(ROOT, 'agent', 'probe.mjs'), {
      workerData: { src, times, width: 1920, height: 1080 },
      // A dweet is somebody's code and this is the only bound node offers.
      // It does not make the worker safe — see common.mjs on the trust rule —
      // it stops it spinning for ever.
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    let done = false;
    const finish = (r) => { if (!done) { done = true; w.terminate(); resolve(r); } };
    const timer = setTimeout(
      () => finish({ ok: false, frames: [], api: [], error: { stage: 'hang', message: `did not finish within ${timeoutMs}ms` } }),
      timeoutMs);
    w.on('message', (m) => { clearTimeout(timer); finish(m); });
    w.on('error', (e) => { clearTimeout(timer); finish({ ok: false, frames: [], api: [], error: { stage: 'worker', message: String(e.message || e) } }); });
    w.on('exit', () => { clearTimeout(timer); finish({ ok: false, frames: [], api: [], error: { stage: 'worker', message: 'exited without answering' } }); });
  });
}

let source;
try {
  source = await resolveSource(positional(), { lang: arg('--lang') });
} catch (err) { die(err.message); }

const { src, lang, title, origin, trusted } = source;

// ── the static half: works on anything, executes nothing ─────────
const chars = countChars(src);
const size = sizeClass(src);
const v = validate({ src, lang });
const portable = dwitterPortable({ src, lang });
const url = permalink('https://bsky.mino.mobi/dweet/', { src, lang, title });
const post = composePost({
  src, lang, title, chars, tier: size.label, url,
});

const out = {
  origin,
  lang,
  title: title || null,
  chars, cap: MAX_CHARS,
  bytes: size.bytes, tier: size.label,
  dwitter: portable,
  valid: v.ok,
  error: v.ok ? null : v.error,
  post: { graphemes: graphemes(post.text), max: POST_MAX, dropped: post.dropped },
  permalink: url,
};

// GLSL cannot be compiled without a GL context, so say what CAN be said: which
// dialect the shim will apply, and which uniforms the sketch reaches for.
if (lang === 'glsl') {
  const frag = wrapFragment(src);
  out.glsl = {
    dialect: /\bmainImage\s*\(/.test(src) ? 'shadertoy/demosky (mainImage)' : 'native (bare body)',
    uniforms: ['t', 'iTime', 'u_Time', 'r', 'iResolution', 'FC']
      .filter((u) => new RegExp(`\\b${u}\\b`).test(src)),
    // Not a compile. Nothing here has a GPU; `render.mjs` is where a shader
    // is actually compiled, and it will report the driver's own error.
    compiled: false,
  };
}

// ── the dynamic half ─────────────────────────────────────────────
const times = (arg('--at') || DEFAULT_TIMES.join(','))
  .split(',').map(Number).filter(Number.isFinite);

const wantRun = !has('--no-run') && lang === 'js' && v.ok;
const mayRun = trusted || has('--run-untrusted');

if (wantRun && !mayRun) {
  out.run = {
    skipped: 'untrusted',
    why: `${origin} came from the network, and node has no sandbox to run it in. `
       + 'Pass --run-untrusted if you mean to, or use render.mjs, which runs it in the browser.',
  };
} else if (wantRun) {
  const probe = await runProbe(src, times, num('--timeout', 5000));
  out.run = probe.error
    ? { ok: false, error: probe.error, frames: probe.frames }
    : {
        ok: true,
        frames: probe.frames,
        clears: probe.clears > 0,
        readsBack: probe.readsBack,
        api: probe.api.filter((a) => !a.member.startsWith('c.')).slice(0, 12),
      };
} else if (lang === 'glsl') {
  out.run = { skipped: 'glsl', why: 'a shader needs a GPU — use render.mjs' };
}

// ── report ───────────────────────────────────────────────────────
const lines = [];
lines.push(`${origin}`);
lines.push('');
lines.push(`  lang       ${lang}${out.glsl ? `  (${out.glsl.dialect})` : ''}`);
lines.push(`  chars      ${chars}/${MAX_CHARS} graphemes${chars > MAX_CHARS ? '   OVER' : ''}`);
lines.push(`  bytes      ${size.bytes}  ->  ${size.label}`
  + (size.tier ? `  (${size.tier - size.bytes} to spare)` : '  (above 256b)'));
lines.push(`  dwitter    ${portable ? 'yes — runs on dwitter.net unchanged' : `no (${lang === 'glsl' ? 'glsl' : `${chars} > ${DWITTER_CHARS} chars`})`}`);
lines.push(`  post       ${out.post.graphemes}/${POST_MAX} graphemes with the link`
  + (post.dropped.length ? `  (${post.dropped[0]} dropped to fit)` : ''));
lines.push(`  valid      ${v.ok ? 'ok' : `NO — ${v.error}`}`);
if (out.glsl?.uniforms.length) lines.push(`  uniforms   ${out.glsl.uniforms.join(' ')}`);

if (out.run?.skipped) {
  lines.push('');
  lines.push(`  run        skipped (${out.run.skipped})`);
  lines.push(`             ${out.run.why}`);
} else if (out.run && !out.run.ok) {
  lines.push('');
  lines.push(`  run        FAILED — ${out.run.error.stage}: ${out.run.error.message}`);
} else if (out.run) {
  lines.push('');
  const drawn = out.run.frames.filter((f) => f.ink > 0).length;
  for (const f of out.run.frames) {
    lines.push(`  t=${String(f.t).padEnd(5)}  ${String(f.ink).padStart(6)} ink`
      + `  ${String(f.draws).padStart(6)} calls${f.ink === 0 ? '   <- draws NOTHING here' : ''}`);
  }
  lines.push(`  clears     ${out.run.clears ? 'yes' : 'no — it accumulates, so it will trail'}`);
  if (out.run.readsBack) {
    lines.push('  readsBack  yes — it branches on pixels this harness does not produce,');
    lines.push('             so these counts are not what a browser would do. Use render.mjs.');
  }
  lines.push(`  api        ${out.run.api.map((a) => a.member).join(' ') || '(none)'}`);
  if (drawn === 0) lines.push('  ** it drew nothing at every moment sampled — try --at with later times **');
}
lines.push('');
lines.push(`  ${url}`);

emit(out, lines);

const drewSomething = !out.run || out.run.skipped || (out.run.ok && out.run.frames.some((f) => f.ink > 0));
process.exit(v.ok && (!out.run || out.run.skipped || out.run.ok) && drewSomething ? 0 : 1);
