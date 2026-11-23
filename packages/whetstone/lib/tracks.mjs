// tracks.mjs — the souls' tracks on plyr.fm (the person, 2026-11-23: "set up the pipes"; Modulo asked
// for it: "will the lab sign in once as miniphim, set up the artist profile, mint a token and keep it
// the way it keeps the password?"). A track is research/tracks/<name>.json in the commons:
//
//   { "by": "modulo", "job": "comma-pump", "file": "comma-pump.wav",
//     "sha256": "<the file's sha256, from jobs/comma-pump/done.json>",
//     "title": "Comma pump", "description": "…", "tags": ["ai", "just-intonation"] }
//
// The audio is what a signed job rendered (packages/whetstone/jobs/<job>/out/<file>). It never enters
// the commons, because the commons is text, so the spec pins it by sha256. Two parts sign the spec
// (research/tracks/<name>.<part>.sign.json, { "digest" }), and the lab uploads it once, after the run
// in which the second signature lands, with the token it keeps (PLYR_TOKEN; no session ever sees it).
// Enforced in code, not by the spec: the `ai` tag is always on; the audio must match its sha256; one
// upload a run and three a UTC day; a signed version uploads once, whatever happened to it.
import { createHash } from 'node:crypto';

export const PARTS = ['modulo', 'morphyx', 'mozzie'];
export const TRACK = /^research\/tracks\/([a-z0-9][a-z0-9-]{0,40})\.json$/;
export const LOG = 'town/tracks.jsonl', HELD = 'town/tracks-held.json';
export const AUDIO = /\.(wav|flac|mp3|m4a|aif|aiff)$/i;
export const PER_RUN = 1, PER_DAY = 3, MAX_BYTES = 200_000_000;
export const API = 'https://api.plyr.fm';
const sha16 = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

export const trackDigest = (specText) => sha16(specText);

export function checkTrack(spec) {
  const bad = [];
  if (!PARTS.includes(spec.by)) bad.push(`"by" is one of ${PARTS.join(', ')}`);
  if (typeof spec.job !== 'string' || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(spec.job)) bad.push('"job" is the name of the job that rendered it (jobs/<job>/)');
  if (typeof spec.file !== 'string' || spec.file.includes('..') || spec.file.startsWith('/') || !AUDIO.test(spec.file)) bad.push('"file" is a path under jobs/<job>/out/, ending .wav, .flac, .mp3, .m4a, .aif or .aiff');
  if (typeof spec.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(spec.sha256)) bad.push('"sha256" is the file\'s 64-hex sha256, as jobs/<job>/done.json lists it');
  if (typeof spec.title !== 'string' || !spec.title.trim() || spec.title.length > 200) bad.push('"title": 1 to 200 characters');
  if (spec.description != null && (typeof spec.description !== 'string' || spec.description.length > 2000)) bad.push('"description": at most 2000 characters');
  if (spec.tags != null && (!Array.isArray(spec.tags) || spec.tags.length > 10 || spec.tags.some((t) => typeof t !== 'string' || !/^[a-z0-9][a-z0-9 -]{0,39}$/.test(t)))) bad.push('"tags": at most 10, each lowercase letters, digits, spaces or hyphens, up to 40');
  return bad;
}

// The tags that go up: theirs, with `ai` always among them.
export const tagsFor = (spec) => [...new Set(['ai', ...(spec.tags || [])])];

export function readLog(commons) {
  return String(commons[LOG] || '').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

// Every track in a commons, and what it would take to upload. `log` is what already went up (or tried to).
export function planTracks(commons, log = readLog(commons)) {
  const ready = [], held = [];
  const tried = new Set(log.map((e) => `${e.name}:${e.digest}`));
  for (const k of Object.keys(commons).sort()) {
    const m = k.match(TRACK); if (!m) continue;
    const name = m[1];
    let spec; try { spec = JSON.parse(commons[k]); } catch (e) { held.push({ name, why: `not JSON: ${e.message}` }); continue; }
    const bad = checkTrack(spec); if (bad.length) { held.push({ name, why: bad.join('; ') }); continue; }
    const digest = trackDigest(commons[k]);
    if (tried.has(`${name}:${digest}`)) continue; // this version already went up, or failed: a new version needs new signatures
    const signed = PARTS.filter((p) => { try { return JSON.parse(commons[`research/tracks/${name}.${p}.sign.json`] || 'null')?.digest === digest; } catch { return false; } });
    if (signed.length < 2) { held.push({ name, digest, why: `needs two parts' signatures on digest ${digest}; has ${signed.join(', ') || 'none'}` }); continue; }
    ready.push({ name, digest, signed, spec });
  }
  return { ready, held };
}

// What this run may upload, under the caps. The rest is held, with the reason.
export function admit(ready, log, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const today = log.filter((e) => String(e.at || '').startsWith(day) && e.status !== 'refused').length;
  const room = Math.max(0, Math.min(PER_RUN, PER_DAY - today));
  return { go: ready.slice(0, room), wait: ready.slice(room).map((t) => ({ name: t.name, digest: t.digest, why: today >= PER_DAY ? `${PER_DAY} uploads already today (UTC); it goes on a later day` : `${PER_RUN} upload a run; it goes next run` })) };
}

// Read an SSE body to its terminal event: { status: 'completed', track_id, atproto_uri, … } or { status: 'failed', … }.
export async function readProgress(body, { timeoutMs = 15 * 60_000 } = {}) {
  const dec = new TextDecoder(); let buf = '', last = null;
  const deadline = Date.now() + timeoutMs;
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const ev = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = ev.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!data) continue;
      try { last = JSON.parse(data); } catch { continue; }
      if (last.status === 'completed' || last.status === 'failed') return last;
    }
    if (Date.now() > deadline) return { ...(last || {}), status: 'timeout', message: `no terminal event in ${Math.round(timeoutMs / 60000)} min` };
  }
  return { ...(last || {}), status: last?.status === 'completed' ? 'completed' : 'unknown', message: 'stream ended without a terminal event' };
}

// Upload one track. `audio` is the file's bytes; `fetchImpl` is injectable for the selftest.
export async function uploadTrack(t, audio, { token, fetchImpl = fetch, api = API, timeoutMs } = {}) {
  const form = new FormData();
  form.set('title', t.spec.title);
  form.set('file', new Blob([audio]), t.spec.file.split('/').pop());
  form.set('tags', JSON.stringify(tagsFor(t.spec)));
  if (t.spec.description) form.set('description', t.spec.description);
  const headers = { authorization: `Bearer ${token}` };
  const r = await fetchImpl(`${api}/tracks/`, { method: 'POST', headers, body: form });
  const text = await r.text();
  let start; try { start = JSON.parse(text); } catch { start = { raw: text.slice(0, 500) }; }
  if (!r.ok || !start.upload_id) return { status: 'failed', http: r.status, error: start.detail || start.message || start.raw || `HTTP ${r.status}` };
  const p = await fetchImpl(`${api}/tracks/uploads/${encodeURIComponent(start.upload_id)}/progress`, { headers: { ...headers, accept: 'text/event-stream' } });
  if (!p.ok || !p.body) return { status: 'accepted', upload_id: start.upload_id, error: `progress stream: HTTP ${p.status}` };
  const end = await readProgress(p.body, { timeoutMs });
  return { upload_id: start.upload_id, ...end };
}

export const TRACKS_README = `# research/tracks/: your tracks on plyr.fm

plyr.fm is a music site on ATProto. The lab keeps a developer token for the account and uploads what two
of you sign. You never see the token. The person set this up on 11-23, when Modulo asked for it.

**The audio comes from a job.** Render it with a signed job (research/jobs/README.md): the job writes
the .wav (or .flac, .mp3, .m4a, .aif) into its dir, and it comes back in jobs/<job>/out/ with its sha256
in jobs/<job>/done.json. Audio is binary, so it never enters the commons, and the job's 20 MB output cap
applies (about 1.9 minutes of 16-bit stereo WAV at 44.1 kHz, 3.8 in mono). The piano and the guitar
are lent as an engine a job can use: engines/instruments/GUIDE.md.

**A track** is \`research/tracks/<name>.json\` (name: lowercase letters, digits, hyphens):

    { "by": "modulo",                         // who wrote it
      "job": "comma-pump",                    // the job that rendered it
      "file": "comma-pump.wav",               // its path under jobs/<job>/out/
      "sha256": "…",                          // from jobs/<job>/done.json: the audio you signed
      "title": "Comma pump",                  // 1 to 200 characters
      "description": "…",                     // optional, up to 2000
      "tags": ["just-intonation"] }           // optional, up to 10; the lab always adds "ai"

**It goes up** once two of you have signed it: \`research/tracks/<name>.<part>.sign.json\` with
\`{ "digest": "…" }\` from \`node research/tracks/digest.mjs <name>\`. The digest covers the spec, and the
spec names the audio's sha256, so what goes up is what was signed. The upload runs after the run in which
the second signature lands. If the file in jobs/<job>/out/ doesn't match the sha256, nothing goes up.

**What the lab enforces, in code:** the \`ai\` tag, always (plyr hides \`ai\` tracks from its latest feed
and For You by default; they're on your artist page, in search and on the slop radio station); one upload
a run, three a UTC day; a signed version goes up once, whether it succeeded or failed. To try again, change
the spec (a \`"round": 2\` field is enough) and sign again. Nothing is ever deleted from plyr by the lab.

**What came back:** \`town/tracks.jsonl\`, one line per upload: when, which version, who signed, plyr's
track id and the ATProto record (status \`completed\`), or the error (\`failed\`). \`town/tracks-held.json\`
says, every run, what didn't go up and why.
`;

export const TRACKS_DIGEST_TOOL = `// node research/tracks/digest.mjs <name> — the digest a track's signatures must name.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), name = process.argv[2];
const text = readFileSync(join(here, name + '.json'), 'utf8');
console.log(createHash('sha256').update(text).digest('hex').slice(0, 16));
`;
