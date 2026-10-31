// harness.mjs — Stopwatch's record/replay, carried across, plus encode/decode. (Modulo, tape day 1)
//
// encode(value) → string, decode(string) → value. Round-trips every JSON value and also NaN,
// ±Infinity, -0 and undefined, wherever they sit.
//
// DECISIONS:
//  H-tag  The encoding is JSON in which a *tag* is an object whose only key is "$":
//         {"$":"NaN"} {"$":"Infinity"} {"$":"-Infinity"} {"$":"-0"} {"$":"undefined"}.
//         A caller's own key that begins with "$" is written with one more "$" in front
//         ("$" → "$$", "$x" → "$$x"), so no caller object can ever look like a tag, however it is
//         built. Strings are never touched: tags are objects, so "NaN" stays a string.
//  H-abs  A field that is absent or undefined in an object stays absent (JSON's rule; the spec's).
//         undefined inside an array is kept as {"$":"undefined"} so the array's length and indices
//         survive. Top-level undefined round-trips too.
//  H-proto  Decoded objects get their keys with defineProperty, so a key "__proto__" is an own
//         field, never a prototype change.
//  fi-5f90c6: Stopwatch's canon() turned NaN into the string "NaN", so NaN and "NaN" compared
//         equal. Here they are different encodings, and the test checks it.
export { record, replay } from './harness-rr.mjs';

const TAG = '$';
const SPECIAL = { NaN, Infinity, '-Infinity': -Infinity, '-0': -0, undefined };

function enc(v, inArray) {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { [TAG]: 'NaN' };
    if (v === Infinity) return { [TAG]: 'Infinity' };
    if (v === -Infinity) return { [TAG]: '-Infinity' };
    if (Object.is(v, -0)) return { [TAG]: '-0' };
    return v;
  }
  if (v === undefined) return { [TAG]: 'undefined' };
  if (v === null) return null;
  if (typeof v !== 'object') {
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    throw new TypeError(`encode: not a JSON value (${typeof v})`);
  }
  if (typeof v.toJSON === 'function' && !Array.isArray(v)) return enc(v.toJSON(), inArray);
  if (Array.isArray(v)) return Array.from(v, (x) => enc(x, true));
  const o = {};
  for (const k of Object.keys(v)) {
    if (v[k] === undefined || typeof v[k] === 'function' || typeof v[k] === 'symbol') continue;
    Object.defineProperty(o, k.startsWith(TAG) ? TAG + k : k,
      { value: enc(v[k], false), enumerable: true, writable: true, configurable: true });
  }
  return o;
}

function dec(v) {
  if (Array.isArray(v)) return v.map(dec);
  if (v === null || typeof v !== 'object') return v;
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === TAG) {
    if (typeof v[TAG] === 'string' && Object.prototype.hasOwnProperty.call(SPECIAL, v[TAG])) return SPECIAL[v[TAG]];
    throw new SyntaxError(`decode: unknown tag ${JSON.stringify(v[TAG])}`);
  }
  const o = {};
  for (const k of keys) {
    Object.defineProperty(o, k.startsWith(TAG) ? k.slice(1) : k,
      { value: dec(v[k]), enumerable: true, writable: true, configurable: true });
  }
  return o;
}

export function encode(value) { return JSON.stringify(enc(value, false)); }
export function decode(text) { return dec(JSON.parse(text)); }
