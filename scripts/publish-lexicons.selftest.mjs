#!/usr/bin/env node
// publish-lexicons.selftest.mjs — the authority computation and the validator.
//
// The authority rule is the piece most likely to be got wrong and least likely
// to announce it: a lexicon published under the wrong DNS name resolves for
// nobody, and looks exactly like one that resolves for everybody until somebody
// tries. Resolution takes the NSID, DROPS THE FINAL SEGMENT, reverses the rest,
// and does not recurse up or down — so `_lexicon.minomobi.com` would be wrong
// for `com.minomobi.lab.doc` even though it is a real name that we own.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lexiconAuthority } from './lib/lexicon.mjs';

const SCRIPT = new URL('./publish-lexicons.mjs', import.meta.url).pathname;
const ROOT = join(new URL('.', import.meta.url).pathname, '..');
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

console.log('— the authority is the NSID minus its last segment, reversed —');
ck(lexiconAuthority('com.minomobi.lab.doc') === 'lab.minomobi.com',
  'com.minomobi.lab.doc → lab.minomobi.com');
ck(lexiconAuthority('com.example.foo.bar') === 'foo.example.com',
  'com.example.foo.bar → foo.example.com (the spec\'s own example)');
ck(lexiconAuthority('com.minomobi.lab.doc') !== 'minomobi.com',
  'NOT minomobi.com — resolution does not recurse, so a shorter name resolves for nobody');
ck(lexiconAuthority('com.example.thing') === 'example.com', 'a three-segment NSID still works');
ck(lexiconAuthority('com.example') === null, 'too short to have an authority');

console.log('\n— the real schemas validate, and the checker can fail —');
{
  const out = execFileSync('node', [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
  ck(/com\.minomobi\.lab\.doc/.test(out), 'the shipped schemas pass --check');
  ck(/_lexicon\.lab\.minomobi\.com/.test(out), '  and it prints the exact DNS name a human must create');
}

/** Run --check against a throwaway copy of lab/lexicons with one file edited. */
function checkWith(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'lex-'));
  try {
    cpSync(join(ROOT, 'lab', 'lexicons'), join(dir, 'lab', 'lexicons'), { recursive: true });
    cpSync(join(ROOT, 'scripts', 'lib'), join(dir, 'scripts', 'lib'), { recursive: true });
    cpSync(join(ROOT, 'scripts', 'publish-lexicons.mjs'), join(dir, 'scripts', 'publish-lexicons.mjs'));
    const f = join(dir, 'lab', 'lexicons', 'com.minomobi.lab.doc.json');
    writeFileSync(f, JSON.stringify(mutate(JSON.parse(readFileSync(f, 'utf8'))), null, 2));
    try {
      execFileSync('node', [join(dir, 'scripts', 'publish-lexicons.mjs'), '--check'],
        { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, out: '' };
    } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

{
  // The rkey IS the NSID and `id` must equal it. Get this wrong and the record
  // publishes to a key nothing looks up.
  const r = checkWith((d) => ({ ...d, id: 'com.minomobi.lab.document' }));
  ck(!r.ok, 'an id that disagrees with the filename is rejected');
  ck(/record key IS the NSID/.test(r.out), '  and the message says why it matters');
}
ck(!checkWith((d) => ({ ...d, lexicon: 2 })).ok, 'lexicon must be 1');
ck(!checkWith((d) => ({ ...d, defs: {} })).ok, 'defs.main is required');
{
  const r = checkWith((d) => {
    const c = structuredClone(d); delete c.defs.main.description; return c;
  });
  ck(!r.ok, 'a schema with no description is rejected — it will be read by strangers');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
