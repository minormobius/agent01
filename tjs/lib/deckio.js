// deckio.js — serialize a Deck to / from YAML (and JSON). The deck<->plain-object
// transforms are pure (node-testable); only the object<->YAML-string step pulls
// in js-yaml, loaded from the CDN via the page's importmap (no build step). The
// YAML is the portable artifact shared between the /deck layout editor and the
// /gantry motion suite.

import { Deck } from './deck.js';

// Pure: Deck -> plain object and back. Round-trips losslessly.
export function deckToObject(deck) { return deck.toJSON(); }
export function objectToDeck(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('deck config is not an object');
  if (!Array.isArray(obj.devices)) throw new Error('deck config has no "devices" list');
  const deck = new Deck(obj);
  const v = deck.validate();
  if (!v.ok) throw new Error('invalid deck: ' + v.errors.join('; '));
  return deck;
}

let _yaml = null;
// Lazily import js-yaml so node tests of the pure transforms don't need it.
async function yaml() {
  if (_yaml) return _yaml;
  _yaml = await import('js-yaml');
  return _yaml;
}

export async function toYAML(deck) {
  const y = await yaml();
  // flowLevel 4 keeps the device list block-style but inlines the leaf arrays
  // (position/rotation) and small maps (limits) -> a compact, human-editable file.
  return y.dump(deckToObject(deck), { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false, flowLevel: 4 });
}

export async function fromYAML(text) {
  const y = await yaml();
  const obj = y.load(text);
  return objectToDeck(obj);
}

export function toJSONString(deck) { return JSON.stringify(deckToObject(deck), null, 2); }
export function fromJSONString(text) { return objectToDeck(JSON.parse(text)); }

if (typeof globalThis !== 'undefined') {
  globalThis.DECKIO = { deckToObject, objectToDeck, toJSONString, fromJSONString };
}
