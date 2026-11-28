#!/usr/bin/env node
// tracks.mjs — the lab's side of the souls' tracks on plyr.fm (lib/tracks.mjs says what a track is).
//
//   node tracks.mjs publish --run runs/<run> [--dry]
//
// Uploads what became ready in this run (two signatures, the audio matching its sha256), under the caps,
// with PLYR_TOKEN, and writes into the run's commons, so the next run carries them:
//   town/tracks.jsonl      one line per upload tried: { at, name, digest, by, signed, title, tags, file,
//                          sha256, bytes, status, track_id, atproto_uri, atproto_cid, error }
//   town/tracks-held.json  { at, held: [{ name, why }] }: what didn't go up this run, and why
// With no token it uploads nothing and says so in tracks-held.json. --dry checks everything, uploads nothing.
// whetstone.yml runs it after the run, before the commit.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTree } from './lib/commons.mjs';
import { planTracks, admit, readLog, uploadTrack, tagsFor, LOG, HELD, MAX_BYTES } from './lib/tracks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const JOBS_HOME = join(HERE, 'jobs');
const sha = (b) => createHash('sha256').update(b).digest('hex');

export async function publish(runDir, { token = process.env.PLYR_TOKEN, dry = false, jobsHome = JOBS_HOME, now = new Date(), fetchImpl } = {}) {
  const commonsDir = join(runDir, 'commons');
  const commons = readTree(commonsDir);
  const log = readLog(commons);
  const { ready, held } = planTracks(commons, log);
  const found = [];
  for (const t of ready) {
    const root = resolve(jobsHome, t.spec.job, 'out'), p = resolve(root, t.spec.file);
    if (!p.startsWith(root + '/')) { held.push({ name: t.name, digest: t.digest, why: '"file" leaves jobs/<job>/out/' }); continue; }
    if (!existsSync(p)) { held.push({ name: t.name, digest: t.digest, why: `jobs/${t.spec.job}/out/${t.spec.file} isn't there (has the job run and brought it back?)` }); continue; }
    const bytes = statSync(p).size;
    if (bytes > MAX_BYTES) { held.push({ name: t.name, digest: t.digest, why: `${bytes} bytes, over ${MAX_BYTES}` }); continue; }
    const audio = readFileSync(p);
    if (sha(audio) !== t.spec.sha256) { held.push({ name: t.name, digest: t.digest, why: `jobs/${t.spec.job}/out/${t.spec.file} has sha256 ${sha(audio)}, not the ${t.spec.sha256} that was signed` }); continue; }
    found.push({ ...t, audio, bytes });
  }
  const { go, wait } = admit(found, log, now);
  held.push(...wait);
  const done = [];
  if (go.length && !token && !dry) held.push(...go.map((t) => ({ name: t.name, digest: t.digest, why: 'the lab has no plyr token yet (PLYR_TOKEN); it goes up once it does' })));
  else for (const t of go) {
    const base = { at: now.toISOString(), name: t.name, digest: t.digest, by: t.spec.by, signed: t.signed, title: t.spec.title, tags: tagsFor(t.spec), file: `jobs/${t.spec.job}/out/${t.spec.file}`, sha256: t.spec.sha256, bytes: t.bytes };
    if (dry) { done.push({ ...base, status: 'dry' }); continue; }
    let r; try { r = await uploadTrack(t, t.audio, { token, ...(fetchImpl ? { fetchImpl } : {}) }); } catch (e) { r = { status: 'failed', error: String(e.message || e) }; }
    const line = { ...base, status: r.status, ...(r.upload_id ? { upload_id: r.upload_id } : {}), ...(r.track_id != null ? { track_id: r.track_id } : {}),
      ...(r.atproto_uri ? { atproto_uri: r.atproto_uri, atproto_cid: r.atproto_cid } : {}), ...(r.error ? { error: String(r.error).slice(0, 500) } : {}), ...(r.warnings ? { warnings: r.warnings } : {}) };
    done.push(line);
  }
  if (!dry) {
    mkdirSync(join(commonsDir, 'town'), { recursive: true });
    for (const l of done) appendFileSync(join(commonsDir, LOG), JSON.stringify(l) + '\n');
    if (held.length || existsSync(join(commonsDir, HELD))) writeFileSync(join(commonsDir, HELD), JSON.stringify({ at: now.toISOString(), held }, null, 1) + '\n');
  }
  return { uploaded: done, held };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd] = process.argv.slice(2);
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
  if (cmd !== 'publish' || !arg('run')) { console.error('usage: tracks.mjs publish --run runs/<run> [--dry]'); process.exit(2); }
  const out = await publish(arg('run'), { dry: process.argv.includes('--dry') });
  // A failed upload is a result, recorded in tracks.jsonl, not a broken run: this exits 0 either way.
  console.log(JSON.stringify({ uploaded: out.uploaded.map(({ name, status, track_id, error }) => ({ name, status, track_id, error })), held: out.held }));
}
