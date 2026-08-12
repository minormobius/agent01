// achievements.js — THE LEDGER OF DEEDS. Pure, DOM-free. Each achievement is an id + a predicate over
// the farm save; evaluate() diffs earned-vs-recorded so the UI can toast and offer the share. An earned
// achievement becomes a PUBLIC com.minomobi.farm.achievement record in your own repo (rkey = the
// achievement id, so it can never double-mint), and — one tap, never automatic — an app.bsky.feed.post.
// Node-tested (test/achievements.selftest.mjs).

import { progress, biomeById } from '../vendor/gacha.js';

export const ACHIEVEMENTS = [
  { id: 'first-seed',    emoji: '🌱', name: 'Broken Ground',      desc: 'Plant your first seed',                       test: (f) => f.stats.planted >= 1 },
  { id: 'first-harvest', emoji: '🥕', name: 'First Fruits',       desc: 'Bring in your first harvest',                 test: (f) => f.stats.harvests >= 1 },
  { id: 'harvest-10',    emoji: '🧺', name: 'Full Basket',        desc: 'Bring in ten harvests',                       test: (f) => f.stats.harvests >= 10 },
  { id: 'harvest-50',    emoji: '🌾', name: 'Steward of the Bed', desc: 'Bring in fifty harvests',                     test: (f) => f.stats.harvests >= 50 },
  { id: 'first-pull',    emoji: '🎴', name: 'Seed Lottery',       desc: 'Pull seeds at the trade desk',                test: (f) => f.pulls >= 1 },
  { id: 'ten-crops',     emoji: '📗', name: 'Herbal Apprentice',  desc: 'Hold ten different crops',                    test: (f) => f.owned.length >= 10 },
  { id: 'biome-closed',  emoji: '🌍', name: 'Biome Closed',       desc: 'Collect every crop of your home biome',       test: (f, ark) => { const b = biomeById(ark, f.biomeId); return !!b && progress(b, f.owned).complete; } },
  { id: 'first-brew',    emoji: '⚗️', name: 'The Bench Lit',      desc: 'Brew your first preparation',                 test: (f) => f.stats.brews >= 1 },
  { id: 'grade-a',       emoji: '🜍', name: 'Sovereign Draught',  desc: 'Brew a preparation of grade A or better',     test: (f) => f.stats.bestGrade === 'A' || f.stats.bestGrade === 'S' },
  { id: 'grade-s',       emoji: '🌟', name: 'Quintessence',       desc: 'Brew an S-grade preparation',                 test: (f) => f.stats.bestGrade === 'S' },
  { id: 'depth-5',       emoji: '⛏️', name: 'Under the Bed',      desc: 'Reach depth 5 in the mine',                   test: (f) => f.mine.depth >= 5 },
  { id: 'depth-12',      emoji: '🕯️', name: 'Where Silver Sleeps',desc: 'Reach depth 12 in the mine',                  test: (f) => f.mine.depth >= 12 },
  { id: 'seven-metals',  emoji: '☿',  name: 'The Great Work',     desc: 'Hold all seven planetary metals at once',     test: (f) => ['gold','silver','quicksilver','copper','iron','tin','lead'].every((m) => (f.metals[m] | 0) > 0) },
  { id: 'first-gift',    emoji: '🎁', name: 'Seeds Abroad',       desc: 'Send a friend a seed gift',                   test: (f) => f.stats.giftsSent >= 1 },
  { id: 'first-tend',    emoji: '💧', name: 'Neighbourly',        desc: 'Tend a friend’s plant',                  test: (f) => f.stats.tendsGiven >= 1 },
  { id: 'tend-25',       emoji: '🫗', name: 'Rain on Every Roof', desc: 'Tend friends’ plants 25 times',          test: (f) => f.stats.tendsGiven >= 25 },
  { id: 'coins-500',     emoji: '◈',  name: 'Market Gardener',    desc: 'Hold 500 coins',                              test: (f) => f.coins >= 500 },
  { id: 'first-terra',   emoji: '🪏', name: 'Landshaper',         desc: 'Terraform your first tile',                   test: (f) => (f.stats.terraforms | 0) >= 1 },
  { id: 'terra-20',      emoji: '🏞️', name: 'The Farm You Meant', desc: 'Terraform twenty tiles',                      test: (f) => (f.stats.terraforms | 0) >= 20 },
  { id: 'new-lands',     emoji: '🗺️', name: 'New Lands',          desc: 'Unlock a second ecosystem pack',              test: (f) => (f.packs || []).length >= 2 },
  { id: 'first-deed',    emoji: '📜', name: 'Deed of Sale',       desc: 'Buy your first neighbouring parcel',          test: (f) => (f.parcels || []).length >= 2 },
  { id: 'estate-6',      emoji: '🏡', name: 'Land Baron',         desc: 'Own six parcels',                             test: (f) => (f.parcels || []).length >= 6 },
  { id: 'whole-map',     emoji: '🧭', name: 'Horizon to Horizon', desc: 'Own all twenty-five parcels',                 test: (f) => (f.parcels || []).length >= 25 },
  { id: 'first-tech',    emoji: '📐', name: 'The Better Way',     desc: 'Research your first waterworks craft',        test: (f) => Object.keys(f.tech || {}).length >= 1 },
  { id: 'deep-well',     emoji: '⛲', name: 'Never Thirsty',      desc: 'Sink the deep well',                          test: (f) => !!(f.tech || {}).deepwell },
  { id: 'organic-25',    emoji: '🌿', name: 'Certified Organic',  desc: 'Bring in 25 organic harvests',                test: (f) => (f.stats.organicHarvests | 0) >= 25 },
  { id: 'organic-100',   emoji: '🏵️', name: 'Soil and Soul',      desc: 'Bring in 100 organic harvests',               test: (f) => (f.stats.organicHarvests | 0) >= 100 },
  { id: 'bug-war',       emoji: '🐛', name: 'The Beetle Wars',    desc: 'Treat ten infestations',                      test: (f) => (f.stats.pestsTreated | 0) >= 10 },
  { id: 'all-lands',     emoji: '🌐', name: 'The Whole Ark',      desc: 'Unlock every ecosystem pack',                 test: (f, ark) => (f.packs || []).length >= ((ark && ark.biomes) || []).length && (f.packs || []).length > 1 },
];

export const byId = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;

// evaluate(farm, ark) → the achievements newly earned (test passes, not yet in farm.achievements).
export function evaluate(farm, ark) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (farm.achievements[a.id]) continue;
    try { if (a.test(farm, ark)) out.push(a); } catch (e) { /* a predicate must never take the loop down */ }
  }
  return out;
}

export function markEarned(farm, ids, now) {
  const next = JSON.parse(JSON.stringify(farm));
  const iso = new Date(now).toISOString();
  for (const id of ids) if (!next.achievements[id]) next.achievements[id] = iso;
  next.updatedAt = now;
  return next;
}

// the share post (app.bsky.feed.post text ≤ 300 graphemes; we stay far under). The farm link resolves
// to the public read-only viewer, so the post IS a live window on the bragger's bed.
export function shareText(ach, handle) {
  const link = 'https://farm.mino.mobi/?u=' + encodeURIComponent(handle || '');
  return ach.emoji + ' ' + ach.name + ' — ' + ach.desc.toLowerCase() + ', on my Harvestople farm.\n\n' + link;
}

export default { ACHIEVEMENTS, byId, evaluate, markEarned, shareText };
