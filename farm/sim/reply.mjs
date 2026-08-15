// reply.mjs — the council's one window back to the petitioner: a reply in their courier post's
// thread. Same session pattern as scripts/bsky-reply.mjs (bsky.social app-password session), but
// farm-shaped: verdict text in, sanitized prose + the right link out. The verdict text is written
// by the council session working UNTRUSTED petitions, and it posts under the operator's account —
// so it is narrowed the same way the lab's agent note is: capped, @-mentions and URLs stripped,
// one line; the link is appended here, fixed, never taken from the text.
//
//   node farm/sim/reply.mjs --parent <postUri> --parent-cid <cid> --verdict granted|refused --text "<why>"
//   node farm/sim/reply.mjs --announce --text "<patch notes summary>"       (merge party, standalone post)
import { argv, env, exit } from 'node:process';

const args = {};
for (let i = 2; i < argv.length; i++) if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : ''; }
const need = (k) => { if (args[k] == null) { console.error('::error::reply: --' + k + ' required'); exit(1); } return args[k]; };

const announce = 'announce' in args;
const raw = args.text || '';

const handle = env.BLUESKY_HANDLE, password = env.BLUESKY_APP_PASSWORD;
if (!handle || !password) { console.log('::warning::reply: no credentials, skipping'); exit(0); }

const clean = raw.replace(/https?:\/\/\S+/g, '').replace(/@[\w.-]+/g, '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, announce ? 220 : 200);
let parentUri, parentCid, text;
if (announce) {
  text = '🎉 Harvestople merge party — ' + clean + '\n\n#harvestople https://farm.mino.mobi';
} else {
  parentUri = need('parent');
  parentCid = need('parent-cid');
  const verdict = need('verdict');
  text = verdict === 'granted'
    ? '🪧 granted — ' + clean + '\n\n⚗️ live on the testing table: https://farm-next.mino.mobi (your real save works there; the keepers merge the good experiments to the mainline farm)'
    : '🪧 the council declines — ' + clean + '\n\nthe walls and scales are public law: https://farm.mino.mobi/PETITIONS.md';
}

const PDS = 'https://bsky.social/xrpc';
const xrpc = async (method, token, body) => {
  const res = await fetch(PDS + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(method + ' ' + res.status + ': ' + (json.error || '') + ' ' + (json.message || ''));
  return json;
};

const session = await xrpc('com.atproto.server.createSession', null, { identifier: handle, password });
const record = {
  $type: 'app.bsky.feed.post',
  text: text.slice(0, 300),
  createdAt: new Date().toISOString(),
};
if (!announce) record.reply = { root: { uri: parentUri, cid: parentCid }, parent: { uri: parentUri, cid: parentCid } };
const post = await xrpc('com.atproto.repo.createRecord', session.accessJwt, {
  repo: session.did, collection: 'app.bsky.feed.post', record,
});
console.log((announce ? 'announced: ' : 'replied: ') + post.uri);
