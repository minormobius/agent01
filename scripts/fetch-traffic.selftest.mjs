#!/usr/bin/env node
/**
 * Selftest for the pure helpers in fetch-traffic.mjs (the network layer can't be
 * exercised from CI without live Cloudflare creds; the attribution + estimation
 * math is what we gate on).
 */
import assert from 'node:assert';
import {
  hostOf, pathPrefix, pathMatches, estimateGroups, attributeViews, depthFor,
} from './fetch-traffic.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok', name); };

ok('hostOf / pathPrefix', () => {
  assert.equal(hostOf('https://hoop.mino.mobi'), 'hoop.mino.mobi');
  assert.equal(hostOf('https://mino.mobi/judge/'), 'mino.mobi');
  assert.equal(pathPrefix('https://hoop.mino.mobi'), '/');
  assert.equal(pathPrefix('https://mino.mobi/judge/'), '/judge/');
  assert.equal(pathPrefix('https://mino.mobi/judge'), '/judge/'); // normalized trailing slash
});

ok('pathMatches', () => {
  assert.equal(pathMatches('/', '/'), true);
  assert.equal(pathMatches('/judge/', '/judge/'), true);
  assert.equal(pathMatches('/judge', '/judge/'), true);       // exact, no trailing slash
  assert.equal(pathMatches('/judge/x', '/judge/'), true);     // beneath
  assert.equal(pathMatches('/judgement/', '/judge/'), false); // sibling, not a child
  assert.equal(pathMatches('/other/', '/judge/'), false);
});

ok('estimateGroups multiplies count by sampleInterval', () => {
  const g = estimateGroups([
    { count: 10, avg: { sampleInterval: 1 }, dimensions: { clientRequestHTTPHost: 'a', clientRequestPath: '/' } },
    { count: 5, avg: { sampleInterval: 100 }, dimensions: { clientRequestHTTPHost: 'b', clientRequestPath: '/x' } },
    { count: 3, dimensions: { clientRequestHTTPHost: 'c', clientRequestPath: '/y' } }, // no sampleInterval → ×1
  ]);
  assert.deepEqual(g[0], { host: 'a', path: '/', views: 10 });
  assert.deepEqual(g[1], { host: 'b', path: '/x', views: 500 });
  assert.deepEqual(g[2], { host: 'c', path: '/y', views: 3 });
});

ok('attributeViews splits apex paths and rolls up subdomains', () => {
  const sites = [
    { name: 'hoop', url: 'https://hoop.mino.mobi' },
    { name: 'judge', url: 'https://mino.mobi/judge/' },
    { name: 'novelty', url: 'https://mino.mobi/novelty/' },
  ];
  const groups = [
    { host: 'hoop.mino.mobi', path: '/', views: 100 },
    { host: 'hoop.mino.mobi', path: '/paint/', views: 40 },     // child rolls into hoop
    { host: 'mino.mobi', path: '/judge/', views: 9 },
    { host: 'mino.mobi', path: '/judge/results', views: 1 },
    { host: 'mino.mobi', path: '/novelty/', views: 12 },
    { host: 'mino.mobi', path: '/unrelated/', views: 999 },     // attributed to neither
  ];
  const m = attributeViews(sites, groups);
  assert.equal(m.get('https://hoop.mino.mobi'), 140);
  assert.equal(m.get('https://mino.mobi/judge/'), 10);
  assert.equal(m.get('https://mino.mobi/novelty/'), 12);
});

ok('depthFor: most-viewed surfaces, unknown sinks to the floor', () => {
  assert.equal(depthFor(0, 1, 1000), 1);          // no data → benthic
  assert.equal(depthFor(-5, 1, 1000), 1);
  const top = depthFor(1000, 1, 1000);
  const bottom = depthFor(1, 1, 1000);
  assert.ok(top < 0.01, 'max views ~ surface');
  assert.ok(bottom > 0.99, 'min views ~ deep');
  assert.ok(depthFor(32, 1, 1000) > top && depthFor(32, 1, 1000) < bottom, 'monotonic');
});

console.log(`\nfetch-traffic selftest: ${n} checks passed`);
