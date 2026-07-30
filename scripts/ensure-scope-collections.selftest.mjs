#!/usr/bin/env node
// ensure-scope-collections.selftest.mjs
//
// This script edits a file on ANOTHER surface's owning branch, and that push
// deploys the shared auth worker that every OAuth site on the estate depends
// on. So the properties worth pinning are the ones that make it safe to point
// at a file it has never seen: it only ever adds, it never reorders or drops,
// and running it twice is running it once.

import assert from 'node:assert/strict';
import { addCollections } from './ensure-scope-collections.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

const FILE = `/**
 * Header prose that mentions 'com.minomobi.ghost' in a comment, and
 * \`repo:com.minomobi.lab.*\` as an example of an illegal scope.
 */
const WRITE_COLLECTIONS = [
  // answers
  'com.minomobi.answers',
  // cards
  'com.minomobi.cards.catalog',
];

export const UNIFIED_SCOPE = WRITE_COLLECTIONS.map((c) => \`repo:\${c}\`).join(' ');
`;

t('adds what is missing and leaves everything else byte-identical', () => {
  const { src, added } = addCollections(FILE, ['com.minomobi.lab.doc', 'com.minomobi.lab.score']);
  assert.deepEqual(added, ['com.minomobi.lab.doc', 'com.minomobi.lab.score']);
  assert.match(src, /'com\.minomobi\.lab\.doc',/);
  // Nothing removed, nothing reordered.
  assert.match(src, /'com\.minomobi\.answers',/);
  assert.match(src, /'com\.minomobi\.cards\.catalog',/);
  assert.ok(src.indexOf("'com.minomobi.answers'") < src.indexOf("'com.minomobi.cards.catalog'"));
  assert.match(src, /export const UNIFIED_SCOPE/);
  assert.equal(src.split('\n').length, FILE.split('\n').length + 3);
});

t('running it twice is running it once', () => {
  const once = addCollections(FILE, ['com.minomobi.lab.doc']);
  const twice = addCollections(once.src, ['com.minomobi.lab.doc']);
  assert.deepEqual(twice.added, []);
  assert.equal(twice.src, once.src);
});

t('a second run adds a NEW collection under the same marker, not a second marker', () => {
  const once = addCollections(FILE, ['com.minomobi.lab.doc']);
  const twice = addCollections(once.src, ['com.minomobi.lab.doc', 'com.minomobi.lab.score']);
  assert.deepEqual(twice.added, ['com.minomobi.lab.score']);
  assert.equal(twice.src.match(/added by scripts/g).length, 1);
});

// A COMMENT IS NOT A DECLARATION. The header quotes NSIDs in prose, and a
// substring search would count those as present — skipping a collection that is
// genuinely missing, which shows up much later as a login the auth server
// refuses for no visible reason.
t('an NSID mentioned only in a comment does not count as present', () => {
  const { added } = addCollections(FILE, ['com.minomobi.ghost']);
  assert.deepEqual(added, ['com.minomobi.ghost'], 'the comment mention must not satisfy it');
});

t('the illegal-wildcard example in the prose is not mistaken for an entry', () => {
  const { added } = addCollections(FILE, ['com.minomobi.lab.doc']);
  assert.deepEqual(added, ['com.minomobi.lab.doc']);
});

t('it refuses a file it does not understand rather than guessing', () => {
  assert.throws(() => addCollections('const OTHER = [];\n', ['com.minomobi.lab.doc']),
    /no WRITE_COLLECTIONS/);
  assert.throws(() => addCollections('const WRITE_COLLECTIONS = [\n  ', ['com.minomobi.lab.doc']),
    /not closed/);
});

console.log(`\nensure-scope-collections.selftest: ${n} checks passed`);
