#!/usr/bin/env node
// lab-dm.mjs — send one direct message. The whole script.
//
//   node scripts/lab-dm.mjs --to did:plc:… --text "…"
//   node scripts/lab-dm.mjs --to alice.bsky.social --text "…"   (handle works too)
//
// It exists for the failure path. lab-dossier.yml promises somebody an answer
// the moment it starts, and a run that dies silently leaves that promise
// hanging — the same "silence after a promise" failure the public side already
// fixed with one-reply-per-outcome (docs/LAB-FACTORY.md §11.4). A step that
// says so needs a sender that cannot itself be the thing that failed, so this
// shares the chat library and nothing else.
//
// NEVER FATAL BY DEFAULT. It is called from `if: failure()`; exiting non-zero
// there buys nothing and buries the real error under a second one.
//
// --strict INVERTS THAT, and it is what the smoke test uses. "Did the DM go?"
// is a question a green run must not be able to answer wrongly: the whole point
// of the smoke test is to find out whether the app password carries DM scope,
// and a swallowed `Bad token scope` reported as success is the exact opposite
// of the information wanted.

import { login, graphemes } from './lib/bsky.mjs';
import { chatClient } from './lib/chat.mjs';
import { resolveHandle } from '../packages/atproto/pds.js';

const args = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    args[argv[i].slice(2)] = next && !next.startsWith('--') ? next : 'true';
  }
}

const to = args.to;
const text = args.text;
const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;

if (!to || !text) {
  console.log('lab-dm: --to and --text are both required');
  process.exit(0);
}
if (!handle || !password) {
  console.log('::warning::lab-dm: no credentials — nothing sent');
  process.exit(0);
}

try {
  const session = await login(handle, password);
  const chat = await chatClient(session);
  // A DID addresses a convo; a handle is what a human types. Resolve rather
  // than making every caller look one up.
  const did = to.startsWith('did:') ? to : await resolveHandle(to);
  const convo = await chat.convoWith(did);
  await chat.accept(convo.id);
  const body = graphemes(text) > 1000 ? [...text].slice(0, 990).join('') + '…' : text;
  await chat.send(convo.id, { text: body });
  console.log(`✓ DMed ${to}${did === to ? '' : ` (${did})`}`);
} catch (e) {
  const strict = args.strict === 'true';
  console.log(`::${strict ? 'error' : 'warning'}::lab-dm failed (${e.message.slice(0, 400)})`);
  if (strict) process.exit(1);
}
