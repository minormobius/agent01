#!/usr/bin/env node
// Run a script against the headless game and print state.
//
//   node pokemon/eval-script.mjs                       # runs the default smoke script
//   node pokemon/eval-script.mjs script.txt            # runs a script file
//   node pokemon/eval-script.mjs - <<EOF               # script from stdin
//     z; z; down 5
//   EOF
//   node pokemon/eval-script.mjs --json                # also print final state as JSON

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
const require = createRequire(import.meta.url);
const { makeRunner } = require('./headless.js');

const args = process.argv.slice(2);
const wantJson  = args.includes('--json');
const wantTrace = args.includes('--trace');
const positional = args.filter((a) => !a.startsWith('--'));

let script;
if (positional.length === 0) {
  script = `
    z              # confirm title
    wait 4
    down 5         # walk out of playerhouse
    wait 8
  `;
} else if (positional[0] === '-') {
  script = fs.readFileSync(0, 'utf8');
} else {
  script = fs.readFileSync(positional[0], 'utf8');
}

const r = makeRunner();
console.log('=== initial ===');
console.log(r.summary());

if (wantTrace) {
  for (const rawLine of script.split('\n')) {
    const noComment = rawLine.replace(/#.*/, '').trim();
    if (!noComment) continue;
    for (const piece of noComment.split(';')) {
      const action = piece.trim();
      if (!action) continue;
      r.step(action);
      console.log(`-- after \`${action}\` --`);
      console.log(r.summary());
    }
  }
} else {
  r.runScript(script);
  console.log('=== final ===');
  console.log(r.summary());
}

if (wantJson) {
  console.log('=== state ===');
  console.log(JSON.stringify(r.getState(), null, 2));
}
