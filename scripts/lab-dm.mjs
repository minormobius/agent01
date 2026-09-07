#!/usr/bin/env node
// lab-dm.mjs — send one direct message. The whole script.
//
//   node scripts/lab-dm.mjs --to did:plc:… --text "…"
//   node scripts/lab-dm.mjs --to alice.bsky.social --text "…"   (handle works too)
//   node scripts/lab-dm.mjs --convo <convoId> --text "…"        (into a group)
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
    // AN EXPLICIT EMPTY VALUE IS EMPTY, NOT `true`. Workflows pass optional
    // arguments as `--flag ""` when the value is unset, and the old test
    // (`next && …`) read that falsy string as "no value given" and substituted
    // the string "true" — so an unset --convo arrived as a convo literally
    // named "true". Only a missing argument or another flag means "no value".
    args[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? 'true' : next;
  }
}

const to = args.to;
const text = args.text;
const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;

if ((!to && !args.convo) || !text) {
  console.log('lab-dm: --text plus one of --to or --convo is required');
  process.exit(0);
}
if (!handle || !password) {
  console.log('::warning::lab-dm: no credentials — nothing sent');
  process.exit(0);
}

try {
  const session = await login(handle, password);
  const chat = await chatClient(session);
  // --convo names an existing conversation and wins: a message about a request
  // made in a group belongs in that group. Otherwise open the 1-1, resolving a
  // handle if that is what was given — a DID addresses a convo, a handle is
  // what a human types.
  let convo;
  if (args.convo) {
    convo = { id: args.convo };
  } else {
    const did = to.startsWith('did:') ? to : await resolveHandle(to);
    convo = await chat.convoWith(did);
  }
  await chat.accept(convo.id);
  const body = graphemes(text) > 1000 ? [...text].slice(0, 990).join('') + '…' : text;
  await chat.send(convo.id, { text: body });
  console.log(`✓ sent to ${args.convo ? `convo ${args.convo}` : to}`);
} catch (e) {
  const strict = args.strict === 'true';
  console.log(`::${strict ? 'error' : 'warning'}::lab-dm failed (${e.message.slice(0, 400)})`);
  if (strict) process.exit(1);
}
