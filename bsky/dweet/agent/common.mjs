/**
 * Shared bits for the headless dweet tools.
 *
 * The shape is borrowed from `packages/cad/agent/`, which is the other surface
 * in this repo built to be driven by an agent: a handful of small node scripts,
 * one job each, structured output, exit codes that mean something, and a
 * uniform way to name the thing you are working on.
 *
 * ─── the trust rule, which CAD does not need and this does ─────────────────
 *
 * A CAD tree is DATA. A dweet is CODE, and that difference decides the whole
 * design of these tools. `sandbox.js` exists because running a stranger's
 * dweet in a page would be an account takeover; running one in **node** is
 * worse, because node has no sandbox to reach for — a worker thread bounds the
 * CPU and nothing else. It can read your files and open sockets.
 *
 * So:
 *
 *   • source you wrote (a file, stdin, `--src`) RUNS by default;
 *   • source fetched from the network (`at://…`, a permalink, `seed:` is local
 *     so it is fine) is ANALYSED but NOT RUN, unless you pass
 *     `--run-untrusted` and mean it;
 *   • the static half — length, tier, dialect, the post budget — works on
 *     anything, because it never executes.
 *
 * `render.mjs` is the exception and the reason it is a separate script: it
 * runs everything inside the real browser sandbox, which is the only place a
 * stranger's dweet is safe to run at all.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
};
export const has = (flag) => process.argv.includes(flag);
export const num = (flag, dflt) => {
  const v = arg(flag);
  if (v == null) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

/** The first argument that is not a flag and not a flag's value. */
export function positional() {
  const argv = process.argv.slice(2);
  const takesValue = new Set(['--lang', '--at', '--src', '--out', '--gif', '--title',
                              '--frames', '--fps', '--seconds', '--width', '--height',
                              '--colors', '--timeout', '--repo', '--collection', '--limit']);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (takesValue.has(argv[i])) i++; continue; }
    return argv[i];
  }
  return null;
}

const readStdin = () => fs.readFileSync(0, 'utf8');

/**
 * Resolve a source reference.
 *
 * Accepted, and all four work everywhere a `<src>` is asked for:
 *
 *   path/to/dweet.js      a file — its whole contents are the source
 *   -                     stdin
 *   seed:heartbeat        one of the house set, local, no network
 *   at://did/…/rkey       a published record, over the network
 *   https://…/dweet/?s=…  a permalink, which carries the source in the URL
 *
 * @returns {Promise<{src, lang, title, origin, trusted}>}
 */
export async function resolveSource(ref, { lang: langFlag } = {}) {
  const explicit = arg('--src');
  if (explicit != null) {
    return { src: explicit, lang: langFlag || 'js', title: arg('--title', ''),
             origin: 'argument', trusted: true };
  }
  if (!ref) throw new Error('no source: give a file, `-`, `seed:<name>`, an at:// uri, a permalink, or --src');

  if (ref === '-') {
    return { src: readStdin().replace(/\n$/, ''), lang: langFlag || 'js',
             title: arg('--title', ''), origin: 'stdin', trusted: true };
  }

  if (ref.startsWith('seed:')) {
    const { SEEDS } = await import('../seeds.js');
    const name = ref.slice(5);
    const seed = SEEDS.find((s) => s.title === name);
    if (!seed) throw new Error(`no seed "${name}" — have: ${SEEDS.map((s) => s.title).join(', ')}`);
    // A house seed is in this repo, so it is ours and it runs.
    return { src: seed.src, lang: seed.lang, title: seed.title, origin: ref, trusted: true };
  }

  if (ref.startsWith('at://')) {
    const rec = await fetchRecord(ref);
    return { src: rec.src, lang: rec.lang === 'glsl' ? 'glsl' : 'js', title: rec.title || '',
             origin: ref, trusted: false };
  }

  if (/^https?:\/\//.test(ref)) {
    const { fromPermalink } = await import('../share.js');
    const got = fromPermalink(new URL(ref).search);
    if (!got) throw new Error(`no dweet in that URL — a permalink carries ?s=<base64url>`);
    return { ...got, origin: ref, trusted: false };
  }

  const p = path.resolve(ref);
  if (!fs.existsSync(p)) throw new Error(`no such file: ${ref}`);
  return { src: fs.readFileSync(p, 'utf8').replace(/\n$/, ''), lang: langFlag || guessLang(p),
           title: arg('--title', path.basename(p).replace(/\.[^.]+$/, '')),
           origin: p, trusted: true };
}

const guessLang = (p) => (/\.(glsl|frag|fs)$/i.test(p) ? 'glsl' : 'js');

/** Resolve a DID to its PDS, then read one record. No auth: this is public data. */
export async function fetchRecord(uri) {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) throw new Error(`not an at:// uri: ${uri}`);
  const [, did, collection, rkey] = m;
  const pds = await resolvePds(did);
  const url = `${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}`
    + `&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not read ${uri} (${res.status})`);
  return (await res.json()).value;
}

export async function resolvePds(did) {
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) throw new Error(`could not resolve ${did} (${res.status})`);
    const doc = await res.json();
    const svc = doc.service?.find((s) => s.id === '#atproto_pds');
    if (!svc) throw new Error(`no PDS for ${did}`);
    return svc.serviceEndpoint;
  }
  if (did.startsWith('did:web:')) {
    const res = await fetch(`https://${did.slice(8)}/.well-known/did.json`);
    if (!res.ok) throw new Error(`could not resolve ${did} (${res.status})`);
    const svc = (await res.json()).service?.find((s) => s.id === '#atproto_pds');
    if (!svc) throw new Error(`no PDS for ${did}`);
    return svc.serviceEndpoint;
  }
  throw new Error(`unsupported DID method: ${did}`);
}

/** Resolve a handle to a DID, so `--at alice.bsky.social` works. */
export async function resolveHandle(handle) {
  if (handle.startsWith('did:')) return handle;
  const res = await fetch('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle'
    + `?handle=${encodeURIComponent(handle.replace(/^@/, ''))}`);
  if (!res.ok) throw new Error(`could not resolve @${handle} (${res.status})`);
  return (await res.json()).did;
}

/**
 * Print a result as either JSON or a block a person can read.
 *
 * Both, always: `--json` is what a script reads and the table is what a person
 * reads in a terminal, and a tool that offers only one of them ends up wrapped
 * in a parser or squinted at.
 */
export function emit(obj, lines) {
  if (has('--json')) { console.log(JSON.stringify(obj, null, 1)); return; }
  for (const l of lines) console.log(l);
}

export const die = (msg) => { console.error(`error: ${msg}`); process.exit(2); };
