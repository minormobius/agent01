#!/usr/bin/env node
import assert from 'node:assert';
import { globToPathspec, apexDir, indexRegistry, pathspecsFor } from './fetch-commits.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok', name); };

ok('globToPathspec strips glob tails', () => {
  assert.equal(globToPathspec('fable/**'), 'fable');
  assert.equal(globToPathspec('functions/**'), 'functions');
  assert.equal(globToPathspec('index.html'), 'index.html');
  assert.equal(globToPathspec('poll/apps/api/migrations/0018.sql'), 'poll/apps/api/migrations/0018.sql');
});

ok('apexDir takes the path', () => {
  assert.equal(apexDir('/judge/'), 'judge');
  assert.equal(apexDir('/wars/cult/'), 'wars/cult');
  assert.equal(apexDir('/'), '');
});

const reg = indexRegistry([
  { surface: 'hoop', dir: 'hoop', endpoint: 'hoop.mino.mobi', paths: ['hoop/**', '.github/workflows/deploy-hoop.yml'] },
  { surface: 'bakery', dir: 'bakery', endpoint: 'bakery.mino.mobi', paths: ['bakery/**'] },
  { surface: 'root', dir: '.', endpoint: 'minomobi.com / mino.mobi (landing)', paths: ['index.html'] },
]);

ok('subdomain → registry paths (by host)', () => {
  assert.deepEqual(pathspecsFor({ name: 'hoop', url: 'https://hoop.mino.mobi' }, reg),
    ['hoop', '.github/workflows/deploy-hoop.yml']);
});

ok('name fallback when host differs from registry endpoint', () => {
  // live URL is bake.mino.mobi but the surface/dir is "bakery"
  assert.deepEqual(pathspecsFor({ name: 'bakery', url: 'https://bake.mino.mobi' }, reg), ['bakery']);
});

ok('apex path surface → its dir, not the whole landing', () => {
  assert.deepEqual(pathspecsFor({ name: 'judge', url: 'https://mino.mobi/judge/' }, reg), ['judge']);
});

console.log(`\nfetch-commits selftest: ${n} checks passed`);
