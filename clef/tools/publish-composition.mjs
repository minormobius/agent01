// publish-composition.mjs — put a score in a repository that is not this one.
//
// Publishing a piece of music means two separate things, and this does both:
//
//   1. THE RECORD. The score lands in the account's own ATProto repository as a
//      `com.minomobi.clef.piece` — the notation SOURCE, not a rendering, so any
//      reader that speaks the format can engrave it. That record is the
//      publication; everything else points at it.
//   2. THE POST. A record nobody can find is not published in any useful sense,
//      so a short Bluesky post carries the link.
//
// IDEMPOTENT BY TITLE. The collection's records are keyed by TID, so this
// cannot simply write to a fixed key. Instead it lists what is already there
// and updates the record with the same title, creating one only when there is
// none. Pushing twice therefore edits the piece rather than publishing it
// twice — which matters, because a workflow that duplicates its output on every
// re-run is a workflow nobody dares re-run.
//
// Usage:  node tools/publish-composition.mjs <file.ly> [--post] [--dry-run]

import { readFileSync } from 'node:fs';
import { PdsClient } from '../../packages/atproto/pds.js';
import { parseLily } from '../src/lily.js';
import { engrave } from '../src/engrave.js';

const COLLECTION = 'com.minomobi.clef.piece';
const SITE = 'https://clef.mino.mobi';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const doPost = args.includes('--post');
const dryRun = args.includes('--dry-run');
if (!file) {
  console.error('usage: node tools/publish-composition.mjs <file.ly> [--post] [--dry-run]');
  process.exit(2);
}

const source = readFileSync(file, 'utf8');

// ---- refuse to publish music that does not add up ----
// The whole premise of the collection is that the record IS the score. Shipping
// one whose bars disagree with its own bar checks would publish a mistake in a
// place we cannot reach back into.
const score = parseLily(source);
const layout = engrave(score, { width: 900, staffSpace: 8, grandStaff: false });
const errors = score.diagnostics.filter((d) => d.severity === 'error');
console.log(`${file}: "${score.title}" — ${layout.measures} bars, ${layout.events.length} events`);
console.log(`  diagnostics ${score.diagnostics.length} (errors ${errors.length}) · bar checks failed ${layout.warnings.length}`);
if (errors.length || layout.warnings.length) {
  console.error('REFUSING to publish: the score does not pass its own checks.');
  for (const d of errors) console.error('  error:', d.message);
  for (const w of layout.warnings) console.error('  bar:  ', w.message);
  process.exit(1);
}
if (!score.title) {
  console.error('REFUSING to publish: the score has no title, so it cannot be found again.');
  process.exit(1);
}

const record = {
  $type: COLLECTION,
  title: score.title,
  composer: score.composer || undefined,
  description: 'An original composition in the classical style, written for clef '
    + '— not a transcription of an existing work. A rondo: theme, an episode in the '
    + 'dominant, the theme returning decorated, a turn to the relative minor, and a coda. '
    + `Opens as editable, playable notation at ${SITE}`,
  format: 'lilypond',
  source,
  license: 'CC0 1.0 — dedicated to the public domain',
  createdAt: new Date().toISOString(),
};

const handle = process.env.BLUESKY_MODULO_HANDLE;
const password = process.env.BLUESKY_MODULO_APP_PASSWORD;
if (dryRun || !handle || !password) {
  console.log(dryRun ? '\n--dry-run: not contacting the network.' : '\nNo credentials in the environment; nothing published.');
  console.log(`  would write ${COLLECTION} (${source.length} bytes of source)`);
  console.log(`  would post: ${doPost ? 'yes' : 'no'}`);
  process.exit(0);
}

const pds = new PdsClient();
await pds.login(handle, password);
console.log(`\nsigned in as ${handle} (${pds.did})`);

// ---- create or update, by title ----
let existing = null;
try {
  const list = await pds.listRecords(COLLECTION, 100);
  existing = (list?.records || []).find((r) => r.value?.title === score.title) || null;
} catch (err) {
  console.log(`  (no existing records to check: ${err.message})`);
}

let uri;
if (existing) {
  const rkey = existing.uri.split('/').pop();
  await pds.putRecord(COLLECTION, rkey, record);
  uri = existing.uri;
  console.log(`updated ${uri}`);
} else {
  const res = await pds.createRecord(COLLECTION, record);
  uri = res.uri;
  console.log(`created ${uri}`);
}

const link = `${SITE}/#${uri}`;
console.log(`readable at ${link}`);

if (doPost) {
  const text = `${score.title} — a new piece, written rather than transcribed.\n\n`
    + `Read, hear and edit it as notation (it is stored as its source, CC0):\n${link}`;
  // One facet so the URL is a real link rather than plain text. Byte offsets,
  // not character offsets: ATProto indexes facets into UTF-8.
  const bytes = Buffer.from(text, 'utf8');
  const start = bytes.indexOf(Buffer.from(link, 'utf8'));
  await pds.createRecord('app.bsky.feed.post', {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    facets: start >= 0 ? [{
      index: { byteStart: start, byteEnd: start + Buffer.byteLength(link) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: link }],
    }] : undefined,
  });
  console.log('posted to Bluesky');
}
